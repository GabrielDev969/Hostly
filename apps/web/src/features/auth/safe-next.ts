export const HOME_PATH = '/';

// Where to go after signing in. Only a same-origin path is accepted: "//host" and "/\host" are
// read by browsers as another origin, and control characters (tab, newline) are stripped by URL
// parsing, which would turn "/\t/host" into "//host".
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\'))
    return HOME_PATH;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return HOME_PATH;
  return raw;
}
