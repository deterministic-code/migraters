const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_BATCH_SEPARATOR = 'GO';

/** True when the line starts with the delimiter and the rest is empty, a -- comment, and/or a YYYY-MM-DD date. */
export function isBatchSeparatorLine(line: string, separator: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  const tokens = trimmed.split(/\s+/);
  if (tokens[0].toLowerCase() !== separator.toLowerCase()) return false;
  const rest = tokens.slice(1);
  if (rest.length === 0) return true;
  if (rest[0].startsWith('--')) return true;
  return ISO_DATE.test(rest[0]) && (rest.length === 1 || rest[1].startsWith('--'));
}

/** Split migration SQL on batch-separator lines. Default delimiter is whole-line GO. */
export function splitOnGo(text: string, separator: string = DEFAULT_BATCH_SEPARATOR): string[] {
  const batches: string[] = [];
  let buf = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (isBatchSeparatorLine(line, separator)) {
      const s = buf.trim();
      if (s.length > 0) batches.push(s);
      buf = '';
      continue;
    }
    buf = buf.length > 0 ? `${buf}\n${line}` : line;
  }
  const tail = buf.trim();
  if (tail.length > 0) batches.push(tail);
  return batches;
}
