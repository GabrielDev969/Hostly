import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import LoginPage from '@/app/login/page';
import { ACCESS_TOKEN, panelHandlers } from '../../../test/handlers';
import { navigation, setLocation } from '../../../test/navigation';
import { renderWithSession } from '../../../test/render';
import { API, server } from '../../../test/server';

const CHALLENGE = 'challenge-header.challenge-payload.challenge-signature';
const TOTP = '123456';
const RECOVERY = 'ABCDE-12345';

// No refresh cookie when the page opens; login works and may ask for a second factor.
function loginApi(options: { twoFactor?: boolean; challengeExpired?: boolean } = {}) {
  const { handlers, calls, cookie } = panelHandlers('operator_admin', { refreshValid: false });
  const verified: string[] = [];
  server.use(
    ...handlers,
    http.post(`${API}/api/v1/auth/login`, async ({ request }) => {
      const body = (await request.json()) as { email: string; password: string };
      if (body.password !== 'StrongPass@123') {
        return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
      }
      if (options.twoFactor) return HttpResponse.json({ requires2FA: true, challenge: CHALLENGE });
      cookie.valid = true;
      return HttpResponse.json({ accessToken: ACCESS_TOKEN });
    }),
    http.post(`${API}/api/v1/auth/2fa/verify`, async ({ request }) => {
      const body = (await request.json()) as { challenge: string; code: string };
      if (options.challengeExpired || body.challenge !== CHALLENGE) {
        return HttpResponse.json({ message: 'Invalid or expired challenge' }, { status: 401 });
      }
      if (body.code !== TOTP && body.code !== RECOVERY) {
        return HttpResponse.json({ message: 'Invalid code' }, { status: 401 });
      }
      verified.push(body.code);
      cookie.valid = true;
      return HttpResponse.json({ accessToken: ACCESS_TOKEN });
    }),
  );
  return { calls, cookie, verified };
}

async function signIn(password = 'StrongPass@123') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com');
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

const expectNoTokenLeak = () => {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  for (const [href] of navigation.router.replace.mock.calls) {
    expect(href).not.toContain(ACCESS_TOKEN);
    expect(href).not.toContain(CHALLENGE);
  }
};

describe('login', () => {
  it('signs in without 2FA and goes to the panel home', async () => {
    loginApi();
    renderWithSession(<LoginPage />);

    await signIn();

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expectNoTokenLeak();
  });

  it('goes back to the page that asked for the login', async () => {
    loginApi();
    setLocation('/login?next=%2Frobots%3Fclient%3Dabc');
    renderWithSession(<LoginPage />);

    await signIn();

    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith('/robots?client=abc'),
    );
  });

  it('ignores a next that points to another site', async () => {
    loginApi();
    setLocation('/login?next=%2F%2Fevil.com');
    renderWithSession(<LoginPage />);

    await signIn();

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
  });

  it('shows an error for wrong credentials', async () => {
    loginApi();
    renderWithSession(<LoginPage />);

    await signIn('wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('completes the login with a TOTP code', async () => {
    const { verified } = loginApi({ twoFactor: true });
    renderWithSession(<LoginPage />);

    const user = await signIn();
    await user.type(await screen.findByLabelText('Código do app autenticador'), TOTP);
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(verified).toEqual([TOTP]);
    expectNoTokenLeak();
  });

  it('completes the login with a recovery code', async () => {
    const { verified } = loginApi({ twoFactor: true });
    renderWithSession(<LoginPage />);

    const user = await signIn();
    await user.click(await screen.findByRole('button', { name: 'Usar código de recuperação' }));
    await user.type(screen.getByLabelText('Código de recuperação'), RECOVERY);
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(verified).toEqual([RECOVERY]);
  });

  it('keeps the code step and shows an error for a wrong code', async () => {
    loginApi({ twoFactor: true });
    renderWithSession(<LoginPage />);

    const user = await signIn();
    await user.type(await screen.findByLabelText('Código do app autenticador'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(screen.getByLabelText('Código do app autenticador')).toBeInTheDocument();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('sends the user back to the password when the challenge expired', async () => {
    loginApi({ twoFactor: true, challengeExpired: true });
    renderWithSession(<LoginPage />);

    const user = await signIn();
    await user.type(await screen.findByLabelText('Código do app autenticador'), TOTP);
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText(/O tempo para digitar o código acabou/)).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('skips the form when the refresh cookie still holds a session', async () => {
    const { calls, cookie } = loginApi();
    cookie.valid = true;
    renderWithSession(<LoginPage />);

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(calls.refresh).toBe(1);
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument();
  });
});

describe('forgot password', () => {
  // The API answers 204 for any e-mail; only it knows which ones have an account.
  function forgotApi(status = 204) {
    loginApi();
    const asked: string[] = [];
    server.use(
      http.post(`${API}/api/v1/auth/forgot-password`, async ({ request }) => {
        asked.push(((await request.json()) as { email: string }).email);
        return status === 204
          ? new HttpResponse(null, { status })
          : HttpResponse.json({ message: 'Refused' }, { status });
      }),
    );
    return asked;
  }

  async function askReset(email: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Esqueci a senha' }));
    await user.type(screen.getByLabelText('E-mail'), email);
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));
  }

  it('answers the same for an e-mail with an account and one without', async () => {
    const asked = forgotApi();
    const screens: string[] = [];
    for (const email of ['ana@example.com', 'ninguem@example.com']) {
      const { container, unmount } = renderWithSession(<LoginPage />);
      await askReset(email);
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.',
      );
      screens.push(container.innerHTML);
      unmount();
    }

    expect(asked).toEqual(['ana@example.com', 'ninguem@example.com']);
    expect(screens[0]).toBe(screens[1]);
  });

  it.each([
    [400, 'Confira o e-mail.'],
    [429, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  ])('explains a %i', async (status, message) => {
    forgotApi(status);
    renderWithSession(<LoginPage />);

    await askReset('ana@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('opens on this step from a link that asks for another reset', async () => {
    forgotApi();
    setLocation('/login?forgot=1');
    renderWithSession(<LoginPage />);

    expect(await screen.findByRole('heading', { name: 'Esqueci a senha' })).toBeInTheDocument();
  });

  it('asks to confirm the e-mail when the login refuses an unverified account', async () => {
    loginApi();
    server.use(
      http.post(`${API}/api/v1/auth/login`, () =>
        HttpResponse.json({ message: 'Email not verified' }, { status: 403 }),
      ),
    );
    renderWithSession(<LoginPage />);

    await signIn();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirme seu e-mail pelo link que enviamos antes de entrar.',
    );
  });
});
