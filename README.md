# uvcat's blog

一个跑在 **Cloudflare Pages** 上的全栈暗色博客：**Hono + Cloudflare D1**，全站访客密码锁 + 独立管理员后台 + 在线 Markdown 写作（粘贴截图自动上传）。

- **已上线**：https://uvcat.pages.dev
- **仓库**：https://github.com/enter12words/uvcat
- **D1 数据库**：`blog-db`（`dad1c5da-9fed-4043-a5c5-0404b76bffc2`）
- **图床**：不需要 R2 —— 图片存在 D1 的 `images` 表里，通过 `/api/images/<yyyy>/<mm>/<uuid>.<ext>` 公开访问

---

## 0. 先说清楚几件事（照抄本文件即可，别照抄网上的旧教程）

| 网上教程常写错的 | 本项目实际的 |
| --- | --- |
| 变量名 `JWT_SECRET` | **`COOKIE_SECRET`**（代码同时兼容 `JWT_SECRET`，但请统一用 `COOKIE_SECRET`） |
| 绑定 R2 `BUCKET` | **不用绑**。不绑 R2 时自动把图片存进 D1 |
| `R2_PUBLIC_URL` 填 `https://pub-xxx.r2.dev` | **留空**。留空时图片从 `/api/images/...` 读 |
| 管理员登录字段 `username` / `password` | 后台表单字段是 **`user` / `pass`**（网页上是「账号 / 密码」两个输入框） |
| 文章路径 `/post/<slug>` | 实际路由是 **`/p/<slug>`** |
| 项目名 `my-blog` | **`uvcat`** |

---

## 1. 目录结构

```
.
├── package.json            # 依赖与脚本
├── wrangler.toml           # Pages + D1(DB) 绑定；真实 database_id 已填好
├── schema.sql              # 建表语句（posts / post_views / site_meta / images）+ 1 篇演示文章
├── .dev.vars.example       # 本地环境变量模板，复制成 .dev.vars 使用
├── scripts/
│   └── build.mjs           # 零依赖打包 → public/_worker.js
├── public/                 # 构建输出目录，也是 Pages 的部署目录
│   ├── _worker.js          # ⚠ 由 npm run build 生成，不要手改
│   └── static/
│       ├── style.css       # 前台样式
│       ├── admin.css       # 后台样式
│       ├── avatar.svg      # 默认头像
│       └── favicon.svg
└── src/
    ├── index.js            # Hono 应用：路由 + 中间件 + 全部 API
    ├── lib/
    │   ├── auth.js         # HMAC 签名 Cookie / 常量时间密码比较
    │   ├── markdown.js     # 零依赖 Markdown 渲染 + 目录生成
    │   ├── db.js           # D1 数据访问层（含 images 表读写）
    │   └── utils.js        # 日期格式化、slug 等
    └── views/
        ├── layout.js       # 页面骨架、侧边栏、浮动目录
        ├── home.js         # 文章列表
        ├── post.js         # 文章详情
        ├── archives.js     # 归档 / 搜索
        ├── lock.js         # 访客密码页 / 管理员登录页
        └── admin.js        # 后台控制台（EasyMDE 编辑器）
```

### 为什么是 `_worker.js` 而不是 `functions/` 目录

`npm run build` 把整个 Hono 应用打包成**单个** `public/_worker.js`。Cloudflare Pages 一旦在输出目录里发现 `_worker.js`，就会以 **advanced mode** 运行它 —— 所有请求（页面、API、静态资源）都由 Hono 接管。因此**不需要** `functions/` 目录，也不会有「打包函数阶段」的报错，`wrangler pages deploy ./public` 一条命令即可完成部署。

打包器是 `scripts/build.mjs` 里自己实现的（约 200 行，无任何第三方依赖）：它解析 `import` / `export`，按 `package.json` 的 `exports` 字段解析 `hono` / `hono/cors` / `hono/body-limit` 等子路径，然后输出一个自带模块注册表的小运行时。**不需要 esbuild**，所以构建机器上 `npm install` 能否成功都不影响产出。

---

## 2. 本地开发

```bash
npm install                       # 装 wrangler 和 hono
cp .dev.vars.example .dev.vars    # Windows: copy .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 SITE_PASSWORD / ADMIN_USER / ADMIN_PASS / COOKIE_SECRET
npm run db:init:local             # 初始化本地模拟 D1
npm run dev                       # 构建 + 起本地服务
```

`npm run dev` 等价于：

```bash
npm run build && wrangler pages dev
```

`wrangler pages dev` 读取 `wrangler.toml` 里的 D1 绑定和 `[vars]`，密钥来自 `.dev.vars`，默认地址 `http://127.0.0.1:8788`。

---

## 3. 环境变量

在 Cloudflare 控制台 **Workers & Pages → uvcat → Settings → Variables and Secrets** 里配置（生产 + 预览都要配）。

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `SITE_PASSWORD` | ✅ | 全站访客密码，输入后可看 7 天 |
| `ADMIN_USER` | ✅ | 管理员账号 |
| `ADMIN_PASS` | ✅ | 管理员密码 |
| `COOKIE_SECRET` | ✅ | Cookie 签名密钥，建议 32 位以上随机串 |
| `R2_PUBLIC_URL` | | 留空 → 图片走 `/api/images/...`；只有绑定了 R2 才填公开域名（末尾不带 `/`） |
| `BLOG_NAME` | | 博客名（侧边栏 / `<title>`） |
| `BLOG_DESCRIPTION` | | 副标题 |
| `AVATAR_URL` | | 头像地址，`/static/avatar.svg` 为自带 |
| `GITHUB_URL` | | 侧边栏 GitHub 链接 |
| `SESSION_TTL` | | 会话有效期（秒），默认 `604800`（7 天） |

改完变量后需要在 **Deployments** 标签页对最新一次部署点 **Retry deployment** 才会生效。

---

## 4. 绑定（Bindings）

**Settings → Bindings** 里只需要一个：

| 类型 | 变量名 | 目标 |
| --- | --- | --- |
| D1 database | `DB` | `blog-db` |

R2 是可选的：如果以后开通了 R2，建一个 `blog-images` 桶，添加绑定 `BUCKET`，再把 `R2_PUBLIC_URL` 填成桶的公开域名即可 —— 代码会自动优先用 R2，不用改任何源码。

---

## 5. 从 GitHub 自动部署

仓库根目录必须是本项目（`package.json` 在最外层）。Cloudflare Pages 连接 Git 后这样填：

| 配置项 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | `public` |

如果 `npm install` 那一步失败（例如网络问题），构建命令仍能跑通：`build.mjs` 在环境里找不到 `hono` 时会退回，并**保留仓库里已提交的 `public/_worker.js`**。注意这种方式下改 `src/` 不会生效，需要本地构建后再推送。

---

## 6. 图片是怎么存的（不绑 R2）

上传接口 `POST /api/admin/upload` 的行为：

1. 有 `BUCKET` 绑定 → 写入 R2，返回 `R2_PUBLIC_URL/key`；
2. 没有 `BUCKET` → 写入 D1 的 `images` 表，返回 `/api/images/<key>`。

D1 单行上限约 1 MB，所以**无 R2 时单张图片限制 800 KB**，且只接受 png / jpg / gif / webp / avif / svg / bmp / ico。超限返回 `413` 并提示压缩。

`/api/images/...` 在访客锁豁免名单里（key 是不可猜的 UUID），所以文章里的 `<img>` 不需要 Cookie 也能显示。

---

## 7. 数据库表

| 表 | 用途 |
| --- | --- |
| `posts` | 文章 |
| `post_views` | 每篇文章的阅读数 |
| `site_meta` | 键值对（schema 版本等） |
| `images` | 无 R2 时的图片存储：`key` / `content_type` / `size` / `data(BLOB)` |

重新初始化（幂等，不会重复插入演示文章）：

```bash
npx wrangler d1 execute blog-db --remote --file=./schema.sql
```

---

## 8. 常见问题

**首页 500，提示「数据库未配置」** → Settings → Bindings 里少了 `DB`，或变量名写错。

**页面提示「还需要配置环境变量」** → 缺 `SITE_PASSWORD` / `ADMIN_USER` / `ADMIN_PASS`。加完记得 **Retry deployment**。

**上传图片 413** → 没绑 R2，图片超过 800 KB。压缩一下，或者开通 R2。

**上传图片报「D1 里缺少 images 表」** → 重新执行一次 `schema.sql`。

**改了密码但旧会话还有效** → 会话密钥由密码派生，改 `ADMIN_PASS` / `SITE_PASSWORD` 会立刻让所有旧 Cookie 失效，属于预期行为。

**忘记管理员密码** → Cloudflare 控制台改 `ADMIN_PASS` → Retry deployment 即可。

---

*Licensed under CC BY-NC-SA 4.0*
