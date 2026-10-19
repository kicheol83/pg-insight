import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('PG Insight API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports both databases up', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.details.platformDb.status).toBe('up');
    expect(res.body.details.timescaleDb.status).toBe('up');
  });

  it('GET /api/v1/auth/config is public', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/config')
      .expect(200)
      .expect((res) => {
        expect(typeof res.body.signupEnabled).toBe('boolean');
      });
  });

  it('GET /api/v1/targets requires a token', () => {
    return request(app.getHttpServer()).get('/api/v1/targets').expect(401);
  });
});
