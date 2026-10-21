import { MysqlDialect } from './mysql-dialect.ts';

export const createDialect = (): MysqlDialect => new MysqlDialect();
export { MysqlDialect, applyMysqlDdlViaTextProtocol } from './mysql-dialect.ts';
