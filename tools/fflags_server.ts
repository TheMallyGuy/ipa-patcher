#!/usr/bin/env bun
/**
 * Tiny LAN server to control Roblox FFlags from this PC.
 *
 *   bun tools/fflags_server.ts [port]     (default 8777, binds 0.0.0.0)
 *
 * Open http://localhost:8777 to edit flags. The RBXFFlags dylib fetches
 * GET /fflags.json each apply cycle (launch + every few seconds), so edits
 * take effect on the next cycle for live-read flags (FPS, render distances,
 * Debug*). Startup-latched flags need a Roblox relaunch.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CONF = join(import.meta.dir, "fflags.json");
const PORT = Number(process.argv[2] ?? 8777);

const DEFAULT = {
  DFIntTaskSchedulerTargetFps: "240",
  FIntFRMMinGrassDistance: "100",
  FFlagDebugSkyGray: "true",
  DFFlagDisableDPIScale: "true",
};

function load(): string {
  if (!existsSync(CONF)) save(JSON.stringify(DEFAULT, null, 2));
  return readFileSync(CONF, "utf8");
}
function save(text: string) {
  JSON.parse(text); // validate; throws on bad JSON
  writeFileSync(CONF, text);
}

const PAGE = `<!doctype html><meta charset=utf-8>
<title>Roblox FFlags</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}
 textarea{width:100%;height:60vh;font:13px/1.4 ui-monospace,Menlo,monospace;background:#1b1b1b;color:#eee;border:1px solid #333;border-radius:8px;padding:12px;box-sizing:border-box}
 button{font:600 14px sans-serif;padding:10px 18px;border:0;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer}
 #msg{margin-left:12px}
 h1{font-size:18px}
 code{background:#222;padding:2px 6px;border-radius:4px}
</style>
<h1>Roblox FFlags</h1>
<p>Edit JSON, Save. Device applies on next cycle. Type prefixes (<code>DFInt</code>/<code>FFlag</code>...) optional.</p>
<textarea id=t></textarea><br><br>
<button onclick=save()>Save</button><span id=msg></span>
<script>
 fetch('/fflags.json').then(r=>r.text()).then(t=>{try{t=JSON.stringify(JSON.parse(t),null,2)}catch(e){};document.getElementById('t').value=t});
 function save(){
   fetch('/save',{method:'POST',body:document.getElementById('t').value})
   .then(r=>r.text()).then(t=>{document.getElementById('msg').textContent=t})
   .catch(e=>document.getElementById('msg').textContent='error: '+e);
 }
</script>
`;

const CORS = { "Access-Control-Allow-Origin": "*" };

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.startsWith("/fflags.json")) {
      try {
        return new Response(load(), { headers: { "Content-Type": "application/json", ...CORS } });
      } catch (e) {
        return new Response(String(e), { status: 500, headers: CORS });
      }
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
    }
    if (req.method === "POST" && url.pathname === "/save") {
      const raw = await req.text();
      try {
        save(raw);
        return new Response("saved OK", { headers: CORS });
      } catch (e) {
        return new Response("invalid JSON: " + (e as Error).message, { status: 400, headers: CORS });
      }
    }
    return new Response("not found", { status: 404, headers: CORS });
  },
});

load(); // seed default
console.log(`FFlags server on http://0.0.0.0:${PORT}  (editor: http://localhost:${PORT})`);
console.log(`config file: ${CONF}`);
