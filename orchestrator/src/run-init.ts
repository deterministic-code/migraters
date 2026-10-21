import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cliSpec } from './cli-spec.ts';
import { writeConfig } from './config.ts';
import { type Language } from './languages.ts';
import { renderAttachedDialects, renderDialectsProps, setCargoDialectDeps } from './manifests.ts';
import { requireStatus, runCommand } from './run.ts';

const npmFlags = ['--no-audit', '--no-fund', '--loglevel=error'];

const npmCmd = (): string => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const dialectPackage = (name: string): string => `@deterministic-code/migraters-${name}`;

const dialectRuntimeDeps = async (tsRoot: string, dialects: string[]): Promise<string[]> => {
  const names = new Set<string>();
  for (const dialect of dialects) {
    const raw = await readFile(join(tsRoot, 'dialects', dialect, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (!name.startsWith('@types/')) names.add(name);
    }
  }
  return [...names];
};

const initTypescript = async (root: string, dialects: string[]): Promise<void> => {
  const tsRoot = join(root, 'typescript');
  requireStatus(runCommand(npmCmd(), ['install', ...npmFlags], { cwd: tsRoot }));
  const specs = dialects.map((name) => join(tsRoot, 'dialects', name));
  if (specs.length > 0) {
    requireStatus(
      runCommand(npmCmd(), ['install', ...npmFlags, '--no-save', ...specs], { cwd: tsRoot }),
    );
  }
  const remove = cliSpec.providers
    .filter((name) => !dialects.includes(name))
    .map(dialectPackage);
  if (remove.length > 0) {
    requireStatus(
      runCommand(npmCmd(), ['uninstall', ...npmFlags, '--no-save', ...remove], { cwd: tsRoot }),
    );
  }
  const drivers = await dialectRuntimeDeps(tsRoot, dialects);
  if (drivers.length > 0) {
    requireStatus(
      runCommand(npmCmd(), ['install', ...npmFlags, '--no-save', ...drivers], { cwd: tsRoot }),
    );
  }
  requireStatus(runCommand(npmCmd(), ['run', 'build'], { cwd: tsRoot }));
};

const initCsharp = async (root: string, dialects: string[]): Promise<void> => {
  const propsPath = join(root, 'csharp', 'dialects.props');
  await writeFile(propsPath, renderDialectsProps(dialects));
  requireStatus(
    runCommand('dotnet', ['build', join(root, 'csharp', 'MigrateRunner.csproj')], { cwd: root }),
  );
};

const initRust = async (root: string, dialects: string[]): Promise<void> => {
  const cargoPath = join(root, 'rust', 'Cargo.toml');
  const raw = await readFile(cargoPath, 'utf8');
  await writeFile(cargoPath, setCargoDialectDeps(raw, dialects));
  await writeFile(
    join(root, 'rust', 'src', 'attached_dialects.rs'),
    renderAttachedDialects(dialects),
  );
  requireStatus(
    runCommand('cargo', ['build', '--manifest-path', join(root, 'rust', 'Cargo.toml')], {
      cwd: root,
      env: { ...process.env, CARGO_TARGET_DIR: join(root, 'rust', 'target') },
    }),
  );
};

export const runLanguageInit = async (
  root: string,
  language: Language,
  dialects: string[],
): Promise<void> => {
  if (language === 'typescript') await initTypescript(root, dialects);
  else if (language === 'csharp') await initCsharp(root, dialects);
  else await initRust(root, dialects);
  await writeConfig(process.cwd(), language, dialects);
  process.stdout.write(`Enabled language: ${language}\n`);
  process.stdout.write(`Enabled dialects: ${dialects.join(', ')}\n`);
};
