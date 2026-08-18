import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checksum,
  parseSqlStatements,
  runDown,
  runUp,
  type MigrationDescriptor,
} from "../src/datasource-migrate.ts";
import { mockMigrationClient } from "./mock-migration-client.ts";

const writePair = async (
  dir: string,
  name: string,
): Promise<MigrationDescriptor> => {
  const upPath = join(dir, `${name}_up.sql`);
  const downPath = join(dir, `${name}_down.sql`);
  await writeFile(upPath, "CREATE TABLE t (id INT);\n");
  await writeFile(downPath, "DROP TABLE t;\n");
  return { name, upPath, downPath };
};

describe("runUp / runDown against a mocked client", () => {
  it("applies the first pending migration and records checksum + log success", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrate-up-"));
    const first = await writePair(dir, "0001_init");
    const client = mockMigrationClient();
    const result = await runUp({
      client,
      migrations: [first],
      env: {},
    });
    expect(result).toEqual({ applied: true, name: "0001_init" });
    expect(client.execs).toEqual(["CREATE TABLE t (id INT)"]);
    expect(client.applied.get("0001_init")).toBe(
      checksum(await readFile(first.upPath, "utf8")),
    );
    expect(client.runs.some((r) => /INSERT INTO\s+"?migrates"?/i.test(r.sql))).toBe(
      true,
    );
    expect(
      client.runs.some(
        (r) => /UPDATE\s+"?migrate_logs"?/i.test(r.sql) && r.params[0] === "success",
      ),
    ).toBe(true);
  });

  it("is a no-op when every migration is already applied", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrate-up-done-"));
    const first = await writePair(dir, "0001_init");
    const body = "CREATE TABLE t (id INT);\n";
    const client = mockMigrationClient({
      applied: { "0001_init": checksum(body) },
    });
    const result = await runUp({ client, migrations: [first], env: {} });
    expect(result).toEqual({ applied: false, name: null });
    expect(client.execs).toEqual([]);
  });

  it("refuses checksum drift unless the env escape hatch is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrate-drift-"));
    const first = await writePair(dir, "0001_init");
    const client = mockMigrationClient({
      applied: { "0001_init": "0".repeat(64) },
    });
    await expect(runUp({ client, migrations: [first], env: {} })).rejects.toThrow(
      /checksum drift/i,
    );
    const allowed = await runUp({
      client,
      migrations: [first],
      env: { MIGRATE_ALLOW_CHECKSUM_DRIFT: "1" },
    });
    expect(allowed.applied).toBe(false);
  });

  it("rolls back the last applied migration via the down sibling", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrate-down-"));
    const first = await writePair(dir, "0001_init");
    const body = "CREATE TABLE t (id INT);\n";
    const client = mockMigrationClient({
      applied: { "0001_init": checksum(body) },
    });
    const result = await runDown({ client, migrations: [first], env: {} });
    expect(result).toEqual({ rolledBack: true, name: "0001_init" });
    expect(client.execs).toEqual(["DROP TABLE t"]);
    expect(client.applied.has("0001_init")).toBe(false);
  });

  it("records an error log and rethrows when exec fails inside the transaction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "migrate-fail-"));
    const first = await writePair(dir, "0001_init");
    const boom = new Error("ddl failed");
    const client = mockMigrationClient({ failExec: boom });
    await expect(runUp({ client, migrations: [first], env: {} })).rejects.toThrow(
      "ddl failed",
    );
    expect(
      client.runs.some(
        (r) => /UPDATE\s+"?migrate_logs"?/i.test(r.sql) && r.params[0] === "error",
      ),
    ).toBe(true);
  });
});

describe("parseSqlStatements", () => {
  it("splits on top-level semicolons and keeps BEGIN…END together", () => {
    expect(parseSqlStatements("CREATE TABLE a (id INT); CREATE TABLE b (id INT);")).toEqual([
      "CREATE TABLE a (id INT)",
      "CREATE TABLE b (id INT)",
    ]);
    expect(
      parseSqlStatements("BEGIN\n  SELECT 1;\nEND;"),
    ).toEqual(["BEGIN\n  SELECT 1;\nEND"]);
  });
});
