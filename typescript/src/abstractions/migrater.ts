export type SetupArg = { connection: string; migrationsPath: string };
export type UpArg = { connection: string; migrationsPath: string; one?: boolean };
export type DownArg = { connection: string; migrationsPath: string };
export type CreateArg = { name: string; migrationsPath: string };
export type CreateResponse = { upName: string; downName: string };

export interface IMigrater {
  readonly name: string;
  setup(args: SetupArg): Promise<void>;
  up(args: UpArg): Promise<string[]>;
  down(args: DownArg): Promise<string | null>;
  create(args: CreateArg): Promise<CreateResponse>;
}
