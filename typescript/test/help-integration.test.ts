import { spawn } from "node:child_process";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrateCommand, type MigrateVerb } from "../src/cli-contract.ts";
import { loadHelp } from "../src/help.ts";

const BIN_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "bin",
);

const BINS: { verb: MigrateVerb; file: string }[] = [
  { verb: "setup", file: "migrate-setup.js" },
  { verb: "up", file: "migrate-up.js" },
  { verb: "down", file: "migrate-down.js" },
  { verb: "create", file: "migrate-create.js" },
];

const runHelp = async (
  file: string,
): Promise<{ code: number; stderr: string }> => {
  const child = spawn(process.execPath, [join(BIN_DIR, file), "--help"], {
    env: { ...process.env },
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const [code] = (await once(child, "exit")) as [number | null];
  return { code: code ?? 1, stderr };
};

const distBin = join(BIN_DIR, "migrate-setup.js");

describe("CLI --help integration", () => {
  it("prints the unified filled help and exits 0 for every migrate-<verb> bin", async () => {
    try {
      await access(distBin);
    } catch {
      return;
    }
    for (const { verb, file } of BINS) {
      const expected = await loadHelp(migrateCommand(verb));
      const { code, stderr } = await runHelp(file);
      expect(code, file).toBe(0);
      expect(stderr, file).toBe(expected);
    }
  });
});
