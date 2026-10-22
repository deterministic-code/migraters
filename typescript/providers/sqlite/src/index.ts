import { SqliteProvider } from './sqlite-provider.ts';

export const createProvider = (): SqliteProvider => new SqliteProvider();
export const provider = createProvider;
export { SqliteProvider, sqliteFilesystemPath } from './sqlite-provider.ts';
