import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The venue map ("Tischplan"): one image file in the data directory.
 * The file itself is served separately; the tournament state only carries a
 * version number so that all clients reload the image after an upload.
 */

const BASE_NAME = 'venue-map';

export const VENUE_MAP_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Path of the current map, or `null` if none has been uploaded. */
export async function findVenueMap(dataDir: string): Promise<string | null> {
  const files = await readdir(dataDir).catch(() => [] as string[]);
  const file = files.find((name) => name.startsWith(`${BASE_NAME}.`));
  return file ? path.join(dataDir, file) : null;
}

export async function saveVenueMap(dataDir: string, contentType: string, data: Buffer): Promise<void> {
  const extension = VENUE_MAP_TYPES[contentType];
  if (!extension) throw new Error(`Nicht unterstützter Bildtyp: ${contentType}`);
  await deleteVenueMap(dataDir);
  await writeFile(path.join(dataDir, `${BASE_NAME}.${extension}`), data);
}

export async function deleteVenueMap(dataDir: string): Promise<void> {
  const existing = await findVenueMap(dataDir);
  if (existing) await rm(existing, { force: true });
}
