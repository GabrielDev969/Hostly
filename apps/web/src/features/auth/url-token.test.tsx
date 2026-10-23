import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { useUrlToken } from './url-token';

const renderStrict = () => renderHook(() => useUrlToken(), { wrapper: StrictMode });

describe('useUrlToken', () => {
  it('takes the token off the address bar and keeps it in state, even under StrictMode', async () => {
    window.history.replaceState(null, '', '/auth/verify-email?token=abc123&lang=pt#top');

    const { result } = renderStrict();

    await waitFor(() => expect(result.current).toEqual({ status: 'read', token: 'abc123' }));
    expect(window.location.pathname).toBe('/auth/verify-email');
    expect(window.location.search).toBe('?lang=pt');
    expect(window.location.hash).toBe('#top');
  });

  it('reads null when the link has no token', async () => {
    window.history.replaceState(null, '', '/auth/verify-email');

    const { result } = renderStrict();

    await waitFor(() => expect(result.current).toEqual({ status: 'read', token: null }));
  });

  it('treats an empty token as none and still clears it', async () => {
    window.history.replaceState(null, '', '/auth/verify-email?token=');

    const { result } = renderStrict();

    await waitFor(() => expect(result.current).toEqual({ status: 'read', token: null }));
    expect(window.location.search).toBe('');
  });
});
