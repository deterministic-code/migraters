#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const orch = dirname(fileURLToPath(import.meta.url));
const src = join(orch, 'src', 'migrate-init.ts');
const built = join(orch, 'dist', 'migrate-init.js');
if (!existsSync(src)) {
  if (!existsSync(built)) {
    process.stderr.write('orchestrator dist is missing; this install cannot run migrate-init\n');
    process.exit(1);
  }
  process.exit(0);
}
const result = spawnSync('npx', ['tsc', '-p', join(orch, 'tsconfig.json')], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
