import { MysqlProvider } from './mysql-provider.ts';

export const createProvider = (): MysqlProvider => new MysqlProvider();
export const provider = createProvider;
export { MysqlProvider, applyMysqlDdlViaTextProtocol } from './mysql-provider.ts';
