export class UnknownPermissionsError extends Error {
  readonly missing: readonly string[];

  constructor(missing: string[]) {
    super(`Unknown permissions: ${missing.join(', ')}`);
    this.name = 'UnknownPermissionsError';
    this.missing = missing;
  }
}
