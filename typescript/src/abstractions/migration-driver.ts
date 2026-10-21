export type MigrationDriverId = string | number | bigint;

export interface MigrationDriver {
  setup(): Promise<void>;
  applied(): Promise<Map<string, string | null>>;
  migrateUp(name: string, body: string, checksum: string): Promise<void>;
  migrateDown(name: string, body: string): Promise<void>;
  logStarted(name: string, direction: string): Promise<MigrationDriverId>;
  logFinished(
    id: MigrationDriverId,
    status: string,
    durationMs: number,
    error: string | null,
  ): Promise<void>;
  close(): Promise<void>;
}
