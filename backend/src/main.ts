import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

// 10 minutes — long enough for any realistic HANA query
const SERVER_TIMEOUT_MS = 10 * 60 * 1000;

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('HANA Project API')
    .setDescription('NestJS + SAP HANA REST API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('BACKEND_PORT', 3001);

  // Configure server timeouts BEFORE listen so every connection is covered
  // from the very first request — no race window.
  const httpServer = app.getHttpServer();
  httpServer.setTimeout(SERVER_TIMEOUT_MS);
  httpServer.keepAliveTimeout = SERVER_TIMEOUT_MS;
  httpServer.headersTimeout   = SERVER_TIMEOUT_MS + 1000; // must be > keepAliveTimeout

  await app.listen(port);

  logger.log(`Application running on: http://localhost:${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
  logger.log(`HTTP server timeout set to ${SERVER_TIMEOUT_MS / 1000}s`);
}

bootstrap();
