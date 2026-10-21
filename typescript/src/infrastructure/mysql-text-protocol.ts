/** why: DDL statements (DROP/CREATE PROCEDURE) reject prepared-statement protocol (MySQL 1295) */
export async function applyMysqlDdlViaTextProtocol(
  conn: { query: (sql: string) => Promise<unknown> },
  sql: string,
): Promise<void> {
  await conn.query(sql);
}
