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
import { RESEND_VERIFICATION_SENT } from './resend-verification';
import { API, server } from '../../../test/server';

const VERIFY = '/api/v1/auth/verify-email';
const RESEND = '/api/v1/auth/verify-email/resend';

// The API answers 204 for any e-mail; only it knows which ones have an account waiting.
function resendApi(answers: number[] = []) {
  const asked: string[] = [];
  server.use(
    http.post(`${API}${RESEND}`, async ({ request }) => {
      asked.push(((await request.json()) as { email: string }).email);
      const status = answers.shift() ?? 204;
      return status === 204
        ? new HttpResponse(null, { status })
        : HttpResponse.json({ message: 'Refused' }, { status });
    }),
  );
  return asked;
}

async function askResend(email: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('E-mail'), email);
  await user.click(screen.getByRole('button', { name: 'Reenviar e-mail de verificação' }));
}

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
    expect(screen.getByText(/peça um link novo/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reenviar e-mail de verificação' }),
    ).toBeInTheDocument();
  });

  it('asks for a new link from an expired one, with the same answer for any e-mail', async () => {
    verifyApi([400, 400]);
    const asked = resendApi();
    const screens: string[] = [];
    for (const email of ['ana@example.com', 'ninguem@example.com']) {
      const { container, unmount } = open();
      expect(await screen.findByText('Link inválido ou expirado')).toBeInTheDocument();
      await askResend(email);
      expect(await screen.findByRole('status')).toHaveTextContent(RESEND_VERIFICATION_SENT);
      expect(
        screen.queryByRole('button', { name: 'Reenviar e-mail de verificação' }),
      ).not.toBeInTheDocument();
      screens.push(container.innerHTML);
      unmount();
    }

    expect(asked).toEqual(['ana@example.com', 'ninguem@example.com']);
    expect(screens[0]).toBe(screens[1]);
  });

  it.each([
    [400, 'Confira o e-mail.'],
    [429, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
    [503, 'Não foi possível enviar agora. Tente de novo.'],
  ] as const)(
    'explains a %i on the resend and lets the user try again',
    async (status, message) => {
      verifyApi([400]);
      const asked = resendApi([status]);
      open();
      expect(await screen.findByText('Link inválido ou expirado')).toBeInTheDocument();

      await askResend('ana@example.com');
      expect(await screen.findByText(message)).toHaveAttribute('role', 'alert');

      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Reenviar e-mail de verificação' }));
      expect(await screen.findByRole('status')).toHaveTextContent(RESEND_VERIFICATION_SENT);
      expect(asked).toEqual(['ana@example.com', 'ana@example.com']);
    },
  );

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

  it('asks for a new link from a broken one', async () => {
    verifyApi();
    const asked = resendApi();
    window.history.replaceState(null, '', '/auth/verify-email');
    renderWithSession(<VerifyEmailPage />);

    expect(await screen.findByText('Link inválido')).toBeInTheDocument();
    await askResend('ana@example.com');

    expect(await screen.findByRole('status')).toHaveTextContent(RESEND_VERIFICATION_SENT);
    expect(asked).toEqual(['ana@example.com']);
  });
});
