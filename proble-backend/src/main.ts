import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS so your React frontend (on port 5173) can talk to this NestJS API (on port 3000)
  app.enableCors({
    origin: '*', // For local dev/pilot we allow all; we will secure this in production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Configure Swagger Interactive API Documentation!
  const config = new DocumentBuilder()
    .setTitle('PROBLE v2 Secure Assessment API')
    .setDescription(
      'Interactive proctoring endpoints for starting attempts, autosaving progress, logging telemetry, and secure server grading.',
    )
    .setVersion('2.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter Supabase student JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-proble-signature',
        in: 'header',
        description: 'HMAC-SHA256 client signature calculated via time-drift secret',
      },
      'Handshake-Signature',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-proble-timestamp',
        in: 'header',
        description: 'Timestamp used in the HMAC calculation',
      },
      'Handshake-Timestamp',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  logger.log(`=================================================`);
  logger.log(`🚀 PROBLE PORTABLE NestJS BACKEND IS RUNNING LOCALLY!`);
  logger.log(`👉 API URL: http://localhost:${port}`);
  logger.log(`👉 Swagger Docs: http://localhost:${port}/api/docs`);
  logger.log(`=================================================`);
}
bootstrap();
