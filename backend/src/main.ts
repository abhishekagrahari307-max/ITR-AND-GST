import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // ─── Security ──────────────────────────────────────────────────────────────
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: nodeEnv === 'production',
  }));
  app.use(compression());

  // ─── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  });

  // ─── Global Prefix ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Pipes ─────────────────────────────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // ─── Filters & Interceptors ─────────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );

  // ─── Swagger API Docs ───────────────────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TaxMitra AI Enterprise API')
      .setDescription(`
        # TaxMitra AI Enterprise – Complete Backend API
        
        ## Features
        - 🔐 Firebase Auth + JWT Authentication
        - 🤖 AI Tax Assistant (Gemini + OpenAI + Rule-based)
        - 📋 ITR Filing Management
        - 🧾 GST Suite
        - 💼 TDS & Payroll
        - 📊 Tax Calculations
        - 📁 Document OCR
        - 📅 Compliance Tracking
        
        **Base URL:** \`/api/v1\`
        
        Built by Abhishek Agrahari
      `)
      .setVersion('2.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'JWT', in: 'header' },
        'JWT-auth',
      )
      .addTag('Auth', 'Authentication & Authorization')
      .addTag('Users', 'User management')
      .addTag('Tax Calculations', 'Income tax computation engine')
      .addTag('ITR', 'Income Tax Return filing')
      .addTag('GST', 'GST returns & invoicing')
      .addTag('TDS & Payroll', 'TDS management & payroll')
      .addTag('AI Assistant', 'AI-powered tax guidance')
      .addTag('Documents', 'Document upload & OCR')
      .addTag('Compliance', 'Compliance tracking & reminders')
      .addTag('Reports', 'Reports & analytics')
      .addTag('Calculators', 'Tax & financial calculators')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'TaxMitra API Docs',
      customfavIcon: '/favicon.ico',
      swaggerOptions: { persistAuthorization: true },
    });

    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  logger.log(`⚡ TaxMitra Backend running on port ${port} [${nodeEnv}]`);
  logger.log(`🌐 API Base: http://localhost:${port}/api/v1`);
}

bootstrap();
