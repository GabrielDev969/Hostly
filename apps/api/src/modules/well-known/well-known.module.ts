import { Module } from '@nestjs/common';
import { JwtKeyResolverModule } from '@modules/auth/jwt-key-resolver.module';
import { WellKnownController } from './http/well-known.controller';

@Module({
  imports: [JwtKeyResolverModule],
  controllers: [WellKnownController],
})
export class WellKnownModule {}
