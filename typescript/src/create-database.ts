const postgresAdminUrl = (connection: string): { admin: string; name: string } | undefined => {
  const url = new URL(connection);
  const name = url.pathname.replace(/^\//, '');
  if (!name || name === 'postgres') return undefined;
  url.pathname = '/postgres';
  return { admin: url.toString(), name };
};

const mysqlAdminUrl = (connection: string): { admin: string; name: string } | undefined => {
  const url = new URL(connection);
  const name = url.pathname.replace(/^\//, '');
  if (!name) return undefined;
  url.pathname = '/';
  return { admin: url.toString(), name };
};

const sqlserverDatabase = (
  connection: string,
): { admin: string; name: string } | undefined => {
  const match = /(?:^|;)Database=([^;]+)/i.exec(connection);
  const name = match?.[1]?.trim();
  if (!name || /^master$/i.test(name)) return undefined;
  const admin = connection.replace(/(^|;)Database=[^;]*/i, '$1Database=master');
  return { admin, name };
};

export const createDatabase = async (provider: string, connection: string): Promise<void> => {
  if (provider === 'sqlite' || provider === 'oracle') return;
  if (provider === 'postgres') {
    const parsed = postgresAdminUrl(connection);
    if (!parsed) return;
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: parsed.admin });
    await client.connect();
    try {
      await client.query(`CREATE DATABASE "${parsed.name.replaceAll('"', '""')}"`);
    } catch (e) {
      if (!/already exists/i.test(String(e))) throw e;
    } finally {
      await client.end();
    }
    return;
  }
  if (provider === 'mysql') {
    const parsed = mysqlAdminUrl(connection);
    if (!parsed) return;
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection(parsed.admin);
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${parsed.name.replaceAll('`', '``')}\``);
    } finally {
      await conn.end();
    }
    return;
  }
  if (provider === 'sqlserver') {
    const parsed = sqlserverDatabase(connection);
    if (!parsed) return;
    const { default: mssql } = await import('mssql');
    const pool = await mssql.connect(parsed.admin);
    try {
      await pool.request().batch(
        `IF DB_ID(N'${parsed.name.replaceAll("'", "''")}') IS NULL CREATE DATABASE [${parsed.name.replaceAll(']', ']]')}];`,
      );
    } finally {
      await pool.close();
    }
  }
};
