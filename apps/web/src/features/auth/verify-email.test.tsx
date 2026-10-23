import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import VerifyEmailPage from '@/app/auth/verify-email/page';
import {
  expectTokenOnlyInBody,
  openWithToken,
  recordRequests,
  URL_TOKEN,
  watchConsole,
} from '../../../test/auth';
import { panelHandlers } from '../../../test/handlers';
import { renderWithSession } from '../../../test/render';
import { API, server } from '../../../test/server';

const VERIFY = '/api/v1/auth/verify-email';

function verifyApi(answers: (204 | 400 | 429)[] = [204]) {
  const { handlers } = panelHandlers('operator_admin', { refreshValid: false });
  const tokens: string[] = [];
  server.use(
    ...handlers,
    http.post(`${API}${VERIFY}`, async ({ request }) => {
      tokens.push(((await request.json()) as { token: string }).token);
      const status = answers.shift() ?? 204;
      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json({ message: 'Invalid or expired verification token' }, { status });
    }),
  );
  return { tokens, sent: recordRequests() };
}

function open() {
  openWithToken('/auth/verify-email');
  return renderWithSession(
    <StrictMode>
      <VerifyEmailPage />
    </StrictMode>,
  );
}

let output = watchConsole();
afterEach(() => {
  output.restore();
  output = watchConsole();
});

describe('verify e-mail', () => {
  it('confirms once and sends the user to the login', async () => {
    const { tokens, sent } = verifyApi();
    const { queryClient } = open();

    expect(await screen.findByText('E-mail confirmado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o login' })).toHaveAttribute('href', '/login');
    expect(tokens).toEqual([URL_TOKEN]);
    expectTokenOnlyInBody(URL_TOKEN, { queryClient, sent, console: output, spentBy: VERIFY });
  });

  it('explains a used or expired link', async () => {
    verifyApi([400]);
    open();

    expect(await screen.findByText('Link inválido ou expirado')).toBeInTheDocument();
    expect(screen.getByText(/peça ajuda a quem administra o painel/)).toBeInTheDocument();
  });

  it('retries with the token it kept after too many attempts', async () => {
    const { tokens } = verifyApi([429, 204]);
    open();

    expect(await screen.findByText(/Muitas tentativas/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('E-mail confirmado')).toBeInTheDocument();
    expect(tokens).toEqual([URL_TOKEN, URL_TOKEN]);
  });

  it('says the link is broken when it has no token', async () => {
    const { tokens } = verifyApi();
    window.history.replaceState(null, '', '/auth/verify-email');
    renderWithSession(<VerifyEmailPage />);

    expect(await screen.findByText('Link inválido')).toBeInTheDocument();
    await waitFor(() => expect(tokens).toEqual([]));
  });
});
