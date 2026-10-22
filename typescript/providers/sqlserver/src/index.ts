import { SqlServerProvider } from './sqlserver-provider.ts';

export const createProvider = (): SqlServerProvider => new SqlServerProvider();
export const provider = createProvider;
export { SqlServerProvider };
