/**
 * build.mjs — zero-dependency bundling step for Cloudflare Pages.
 *
 * The project is written as an ordinary Hono app (src/index.js + ES modules).
 * To make the output trivially deployable as a plain upload
 * (`npx wrangler pages deploy ./public`) everything is bundled into ONE file:
 *
 *        public/_worker.js
 *
 * Cloudflare Pages detects `_worker.js` in the output directory and runs it in
 * "advanced mode", so every request (HTML, API, static) is handled by Hono.
 *
 * How it works:
 *   1. parse every `import` / `export` in src/**\/*.js
 *   2. resolve each specifier — relative file paths first, then bare package
 *      names looked up in ./node_modules
 *   3. emit ONE file with a tiny CommonJS-style module registry
 *
 * No npm install, no esbuild, no network access needed at build time:
 * `hono` is the only runtime dependency and it ships as plain ES modules.
 */

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entry = resolve(root, 'src/index.js');
const outfile = resolve(root, 'public/_worker.js');

const require = createRequire(import.meta.url);

/**
 * Extra places to look for packages, used only during local development on the
 * original machine (the sibling `here/` checkout). Cloudflare Pages installs
 * the real dependencies with `npm install`, so this list is irrelevant there.
 */
const extraPaths = [resolve(root, '..', 'here', 'node_modules')].filter((p) => existsSync(p));

/* ------------------------------------------------------------------ */
/*  module resolution                                                  */
/* ------------------------------------------------------------------ */

function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function resolveModule(spec, fromFile) {
  const bases = [dirname(fromFile), resolve(root, 'node_modules'), ...extraPaths];
  const pkgName = packageName(spec);
  const sub = spec.slice(pkgName.length).replace(/^\/+/, '');

  for (const base of bases) {
    const pkgDir = join(base, pkgName);
    const pjPath = join(pkgDir, 'package.json');
    if (!existsSync(pjPath)) continue;

    let pkg = {};
    try {
      pkg = JSON.parse(readFileSync(pjPath, 'utf8'));
    } catch {
      continue;
    }
    const key = sub ? './' + sub : '.';
    const pick = (v) =>
      typeof v === 'string' ? v : v && typeof v === 'object' ? v.import || v.default || v.require : null;

    const exp = pkg.exports;
    if (exp && typeof exp === 'object' && !Array.isArray(exp)) {
      const direct = pick(exp[key]);
      if (direct) return join(pkgDir, direct);
      for (const [k, v] of Object.entries(exp)) {
        if (!k.includes('*')) continue;
        const [pre, post] = k.split('*');
        if (key.startsWith(pre) && key.endsWith(post ?? '')) {
          const target = pick(v);
          if (typeof target === 'string') {
            return join(pkgDir, target.replace('*', key.slice(pre.length, key.length - (post?.length ?? 0))));
          }
        }
      }
    }

    const candidates = sub
      ? [join(pkgDir, sub), join(pkgDir, sub + '.js'), join(pkgDir, sub, 'index.js'), join(pkgDir, sub, 'index.js')]
      : [pkg.module, pkg.main, 'index.js'].filter(Boolean).flatMap((c) => [join(pkgDir, c), join(pkgDir, c + '.js')]);

    for (const c of candidates) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
  }
  return null;
}

function resolveImport(spec, fromFile) {
  if (spec.startsWith('.') || spec.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(spec)) {
    const p = resolve(dirname(fromFile), spec);
    for (const c of [p, p + '.js', join(p, 'index.js')]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    throw new Error(`Cannot resolve relative import "${spec}" from ${fromFile}`);
  }
  const found = resolveModule(spec, fromFile);
  if (!found) throw new Error(`Cannot resolve package "${spec}" from ${fromFile}`);
  return found;
}

const ids = new Map();
const order = [];
const idOf = (abs) => {
  if (!ids.has(abs)) {
    ids.set(abs, 'm' + order.length);
    order.push(abs);
  }
  return ids.get(abs);
};

/* ------------------------------------------------------------------ */
/*  ES module -> registry module                                       */
/* ------------------------------------------------------------------ */

function namedList(inner) {
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [a, b] = s.split(/\s+as\s+/).map((x) => x.trim());
      return [a, b || a];
    });
}

async function transform(abs) {
  let code = await readFile(abs, 'utf8');
  const head = [];
  const tail = [];

  // import ... from '...'   (single line only — see the multi-line rule below)
  code = code.replace(/^[ \t]*import\s+([^\n]*?)\s+from\s+(['"])([^'"\n]+)\2[ \t]*;?/gm, (m, clause, q, spec) => {
    const id = idOf(resolveImport(spec, abs));
    let c = clause.trim();
    c = c.replace(/^type\s+/, '').trim();
    if (c.startsWith('*')) {
      head.push(`const ${c.slice(1).replace(/^\s*as\s*/, '').trim()} = __req('${id}');`);
    } else if (c.startsWith('{') && c.endsWith('}')) {
      head.push(`const { ${namedList(c.slice(1, -1)).map(([a, b]) => (a === b ? a : `${a} : ${b}`)).join(', ')} } = __req('${id}');`);
    } else if (/^[A-Za-z_$][\w$]*(\s*,\s*\{[^}]*\})?$/.test(c) && !c.includes('=')) {
      const [def, ...rest] = c.split(',');
      head.push(`const ${def.trim()} = __req('${id}').default;`);
      const r = rest.join(',').trim();
      if (r.startsWith('{')) {
        head.push(`const { ${namedList(r.slice(1, -1)).map(([a, b]) => (a === b ? a : `${a} : ${b}`)).join(', ')} } = __req('${id}');`);
      }
    } else {
      // Already-transformed / malformed clause (e.g. a leftover "= __req(...)").
      // Keep it verbatim and restore the line break the regex swallowed.
      head.push(c + '\n');
    }
    return '';
  });

  // side-effect import 'x'
  code = code.replace(/^[ \t]*import\s+(['"])([^'"\n]+)\1[ \t]*;?/gm, (m, q, spec) =>
    `__req('${idOf(resolveImport(spec, abs))}');`,
  );

  // multi-line `import {` clauses: the specifier is on a later line, so the
  // single-line rule above cannot see it.  Match the whole statement instead
  // and rebuild it as one line — it keeps the generated output stable, which
  // matters because the single-line rule runs again over our own output.
  code = code.replace(/^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"\n]+)\2[ \t]*;?/gm, (m, inner, q, spec) => {
    const id = idOf(resolveImport(spec, abs));
    const names = namedList(inner).map(([a, b]) => (a === b ? a : `${a} : ${b}`)).join(', ');
    return `const { ${names} } = __req('${id}');`;
  });

  // export * from / export { } from
  code = code.replace(/^[ \t]*export\s+\*\s+from\s+(['"])([^'"]+)\1[ \t]*;?/gm, (m, q, spec) =>
    `Object.assign(exports, __req('${idOf(resolveImport(spec, abs))}'));`,
  );
  code = code.replace(/^[ \t]*export\s*\{([^}]*)\}\s*from\s*(['"])([^'"]+)\2[ \t]*;?/gm, (m, inner, q, spec) => {
    const id = idOf(resolveImport(spec, abs));
    const list = namedList(inner).map(([a, b]) => `${b}: __req('${id}').${a}`);
    return `Object.assign(exports, { ${list.join(', ')} });`;
  });

  // export declarations -> hoisted plain declarations + trailing assignments
  const exported = [];
  code = code.replace(/^[ \t]*export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (m, kind, name) => {
    exported.push([name, name]);
    return `${kind} ${name}`;
  });
  code = code.replace(/^[ \t]*export\s*\{([^}]*)\}?[ \t]*(;|$)/gm, (m, inner) => {
    for (const [a, b] of namedList(inner)) exported.push([a, b]);
    return '';
  });
  code = code.replace(/^[ \t]*export\s+default\s+/gm, 'exports.default = ');

  for (const [local, out] of exported) tail.push(`exports.${out} = ${local};`);

  return `${head.join('\n')}\n${code}\n${tail.join('\n')}\n`;
}

async function main() {
  await mkdir(resolve(root, 'public'), { recursive: true });
  const started = Date.now();

  idOf(entry);
  const defs = [];
  for (let i = 0; i < order.length; i++) {
    const abs = order[i];
    defs.push(`__defs[${JSON.stringify(ids.get(abs))}] = function (exports, __req) {\n${await transform(abs)}\n};`);
  }

  const bundle = `/* Generated by scripts/build.mjs — do not edit. Source lives in ./src */
const __defs = {}, __cache = {};
function __req(id) {
  const cached = __cache[id];
  if (cached) return cached;
  const exports = (__cache[id] = {});
  __defs[id](exports, __req);
  return exports;
}
${defs.join('\n')}
const __root = __req('${ids.get(entry)}');
const __default = __root.default ?? __root;

function __isHono(x) {
  return (
    x &&
    typeof x.fetch === 'function' &&
    x.router &&
    typeof x.getPath === 'function' &&
    typeof x.routes !== 'undefined' &&
    typeof x.use === 'function'
  );
}

// 1. a Hono app  -> pass it straight through (Pages calls .fetch on it)
// 2. a worker { fetch } -> also fine
// 3. a bare fetch function -> wrap it
export default __isHono(__default) || typeof __default.fetch === 'function'
  ? __default
  : typeof __default === 'function'
    ? { fetch: __default }
    : (() => {
        throw new Error('build: entry module does not export a Hono app or a fetch handler');
      })();
`;

  await writeFile(outfile, bundle, 'utf8');
  const info = await stat(outfile);
  console.log(
    `✓ bundled ${order.length} modules → public/_worker.js (${(info.size / 1024).toFixed(1)} KB, ${Date.now() - started} ms)`,
  );
  console.log('✓ deploy with:  npx wrangler pages deploy ./public --project-name=uvcat');
}

main().catch((err) => {
  console.error('\n✗ build failed:', err?.message ?? err);
  if (existsSync(outfile)) {
    console.error(
      '! Keeping the previously generated public/_worker.js.\n' +
        '  Nothing was rebuilt, so changes in src/ are NOT included.\n' +
        '  Run `npm install` (needs the `hono` package) and build again.',
    );
    process.exitCode = 0;
  } else {
    process.exitCode = 1;
  }
});
