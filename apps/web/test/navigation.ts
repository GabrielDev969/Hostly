import { vi } from 'vitest';

// Stand-in for next/navigation: tests set the current location and assert on router calls.
export const navigation = {
  pathname: '/',
  searchParams: new URLSearchParams(),
  router: {
    replace: vi.fn<(href: string) => void>(),
    push: vi.fn<(href: string) => void>(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  },
};

export function setLocation(href: string) {
  const url = new URL(href, 'http://panel.test');
  navigation.pathname = url.pathname;
  navigation.searchParams = url.searchParams;
}

export function resetNavigation() {
  setLocation('/');
  Object.values(navigation.router).forEach((fn) => fn.mockReset());
}
