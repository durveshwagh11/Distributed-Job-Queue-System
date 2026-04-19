import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
	const logger = new Logger('WorkerBootstrap');

	const app = await NestFactory.createApplicationContext(WorkerModule);
	app.enableShutdownHooks();

	logger.log('Worker service started');

	// Keep process alive
	process.on('SIGTERM', async () => {
		logger.log('SIGTERM received, closing worker');
		await app.close();
		process.exit(0);
	});

	process.on('SIGINT', async () => {
		logger.log('SIGINT received, closing worker');
		await app.close();
		process.exit(0);
	});
}

bootstrap();
