import { OracleProvider } from './oracle-provider.ts';

export const createProvider = (): OracleProvider => new OracleProvider();
export const provider = createProvider;
export { OracleProvider, parseOracleConnection } from './oracle-provider.ts';
