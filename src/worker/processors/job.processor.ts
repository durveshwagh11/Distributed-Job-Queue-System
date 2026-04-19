import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueService, QueueJobData } from '../../queue/queue.service';
import { JobRepository } from '../../database/repositories/job.repository';
import { JOB_TIMEOUT } from '../../shared/constants';

@Injectable()
export class JobProcessor {
	private readonly logger = new Logger(JobProcessor.name);

	constructor(
		private readonly jobRepository: JobRepository,
		private readonly queueService: QueueService
	) {}

	async process(job: Job<QueueJobData>): Promise<void> {
		const { jobId, type, payload, attempts, maxAttempts } = job.data;

		this.logger.log(`Processing job ${jobId} (type: ${type}, attempt: ${attempts + 1}/${maxAttempts})`);

		try {
			// Mark job as processing in database
			await this.jobRepository.markAsProcessing(jobId);

			// Execute actual job logic with timeout
			await this.executeJobWithTimeout(type, payload, jobId);

			// Mark as completed
			await this.jobRepository.markAsCompleted(jobId);
			this.logger.log(`Job ${jobId} completed successfully`);
		} catch (error) {
			await this.handleJobFailure(job, error);
		}
	}

	private async executeJobWithTimeout(type: string, payload: Record<string, any>, jobId: string): Promise<void> {
		return Promise.race([this.executeJob(type, payload), this.createTimeout(jobId)]);
	}

	private async executeJob(type: string, payload: Record<string, any>): Promise<void> {
		// This is where actual job processing logic goes
		// Different job types would be handled here
		switch (type) {
			case 'email':
				await this.processEmailJob(payload);
				break;
			case 'data-processing':
				await this.processDataJob(payload);
				break;
			case 'webhook':
				await this.processWebhookJob(payload);
				break;
			default:
				this.logger.warn(`Unknown job type: ${type}, executing default handler`);
				await this.processDefaultJob(payload);
		}
	}

	private async processEmailJob(payload: Record<string, any>): Promise<void> {
		this.logger.log(`Sending email to ${payload.to}`);
		// Simulate email sending
		await this.simulateWork(1000);
	}

	private async processDataJob(payload: Record<string, any>): Promise<void> {
		this.logger.log(`Processing data: ${JSON.stringify(payload)}`);
		// Simulate data processing
		await this.simulateWork(2000);
	}

	private async processWebhookJob(payload: Record<string, any>): Promise<void> {
		this.logger.log(`Calling webhook: ${payload.url}`);
		// Simulate webhook call
		await this.simulateWork(1500);
	}

	private async processDefaultJob(payload: Record<string, any>): Promise<void> {
		this.logger.log(`Processing job with payload: ${JSON.stringify(payload)}`);
		await this.simulateWork(500);
	}

	private async simulateWork(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async createTimeout(jobId: string): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Job ${jobId} timed out after ${JOB_TIMEOUT}ms`));
			}, JOB_TIMEOUT);
		});
	}

	private async handleJobFailure(job: Job<QueueJobData>, error: any): Promise<void> {
		const { jobId, attempts, maxAttempts } = job.data;
		const errorMessage = error.message || 'Unknown error';

		this.logger.error(`Job ${jobId} failed on attempt ${attempts + 1}: ${errorMessage}`);

		if (attempts + 1 >= maxAttempts) {
			// Max retries exceeded - move to DLQ
			await this.queueService.moveToDLQ(job, errorMessage);
			this.logger.warn(`Job ${jobId} exceeded max retries (${maxAttempts}), moved to DLQ`);
		} else {
			// Retry with exponential backoff
			await this.queueService.retryJob(job, attempts);
			await this.jobRepository.markAsFailed(jobId, errorMessage);
		}
	}
}
