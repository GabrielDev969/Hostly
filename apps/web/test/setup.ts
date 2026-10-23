import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { navigation, resetNavigation } from './navigation';
import { server } from './server';

vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

// The default 1 s for findBy/waitFor is too tight when the API and panel suites share the CPU (pnpm test, CI):
// screens that render after a few requests timed out now and then. A passing test does not wait any longer.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetNavigation();
  // The token pages read and rewrite the real address bar.
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
});
afterAll(() => server.close());
