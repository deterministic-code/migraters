export const MIGRATE_VERBS = ["setup", "up", "down", "create"] as const;

export type MigrateVerb = (typeof MIGRATE_VERBS)[number];

export const migrateCommand = (verb: MigrateVerb): string => `migrate-${verb}`;

export const verbFromCommand = (command: string): MigrateVerb => {
  const verb = command.replace(/^migrate-/, "");
  if (
    verb !== "setup" &&
    verb !== "up" &&
    verb !== "down" &&
    verb !== "create"
  ) {
    throw new Error(`Unknown migrate command "${command}"`);
  }
  return verb;
};

export const fillHelpTemplate = (text: string, command: string): string =>
  text.replaceAll("{{command}}", command);
