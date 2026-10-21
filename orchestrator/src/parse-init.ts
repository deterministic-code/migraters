import { resolveInitDialects } from './dialects.ts';
import { normalizeLanguage, type Language } from './languages.ts';

export type ParsedInit = {
  help?: boolean;
  language?: Language;
  dialects: string[];
  all: boolean;
};

const takeFlag = (
  rest: string[],
  i: number,
  arg: string,
  flag: string,
): { value: string; next: number } | undefined => {
  const eq = `${flag}=`;
  if (arg === flag) {
    const value = rest[i + 1];
    if (value === undefined) return undefined;
    return { value, next: i + 1 };
  }
  if (arg.startsWith(eq)) return { value: arg.slice(eq.length), next: i };
  return undefined;
};

export const parseInitArgv = (argv: string[]): ParsedInit => {
  const dialects: string[] = [];
  let language: Language | undefined;
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '-h' || a === '--help') {
      return { help: true, dialects, all };
    }
    if (a === '--all') {
      all = true;
      continue;
    }
    const languageTaken = takeFlag(argv, i, a, '--language');
    if (languageTaken) {
      const name = normalizeLanguage(languageTaken.value);
      if (!name) {
        throw new Error(`unsupported language: ${languageTaken.value}`);
      }
      language = name;
      i = languageTaken.next;
      continue;
    }
    const taken = takeFlag(argv, i, a, '--dialect');
    if (taken) {
      dialects.push(taken.value);
      i = taken.next;
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
  }
  return { language, dialects, all };
};

export const resolveInitSelection = (
  parsed: ParsedInit,
): { language: Language; dialects: string[] } => {
  if (!parsed.language) {
    throw new Error('pass --language <typescript|csharp|rust>');
  }
  return {
    language: parsed.language,
    dialects: resolveInitDialects(parsed.dialects, parsed.all),
  };
};
