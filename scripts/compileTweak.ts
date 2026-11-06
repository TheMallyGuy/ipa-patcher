#!/usr/bin/env bun
/**
 * Compile the RBXFFlags tweak cross-platform.
 *
 *   bun scripts/compileTweak.ts [--clean]
 *
 * Windows: builds through WSL (Ubuntu). Linux/macOS: builds natively.
 * Sources are copied to a space-free dir ($HOME/rbxff) because Theos rejects
 * paths with spaces, then the signed dylib is copied back to tweak/.
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const REPO = join(import.meta.dir, "..");
const TWEAK = join(REPO, "tweak");
const SRCS = ["Tweak.xm", "regmap.c", "Makefile", "control", "RBXFFlags.plist"];
const clean = process.argv.includes("--clean");
const onWindows = process.platform === "win32";

for (const f of SRCS) {
  if (!existsSync(join(TWEAK, f))) {
    console.error(`missing tweak/${f}`);
    process.exit(1);
  }
}

// Path the build shell sees for tweak/ (WSL needs /mnt/<drive>/...).
function winToMnt(p: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return p.replace(/\\/g, "/");
  return `/mnt/${m[1]!.toLowerCase()}/${m[2]!.replace(/\\/g, "/")}`;
}
const SRC = onWindows ? winToMnt(TWEAK) : TWEAK;
const cpList = SRCS.map((f) => `"$SRC/${f}"`).join(" ");

// Build script, fed to bash via STDIN (`bash -s`) rather than as an argument:
// a complex multi-line bash arg to wsl.exe gets mangled by Windows arg quoting.
// libxml2.so.2 symlink is an Ubuntu-rename fix, honored only if present.
const body = [
  "set -e",
  `SRC="${SRC}"`,
  'BUILD="$HOME/rbxff"',
  'export THEOS="${THEOS:-$HOME/theos}"',
  'if [ -f "$HOME/libxml2.so.2" ]; then export LD_LIBRARY_PATH="$HOME"; fi',
  'mkdir -p "$BUILD"',
  `cp ${cpList} "$BUILD/"`,
  'cd "$BUILD"',
  clean ? "make clean" : ":",
  "make",
  'cp .theos/obj/debug/RBXFFlags.dylib "$SRC/RBXFFlags.dylib"',
  'echo "built -> $SRC/RBXFFlags.dylib"',
].join("\n");

const [cmd, args] = onWindows
  ? ["wsl.exe", ["-d", "Ubuntu", "bash", "-ls"]]
  : ["bash", ["-s"]];

const r = spawnSync(cmd as string, args as string[], {
  input: body,
  stdio: ["pipe", "inherit", "inherit"],
});
process.exit(r.status ?? 1);
