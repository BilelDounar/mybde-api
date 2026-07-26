import { config } from 'dotenv';
import { existsSync } from 'fs';
import { NestFactory } from '@nestjs/core';

config({ path: existsSync('.env.local') ? '.env.local' : '.env' });
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

const WEAK_SECRETS = [
  '',
  'change-me-in-production-super-secret-key',
  'secret',
  'changeme',
];

function assertSecureConfig() {
  const secret = process.env.JWT_SECRET ?? '';
  if (WEAK_SECRETS.includes(secret) || secret.length < 32) {
    throw new Error(
      'JWT_SECRET manquant ou trop faible (>= 32 caractères requis, valeur par défaut interdite). ' +
        'Configurez un secret robuste dans .env avant de démarrer.',
    );
  }
}

async function bootstrap() {
  assertSecureConfig();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'production' }),
  );

  // ─── En-têtes de sécurité ────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  });

  // ─── Rate limiting global (anti brute-force / abus) ──
  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
  });

  // ─── Validation globale ──────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ─── Filtre d'exceptions normalisé ───────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── CORS (liste blanche) ────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ─── Swagger ─────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('MyBDE API')
    .setDescription("API backend de l'application MyBDE")
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ─── Démarrage ───────────────────────────────────────
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(`MyBDE API démarrée sur http://localhost:${port}`);
  logger.log(`Swagger : http://localhost:${port}/api/docs`);
}

bootstrap();
