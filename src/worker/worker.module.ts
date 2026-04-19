import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkerService } from './worker.service';
import { JobProcessor } from './processors/job.processor';
import { QueueModule } from '../queue/queue.module';
import { DatabaseModule } from '../database/database.module';

@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true }), QueueModule, DatabaseModule],
	providers: [WorkerService, JobProcessor],
})
export class WorkerModule {}
