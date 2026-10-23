import { ForbiddenException } from '@nestjs/common';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { TenantContext } from '@shared/tenancy/tenant-context';
import type { TenantScope } from '@shared/tenancy/tenant-scope';
import { IssueLiveTicketUseCase } from './issue-live-ticket.use-case';
import { RedeemLiveTicketUseCase } from './redeem-live-ticket.use-case';
import { LiveTicketStore } from '../services/live-ticket-store';

const scope = (overrides: Partial<TenantScope> = {}): TenantScope => ({
  organizationId: 'o1',
  workspaceId: 'w1',
  clientId: null,
  advertiserId: null,
  ...overrides,
});

describe('IssueLiveTicketUseCase and RedeemLiveTicketUseCase', () => {
  let tickets: jest.Mocked<LiveTicketStore>;

  beforeEach(() => {
    tickets = { save: jest.fn(), take: jest.fn().mockResolvedValue(null) };
  });

  it('stores only the hash of the ticket, with the caller scope', async () => {
    const issued = await TenantContext.runWithScope(scope({ clientId: 'cA' }), () =>
      new IssueLiveTicketUseCase(tickets).execute('u1'),
    );

    expect(issued.ticket).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(tickets.save).toHaveBeenCalledWith(
      CryptoUtil.hashToken(issued.ticket),
      { userId: 'u1', organizationId: 'o1', workspaceId: 'w1', clientId: 'cA' },
      expect.any(Number),
    );
  });

  it('refuses an advertiser scope and a missing scope', async () => {
    await expect(
      TenantContext.runWithScope(scope({ clientId: 'cA', advertiserId: 'adv' }), () =>
        new IssueLiveTicketUseCase(tickets).execute('u1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(new IssueLiveTicketUseCase(tickets).execute('u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tickets.save).not.toHaveBeenCalled();
  });

  it('redeems by the hash of the ticket', async () => {
    await expect(new RedeemLiveTicketUseCase(tickets).execute('raw')).resolves.toBeNull();
    expect(tickets.take).toHaveBeenCalledWith(CryptoUtil.hashToken('raw'));
  });
});
