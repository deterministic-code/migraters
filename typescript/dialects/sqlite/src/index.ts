import { SqliteDialect } from './sqlite-dialect.ts';

export const createDialect = (): SqliteDialect => new SqliteDialect();
export { SqliteDialect, sqliteFilesystemPath } from './sqlite-dialect.ts';
