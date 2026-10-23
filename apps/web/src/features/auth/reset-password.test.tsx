import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import ResetPasswordPage from '@/app/auth/reset-password/page';
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

const RESET = '/api/v1/auth/reset-password';
const STRONG = 'Tr0ub4dor&3-quay';

function resetApi() {
  const { handlers } = panelHandlers('operator_admin', { refreshValid: false });
  const bodies: unknown[] = [];
  server.use(
    ...handlers,
    http.post(`${API}${RESET}`, async ({ request }) => {
      const body = (await request.json()) as { token: string; newPassword: string };
      bodies.push(body);
      if (body.newPassword === 'weak') {
        return HttpResponse.json(
          { message: 'Validation failed', details: ['Password must contain at least one number'] },
          { status: 400 },
        );
      }
      if (body.newPassword === 'expired-link') {
        return HttpResponse.json({ message: 'Invalid or expired reset token' }, { status: 400 });
      }
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { bodies, sent: recordRequests() };
}

async function choose(password: string, confirmation = password) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Senha nova'), password);
  await user.type(screen.getByLabelText('Confirme a senha nova'), confirmation);
  await user.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
}

function open() {
  openWithToken('/auth/reset-password');
  return renderWithSession(<ResetPasswordPage />);
}

let output = watchConsole();
afterEach(() => {
  output.restore();
  output = watchConsole();
});

describe('reset password', () => {
  it('saves the new password with the token from the link', async () => {
    const { bodies, sent } = resetApi();
    const { queryClient } = open();

    await choose(STRONG);

    expect(await screen.findByText('Senha alterada')).toBeInTheDocument();
    expect(bodies).toEqual([{ token: URL_TOKEN, newPassword: STRONG }]);
    expectTokenOnlyInBody(URL_TOKEN, { queryClient, sent, console: output, spentBy: RESET });
  });

  it('shows the rules the API refused', async () => {
    resetApi();
    open();

    await choose('weak');

    expect(await screen.findByRole('alert')).toHaveTextContent('A API recusou a senha:');
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Password must contain at least one number',
    );
  });

  it('offers a new link when the API refuses the token', async () => {
    resetApi();
    open();

    await choose('expired-link');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired reset token');
    expect(screen.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute(
      'href',
      '/login?forgot=1',
    );
  });

  it('does not send two different passwords', async () => {
    const { bodies } = resetApi();
    open();

    await choose(STRONG, `${STRONG}x`);

    expect(await screen.findByRole('alert')).toHaveTextContent('As duas senhas não são iguais.');
    expect(bodies).toEqual([]);
  });

  it('says the link is broken when it has no token', async () => {
    resetApi();
    window.history.replaceState(null, '', '/auth/reset-password');
    renderWithSession(<ResetPasswordPage />);

    expect(await screen.findByText('Link inválido')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir outro link' })).toHaveAttribute(
      'href',
      '/login?forgot=1',
    );
  });
});
