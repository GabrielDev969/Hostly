import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import AcceptInvitationPage from '@/app/invitations/accept/page';
import {
  expectTokenOnlyInBody,
  openWithToken,
  recordRequests,
  URL_TOKEN,
  watchConsole,
} from '../../../test/auth';
import { ME } from '../../../test/fixtures';
import { ACCESS_TOKEN, panelHandlers } from '../../../test/handlers';
import { navigation } from '../../../test/navigation';
import { renderWithSession } from '../../../test/render';
import { API, server } from '../../../test/server';

const NEW_WORKSPACE = '66666666-6666-4666-8666-666666666666';
const CHALLENGE = 'challenge-header.challenge-payload.challenge-signature';
const ACCEPT = '/api/v1/invitations/accept';

type AcceptAnswer = 'ok' | 403 | 404 | 400 | 409 | 429;

// The invited user, signed in or not, and an API that answers the acceptance as told.
function inviteApi(
  options: { signedIn?: boolean; answers?: AcceptAnswer[]; twoFactor?: boolean } = {},
) {
  const { handlers, calls, cookie } = panelHandlers('operator_admin', {
    refreshValid: options.signedIn ?? false,
  });
  const answers = [...(options.answers ?? ['ok'])];
  const accepted: string[] = [];
  const registered: unknown[] = [];
  let joined = false;
  server.use(
    ...handlers,
    http.post(`${API}/api/v1/auth/login`, async ({ request }) => {
      const body = (await request.json()) as { password: string };
      if (body.password !== 'StrongPass@123') {
        return HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 });
      }
      if (options.twoFactor) return HttpResponse.json({ requires2FA: true, challenge: CHALLENGE });
      cookie.valid = true;
      return HttpResponse.json({ accessToken: ACCESS_TOKEN });
    }),
    http.post(`${API}/api/v1/auth/2fa/verify`, () => {
      cookie.valid = true;
      return HttpResponse.json({ accessToken: ACCESS_TOKEN });
    }),
    http.post(`${API}/api/v1/auth/register`, async ({ request }) => {
      const body = (await request.json()) as { email: string; password: string };
      registered.push(body);
      if (body.email === 'taken@example.com') {
        return HttpResponse.json({ message: 'Email already registered' }, { status: 409 });
      }
      if (body.password === 'weak') {
        return HttpResponse.json(
          {
            message: 'Validation failed',
            details: ['Password must be at least 12 characters; Password is too common'],
          },
          { status: 400 },
        );
      }
      return HttpResponse.json({ id: 'u', email: body.email, name: 'Bia' }, { status: 201 });
    }),
    http.post(`${API}${ACCEPT}`, async ({ request }) => {
      if (request.headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      accepted.push(((await request.json()) as { token: string }).token);
      const answer = answers.shift() ?? 'ok';
      if (answer !== 'ok') return HttpResponse.json({ message: 'Refused' }, { status: answer });
      joined = true;
      return HttpResponse.json({ workspaceId: NEW_WORKSPACE, roleId: 'role-client_admin' });
    }),
  );
  // After the acceptance, the profile lists the new workspace next to the old one.
  server.use(
    http.get(`${API}/api/v1/auth/me`, ({ request }) => {
      if (request.headers.get('authorization') !== `Bearer ${ACCESS_TOKEN}`) {
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      const workspaces = joined
        ? [
            ...ME.workspaces,
            { id: NEW_WORKSPACE, name: 'Operadora Nova', slug: 'nova', isPersonal: false },
          ]
        : ME.workspaces;
      return HttpResponse.json({ ...ME, workspaces });
    }),
  );
  const sent = recordRequests();
  return { calls, accepted, registered, sent };
}

async function signIn(password = 'StrongPass@123') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com');
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

function open() {
  openWithToken('/invitations/accept');
  return renderWithSession(<AcceptInvitationPage />);
}

let output = watchConsole();
afterEach(() => {
  output.restore();
  output = watchConsole();
});

describe('accept invitation', () => {
  it('signs in on the page, accepts and enters the new workspace', async () => {
    const { accepted, sent } = inviteApi();
    const { queryClient } = open();

    await screen.findByText(/Entre com a conta do e-mail convidado/);
    expect(window.location.search).toBe('');
    await signIn();

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(accepted).toEqual([URL_TOKEN]);
    expect(sent.map((r) => r.url)).toContain(`${API}/api/v1/workspaces/${NEW_WORKSPACE}/me`);
    expectTokenOnlyInBody(URL_TOKEN, { queryClient, sent, console: output, spentBy: ACCEPT });
  });

  it('accepts after the second factor', async () => {
    const { accepted } = inviteApi({ twoFactor: true });
    open();

    const user = await signIn();
    await user.type(await screen.findByLabelText('Código do app autenticador'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(accepted).toEqual([URL_TOKEN]);
  });

  it('asks a signed-in user before accepting', async () => {
    const { accepted } = inviteApi({ signedIn: true });
    open();

    expect(await screen.findByText(/como ana@example.com/)).toBeInTheDocument();
    expect(accepted).toEqual([]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Aceitar convite' }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(accepted).toEqual([URL_TOKEN]);
  });

  it('creates the account and asks to confirm the e-mail before coming back', async () => {
    const { accepted, registered, sent } = inviteApi();
    const { queryClient } = open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('Nome'), 'Bia Lima');
    await user.type(screen.getByLabelText('E-mail'), 'bia@example.com');
    await user.type(screen.getByLabelText('Senha'), 'Tr0ub4dor&3-quay');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /bia@example.com. Confirme o e-mail e depois abra este convite de novo pelo link do e-mail/,
    );
    expect(registered).toEqual([
      { name: 'Bia Lima', email: 'bia@example.com', password: 'Tr0ub4dor&3-quay' },
    ]);
    expect(accepted).toEqual([]);
    expect(sent.some((r) => r.body.includes(URL_TOKEN))).toBe(false);
    expect(window.location.href).not.toContain(URL_TOKEN);
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.queryKey),
      ),
    ).not.toContain(URL_TOKEN);
  });

  it('shows the password rules the API refused', async () => {
    inviteApi();
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('Nome'), 'Bia Lima');
    await user.type(screen.getByLabelText('E-mail'), 'bia@example.com');
    await user.type(screen.getByLabelText('Senha'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A API recusou o cadastro:');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Password must be at least 12 characters',
      'Password is too common',
    ]);
  });

  it('sends an e-mail that already has an account to the sign-in form', async () => {
    inviteApi();
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Criar conta' }));
    await user.type(screen.getByLabelText('Nome'), 'Ana');
    await user.type(screen.getByLabelText('E-mail'), 'taken@example.com');
    await user.type(screen.getByLabelText('Senha'), 'Tr0ub4dor&3-quay');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Este e-mail já tem conta. Entre com ela.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('offers another account when the invitation is for another e-mail, keeping the token', async () => {
    const { accepted, calls } = inviteApi({ signedIn: true, answers: [403, 'ok'] });
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    expect(
      await screen.findByText(/Este convite foi enviado para outro e-mail/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair e entrar com outra conta' }));

    await waitFor(() => expect(calls.logout).toHaveLength(1));
    await signIn();
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(accepted).toEqual([URL_TOKEN, URL_TOKEN]);
  });

  it.each([
    [404, 'Convite não encontrado'],
    [400, 'Convite expirado ou já usado'],
    [409, 'Não foi possível aceitar'],
  ] as const)('explains a %i', async (status, title) => {
    inviteApi({ signedIn: true, answers: [status] });
    open();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Aceitar convite' }));

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('lets a member whose invitation conflicts go to the panel', async () => {
    inviteApi({ signedIn: true, answers: [409] });
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    await user.click(await screen.findByRole('button', { name: 'Ir para o painel' }));

    expect(navigation.router.replace).toHaveBeenCalledWith('/');
  });

  it('retries after too many attempts', async () => {
    const { accepted } = inviteApi({ signedIn: true, answers: [429, 'ok'] });
    open();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }));
    expect(await screen.findByText(/Muitas tentativas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/'));
    expect(accepted).toEqual([URL_TOKEN, URL_TOKEN]);
  });

  it('says the link is broken when it has no token', async () => {
    const { accepted } = inviteApi({ signedIn: true });
    window.history.replaceState(null, '', '/invitations/accept');
    renderWithSession(<AcceptInvitationPage />);

    expect(await screen.findByText('Link de convite inválido')).toBeInTheDocument();
    expect(accepted).toEqual([]);
  });

  it('keeps the other query parameters', async () => {
    inviteApi();
    window.history.replaceState(null, '', `/invitations/accept?token=${URL_TOKEN}&utm=mail`);
    renderWithSession(<AcceptInvitationPage />);

    await screen.findByText(/Entre com a conta do e-mail convidado/);
    expect(window.location.search).toBe('?utm=mail');
  });
});
