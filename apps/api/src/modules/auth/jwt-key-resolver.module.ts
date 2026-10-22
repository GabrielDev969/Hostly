import { Module } from '@nestjs/common';
import { JwtKeyResolverService } from './services/jwt-key-resolver.service';

@Module({
  providers: [JwtKeyResolverService],
  exports: [JwtKeyResolverService],
})
export class JwtKeyResolverModule {}
