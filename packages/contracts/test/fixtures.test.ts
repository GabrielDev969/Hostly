import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  cloudToRobotMessageSchema,
  contractSchemas,
  robotToCloudMessageSchema,
  type ContractName,
} from '../src/index.ts';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures');
// Unions are covered by the fixtures of each message they join.
const unions = new Set<ContractName>(['ws.robot-to-cloud', 'ws.cloud-to-robot']);

function readFixtures(name: string, kind: 'valid' | 'invalid'): [string, unknown][] {
  const dir = join(fixturesDir, name, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => [file, JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown]);
}

describe('fixtures', () => {
  it('has a schema for every fixture folder', () => {
    for (const name of readdirSync(fixturesDir)) {
      assert.ok(name in contractSchemas, `fixtures/${name} has no schema in contractSchemas`);
    }
  });

  for (const [name, schema] of Object.entries(contractSchemas)) {
    if (unions.has(name as ContractName)) continue;

    describe(name, () => {
      const valid = readFixtures(name, 'valid');
      const invalid = readFixtures(name, 'invalid');

      it('has valid and invalid fixtures', () => {
        assert.ok(valid.length > 0, `fixtures/${name}/valid is empty`);
        assert.ok(invalid.length > 0, `fixtures/${name}/invalid is empty`);
      });

      for (const [file, data] of valid) {
        it(`accepts valid/${file}`, () => {
          const result = schema.safeParse(data);
          assert.ok(result.success, JSON.stringify(result.error?.issues));
        });
      }

      for (const [file, data] of invalid) {
        it(`rejects invalid/${file}`, () => {
          assert.equal(schema.safeParse(data).success, false);
        });
      }
    });
  }

  it('accepts every valid robot message in the robot-to-cloud union', () => {
    for (const name of ['ws.hello', 'ws.telemetry', 'ws.ping', 'ws.pong']) {
      for (const [file, data] of readFixtures(name, 'valid')) {
        assert.ok(robotToCloudMessageSchema.safeParse(data).success, `${name}/valid/${file}`);
      }
    }
  });

  it('accepts every valid cloud message in the cloud-to-robot union', () => {
    for (const name of ['ws.ping', 'ws.pong']) {
      for (const [file, data] of readFixtures(name, 'valid')) {
        assert.ok(cloudToRobotMessageSchema.safeParse(data).success, `${name}/valid/${file}`);
      }
    }
  });
});
