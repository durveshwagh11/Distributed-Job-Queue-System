import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { JobRepository } from '../database/repositories/job.repository';
import { QueueService } from '../queue/queue.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { ICreateJobPayload } from '../shared/interfaces/job.interface';

@Injectable()
export class JobsService {
	private readonly logger = new Logger(JobsService.name);

	constructor(
		private readonly jobRepository: JobRepository,
		private readonly queueService: QueueService
	) {}

	async createJob(dto: CreateJobDto): Promise<JobResponseDto> {
		// Check idempotency
		if (dto.idempotencyKey) {
			const existing = await this.jobRepository.findByIdempotencyKey(dto.idempotencyKey);
			if (existing) {
				this.logger.log(`Idempotent request detected: ${dto.idempotencyKey}, returning existing job ${existing.id}`);
				return this.mapToResponse(existing);
			}
		}

		// Create job in database first (source of truth)
		const payload: ICreateJobPayload = {
			type: dto.type,
			payload: dto.payload,
			idempotencyKey: dto.idempotencyKey,
			priority: dto.priority,
			maxAttempts: dto.maxAttempts,
			delay: dto.delay,
		};

		const job = await this.jobRepository.createJob(payload);

		// Add to queue
		try {
			await this.queueService.addJob(job.id, job.type, job.payload, {
				priority: job.priority,
				delay: job.delay,
				maxAttempts: job.maxAttempts,
			});
		} catch (error) {
			this.logger.error(`Failed to add job ${job.id} to queue: ${error.message}`);
			// Job exists in DB but not in queue - could be handled by a reconciliation process
			throw error;
		}

		this.logger.log(`Job ${job.id} created and queued`);
		return this.mapToResponse(job);
	}

	async getJobStatus(jobId: string): Promise<JobResponseDto> {
		const job = await this.jobRepository.findById(jobId);
		if (!job) {
			throw new NotFoundException(`Job ${jobId} not found`);
		}
		return this.mapToResponse(job);
	}

	private mapToResponse(job: any): JobResponseDto {
		return {
			id: job.id,
			type: job.type,
			status: job.status,
			priority: job.priority,
			attempts: job.attempts,
			maxAttempts: job.maxAttempts,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt,
			processedAt: job.processedAt,
			completedAt: job.completedAt,
			error: job.error,
		};
	}
}
