import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CLIENT_A } from '../../../test/fixtures';
import { INVITATION_TOKEN, renderSettings } from '../../../test/settings';

type Options = Parameters<typeof renderSettings>[1];

async function renderUsers(options: Options = {}) {
  const user = userEvent.setup();
  const rendered = renderSettings('operator_admin', options);
  const section = await screen.findByRole('region', { name: 'Usuários' });
  const table = await within(section).findByRole('table', { name: 'Usuários' });
  // Actions show once the owner is known.
  await within(table).findByRole('button', { name: 'Remover Bruno Equipe' });
  return { user, section, table, ...rendered };
}

const cells = (row: HTMLElement) =>
  [within(row).getByRole('rowheader'), ...within(row).getAllByRole('cell')].map(
    (cell) => cell.textContent,
  );

describe('users table', () => {
  it('shows each person with the role in Portuguese and what they see', async () => {
    const { table } = await renderUsers();

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => cells(row).slice(0, 3))).toEqual([
      ['Otávio Donootavio@example.com', 'Admin da operadora', 'Tudo'],
      ['Ana Souzaana@example.com', 'Admin da operadora', 'Tudo'],
      ['Bruno Equipebruno@example.com', 'Equipe da operadora', 'Tudo'],
      ['Carla Clientecarla@example.com', 'Admin do cliente', 'Shopping Alfa'],
      ['Davi Anunciantedavi@example.com', 'Anunciante', 'anunciante no Shopping Alfa'],
    ]);
  });

  it('offers no action on the owner nor on the signed-in user, and no role switch to an advertiser', async () => {
    const { table } = await renderUsers();

    const row = (name: string) => within(table).getByRole('row', { name: new RegExp(name) });
    expect(within(row('Otávio Dono')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Ana Souza')).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(row('Davi Anunciante'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Remover']);
  });
});

describe('inviting', () => {
  it('invites an operator member without a client and never shows the token', async () => {
    const { user, section, api } = await renderUsers();

    await user.click(within(section).getByRole('button', { name: 'Convidar' }));
    const dialog = screen.getByRole('dialog', { name: 'Convidar pessoa' });
    expect(within(dialog).getByLabelText('E-mail')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('E-mail'), 'nova@example.com');
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'Equipe da operadora');
    expect(within(dialog).queryByLabelText('Cliente')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    expect(await screen.findByText('Convite enviado para nova@example.com.')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls.invites).toEqual([
      { email: 'nova@example.com', roleId: 'role-operator_staff' },
    ]);
    expect(await within(section).findByRole('row', { name: /nova@example.com/ })).toBeVisible();
    expect(document.body.textContent).not.toContain(INVITATION_TOKEN);
  });

  it('asks for a client with a client role, without the internal one', async () => {
    const { user, section, api } = await renderUsers();

    await user.click(within(section).getByRole('button', { name: 'Convidar' }));
    const dialog = screen.getByRole('dialog', { name: 'Convidar pessoa' });
    await user.type(within(dialog).getByLabelText('E-mail'), 'cli@example.com');
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'Editor do cliente');
    const client = within(dialog).getByLabelText('Cliente');
    expect(
      within(client)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha o cliente', 'Shopping Alfa', 'Shopping Beta']);
    expect(within(dialog).getByLabelText('Papel')).not.toHaveTextContent('Anunciante');

    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    expect(within(dialog).getByText('Escolha o cliente.')).toBeVisible();
    expect(api.calls.invites).toEqual([]);

    await user.selectOptions(client, 'Shopping Alfa');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() =>
      expect(api.calls.invites).toEqual([
        { email: 'cli@example.com', roleId: 'role-client_editor', clientId: CLIENT_A },
      ]),
    );
  });

  it('shows the 409 inside the dialog', async () => {
    const { user, section } = await renderUsers({
      replies: { invite: [{ status: 409, message: 'User is already a member of this workspace' }] },
    });

    await user.click(within(section).getByRole('button', { name: 'Convidar' }));
    const dialog = screen.getByRole('dialog', { name: 'Convidar pessoa' });
    await user.type(within(dialog).getByLabelText('E-mail'), 'bruno@example.com');
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'Admin da operadora');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Essa pessoa já é membro ou já tem um convite pendente.',
    );
  });
});

describe('changing a role', () => {
  it('offers only the roles of the member’s scope and sends the change', async () => {
    const { user, table, api } = await renderUsers();

    await user.click(within(table).getByRole('button', { name: 'Trocar papel de Carla Cliente' }));
    const dialog = screen.getByRole('dialog', { name: 'Trocar papel de Carla Cliente' });
    const select = within(dialog).getByLabelText('Papel');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Admin do cliente', 'Editor do cliente']);
    await user.selectOptions(select, 'Editor do cliente');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Papel de Carla Cliente trocado.')).toBeVisible();
    expect(api.calls.roleChanges).toEqual([
      { memberId: 'm-client', body: { roleId: 'role-client_editor' } },
    ]);
    await waitFor(() =>
      expect(cells(within(table).getByRole('row', { name: /Carla Cliente/ }))[1]).toBe(
        'Editor do cliente',
      ),
    );
  });

  it('shows a 400 from the API inside the dialog', async () => {
    const { user, table } = await renderUsers({
      replies: { role: [{ status: 400, message: 'Role does not fit' }] },
    });

    await user.click(within(table).getByRole('button', { name: 'Trocar papel de Bruno Equipe' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Papel'), 'Admin da operadora');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Este papel não cabe no escopo desta pessoa.',
    );
  });
});

describe('removing a member', () => {
  it('asks in a dialog; Esc and Cancelar call nothing', async () => {
    const { user, table, api } = await renderUsers();
    const remove = within(table).getByRole('button', { name: 'Remover Bruno Equipe' });

    await user.click(remove);
    const dialog = screen.getByRole('dialog', { name: 'Remover Bruno Equipe?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(remove).toHaveFocus();

    await user.click(remove);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls.removals).toEqual([]);
  });

  it('removes on confirmation and reloads the list', async () => {
    const { user, table, api } = await renderUsers();

    await user.click(within(table).getByRole('button', { name: 'Remover Bruno Equipe' }));
    const dialog = screen.getByRole('dialog', { name: 'Remover Bruno Equipe?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    expect(await screen.findByText('Bruno Equipe foi removido.')).toBeVisible();
    expect(api.calls.removals).toEqual(['m-staff']);
    await waitFor(() =>
      expect(within(table).queryByRole('row', { name: /Bruno Equipe/ })).not.toBeInTheDocument(),
    );
  });

  it('shows a 403 inside the dialog', async () => {
    const { user, table } = await renderUsers({
      replies: { remove: [{ status: 403, message: 'Missing permission to remove members' }] },
    });

    await user.click(within(table).getByRole('button', { name: 'Remover Bruno Equipe' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A API recusou esta ação: Missing permission to remove members',
    );
  });
});

describe('pending invitations', () => {
  it('lists the open ones, marks the expired, and cancels through a dialog', async () => {
    const { user, section, api } = await renderUsers();

    const table = await within(section).findByRole('table', { name: 'Convites pendentes' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => cells(row).slice(0, 4))).toEqual([
      ['eva@example.com', 'Editor do cliente', 'Shopping Beta', expect.stringMatching(/2099/)],
      ['fabio@example.com', 'Equipe da operadora', 'Tudo', 'Expirado'],
    ]);

    await user.click(
      within(table).getByRole('button', { name: 'Cancelar o convite de eva@example.com' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Cancelar o convite de eva@example.com?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar convite' }));

    expect(await screen.findByText('Convite para eva@example.com cancelado.')).toBeVisible();
    expect(api.calls.cancellations).toEqual(['inv-1']);
    await waitFor(() =>
      expect(within(table).queryByRole('row', { name: /eva@example.com/ })).not.toBeInTheDocument(),
    );
  });
});
