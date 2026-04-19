import { JobStatus } from '../enums/job-status.enum';
import { JobPriority } from '../enums/job-priority.enum';

export interface IJob {
	id: string;
	idempotencyKey?: string;
	type: string;
	payload: Record<string, any>;
	priority: JobPriority;
	status: JobStatus;
	attempts: number;
	maxAttempts: number;
	delay?: number; // milliseconds
	error?: string;
	createdAt: Date;
	updatedAt: Date;
	processedAt?: Date;
	completedAt?: Date;
}

export interface ICreateJobPayload {
	type: string;
	payload: Record<string, any>;
	idempotencyKey?: string;
	priority?: JobPriority;
	maxAttempts?: number;
	delay?: number;
}

export interface IJobResult {
	jobId: string;
	status: JobStatus;
}
