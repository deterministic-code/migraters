import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repo `shared/templates`; after build, `dist/templates` (copied from shared). */
export const templatesRoot = (): string => {
  const normalized = HERE.replaceAll('\\', '/');
  if (normalized.endsWith('/dist/infrastructure')) {
    return join(HERE, '..', 'templates');
  }
  return join(HERE, '..', '..', '..', 'shared', 'templates');
};
