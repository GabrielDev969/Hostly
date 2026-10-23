import { Prisma } from '@prisma/client';
import { getPrisma } from './test-database';
import { waitFor } from './fleet';

export interface HeldTransaction {
  // Backend pid of the transaction, to find who waits on its locks.
  pid: number;
  commit(): Promise<void>;
  // A no-op once committed, so it fits a finally.
  rollback(): Promise<void>;
}

class RolledBack extends Error {}

// Runs lock in a transaction and keeps it open, holding its row locks, until commit or rollback.
// The transaction timeout is the hard deadline: a failed test never leaves it open.
export async function holdTransaction(
  lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<HeldTransaction> {
  let release!: (commit: boolean) => void;
  const released = new Promise<boolean>((resolve) => (release = resolve));
  let held!: (pid: number) => void;
  const holding = new Promise<number>((resolve) => (held = resolve));

  const done = getPrisma()
    .$transaction(
      async (tx) => {
        await lock(tx);
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        held(row!.pid);
        if (!(await released)) throw new RolledBack();
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
    commit: async () => {
      release(true);
      await done;
    },
    rollback: async () => {
      release(false);
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
