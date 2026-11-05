import { describe, expect, it } from 'vitest';
import { fillTemplate, loadMessage, loadScaffold } from './message-templates.ts';
import { readSqlTemplate } from './sql-templates.ts';
import { templatesRoot } from './templates-root.ts';

describe('templates', () => {
  it('replaces every {{key}} and leaves unknown keys', () => {
    expect(fillTemplate('{{a}} {{b}} {{a}}', { a: '1', b: '2' })).toBe('1 2 1');
    expect(fillTemplate('{{missing}}', {})).toBe('{{missing}}');
  });

  it('loads message and scaffold files from the templates root', async () => {
    expect(templatesRoot()).toMatch(/templates$/);
    const msg = await loadMessage('errors/invalid-name', { name: 'Bad' });
    expect(msg).toContain('Bad');
    const up = await loadScaffold('up', { name: 'add_users' });
    expect(up).toContain('add_users');
  });

  it('reads dialect SQL templates', async () => {
    const sql = await readSqlTemplate('sqlite', 'migrates');
    expect(sql.toLowerCase()).toContain('migrates');
  });
});
