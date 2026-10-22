import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { ConflictException, Injectable } from '@nestjs/common';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { MetricsService } from '@shared/metrics/metrics.service';
import { RequestEmailVerificationUseCase } from './request-email-verification.use-case';

interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

@Injectable()
export class RegisterUseCase {
  constructor(
    private users: UsersRepository,
    private metrics: MetricsService,
    private requestEmailVerification: RequestEmailVerificationUseCase,
  ) {}

  async execute(input: RegisterInput) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      this.metrics.incRegister('conflict');
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await CryptoUtil.hashPassword(input.password);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
    });

    // No personal workspace: in Hostly a workspace is an operator tenant, created by the seed.
    // New users only gain access through an invitation.
    await this.requestEmailVerification.execute(user.id);

    this.metrics.incRegister('success');
    return { id: user.id, email: user.email, name: user.name };
  }
}
