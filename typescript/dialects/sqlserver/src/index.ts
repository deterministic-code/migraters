import { SqlServerDialect } from './sqlserver-dialect.ts';

export const createDialect = (): SqlServerDialect => new SqlServerDialect();
export const provider = createDialect;
export { SqlServerDialect };
