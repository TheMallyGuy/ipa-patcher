
import { CAC, cac } from "cac";
import { readFile, writeFile } from "node:fs/promises";
import { patch } from "./modPatch";
const cli: CAC = cac("rblx-ptch");

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
        patch(ipaBytes, Array.isArray(options.mod) ? options.mod : [options.mod], true).then(async (out) => {
            await writeFile(options.dest, out);
            console.log(`Patched IPA written to ${options.dest}`);
        });
    });

cli.help();
cli.version("1.0.0");
cli.parse();