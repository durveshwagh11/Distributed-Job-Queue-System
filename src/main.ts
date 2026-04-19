import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
	const app = await NestFactory.create(AppModule, { bufferLogs: true });

	app.useLogger(app.get(Logger));
	app.enableShutdownHooks();

	const port = process.env.PORT || 3000;
	await app.listen(port);

	console.log(`API service running on http://localhost:${port}`);
}

bootstrap();
