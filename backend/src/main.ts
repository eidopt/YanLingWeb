import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { apiVersionAliasMiddleware } from './common/middleware/apiVersionAlias.middleware';
import { ConfigService } from './config/config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get(ConfigService);

  app.use(apiVersionAliasMiddleware);

  // Global prefix. `/api/v1/*` is accepted above as the versioned alias.
  app.setGlobalPrefix('api');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS — allow Next.js dev server and Electron
  app.enableCors({
    origin: env.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  if (env.trustProxy) {
    const server = app.getHttpAdapter().getInstance() as {
      set: (name: string, value: number) => void;
    };
    server.set('trust proxy', 1);
  }

  if (env.enableSwagger) {
    const config = new DocumentBuilder()
      .setTitle('AI App API')
      .setDescription('Backend API for AI App theme designer')
      .setVersion('1.0')
      .addTag('themes')
      .addTag('templates')
      .addTag('sites')
      .addTag('exports')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
    SwaggerModule.setup('api/v1/docs', app, document);

    // Export OpenAPI JSON for frontend type generation
    const fs = await import('fs');
    const path = await import('path');
    const outputPath = path.resolve(process.cwd(), '..', 'shared', 'openapi.json');
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
      console.log('OpenAPI spec written to shared/openapi.json');
    } catch (err) {
      console.warn(
        'OpenAPI spec could not be written:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  await app.listen(env.port);
  console.log(`Backend running on port ${env.port} (${env.serverFlavor})`);
  if (env.enableSwagger) {
    console.log('Swagger docs available at /api/docs and /api/v1/docs');
  }
}

void bootstrap();
