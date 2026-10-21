import type { MigrationDriver, MigrationDriverId } from '../src/abstractions/migration-driver.ts';

export type MockMigrationDriver = MigrationDriver & {
  appliedMap: Map<string, string | null>;
  failMigrate?: Error;
  setups: number;
  ups: { name: string; body: string; checksum: string }[];
  downs: { name: string; body: string }[];
};

export const mockMigrationDriver = (
  init: {
    applied?: Record<string, string | null>;
    failMigrate?: Error;
  } = {},
): MockMigrationDriver => {
  const appliedMap = new Map(Object.entries(init.applied ?? {}));
  let nextLogId = 1;
  const driver: MockMigrationDriver = {
    appliedMap,
    failMigrate: init.failMigrate,
    setups: 0,
    ups: [],
    downs: [],
    async setup() {
      driver.setups += 1;
    },
    async applied() {
      return new Map(appliedMap);
    },
    async migrateUp(name, body, checksum) {
      if (driver.failMigrate) throw driver.failMigrate;
      driver.ups.push({ name, body, checksum });
      appliedMap.set(name, checksum);
    },
    async migrateDown(name, body) {
      if (driver.failMigrate) throw driver.failMigrate;
      driver.downs.push({ name, body });
      appliedMap.delete(name);
    },
    async logStarted(_name, _direction): Promise<MigrationDriverId> {
      return nextLogId++;
    },
    async logFinished() {},
    async close() {},
  };
  return driver;
};

/** @deprecated Use mockMigrationDriver. */
export const mockMigrationClient = mockMigrationDriver;
