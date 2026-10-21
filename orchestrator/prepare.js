#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const orch = dirname(fileURLToPath(import.meta.url));
const src = join(orch, 'src', 'migrate-init.ts');
if (!existsSync(src)) process.exit(0);
const result = spawnSync('npx', ['tsc', '-p', join(orch, 'tsconfig.json')], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
