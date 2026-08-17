import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
const { PrismaClient } = require('@prisma/client');

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await (this as unknown as { $connect(): Promise<void> }).$connect();
      this.logger.log('✅ Platform DB connected');
    } catch (error) {
      this.logger.error('❌ Platform DB connection failed', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await (this as unknown as { $disconnect(): Promise<void> }).$disconnect();
  }
}
