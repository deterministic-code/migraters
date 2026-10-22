import { OracleDialect } from './oracle-dialect.ts';

export const createDialect = (): OracleDialect => new OracleDialect();
export const provider = createDialect;
export { OracleDialect, parseOracleConnection } from './oracle-dialect.ts';
