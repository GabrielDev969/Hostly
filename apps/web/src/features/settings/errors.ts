import { describeLoadError } from '@/components/states';
import { ApiError } from '@/lib/api/errors';

// Why the API asks for each permission when a robot is paired again.
const PAIRING_REASONS: Record<string, string> = {
  'robot:revoke': 'o robô está ativo e perde o token',
  'robot:move': 'o local muda',
  'robot:update': 'o nome muda',
};

// The API's 403 names the permissions it wants ("Permission required: robot:pair", "Pairing this robot again
// requires robot:revoke (...)"). Only the keys are taken, never the English sentence around them.
export function permissionKeys(message: string): string[] {
  return [...new Set(message.match(/\b[a-z_]+:[a-z_]+\b/g) ?? [])];
}

// Shows what the API refused without hiding it: the missing keys, or its own message when it names none.
function describeForbidden(error: ApiError, reasons: Record<string, string> = {}): string {
  const keys = permissionKeys(error.message);
  if (keys.length === 0) return `A API recusou esta ação: ${error.message}`;
  const listed = keys.map((key) => (reasons[key] ? `${key} (${reasons[key]})` : key));
  return `Falta permissão: ${listed.join(', ')}.`;
}

export type PairingStep = 'lookup' | 'approve';

export function describePairingError(error: unknown, step: PairingStep): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return 'O código tem 6 números. Confira na tela de cima do robô.';
      case 403:
        return describeForbidden(error, PAIRING_REASONS);
      case 404:
        return step === 'lookup'
          ? 'Código não encontrado ou expirado. Confira na tela de cima do robô.'
          : 'O código expirou ou o local não existe mais. Gere um código novo no robô.';
      case 409:
        return 'Este robô é de outra operadora, ou este pedido já foi aprovado. Gere um código novo no robô.';
      case 429:
        return 'Tentativas demais. Espere alguns minutos e tente de novo.';
      case 503:
        return 'O pareamento está indisponível agora. Tente de novo em instantes.';
    }
  }
  return describeLoadError(error);
}

// After these, the code is spent or gone: the form starts over.
export function restartsPairing(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 409);
}

export type UserAction = 'invite' | 'role' | 'remove' | 'cancel-invite';

export function describeUserError(error: unknown, action: UserAction): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        if (action === 'role') return 'Este papel não cabe no escopo desta pessoa.';
        if (action === 'cancel-invite') return 'Este convite já foi aceito. Recarregamos a lista.';
        return 'Confira os dados e tente de novo.';
      case 403:
        return describeForbidden(error);
      case 404:
        if (action === 'invite') return 'O cliente não existe mais. Recarregamos a lista.';
        return 'Esta pessoa ou convite não existe mais. Recarregamos a lista.';
      case 409:
        return 'Essa pessoa já é membro ou já tem um convite pendente.';
    }
  }
  return describeLoadError(error);
}

// After these, what the screen shows is stale: reload it.
export function isStaleUserError(error: unknown, action: UserAction): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === 404 || (error.status === 400 && action === 'cancel-invite');
}
