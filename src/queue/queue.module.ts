import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { DatabaseModule } from '../database/database.module';

@Module({
	imports: [DatabaseModule],
	providers: [QueueService],
	exports: [QueueService],
})
export class QueueModule {}
