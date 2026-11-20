/**
 * layout.js — HTML shell shared by every public page.
 *
 * Structure mirrors the reference template:
 *
 *   aside.left-sidebar      avatar · blog name · GitHub · Home/Archives/Search
 *   main.main               the page card(s)
 *   aside.right-sidebar     floating TOC (article pages only)
 *
 * The comment section of the original template has been removed entirely.
 */

import { esc, envStr } from '../lib/utils.js';

/* ------------------------------------------------------------------ */
/*  inline SVG icon set (tabler-style, stroke only)                    */
/* ------------------------------------------------------------------ */

export const icons = {
  home: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-home" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><polyline points="5 12 3 12 12 3 21 12 19 12"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/></svg>`,

  archive: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-archive" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><rect x="3" y="4" width="18" height="4" rx="2"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,

  search: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-search" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/></svg>`,

  github: `<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-brand-github" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"/></svg>`,

  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M11.795 21h-6.795a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v4"/><circle cx="18" cy="18" r="4"/><path d="M15 3v4"/><path d="M7 3v4"/><path d="M3 11h16"/><path d="M18 16.496v1.504l1 1"/></svg>`,

  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>`,

  copyright: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><circle cx="12" cy="12" r="9"/><path d="M14.5 9a3.5 3.5 0 1 0 0 6"/></svg>`,

  hash: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><line x1="5" y1="9" x2="19" y2="9"/><line x1="5" y1="15" x2="19" y2="15"/><line x1="11" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="13" y2="20"/></svg>`,

  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><rect x="5" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/><path d="M8 11v-4a4 4 0 0 1 8 0v4"/></svg>`,

  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="15" y1="16" x2="19" y2="12"/><line x1="15" y1="8" x2="19" y2="12"/></svg>`,

  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><line x1="5" y1="12" x2="19" y2="12"/><line x1="9" y1="16" x2="5" y2="12"/><line x1="9" y1="8" x2="5" y2="12"/></svg>`,

  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"/><circle cx="12" cy="12" r="3"/></svg>`,
};

/* ------------------------------------------------------------------ */
/*  sidebar pieces                                                     */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {string} opts.current  'home' | 'archives' | 'search'
 * @param {Record<string, any>} opts.env
 * @param {boolean} [opts.isAdmin]
 */
function renderSidebar({ current, env, isAdmin }) {
  const blogName = envStr(env, 'BLOG_NAME', 'My Blog');
  const description = envStr(env, 'BLOG_DESCRIPTION', '记录与分享');
  const avatar = envStr(env, 'AVATAR_URL', '/static/avatar.svg');
  const github = envStr(env, 'GITHUB_URL', '');

  const menuItems = [
    { key: 'home', href: '/', label: 'Home', icon: icons.home },
    { key: 'archives', href: '/archives', label: 'Archives', icon: icons.archive },
    { key: 'search', href: '/search', label: 'Search', icon: icons.search },
  ];

  const menu = menuItems
    .map(
      (item) => `
        <li class="${current === item.key ? 'current' : ''}">
          <a href="${esc(item.href)}">${item.icon}<span>${esc(item.label)}</span></a>
        </li>`,
    )
    .join('');

  const githubLink = github
    ? `<ol class="menu-social">
         <li>
           <a href="${esc(github)}" target="_blank" rel="me noopener noreferrer" title="GitHub" aria-label="GitHub">
             ${icons.github}
           </a>
         </li>
       </ol>`
    : '';

  return `
    <aside class="sidebar left-sidebar sticky" id="left-sidebar">
      <button class="hamburger" type="button" id="toggle-menu" aria-label="切换菜单" aria-expanded="false">
        <span class="hamburger-box"><span class="hamburger-inner"></span></span>
      </button>

      <header>
        <figure class="site-avatar">
          <a href="/"><img src="${esc(avatar)}" width="300" height="300" class="site-logo" alt="Avatar" loading="lazy"></a>
        </figure>
        <div class="site-meta">
          <h1 class="site-name"><a href="/">${esc(blogName)}</a></h1>
          <h2 class="site-description">${esc(description)}</h2>
        </div>
      </header>

      ${githubLink}

      <nav class="menu-wrapper" aria-label="主导航">
        <ol class="menu" id="main-menu">
          ${menu}
          <li class="menu-bottom-section">
            <ol class="menu">
              <li>
                <a id="admin-link" href="/admin">
                  ${icons.settings}
                  <span>${isAdmin ? 'Dashboard' : 'Admin'}</span>
                </a>
              </li>
            </ol>
          </li>
        </ol>
      </nav>
    </aside>`;
}

/* ------------------------------------------------------------------ */
/*  TOC rendering                                                      */
/* ------------------------------------------------------------------ */

/**
 * Render the right-hand floating table of contents.
 * @param {{ level: number, text: string, id: string }[] | null} toc
 */
export function renderToc(toc) {
  if (!toc || toc.length === 0) return '';

  // Nest h3s under their preceding h2. An h3 that appears before any h2 is
  // promoted to a top-level entry so it can never be silently dropped.
  /** @type {{ id: string, text: string, children: { id: string, text: string }[] }[]} */
  const top = [];
  for (const item of toc) {
    const isTopLevel = item.level === 2 || top.length === 0;
    if (isTopLevel) {
      top.push({ id: item.id, text: item.text, children: [] });
    } else {
      top[top.length - 1].children.push({ id: item.id, text: item.text });
    }
  }

  const list = top
    .map((node) => {
      const sub = node.children.length
        ? `<ol>${node.children
            .map((c) => `<li data-target="${esc(c.id)}"><a href="#${esc(c.id)}">${esc(c.text)}</a></li>`)
            .join('')}</ol>`
        : '';
      return `<li data-target="${esc(node.id)}"><a href="#${esc(node.id)}">${esc(node.text)}</a>${sub}</li>`;
    })
    .join('');

  return `
    <aside class="sidebar right-sidebar sticky">
      <section class="widget widget--toc">
        <div class="widget-icon">${icons.hash}</div>
        <h2 class="widget-title section-title">目录</h2>
        <div class="widget--toc-body">
          <nav id="TableOfContents" aria-label="文章目录">
            <ol>${list}</ol>
          </nav>
        </div>
      </section>
    </aside>`;
}

/* ------------------------------------------------------------------ */
/*  page shell                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {string} opts.title       full <title>
 * @param {string} opts.body        main column HTML
 * @param {string} [opts.description]
 * @param {string} [opts.current]   sidebar active key
 * @param {string|null} [opts.toc]  pre-rendered right sidebar
 * @param {Record<string, any>} opts.env
 * @param {Request} [opts.request]
 * @param {string} [opts.bodyClass]
 * @param {boolean} [opts.isAdmin]
 * @param {string} [opts.scripts]   extra <script> tags
 */
export function renderPage(opts) {
  const {
    title,
    body,
    description = '',
    current = '',
    toc = null,
    env,
    request,
    bodyClass = '',
    isAdmin = false,
    scripts = '',
  } = opts;

  const blogName = envStr(env, 'BLOG_NAME', 'My Blog');
  const fullTitle = title ? `${title} · ${blogName}` : blogName;
  const year = new Date().getUTCFullYear();
  const startYear = envStr(env, 'BLOG_START_YEAR', '');

  // Absolute canonical URL when we can determine the origin.
  let canonical = '';
  if (request) {
    try {
      canonical = new URL(request.url).origin + new URL(request.url).pathname;
    } catch {
      canonical = '';
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-cn" data-scheme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(description || blogName)}">
<title>${esc(fullTitle)}</title>
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#282828">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || blogName)}">
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:site_name" content="${esc(blogName)}">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/style.css">
<script>document.documentElement.dataset.scheme='dark';</script>
</head>
<body class="${esc(bodyClass)}">
<div class="container main-container flex on-phone--column extended">
${renderSidebar({ current, env, isAdmin })}

<main class="main full-width">
${body}
</main>
${toc ?? ''}
</div>

<footer class="site-footer">
  <section class="copyright">© ${startYear ? `${esc(startYear)} - ` : ''}${year} ${esc(blogName)}</section>
  <section class="powerby">Powered by <a href="https://hono.dev" target="_blank" rel="noopener">Hono</a> · Cloudflare D1 &amp; R2</section>
</footer>

<script>${CLIENT_JS}</script>
${scripts}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  shared client script (hamburger, copy buttons, TOC highlight)       */
/* ------------------------------------------------------------------ */

export const CLIENT_JS = `
(function () {
  'use strict';

  /* ---- mobile menu ---- */
  var toggle = document.getElementById('toggle-menu');
  var sidebar = document.getElementById('left-sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      var open = sidebar.classList.toggle('menu-open');
      toggle.classList.toggle('is-active', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---- copy code buttons ---- */
  document.querySelectorAll('.copyCodeButton').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var shell = btn.closest('.highlight');
      var code = shell && shell.querySelector('code');
      if (!code) return;
      var text = code.innerText;
      var done = function () {
        var old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = old; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  /* ---- TOC scroll-spy ---- */
  var tocNav = document.getElementById('TableOfContents');
  if (!tocNav) return;

  var links = Array.prototype.slice.call(tocNav.querySelectorAll('li[data-target]'));
  var targets = links
    .map(function (li) {
      var el = document.getElementById(li.getAttribute('data-target'));
      return el ? { li: li, el: el } : null;
    })
    .filter(Boolean);

  if (!targets.length) return;

  var current = null;

  function highlight(li) {
    if (current === li) return;
    if (current) current.classList.remove('active-class');
    current = li;
    if (current) current.classList.add('active-class');
  }

  function onScroll() {
    // Pick the last heading whose top has crossed the viewport threshold.
    var threshold = 100;
    var active = targets[0];
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].el.getBoundingClientRect().top <= threshold) active = targets[i];
      else break;
    }
    // At the very bottom of the page always highlight the last heading.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      active = targets[targets.length - 1];
    }
    highlight(active ? active.li : null);
  }

  var ticking = false;
  function requestTick() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      onScroll();
      ticking = false;
    });
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);

  // Clicking a TOC entry trims the hash so the browser does not fight us.
  links.forEach(function (li) {
    var a = li.querySelector('a');
    if (!a) return;
    a.addEventListener('click', function (e) {
      var id = li.getAttribute('data-target');
      var el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      var top = el.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top: top, behavior: 'smooth' });
      try { history.replaceState(null, '', '#' + encodeURIComponent(id)); } catch (err) {}
      highlight(li);
    });
  });

  onScroll();

  // Also react to the initial hash.
  if (location.hash) {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = document.getElementById(id);
    if (el) setTimeout(function () { window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24 }); }, 60);
  }
})();
`;

/* ------------------------------------------------------------------ */
/*  small shared fragments                                             */
/* ------------------------------------------------------------------ */

/**
 * Article time footer (published + reading time + optional views).
 * @param {{ date: string, reading: number, views?: number }} opts
 */
export function articleTime({ date, reading, views }) {
  const viewsBlock =
    typeof views === 'number' && views > 0
      ? `<div>${icons.clock}<time>${views} 次阅读</time></div>`
      : '';
  return `
    <footer class="article-time">
      <div>${icons.calendar}<time class="article-time--published">${esc(date)}</time></div>
      <div>${icons.clock}<time class="article-time--reading">阅读时长: ${reading} 分钟</time></div>
      ${viewsBlock}
    </footer>`;
}

/** The "Licensed under …" footer strip of an article. */
export function articleCopyright() {
  return `
    <footer class="article-footer">
      <section class="article-copyright">
        ${icons.copyright}
        <span>Licensed under CC BY-NC-SA 4.0</span>
      </section>
    </footer>`;
}

/** Copyright holder used by the access-lock page. */
export function footerNote(env) {
  return `© ${new Date().getUTCFullYear()} ${envStr(env, 'BLOG_NAME', 'My Blog')}`;
}
