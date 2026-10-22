import { Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from '../repositories/users.repository.interface';

export const ANONYMIZATION_GRACE_DAYS = 30;

@Injectable()
export class AnonymizeExpiredUsersUseCase {
  private readonly logger = new Logger('AnonymizeExpiredUsers');

  constructor(private readonly users: UsersRepository) {}

  async execute(): Promise<{ anonymized: number }> {
    const cutoff = new Date(Date.now() - ANONYMIZATION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.users.findPendingAnonymization(cutoff);

    let anonymized = 0;
    for (const user of expired) {
      try {
        await this.users.anonymize(user.id);
        anonymized++;
      } catch (err) {
        this.logger.error({
          msg: 'Failed to anonymize user',
          userId: user.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (anonymized > 0) {
      this.logger.log({ msg: 'Anonymized expired users', anonymized });
    }
    return { anonymized };
  }
}
