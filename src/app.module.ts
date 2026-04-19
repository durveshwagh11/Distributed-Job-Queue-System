import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { JobsController } from './api/jobs.controller';
import { JobsService } from './api/jobs.service';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		LoggerModule.forRoot({
			pinoHttp: {
				transport: {
					target: 'pino-pretty',
					options: {
						colorize: true,
						translateTime: 'SYS:standard',
						ignore: 'pid,hostname',
					},
				},
			},
		}),
		DatabaseModule,
		QueueModule,
	],
	controllers: [JobsController],
	providers: [JobsService],
})
export class AppModule {}
