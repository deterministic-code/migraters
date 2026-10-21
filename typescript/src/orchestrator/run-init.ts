import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSelectedPackages } from '../init-select.ts';
import { writeConfig } from './config.ts';
import { type Language } from './languages.ts';
import { renderDialectsProps, setCargoDefaultFeatures } from './manifests.ts';
import { requireStatus, runCommand } from './run.ts';

const npmFlags = ['--no-audit', '--no-fund', '--loglevel=error'];

const npmCmd = (): string => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const initTypescript = async (root: string, dialects: string[]): Promise<void> => {
  const selected = await loadSelectedPackages(dialects, 'typescript');
  const specs = selected.packages.map((p) => p.name);
  if (specs.length > 0) {
    requireStatus(runCommand(npmCmd(), ['install', ...npmFlags, ...specs], { cwd: process.cwd() }));
  }
  const remove = selected.allDriverPackages.filter(
    (name) => !selected.packages.some((p) => p.name === name),
  );
  if (remove.length > 0) {
    requireStatus(runCommand(npmCmd(), ['uninstall', ...npmFlags, ...remove], { cwd: process.cwd() }));
  }
  requireStatus(runCommand(npmCmd(), ['run', 'build'], { cwd: join(root, 'typescript') }));
};

const initCsharp = async (root: string, dialects: string[]): Promise<void> => {
  const selected = await loadSelectedPackages(dialects, 'csharp');
  const propsPath = join(root, 'csharp', 'dialects.props');
  await writeFile(propsPath, renderDialectsProps(selected.names, selected.packages));
  requireStatus(
    runCommand('dotnet', ['build', join(root, 'csharp', 'MigrateRunner.csproj')], { cwd: root }),
  );
};

const initRust = async (root: string, dialects: string[]): Promise<void> => {
  const cargoPath = join(root, 'rust', 'Cargo.toml');
  const raw = await readFile(cargoPath, 'utf8');
  await writeFile(cargoPath, setCargoDefaultFeatures(raw, dialects));
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
