import { Injectable } from '@nestjs/common';
import { CryptoUtil } from '@shared/utils/crypto.util';
import { LiveViewer } from '../entities/live-viewer.entity';
import { LiveTicketStore } from '../services/live-ticket-store';

@Injectable()
export class RedeemLiveTicketUseCase {
  constructor(private tickets: LiveTicketStore) {}

  // Null for an unknown, used or expired ticket.
  async execute(ticket: string): Promise<LiveViewer | null> {
    return this.tickets.take(CryptoUtil.hashToken(ticket));
  }
}
