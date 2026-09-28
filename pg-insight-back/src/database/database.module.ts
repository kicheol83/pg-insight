import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaService } from './prisma.service';
import { PLATFORM_POOL } from './token';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: PLATFORM_POOL,
      useFactory: (config: ConfigService) => {
        const connectionString = config.get<string>('TIMESCALE_URL');
        if (!connectionString) {
          throw new Error('TIMESCALE_URL must be set');
        }
        return new Pool({
          connectionString,
          max: 10,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [PrismaService, PLATFORM_POOL],
})
export class DatabaseModule {}
