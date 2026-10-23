import type { ChannelLike, LockManagerLike } from '@/lib/session/session-client';
import { API } from './server';

// One lock manager per "browser": callbacks for the same name run one after the other.
export function memoryLocks(): LockManagerLike {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      const run = tail.then(callback);
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

// BroadcastChannel stand-in shared by the "tabs" of one test; delivery is async, like the real one.
export function channelHub() {
  const members = new Set<{ deliver: (data: unknown) => void }>();
  return (): ChannelLike => {
    const listeners: ((event: MessageEvent) => void)[] = [];
    const self = {
      deliver: (data: unknown) =>
        setTimeout(() => listeners.forEach((listener) => listener({ data } as MessageEvent)), 0),
    };
    members.add(self);
    return {
      postMessage: (message) =>
        members.forEach((member) => member !== self && member.deliver(structuredClone(message))),
      addEventListener: (_type, listener) => listeners.push(listener),
    };
  };
}

// `sent` records each request as the client builds it: MSW's Node interceptor drops the
// credentials mode, so that is where tests check it.
export function testSessionDeps(
  overrides: { channel?: () => ChannelLike | null; locks?: LockManagerLike; sent?: Request[] } = {},
) {
  const locks = overrides.locks ?? memoryLocks();
  return {
    baseUrl: () => API,
    fetch: (request: Request) => {
      overrides.sent?.push(request.clone());
      return fetch(request);
    },
    channel: overrides.channel ?? (() => null),
    locks: () => locks,
  };
}
