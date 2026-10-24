import { Prisma } from '@prisma/client';
import { getPrisma } from './test-database';
import { waitFor } from './fleet';

export interface HeldTransaction {
  // Backend pid of the transaction, to find who waits on its locks.
  pid: number;
  // Runs one more step inside the transaction, which keeps every lock it already holds.
  run<T>(step: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  commit(): Promise<void>;
  // A no-op once committed, so it fits a finally.
  rollback(): Promise<void>;
}

class RolledBack extends Error {}

type Message = { release: boolean } | { step: (tx: Prisma.TransactionClient) => Promise<void> };

// Runs lock in a transaction and keeps it open, holding its row locks, until commit or rollback.
// The transaction timeout is the hard deadline: a failed test never leaves it open.
export async function holdTransaction(
  lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<HeldTransaction> {
  const inbox: Message[] = [];
  let wake: (() => void) | null = null;
  const post = (message: Message): void => {
    inbox.push(message);
    wake?.();
  };
  const receive = async (): Promise<Message> => {
    while (inbox.length === 0) await new Promise<void>((resolve) => (wake = resolve));
    return inbox.shift()!;
  };
  let held!: (pid: number) => void;
  const holding = new Promise<number>((resolve) => (held = resolve));

  const done = getPrisma()
    .$transaction(
      async (tx) => {
        await lock(tx);
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        held(row!.pid);
        for (;;) {
          const message = await receive();
          if ('step' in message) await message.step(tx);
          else if (message.release) return;
          else throw new RolledBack();
        }
      },
      { timeout: 10_000 },
    )
    .catch((error: unknown) => {
      if (!(error instanceof RolledBack)) throw error;
    });

  const pid = await Promise.race([
    holding,
    done.then(() => {
      throw new Error('The transaction ended before holding its locks');
    }),
  ]);
  return {
    pid,
    run: <T>(step: (tx: Prisma.TransactionClient) => Promise<T>) =>
      new Promise<T>((resolve) => {
        post({
          step: async (tx) => {
            const result = step(tx);
            resolve(result);
            // A failed step aborts the transaction in Postgres, so it ends the transaction here too.
            await result;
          },
        });
      }),
    commit: async () => {
      post({ release: true });
      await done;
    },
    rollback: async () => {
      post({ release: false });
      await done;
    },
  };
}

// Waits, with a deadline, until some backend is blocked on a lock held by pid; returns its pid.
// The deadline stays under the 5 s an interactive transaction of the app may last.
export async function waitUntilBlockedBy(pid: number): Promise<number> {
  return waitFor(
    async () => {
      const rows = await getPrisma().$queryRaw<{ pid: number }[]>`
        SELECT pid FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
      return rows[0]?.pid;
    },
    `a backend blocked by ${pid}`,
    3_000,
  );
}

// Sends a request now and tells whether it has answered yet.
export function inFlight<T>(request: PromiseLike<T>): {
  answered: () => boolean;
  response: Promise<T>;
} {
  let answered = false;
  const response = Promise.resolve(request).finally(() => (answered = true));
  return { answered: () => answered, response };
}
