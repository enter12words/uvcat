/**
 * home.js — article list view (the "Home" menu).
 */

import { renderPage, icons, articleTime } from './layout.js';
import { esc, formatDate, truncate, envStr } from '../lib/utils.js';
import { readingTime, markdownToText } from '../lib/markdown.js';

/**
 * @param {object} opts
 * @param {{ posts: any[], page: number, total: number, perPage: number, totalPages: number }} opts.data
 * @param {Record<string, any>} opts.env
 * @param {Request} opts.request
 * @param {boolean} [opts.isAdmin]
 */
export function renderHome({ data, env, request, isAdmin = false }) {
  const blogName = envStr(env, 'BLOG_NAME', 'My Blog');
  const description = envStr(env, 'BLOG_DESCRIPTION', '记录与分享');

  const cards = data.posts
    .map((post) => {
      const summary = post.summary
        ? esc(post.summary)
        : esc(truncate(markdownToText(post.content ?? ''), 160));
      const minutes = readingTime(post.content ?? post.summary ?? '');
      const href = `/p/${encodeURIComponent(post.slug)}`;
      return `
        <article>
          <div class="article-details">
            <div class="article-title-wrapper">
              <h2 class="article-title"><a href="${esc(href)}">${esc(post.title)}</a></h2>
              <p class="article-subtitle">${summary}</p>
            </div>
            <div class="article-category">
              <a href="/?category=${encodeURIComponent(post.category || '默认')}">${esc(post.category || '默认')}</a>
            </div>
            ${articleTime({ date: formatDate(post.created_at), reading: minutes })}
            <div>
              <a class="read-more" href="${esc(href)}">阅读全文 ${icons.arrowRight}</a>
            </div>
          </div>
        </article>`;
    })
    .join('');

  const body = `
    <header class="main-header">
      <h1>${esc(blogName)}</h1>
      <p>${esc(description)} · 共 ${data.total} 篇文章</p>
    </header>

    ${
      data.posts.length
        ? `<section class="article-list">${cards}</section>`
        : `<div class="empty-card">
             <strong>还没有文章</strong>
             前往 <a href="/admin">/admin</a> 写第一篇吧。
           </div>`
    }

    ${renderPagination(data, '/')}
  `;

  return renderPage({
    title: data.page > 1 ? `第 ${data.page} 页` : '',
    description,
    body,
    current: 'home',
    env,
    request,
    isAdmin,
  });
}

/**
 * Pagination widget shared by home / search / category views.
 * @param {{ page: number, totalPages: number }} data
 * @param {string} base  path without query string
 * @param {Record<string, string>} [extra] preserved query params
 */
export function renderPagination(data, base, extra = {}) {
  const { page, totalPages } = data;
  if (totalPages <= 1) return '';

  const url = (n) => {
    const params = new URLSearchParams(extra);
    if (n > 1) params.set('page', String(n));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const pages = [];
  const window = 2;
  const push = (n) => pages.push(n);
  push(1);
  for (let n = Math.max(2, page - window); n <= Math.min(totalPages - 1, page + window); n++) push(n);
  if (totalPages > 1) push(totalPages);

  // de-duplicate and keep sorted
  const uniq = [...new Set(pages)].sort((a, b) => a - b);

  const items = [];
  if (page > 1) items.push(`<a href="${esc(url(page - 1))}" rel="prev">上一页</a>`);
  else items.push(`<span class="disabled">上一页</span>`);

  let last = 0;
  for (const n of uniq) {
    if (n - last > 1) items.push('<span class="disabled">…</span>');
    if (n === page) items.push(`<span class="current">${n}</span>`);
    else items.push(`<a href="${esc(url(n))}">${n}</a>`);
    last = n;
  }

  if (page < totalPages) items.push(`<a href="${esc(url(page + 1))}" rel="next">下一页</a>`);
  else items.push(`<span class="disabled">下一页</span>`);

  return `<nav class="pagination" aria-label="分页">${items.join('')}</nav>`;
}
