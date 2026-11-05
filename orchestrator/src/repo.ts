import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `orchestrator/src` or `orchestrator/dist` → package root. */
export const packageRootFromModule = (moduleUrl: string): string =>
  join(dirname(fileURLToPath(moduleUrl)), '..', '..');
