import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsReaderService } from './reader/metrics-reader.service';
import { MetricsWriterService } from './writer/metrics-writer.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsReaderService, MetricsWriterService],
  exports: [MetricsReaderService, MetricsWriterService],
})
export class MetricsModule {}
