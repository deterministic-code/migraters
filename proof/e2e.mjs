#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGUAGES = ['typescript', 'rust', 'csharp'];
const DIALECTS = ['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle'];

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const parseList = (argv, flag) => {
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === flag) {
      const value = argv[++i];
      if (!value) fail(`${flag} needs a value`);
      values.push(value);
      continue;
    }
    if (arg.startsWith(`${flag}=`)) {
      values.push(arg.slice(flag.length + 1));
    }
  }
  return values;
};

const argv = process.argv.slice(2);
const selectedLanguages = parseList(argv, '--language');
const selectedDialects = parseList(argv, '--dialect');
for (const language of selectedLanguages) {
  if (!LANGUAGES.includes(language)) fail(`unknown language: ${language}`);
}
for (const dialect of selectedDialects) {
  if (!DIALECTS.includes(dialect)) fail(`unknown dialect: ${dialect}`);
}

const languages = selectedLanguages.length > 0 ? selectedLanguages : LANGUAGES;
const dialects = selectedDialects.length > 0 ? selectedDialects : DIALECTS;
const unfiltered = selectedLanguages.length === 0 && selectedDialects.length === 0;
const dockerServices = dialects.filter((name) => name !== 'sqlite');

const run = (cmd, args, extra = {}) => {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: extra.env ?? process.env,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
};

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

run(npmCmd, ['run', 'prepare']);

if (dockerServices.length > 0) {
  run('docker', [
    'compose',
    '-f',
    'proof/docker-compose.yml',
    'up',
    '-d',
    '--wait',
    ...dockerServices,
  ]);
}

rmSync(join(root, 'sql'), { recursive: true, force: true });
cpSync(join(root, 'proof', 'sql'), join(root, 'sql'), { recursive: true });

const bindir = join(root, '.e2e-bin');
mkdirSync(bindir, { recursive: true });
for (const cmd of ['migrate-init', 'migrate-setup', 'migrate-up', 'migrate-down', 'migrate-create']) {
  const target = join(root, 'orchestrator', 'dist', `${cmd}.js`);
  const link = join(bindir, cmd);
  try {
    rmSync(link, { force: true });
  } catch {
    // replace existing link
  }
  symlinkSync(target, link);
  chmodSync(target, 0o755);
}

const instant = join(root, 'proof', '.instantclient');
const env = { ...process.env, PATH: `${bindir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` };
if (dialects.includes('oracle')) {
  run('bash', ['proof/ensure-instant-client.sh']);
  if (existsSync(instant)) {
    env.ORACLE_CLIENT_LIB_DIR = instant;
    if (process.platform === 'darwin') {
      env.DYLD_LIBRARY_PATH = env.DYLD_LIBRARY_PATH ? `${instant}:${env.DYLD_LIBRARY_PATH}` : instant;
    } else {
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${instant}:${env.LD_LIBRARY_PATH}` : instant;
    }
  }
}

if (languages.includes('typescript')) {
  run(npmCmd, ['ci', '--prefix', 'typescript'], { env });
}

const initArgs = (language) => {
  const args = [join(root, 'orchestrator', 'dist', 'migrate-init.js'), '--language', language];
  if (dialects.length === DIALECTS.length) args.push('--all');
  else {
    for (const dialect of dialects) args.push('--dialect', dialect);
  }
  return args;
};

if (unfiltered) {
  run('bash', ['proof/e2e-consumer.sh'], { env });
}

for (const language of languages) {
  run(process.execPath, initArgs(language), { env });
  rmSync(join(root, 'app.sqlite'), { force: true });
  for (const dialect of dialects) {
    run('bash', [`proof/e2e-${dialect}.sh`], { env });
  }
}

if (unfiltered) {
  run(process.execPath, initArgs('typescript'), { env });
  if (!existsSync(join(root, '.migraters.yaml'))) {
    fail('expected .migraters.yaml after migrate-init');
  }
  run(npmCmd, [
    '--prefix',
    'typescript',
    'exec',
    'vitest',
    'run',
    'test/cli-parity.e2e.test.ts',
    'test/readme-install.test.ts',
  ], { env });
}
