import { PostgresDialect } from './postgres-dialect.ts';

export const createDialect = (): PostgresDialect => new PostgresDialect();
export const provider = createDialect;
export { PostgresDialect };
