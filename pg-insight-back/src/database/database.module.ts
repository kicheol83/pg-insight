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
        return new Pool({
          connectionString: config.get<string>(
            'TIMESCALE_URL',
            'postgresql://postgres:postgres@localhost:5433/pg_insight_metrics',
          ),
          max: 10,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [PrismaService, PLATFORM_POOL],
})
export class DatabaseModule {}
