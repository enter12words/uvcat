/**
 * markdown.js — a dependency-free Markdown → HTML renderer tuned for this blog.
 *
 * Why hand-rolled?  The Worker bundle must stay small and there is no build
 * step for node_modules at the edge.  This renderer supports everything a
 * personal blog needs and is written defensively: every piece of user text is
 * HTML-escaped before it reaches the output, so raw HTML in a post body can
 * never inject script.
 *
 * Supported:
 *   ATX headings (h1–h6) · paragraphs · emphasis · strong · strikethrough
 *   inline code · fenced code blocks (``` and ~~~) · indented code
 *   ordered / unordered / task lists (nested) · blockquotes
 *   GFM tables · horizontal rules · links · autolinks · images
 *   hard line breaks (two trailing spaces or backslash)
 *   heading anchors + automatic slug ids (used by the TOC generator)
 */

/* ------------------------------------------------------------------ */
/*  escaping                                                           */
/* ------------------------------------------------------------------ */

const ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape text for safe insertion into HTML.
 * @param {unknown} text
 */
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (m) => ESC_MAP[m]);
}

/** Only allow safe URL schemes in href/src. */
function safeUrl(raw) {
  const url = String(raw ?? '').trim();
  // Drop control chars that could smuggle a scheme past a naive check.
  const cleaned = url.replace(/[\u0000-\u001f\u007f]/g, '');
  if (/^(javascript|data|vbscript)\s*:/i.test(cleaned)) {
    // data:image/* is allowed for inline images, everything else is dropped.
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(cleaned)) return cleaned;
    return '#';
  }
  return cleaned;
}

/**
 * Slugify a heading into a stable, URL-safe anchor id.
 * Chinese text is preserved (URL-encoded by the browser), punctuation is not.
 * @param {string} text
 * @param {Set<string>} [seen] used to de-duplicate ids
 */
export function slugify(text, seen) {
  let base = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~\[\]()#!]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) base = 'section';
  if (!seen) return base;
  let slug = base;
  let n = 2;
  while (seen.has(slug)) slug = `${base}-${n++}`;
  seen.add(slug);
  return slug;
}

/* ------------------------------------------------------------------ */
/*  inline parsing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Render inline markdown (emphasis, code, links, images …) to HTML.
 * @param {string} text
 * @returns {string}
 */
export function renderInline(text) {
  if (!text) return '';

  // 1. Protect inline code spans with placeholders so that emphasis /
  //    links inside them are never interpreted.
  /** @type {string[]} */
  const codeStore = [];
  let src = String(text).replace(/(`+)([\s\S]*?)\1/g, (_m, _ticks, code) => {
    const idx = codeStore.push(`<code>${escapeHtml(code.trim())}</code>`) - 1;
    return `\u0000CODE${idx}\u0000`;
  });

  // 2. Escaping happens *after* code extraction — the stored snippets are
  //    already escaped and re-inserted verbatim at the end.
  src = escapeHtml(src);

  // 3. Images:  ![alt](src "title")
  src = src.replace(/!\[([^\]]*)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\)/g,
    (_m, alt, url, title) => {
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      return `<img src="${escapeHtml(safeUrl(url))}" alt="${escapeHtml(alt)}"${t} loading="lazy" decoding="async">`;
    });

  // 4. Links:  [text](href "title")
  src = src.replace(/\[([^\]]+)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+["']([^"']*)["'])?\)/g,
    (_m, label, url, title) => {
      const href = safeUrl(url);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      const external = /^https?:\/\//i.test(href);
      const rel = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a class="link" href="${escapeHtml(href)}"${t}${rel}>${label}</a>`;
    });

  // 5. Autolinks:  <https://example.com>
  src = src.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g,
    (_m, url) => `<a class="link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);

  // 6. Bare URLs (not already inside an attribute).  Cheap guard: the URL
  //    must not be preceded by =" or =' or an alphanumeric run.
  src = src.replace(/(^|[\s(])(https?:\/\/[^\s<>"')\]]+)/g, (m, lead, url) => {
    if (/=$/.test(lead)) return m;
    return `${lead}<a class="link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });

  // 7. Emphasis / strong / strikethrough.
  src = src
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w_])_([^_\s][^_]*?)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 8. Line breaks:  trailing double space or backslash → <br>
  src = src.replace(/ {2,}\n/g, '<br>\n').replace(/\\\n/g, '<br>\n');

  // 9. Restore inline code.
  src = src.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => codeStore[Number(i)] ?? '');

  return src;
}

/* ------------------------------------------------------------------ */
/*  block parsing                                                      */
/* ------------------------------------------------------------------ */

const RE_FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)\s*$/;
const RE_ATX = /^( {0,3})(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const RE_QUOTE = /^ {0,3}>\s?/;
const RE_UL = /^( {0,3})([-*+])\s+(.*)$/;
const RE_OL = /^( {0,3})(\d{1,9})[.)]\s+(.*)$/;
const RE_TABLE_SEP = /^ {0,3}\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/**
 * Render a Markdown document to HTML.
 * @param {string} markdown
 * @param {{ headingIds?: Set<string> }} [opts]
 * @returns {string}
 */
export function renderMarkdown(markdown, opts = {}) {
  const lines = String(markdown ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n');

  const ids = opts.headingIds ?? new Set();
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* ---- blank ---- */
    if (/^\s*$/.test(line)) { i++; continue; }

    /* ---- fenced code ---- */
    const fence = line.match(RE_FENCE);
    if (fence) {
      const marker = fence[2][0];
      const minLen = fence[2].length;
      const lang = fence[3] || '';
      const buf = [];
      i++;
      while (i < lines.length) {
        const close = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === marker && close[1].length >= minLen) { i++; break; }
        buf.push(lines[i]);
        i++;
      }
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}" data-lang="${escapeHtml(lang)}"` : '';
      out.push(
        `<div class="highlight"><div class="chroma"><pre class="chroma"><code${langAttr}>${escapeHtml(buf.join('\n'))}</code></pre></div>` +
        `<button class="copyCodeButton" type="button">Copy</button></div>`,
      );
      continue;
    }

    /* ---- ATX heading ---- */
    const atx = line.match(RE_ATX);
    if (atx) {
      const level = atx[2].length;
      const text = atx[3];
      const id = slugify(text, ids);
      out.push(
        `<h${level} id="${escapeHtml(id)}">${renderInline(text)}` +
        `<a class="header-anchor" href="#${escapeHtml(id)}" aria-hidden="true"></a></h${level}>`,
      );
      i++;
      continue;
    }

    /* ---- horizontal rule ---- */
    if (RE_HR.test(line)) { out.push('<hr>'); i++; continue; }

    /* ---- setext heading (=== / ---) ---- */
    if (i + 1 < lines.length && /^ {0,3}(=+|-{2,})\s*$/.test(lines[i + 1]) && !/^\s*$/.test(line) && !RE_UL.test(line)) {
      const level = lines[i + 1].trim().startsWith('=') ? 1 : 2;
      const id = slugify(line, ids);
      out.push(`<h${level} id="${escapeHtml(id)}">${renderInline(line.trim())}<a class="header-anchor" href="#${escapeHtml(id)}" aria-hidden="true"></a></h${level}>`);
      i += 2;
      continue;
    }

    /* ---- blockquote ---- */
    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && (RE_QUOTE.test(lines[i]) || (/^\s*$/.test(lines[i]) === false && buf.length > 0 && !RE_FENCE.test(lines[i]) && /^\s{2,}/.test(lines[i])))) {
        if (RE_QUOTE.test(lines[i])) buf.push(lines[i].replace(RE_QUOTE, ''));
        else { buf.push(lines[i].replace(/^\s{2,}/, '')); }
        i++;
        if (i < lines.length && /^\s*$/.test(lines[i]) && !(i + 1 < lines.length && RE_QUOTE.test(lines[i + 1]))) break;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    /* ---- table ---- */
    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1])) {
      const parseRow = (row) =>
        row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
      const header = parseRow(line);
      const aligns = parseRow(lines[i + 1]).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        if (l && r) return 'center';
        if (r) return 'right';
        if (l) return 'left';
        return '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      const cell = (tag, text, idx) => {
        const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
        return `<${tag}${a}>${renderInline(text)}</${tag}>`;
      };
      const thead = `<thead><tr>${header.map((c, idx) => cell('th', c, idx)).join('')}</tr></thead>`;
      const tbody = rows.length
        ? `<tbody>${rows.map((r) => `<tr>${header.map((_h, idx) => cell('td', r[idx] ?? '', idx)).join('')}</tr>`).join('')}</tbody>`
        : '';
      out.push(`<div class="table-wrapper"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    /* ---- list ---- */
    if (RE_UL.test(line) || RE_OL.test(line)) {
      /** @type {{indent:number, ordered:boolean, num:number, text:string, children:any[]}[]} */
      const items = [];
      let blankStreak = 0;

      while (i < lines.length) {
        const l = lines[i];

        if (/^\s*$/.test(l)) {
          blankStreak++;
          // A single blank line inside a list is allowed (loose list);
          // two in a row end the list.
          if (blankStreak >= 2) break;
          i++;
          continue;
        }

        const mUL = l.match(RE_UL);
        const mOL = l.match(RE_OL);

        if (mUL || mOL) {
          blankStreak = 0;
          items.push({
            indent: (mUL ? mUL[1] : mOL[1]).length,
            ordered: !!mOL,
            num: mOL ? Number(mOL[2]) : 1,
            text: mUL ? mUL[3] : mOL[3],
            children: [],
          });
          i++;
          continue;
        }

        // Continuation of the previous item's text (indented or lazy).
        if (items.length && (/^\s{2,}/.test(l) || !RE_FENCE.test(l))) {
          const last = items[items.length - 1];
          last.text += '\n' + l.replace(/^\s+/, '');
          i++;
          continue;
        }

        break;
      }

      if (!items.length) { i++; continue; }
      out.push(renderList(items));
      continue;
    }

    /* ---- indented code block ---- */
    if (/^ {4,}/.test(line)) {
      const buf = [];
      while (i < lines.length && (/^ {4,}/.test(lines[i]) || /^\s*$/.test(lines[i]))) {
        buf.push(lines[i].replace(/^ {4}/, ''));
        i++;
      }
      while (buf.length && buf[buf.length - 1].trim() === '') buf.pop();
      out.push(`<div class="highlight"><div class="chroma"><pre class="chroma"><code>${escapeHtml(buf.join('\n'))}</code></pre></div><button class="copyCodeButton" type="button">Copy</button></div>`);
      continue;
    }

    /* ---- paragraph ---- */
    const buf = [];
    while (i < lines.length && !/^\s*$/.test(lines[i])) {
      const l = lines[i];
      // stop when the next line starts another block
      if (buf.length && (RE_FENCE.test(l) || RE_ATX.test(l) || RE_HR.test(l) || RE_QUOTE.test(l) || RE_UL.test(l) || RE_OL.test(l))) break;
      buf.push(l);
      i++;
    }
    out.push(`<p>${renderInline(buf.join('\n').trim())}</p>`);
  }

  return out.join('\n');
}

/**
 * Render a flat list of items (each aware of its own indent level) into
 * properly nested <ul>/<ol> markup, preserving ordered-list numbering and
 * supporting GFM task list items (`- [ ]` / `- [x]`).
 *
 * Items are grouped by indentation: consecutive items at the same indent join
 * the same list; an item indented deeper than the previous one opens a nested
 * list inside that previous <li>.
 *
 * @param {{indent:number, ordered:boolean, num:number, text:string}[]} items
 * @returns {string}
 */
function renderList(items) {
  // Normalise indentation into discrete levels (0, 1, 2 …).
  const levels = [...new Set(items.map((it) => it.indent))].sort((a, b) => a - b);
  const levelOf = new Map(levels.map((indent, idx) => [indent, idx]));

  /* ---- render a single <li> ---- */
  const renderItem = (item) => {
    const task = item.text.match(/^\[([ xX])\]\s+([\s\S]*)$/);
    if (task) {
      const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
      const body = renderInline(task[2].trim()).replace(/\n/g, ' ');
      return `<li class="task-list-item"><input type="checkbox" disabled${checked}> ${body}</li>`;
    }
    // Multi-line item text keeps paragraph line breaks as <br>.
    const body = renderInline(item.text.trim()).replace(/(?<!\n)\n(?!\n)/g, '<br>');
    return `<li>${body}</li>`;
  };

  /**
   * Render a run of items starting at `start` whose level is `level`.
   * @returns {{ html: string, next: number }}
   */
  const renderLevel = (start, level) => {
    const first = items[start];
    const ordered = first.ordered;
    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && first.num !== 1 ? ` start="${first.num}"` : '';
    // Task lists need the class for the CSS to hide the bullet.
    const cls = !ordered && items.slice(start).some((it) => /^\[[ xX]\]/.test(it.text))
      ? ' class="task-list"'
      : '';

    let html = `<${tag}${startAttr}${cls}>`;
    let i = start;

    while (i < items.length) {
      const item = items[i];
      const itemLevel = levelOf.get(item.indent);

      if (itemLevel < level) break; // belongs to an ancestor list
      if (itemLevel > level) break; // handled by the parent as a nested list

      html += renderItem(item);
      i++;

      // A deeper item that follows belongs inside this <li>.
      if (i < items.length && levelOf.get(items[i].indent) > level) {
        const nested = renderLevel(i, levelOf.get(items[i].indent));
        html = html.slice(0, -'</li>'.length) + nested.html + '</li>';
        i = nested.next;
      }
    }

    html += `</${tag}>`;
    return { html, next: i };
  };

  return renderLevel(0, 0).html;
}

/* ------------------------------------------------------------------ */
/*  plain text extraction & reading time                               */
/* ------------------------------------------------------------------ */

/**
 * Strip markdown syntax to a plain-text string (used for summaries/search).
 * @param {string} markdown
 */
export function markdownToText(markdown) {
  return String(markdown ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Approximate reading time in minutes (CJK aware: ~380 chars / min,
 * latin words ~200 / min).
 * @param {string} markdown
 */
export function readingTime(markdown) {
  const text = markdownToText(markdown);
  const cjk = (text.match(/[\u4e00-\u9fa5\u3040-\u30ff]/g) || []).length;
  const words = text.replace(/[\u4e00-\u9fa5\u3040-\u30ff]/g, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = cjk / 380 + words / 200;
  return Math.max(1, Math.round(minutes));
}

/**
 * Build the TOC data structure from a Markdown document.
 * Only h2 / h3 participate (h1 is reserved for the post title).
 * @param {string} markdown
 * @returns {{ level: number, text: string, id: string }[]}
 */
export function buildToc(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const ids = new Set();
  /** @type {{level:number,text:string,id:string}[]} */
  const toc = [];
  let inFence = false;

  for (const line of lines) {
    if (RE_FENCE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = line.match(RE_ATX);
    if (!m) continue;
    const level = m[2].length;
    if (level !== 2 && level !== 3) {
      if (level === 1) slugify(m[3], ids); // keep ids aligned with the renderer
      continue;
    }
    toc.push({ level, text: markdownToText(m[3]), id: slugify(m[3], ids) });
  }
  return toc;
}
