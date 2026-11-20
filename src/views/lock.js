/**
 * lock.js — the visitor "enter access password" screen and the admin login.
 *
 * Both screens are intentionally bare: a single centred dark card, no
 * sidebar, no JavaScript required. They are rendered with a minimal shell
 * instead of renderPage() so the lock never leaks the site chrome.
 */

import { esc, envStr } from '../lib/utils.js';

/**
 * Minimal standalone document (no sidebar / footer).
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.content
 * @param {string} [opts.headExtra]
 */
function shell({ title, content, headExtra = '' }) {
  return `<!DOCTYPE html>
<html lang="zh-cn" data-scheme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/style.css">
${headExtra}
</head>
<body class="is-locked">
${content}
</body>
</html>`;
}

const LOCK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><rect x="5" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M8 11v-4a4 4 0 0 1 8 0v4"/></svg>`;

/**
 * Visitor password gate.
 * @param {object} opts
 * @param {Record<string, any>} opts.env
 * @param {string} opts.next        where to go after success (already validated)
 * @param {boolean} [opts.failed]
 */
export function renderLockPage({ env, next, failed = false }) {
  const blogName = envStr(env, 'BLOG_NAME', 'My Blog');

  const content = `
  <div class="lock-screen">
    <div class="lock-card">
      <div class="lock-logo">${LOCK_ICON}</div>
      <h1>请输入访问密码</h1>
      <p>${esc(blogName)} 目前处于访客保护状态</p>
      <form method="POST" action="/gate" autocomplete="off">
        <input type="hidden" name="next" value="${esc(next)}">
        <input type="password" name="password" placeholder="访问密码" aria-label="访问密码" autocomplete="current-password" required autofocus>
        ${failed ? `<p class="lock-error">密码不正确，请重试。</p>` : ''}
        <button type="submit">进入博客</button>
      </form>
      <div class="lock-hint">密码填写过一次，7 天内无需重复输入</div>
    </div>
  </div>`;

  return shell({ title: failed ? '密码错误' : '需要访问密码', content });
}

/**
 * Admin login inside /admin.
 * @param {object} opts
 * @param {Record<string, any>} opts.env
 * @param {boolean} [opts.failed]
 * @param {string} [opts.next]
 */
export function renderAdminLogin({ env, failed = false, next = '/admin' }) {
  const blogName = envStr(env, 'BLOG_NAME', 'My Blog');

  const content = `
  <div class="lock-screen">
    <div class="lock-card">
      <div class="lock-logo">${LOCK_ICON}</div>
      <h1>管理员登录</h1>
      <p>${esc(blogName)} · 控制台</p>
      <form method="POST" action="/admin/login" autocomplete="off">
        <input type="hidden" name="next" value="${esc(next)}">
        <input type="text" name="user" placeholder="用户名" aria-label="用户名" autocomplete="username" required autofocus style="text-align:left;letter-spacing:0">
        <input type="password" name="pass" placeholder="密码" aria-label="密码" autocomplete="current-password" required style="text-align:left;letter-spacing:normal">
        ${failed ? `<p class="lock-error">用户名或密码错误。</p>` : ''}
        <button type="submit">登录</button>
      </form>
      <div class="lock-hint"><a href="/">← 返回博客</a></div>
    </div>
  </div>`;

  return shell({ title: '管理员登录', content });
}

/**
 * Rendered when required environment variables are missing — turns an opaque
 * 500 into actionable instructions.
 * @param {{ missing: string[] }} opts
 */
export function renderSetupPage({ missing }) {
  const rows = missing.map((m) => `<li><code>${esc(m)}</code></li>`).join('');
  const content = `
  <div class="lock-screen">
    <div class="lock-card" style="max-width:520px;text-align:left">
      <div class="lock-logo" style="margin-left:0">${LOCK_ICON}</div>
      <h1 style="text-align:left">还需要配置环境变量</h1>
      <p style="text-align:left">以下环境变量尚未设置，站点无法启动：</p>
      <ul style="font-size:1.4rem;color:#d4d4d4;line-height:2">${rows}</ul>
      <p style="text-align:left;font-size:1.3rem">
        在 Cloudflare Pages 控制台 → Settings → Environment variables 中添加，
        或本地开发时写入 <code>.dev.vars</code>。
      </p>
      <pre style="background:#212121;border:1px solid #3e3e3e;border-radius:6px;padding:14px;overflow:auto;font-size:1.25rem;text-align:left;color:#a8a8a8">npx wrangler pages secret put SITE_PASSWORD --project-name uvcat
npx wrangler pages secret put ADMIN_USER    --project-name uvcat
npx wrangler pages secret put ADMIN_PASS    --project-name uvcat
npx wrangler pages secret put COOKIE_SECRET --project-name uvcat</pre>
    </div>
  </div>`;

  return shell({ title: '缺少环境变量', content });
}
