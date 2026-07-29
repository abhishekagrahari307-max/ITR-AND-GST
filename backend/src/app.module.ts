import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CalculationsModule } from './modules/calculations/calculations.module';
import { GstModule } from './modules/gst/gst.module';
import { ItrModule } from './modules/itr/itr.module';
import { AiModule } from './modules/ai/ai.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DatabaseModule } from './database/database.module';
import { FirebaseModule } from './config/firebase.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // ─── Config ─────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),

    // ─── Rate Limiting ────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([{
        ttl:   config.get('THROTTLE_TTL', 60000),
        limit: config.get('THROTTLE_LIMIT', 100),
      }]),
    }),

    // ─── Redis Cache ─────────────────────────────────────────
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        store: 'memory', // Change to redis-store in production
        ttl: config.get('CACHE_TTL', 300),
        max: config.get('CACHE_MAX', 500),
      }),
    }),

    // ─── Scheduling & Events ──────────────────────────────────
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),

    // ─── Core Modules ─────────────────────────────────────────
    DatabaseModule,
    FirebaseModule,

    // ─── Feature Modules ──────────────────────────────────────
    AuthModule,
    UsersModule,
    CalculationsModule,
    GstModule,
    ItrModule,
    AiModule,
    DocumentsModule,
    ComplianceModule,
    PayrollModule,
    ReportsModule,
  ],
})
export class AppModule {}
