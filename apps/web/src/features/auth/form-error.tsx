import { ApiError } from '@/lib/api/errors';
import styles from './login.module.css';

export const TOO_MANY_ATTEMPTS = 'Muitas tentativas. Aguarde um pouco e tente de novo.';

export interface FormFailure {
  message: string;
  // The rules the API refused, as it wrote them: the panel does not keep its own copy of them.
  details: string[];
}

// A broken password policy comes as one entry joined with "; " (is-strong-password.decorator.ts).
export function refusedRules(error: unknown): string[] {
  if (!(error instanceof ApiError)) return [];
  return error.details.flatMap((detail) => detail.split('; ')).filter(Boolean);
}

export function FormError({ id, failure }: { id: string; failure: FormFailure }) {
  return (
    <div className={styles.error} id={id} role="alert">
      <p className={styles.errorText}>{failure.message}</p>
      {failure.details.length > 0 && (
        <ul className={styles.errorList}>
          {failure.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
