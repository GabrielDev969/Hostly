import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createQueryClient, Providers } from '@/app/providers';
import { createSessionClient, type SessionClient } from '@/lib/session/session-client';
import { testSessionDeps } from './session-deps';

export function renderWithSession(ui: ReactElement, sessionClient?: SessionClient) {
  const session = sessionClient ?? createSessionClient(testSessionDeps());
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const result = render(
    <Providers sessionClient={session} queryClient={queryClient}>
      {ui}
    </Providers>,
  );
  return { ...result, session, queryClient };
}
