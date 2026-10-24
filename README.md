# 小乖乖 · 家庭与成长内容站（xiaoguaiguai.cn）

面向妈妈与家庭群体的**原创内容站**：原创文章 + 本站自研小工具。

- 唯一访问域名：**https://xiaoguaiguai.cn**
- 后台入口：**https://xiaoguaiguai.cn/admin**
- 数据源：`posts/*.md`（文章）+ `tools/tools.json`（工具索引），文章由 Sveltia CMS 读写
- 图片存储：Cloudflare R2（桶 `xiaoguaiguai-media`），经 Worker 反代到 **`/media/*`**，**不上传 Git 仓库**

> **站点定位（2026-10-24 调整）**：由「资源导航站」转为**纯内容站**，**已彻底删除外部资源导航**
> （原 `nav.json` 的 40 条第三方链接与后台 nav 集合均已下线）。
>
> **版式改版（2026-10-24 第二轮）**：列表呈现方式由「大图卡片」改为**门户式纯文字索引**
> —— 首页与全部栏目列表页统一按 CMS 索引方式排版（左侧分类色条 + 标题 + 摘要 + 元信息），
> 宽屏双栏、窄屏单栏。**大图只保留在首页焦点区（全站唯一）与文章详情页**。
>
> 同时补齐 **Google AdSense 审核 / Google 搜索收录**所需页面：
> 关于我们、隐私政策（含第三方广告 Cookie 与个性化广告退出说明）、免责声明、使用条款、联系我们（含 FAQ），
> 并在根目录输出 **`sitemap.xml`** 与 **`robots.txt`**。
>
> 首期**不启用任何子域名**，全部配置收敛于主域名。
> 配图公开地址形如 `https://xiaoguaiguai.cn/media/covers/<分类拼音>-<content|tool>.webp`，
> 清单见 `_deliverables/R2配图清单.md`。
>
> **工具扩容 + 双向互链（2026-10-25）**：小工具由 10 个扩到 **20 个**（每分类 4 个，女性分类含生理期记录与周期推算），
> 并为全部 20 个工具各配一篇**引导文章**——科普切入 → 过渡到工具 → 文末工具跳转卡片；
> 工具页顶部反向挂「配套阅读」入口。文章总数 40 → **60 篇**，sitemap 35 → **93 条 URL**。

## 一、一级分类（固定 5 个，不可新增/删减）

| 分类 | 分类页 | 原创文章 | 自研小工具 |
|---|---|---|---|
| 🧸 婴幼儿养育 | `/category/yuer/` | 12 | 4 |
| 📖 儿童教育 | `/category/jiaoyu/` | 12 | 4 |
| 🌷 女性成长 | `/category/nvxing/` | 12 | 4 |
| 🏠 家庭关系 | `/category/jiating/` | 12 | 4 |
| 💞 两性亲密成长 | `/category/qinmi/` | 12 | 4 |
| **合计** | **5 个分类页** | **60** | **20** |

每分类配额为「文章 ≥4 篇、小工具 ≥4 个」的硬下限（文章当前每类 12 篇）。该配额由
`.github/workflows/deploy.yml` 的 Verify 步骤逐分类校验，不达标直接 fail，不会发到线上。

> 每篇文章与每个工具之间还有一层**双向互链**约束（见「七之二」）：20 个工具各自绑定 1 篇引导文章，
> CI 会逐个校验「引导文章产物存在 + 文章页渲染出工具卡片 + 工具页渲染出配套阅读入口」。
> 因此 60 篇文章里，有 20 篇是「工具引导文」（`guide-*.md`），其余 40 篇为常规科普文。

## 二、内容体系（三套）

| 体系 | 目录 | 数量要求 | 发布方式 |
|---|---|---|---|
| **原创文章** | `posts/*.md` | 每分类 ≥4 篇（当前每类 12 篇，共 60 篇） | 后台「内容文章」新建/编辑/删除 |
| **工具引导文** | `posts/guide-*.md` | 每个工具 1 篇（当前 20 篇） | 同文章，frontmatter 多一个 `tool:` 字段 |
| **自研小工具** | `tools/` | 每分类 ≥4 个（当前每类 4 个，共 20 个） | 加 json + 片段 html，构建部署 |
| **站点页面** | `pages/*.md` | 5 个合规页（固定） | 后台「站点页面」编辑 |

文章是本站原创正文，小工具是本站自研交互页面（**不跳转任何外部网站**）。
`pages/*.md` 承载 AdSense / 搜索审核必需的信息页：关于我们、隐私政策、免责声明、使用条款、联系我们。

**工具引导文**的定位：以科普知识切入（如「月龄到底怎么算」「专注时长随年龄怎么变」），
中段平滑过渡到工具能解决的具体动作，文末给出工具跳转卡片。写这类文的目的是让工具被搜索到、
也被看懂——用户从搜索进来先读到知识，再自然用上工具，而不是看到一个光秃秃的计算器。

## 三、目录结构

```
.
├─ build.mjs           # 零依赖静态构建脚本（生成 _dist/）
├─ posts/              # 原创文章，每篇一个 .md（Sveltia CMS 读写）
│  └─ <slug>.md
├─ pages/              # 站点页面（合规页），每页一个 .md（Sveltia CMS 读写）
│  ├─ about.md  privacy.md  disclaimer.md  terms.md  contact.md
├─ tools/
│  ├─ tools.json       # 工具索引
│  └─ <slug>.html      # 各工具页「片段」，外壳由 build.mjs 注入
├─ favicon.svg         # 站点图标
├─ _headers            # 安全头与缓存策略（含 CSP）
├─ README.md           # 本文件
├─ .github/workflows/
│  └─ deploy.yml       # 推 main 自动构建 + 部署 CF Pages
├─ admin/
│  ├─ index.html       # Sveltia CMS 后台入口
│  └─ config.yml       # Sveltia CMS 配置（posts + pages 两个集合）
├─ oauth-proxy/        # GitHub OAuth 回调代理 Worker
├─ media-proxy/        # R2 配图反代 Worker（主域名 /media/*）
└─ _dist/              # 构建产物（不入库）
```

> 首页**不再有源文件**：`_dist/index.html` 由 `build.mjs` 在构建时静态生成。

## 四、构建与产物

```bash
node build.mjs
```

零依赖（只用 Node 内置模块，无需 npm install），输出到 `_dist/`：

| 产物 | 说明 |
|---|---|
| `index.html` | **【生成】** 首页：焦点区(1 张大图) + 最新内容索引(12 条纯文字) + 分类入口 + 小工具 |
| `favicon.svg` / `_headers` / `admin/` | 原样拷贝 |
| `posts.json` | 文章索引，按日期倒序（供站内检索/降级） |
| `posts/index.html` | 全部内容页：门户式页头 + 分类快捷锚点 + 5 个分类区块（纯文字索引，共 60 篇） |
| `posts/<slug>/index.html` | 文章详情页（含「同类内容」推荐；引导文另含文末工具卡片） |
| `category/<slug>/index.html` | **【生成】** 分类页 × 5：页头统计 + 双栏纯文字索引 + 其他分类入口 |
| `tools.json` | 工具索引（每条含 `guide` / `guideUrl` 指向引导文章） |
| `tools/index.html` | 工具列表页（共 20 个） |
| `tools/<slug>/index.html` | 工具页（片段 + 统一外壳；顶部含「配套阅读」入口） |
| `about/` `privacy/` `disclaimer/` `terms/` `contact/` | **【生成】** 合规页 × 5（含「相关页面」区块） |
| `sitemap.xml` | **【生成】** 93 条 URL（首页/列表/5 分类/20 工具/60 文章/5 合规页） |
| `robots.txt` | **【生成】** `Allow: /` + `Disallow: /admin/` + Sitemap 声明 |
| `404.html` | **【生成】** 自定义 404 页（`noindex`） |

**设计取舍**：
- 自带最小 markdown 渲染器，不引入 markdown 库 —— 构建链不会因依赖升级而碎
- 页面样式全部内联 —— 本 zone 忽略 query string 且无 purge 权限，外部 CSS 改版必须换路径（铁律 7）；内联则零子资源、零缓存问题
- **首页与全部列表页构建时静态生成**（非运行时 fetch）—— 内容站依赖 SEO，静态 HTML 可被爬虫直接抓取；同时彻底消除 fetch 失败导致的空白页
- **列表用纯文字索引而非大图卡片** —— 本轮改版要求「大气、CMS 索引感」；同时减少图片请求、加快首屏、避免大图与文字比例失衡
- 顶部站头 + 导航栏由 `topbar()` 统一注入，所有页面共用一套，改一次全站生效
- 工具源文件只写「片段」，外壳统一注入
- `shell()` 统一输出 SEO 元信息：非 `noindex` 页面自动带 `robots: index, follow, max-image-preview:large`、canonical、OG 标签、`rel=sitemap`

## 五、文章写法（`posts/<slug>.md`）

```yaml
---
title: 标题（建议 8～18 字）
date: 2026-10-20
category: 🧸 婴幼儿养育
excerpt: 摘要 40～70 字
cover: ""            # 留空则自动用该分类默认配图
tags: [标签一, 标签二]
tool: ""             # 可选：绑定的工具 slug，填了就在文末渲染工具卡片
draft: false         # true 则完全不发布
---

## 一级章节（正文从 ## 起写，页面 h1 由系统生成）

正文支持 **加粗**、*斜体*、`行内代码`、[链接](/posts/)、列表、引用、代码块、分割线。
```

`category` 必须是 5 个固定分类之一（含 emoji 与空格）。构建时按「正文最小标题层级」自动对齐到 `h2`，因此从 `##` 或 `#` 起写都能得到正确层级。

## 五之二、站点页面写法（`pages/<slug>.md`）

合规页（关于/隐私/免责/条款/联系）走同一套 frontmatter，可在后台「站点页面」编辑：

```yaml
---
title: 隐私政策
slug: privacy          # 决定 URL：/privacy/
desc: 页面副标题，会渲染为页头 .sub
updated: 2026-10-24
order: 2               # 页脚与「相关页面」的排序
pri: 0.5               # sitemap 里的 priority
---

## 章节标题（正文从 ## 起写）

正文写法与文章一致。
```

> ⚠️ 隐私政策是 AdSense 审核的核心，改动时务必保留：第三方广告 Cookie 说明、
> 个性化广告退出方式（`adssettings.google.com` / `aboutads.info`）、数据保留与用户权利章节。
> `_selfcheck.py` 与 CI 的 Verify 步骤均会对这些关键词做断言，删掉会直接构建失败。

## 六、顶部导航栏（全站统一，8 项）

| 顺序 | 文字 | 指向 |
|---|---|---|
| 1 | 首页 | `/` |
| 2–6 | 婴幼儿养育 / 儿童教育 / 女性成长 / 家庭关系 / 两性亲密成长 | `/category/<slug>/` |
| 7 | 小工具 | `/tools/` |
| 8 | 关于 | `/about/` |

页脚另设 7 项导航：关于我们 / 联系我们 / 隐私政策 / 免责声明 / 使用条款 / 全部内容 / 小工具，并展示联系邮箱 `contact@xiaoguaiguai.cn`。

## 七、数据模型（`tools/tools.json`）

站内唯一的索引型数据源是工具清单（文章索引由 `posts/*.md` 构建时派生）：

```json
{
  "slug": "baby-age-calculator",
  "title": "宝宝月龄计算器",
  "desc": "输入出生日期，算出月龄/周龄与下次疫苗节点，共情调性 30～60 字",
  "category": "🧸 婴幼儿养育",
  "cover": "R2 图片公开地址，无图留空字符串",
  "tags": ["月龄", "疫苗"],
  "guide": "guide-baby-age-calculator"
}
```

`category` 必须是 5 个固定分类之一；`cover` 只接受主域名 `/media/*` 公开地址（或空字符串）；
`guide` 指向该工具的引导文章 slug（**必填**，CI 会校验其存在性，见下节）。

## 七之二、文章 ↔ 工具 双向互链（2026-10-25 新增）

工具不再是「孤岛页面」。每个工具都配一篇引导文章，两侧互链：

| 位置 | 字段 | 渲染结果 |
|---|---|---|
| 文章 frontmatter | `tool: <工具 slug>` | 文末 `aside.tool-link` 卡片（图标 + 名称 + 描述 + 「去用工具 →」） |
| `tools.json` 条目 | `guide: <文章 slug>` | 工具页顶部 `aside.guide-link`（「先看原理，再用工具：<链接>」） |

构建时 `build.mjs` 建立两张索引 `toolBySlug` / `postBySlug` 完成双向解析，
并在 `_dist/posts.json` 与 `_dist/tools.json` 里回填 `toolUrl` / `guideUrl` 便于前端与校验脚本消费。

**为什么两边都要写**：只写文章侧，工具页访客看不到阅读入口；只写工具侧，文章访客走不到工具。
两张索引在构建期解析而非运行时 fetch，因此链接是静态 HTML，爬虫可直接跟进。

> 校验在三个层次都做了：`_selfcheck.py`（源文件 + 产物）、CI Verify（产物）、
> `_trash_e2e.cjs`（浏览器实际渲染的 href）。**判据一律取产物/渲染结果**——
> 源里写了字段但 build 没渲染出来，属于真实上线事故。

## 八、前端固定改造

1. **站内链接一律同标签打开**；文章正文若出现外部链接，自动加 `target="_blank" rel="noopener noreferrer"`
2. **cover 空值判断**：为空字符串 / null 时不渲染图片，并对加载失败做移除兜底，杜绝破损图
3. **底部免责声明**：`.disclaimer` 简约样式，文案见下
4. **全站零外链**：首页、分类页、列表页、工具页均只指向站内路径（构建时由自检脚本强制校验）

> 本站内容仅为经验分享与知识科普，不提供医疗诊断、诊疗建议。涉及健康、育儿、心理问题时请以专业人士意见为准。所有内容仅供学习参考。

## 九、内容红线

1. 禁止医疗诊断、医嘱、疗效承诺、偏方；育儿与产后内容只做经验科普与知识分享
2. 两性亲密板块只聚焦沟通、边界、婚姻经营；严禁擦边、低俗、PUA、猎奇内容
3. 文案禁用焦虑营销词汇（必须、千万别、再不做就晚了、致命等）
4. 整体调性温和、共情、反焦虑、松弛，避免说教感
5. 涉及健康、育儿、心理的文章，文末须保留免责表述（如「不替代医生判断」「如有持续问题建议寻求专业帮助」）

## 十、部署

### 自动部署（推荐）

推送 `main` 分支即触发 GitHub Actions：`node build.mjs` → 产物校验 → 部署 CF Pages。
**在后台保存文章 = 一次 commit = 自动上线**，无需本地介入。

需先在仓库配置两个 Secret（Settings → Secrets and variables → Actions）—— ✅ **均已配置**：

| Secret | 值 | 权限要求 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF API Token | Account → Cloudflare Pages → **Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | `99032f2638cd2ead55b4f0f42e462902` | — |

> ⚠️ 现有 `.cf_token`（`cfut_` 前缀）**没有 Pages 权限**（实测 403），不能直接用于 CI，需新建带 Pages:Edit 的 Token。

**判断 CI 失败原因**：workflow 里 Build / Verify 全绿而只有 Deploy 红 ⇒ 逻辑没问题，缺 Secrets。
`node _trash_check_ci.mjs` 可打印本次 commit 的步骤级结论（含每个 step 的 OK/FAIL）。

### 工作流版本基线（2026-10-24）

| 项 | 取值 | 说明 |
|---|---|---|
| `runs-on` | `ubuntu-24.04` | **钉具体 LTS**，不用 `ubuntu-latest`（浮动标签会随 GitHub 迁移产生 notice 注解） |
| `actions/checkout` | `@v7` | `using: node24` |
| `actions/setup-node` | `@v7` | `using: node24`，`node-version: '22'` |
| `cloudflare/wrangler-action` | `@v4` | `using: node24`，配 `wranglerVersion: '4'` |

> 旧版 `@v4 / @v4 / @v3` 声明的是 `node20`，在 Node 24 runner 上会被强制提权并产生
> `Node.js 20 is deprecated` 警告注解。升级前务必核对新版 `action.yml` 的入参名有没有变
> （本轮实测三者入参名全部保留）。验收判据：`check-runs/{id}/annotations` 返回 `[]`，
> 且 `actions/jobs/{id}` 的 `labels` 回显 `["ubuntu-24.04"]`。

### 手动部署（兜底）

```bash
node build.mjs
npx --yes wrangler@4 pages deploy _dist --project-name=xiaoguaiguai-nav --branch=main
```

> 注意：手动部署走 **wrangler OAuth**（含 `pages:write`），与上面的 API Token 是两套凭据。

### OAuth 代理 Worker

```bash
cd oauth-proxy
npx --yes wrangler@4 deploy

# 写入加密环境变量（由人工提供 GitHub OAuth App 的 Client ID / Secret）
npx --yes wrangler@4 secret put GITHUB_CLIENT_ID
npx --yes wrangler@4 secret put GITHUB_CLIENT_SECRET
```

路由：`xiaoguaiguai.cn/oauth/*`（绑定主域名，不使用 Worker 自带域名）。

### 配图反代 Worker（media-proxy）

```bash
cd media-proxy
npx --yes wrangler@4 deploy
```

路由：`xiaoguaiguai.cn/media/*`，R2 绑定 `MEDIA` → 桶 `xiaoguaiguai-media`。

**为什么需要它**：规范要求配图走 R2 公开 URL，又要求禁用子域名，
且 `r2.dev` 域名在国内被 DNS 污染 —— 故用主域名子路径反代，两条约束同时满足。

上传配图（**`--remote` 不能省**，否则只写本地模拟桶）：

```bash
npx --yes wrangler@4 r2 object put "xiaoguaiguai-media/covers/yuer-content.webp" \
  --file "本地路径.webp" --content-type "image/webp" --remote
```

上传后访问 `https://xiaoguaiguai.cn/media/` 可看桶内清单（JSON）。

### R2 CORS

```bash
npx --yes wrangler@4 r2 bucket cors set xiaoguaiguai-media --file cors.json
```

允许来源：`https://xiaoguaiguai.cn`

## 十一、`_headers` 的两个硬约束（踩过坑）

1. **同一路径模式只能出现一次**。曾把 `/posts/*` 写两块（一块给 CSP、一块给 Cache-Control），结果**两条都静默失效**。所有头部必须写在同一个块内。
2. **CSP 只给内容页，绝不能覆盖 `/admin/`**。后台需从 `unpkg.com` 加载 Sveltia CMS 的 CSS/JS 并访问 `api.github.com`，被 CSP 约束后后台会直接打不开。

CSP 的作用是拦掉 CF 边缘自动注入的 RUM 信标（`static.cloudflareinsights.com/beacon.min.js` + `/cdn-cgi/rum`）——
`observability.enabled=false` 与字符串剥离都无效，只有 CSP 能拦住。其中 `script-src` 必须含 `'unsafe-inline'`，
否则首页与工具页的内联 `<script>` 会被全部拦死。

## 十一之二、挂 Google AdSense 时需回改 CSP

`_headers` 顶部已留出详细注释块。届时需在当前 CSP 基础上放行：

| 指令 | 需追加 |
|---|---|
| `script-src` / `script-src-elem` | `https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://adservice.google.com` |
| `frame-src` | `https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com` |
| `connect-src` | `https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net` |
| `img-src` | `https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net data:` |

> ⚠️ 放行后 CF RUM 信标拦截不受影响（`script-src-elem` 里仍只列白名单域名，不含 `cloudflareinsights.com`），
> 但 `script-src 'self'` 若被改成通配符就会同时放过 RUM。改完务必用 `_trash_e2e.cjs` 的「RUM 拦截」项复验。

## 十一之三、SEO 与收录

| 产物 | 作用 | 关键点 |
|---|---|---|
| `/sitemap.xml` | 供 Google/Bing 索引 | 93 条 URL，含 `lastmod`/`changefreq`/`priority`；**不含** `/admin`、`404`、`*.json` |
| `/robots.txt` | 抓取指引 | `Allow: /`；`Disallow: /admin/`、`/posts.json`、`/tools.json`、`/404.html`；末尾声明 Sitemap |
| `rel="sitemap"` | HTML 内声明 | `shell()` 自动注入 |
| canonical | 去重 | 每页唯一，`https://xiaoguaiguai.cn<路径>` |
| OG 标签 | 分享卡片 | `og:type/site_name/title/description/url` + `twitter:card` |

提交入口：Google Search Console → 添加资源 `xiaoguaiguai.cn` → 提交 `https://xiaoguaiguai.cn/sitemap.xml`。

## 十二、待人工处理项

1. ~~创建 GitHub OAuth App 并写入 Worker 环境变量~~ —— ✅ 已完成（2026-10-23）
2. ~~上传配图到 R2 并回填 `cover` 字段~~ —— ✅ 已完成（2026-10-24，Agent 代生成上传，10 张）
3. ~~人工核验所有第三方外链~~ —— ✅ 已完成（历史项，外部导航已于 2026-10-24 整体下线）
4. ~~在 Cloudflare 为 `xiaoguaiguai.cn` 绑定 Pages 自定义域~~ —— ✅ 已完成
5. ~~配置 GitHub Actions 部署 Secrets~~ —— ✅ 已完成（2026-10-24，两个 Secret 均已配置，CI 全绿）
   逐步操作留档见 **`_deliverables/CI部署Secrets配置指引.md`**（含 CF 后台点击路径与失败判读）。
6. ~~消除 CI 注解~~ —— ✅ 已完成（2026-10-24，升级 action 至 node24 版本 + `runs-on` 钉 `ubuntu-24.04`，注解数归零）
7. ~~补其余 4 个分类的小工具~~ —— ✅ 已完成（2026-10-24，8 个新工具，全站 10 个、每分类 2 个）
   实际交付：📖 儿童教育（⏱️ 儿童专注计时器 / 📚 亲子阅读打卡本）、🌷 女性成长（🌤️ 情绪记录本 / 🗂️ 四象限待办分类器）、
   🏠 家庭关系（🧹 家务分工与负荷参考表 / 📊 家庭开支分配参考）、💞 两性亲密成长（💬 沟通句式转换器 / 📅 纪念日与相处天数）。
   全部纯前端 + `localStorage` 持久化、零外链、无数据上报。
8. ~~每分类再补 2 个工具（全站 20 个）~~ —— ✅ 已完成（2026-10-25）
   新增：🧸 婴幼儿养育（📏 身高体重记录与对照 / 💉 疫苗接种时间表）、📖 儿童教育（✏️ 作业卡点应对参考 / 🌱 具体表扬生成器）、
   🌷 女性成长（🌸 **生理期记录与周期推算** / 🔋 精力收支梳理表）、🏠 家庭关系（🛡️ 界限沟通话术生成器 / 🧭 家里谁说了算对照表）、
   💞 两性亲密成长（⏸️ 争吵暂停指引 / ⏳ 两人时间与隐形劳动对照）。
   女性分类按要求含生理期计算与记录工具。
9. ~~为全部工具写引导文章并双向互链~~ —— ✅ 已完成（2026-10-25，20 篇 `guide-*.md`，
   科普切入 → 过渡到工具 → 文末工具卡片；工具页顶部反向挂「配套阅读」入口）
10. **挂 Google AdSense** —— ⏳ 待办（信息页与 sitemap 已就绪，等审核通过后按「十一之二」放行 CSP）
11. **提交 sitemap 到 Google Search Console / Bing Webmaster** —— ⏳ 待办（需站点所有者在浏览器登录操作）
12. ~~关闭 Cloudflare 托管 robots.txt 开关~~ —— ✅ 已完成（2026-10-25，用户自行在 Dashboard 关闭）

## 十二之二、本地验收脚本

> ⚠️ 这些脚本**不纳入版本控制**（`.gitignore` 的 `_trash_*` 与 `_selfcheck.py`）。
> 它们只存在于本机工作目录，克隆仓库拿不到——本节是**契约文档**：换机器时按此表重建，判据必须一致。

| 脚本 | 覆盖 | 基线 |
|---|---|---|
| `_selfcheck.py` | 产物文件存在性、域名收敛、合规页、sitemap/robots 内容、**每分类工具配额（≥4）**、**工具↔引导文双向互链** | 全部通过 |
| `_trash_e2e.cjs` | 端到端 99 项：导航/首页/列表页/分类页/文章页/工具交互（全部 20 个）/合规页/SEO 产物/零外链/**20 组双向互链 href** | **99/99** |
| `_trash_layout.cjs` | 版式 DOM 度量 90 项：索引条目结构、双栏、字号行高、无横向溢出、图片位置、20 个工具页版式、**20 篇引导文卡片版式** | **90/90** |

**同一份脚本跑本地与线上**，用 `BASE` 切换（不要再建 `_live` 副本——两份必然漂移，
线上那份曾长期停在「20 篇 / 2 工具」，直接跑会把线上全绿误判成大面积失败）：

```bash
# 本地：需先起静态服务。用 _trash_serve.py 而非 python -m http.server ——
# 前者是多线程且模拟 Pages 的 404 回落，后者会产生连接重置与 404 判据假失败
python _trash_serve.py 8899 _dist              # 终端 A
NODE_PATH=<playwright 所在> node _trash_e2e.cjs      # 终端 B，默认 BASE=127.0.0.1:8899
NODE_PATH=<playwright 所在> node _trash_layout.cjs

# 线上
BASE=https://xiaoguaiguai.cn NODE_PATH=<playwright 所在> node _trash_e2e.cjs
BASE=https://xiaoguaiguai.cn NODE_PATH=<playwright 所在> node _trash_layout.cjs
```

**Playwright 两个坑**：① `alert`/`confirm` 用全局 `page.on("dialog", d => d.accept().catch(()=>{}))`
统一接管，不要在各用例里注册 `page.once("dialog")`——残留监听器会在下一个弹窗上重复 accept，
抛 `already handled` 中断整个脚本。② ESM 不认 `NODE_PATH`，脚本须用 `.cjs`。

## 十三、许可

本站内容与配置为站点自用。
