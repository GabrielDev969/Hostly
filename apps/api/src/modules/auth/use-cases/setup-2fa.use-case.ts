import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersRepository } from '@modules/users/repositories/users.repository.interface';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TwoFactorService } from '../services/two-factor.service';
import { AuditService } from '@modules/audit/services/audit.service';

export interface SetupTwoFactorResult {
  secret: string;
  otpauthUrl: string;
}

@Injectable()
export class SetupTwoFactorUseCase {
  constructor(
    private users: UsersRepository,
    private twoFactor: TwoFactorService,
    private audit: AuditService,
  ) {}

  async execute(userId: string, password: string): Promise<SetupTwoFactorResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) throw new BadRequestException('2FA is already enabled');

    if (!user.passwordHash || !(await CryptoUtil.verifyPassword(user.passwordHash, password))) {
      await this.audit.log({
        userId,
        action: 'auth.password.invalid',
        metadata: { context: '2fa_setup' },
      });
      throw new UnauthorizedException('Invalid password');
    }

    const secret = this.twoFactor.generateSecret();
    await this.users.update(userId, {
      twoFactorSecret: this.twoFactor.encryptSecret(secret),
    });

    return {
      secret,
      otpauthUrl: this.twoFactor.buildOtpAuthUrl(user.email, secret),
    };
  }
}
