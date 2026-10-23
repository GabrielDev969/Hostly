import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { CONTRACT_VERSION, contractSchemas, type ContractName } from '@hostly/contracts';

// The API validates the same fixtures as the contracts package, proving both use the same schemas.
const fixturesDir = join(__dirname, '../../../../../packages/contracts/fixtures');

function readFixtures(name: string, kind: 'valid' | 'invalid'): [string, unknown][] {
  const dir = join(fixturesDir, name, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => [file, JSON.parse(readFileSync(join(dir, file), 'utf8'))]);
}

describe('@hostly/contracts fixtures', () => {
  const names = readdirSync(fixturesDir) as ContractName[];

  it('covers every message of this phase', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'pair-start.request',
        'pair-start.response',
        'pair-poll.request',
        'pair-poll.response',
        'map-points.request',
        'map-points.response',
        'ws.hello',
        'ws.telemetry',
        'ws.ping',
        'ws.pong',
      ]),
    );
  });

  describe.each(names)('%s', (name) => {
    const schema = contractSchemas[name];

    it.each(readFixtures(name, 'valid'))('accepts valid/%s', (_file, data) => {
      expect(schema.safeParse(data).error?.issues).toBeUndefined();
    });

    it.each(readFixtures(name, 'invalid'))('rejects invalid/%s', (_file, data) => {
      expect(schema.safeParse(data).success).toBe(false);
    });
  });

  it('exports the contract version sent in hello', () => {
    const [, hello] = readFixtures('ws.hello', 'valid').find(([file]) => file === 'hello.json')!;
    expect(hello).toMatchObject({ payload: { contractVersion: CONTRACT_VERSION } });
  });
});
