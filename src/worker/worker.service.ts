import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import { QueueService, QueueJobData } from '../queue/queue.service';
import { JobProcessor } from './processors/job.processor';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(WorkerService.name);
	private worker: Worker<QueueJobData>;
	private isShuttingDown = false;

	constructor(
		private readonly queueService: QueueService,
		private readonly jobProcessor: JobProcessor
	) {}

	async onModuleInit() {
		this.logger.log('Initializing worker service');

		this.worker = this.queueService.createWorker(async (job) => {
			if (this.isShuttingDown) {
				this.logger.warn(`Worker shutting down, rejecting job ${job.data.jobId}`);
				throw new Error('Worker is shutting down');
			}
			await this.jobProcessor.process(job);
		});

		this.worker.on('ready', () => {
			this.logger.log('Worker ready to process jobs');
		});

		this.worker.on('error', (error) => {
			this.logger.error(`Worker error: ${error.message}`);
		});

		// Graceful shutdown handling
		process.on('SIGTERM', () => this.gracefulShutdown());
		process.on('SIGINT', () => this.gracefulShutdown());
	}

	async onModuleDestroy() {
		await this.gracefulShutdown();
	}

	private async gracefulShutdown() {
		if (this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;
		this.logger.log('Graceful shutdown initiated');

		try {
			// Stop accepting new jobs
			await this.worker.close();
			this.logger.log('Worker shut down gracefully');
		} catch (error) {
			this.logger.error(`Error during shutdown: ${error.message}`);
		}
	}
}
