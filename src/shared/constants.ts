export const QUEUE_NAMES = {
	MAIN: 'main-queue',
	DLQ: 'dead-letter-queue',
} as const;

export const DEFAULT_MAX_ATTEMPTS = 10;
export const DEFAULT_BACKOFF_BASE_DELAY = 1000; // 1 second
export const VISIBILITY_TIMEOUT = 30000; // 30 seconds
export const JOB_TIMEOUT = 60000; // 60 seconds
