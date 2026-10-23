// Pages opened from an e-mail link with a one-time token in the query string. No Referer leaves them,
// so the token cannot leak to whatever the page loads or links to before it clears the address bar.
export const TOKEN_PAGES = ['/invitations/accept', '/auth/verify-email', '/auth/reset-password'];

export function tokenPageHeaders() {
  return TOKEN_PAGES.map((source) => ({
    source,
    headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
  }));
}

// next dev prints each request with its query string; these lines would print the token.
export const tokenRequestLogPatterns = TOKEN_PAGES.map(
  (page) => new RegExp(`^${page}\\?(?:.*&)?token=`),
);
