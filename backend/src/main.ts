import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

/**
 * TaxMitra Enterprise — Backend Entry Point
 * Developer: Abhishek Agrahari | Kanpur, UP
 * Port: 3001 (Backend) | 3002 (AI Engine)
 *
 * Security: Helmet + CORS + ValidationPipe + JWT (Phase 4)
 * Docs: /api/docs (Swagger UI)
 * Health: /api/health
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const logger = new Logger('Bootstrap');

  // ── Security Middleware ────────────────────────────────────
  // Enterprise: 75+ Security Features baseline (Helmet)
  app.use(helmet());

  // ── Global Validation Pipe ─────────────────────────────────
  // Phase 1: 1000+ Rules skeleton via class-validator + custom engine
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── CORS ───────────────────────────────────────────────────
  // Allow frontend (GitHub Pages) + future API integrations
  app.enableCors({
    origin: [
      'https://abhishekagrahari307-max.github.io',
      'http://localhost:3000',
      'http://localhost:4200',
      process.env.FRONTEND_URL || '*',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  // ── API Prefix ─────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Swagger API Documentation ──────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('TaxMitra Enterprise API')
    .setDescription(
      `## TaxMitra AI Enterprise — Backend API v1.0\n\n` +
      `**Developer:** Abhishek Agrahari | Kanpur, UP\n\n` +
      `**Phase 1:** Tax Engine + Validation (1000+ rules) + GST APIs\n\n` +
      `**Phase 2:** AI Engine (Gemini + OCR + Voice + Notice Analyzer)\n\n` +
      `**Phase 3:** CA Practice CRM + Accounting + Compliance Calendar\n\n` +
      `**Phase 4:** Multi-tenant + White Label + Franchise + Enterprise CI/CD\n\n` +
      `**Live Frontend:** https://abhishekagrahari307-max.github.io/ITR-AND-GST/`
    )
    .setVersion('1.0.0-phase1')
    .setContact('Abhishek Agrahari', 'https://github.com/abhishekagrahari307-max', '')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'JWT', in: 'header' },
      'JWT-Auth',
    )
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'API-Key')
    .addTag('Health', 'System health & status')
    .addTag('TaxFile — ITR Filing Engine', 'ITR-1 to ITR-7 filing APIs')
    .addTag('GST — GSTR Filing Suite', 'GSTR-1/3B/9/9C APIs')
    .addTag('Validation Engine — 1000+ Rules', 'Tax rule validation engine')
    .addTag('Practice — Client CRM + Staff + Tasks', 'CA Practice Management')
    .addTag('Accounting — Ledger + P&L + BRS + Payroll', 'Accounting module')
    .addTag('Compliance — Calendar + Reminders + Penalty Calc', 'Compliance tracking')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'TaxMitra Enterprise API Docs',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`\n╔══════════════════════════════════════════════════╗`);
  logger.log(`║  TaxMitra Enterprise Backend — Phase 1 Active    ║`);
  logger.log(`║  Developer: Abhishek Agrahari | Kanpur, UP       ║`);
  logger.log(`╠══════════════════════════════════════════════════╣`);
  logger.log(`║  API:    http://localhost:${port}/api               ║`);
  logger.log(`║  Docs:   http://localhost:${port}/api/docs          ║`);
  logger.log(`║  Health: http://localhost:${port}/api/health        ║`);
  logger.log(`╚══════════════════════════════════════════════════╝\n`);
}

bootstrap();
