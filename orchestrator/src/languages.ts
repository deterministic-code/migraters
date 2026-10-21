export const LANGUAGES = ['typescript', 'csharp', 'rust'] as const;

export type Language = (typeof LANGUAGES)[number];

export const normalizeLanguage = (raw: string): Language | undefined => {
  const key = raw.replace(/[\s_-]/g, '').toLowerCase();
  return LANGUAGES.find((name) => name === key);
};

export const binDirFor = (language: Language): string => {
  if (language === 'typescript') return 'typescript/dist/src/bin';
  if (language === 'csharp') return 'csharp/bin/Debug/net9.0';
  return 'rust/target/debug';
};
