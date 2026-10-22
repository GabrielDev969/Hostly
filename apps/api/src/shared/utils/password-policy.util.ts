export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  maxRepeatedChar: 3,
  minSequenceFlagged: 4,
  minSimilarSubstring: 4,
} as const;

const COMMON_PASSWORDS = new Set<string>([
  'password',
  'password1',
  'password123',
  'p@ssw0rd',
  'p@ssword123',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'iloveyou',
  'admin',
  'admin123',
  'administrator',
  'welcome',
  'welcome1',
  'letmein',
  'monkey',
  'dragon',
  'master',
  'sunshine',
  'changeme',
  'changeme123',
  'abc123',
  'football',
  'baseball',
  'superman',
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

export interface PasswordContext {
  email?: string;
  name?: string;
}

export function validatePasswordPolicy(password: string, context: PasswordContext = {}): string[] {
  const errors: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`);
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must be at most ${PASSWORD_POLICY.maxLength} characters`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  if (/\s/.test(password)) {
    errors.push('Password must not contain whitespace');
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common');
  }

  if (hasRepeatedRun(password, PASSWORD_POLICY.maxRepeatedChar)) {
    errors.push(
      `Password must not contain the same character more than ${PASSWORD_POLICY.maxRepeatedChar} times in a row`,
    );
  }

  if (hasSequence(password, PASSWORD_POLICY.minSequenceFlagged)) {
    errors.push('Password must not contain ascending, descending, or keyboard sequences');
  }

  if (matchesContext(password, context, PASSWORD_POLICY.minSimilarSubstring)) {
    errors.push('Password must not contain your name or email');
  }

  return errors;
}

function hasRepeatedRun(value: string, max: number): boolean {
  let count = 1;
  for (let i = 1; i < value.length; i++) {
    if (value[i] === value[i - 1]) {
      count++;
      if (count > max) return true;
    } else {
      count = 1;
    }
  }
  return false;
}

function hasSequence(value: string, minLen: number): boolean {
  const lower = value.toLowerCase();

  for (let i = 0; i <= lower.length - minLen; i++) {
    let asc = true;
    let desc = true;
    for (let j = 1; j < minLen; j++) {
      const diff = lower.charCodeAt(i + j) - lower.charCodeAt(i + j - 1);
      if (diff !== 1) asc = false;
      if (diff !== -1) desc = false;
    }
    if (asc || desc) return true;
  }

  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i <= row.length - minLen; i++) {
      const slice = row.substring(i, i + minLen);
      if (lower.includes(slice) || lower.includes(reverse(slice))) return true;
    }
  }

  return false;
}

function matchesContext(password: string, ctx: PasswordContext, minLen: number): boolean {
  const lower = password.toLowerCase();
  const tokens: string[] = [];

  if (ctx.email) {
    const local = ctx.email.split('@')[0]?.toLowerCase();
    if (local) tokens.push(local);
  }
  if (ctx.name) {
    for (const part of ctx.name.toLowerCase().split(/\s+/)) {
      if (part) tokens.push(part);
    }
  }

  return tokens.some((token) => token.length >= minLen && lower.includes(token));
}

function reverse(value: string): string {
  return value.split('').reverse().join('');
}
