import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, DEFAULT_BACKOFF_BASE_DELAY, JOB_TIMEOUT } from '../shared/constants';
import { JobRepository } from '../database/repositories/job.repository';

export interface QueueJobData {
	jobId: string;
	type: string;
	payload: Record<string, any>;
	attempts: number;
	maxAttempts: number;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(QueueService.name);
	private mainQueue!: Queue<QueueJobData>;
	private dlQueue!: Queue<QueueJobData>;
	private connection!: Redis;

	constructor(
		private readonly configService: ConfigService,
		private readonly jobRepository: JobRepository
	) {}

	async onModuleInit() {
		const redisHost = this.configService.get('REDIS_HOST', 'localhost');
		const redisPort = this.configService.get('REDIS_PORT', 6379);

		this.connection = new Redis({
			host: redisHost,
			port: redisPort,
			maxRetriesPerRequest: null,
		});

		this.mainQueue = new Queue<QueueJobData>(QUEUE_NAMES.MAIN, {
			connection: this.connection,
		});

		this.dlQueue = new Queue<QueueJobData>(QUEUE_NAMES.DLQ, {
			connection: this.connection,
		});

		this.logger.log('Queue service initialized');
	}

	async onModuleDestroy() {
		await this.mainQueue.close();
		await this.dlQueue.close();
		await this.connection.quit();
		this.logger.log('Queue service destroyed');
	}

	async addJob(
		jobId: string,
		type: string,
		payload: Record<string, any>,
		options: {
			priority?: number;
			delay?: number;
			maxAttempts?: number;
		} = {}
	): Promise<void> {
		const jobData: QueueJobData = {
			jobId,
			type,
			payload,
			attempts: 0,
			maxAttempts: options.maxAttempts ?? 10,
		};

		await this.mainQueue.add(type, jobData, {
			jobId, // Use our jobId as BullMQ job ID
			priority: options.priority,
			delay: options.delay,
			removeOnComplete: {
				age: 3600, // Keep completed jobs for 1 hour
				count: 1000,
			},
			removeOnFail: {
				age: 86400, // Keep failed jobs for 24 hours
			},
		});

		this.logger.log(`Job ${jobId} added to queue`);
	}

	async moveToDLQ(job: Job<QueueJobData>, error: string): Promise<void> {
		await this.dlQueue.add(`dlq-${job.data.type}`, job.data, {
			priority: 1,
		});

		await this.jobRepository.markAsDeadLetter(job.data.jobId, error);
		this.logger.warn(`Job ${job.data.jobId} moved to DLQ: ${error}`);
	}

	async retryJob(job: Job<QueueJobData>, attemptNumber: number): Promise<void> {
		const backoffDelay = this.calculateBackoff(attemptNumber);

		await this.jobRepository.incrementAttempts(job.data.jobId);

		const updatedJobData: QueueJobData = {
			...job.data,
			attempts: attemptNumber + 1,
		};

		await this.mainQueue.add(job.data.type, updatedJobData, {
			jobId: `${job.data.jobId}-retry-${attemptNumber}`,
			delay: backoffDelay,
			priority: job.opts.priority,
		});

		this.logger.log(`Job ${job.data.jobId} scheduled for retry ${attemptNumber + 1} with ${backoffDelay}ms delay`);
	}

	private calculateBackoff(attemptNumber: number): number {
		// Exponential backoff: delay = base * (2 ^ attempt)
		return DEFAULT_BACKOFF_BASE_DELAY * Math.pow(2, attemptNumber);
	}

	createWorker(processor: (job: Job<QueueJobData>) => Promise<void>): Worker<QueueJobData> {
		const worker = new Worker<QueueJobData>(QUEUE_NAMES.MAIN, processor, {
			connection: this.connection,
			concurrency: parseInt(this.configService.get('WORKER_CONCURRENCY', '5'), 10),
			lockDuration: JOB_TIMEOUT, // Lock duration = job timeout
			lockRenewTime: JOB_TIMEOUT / 2,
		});

		worker.on('completed', (job) => {
			this.logger.log(`Job ${job.data.jobId} completed`);
		});

		worker.on('failed', (job, err) => {
			this.logger.error(`Job ${job?.data?.jobId} failed: ${err.message}`);
		});

		return worker;
	}

	async getJobStatus(jobId: string): Promise<Job<QueueJobData> | null> {
		const job = await this.mainQueue.getJob(jobId);
		return job ?? null;
	}

	getMainQueue(): Queue<QueueJobData> {
		return this.mainQueue;
	}

	getDLQueue(): Queue<QueueJobData> {
		return this.dlQueue;
	}
}
