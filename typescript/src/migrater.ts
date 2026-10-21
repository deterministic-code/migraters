import { mkdir, readdir, writeFile } from 'node:fs/promises';
import type {
  CreateArg,
  CreateResponse,
  DownArg,
  IMigrater,
  SetupArg,
  UpArg,
} from './abstractions/migrater.ts';
import type { IDialect } from './abstractions/sql-dialect.ts';
import { isMigrationName, nextSequence, pad4 } from './create-sequence.ts';
import { applyOneDown, applyOneUp, discoverMigrations } from './datasource-migrate.ts';
import { defaultDialectFactory } from './infrastructure/default-factory.ts';
import { fillTemplate, loadMessage, loadScaffold } from './infrastructure/message-templates.ts';

const invalidNameTpl = await loadMessage('errors/invalid-name');

export class Migrater implements IMigrater {
  constructor(private readonly dialect: IDialect) {}

  get name(): string {
    return this.dialect.name;
  }

  async setup({ connection, migrationsPath }: SetupArg): Promise<void> {
    await this.dialect.prepareSetup(connection);
    const driver = await this.dialect.createDriver(connection);
    try {
      await driver.setup();
      await mkdir(migrationsPath, { recursive: true });
    } finally {
      await driver.close();
    }
  }

  async up({ connection, migrationsPath, one = false }: UpArg): Promise<string[]> {
    const driver = await this.dialect.createDriver(connection);
    try {
      const migrations = await discoverMigrations({
        migratePath: migrationsPath,
        dialect: this.dialect.name,
      });
      const applied: string[] = [];
      for (;;) {
        const result = await applyOneUp({ driver, migrations });
        if (!result.applied || result.name == null) break;
        applied.push(result.name);
        if (one) break;
      }
      return applied;
    } finally {
      await driver.close();
    }
  }

  async down({ connection, migrationsPath }: DownArg): Promise<string | null> {
    const driver = await this.dialect.createDriver(connection);
    try {
      const migrations = await discoverMigrations({
        migratePath: migrationsPath,
        dialect: this.dialect.name,
      });
      const result = await applyOneDown({ driver, migrations });
      return result.rolledBack ? result.name : null;
    } finally {
      await driver.close();
    }
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
    const seq = pad4(nextSequence(entries));
    const upName = `${seq}_${name}_up.sql`;
    const downName = `${seq}_${name}_down.sql`;
    await writeFile(`${migrationsPath}/${upName}`, await loadScaffold('up', { name }));
    await writeFile(`${migrationsPath}/${downName}`, await loadScaffold('down', { name }));
    return { upName, downName };
  }
}

export const getMigrater = (provider: string): IMigrater =>
  new Migrater(defaultDialectFactory.get(provider));
