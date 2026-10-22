import { PostgresProvider } from './postgres-provider.ts';

export const createProvider = (): PostgresProvider => new PostgresProvider();
export const provider = createProvider;
export { PostgresProvider };
