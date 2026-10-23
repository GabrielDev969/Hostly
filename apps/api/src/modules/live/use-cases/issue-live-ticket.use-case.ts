import { ForbiddenException, Injectable } from '@nestjs/common';
import { env } from 'src/config/env.config';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import { LiveTicketStore } from '../services/live-ticket-store';

export interface LiveTicket {
  ticket: string;
  expiresAt: Date;
}

@Injectable()
export class IssueLiveTicketUseCase {
  constructor(private tickets: LiveTicketStore) {}

  // The ticket carries the caller's scope as it is now; the socket filters every event by it.
  async execute(userId: string): Promise<LiveTicket> {
    const scope = TenantContext.scope;
    // robot:read already keeps advertisers out (PERMISSION_CEILING); this keeps it so if that changes.
    if (!scope || scope.advertiserId)
      throw new ForbiddenException('No live channel for this scope');

    const ticket = CryptoUtil.generateToken(32);
    await this.tickets.save(
      CryptoUtil.hashToken(ticket),
      {
        userId,
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        clientId: scope.clientId,
      },
      env.LIVE_TICKET_TTL_MS,
    );
    return { ticket, expiresAt: new Date(Date.now() + env.LIVE_TICKET_TTL_MS) };
  }
}
