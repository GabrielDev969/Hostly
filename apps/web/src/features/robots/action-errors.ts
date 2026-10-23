import { describeLoadError } from '@/components/states';
import { ApiError } from '@/lib/api/errors';

// What an action on a robot tells the user when the API refuses it.
export function describeActionError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return 'Confira os dados e tente de novo.';
      case 403:
        return 'Você não tem permissão pra esta ação.';
      case 404:
        return 'Este robô (ou local) não existe mais ou saiu do seu acesso.';
      case 409:
        return 'O robô mudou enquanto você editava. Recarregamos os dados.';
    }
  }
  return describeLoadError(error);
}

// After these, what the screen shows is stale: reload it.
export function isStaleError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 409);
}
