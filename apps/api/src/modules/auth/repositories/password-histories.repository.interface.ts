export abstract class PasswordHistoriesRepository {
  abstract findRecentHashes(userId: string, limit: number): Promise<string[]>;
  abstract record(userId: string, passwordHash: string, retain: number): Promise<void>;
}
