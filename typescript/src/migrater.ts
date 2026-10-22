import { mkdir, readdir, writeFile } from 'node:fs/promises';
import type {
  CreateArg,
  CreateResponse,
  DownArg,
  IMigrater,
  SetupArg,
  UpArg,
} from './abstractions/migrater.ts';
import type { IDatasourceProvider } from './abstractions/datasource-provider.ts';
import { isMigrationName, nextSequence, pad4 } from './create-sequence.ts';
import { applyOneDown, applyOneUp, discoverMigrations } from './datasource-migrate.ts';
import { defaultDialectFactory } from './infrastructure/default-factory.ts';
import { fillTemplate, loadMessage, loadScaffold } from './infrastructure/message-templates.ts';

const invalidNameTpl = await loadMessage('errors/invalid-name');

export class Migrater implements IMigrater {
  constructor(private readonly provider: IDatasourceProvider) {}

  get name(): string {
    return this.provider.name;
  }

  async setup({ connection, migrationsPath }: SetupArg): Promise<void> {
    await this.provider.prepareSetup(connection);
    await this.provider.setup(connection);
    await mkdir(migrationsPath, { recursive: true });
  }

  async up({ connection, migrationsPath, one = false }: UpArg): Promise<string[]> {
    const migrations = await discoverMigrations({
      migratePath: migrationsPath,
      dialect: this.provider.name,
    });
    const applied: string[] = [];
    for (;;) {
      const result = await applyOneUp({ provider: this.provider, connection, migrations });
      if (!result.applied || result.name == null) break;
      applied.push(result.name);
      if (one) break;
    }
    return applied;
  }

  async down({ connection, migrationsPath }: DownArg): Promise<string | null> {
    const migrations = await discoverMigrations({
      migratePath: migrationsPath,
      dialect: this.provider.name,
    });
    const result = await applyOneDown({ provider: this.provider, connection, migrations });
    return result.rolledBack ? result.name : null;
  }

  async create({ name, migrationsPath }: CreateArg): Promise<CreateResponse> {
    if (!isMigrationName(name)) {
      throw new Error(fillTemplate(invalidNameTpl, { name }));
    }
    await mkdir(migrationsPath, { recursive: true });
    let entries: string[] = [];
    try {
      entries = await readdir(migrationsPath);
    } catch (err) {
      if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) throw err;
    }
    const seq = nextSequence(entries);
    const prefix = pad4(seq);
    const upName = `${prefix}_${name}_up.sql`;
    const downName = `${prefix}_${name}_down.sql`;
    const [upBody, downBody] = await Promise.all([
      loadScaffold('up', { name }),
      loadScaffold('down', { name }),
    ]);
    await writeFile(`${migrationsPath}/${upName}`, upBody);
    await writeFile(`${migrationsPath}/${downName}`, downBody);
    return { upName, downName };
  }
}

export const getMigrater = (provider: string): IMigrater =>
  new Migrater(defaultDialectFactory.get(provider));
