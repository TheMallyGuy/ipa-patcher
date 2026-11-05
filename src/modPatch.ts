import { unzipSync, zipSync } from "fflate";
import { readdir, readFile } from "fs/promises";
import { join, relative, sep } from "path/win32";
import { MOD_KEY } from "./constraints";

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/**
 * Patches the given Roblox IPA bytes with the specified mod folders.
 * @param ipaBytes The bytes of the Roblox IPA file.
 * @param mods An array of mod folder paths to apply to the IPA.
 * @param logProgress Whether to log the progress of the patching process.
 * @returns A Promise that resolves to the patched IPA bytes.
 */
export async function patch(
  ipaBytes: Uint8Array,
  mods: string[],
  logProgress = false,
): Promise<Uint8Array> {
  const files = unzipSync(ipaBytes);

  const work: { mod: string; path: string }[] = [];
  for (const mod of mods) {
    for (const path of await walk(mod)) {
      work.push({ mod, path });
    }
  }

  let done = 0;
  for (const { mod, path } of work) {
    const relPath = relative(mod, path).split(sep).join("/");
    const key = MOD_KEY + relPath;
    if (logProgress) {
      const percent = (done / work.length) * 100;
      console.log(`Patching ${relPath} (${percent.toFixed(2)}%)`);
    }

    files[key] = new Uint8Array(await readFile(path));
    done++;
    if (logProgress) {
      const percent = (done / work.length) * 100;
      console.log(`Patched ${relPath} (${percent.toFixed(2)}%)`);
    }
  }

  return zipSync(files);
}
