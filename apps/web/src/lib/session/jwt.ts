// Reads claims of an access token only to compare tokens across tabs; the API is what verifies them.
function claimsOf(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof claims === 'object' && claims !== null
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function subjectOf(token: string): string | null {
  const sub = claimsOf(token)?.sub;
  return typeof sub === 'string' ? sub : null;
}

export function issuedAt(token: string): number | null {
  const iat = claimsOf(token)?.iat;
  return typeof iat === 'number' ? iat : null;
}
