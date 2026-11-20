/**
 * archives.js — year-grouped timeline + search page.
 */

import { renderPage, icons } from './layout.js';
import { esc, formatDate, monthDayOf, envStr } from '../lib/utils.js';
import { readingTime, markdownToText } from '../lib/markdown.js';
import { renderPagination } from './home.js';

/**
 * @param {object} opts
 * @param {{ year: number, posts: any[] }[]} opts.groups
 * @param {Record<string, any>} opts.env
 * @param {Request} opts.request
 * @param {boolean} [opts.isAdmin]
 */
export function renderArchives({ groups, env, request, isAdmin = false }) {
  const total = groups.reduce((n, g) => n + g.posts.length, 0);

  const timeline = groups
    .map(
      (g) => `
      <section class="archive-year">
        <h2>${g.year || 'Unknown'}</h2>
        <ul>
          ${g.posts
            .map(
              (p) => `
            <li>
              <a href="/p/${encodeURIComponent(p.slug)}">
                <span class="archive-date">${esc(monthDayOf(p.created_at))}</span>
                <span class="archive-title">${esc(p.title)}</span>
              </a>
            </li>`,
            )
            .join('')}
        </ul>
      </section>`,
    )
    .join('');

  const body = `
    <header class="main-header">
      <h1>Archives</h1>
      <p>共 ${total} 篇文章，按年份归档</p>
    </header>
    ${
      total
        ? timeline
        : `<div class="empty-card"><strong>归档为空</strong>还没有任何文章。</div>`
    }`;

  return renderPage({
    title: 'Archives',
    description: '按年份归档的文章时间轴',
    body,
    current: 'archives',
    env,
    request,
    isAdmin,
  });
}

/**
 * Highlight every occurrence of the query inside a snippet.
 * @param {string} text
 * @param {string} q
 */
function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const needle = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return safe.replace(new RegExp(needle, 'gi'), (m) => `<mark>${m}</mark>`);
  } catch {
    return safe;
  }
}

/**
 * Pull a snippet of ±60 chars around the first match.
 * @param {string} content
 * @param {string} q
 */
function snippet(content, q) {
  const text = markdownToText(content ?? '');
  if (!q) return text.slice(0, 140);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text.slice(0, 140);
  const start = Math.max(0, idx - 50);
  return (start > 0 ? '…' : '') + text.slice(start, idx + q.length + 80) + '…';
}

/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {any[]} opts.results
 * @param {Record<string, any>} opts.env
 * @param {Request} opts.request
 * @param {boolean} [opts.isAdmin]
 */
export function renderSearch({ query, results, env, request, isAdmin = false }) {
  const q = query ?? '';

  const list = results
    .map((p) => {
      const snippetText = snippet(p.content ?? p.summary ?? '', q);
      return `
        <article>
          <a href="/p/${encodeURIComponent(p.slug)}">
            <div class="article-details">
              <h2 class="article-title">${highlight(p.title, q)}</h2>
              <p class="article-subtitle">${highlight(snippetText, q)}</p>
            </div>
            <span class="article-time">${esc(formatDate(p.created_at))}</span>
          </a>
        </article>`;
    })
    .join('');

  const body = `
    <header class="main-header">
      <h1>Search</h1>
      <p>在标题、摘要与正文中搜索关键词</p>
    </header>

    <form class="search-form" action="/search" method="get" role="search">
      <input type="search" name="q" value="${esc(q)}" placeholder="输入关键词，回车搜索…" aria-label="搜索关键词" autofocus>
      <button type="submit">搜索</button>
    </form>

    ${
      q
        ? `<p class="search-meta">关键词 <mark>${esc(q)}</mark> 共找到 <strong>${results.length}</strong> 条结果</p>`
        : ''
    }

    ${
      results.length
        ? `<section class="article-list article-list--compact">${list}</section>`
        : q
          ? `<div class="empty-card"><strong>没有找到结果</strong>换个关键词试试？</div>`
          : `<div class="empty-card"><strong>开始搜索</strong>输入关键词后按回车即可。</div>`
    }
  `;

  return renderPage({
    title: q ? `搜索: ${q}` : 'Search',
    description: '站内搜索',
    body,
    current: 'search',
    env,
    request,
    isAdmin,
  });
}

/**
 * Generic error / setup page.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {Record<string, any>} opts.env
 * @param {Request} [opts.request]
 */
export function renderMessage({ title, message, env, request }) {
  const body = `
    <div class="empty-card">
      <strong>${esc(title)}</strong>
      ${message}
    </div>`;
  return renderPage({ title, body, env, request });
}
