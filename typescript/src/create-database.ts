import { defaultDialectFactory } from './infrastructure/default-factory.ts';

export const createDatabase = async (provider: string, connection: string): Promise<void> => {
  const dialect = defaultDialectFactory.tryGet(provider);
  if (!dialect) return;
  await dialect.createDatabaseIfMissing(connection);
};
