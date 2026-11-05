#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tsRoot = process.cwd();
const scopeDir = join(tsRoot, 'node_modules', '@deterministic-code');
mkdirSync(scopeDir, { recursive: true });
const type = process.platform === 'win32' ? 'junction' : 'dir';

for (const name of readdirSync(join(tsRoot, 'providers'))) {
  const compiled = join(tsRoot, 'dist', 'providers', name, 'src', 'index.js');
  if (!existsSync(compiled)) continue;
  writeFileSync(
    join(tsRoot, 'dist', 'providers', name, 'package.json'),
    `${JSON.stringify({
      name: `@deterministic-code/migraters-${name}`,
      type: 'module',
      exports: { '.': './src/index.js' },
    })}\n`,
  );
  const dest = join(scopeDir, `migraters-${name}`);
  rmSync(dest, { recursive: true, force: true });
  symlinkSync(join('..', '..', 'dist', 'providers', name), dest, type);
}
