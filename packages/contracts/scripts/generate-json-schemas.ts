import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { contractSchemas } from '../src/index.ts';

// Writes schemas/<name>.json from the Zod schemas; the files are committed so the Android app reads them without Node.
const outDir = join(import.meta.dirname, '..', 'schemas');
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir)) {
  if (file.endsWith('.json')) rmSync(join(outDir, file));
}

for (const [name, schema] of Object.entries(contractSchemas)) {
  // "input" leaves out additionalProperties: false, so unknown fields are ignored like in Zod.
  const { $schema, ...rest } = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  const jsonSchema = { $schema, title: name, ...rest };
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(jsonSchema, null, 2)}\n`);
}
