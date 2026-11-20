# Cloudflare Pages 全栈个人博客

Hono + Cloudflare **D1** + Cloudflare **R2**，一套可直接部署到 Cloudflare Pages 的暗黑风格个人博客。

- **三层结构** 完全复用参考样式的三栏布局：左侧固定导航栏（头像 / 博客名 / GitHub / Home / Archives / Search），中间主内容卡片，右侧浮动文章目录。
- **暗黑配色** 全局底色 `#282828`、卡片 `#323232`、内嵌深色 `#212121`、边框 `#3E3E3E`、主文本 `#D4D4D4`、点缀色 `#669990`。
- **无评论区** 参考模板里的 Waline 评论代码与样式已全部移除。
- **双层密码锁** 全站访客锁 + 独立的管理员锁。
- **在线写作** EasyMDE 编辑器，粘贴截图 / 拖拽图片自动上传到 R2。

---

## 1. 目录结构

```
.
├── package.json            # 依赖与脚本
├── wrangler.toml           # Pages + D1(DB) + R2(BUCKET) 绑定
├── schema.sql              # 建表语句 + 1 篇演示文章
├── .dev.vars.example       # 本地环境变量模板（复制为 .dev.vars）
├── scripts/
│   ├── build.mjs           # esbuild 打包 → public/_worker.js
│   └── smoke.mjs           # 端到端冒烟测试
├── public/                 # 构建输出目录（也是 Pages 的部署根目录）
│   ├── _worker.js          # ⚠ 由 npm run build 生成，勿手改
│   └── static/
│       ├── style.css       # 前台样式（替代 reference.css）
│       ├── admin.css       # 后台样式
│       ├── avatar.svg      # 默认头像
│       └── favicon.svg
└── src/
    ├── index.js            # Hono 应用：路由 + 中间件 + 全部 API
    ├── lib/
    │   ├── auth.js         # HMAC 签名 Cookie / 密码比较
    │   ├── markdown.js     # 零依赖 Markdown 渲染 + TOC 生成
    │   ├── db.js           # D1 数据访问层
    │   └── utils.js        # 日期格式化、slug 等
    └── views/
        ├── layout.js       # 页面骨架、侧边栏、TOC
        ├── home.js         # 文章列表
        ├── post.js         # 文章详情
        ├── archives.js     # 归档 / 搜索
        ├── lock.js         # 访客密码页 / 管理员登录页
        └── admin.js        # 后台控制台
```

### 为什么是 `_worker.js` 而不是 `functions/` 目录

`npm run build` 用 esbuild 把整个 Hono 应用打包成**单个** `public/_worker.js`。
Cloudflare Pages 一旦在输出目录里发现 `_worker.js`，就会以 **advanced mode** 运行它 ——
所有请求（页面、API、静态资源）都由 Hono 接管，因此**不需要** `functions/` 目录，
`wrangler pages deploy ./public` 一条命令即可完成部署，不会出现打包报错。

---

## 2. 部署到 Cloudflare Pages

### 2.1 创建资源

```bash
# 1) 建 D1 数据库 —— 记下返回的 database_id
npx wrangler d1 create blog-db

# 2) 建 R2 桶
npx wrangler r2 bucket create blog-images
```

把返回的 `database_id` 填进 `wrangler.toml` 的 `[[d1_databases]]` 里。

### 2.2 初始化数据库

```bash
# 远程（Cloudflare 上的真实 D1）
npx wrangler d1 execute blog-db --remote --file=./schema.sql
```

`schema.sql` 会建好 `posts` / `post_views` / `site_meta` 三张表，并插入 **1 篇暗黑风格演示文章**，
部署完立刻就能在首页看到效果。

### 2.3 配置环境变量

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `SITE_PASSWORD` | ✅ | 全站访客密码 |
| `ADMIN_USER` | ✅ | 管理员用户名 |
| `ADMIN_PASS` | ✅ | 管理员密码 |
| `COOKIE_SECRET` | 建议 | Cookie 签名附加密钥，32 位以上随机串 |
| `R2_PUBLIC_URL` | ✅ | R2 图片的公开访问域名，如 `https://images.example.com` |
| `BLOG_NAME` | | 博客名（侧边栏 / 标题） |
| `BLOG_DESCRIPTION` | | 副标题 |
| `AVATAR_URL` | | 头像地址 |
| `GITHUB_URL` | | GitHub 链接 |
| `SESSION_TTL` | | 会话有效期（秒），默认 `604800`（7 天） |

**方式 A —— 命令行写入 Secrets（推荐）**

```bash
npx wrangler pages secret put SITE_PASSWORD --project-name my-blog
npx wrangler pages secret put ADMIN_USER    --project-name my-blog
npx wrangler pages secret put ADMIN_PASS    --project-name my-blog
npx wrangler pages secret put COOKIE_SECRET --project-name my-blog
```

**方式 B —— 控制台**：Cloudflare Dashboard → Workers & Pages → 你的项目 → Settings →
Environment variables。

> `BLOG_NAME` 等非敏感变量可以直接写在 `wrangler.toml` 的 `[vars]` 里。
> 三个必填项缺失时，站点会渲染一页**配置指引**而不是白屏 500。

### 2.4 给 R2 绑定公开域名

R2 → 你的桶 → Settings → Public access：

- 打开 `r2.dev` 子域（仅测试用），或
- 绑定自定义域名（生产推荐）→ 把该域名填到 `R2_PUBLIC_URL`。

上传接口会拼成 `{R2_PUBLIC_URL}/{YYYY}/{MM}/{uuid}.png` 返回完整外链。
**若 `R2_PUBLIC_URL` 留空**，图片会走 `/api/images/...` 由 Worker 直接从 R2 流式返回（可用的兜底方案，但会消耗 Worker 请求数）。

### 2.5 部署

```bash
npm install
npm run build
npx wrangler pages deploy ./public --project-name=my-blog
```

或者用 CI / Git 集成：构建命令填 `npm run build`，输出目录填 `public`。

> **首次部署**可以直接跑 `npx wrangler pages deploy ./public --project-name=my-blog`；
> 项目不存在时 wrangler 会自动创建。
> 若用 Git 集成，请在 Pages 项目设置里把 **Functions 绑定** 指向 `DB`（D1）和 `BUCKET`（R2）。

---

## 3. 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars     # 按需修改密码 / R2_PUBLIC_URL

# 初始化本地 D1（会创建 .wrangler/state 下的 SQLite）
npm run db:init:local

# 打包并启动（读取 wrangler.toml 的 D1/R2 绑定 + .dev.vars）
npm run dev
# → http://127.0.0.1:8788
```

冒烟测试（需要先 `npm run dev` 起服务）：

```bash
node scripts/smoke.mjs http://127.0.0.1:8788
```

---

## 4. 鉴权设计

两层锁**相互独立**，各自用不同的 HMAC 密钥签名 Cookie：

| | 访客锁 | 管理员锁 |
| --- | --- | --- |
| Cookie | `site_auth` | `admin_auth` |
| 校验对象 | `SITE_PASSWORD` | `ADMIN_USER` + `ADMIN_PASS` |
| 作用路径 | 全站（除 `/admin`、`/static/*`） | `/admin`、`/api/admin/*` |
| 有效期 | 7 天 | `SESSION_TTL`，默认 7 天 |

Cookie 格式：`base64url(payload).base64url(HMAC-SHA256(payload, secret))`，
payload 为 `{ r: 'site'|'admin', iat, exp }`。

关键性质：

- **无状态**：不查库即可验签，且 HMAC 密钥由 *密码本身* 派生 —— 换密码即让所有旧会话立刻失效。
- **角色隔离**：密钥里混入角色名，访客 Cookie **不可能**被当作管理员 Cookie 重放。
- **HttpOnly + SameSite=Lax**（HTTPS 下自动加 `Secure`），前端 JS 读不到令牌。
- **恒定时间比较**：密码校验先各自 SHA-256 再比对定长摘要，不泄露长度与前缀。
- **开放重定向防护**：`?next=` 只接受站内以 `/` 开头且非 `//` 的路径。
- **深度防御**：`/api/admin/*` 在路由级**再验一次**登录态，不依赖前端隐藏按钮。

未登录时的响应：

- 前台页面 → 居中极简暗黑「请输入访问密码」页（HTTP 401）
- 前台 API → `401 {"code":"SITE_LOCKED"}`
- `/admin` → 管理员登录页（HTTP 401）
- `/api/admin/*` → `401 {"error":"Unauthorized: admin login required"}`

---

## 5. API

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/posts?page=1` | 访客 | 文章列表 |
| `GET` | `/api/posts/:slug` | 访客 | 单篇（含 `toc`、`reading_time`、`views`） |
| `GET` | `/api/admin/posts` | 管理员 | 全部文章 |
| `GET` | `/api/admin/posts/:slug` | 管理员 | 编辑器读取 |
| `POST` | `/api/admin/posts` | 管理员 | 新建 |
| `PUT` | `/api/admin/posts/:id` | 管理员 | 更新 |
| `DELETE` | `/api/admin/posts/:id` | 管理员 | 删除 |
| `POST` | `/api/admin/upload` | 管理员 | multipart 图片 → R2 |

上传示例：

```bash
curl -X POST https://your.site/api/admin/upload \
  -H "Cookie: admin_auth=<token>" \
  -F "file=@screenshot.png"
```

```json
{
  "ok": true,
  "success": true,
  "key": "2026/11/3f2c9b1e-8a2d-4c11-9f0e-7b1d2a3c4e5f.png",
  "url": "https://images.example.com/2026/11/3f2c9b1e-8a2d-4c11-9f0e-7b1d2a3c4e5f.png"
}
```

限制：单文件 ≤ **10 MB**，仅接受 `png / jpg / gif / webp / avif / svg / bmp / ico`。
`success` 字段是为了兼容 EasyMDE 的 `imageUploadFunction` 回调协议。

---

## 6. 数据库表

```sql
CREATE TABLE posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  summary    TEXT,
  content    TEXT NOT NULL,
  category   TEXT DEFAULT '默认',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

时间统一以 **UTC** 的 `YYYY-MM-DD HH:MM:SS` 存储（与 SQLite `CURRENT_TIMESTAMP` 一致），
展示层再格式化。`schema.sql` 里额外建了 `post_views`（阅读计数）与 `site_meta`（键值配置）。

---

## 7. 写作功能

`/admin` 左侧是文章列表（新建 / 点选编辑 / 悬停删除 / 标题筛选），右侧是编辑区：

- **EasyMDE**（CDN 引入，无打包步骤），支持实时预览、分屏、全屏
- **粘贴截图** → 自动上传 → 光标处插入 `![image](url)`
- **拖拽图片**到编辑器 → 同样自动上传，并有虚线高亮提示
- **`Ctrl / Cmd + S`** 直接保存
- 标题输入时**自动生成 slug**（中文保留，浏览器会自动 URL 编码）
- 摘要留空时**自动截取正文**前 120 字
- Slug 冲突返回 **409** 并给出中文提示

---

## 8. 目录（TOC）

文章正文里的 `h2` / `h3` 在服务端被解析成 `<h2 id="…">`，同时生成右侧浮动目录：

- `h3` 会嵌套在它所属的 `h2` 下面；出现在任何 `h2` 之前的孤儿 `h3` 会被提升为顶层，不会丢失
- 重复标题自动加 `-2`、`-3` 后缀，锚点稳定
- 滚动时按「最后一个越过视口阈值的标题」高亮，滚动到底部则高亮最后一项
- 点击目录项平滑滚动并同步 `location.hash`

---

## 9. Markdown 支持

渲染器为**零依赖**手写实现，所有用户文本在拼进 HTML 前一律转义，正文里的裸 HTML 无法注入脚本：

标题（ATX/Setext）、粗体/斜体/删除线、行内代码、围栏代码块（``` 与 ~~~，带语言标签与复制按钮）、
有序/无序列表（支持嵌套与任务清单）、引用块、GFM 表格（含对齐）、分割线、链接、自动链接、
图片、硬换行。危险的 `javascript:` / `data:text/html` 等协议会被替换为 `#`。

---

## 10. 常见问题

**首页一片空白 / 日志出现 `no such table: posts`**
没有执行 `schema.sql`。运行 `npm run db:init:remote`（本地用 `npm run db:init:local`）。

**访问任何页面都是"还需要配置环境变量"**
`SITE_PASSWORD` / `ADMIN_USER` / `ADMIN_PASS` 没设置。按页面提示添加 Secrets 后重新部署。

**上传成功但图片 404**
`R2_PUBLIC_URL` 没配或配错，或 R2 桶未开启公开访问。先把 `R2_PUBLIC_URL` 留空，
图片会通过 `/api/images/...` 由 Worker 代理返回，可用来验证问题是否出在域名上。

**改了 `.dev.vars` 不生效**
需要重启 `npm run dev`。

**`npm run build` 报 esbuild 找不到**
先跑 `npm install`（esbuild 已作为 devDependency 显式声明）。

---

## License

示例文章内容采用 CC BY-NC-SA 4.0。
