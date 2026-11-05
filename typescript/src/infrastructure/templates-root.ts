import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `dist/templates` after build (`../../templates` from this file). */
export const templatesRoot = (): string => join(HERE, '..', '..', 'templates');
