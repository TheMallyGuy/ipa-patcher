import { unzipSync, zipSync } from "fflate";
import { MOD_KEY } from "./constraints";

export type ModFiles = Record<string, Uint8Array>;

/**
 * Patches the given Roblox IPA bytes with the specified mods.
 * @param ipaBytes The bytes of the Roblox IPA file.
 * @param mods Mods to apply, in order. Later mods overwrite earlier ones.
 * @param logProgress Whether to log the progress of the patching process.
 * @returns The patched IPA bytes.
 */
export function patch(ipaBytes: Uint8Array, mods: ModFiles[], logProgress = false): Uint8Array {
  const files: ModFiles = unzipSync(ipaBytes);
  const work = mods.flatMap((mod) => Object.entries(mod));

  work.forEach(([relPath, bytes], i) => {
    files[MOD_KEY + relPath] = bytes;
    if (logProgress) {
      console.log(`Patched ${relPath} (${(((i + 1) / work.length) * 100).toFixed(2)}%)`);
    }
  });

  return zipSync(files);
}
