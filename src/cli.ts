import { CAC, cac } from "cac";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { patch, type ModFiles } from "./modPatch";
const cli: CAC = cac("rblx-ptch");

async function readMod(dir: string): Promise<ModFiles> {
  const out: ModFiles = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    out[relative(dir, full).split(sep).join("/")] = new Uint8Array(await readFile(full));
  }
  return out;
}

cli
  .command("[file]", "patch the roblox's file")
  .option("-m, --mod <mod folder>", "mod folder to patch")
  .option("-d, --dest <output file>", "output file name", { default: "patched.ipa" })
  .action(async (file, options) => {
    if (!file || !options.mod) {
      console.error("Missing required arguments: <file> and --mod <mod folder>");
      process.exit(1);
    }

    const ipaBytes = new Uint8Array(await readFile(file));
    const modDirs: string[] = Array.isArray(options.mod) ? options.mod : [options.mod];
    const mods = await Promise.all(modDirs.map(readMod));
    await writeFile(options.dest, patch(ipaBytes, mods, true));
    console.log(`Patched IPA written to ${options.dest}`);
  });

cli.help();
cli.version("1.0.0");
cli.parse();
