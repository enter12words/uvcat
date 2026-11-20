-- =============================================================
--  Cloudflare D1 schema for the personal blog
--  Run locally : npm run db:init:local
--  Run remote  : npm run db:init:remote
-- =============================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------
--  posts : articles
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  summary    TEXT,
  content    TEXT NOT NULL,
  category   TEXT DEFAULT '默认',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category   ON posts (category);
CREATE INDEX IF NOT EXISTS idx_posts_slug       ON posts (slug);

-- -------------------------------------------------------------
--  site_meta : tiny key/value store (view counter, etc.)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- -------------------------------------------------------------
--  post_views : per-post visit counter
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_views (
  slug  TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0
);

-- -------------------------------------------------------------
--  images : image store used when no R2 bucket is bound.
--  `data` holds the raw file bytes (BLOB); D1 caps a row at ~1 MB,
--  so uploads are limited to 800 KB in this mode.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS images (
  key          TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  data         BLOB NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
--  Demo article - so the deployed site is not empty
-- =============================================================
INSERT INTO posts (title, slug, summary, category, content, created_at, updated_at)
SELECT
  '你好，暗色世界 —— 这个博客是怎么搭起来的',
  'hello-dark-world',
  '一篇用来验收部署效果的演示文章：Hono + Cloudflare D1 + R2，跑在 Pages Functions 上的全栈个人博客。',
  '折腾',
  '## 背景

这是一个运行在 **Cloudflare Pages Functions** 上的全栈个人博客。没有服务器，没有 Docker，也没有每月固定账单 —— 只需要一个 Worker、一个 D1 数据库和一个 R2 桶。

> 整个站点的配色都在 `#282828` 的底色上跳舞：卡片 `#323232`，内嵌色块 `#212121`，点缀色 `#669990`。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Cloudflare Pages Functions | 单文件 `_worker.js`，零冷启动焦虑 |
| 框架 | [Hono](https://hono.dev) | 轻量、类型友好、边缘友好 |
| 数据库 | Cloudflare D1 | SQLite，绑定名 `DB` |
| 图床 | Cloudflare R2 | 对象存储，绑定名 `BUCKET` |

### 为什么选 Hono

Hono 的路由体积只有十几 KB，同时提供了完整的中间件生态。我们不需要 SSR 框架，只需要：

1. 一个全局访客密码锁中间件
2. 一组前台只读 API
3. 一组需要管理员登录态的增删改 API

```ts
// 全局访客锁：拦截一切未携带 site_auth Cookie 的请求
app.use("*", async (c, next) => {
  const ok = await verifyCookie(c, "site_auth", c.env.SITE_PASSWORD);
  if (ok) return next();
  return c.html(renderLockPage(c.req.path), 401);
});
```

## 双层密码锁

站点做了两层独立的门禁：

### 第一层：访客锁

- 拦截所有前台页面与前台 API
- 校验通过后签发 **7 天**有效期的 HttpOnly Cookie
- 失败时返回居中极简的暗黑密码页，而不是 404

### 第二层：管理员锁

- `/admin` 使用独立的 `admin_auth` Cookie
- 校验环境变量 `ADMIN_USER` 与 `ADMIN_PASS`
- 所有 `/api/admin/*` 接口都会再次验签，**不依赖前端隐藏按钮**

## 在线写作体验

后台基于 **EasyMDE**，支持：

- 实时预览 Markdown
- 粘贴剪贴板截图，自动上传到 R2，光标处插入 `![image](url)`
- 拖拽本地图片文件到编辑器，同样自动上传
- `Ctrl / Cmd + S` 直接保存

上传的图片会被落到形如 `2026/11/3f2c9b1e-....png` 的路径，前端拼接 `R2_PUBLIC_URL` 得到完整外链：

```bash
# 上传接口返回的结构
{
  "success": true,
  "url": "https://images.example.com/2026/11/3f2c9b1e.png",
  "key": "2026/11/3f2c9b1e.png"
}
```

## 目录与归档

右侧浮动目录由正文里的 `h2` / `h3` 自动生成，滚动时会高亮当前章节 —— 你可以试着滚动这一页。

左侧边栏提供三个核心入口：

1. **Home** —— 文章列表
2. **Archives** —— 按年份分组的时间轴
3. **Search** —— 标题 / 摘要 / 正文关键词搜索

## 接下来

- [ ] 换掉侧边栏的头像和 GitHub 链接
- [ ] 在 R2 上绑定自定义域名，替换 `R2_PUBLIC_URL`
- [ ] 写第一篇属于自己的文章

> 剩下的就交给你了。祝写得开心。

---

*Licensed under CC BY-NC-SA 4.0*',
  '2026-11-01 10:00:00',
  '2026-11-01 10:00:00'
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE slug = 'hello-dark-world');

INSERT OR IGNORE INTO site_meta (key, value) VALUES ('schema_version', '1');
