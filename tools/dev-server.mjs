#!/usr/bin/env node
/**
 * Local stand-in for `wrangler pages dev`: serves public/, routes /api/* to the compiled Pages Functions
 * in .dev/functions, and backs env.DB with node:sqlite (Node ≥ 22.5). Run via `npm run dev`.
 *
 *   PORT=8788  ADMIN_TOKEN=dev  ADVENT_NOW=2026-12-03T15:00:00Z  NTFY_URL=...  DB_FILE=.dev/advent.sqlite (or :memory:)
 *   ADVENT_EARLY_ACCESS=0|1  (unset: on, because dev builds include drafts; every day opens until Dec 1)
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { extname, join, relative, dirname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const FUNCS = join(ROOT, '.dev', 'functions');
const PORT = Number(process.env.PORT ?? 8788);

// ---- D1 shim ----
const sqlite = new DatabaseSync(process.env.DB_FILE ?? join(ROOT, '.dev', 'advent.sqlite'));
for (const f of readdirSync(join(ROOT, 'migrations')).sort()) sqlite.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'));

class Stmt {
  constructor(sql, params = []) {
    this.sql = sql;
    this.params = params.map((p) => (p === undefined ? null : p));
  }
  bind(...p) {
    return new Stmt(this.sql, p);
  }
  async all() {
    return { results: sqlite.prepare(this.sql).all(...this.params), success: true, meta: {} };
  }
  async first() {
    return sqlite.prepare(this.sql).get(...this.params) ?? null;
  }
  async run() {
    const r = sqlite.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
  }
}
const DB = { prepare: (sql) => new Stmt(sql) };
const env = {
  DB,
  ADMIN_TOKEN: process.env.ADMIN_TOKEN ?? 'dev',
  NTFY_URL: process.env.NTFY_URL,
  ADVENT_NOW: process.env.ADVENT_NOW,
  ADVENT_EARLY_ACCESS: process.env.ADVENT_EARLY_ACCESS,
};

// ---- Function routes from the file tree, Pages-style ([param] segments) ----
function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}
const routes = [];
for (const file of walk(FUNCS)) {
  const segs = relative(FUNCS, file).replace(/\.js$/, '').split(/[\\/]/);
  const names = [];
  const re = new RegExp(
    '^/' +
      segs
        .map((s) => {
          const m = /^\[(\w+)\]$/.exec(s);
          if (m) {
            names.push(m[1]);
            return '([^/]+)';
          }
          return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '/?$',
  );
  routes.push({ re, names, mod: await import(pathToFileURL(file).href) });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const started = Date.now();
  try {
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const method = req.method[0] + req.method.slice(1).toLowerCase();
        const handler = r.mod[`onRequest${method}`] ?? r.mod.onRequest;
        if (!handler) break;
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        const response = await handler({ request, env, params, waitUntil: (p) => p.catch((e) => console.error(e)) });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        console.log(`${req.method} ${url.pathname} ${response.status} ${Date.now() - started}ms`);
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"no route"}');
      return;
    }
    let path = normalize(join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!path.startsWith(PUBLIC)) return res.writeHead(403).end();
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) path = join(PUBLIC, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(path));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, () => {
  console.log(`advent dev server on http://localhost:${PORT}  (admin token: ${env.ADMIN_TOKEN}${env.ADVENT_NOW ? `, clock frozen at ${env.ADVENT_NOW}` : ''})`);
});
