import { describeLoadError } from '@/components/states';
import { describeForbidden } from '@/features/settings/errors';
import { ApiError } from '@/lib/api/errors';

export type FormKind = 'client' | 'site';

// A 400 shows what the API said, untranslated: the panel does not guess the rule (time zone, limits).
export function describeFormError(error: unknown, kind: FormKind): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.details.length > 0 ? error.details.join('; ') : error.message;
      case 403:
        return describeForbidden(error);
      case 404:
        return kind === 'client'
          ? 'Este cliente não existe mais. Recarregamos a lista.'
          : 'Este local ou o cliente dele não existe mais. Recarregamos a lista.';
    }
  }
  return describeLoadError(error);
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
