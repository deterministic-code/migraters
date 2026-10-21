#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const orch = dirname(fileURLToPath(import.meta.url));
const root = join(orch, '..');
const src = join(orch, 'src', 'migrate-init.ts');
const built = join(orch, 'dist', 'migrate-init.js');
if (!existsSync(src)) {
  if (!existsSync(built)) {
    process.stderr.write('orchestrator dist is missing; this install cannot run migrate-init\n');
    process.exit(1);
  }
  process.exit(0);
}
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
if (!existsSync(tsc)) {
  process.stderr.write('typescript is not installed; run npm ci at the repo root\n');
  process.exit(1);
}
const result = spawnSync(process.execPath, [tsc, '-p', join(orch, 'tsconfig.json')], {
  stdio: 'inherit',
});
if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}
const gitDir = join(root, '.git');
const hooks = join(root, '.githooks');
if (existsSync(src) && existsSync(gitDir) && existsSync(hooks)) {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
}
process.exit(0);
