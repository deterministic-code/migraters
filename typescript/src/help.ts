import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fillHelpTemplate, verbFromCommand } from "./cli-contract.ts";

const HELP_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "help",
);

export const loadHelp = async (command: string): Promise<string> => {
  const verb = verbFromCommand(command);
  const text = await readFile(join(HELP_ROOT, `${verb}.txt`), "utf8");
  return fillHelpTemplate(text, command);
};
