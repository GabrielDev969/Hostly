import { apiUrl } from '../env';
import { createSessionClient, type SessionClient } from './session-client';

let instance: SessionClient | undefined;

// One client per tab, created on first use in the browser.
export function browserSession(): SessionClient {
  instance ??= createSessionClient({
    baseUrl: apiUrl,
    fetch: (request) => fetch(request),
    channel: () => new BroadcastChannel('session-token'),
    locks: () => navigator.locks,
  });
  return instance;
}
