import { Module } from '@nestjs/common';
import { UsersModule } from '@modules/users/users.module';
import { SessionsModule } from '@modules/sessions/sessions.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AuditModule } from '@modules/audit/audit.module';
import { MaintenanceProcessor } from './maintenance.processor';
import { MaintenanceScheduler } from './maintenance.scheduler';

@Module({
  imports: [UsersModule, SessionsModule, AuthModule, AuditModule],
  providers: [MaintenanceProcessor, MaintenanceScheduler],
})
export class MaintenanceModule {}
