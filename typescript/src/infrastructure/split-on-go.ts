const GO_LINE = /^\s*GO\s*$/i;

/** Split migration SQL on whole-line GO batch separators. */
export function splitOnGo(text: string): string[] {
  const batches: string[] = [];
  let buf = '';
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (GO_LINE.test(line)) {
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
