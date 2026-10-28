import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { importableProviderFile, resolveProviderFile } from './resolve-provider.ts';

const location = 'typescript/providers/sqlite/src/index.ts';

const tempLayout = async (): Promise<{
  packageRoot: string;
  consumer: string;
  providerFile: string;
  moduleUrl: string;
}> => {
  const packageRoot = await mkdtemp(join(tmpdir(), 'migraters-pkg-'));
  const consumer = await mkdtemp(join(tmpdir(), 'migraters-app-'));
  const providerFile = join(packageRoot, location);
  await mkdir(join(packageRoot, 'typescript', 'providers', 'sqlite', 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'typescript', 'dist', 'providers', 'sqlite', 'src'), {
    recursive: true,
  });
  await writeFile(providerFile, 'export {}\n');
  await writeFile(
    join(packageRoot, 'typescript', 'dist', 'providers', 'sqlite', 'src', 'index.js'),
    'export {}\n',
  );
  const moduleUrl = pathToFileURL(
    join(packageRoot, 'typescript', 'dist', 'src', 'infrastructure', 'default-factory.js'),
  ).href;
  return { packageRoot, consumer, providerFile, moduleUrl };
};

describe('resolveProviderFile', () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('resolves a consumer location to the file under the installed package', async () => {
    const { packageRoot, consumer, providerFile, moduleUrl } = await tempLayout();
    dirs.push(packageRoot, consumer);
    expect(resolveProviderFile(consumer, location, moduleUrl)).toBe(providerFile);
  });

  it('prefers the path next to config before the installed package', async () => {
    const { packageRoot, consumer, moduleUrl } = await tempLayout();
    dirs.push(packageRoot, consumer);
    const local = join(consumer, location);
    await mkdir(dirname(local), { recursive: true });
    await writeFile(local, 'export {}\n');
    expect(resolveProviderFile(consumer, location, moduleUrl)).toBe(local);
  });

  it('uses the typescript/ prefix strip under configDir before the package root', async () => {
    const { packageRoot, consumer, moduleUrl } = await tempLayout();
    dirs.push(packageRoot, consumer);
    const stripped = join(consumer, 'providers', 'sqlite', 'src', 'index.ts');
    await mkdir(dirname(stripped), { recursive: true });
    await writeFile(stripped, 'export {}\n');
    expect(resolveProviderFile(consumer, location, moduleUrl)).toBe(stripped);
  });

  it('imports compiled JavaScript when the provider source is under node_modules', async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), 'migraters-nm-'));
    dirs.push(packageRoot);
    const root = join(packageRoot, 'node_modules', '@deterministic-code', 'migraters');
    const source = join(root, location);
    const compiled = join(root, 'typescript', 'dist', 'providers', 'sqlite', 'src', 'index.js');
    await mkdir(dirname(source), { recursive: true });
    await mkdir(dirname(compiled), { recursive: true });
    await writeFile(source, 'export {}\n');
    await writeFile(compiled, 'export {}\n');
    expect(importableProviderFile(source)).toBe(compiled);
    expect(importableProviderFile(join(packageRoot, location))).toBe(join(packageRoot, location));
  });

  it('throws when the provider file is missing', async () => {
    const packageRoot = await mkdtemp(join(tmpdir(), 'migraters-pkg-'));
    const consumer = await mkdtemp(join(tmpdir(), 'migraters-app-'));
    dirs.push(packageRoot, consumer);
    await mkdir(join(packageRoot, 'typescript', 'providers'), { recursive: true });
    const moduleUrl = pathToFileURL(
      join(packageRoot, 'typescript', 'dist', 'src', 'infrastructure', 'default-factory.js'),
    ).href;
    expect(() => resolveProviderFile(consumer, location, moduleUrl)).toThrow(
      `provider module not found: ${location}`,
    );
  });
});
