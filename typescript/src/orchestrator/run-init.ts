import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeConfig } from './config.ts';
import { type Language } from './languages.ts';
import { renderAttachedDialects, renderDialectsProps, setCargoDialectDeps } from './manifests.ts';
import { requireStatus, runCommand } from './run.ts';

const npmFlags = ['--no-audit', '--no-fund', '--loglevel=error'];

const npmCmd = (): string => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const initTypescript = async (root: string, dialects: string[]): Promise<void> => {
  const names = dialects.map((name) => `@deterministic-code/migraters-${name}`);
  const specs = dialects.map((name) => join(root, 'typescript', 'dialects', name));
  const cwd = process.cwd();
  const saveFlags = cwd === root || cwd === join(root, 'typescript') ? ['--no-save'] : [];
  if (specs.length > 0) {
    requireStatus(
      runCommand(npmCmd(), ['install', ...npmFlags, ...saveFlags, ...specs], { cwd }),
    );
  }
  const remove = ['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle']
    .map((name) => `@deterministic-code/migraters-${name}`)
    .filter((name) => !names.includes(name));
  if (remove.length > 0) {
    requireStatus(
      runCommand(npmCmd(), ['uninstall', ...npmFlags, ...saveFlags, ...remove], { cwd }),
    );
  }
  requireStatus(runCommand(npmCmd(), ['run', 'build'], { cwd: join(root, 'typescript') }));
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
  await writeConfig(root, language, dialects);
  process.stdout.write(`Enabled language: ${language}\n`);
  process.stdout.write(`Enabled dialects: ${dialects.join(', ')}\n`);
};
