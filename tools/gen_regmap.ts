#!/usr/bin/env bun
/**
 * Generate regmap.c (flag name -> RobloxLib storage offset) for the RBXFFlags
 * tweak. Run whenever Roblox updates; offsets are build-specific.
 *
 *   bun tools/gen_regmap.ts <Roblox.ipa | RobloxLib> [out_regmap.c]
 *
 * Parses the arm64 Mach-O, enumerates every fast-var registration site by
 * emulating x0/x1/x2 across __text, records the live storage slot each flag
 * binds to. String-type flags are excluded (their slot is a std::string).
 */
import { unzipSync } from "fflate";

function loadRobloxLib(path: string): Uint8Array {
  if (path.toLowerCase().endsWith(".ipa")) {
    const ipa = new Uint8Array(require("fs").readFileSync(path));
    const files = unzipSync(ipa, { filter: (f) => f.name.endsWith("/RobloxLib") });
    const k =
      Object.keys(files).find((n) => n.endsWith("Frameworks/RobloxLib.framework/RobloxLib")) ??
      Object.keys(files)[0];
    if (!k) throw new Error("RobloxLib not found in IPA");
    return files[k]!;
  }
  return new Uint8Array(require("fs").readFileSync(path));
}

/** Return an arm64 slice of a fat Mach-O, else the input unchanged. */
function thin(d: Uint8Array): Uint8Array {
  const be = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const magic = be.getUint32(0, false);
  if (magic === 0xcafebabe || magic === 0xbebafeca) {
    const n = be.getUint32(4, false);
    for (let i = 0; i < n; i++) {
      const o = 8 + i * 20;
      const cput = be.getUint32(o, false);
      const off = be.getUint32(o + 8, false);
      const size = be.getUint32(o + 12, false);
      if (cput === 0x0100000c) return d.subarray(off, off + size); // CPU_TYPE_ARM64
    }
    throw new Error("no arm64 slice in fat binary");
  }
  return d;
}

type Seg = { seg: string; vm: number; vs: number; fo: number; fs: number };

function buildMap(d: Uint8Array): Map<string, [number, "n" | "s"]> {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const u64 = (o: number) => Number(dv.getBigUint64(o, true));
  if (u32(0) !== 0xfeedfacf) throw new Error("not arm64 Mach-O");

  const ncmds = u32(16);
  const secs = new Map<string, [number, number, number]>(); // "SEG\0SECT" -> addr,size,foff
  const segs: Seg[] = [];
  let symoff = 0,
    nsyms = 0,
    stroff = 0;
  {
    let off = 32;
    const str16 = (o: number) => {
      let e = o;
      while (e < o + 16 && d[e] !== 0) e++;
      return new TextDecoder().decode(d.subarray(o, e));
    };
    for (let c = 0; c < ncmds; c++) {
      const cmd = u32(off),
        sz = u32(off + 4);
      if (cmd === 0x19) {
        // LC_SEGMENT_64
        const seg = str16(off + 8);
        const vm = u64(off + 24),
          vs = u64(off + 32),
          fo = u64(off + 40),
          fs = u64(off + 48);
        segs.push({ seg, vm, vs, fo, fs });
        const nsects = u32(off + 64);
        let so = off + 72;
        for (let s = 0; s < nsects; s++) {
          const sect = str16(so),
            sg = str16(so + 16);
          const addr = u64(so + 32),
            size = u64(so + 40),
            foff = u32(so + 48);
          secs.set(sg + "\0" + sect, [addr, size, foff]);
          so += 80;
        }
      } else if (cmd === 0x2) {
        // LC_SYMTAB
        symoff = u32(off + 8);
        nsyms = u32(off + 12);
        stroff = u32(off + 16);
      }
      off += sz;
    }
  }

  const va2fo = (va: number) => {
    for (const s of segs) if (va >= s.vm && va < s.vm + s.fs && s.fs > 0) return s.fo + va - s.vm;
    return undefined;
  };
  const cstr = (va: number): string | null => {
    const fo = va2fo(va);
    if (fo === undefined) return null;
    let e = fo;
    while (e < d.length && d[e] !== 0) {
      if (d[e]! >= 128) return null; // non-ascii -> reject (matches py ascii decode)
      e++;
    }
    const s = d.subarray(fo, e);
    return s.length ? new TextDecoder("ascii").decode(s) : null;
  };
  const qword = (va: number) => {
    const fo = va2fo(va);
    return fo === undefined ? undefined : u64(fo);
  };
  const segOf = (va: number) => {
    for (const s of segs) if (va >= s.vm && va < s.vm + s.vs) return s.seg;
    return undefined;
  };

  const text = secs.get("__TEXT\0__text");
  if (!text) throw new Error("__text not found");
  const [ta, ts, to] = text;
  const rd = (va: number) => u32(to + (va - ta));

  // locate RegisterString wrapper via symtab
  let stringWrap: number | null = null;
  const target =
    "__ZN4FLog14RegisterStringEPKcPNSt3__112basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEE11FastVarType";
  for (let i = 0; i < nsyms; i++) {
    const e = symoff + i * 16;
    const strx = u32(e);
    const val = u64(e + 8);
    if (!val) continue;
    let p = stroff + strx,
      q = p;
    while (d[q] !== 0) q++;
    if (new TextDecoder().decode(d.subarray(p, q)) === target) stringWrap = val;
  }
  if (stringWrap === null) throw new Error("RegisterString symbol not found; layout changed");

  // enumerate thunk family starting at RegisterString
  const WRAP = new Map<number, number>(); // addr -> arity (2|3|0)
  const LDR_SINGLETON = (0xf9400000 | (0xb0 << 10) | (8 << 5)) >>> 0;
  {
    let va = stringWrap;
    for (;;) {
      let ok = false,
        nxt = 0;
      for (let j = 0; j < 8; j++) {
        if (rd(va + j * 4) === LDR_SINGLETON && ((rd(va + (j + 1) * 4) & 0xfc000000) >>> 0) === 0x14000000) {
          ok = true;
          nxt = va + (j + 2) * 4;
          break;
        }
      }
      if (!ok) break;
      const first = rd(va) >>> 0;
      const arity = first === 0xaa0203e3 ? 3 : first === 0xaa0103e2 ? 2 : 0;
      WRAP.set(va, arity);
      va = nxt;
    }
  }

  const m = new Map<string, [number, "n" | "s"]>();
  const reg: (number | null)[] = new Array(32).fill(null);
  const L = ts;
  for (let i = 0; i < L - 4; i += 4) {
    const va = ta + i;
    const w = rd(va) >>> 0;
    const top = (w & 0xfc000000) >>> 0;
    if (((w & 0x9f000000) >>> 0) === 0x90000000) {
      // adrp  (avoid 32-bit shift overflow: use * for <<12)
      const rn = w & 31;
      const immlo = (w >>> 29) & 3;
      const immhi = (w >>> 5) & 0x7ffff;
      let imm = ((immhi * 4) | immlo) * 4096;
      if (imm >= 2 ** 32) imm -= 2 ** 33;
      reg[rn] = (va & ~0xfff) + imm;
    } else if (((w & 0xff800000) >>> 0) === 0x91000000) {
      // add imm
      const rn = w & 31,
        rs = (w >>> 5) & 31;
      reg[rn] = reg[rs] === null ? null : (reg[rs] as number) + ((w >>> 10) & 0xfff);
    } else if (((w & 0xffc00000) >>> 0) === 0xf9400000) {
      // ldr x (unsigned) -> clobber
      reg[w & 31] = null;
    } else if (((w & 0x7f800000) >>> 0) === 0x52800000) {
      // movz w
      reg[w & 31] = (w >>> 5) & 0xffff;
    } else if (top === 0x14000000 || top === 0x94000000) {
      // b / bl
      let imm = w & 0x3ffffff;
      if (imm & (1 << 25)) imm -= 1 << 26;
      const tgt = va + imm * 4;
      const ar = WRAP.get(tgt);
      if (ar) {
        let name: string | null = null;
        let storage: number | null = null;
        if (ar === 3) {
          const nm = reg[0],
            st = reg[1];
          name = typeof nm === "number" ? cstr(nm) : null;
          storage = typeof st === "number" ? st : null;
        } else {
          const st = reg[0];
          storage = typeof st === "number" ? st : null;
          if (storage !== null) {
            const np = qword(storage + 8);
            name = np ? cstr(np) : null;
          }
        }
        if (
          name &&
          storage !== null &&
          name.length >= 1 &&
          name.length <= 90 &&
          segOf(storage)?.startsWith("__DATA")
        ) {
          const kind = tgt === stringWrap ? "s" : "n";
          if (!m.has(name)) m.set(name, [storage, kind]);
        }
      }
      if (top === 0x94000000) reg.fill(null); // bl clobbers
    }
  }

  const textvm = segs.find((s) => s.seg === "__TEXT")!.vm;
  if (textvm !== 0) throw new Error("__TEXT vmaddr != 0; offset model invalid");
  return m;
}

function emitC(m: Map<string, [number, "n" | "s"]>, out: string): [number, number] {
  const nums = [...m.entries()]
    .filter(([, v]) => v[1] === "n")
    .map(([k, v]) => [k, v[0]] as [string, number])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const blob: number[] = [];
  const namesOff: number[] = [];
  const flagOff: number[] = [];
  const enc = new TextEncoder();
  for (const [name, off] of nums) {
    namesOff.push(blob.length);
    for (const b of enc.encode(name)) blob.push(b);
    blob.push(0);
    flagOff.push(off);
  }
  const lines: string[] = [
    "// GENERATED by tools/gen_regmap.ts - do not edit",
    "// Roblox fast-var name -> RobloxLib storage offset (numeric flags only)",
    "#include <stdint.h>",
    `const unsigned RBX_NREG = ${nums.length};`,
    "const char RBX_NAMES[] =",
  ];
  const CH = 4000;
  for (let i = 0; i < blob.length; i += CH) {
    let lit = "";
    for (const b of blob.slice(i, i + CH)) lit += "\\" + b.toString(8).padStart(3, "0");
    lines.push(`"${lit}"`);
  }
  lines.push(";");
  const arr = (nm: string, vals: number[]) => {
    lines.push(`const unsigned ${nm}[] = {`);
    let line = "";
    for (const v of vals) {
      line += v + ",";
      if (line.length > 110) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    lines.push("};");
  };
  arr("RBX_NAMEOFF", namesOff);
  arr("RBX_FLAGOFF", flagOff);
  require("fs").writeFileSync(out, lines.join("\n"));
  return [nums.length, [...m.values()].filter((v) => v[1] === "s").length];
}

const [, , inp, outArg] = process.argv;
if (!inp) {
  console.error("usage: bun tools/gen_regmap.ts <Roblox.ipa | RobloxLib> [out_regmap.c]");
  process.exit(1);
}
const out = outArg ?? require("path").join(import.meta.dir, "..", "tweak", "regmap.c");
const m = buildMap(thin(loadRobloxLib(inp)));
const [n, nstr] = emitC(m, out);
console.log(`wrote ${out}: ${n} numeric flags (${nstr} strings excluded)`);
if (!m.has("TaskSchedulerTargetFps")) throw new Error("self-check failed: TargetFps missing");
console.log(
  `self-check ok: TaskSchedulerTargetFps -> 0x${m.get("TaskSchedulerTargetFps")![0].toString(16)}`,
);
