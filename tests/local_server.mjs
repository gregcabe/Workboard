// Runs the real Worker locally: node tests/local_server.mjs [port]  (Serve-Local.cmd). Key is "local".
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeTurso } from "./fake_turso.mjs";
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { fetchImpl, db } = fakeTurso([path.join(R, "migrations/001_init.sql")]);
globalThis.fetch = fetchImpl;   // the Worker's Turso client calls fetch(); route it to SQLite
const worker = (await import(pathToFileURL(path.join(R, "worker/dist/worker.js")).href)).default;
const env = { APP_KEY: process.env.APP_KEY || "local", TURSO_URL: "https://fake.turso.io", TURSO_TOKEN: "fake" };
const port = Number(process.argv[2] || 8787);
http.createServer(async (req, res) => {
  let body = ""; for await (const chunk of req) body += chunk;
  const r = await worker.fetch(new Request("http://localhost:" + port + req.url, { method: req.method, headers: req.headers, body: body || undefined }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
}).listen(port, () => console.log("Workboard local on http://localhost:" + port + "  (key: " + env.APP_KEY + ")"));
