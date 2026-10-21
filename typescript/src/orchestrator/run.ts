import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

export const runCommand = (
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): number => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
};

export const requireStatus = (status: number): void => {
  if (status !== 0) {
    process.exit(status);
  }
};
