jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('sign-up over HTTP', () => {
  let app: INestApplication;
  let signup: jest.Mock;

  beforeEach(async () => {
    signup = jest.fn().mockResolvedValue({ accessToken: 't' });
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { signup, signupEnabled: () => true },
        },
        { provide: JwtService, useValue: {} },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('exposes whether sign-up is enabled', async () => {
    await request(app.getHttpServer())
      .get('/auth/config')
      .expect(200, { signupEnabled: true });
  });

  it('rejects a role smuggled into the sign-up body', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'x@example.com', password: 'password123', role: 'admin' })
      .expect(400);
    expect(signup).not.toHaveBeenCalled();
  });

  it('allows five sign-ups per hour from one address, then answers 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: `u${i}@example.com`, password: 'password123' });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    expect(signup).toHaveBeenCalledTimes(5);
  });
});
