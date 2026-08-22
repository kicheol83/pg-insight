import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';

function protectSwaggerInProduction(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const user = process.env.SWAGGER_USER;
  const pass = process.env.SWAGGER_PASSWORD;

  if (!user || !pass) {
    res.status(404).send('Not found');
    return;
  }

  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Swagger"');
    res.status(401).send('Authentication required');
    return;
  }

  const encodedCredentials = authorization.slice('Basic '.length);

  let decodedCredentials: string;

  try {
    decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString(
      'utf8',
    );
  } catch {
    res.set('WWW-Authenticate', 'Basic realm="Swagger"');
    res.status(401).send('Authentication required');
    return;
  }

  const separatorIndex = decodedCredentials.indexOf(':');

  if (separatorIndex === -1) {
    res.set('WWW-Authenticate', 'Basic realm="Swagger"');
    res.status(401).send('Authentication required');
    return;
  }

  const username = decodedCredentials.slice(0, separatorIndex);
  const password = decodedCredentials.slice(separatorIndex + 1);

  if (username !== user || password !== pass) {
    res.set('WWW-Authenticate', 'Basic realm="Swagger"');
    res.status(401).send('Authentication required');
    return;
  }

  next();
}
async function bootstrap() {
  const app = await NestFactory.create(AppModule); // { bufferLogs: true }

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.use('/api/docs', protectSwaggerInProduction);

  const config = new DocumentBuilder()
    .setTitle('PG Insight API')
    .setDescription('Open source PostgreSQL monitoring platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('targets')
    .addTag('metrics')
    .addTag('live')
    .addTag('alerts')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`PG Insight API running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
