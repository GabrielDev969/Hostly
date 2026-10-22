import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { env } from './config/env.config';
import { loggerConfig } from './config/logger.config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { PrismaModule } from '@shared/database/prisma.module';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { CustomThrottlerGuard } from '@shared/guards/custom-throttler.guard';
import { AppCacheModule } from '@shared/cache/cache.module';
import { MetricsModule } from '@shared/metrics/metrics.module';
import { MetricsInterceptor } from '@shared/metrics/metrics.interceptor';
import { QueuesModule } from '@shared/queues/queues.module';
import { MailerModule } from '@shared/mailer/mailer.module';
import { AuditInterceptor } from '@shared/interceptors/audit.interceptor';
import { PerformanceInterceptor } from '@shared/interceptors/performance.interceptor';
import { IdempotencyModule } from '@shared/idempotency/idempotency.module';
import { IdempotencyInterceptor } from '@shared/idempotency/idempotency.interceptor';
import { AllExceptionsFilter } from '@shared/filters/all-exceptions.filter';
import { AuditModule } from '@modules/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { WorkspacesModule } from '@modules/workspaces/workspaces.module';
import { RbacModule } from '@modules/rbac/rbac.module';
import { SessionsModule } from '@modules/sessions/sessions.module';
import { InvitationsModule } from '@modules/invitations/invitations.module';
import { HealthModule } from '@modules/health/health.module';
import { WellKnownModule } from '@modules/well-known/well-known.module';
import { AdminModule } from '@modules/admin/admin.module';
import { FeatureFlagsModule } from '@modules/feature-flags/feature-flags.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { ClientsModule } from '@modules/clients/clients.module';
import { SitesModule } from '@modules/sites/sites.module';
import { MaintenanceModule } from '@shared/maintenance/maintenance.module';
import { TenantContextMiddleware } from '@shared/tenancy/tenant-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot(loggerConfig),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: env.THROTTLE_TTL * 1000,
          limit: env.THROTTLE_LIMIT,
        },
      ],
      skipIf: () => env.NODE_ENV === 'test',
      storage:
        env.NODE_ENV === 'test'
          ? undefined
          : new ThrottlerStorageRedisService(
              new Redis({
                host: env.REDIS_HOST,
                port: env.REDIS_PORT,
                password: env.REDIS_PASSWORD,
                keyPrefix: 'throttle:',
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
              }),
            ),
    }),
    PrismaModule,
    AppCacheModule,
    IdempotencyModule,
    MetricsModule,
    QueuesModule,
    MailerModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    RbacModule,
    SessionsModule,
    InvitationsModule,
    ClientsModule,
    SitesModule,
    AuditModule,
    HealthModule,
    WellKnownModule,
    AdminModule,
    OrganizationsModule,
    FeatureFlagsModule,
    MaintenanceModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: PerformanceInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('{*splat}');
  }
}
