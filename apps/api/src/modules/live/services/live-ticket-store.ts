import { Inject, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { LiveViewer } from '../entities/live-viewer.entity';

export const LIVE_REDIS = 'LIVE_REDIS';
export const LIVE_TICKET_PREFIX = 'live:ticket:';

export interface LiveRedis {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<'OK' | null>;
  getdel(key: string): Promise<string | null>;
  quit(): Promise<unknown>;
}

// Tickets are keyed by their sha256, so the store never holds one that could open a socket.
export abstract class LiveTicketStore {
  abstract save(ticketHash: string, viewer: LiveViewer, ttlMs: number): Promise<void>;
  // Single use: the first take removes it.
  abstract take(ticketHash: string): Promise<LiveViewer | null>;
}

// In Redis so any API instance can redeem it; without Redis no ticket is issued or redeemed (fail closed).
@Injectable()
export class RedisLiveTicketStore extends LiveTicketStore implements OnModuleDestroy {
  constructor(@Inject(LIVE_REDIS) private readonly redis: LiveRedis) {
    super();
  }

  async save(ticketHash: string, viewer: LiveViewer, ttlMs: number): Promise<void> {
    await this.call(() =>
      this.redis.set(`${LIVE_TICKET_PREFIX}${ticketHash}`, JSON.stringify(viewer), 'PX', ttlMs),
    );
  }

  async take(ticketHash: string): Promise<LiveViewer | null> {
    const raw = await this.call(() => this.redis.getdel(`${LIVE_TICKET_PREFIX}${ticketHash}`));
    return raw ? (JSON.parse(raw) as LiveViewer) : null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private async call<T>(command: () => Promise<T>): Promise<T> {
    try {
      return await command();
    } catch {
      throw new ServiceUnavailableException('Live channel temporarily unavailable');
    }
  }
}
