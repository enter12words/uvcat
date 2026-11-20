/**
 * post.js — article detail view with the generated TOC.
 */

import { renderPage, icons, articleTime, articleCopyright, renderToc } from './layout.js';
import { esc, formatDate, envStr } from '../lib/utils.js';
import { renderMarkdown, readingTime, markdownToText } from '../lib/markdown.js';

/**
 * @param {object} opts
 * @param {any} opts.post
 * @param {{ prev: any|null, next: any|null }} opts.neighbours
 * @param {number} [opts.views]
 * @param {Record<string, any>} opts.env
 * @param {Request} opts.request
 * @param {boolean} [opts.isAdmin]
 */
export function renderPost({ post, neighbours = { prev: null, next: null }, views = 0, env, request, isAdmin = false }) {
  const slug = post.slug;
  const href = `/p/${encodeURIComponent(slug)}`;

  // Render once and collect the headings on the way: the ids in the article
  // body and the ids in the right-hand sidebar then come from the same pass and
  // can never disagree (and no heading gets a spurious "-2" suffix).
  const collected = [];
  const html = renderMarkdown(post.content ?? '', { collect: collected });
  const toc = collected.filter((h) => h.level === 2 || h.level === 3);

  const minutes = readingTime(post.content ?? '');
  const description = post.summary || markdownToText(post.content ?? '').slice(0, 150);
  const published = formatDate(post.created_at);
  const updated = formatDate(post.updated_at);
  const showUpdated = updated && updated !== published;

  const related = [];
  if (neighbours.next) related.push({ label: '下一篇', post: neighbours.next });
  if (neighbours.prev) related.push({ label: '上一篇', post: neighbours.prev });

  const relatedHtml = related.length
    ? `<aside class="related-content--wrapper">
         <h2 class="section-title">相关文章</h2>
         <div class="related-content">
           ${related
             .map(
               (r) => `
             <article>
               <a href="/p/${encodeURIComponent(r.post.slug)}">
                 <span class="related-label">${esc(r.label)}</span>
                 <h2 class="article-title">${esc(r.post.title)}</h2>
               </a>
             </article>`,
             )
             .join('')}
         </div>
       </aside>`
    : '';

  const body = `
    <article class="main-article">
      <header class="article-header">
        <div class="article-details">
          <div class="article-title-wrapper">
            <h2 class="article-title">
              <a href="${esc(href)}">${esc(post.title)}</a>
            </h2>
            ${
              post.summary
                ? `<h3 class="article-subtitle">${esc(post.summary)}</h3>`
                : ''
            }
          </div>
          <div class="article-category">
            <a href="/?category=${encodeURIComponent(post.category || '默认')}">${esc(post.category || '默认')}</a>
          </div>
          ${articleTime({ date: published, reading: minutes, views })}
          ${
            showUpdated
              ? `<footer class="article-time"><div>${icons.clock}<time>更新于 ${esc(updated)}</time></div></footer>`
              : ''
          }
        </div>
      </header>

      <section class="article-content">
        ${html}
      </section>

      ${articleCopyright()}
    </article>

    ${relatedHtml}
  `;

  return renderPage({
    title: post.title,
    description,
    body,
    current: 'home',
    toc: renderToc(toc),
    env,
    request,
    isAdmin,
    bodyClass: 'article-page',
  });
}

/**
 * 404 view for an unknown slug.
 * @param {{ env: Record<string, any>, request: Request, isAdmin?: boolean }} opts
 */
export function renderPostNotFound({ env, request, isAdmin = false }) {
  const body = `
    <div class="empty-card">
      <strong>文章不存在</strong>
      这篇文章可能已被删除，或者链接输错了。<br>
      <a href="/">← 回到首页</a>
    </div>`;
  return renderPage({
    title: '文章不存在',
    body,
    env,
    request,
    isAdmin,
    bodyClass: 'article-page',
  });
}
