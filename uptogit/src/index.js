/**
 * index.js — the Hono application.
 *
 * Route map
 *   GET  /                        home (post list, ?page=)
 *   GET  /archives                year timeline
 *   GET  /search?q=               keyword search
 *   GET  /p/:slug                 article + generated TOC
 *   GET  /gate                    visitor password form
 *   POST /gate                    verify SITE_PASSWORD, set site_auth
 *   GET  /admin                   dashboard (admin_auth required)
 *   POST /admin/login             verify ADMIN_USER / ADMIN_PASS
 *   POST /admin/logout            clear admin_auth
 *   GET  /api/posts               public JSON list
 *   GET  /api/posts/:slug         public JSON single post
 *   GET  /api/admin/posts         admin: list
 *   GET  /api/admin/posts/:slug   admin: single (for editing)
 *   POST /api/admin/posts         admin: create
 *   PUT  /api/admin/posts/:id     admin: update
 *   DEL  /api/admin/posts/:id     admin: delete
 *   POST /api/admin/upload        admin: image → R2
 *   GET  /static/*                static assets (served by the Assets binding)
 *
 * Two independent password locks:
 *   1. site_auth   — every front-of-house page/API
 *   2. admin_auth  — /admin and every mutating /api/admin/* endpoint
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';

import {
  COOKIE_ADMIN,
  COOKIE_SITE,
  buildSessionCookie,
  comparePassword,
  createToken,
  readSession,
} from './lib/auth.js';
import {
  bumpViews,
  createPost,
  dbStatus,
  deletePost,
  getArchives,
  getNeighbours,
  getPostById,
  getPostBySlug,
  getViews,
  listAllPosts,
  listPosts,
  searchPosts,
  updatePost,
  hasDb,
} from './lib/db.js';
import { buildToc, markdownToText, readingTime } from './lib/markdown.js';
import { envStr, makeSlug, safeRedirectTarget, truncate } from './lib/utils.js';

import { renderHome } from './views/home.js';
import { renderPost, renderPostNotFound } from './views/post.js';
import { renderArchives, renderSearch, renderMessage } from './views/archives.js';
import { renderAdminLogin, renderLockPage, renderSetupPage } from './views/lock.js';
import { renderAdmin } from './views/admin.js';

/* ================================================================== */
/*  app                                                                */
/* ================================================================== */

const app = new Hono();

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'HEAD', 'OPTIONS'] }));

/* ------------------------------------------------------------------
   0. Configuration sanity check
   ------------------------------------------------------------------ */
const REQUIRED_VARS = ['SITE_PASSWORD', 'ADMIN_USER', 'ADMIN_PASS'];

app.use('*', async (c, next) => {
  const missing = REQUIRED_VARS.filter((k) => !envStr(c.env, k));
  if (missing.length) {
    return c.html(renderSetupPage({ missing }), 500);
  }
  return next();
});

/* ------------------------------------------------------------------
   1. Static assets — let the Pages Assets binding handle /static/*
      (falls through to the worker if there is no such binding, e.g.
      when running under `wrangler dev`).
   ------------------------------------------------------------------ */
app.use('/static/*', async (c, next) => {
  if (c.env?.ASSETS && typeof c.env.ASSETS.fetch === 'function') {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    if (res && res.status !== 404) {
      // Long-lived immutable caching for the two stylesheets.
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', 'public, max-age=3600');
      return new Response(res.body, { status: res.status, headers });
    }
  }
  return next();
});

/* ------------------------------------------------------------------
   2. Visitor gate — POST /gate must be reachable without site_auth,
      everything else front-of-house requires the cookie.
   ------------------------------------------------------------------ */

/** Paths that bypass the visitor lock entirely. */
function isGateExempt(path) {
  // Gate endpoints themselves
  if (path === '/gate') return true;
  // Admin area has its own lock
  if (path === '/admin' || path.startsWith('/admin/')) return true;
  if (path.startsWith('/api/admin/')) return true;
  if (path === '/api/admin') return true;
  // Health probe
  if (path === '/healthz') return true;
  // Favicon / robots
  if (path === '/favicon.ico' || path === '/robots.txt') return true;
  return false;
}

app.use('*', async (c, next) => {
  const path = c.req.path;

  // Static assets are not secret (they are just CSS + SVGs).
  if (path.startsWith('/static/')) return next();
  if (isGateExempt(path)) return next();

  if (await readSession(c.req.raw, c.env, 'site')) {
    return next();
  }

  // Unauthenticated:
  //  · APIs answer with JSON 401 so fetch()-based callers can react
  //  · pages get the dark password screen
  if (path.startsWith('/api/')) {
    return c.json({ error: 'Site password required', code: 'SITE_LOCKED' }, 401);
  }
  return c.html(renderLockPage({ env: c.env, next: path + new URL(c.req.url).search }), 401);
});

/* ---- gate form ---- */
app.get('/gate', (c) => {
  const next = safeRedirectTarget(c.req.query('next'), '/');
  return c.html(renderLockPage({ env: c.env, next }));
});

app.post('/gate', async (c) => {
  const form = await c.req.parseBody().catch(() => ({}));
  const password = String(form.password ?? '');
  const next = safeRedirectTarget(form.next ?? c.req.query('next'), '/');
  const expected = envStr(c.env, 'SITE_PASSWORD');

  if (!password || !(await comparePassword(password, expected))) {
    return c.html(renderLockPage({ env: c.env, next, failed: true }), 401);
  }

  const ttl = Number(envStr(c.env, 'SESSION_TTL', '604800')) || 604800;
  const token = await createToken(c.env, 'site', { ttl });
  // 7-day cookie as required by the brief.
  c.header('Set-Cookie', buildSessionCookie(c.req.raw, 'site', token, 7 * 24 * 3600));
  return c.redirect(next || '/', 302);
});

/* ------------------------------------------------------------------
   3. Front of house
   ------------------------------------------------------------------ */

app.get('/', async (c) => {
  if (!hasDb(c.env)) {
    return c.html(
      renderMessage({
        title: '数据库未配置',
        message: '缺少 D1 绑定 <code>DB</code>。请参考 README 完成部署。',
        env: c.env,
        request: c.req.raw,
      }),
      500,
    );
  }
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const category = c.req.query('category') || '';
  const data = await listPosts(c.env, { page, perPage: 10, category });
  const isAdmin = Boolean(await readSession(c.req.raw, c.env, 'admin'));
  return c.html(renderHome({ data, env: c.env, request: c.req.raw, isAdmin }));
});

app.get('/archives', async (c) => {
  const groups = await getArchives(c.env);
  const isAdmin = Boolean(await readSession(c.req.raw, c.env, 'admin'));
  return c.html(renderArchives({ groups, env: c.env, request: c.req.raw, isAdmin }));
});

app.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const results = q ? await searchPosts(c.env, q, 50) : [];
  const isAdmin = Boolean(await readSession(c.req.raw, c.env, 'admin'));
  return c.html(renderSearch({ query: q, results, env: c.env, request: c.req.raw, isAdmin }));
});

app.get('/p/:slug', async (c) => {
  const slug = c.req.param('slug');
  const post = await getPostBySlug(c.env, slug);
  const isAdmin = Boolean(await readSession(c.req.raw, c.env, 'admin'));

  if (!post) {
    return c.html(renderPostNotFound({ env: c.env, request: c.req.raw, isAdmin }), 404);
  }

  const [neighbours, views] = await Promise.all([getNeighbours(c.env, post), bumpViews(c.env, slug)]);
  return c.html(renderPost({ post, neighbours, views, env: c.env, request: c.req.raw, isAdmin }));
});

app.get('/healthz', (c) => c.json({ ok: true, ts: Date.now() }));

app.get('/robots.txt', (c) =>
  c.text('User-agent: *\nDisallow: /\n', 200, { 'Content-Type': 'text/plain; charset=utf-8' }),
);

/* ------------------------------------------------------------------
   4. Public JSON API (still behind the visitor lock)
   ------------------------------------------------------------------ */
app.get('/api/posts', async (c) => {
  const page = Number(c.req.query('page') ?? 1) || 1;
  const data = await listPosts(c.env, { page, perPage: 20 });
  return c.json({
    ok: true,
    page: data.page,
    total: data.total,
    totalPages: data.totalPages,
    posts: data.posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      summary: p.summary,
      category: p.category,
      created_at: p.created_at,
      updated_at: p.updated_at,
    })),
  });
});

app.get('/api/posts/:slug', async (c) => {
  const post = await getPostBySlug(c.env, c.req.param('slug'));
  if (!post) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({
    ok: true,
    post: {
      ...post,
      toc: buildToc(post.content ?? ''),
      reading_time: readingTime(post.content ?? ''),
      views: await getViews(c.env, post.slug),
    },
  });
});

/* ================================================================== */
/*  ADMIN                                                             */
/* ================================================================== */

/* ---- login / logout (no admin_auth required) ---- */

app.get('/admin', async (c) => {
  const session = await readSession(c.req.raw, c.env, 'admin');
  if (!session) {
    return c.html(renderAdminLogin({ env: c.env }), 401);
  }

  const [posts, status] = await Promise.all([listAllPosts(c.env), dbStatus(c.env)]);
  const activeSlug = c.req.query('edit') || null;
  return c.html(renderAdmin({ posts, env: c.env, status, activeSlug }));
});

app.post('/admin/login', async (c) => {
  const form = await c.req.parseBody().catch(() => ({}));
  const user = String(form.user ?? '');
  const pass = String(form.pass ?? '');
  const next = safeRedirectTarget(form.next ?? '/admin', '/admin');

  const okUser = await comparePassword(user, envStr(c.env, 'ADMIN_USER'));
  const okPass = await comparePassword(pass, envStr(c.env, 'ADMIN_PASS'));

  if (!okUser || !okPass) {
    // Small constant delay to blunt trivial brute-forcing.
    await new Promise((r) => setTimeout(r, 400));
    return c.html(renderAdminLogin({ env: c.env, failed: true }), 401);
  }

  const ttl = Number(envStr(c.env, 'SESSION_TTL', '604800')) || 604800;
  const token = await createToken(c.env, 'admin', { ttl, user });
  c.header('Set-Cookie', buildSessionCookie(c.req.raw, 'admin', token, ttl));
  return c.redirect(next.startsWith('/admin') ? next : '/admin', 302);
});

app.post('/admin/logout', (c) => {
  c.header('Set-Cookie', buildSessionCookie(c.req.raw, 'admin', '', 0, { clear: true }));
  if ((c.req.header('Accept') ?? '').includes('text/html')) {
    return c.redirect('/admin', 302);
  }
  return c.json({ ok: true });
});

/* ---- guard for every /api/admin/* route ---- */
app.use('/api/admin/*', async (c, next) => {
  const session = await readSession(c.req.raw, c.env, 'admin');
  if (!session) {
    return c.json({ ok: false, error: 'Unauthorized: admin login required' }, 401);
  }
  return next();
});

/* ---- list ---- */
app.get('/api/admin/posts', async (c) => {
  const posts = await listAllPosts(c.env);
  return c.json({ ok: true, posts });
});

/* ---- single (for the editor) ---- */
app.get('/api/admin/posts/:slug', async (c) => {
  const slug = c.req.param('slug');
  const post = (await getPostBySlug(c.env, slug)) || (await getPostById(c.env, Number(slug)));
  if (!post) return c.json({ ok: false, error: 'Post not found' }, 404);
  return c.json(post);
});

/* ---- create ---- */
app.post('/api/admin/posts', async (c) => {
  if (!hasDb(c.env)) return c.json({ ok: false, error: 'D1 binding DB is missing' }, 500);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = parsePostPayload(body);
  if (parsed.error) return c.json({ ok: false, error: parsed.error }, 400);

  const existing = await getPostBySlug(c.env, parsed.data.slug);
  if (existing) {
    return c.json({ ok: false, error: `Slug "${parsed.data.slug}" 已存在，请换一个` }, 409);
  }

  try {
    const post = await createPost(c.env, parsed.data);
    return c.json({ ok: true, id: post?.id, slug: parsed.data.slug, post }, 201);
  } catch (err) {
    return c.json({ ok: false, error: String(err?.message ?? err) }, 500);
  }
});

/* ---- update ---- */
app.put('/api/admin/posts/:id', async (c) => {
  if (!hasDb(c.env)) return c.json({ ok: false, error: 'D1 binding DB is missing' }, 500);

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ ok: false, error: 'Invalid post id' }, 400);

  const current = await getPostById(c.env, id);
  if (!current) return c.json({ ok: false, error: 'Post not found' }, 404);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ ok: false, error: 'Invalid JSON body' }, 400);

  const parsed = parsePostPayload(body);
  if (parsed.error) return c.json({ ok: false, error: parsed.error }, 400);

  // Slug collision check (another post already owns it)
  if (parsed.data.slug !== current.slug) {
    const clash = await getPostBySlug(c.env, parsed.data.slug);
    if (clash && clash.id !== id) {
      return c.json({ ok: false, error: `Slug "${parsed.data.slug}" 已被其他文章占用` }, 409);
    }
  }

  try {
    const post = await updatePost(c.env, id, parsed.data);
    return c.json({ ok: true, id, slug: parsed.data.slug, post });
  } catch (err) {
    return c.json({ ok: false, error: String(err?.message ?? err) }, 500);
  }
});

/* ---- delete ---- */
app.delete('/api/admin/posts/:id', async (c) => {
  if (!hasDb(c.env)) return c.json({ ok: false, error: 'D1 binding DB is missing' }, 500);

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ ok: false, error: 'Invalid post id' }, 400);

  const removed = await deletePost(c.env, id);
  if (!removed) return c.json({ ok: false, error: 'Post not found' }, 404);
  return c.json({ ok: true, id, slug: removed.slug });
});

/* ---- image upload → R2 ---- */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg'],
  ['image/bmp', 'bmp'],
  ['image/x-icon', 'ico'],
  ['image/vnd.microsoft.icon', 'ico'],
]);

app.post(
  '/api/admin/upload',
  bodyLimit({
    maxSize: MAX_UPLOAD_BYTES,
    onError: (c) => c.json({ ok: false, error: '文件过大（上限 10MB）' }, 413),
  }),
  async (c) => {
    if (!c.env?.BUCKET || typeof c.env.BUCKET.put !== 'function') {
      return c.json({ ok: false, error: 'R2 binding `BUCKET` 未配置' }, 500);
    }

    let form;
    try {
      form = await c.req.parseBody();
    } catch (err) {
      return c.json({ ok: false, error: '无法解析 multipart/form-data: ' + String(err?.message ?? err) }, 400);
    }

    // Accept `file`, `image`, `upload` or `files[0]` — different clients differ.
    let file = form.file ?? form.image ?? form.upload ?? form['files[]'] ?? form.files;
    if (Array.isArray(file)) file = file[0];

    if (!file || typeof file === 'string' || !(file instanceof File)) {
      return c.json({ ok: false, error: '缺少文件字段 `file`' }, 400);
    }

    if (file.size === 0) return c.json({ ok: false, error: '文件为空' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json({ ok: false, error: '文件过大（上限 10MB）' }, 413);
    }

    let mime = (file.type || '').toLowerCase().split(';')[0].trim();
    let ext = ALLOWED_MIME.get(mime);
    if (!ext) {
      // Fall back to the filename extension for clients that send an empty type.
      const nameExt = (file.name || '').split('.').pop()?.toLowerCase() ?? '';
      if (/^(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/.test(nameExt)) {
        ext = nameExt === 'jpeg' ? 'jpg' : nameExt;
        mime = mime || 'application/octet-stream';
      } else {
        return c.json({ ok: false, error: `不支持的图片类型: ${file.type || 'unknown'}` }, 415);
      }
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const id = crypto.randomUUID();
    const key = `${yyyy}/${mm}/${id}.${ext}`;

    const bytes = await file.arrayBuffer();

    try {
      await c.env.BUCKET.put(key, bytes, {
        httpMetadata: {
          contentType: mime && mime !== 'application/octet-stream' ? mime : `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          cacheControl: 'public, max-age=31536000, immutable',
        },
        customMetadata: {
          uploaded: now.toISOString(),
          original: (file.name || '').slice(0, 200),
        },
      });
    } catch (err) {
      return c.json({ ok: false, error: 'R2 写入失败: ' + String(err?.message ?? err) }, 500);
    }

    const base = envStr(c.env, 'R2_PUBLIC_URL').replace(/\/+$/, '');
    const url = base ? `${base}/${key}` : `/api/images/${key}`;

    return c.json({ ok: true, success: true, key, url, size: file.size, type: mime }, 201);
  },
);

/**
 * Fallback image proxy for deployments that have no public R2 domain:
 * /api/images/2026/11/<uuid>.png streams the object straight from R2.
 * (Only active when R2_PUBLIC_URL is empty.)
 */
app.get('/api/images/:yyyy/:mm/:file', async (c) => {
  const base = envStr(c.env, 'R2_PUBLIC_URL');
  if (base) return c.redirect(`${base.replace(/\/+$/, '')}/${c.req.param('yyyy')}/${c.req.param('mm')}/${c.req.param('file')}`, 302);

  if (!c.env?.BUCKET) return c.json({ ok: false, error: 'R2 binding missing' }, 500);
  const key = `${c.req.param('yyyy')}/${c.req.param('mm')}/${c.req.param('file')}`;
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers });
});

/* ================================================================== */
/*  helpers                                                            */
/* ================================================================== */

/**
 * Validate and normalise the post payload coming from the admin form.
 * @param {any} body
 * @returns {{ data?: { title:string, slug:string, summary:string|null, content:string, category:string, created_at?:string }, error?: string }}
 */
function parsePostPayload(body) {
  const title = String(body.title ?? '').trim();
  const rawSlug = String(body.slug ?? '').trim();
  const content = String(body.content ?? '');
  const category = String(body.category ?? '').trim() || '默认';

  if (!title) return { error: '标题不能为空' };
  if (title.length > 300) return { error: '标题过长（最多 300 字）' };
  if (!content.trim()) return { error: '正文不能为空' };
  if (content.length > 1_000_000) return { error: '正文过长' };

  const slug = makeSlug(rawSlug || title);
  if (!slug) return { error: 'Slug 无效，请使用字母、数字或中文' };

  let summary = String(body.summary ?? '').trim();
  if (!summary) summary = truncate(markdownToText(content), 120);
  if (summary.length > 500) summary = summary.slice(0, 500);

  /** @type {any} */
  const data = { title, slug, summary, content, category };

  // optional publishing date
  const created = String(body.created_at ?? '').trim();
  if (created) {
    const d = new Date(created);
    if (!isNaN(d.getTime())) {
      // Store as UTC "YYYY-MM-DD HH:MM:SS" to match SQLite CURRENT_TIMESTAMP.
      data.created_at = d.toISOString().slice(0, 19).replace('T', ' ');
    }
  }

  return { data };
}

/* ================================================================== */
/*  error handling                                                     */
/* ================================================================== */

app.notFound((c) => {
  const path = c.req.path;
  if (path.startsWith('/api/')) {
    return c.json({ ok: false, error: 'Not found' }, 404);
  }
  return c.html(
    renderMessage({
      title: '404',
      message: `页面不存在：<code>${path.replace(/[<>&"]/g, '')}</code><br><a href="/">← 回到首页</a>`,
      env: c.env,
      request: c.req.raw,
    }),
    404,
  );
});

app.onError((err, c) => {
  console.error('[onError]', err?.stack ?? err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ ok: false, error: String(err?.message ?? err) }, 500);
  }
  return c.html(
    renderMessage({
      title: '服务器错误',
      message: `请稍后再试。<br><small>${String(err?.message ?? err).replace(/[<>&]/g, '')}</small>`,
      env: c.env,
      request: c.req.raw,
    }),
    500,
  );
});

export default app;
