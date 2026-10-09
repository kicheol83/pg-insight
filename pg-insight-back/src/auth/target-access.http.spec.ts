jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { Controller, Get, INestApplication, Param } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../database/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TargetAccessGuard } from './target-access.guard';
import { TargetAccessService } from './target-access.service';

const SECRET = 'tenant-isolation-secret-tenant-isolation';

@Controller('live/:targetId')
class ProbeController {
  @Get('connections')
  connections(@Param('targetId') targetId: string) {
    return { targetId };
  }
}

describe('tenant isolation over HTTP', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: SECRET });
  const owners: Record<string, string> = { 'alice-db': 'alice' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: JwtService, useValue: jwt },
        {
          provide: PrismaService,
          useValue: {
            target: {
              findUnique: async ({ where }: { where: { id: string } }) =>
                owners[where.id] ? { createdByUserId: owners[where.id] } : null,
            },
          },
        },
        TargetAccessService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TargetAccessGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (sub: string, role = 'user') =>
    jwt.signAsync({ sub, email: `${sub}@example.com`, role });

  it('serves the owner', async () => {
    await request(app.getHttpServer())
      .get('/live/alice-db/connections')
      .set('Authorization', `Bearer ${await tokenFor('alice')}`)
      .expect(200, { targetId: 'alice-db' });
  });

  it('returns 404 to a different tenant', async () => {
    await request(app.getHttpServer())
      .get('/live/alice-db/connections')
      .set('Authorization', `Bearer ${await tokenFor('mallory')}`)
      .expect(404);
  });

  it('still requires authentication before ownership', async () => {
    await request(app.getHttpServer())
      .get('/live/alice-db/connections')
      .expect(401);
  });
});
