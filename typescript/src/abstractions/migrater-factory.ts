import { Migrater } from '../migrater.ts';
import type { IMigrater } from './migrater.ts';
import { SqlDialectFactory } from './sql-dialect-factory.ts';

export class MigraterFactory {
  constructor(private readonly dialects: SqlDialectFactory) {}

  get(provider: string): IMigrater {
    return new Migrater(this.dialects.get(provider));
  }
}
