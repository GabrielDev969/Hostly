import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderSettings } from '../../../test/settings';

const heading = (name: string) => screen.queryByRole('heading', { level: 2, name });

describe('settings blocks by permission', () => {
  it('shows every block and action to an operator admin', async () => {
    renderSettings('operator_admin');

    expect(await screen.findByRole('heading', { level: 2, name: 'Parear robô' })).toBeVisible();
    expect(heading('Usuários')).toBeVisible();
    expect(heading('O que cada papel pode')).toBeVisible();
    expect(heading('Padrões da operadora')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Convidar' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Remover Bruno Equipe' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Trocar papel de Bruno Equipe' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Convites pendentes' })).toBeVisible();
  });

  it('shows the staff pairing, users and roles, but no user management or defaults', async () => {
    renderSettings('operator_staff');

    expect(await screen.findByRole('heading', { level: 2, name: 'Parear robô' })).toBeVisible();
    expect(heading('Usuários')).toBeVisible();
    expect(heading('O que cada papel pode')).toBeVisible();
    expect(heading('Padrões da operadora')).not.toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Bruno Equipe/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Convidar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Trocar papel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Convites pendentes' })).not.toBeInTheDocument();
  });

  it('shows a client user no access, even opening the URL', async () => {
    renderSettings('client_admin');

    expect(await screen.findByText('Sem acesso a esta página')).toBeVisible();
    expect(heading('Parear robô')).not.toBeInTheDocument();
    expect(heading('Usuários')).not.toBeInTheDocument();
  });

  it('shows only the blocks whose permission the membership holds', async () => {
    renderSettings('operator_staff', {
      permissions: ['robot:pair', 'client:read', 'site:read', 'workspace:read'],
    });

    expect(await screen.findByRole('heading', { level: 2, name: 'Parear robô' })).toBeVisible();
    expect(heading('Usuários')).not.toBeInTheDocument();
    expect(heading('O que cada papel pode')).not.toBeInTheDocument();
    expect(heading('Padrões da operadora')).not.toBeInTheDocument();
  });

  it('shows the fixed role table and the defaults as coming soon', async () => {
    renderSettings('operator_admin');

    const table = await screen.findByRole('table', { name: 'O que cada papel pode' });
    expect(within(table).getByRole('row', { name: /Mandar comandos/ }).textContent).toBe(
      'Mandar comandosSimFalar e trocar modoNão',
    );
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    const defaults = screen.getByRole('region', { name: 'Padrões da operadora' });
    expect(within(defaults).getAllByText(/^Em breve/)).toHaveLength(3);
    expect(within(defaults).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
