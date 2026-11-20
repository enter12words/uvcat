/**
 * admin.js — the /admin dashboard shell.
 *
 * Layout: a fixed left column with the post list (new / edit / delete) and a
 * right-hand editor pane built on EasyMDE.
 *
 * Assets note: the editor + its stylesheet are loaded from jsDelivr (as the
 * brief allows) so there is no bundling step for the admin UI. The admin
 * stylesheet `/static/admin.css` is served by the Worker itself.
 */

import { esc, envStr, formatDateTime } from '../lib/utils.js';

const EASYMDE_CSS = 'https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.css';
const EASYMDE_JS = 'https://cdn.jsdelivr.net/npm/easymde@2.18.0/dist/easymde.min.js';

/**
 * @param {object} opts
 * @param {any[]} opts.posts
 * @param {Record<string, any>} opts.env
 * @param {{ ok: boolean, reason?: string, posts?: number }} opts.status
 * @param {string|null} [opts.activeSlug]  slug of the post to open on load
 */
export function renderAdmin({ posts, env, status, activeSlug = null }) {
  const blogName = envStr(env, 'BLOG_NAME', 'My Blog');

  const listItems = posts
    .map((p) => {
      const active = activeSlug && p.slug === activeSlug ? ' is-active' : '';
      return `
        <li class="post-item${active}" data-id="${p.id}">
          <a class="post-item__link" href="/admin?edit=${encodeURIComponent(p.slug)}" data-slug="${esc(p.slug)}">
            <span class="post-item__title">${esc(p.title)}</span>
            <span class="post-item__meta">
              <span>${esc(formatDateTime(p.created_at))}</span>
              <span class="post-item__cat">${esc(p.category || '默认')}</span>
            </span>
          </a>
          <button class="post-item__del" type="button" title="删除" data-id="${p.id}" data-title="${esc(p.title)}">×</button>
        </li>`;
    })
    .join('');

  const statusBanner =
    status.ok === false
      ? `<div class="admin-banner admin-banner--error">${esc(status.reason ?? 'D1 未就绪')}</div>`
      : '';

  const flashBanner = '';

  return `<!DOCTYPE html>
<html lang="zh-cn" data-scheme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<title>控制台 · ${esc(blogName)}</title>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${EASYMDE_CSS}">
<link rel="stylesheet" href="/static/admin.css">
</head>
<body class="admin-page">

<header class="admin-topbar">
  <div class="admin-topbar__left">
    <a class="admin-brand" href="/admin">
      <span class="admin-brand__dot"></span>
      <span>${esc(blogName)}</span>
      <span class="admin-brand__tag">控制台</span>
    </a>
  </div>
  <div class="admin-topbar__right">
    <span class="admin-conn" id="admin-conn" title="登录状态">已登录</span>
    <a class="admin-btn" href="/" target="_blank" rel="noopener">查看博客 ↗</a>
    <button class="admin-btn admin-btn--ghost" type="button" id="btn-logout">退出登录</button>
  </div>
</header>

${statusBanner}
${flashBanner}

<div class="admin-shell">
  <!-- ================= left: post list ================= -->
  <aside class="admin-sidebar">
    <div class="admin-sidebar__head">
      <h2>文章 <span class="count" id="post-count">${posts.length}</span></h2>
      <button class="admin-btn admin-btn--primary" type="button" id="btn-new">＋ 新建</button>
    </div>
    <ul class="post-list" id="post-list">
      ${
        posts.length
          ? listItems
          : `<li class="post-list__empty">还没有文章，点击「新建」开始写作。</li>`
      }
    </ul>

    <div class="admin-sidebar__foot">
      <input type="search" id="post-filter" class="admin-input" placeholder="筛选文章标题…" aria-label="筛选文章">
    </div>
  </aside>

  <!-- ================= right: editor ================= -->
  <main class="admin-editor">
    <form id="editor-form" class="editor-form" autocomplete="off" novalidate>
      <input type="hidden" id="field-id" name="id" value="">
      <input type="hidden" id="field-original-slug" name="original_slug" value="">

      <div class="editor-meta">
        <div class="editor-meta__row">
          <label class="field field--grow">
            <span class="field__label">标题</span>
            <input class="admin-input admin-input--title" type="text" id="field-title" name="title" placeholder="给这篇文章起个标题" required>
          </label>
        </div>

        <div class="editor-meta__row editor-meta__row--3">
          <label class="field">
            <span class="field__label">Slug（URL 标识）</span>
            <input class="admin-input" type="text" id="field-slug" name="slug" placeholder="hello-world" required>
          </label>
          <label class="field">
            <span class="field__label">分类</span>
            <input class="admin-input" type="text" id="field-category" name="category" placeholder="默认" value="默认">
          </label>
          <label class="field">
            <span class="field__label">发布日期</span>
            <input class="admin-input" type="datetime-local" id="field-created" name="created_at">
          </label>
        </div>

        <div class="editor-meta__row">
          <label class="field field--grow">
            <span class="field__label">摘要（留空则自动截取正文）</span>
            <textarea class="admin-input admin-input--summary" id="field-summary" name="summary" rows="2" placeholder="一两句话介绍这篇文章…"></textarea>
          </label>
        </div>
      </div>

      <div class="editor-body">
        <div class="editor-toolbar-line">
          <span class="editor-hint">
            <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存 · 粘贴截图或拖拽图片自动上传到 R2
          </span>
          <div class="editor-actions">
            <span class="editor-status" id="editor-status"></span>
            <button class="admin-btn" type="button" id="btn-upload">插入图片</button>
            <button class="admin-btn admin-btn--primary" type="submit" id="btn-save">保存</button>
            <button class="admin-btn admin-btn--ghost" type="button" id="btn-discard">放弃</button>
          </div>
        </div>

        <div class="editor-drop">
          <textarea id="field-content" name="content"></textarea>
          <div class="editor-drop__veil" id="drop-veil">松手上传图片 → R2</div>
        </div>
        <input type="file" id="file-input" accept="image/*" hidden>
      </div>
    </form>
  </main>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script src="${EASYMDE_JS}"></script>
<script>window.__ADMIN_INITIAL__ = { slug: ${JSON.stringify(activeSlug ?? '')} };</script>
<script>${ADMIN_JS}</script>
</body>
</html>`;
}

/* ==================================================================
   Client-side application
   ================================================================== */

export const ADMIN_JS = String.raw`
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer = null;
  function toast(msg, isError) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.borderColor = isError ? '#df7988' : '#669990';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function setStatus(text, isError) {
    var el = $('editor-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = isError ? '#df7988' : '#8a8a8a';
  }

  function slugify(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/['"\u201c\u201d\u2018\u2019]/g, '')
      .replace(/[^\u4e00-\u9fa5a-z0-9\s-]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  /* ---------------- editor ---------------- */
  var mde = null;
  var slugTouched = false;

  function initEditor() {
    var ta = $('field-content');
    if (!ta) return;

    mde = new EasyMDE({
      element: ta,
      autoDownloadFontAwesome: true,
      spellChecker: false,
      status: false,
      minHeight: '420px',
      placeholder: '在这里用 Markdown 写作…（可直接粘贴截图）',
      uploadImage: true,
      imageUploadFunction: function (file, onSuccess, onError) {
        uploadImage(file).then(function (url) {
          onSuccess(url);
          insertImage(url);
        }).catch(function (err) {
          onError(err && err.message ? err.message : '上传失败');
          toast('图片上传失败: ' + (err && err.message ? err.message : err), true);
        });
      },
      toolbar: [
        'bold', 'italic', 'heading', '|',
        'quote', 'unordered-list', 'ordered-list', '|',
        'link', 'image', 'code', 'table', '|',
        'preview', 'side-by-side', 'fullscreen', '|',
        'guide'
      ],
      shortcuts: {
        drawTable: 'Cmd-Alt-T'
      }
    });

    // --- paste images from the clipboard ---
    mde.codemirror.on('paste', function (cm, e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          e.preventDefault();
          var file = items[i].getAsFile();
          if (file) handleImageFile(file);
          return;
        }
      }
    });

    // --- drag & drop anywhere over the editor ---
    var dropZone = document.querySelector('.editor-drop');
    var veil = $('drop-veil');

    ['dragenter', 'dragover'].forEach(function (type) {
      document.addEventListener(type, function (e) {
        if (!e.dataTransfer || !hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (dropZone) dropZone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach(function (type) {
      document.addEventListener(type, function (e) {
        if (type === 'dragleave' && e.target !== document.documentElement) return;
        if (dropZone) dropZone.classList.remove('is-dragover');
      });
    });

    document.addEventListener('drop', function (e) {
      if (!e.dataTransfer) return;
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      var files = e.dataTransfer.files;
      for (var i = 0; i < files.length; i++) {
        if (files[i].type && files[i].type.indexOf('image/') === 0) {
          handleImageFile(files[i]);
        }
      }
    });

    // --- Ctrl / Cmd + S ---
    mde.codemirror.setOption('extraKeys', {
      'Ctrl-S': function (cm) { cm.save(); save(); return false; },
      'Cmd-S': function (cm) { cm.save(); save(); return false; }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (mde) mde.codemirror.save();
        save();
      }
    });

    // auto slug from the title while the user has not edited it manually
    $('field-title').addEventListener('input', function () {
      if (slugTouched) return;
      $('field-slug').value = slugify($('field-title').value);
    });
    $('field-slug').addEventListener('input', function () { slugTouched = true; });
  }

  function hasFiles(dt) {
    if (!dt) return false;
    if (dt.files && dt.files.length) return true;
    if (dt.types) {
      for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  /* ---------------- image upload ---------------- */
  function uploadImage(file) {
    var fd = new FormData();
    fd.append('file', file, file.name || 'pasted-image.png');

    setStatus('正在上传图片…');
    return fetch('/api/admin/upload', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (res.status === 401) throw new Error('登录已过期，请重新登录');
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok || !data.url) throw new Error(data.error || ('HTTP ' + res.status));
          setStatus('');
          return data.url;
        });
      })
      .catch(function (err) {
        setStatus('');
        throw err;
      });
  }

  function insertImage(url) {
    if (!mde) return;
    var cm = mde.codemirror;
    var alt = 'image';
    var text = '![' + alt + '](' + url + ')';
    var cursor = cm.getCursor();
    var before = cm.getLine(cursor.line).slice(0, cursor.ch);
    var lead = (!before || /\s$/.test(before)) ? '' : '\n\n';
    cm.replaceRange(lead + text + '\n', cursor);
    cm.focus();
  }

  function handleImageFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast('图片太大了（上限 10MB）', true);
      return;
    }
    uploadImage(file)
      .then(function (url) { insertImage(url); toast('图片已上传'); })
      .catch(function (err) { toast('图片上传失败: ' + err.message, true); });
  }

  /* ---------------- form state ---------------- */
  function clearForm() {
    $('field-id').value = '';
    $('field-original-slug').value = '';
    $('field-title').value = '';
    $('field-slug').value = '';
    $('field-category').value = '默认';
    $('field-summary').value = '';
    $('field-created').value = nowLocal();
    if (mde) mde.value('');
    slugTouched = false;
    setStatus('新建文章');
    document.querySelectorAll('.post-item').forEach(function (el) { el.classList.remove('is-active'); });
    try { history.replaceState(null, '', '/admin'); } catch (e) {}
    $('field-title').focus();
  }

  function nowLocal() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function loadPost(slug) {
    setStatus('加载中…');
    fetch('/api/admin/posts/' + encodeURIComponent(slug), { credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) { location.href = '/admin'; throw new Error('unauth'); }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (post) {
        $('field-id').value = post.id;
        $('field-original-slug').value = post.slug;
        $('field-title').value = post.title || '';
        $('field-slug').value = post.slug || '';
        $('field-category').value = post.category || '默认';
        $('field-summary').value = post.summary || '';
        $('field-created').value = toLocal(post.created_at);
        if (mde) mde.value(post.content || '');
        slugTouched = true;
        setStatus('已加载 #' + post.id);
        document.querySelectorAll('.post-item').forEach(function (el) {
          el.classList.toggle('is-active', el.getAttribute('data-id') === String(post.id));
        });
        try { history.replaceState(null, '', '/admin?edit=' + encodeURIComponent(post.slug)); } catch (e) {}
      })
      .catch(function (err) {
        if (err.message !== 'unauth') { setStatus('加载失败', true); toast('加载失败: ' + err.message, true); }
      });
  }

  function toLocal(value) {
    if (!value) return nowLocal();
    var s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
      return s.replace(' ', 'T').slice(0, 16);
    }
    var d = new Date(s);
    if (isNaN(d.getTime())) return nowLocal();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }

  /* ---------------- save ---------------- */
  var saving = false;
  function save() {
    if (saving) return;
    if (mde) mde.codemirror.save();

    var title = $('field-title').value.trim();
    var slug = $('field-slug').value.trim() || slugify(title);
    var content = $('field-content').value;

    if (!title) { toast('标题不能为空', true); $('field-title').focus(); return; }
    if (!slug) { toast('Slug 不能为空', true); $('field-slug').focus(); return; }
    if (!content.trim()) { toast('正文不能为空', true); return; }

    var id = $('field-id').value;
    var originalSlug = $('field-original-slug').value;

    var payload = {
      title: title,
      slug: slug,
      category: $('field-category').value.trim() || '默认',
      summary: $('field-summary').value.trim(),
      content: content,
      created_at: $('field-created').value
    };

    saving = true;
    setStatus('保存中…');
    $('btn-save').disabled = true;

    var url = id ? '/api/admin/posts/' + encodeURIComponent(id) : '/api/admin/posts';
    var method = id ? 'PUT' : 'POST';

    fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (res.status === 401) { toast('登录已过期，请重新登录', true); setTimeout(function () { location.href = '/admin'; }, 900); throw new Error('unauth'); }
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          return data;
        });
      })
      .then(function (data) {
        toast(id ? '已保存' : '文章已创建');
        setStatus('已保存 ' + new Date().toLocaleTimeString());
        // simplest correct behaviour: hard reload to the saved post so the
        // list order, slug and timestamps are all fresh from D1.
        location.href = '/admin?edit=' + encodeURIComponent(data.slug || slug) + '&saved=1';
      })
      .catch(function (err) {
        if (err.message === 'unauth') return;
        setStatus('保存失败', true);
        toast('保存失败: ' + err.message, true);
      })
      .finally(function () {
        saving = false;
        $('btn-save').disabled = false;
      });
  }

  /* ---------------- delete ---------------- */
  function removePost(id, title) {
    if (!confirm('确定要删除《' + title + '》吗？此操作不可撤销。')) return;
    fetch('/api/admin/posts/' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (res.status === 401) { location.href = '/admin'; throw new Error('unauth'); }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        toast('已删除');
        setTimeout(function () { location.href = '/admin'; }, 400);
      })
      .catch(function (err) {
        if (err.message !== 'unauth') toast('删除失败: ' + err.message, true);
      });
  }

  /* ---------------- wiring ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initEditor();

    var initial = (window.__ADMIN_INITIAL__ || {});

    // flash message after a save redirect
    var params = new URLSearchParams(location.search);
    if (params.get('saved')) {
      setStatus('已保存');
      setTimeout(function () { try { history.replaceState(null, '', location.pathname + (params.get('edit') ? '?edit=' + encodeURIComponent(params.get('edit')) : '')); } catch (e) {} }, 60);
    }

    $('btn-new').addEventListener('click', function (e) { e.preventDefault(); clearForm(); });
    $('btn-discard').addEventListener('click', function () {
      if (!confirm('放弃当前修改？')) return;
      var slug = $('field-original-slug').value;
      if (slug) loadPost(slug); else clearForm();
    });

    $('editor-form').addEventListener('submit', function (e) { e.preventDefault(); save(); });

    document.querySelectorAll('.post-item__link').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        loadPost(a.getAttribute('data-slug'));
      });
    });

    document.querySelectorAll('.post-item__del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        removePost(btn.getAttribute('data-id'), btn.getAttribute('data-title'));
      });
    });

    $('btn-upload').addEventListener('click', function () { $('file-input').click(); });
    $('file-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) handleImageFile(f);
      e.target.value = '';
    });

    $('btn-logout').addEventListener('click', function () {
      fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' })
        .finally(function () { location.href = '/admin'; });
    });

    // list filter
    var filter = $('post-filter');
    if (filter) {
      filter.addEventListener('input', function () {
        var q = filter.value.trim().toLowerCase();
        document.querySelectorAll('.post-item').forEach(function (li) {
          var t = (li.querySelector('.post-item__title') || {}).textContent || '';
          li.style.display = !q || t.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
        });
      });
    }

    // open the requested post (if any)
    var editSlug = params.get('edit');
    if (editSlug) loadPost(editSlug);
    else setStatus('新建文章');
  });
})();
`;
