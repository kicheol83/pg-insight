import { Module } from '@nestjs/common';
import { RealtimeGateway } from './real-time.gateway';

@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealTimeModule {}
