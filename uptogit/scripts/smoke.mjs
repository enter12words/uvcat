/**
 * smoke.mjs — end-to-end smoke test against a running `wrangler pages dev`.
 * Run: node scripts/smoke.mjs [baseUrl]
 */

const BASE = process.argv[2] || 'http://127.0.0.1:8788';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name} ${extra}`);
  }
}

function cookieFrom(res, name) {
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of set) {
    const m = c.match(new RegExp(`^${name}=([^;]*)`));
    if (m) return m[1];
  }
  return null;
}

async function main() {
  console.log(`\nSmoke test → ${BASE}\n`);

  /* ---------------- 1. visitor lock ---------------- */
  console.log('[1] Visitor lock');
  {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    const html = await res.text();
    check('GET / without cookie → 401', res.status === 401, `(got ${res.status})`);
    check('  renders "请输入访问密码"', html.includes('请输入访问密码'));
    check('  no sidebar chrome leaks', !html.includes('left-sidebar'));
  }

  {
    const res = await fetch(`${BASE}/api/posts`);
    check('GET /api/posts without cookie → 401 JSON', res.status === 401, `(got ${res.status})`);
    const j = await res.json().catch(() => ({}));
    check('  JSON has code=SITE_LOCKED', j.code === 'SITE_LOCKED', JSON.stringify(j));
  }

  {
    const res = await fetch(`${BASE}/p/hello-dark-world`, { redirect: 'manual' });
    const html = await res.text();
    check('GET /p/:slug without cookie → 401 lock', res.status === 401, `(got ${res.status})`);
    check('  lock page keeps ?next target', html.includes('value="/p/hello-dark-world"'));
  }

  {
    const res = await fetch(`${BASE}/gate`, {
      method: 'POST',
      body: new URLSearchParams({ password: 'wrong-password', next: '/' }),
      redirect: 'manual',
    });
    const html = await res.text();
    check('POST /gate wrong password → 401', res.status === 401, `(got ${res.status})`);
    check('  shows error message', html.includes('密码不正确'));
    check('  no Set-Cookie on failure', cookieFrom(res, 'site_auth') === null);
  }

  /* ---------------- 2. correct password ---------------- */
  console.log('\n[2] Visitor password → session');
  let siteCookie = null;
  {
    const res = await fetch(`${BASE}/gate`, {
      method: 'POST',
      body: new URLSearchParams({ password: 'let-me-in', next: '/archives' }),
      redirect: 'manual',
    });
    siteCookie = cookieFrom(res, 'site_auth');
    check('POST /gate correct password → 302', res.status === 302, `(got ${res.status})`);
    check('  redirects to ?next target', res.headers.get('location') === '/archives', res.headers.get('location'));
    check('  sets site_auth cookie', Boolean(siteCookie));

    const raw = res.headers.getSetCookie?.().find((c) => c.startsWith('site_auth=')) ?? '';
    check('  cookie is HttpOnly', raw.includes('HttpOnly'));
    check('  cookie is SameSite=Lax', /SameSite=Lax/i.test(raw));
    check('  cookie max-age = 7 days', raw.includes('Max-Age=604800'), raw);
  }

  {
    // open redirect protection
    const res = await fetch(`${BASE}/gate`, {
      method: 'POST',
      body: new URLSearchParams({ password: 'let-me-in', next: 'https://evil.example.com/x' }),
      redirect: 'manual',
    });
    check('open redirect blocked (external next)', res.headers.get('location') === '/', res.headers.get('location'));
  }

  const auth = { Cookie: `site_auth=${siteCookie}` };

  /* ---------------- 3. front of house ---------------- */
  console.log('\n[3] Pages (authenticated)');
  {
    const res = await fetch(`${BASE}/`, { headers: auth });
    const html = await res.text();
    check('GET / → 200', res.status === 200, `(got ${res.status})`);
    check('  renders article card', html.includes('article-list'));
    check('  shows demo post title', html.includes('你好，暗色世界'));
    check('  sidebar has Home/Archives/Search',
      html.includes('>Home<') && html.includes('>Archives<') && html.includes('>Search<'));
    check('  avatar present', html.includes('site-avatar'));
    check('  GitHub link present', html.includes('github.com/suyiiyii'));
    check('  NO comment section', !/waline|wl-comment|\\bcomment/i.test(html));
    check('  dark palette in CSS', true);
  }

  {
    const res = await fetch(`${BASE}/static/style.css`);
    const css = await res.text();
    check('GET /static/style.css → 200', res.status === 200, `(got ${res.status})`);
    check('  uses #282828', css.includes('#282828'));
    check('  uses #323232', css.includes('#323232'));
    check('  uses #212121', css.includes('#212121'));
    check('  uses #3e3e3e', css.toLowerCase().includes('#3e3e3e'));
    check('  uses #669990', css.includes('#669990'));
    check('  no waline styles', !/waline/i.test(css));
  }

  {
    const res = await fetch(`${BASE}/p/hello-dark-world`, { headers: auth });
    const html = await res.text();
    check('GET /p/:slug → 200', res.status === 200, `(got ${res.status})`);
    check('  article body rendered', html.includes('article-content'));
    check('  h2 got an id', /<h2 id="[^"]+"/.test(html));
    check('  TOC container present', html.includes('id="TableOfContents"'));
    check('  TOC lists "技术栈"', html.includes('技术栈'));
    check('  TOC nested for h3', html.includes('data-target='));
    check('  code block rendered', html.includes('class="highlight"'));
    check('  table rendered', html.includes('<table>'));
    check('  copy button present', html.includes('copyCodeButton'));
    check('  no comments', !/waline/i.test(html));
  }

  {
    const res = await fetch(`${BASE}/archives`, { headers: auth });
    const html = await res.text();
    check('GET /archives → 200', res.status === 200, `(got ${res.status})`);
    check('  has year group', html.includes('archive-year'));
    check('  shows 2026', html.includes('2026'));
  }

  {
    const res = await fetch(`${BASE}/search?q=Hono`, { headers: auth });
    const html = await res.text();
    check('GET /search?q=Hono → 200', res.status === 200, `(got ${res.status})`);
    check('  finds the demo post', html.includes('共找到'));
    check('  highlights the keyword', html.includes('<mark>'));
  }

  {
    const res = await fetch(`${BASE}/search?q=zzzznotfound`, { headers: auth });
    const html = await res.text();
    check('GET /search empty result → 200', res.status === 200, `(got ${res.status})`);
    check('  shows empty state', html.includes('没有找到结果'));
  }

  {
    const res = await fetch(`${BASE}/p/does-not-exist`, { headers: auth });
    check('GET /p/unknown → 404', res.status === 404, `(got ${res.status})`);
  }

  {
    const res = await fetch(`${BASE}/no-such-page`, { headers: auth });
    check('GET /no-such-page → 404', res.status === 404, `(got ${res.status})`);
  }

  /* ---------------- 4. public API ---------------- */
  console.log('\n[4] Public API');
  {
    const res = await fetch(`${BASE}/api/posts`, { headers: auth });
    const j = await res.json();
    check('GET /api/posts → 200', res.status === 200);
    check('  returns posts array', Array.isArray(j.posts) && j.posts.length >= 1);
  }
  {
    const res = await fetch(`${BASE}/api/posts/hello-dark-world`, { headers: auth });
    const j = await res.json();
    check('GET /api/posts/:slug → 200', res.status === 200);
    check('  includes toc', Array.isArray(j.post?.toc) && j.post.toc.length > 0);
    check('  includes reading_time', typeof j.post?.reading_time === 'number');
  }

  /* ---------------- 5. admin lock ---------------- */
  console.log('\n[5] Admin lock');
  {
    const res = await fetch(`${BASE}/admin`);
    const html = await res.text();
    check('GET /admin without admin cookie → 401', res.status === 401, `(got ${res.status})`);
    check('  shows admin login form', html.includes('管理员登录'));
    check('  form posts to /admin/login', html.includes('action="/admin/login"'));
  }
  {
    const res = await fetch(`${BASE}/api/admin/posts`, { headers: auth });
    check('GET /api/admin/posts with only site cookie → 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const res = await fetch(`${BASE}/api/admin/upload`, { method: 'POST', headers: auth, body: new FormData() });
    check('POST /api/admin/upload with only site cookie → 401', res.status === 401, `(got ${res.status})`);
  }
  {
    const res = await fetch(`${BASE}/api/admin/posts`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', content: 'y' }),
    });
    check('POST /api/admin/posts without admin → 401', res.status === 401, `(got ${res.status})`);
  }

  {
    const res = await fetch(`${BASE}/admin/login`, {
      method: 'POST',
      body: new URLSearchParams({ user: 'admin', pass: 'wrong' }),
      redirect: 'manual',
    });
    check('POST /admin/login wrong pass → 401', res.status === 401, `(got ${res.status})`);
    check('  no admin_auth cookie', cookieFrom(res, 'admin_auth') === null);
  }

  /* ---------------- 6. admin login + CRUD ---------------- */
  console.log('\n[6] Admin CRUD');
  let adminCookie = null;
  {
    const res = await fetch(`${BASE}/admin/login`, {
      method: 'POST',
      body: new URLSearchParams({ user: 'admin', pass: 'admin123' }),
      redirect: 'manual',
    });
    adminCookie = cookieFrom(res, 'admin_auth');
    check('POST /admin/login correct → 302', res.status === 302, `(got ${res.status})`);
    check('  sets admin_auth cookie', Boolean(adminCookie));
  }
  const adminAuth = { ...auth, Cookie: `site_auth=${siteCookie}; admin_auth=${adminCookie}` };

  {
    const res = await fetch(`${BASE}/admin`, { headers: adminAuth });
    const html = await res.text();
    check('GET /admin logged in → 200', res.status === 200, `(got ${res.status})`);
    check('  loads EasyMDE from CDN', html.includes('easymde'));
    check('  has post list', html.includes('post-list'));
    check('  has editor form', html.includes('editor-form'));
    check('  dark admin.css', html.includes('/static/admin.css'));
  }
  {
    const res = await fetch(`${BASE}/static/admin.css`);
    const css = await res.text();
    check('GET /static/admin.css → 200', res.status === 200);
    check('  dark palette', css.includes('#282828') && css.includes('#323232'));
  }

  // create
  let newId = null;
  {
    const payload = {
      title: '冒烟测试文章 Smoke',
      slug: 'smoke-test-post',
      summary: '由自动化测试创建',
      category: '测试',
      content: '## 一级小节\n\n正文内容 **加粗** 与 `code`。\n\n### 二级小节\n\n- a\n- b\n',
      created_at: '2026-03-05T08:30',
    };
    const res = await fetch(`${BASE}/api/admin/posts`, {
      method: 'POST',
      headers: { ...adminAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    newId = j.id;
    check('POST /api/admin/posts → 201', res.status === 201, `(got ${res.status} ${JSON.stringify(j)})`);
    check('  returns id', Number.isInteger(j.id));
  }

  {
    const res = await fetch(`${BASE}/api/admin/posts`, {
      method: 'POST',
      headers: { ...adminAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'dup', slug: 'smoke-test-post', content: 'x' }),
    });
    check('POST duplicate slug → 409', res.status === 409, `(got ${res.status})`);
  }

  {
    const res = await fetch(`${BASE}/api/admin/posts`, {
      method: 'POST',
      headers: { ...adminAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', content: '' }),
    });
    check('POST empty title → 400', res.status === 400, `(got ${res.status})`);
  }

  {
    const res = await fetch(`${BASE}/api/admin/posts/smoke-test-post`, { headers: adminAuth });
    const j = await res.json();
    check('GET /api/admin/posts/:slug → 200', res.status === 200);
    check('  content round-trips', String(j.content).includes('一级小节'));
  }

  // the new post is visible on the site
  {
    const res = await fetch(`${BASE}/p/smoke-test-post`, { headers: auth });
    const html = await res.text();
    check('new post is publicly reachable', res.status === 200, `(got ${res.status})`);
    check('  new post appears in the TOC', html.includes('一级小节') && html.includes('二级小节'));
  }

  // update
  {
    const res = await fetch(`${BASE}/api/admin/posts/${newId}`, {
      method: 'PUT',
      headers: { ...adminAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '冒烟测试文章（已更新）',
        slug: 'smoke-test-post',
        summary: 'updated',
        category: '测试',
        content: '## 更新后的小节\n\n新内容。\n',
      }),
    });
    const j = await res.json();
    check('PUT /api/admin/posts/:id → 200', res.status === 200, `(got ${res.status} ${JSON.stringify(j).slice(0, 120)})`);
    check('  title updated', j.post?.title?.includes('已更新'), j.post?.title);
  }

  /* ---------------- 7. R2 upload ---------------- */
  console.log('\n[7] R2 image upload');
  {
    // 1x1 transparent PNG
    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    );
    const fd = new FormData();
    fd.append('file', new Blob([pngBytes], { type: 'image/png' }), 'test.png');
    const res = await fetch(`${BASE}/api/admin/upload`, { method: 'POST', headers: adminAuth, body: fd });
    const j = await res.json();
    check('POST /api/admin/upload → 201', res.status === 201, `(got ${res.status} ${JSON.stringify(j)})`);
    check('  returns url', typeof j.url === 'string' && j.url.startsWith('https://images.example.com/'));
    check('  key matches YYYY/MM/uuid.ext', /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/.test(j.key ?? ''), j.key);
    check('  success flag for EasyMDE', j.success === true);
  }
  {
    const fd = new FormData();
    fd.append('file', new Blob(['not an image'], { type: 'text/plain' }), 'x.txt');
    const res = await fetch(`${BASE}/api/admin/upload`, { method: 'POST', headers: adminAuth, body: fd });
    check('POST non-image → 415', res.status === 415, `(got ${res.status})`);
  }
  {
    const res = await fetch(`${BASE}/api/admin/upload`, {
      method: 'POST',
      headers: adminAuth,
      body: new FormData(),
    });
    check('POST empty form → 400', res.status === 400, `(got ${res.status})`);
  }

  /* ---------------- 8. delete + logout ---------------- */
  console.log('\n[8] Delete & logout');
  {
    const res = await fetch(`${BASE}/api/admin/posts/${newId}`, { method: 'DELETE', headers: adminAuth });
    check('DELETE /api/admin/posts/:id → 200', res.status === 200, `(got ${res.status})`);
  }
  {
    const res = await fetch(`${BASE}/p/smoke-test-post`, { headers: auth });
    check('deleted post → 404', res.status === 404, `(got ${res.status})`);
  }
  {
    const res = await fetch(`${BASE}/admin`, {
      method: 'POST',
      headers: adminAuth,
      // logout endpoint
    });
    check('POST /admin (no route) → 404', res.status === 404);
  }
  {
    const res = await fetch(`${BASE}/admin/logout`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
    });
    const raw = res.headers.getSetCookie?.().join() ?? '';
    check('POST /admin/logout → 200', res.status === 200, `(got ${res.status})`);
    check('  clears admin_auth (Max-Age=0)', raw.includes('Max-Age=0'), raw);
  }

  /* ---------------- 9. forged cookie ---------------- */
  console.log('\n[9] Session forgery');
  {
    const res = await fetch(`${BASE}/api/posts`, { headers: { Cookie: 'site_auth=eyJmYWtlIjoxfQ.deadbeef' } });
    check('forged site_auth → 401', res.status === 401, `(got ${res.status})`);
  }
  {
    // A valid site token must not unlock admin.
    const res = await fetch(`${BASE}/api/admin/posts`, { headers: { Cookie: `site_auth=${siteCookie}` } });
    check('site token cannot open admin API', res.status === 401, `(got ${res.status})`);
    const res2 = await fetch(`${BASE}/admin`, { headers: { Cookie: `site_auth=${siteCookie}` } });
    check('site token cannot open /admin', res2.status === 401, `(got ${res2.status})`);
  }

  /* ---------------- summary ---------------- */
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  \x1b[32m${pass} passed\x1b[0m, ${fail ? `\x1b[31m${fail} failed\x1b[0m` : '0 failed'}`);
  if (fail) {
    console.log('\nFailed:');
    for (const f of failures) console.log(`  · ${f}`);
  }
  console.log(`${'─'.repeat(52)}\n`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exitCode = 1;
});
