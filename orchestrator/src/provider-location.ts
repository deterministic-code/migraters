export type ProviderEntry = {
  name: string;
};

export const providerEntries = (names: string[]): ProviderEntry[] =>
  names.map((name) => ({ name }));
