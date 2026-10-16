export const MIGRATION_NAME_RE = /^[a-z][a-z0-9_]*$/;
const SEQ_RE = /^(\d{1,4})_.*_up\.sql$/;

export const isMigrationName = (name: string): boolean => MIGRATION_NAME_RE.test(name);

export const nextSequence = (filenames: Iterable<string>): number => {
  let max = 0;
  for (const name of filenames) {
    const m = SEQ_RE.exec(name);
    if (!m) continue;
    const n = Number.parseInt(m[1] as string, 10);
    if (n > max) max = n;
  }
  return max + 1;
};

export const pad4 = (n: number): string => String(n).padStart(4, '0');
