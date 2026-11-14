import { networkInterfaces } from 'node:os';

/** IPv4 addresses under which other devices in the local network can reach this machine. */
export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry!.address);
}
