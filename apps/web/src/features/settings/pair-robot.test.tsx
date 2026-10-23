import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { robotFixture, SITE_A } from '../../../test/robots';
import { CLIENT_A, WORKSPACE_ID } from '../../../test/fixtures';
import {
  CLIENT_INTERNAL,
  PAIRING_CODE,
  renderSettings,
  SITE_INTERNAL,
  type Reply,
} from '../../../test/settings';

type Options = Parameters<typeof renderSettings>[1];

async function renderPairing(
  options: Options = {},
  role: 'operator_admin' | 'operator_staff' = 'operator_admin',
) {
  const user = userEvent.setup();
  const rendered = renderSettings(role, options);
  const section = await screen.findByRole('region', { name: 'Parear robô' });
  // The client list arrives with the session; wait until it fills the select.
  await within(section).findByRole('option', { name: 'Shopping Alfa' });
  return { user, section, ...rendered };
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  section: HTMLElement,
  { code = PAIRING_CODE, client = 'Shopping Alfa', site = 'Alfa - Piso L1' } = {},
) {
  await user.type(within(section).getByLabelText('Código do robô'), code);
  await user.selectOptions(within(section).getByLabelText('Cliente'), client);
  await user.selectOptions(within(section).getByLabelText('Local'), site);
}

const replies = (key: 'lookup' | 'approve', ...list: Reply[]): Options => ({
  replies: { [key]: list },
});

describe('pairing a robot', () => {
  it('looks the code up, shows the serial, approves and reloads the robots', async () => {
    const { user, section, api, queryClient } = await renderPairing();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await fillForm(user, section);
    await user.click(within(section).getByRole('button', { name: 'Parear' }));

    const title = await within(section).findByRole('heading', { name: 'Confirme o robô' });
    expect(title).toHaveFocus();
    expect(within(section).getByText('LB-TEST-0001')).toBeVisible();
    expect(within(section).getByText('Shopping Alfa · Alfa - Piso L1')).toBeVisible();
    expect(within(section).queryByRole('alert')).not.toBeInTheDocument();

    await user.click(within(section).getByRole('button', { name: 'Confirmar pareamento' }));

    expect(
      await within(section).findByText(
        'Robô pareado com Shopping Alfa · Alfa - Piso L1. A marca e a programação chegam nele em instantes.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(api.calls.lookups).toEqual([{ code: PAIRING_CODE }]);
    expect(api.calls.approves).toEqual([{ code: PAIRING_CODE, siteId: SITE_A }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['robots', WORKSPACE_ID] });
    // Back to an empty form, focus on the code.
    await waitFor(() => expect(within(section).getByLabelText('Código do robô')).toHaveFocus());
    expect(within(section).getByLabelText('Código do robô')).toHaveValue('');
    // The code went in bodies only.
    expect(api.calls.urls.some((url) => url.includes(PAIRING_CODE))).toBe(false);
  });

  it('never calls the API with a code that is not six digits', async () => {
    const { user, section, api } = await renderPairing();

    await fillForm(user, section, { code: '12a 3-4' });
    expect(within(section).getByLabelText('Código do robô')).toHaveValue('1234');
    await user.click(within(section).getByRole('button', { name: 'Parear' }));

    expect(within(section).getByLabelText('Código do robô')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(within(section).getByLabelText('Código do robô')).toHaveAccessibleDescription(
      'O código tem 6 números. Confira na tela de cima do robô.',
    );
    expect(api.calls.lookups).toEqual([]);
  });

  it('starts with the client chosen in the shell', async () => {
    renderSettings('operator_admin', {}, `/settings?client=${CLIENT_A}`);
    const section = await screen.findByRole('region', { name: 'Parear robô' });

    await waitFor(() => expect(within(section).getByLabelText('Cliente')).toHaveValue(CLIENT_A));
    expect(within(section).getByLabelText('Local')).toBeEnabled();
  });

  it('lists the internal client and only the chosen client’s sites', async () => {
    const { user, section } = await renderPairing();
    const site = within(section).getByLabelText('Local');

    expect(site).toBeDisabled();
    await user.selectOptions(within(section).getByLabelText('Cliente'), 'Robôs próprios');
    expect(
      within(site)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha o local', 'Galpão']);
    await user.selectOptions(site, 'Galpão');
    expect(site).toHaveValue(SITE_INTERNAL);

    // Another client clears the site.
    await user.selectOptions(within(section).getByLabelText('Cliente'), 'Shopping Alfa');
    expect(site).toHaveValue('');
    expect(
      within(site)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Escolha o local', 'Alfa - Piso L1']);
    expect(within(section).getByLabelText('Cliente')).not.toHaveValue(CLIENT_INTERNAL);
  });

  it('warns that pairing an existing robot again replaces its token and may move it', async () => {
    const { user, section } = await renderPairing({
      existingRobot: robotFixture({ name: 'Robô Alfa', clientId: CLIENT_A, siteId: SITE_A }),
    });

    await fillForm(user, section);
    await user.click(within(section).getByRole('button', { name: 'Parear' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Este robô já está cadastrado como Robô Alfa (Shopping Alfa · Alfa - Piso L1). Parear de novo troca o token dele e pode mudar o local.',
    );
  });

  it('goes back to the form, keeping the code, client and site', async () => {
    const { user, section } = await renderPairing();

    await fillForm(user, section);
    await user.click(within(section).getByRole('button', { name: 'Parear' }));
    await user.click(await within(section).findByRole('button', { name: 'Voltar' }));

    await waitFor(() => expect(within(section).getByLabelText('Código do robô')).toHaveFocus());
    expect(within(section).getByLabelText('Código do robô')).toHaveValue(PAIRING_CODE);
    expect(within(section).getByLabelText('Local')).toHaveValue(SITE_A);
  });

  it('shows the permissions a 403 says are missing', async () => {
    const { user, section } = await renderPairing(
      replies('approve', {
        status: 403,
        message:
          'Pairing this robot again requires robot:revoke (it is active and loses its token), robot:move (the site changes)',
      }),
      'operator_staff',
    );

    await fillForm(user, section);
    await user.click(within(section).getByRole('button', { name: 'Parear' }));
    await user.click(await within(section).findByRole('button', { name: 'Confirmar pareamento' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Falta permissão: robot:revoke (o robô está ativo e perde o token), robot:move (o local muda).',
    );
    // Still on the confirmation: going back is the user's choice.
    expect(within(section).getByRole('button', { name: 'Voltar' })).toBeVisible();
  });

  it('starts over on a 409 from the approval', async () => {
    const { user, section } = await renderPairing(
      replies('approve', { status: 409, message: 'This pairing was already approved' }),
    );

    await fillForm(user, section);
    await user.click(within(section).getByRole('button', { name: 'Parear' }));
    await user.click(await within(section).findByRole('button', { name: 'Confirmar pareamento' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(
      'Este robô é de outra operadora, ou este pedido já foi aprovado. Gere um código novo no robô.',
    );
    expect(within(section).getByLabelText('Código do robô')).toHaveValue('');
  });

  it.each([
    [404, 'Código não encontrado ou expirado. Confira na tela de cima do robô.'],
    [429, 'Tentativas demais. Espere alguns minutos e tente de novo.'],
    [403, 'Falta permissão: robot:pair.'],
  ])('shows the lookup %i', async (status, message) => {
    const { user, section } = await renderPairing(
      replies('lookup', { status, message: 'Permission required: robot:pair' }),
    );

    await fillForm(user, section);
    await user.click(within(section).getByRole('button', { name: 'Parear' }));

    expect(await within(section).findByRole('alert')).toHaveTextContent(message);
    expect(
      within(section).queryByRole('heading', { name: 'Confirme o robô' }),
    ).not.toBeInTheDocument();
  });
});
