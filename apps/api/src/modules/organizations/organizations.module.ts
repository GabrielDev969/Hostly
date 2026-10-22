import { Global, Module } from '@nestjs/common';
import { OrganizationsRepository } from './repositories/organizations.repository.interface';
import { PrismaOrganizationsRepository } from './repositories/prisma-organizations.repository';

@Global()
@Module({
  providers: [
    {
      provide: OrganizationsRepository,
      useClass: PrismaOrganizationsRepository,
    },
  ],
  exports: [OrganizationsRepository],
})
export class OrganizationsModule {}
