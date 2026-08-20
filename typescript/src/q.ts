import { defaultDialectFactory } from './infrastructure/default-factory.ts';

export const q = (dialect: string, ident: string): string =>
  defaultDialectFactory.get(dialect).quoteIdent(ident);
