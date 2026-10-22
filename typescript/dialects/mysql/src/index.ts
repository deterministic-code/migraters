import { MysqlDialect } from './mysql-dialect.ts';

export const createDialect = (): MysqlDialect => new MysqlDialect();
export const provider = createDialect;
export { MysqlDialect, applyMysqlDdlViaTextProtocol } from './mysql-dialect.ts';
