# 小乖乖 · 家庭与成长内容站（xiaoguaiguai.cn）

面向妈妈与家庭群体的**原创内容站**：原创文章 + 本站自研小工具。

- 唯一访问域名：**https://xiaoguaiguai.cn**
- 后台入口：**https://xiaoguaiguai.cn/admin**
- 数据源：`posts/*.md`（文章）+ `tools/tools.json`（工具索引），文章由 Sveltia CMS 读写
- 图片存储：Cloudflare R2（桶 `xiaoguaiguai-media`），经 Worker 反代到 **`/media/*`**，**不上传 Git 仓库**

> **站点定位（2026-10-24 调整）**：由「资源导航站」转为**纯内容站**，**已彻底删除外部资源导航**
> （原 `nav.json` 的 40 条第三方链接与后台 nav 集合均已下线）。
> 现在首页只呈现：置顶精选 + 最新文章 + 分类入口 + 自研小工具，**零站外跳转**。
>
> 首期**不启用任何子域名**，全部配置收敛于主域名。
> 配图公开地址形如 `https://xiaoguaiguai.cn/media/covers/<分类拼音>-<content|tool>.webp`，
> 清单见 `_deliverables/R2配图清单.md`。

## 一、一级分类（固定 5 个，不可新增/删减）

| 分类 | 分类页 | 原创文章 | 自研小工具 |
|---|---|---|---|
| 🧸 婴幼儿养育 | `/category/yuer/` | 4 | 2 |
| 📖 儿童教育 | `/category/jiaoyu/` | 4 | 0（待补） |
| 🌷 女性成长 | `/category/nvxing/` | 4 | 0（待补） |
| 🏠 家庭关系 | `/category/jiating/` | 4 | 0（待补） |
| 💞 两性亲密成长 | `/category/qinmi/` | 4 | 0（待补） |
| **合计** | **5 个分类页** | **20** | **2** |

## 二、内容体系（两套）

| 体系 | 目录 | 数量要求 | 发布方式 |
|---|---|---|---|
| **原创文章** | `posts/*.md` | 每分类 ≥4 篇 | 后台「内容文章」新建/编辑/删除 |
| **自研小工具** | `tools/` | 每分类 ≥2 个（当前样板 2 个） | 加 json + 片段 html，构建部署 |

文章是本站原创正文，小工具是本站自研交互页面（**不跳转任何外部网站**）。

## 三、目录结构

```
.
├─ build.mjs           # 零依赖静态构建脚本（生成 _dist/）
├─ posts/              # 原创文章，每篇一个 .md（Sveltia CMS 读写）
│  └─ <slug>.md
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
│  └─ config.yml       # Sveltia CMS 配置（仅 posts 集合）
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
| `index.html` | **【生成】** 首页：置顶精选 + 最新文章(9) + 分类入口 + 小工具 |
| `favicon.svg` / `_headers` / `admin/` | 原样拷贝 |
| `posts.json` | 文章索引，按日期倒序（供站内检索/降级） |
| `posts/index.html` | 文章列表页，按分类分组 |
| `posts/<slug>/index.html` | 文章详情页（含「同类内容」推荐） |
| `category/<slug>/index.html` | **【生成】** 分类页 × 5（顶部导航直达） |
| `tools.json` | 工具索引 |
| `tools/index.html` | 工具列表页 |
| `tools/<slug>/index.html` | 工具页（片段 + 统一外壳） |

**设计取舍**：
- 自带最小 markdown 渲染器，不引入 markdown 库 —— 构建链不会因依赖升级而碎
- 页面样式全部内联 —— 本 zone 忽略 query string 且无 purge 权限，外部 CSS 改版必须换路径（铁律 7）；内联则零子资源、零缓存问题
- **首页构建时静态生成**（非运行时 fetch）—— 内容站依赖 SEO，静态 HTML 可被爬虫直接抓取；同时彻底消除 fetch 失败导致的空白页
- 顶部站头 + 导航栏由 `topbar()` 统一注入，所有页面共用一套，改一次全站生效
- 工具源文件只写「片段」，外壳统一注入

## 五、文章写法（`posts/<slug>.md`）

```yaml
---
title: 标题（建议 8～18 字）
date: 2026-10-20
category: 🧸 婴幼儿养育
excerpt: 摘要 40～70 字
cover: ""            # 留空则自动用该分类默认配图
tags: [标签一, 标签二]
draft: false         # true 则完全不发布
---

## 一级章节（正文从 ## 起写，页面 h1 由系统生成）

正文支持 **加粗**、*斜体*、`行内代码`、[链接](/posts/)、列表、引用、代码块、分割线。
```

`category` 必须是 5 个固定分类之一（含 emoji 与空格）。构建时按「正文最小标题层级」自动对齐到 `h2`，因此从 `##` 或 `#` 起写都能得到正确层级。

## 六、顶部导航栏（全站统一）

| 顺序 | 文字 | 指向 |
|---|---|---|
| 1 | 首页 | `/` |
| 2–6 | 婴幼儿养育 / 儿童教育 / 女性成长 / 家庭关系 / 两性亲密成长 | `/category/<slug>/` |
| 7 | 小工具 | `/tools/` |

## 七、数据模型（`tools/tools.json`）

站内唯一的索引型数据源是工具清单（文章索引由 `posts/*.md` 构建时派生）：

```json
{
  "slug": "baby-age-calculator",
  "title": "宝宝月龄计算器",
  "desc": "输入出生日期，算出月龄/周龄与下次疫苗节点，共情调性 30～60 字",
  "category": "🧸 婴幼儿养育",
  "cover": "R2 图片公开地址，无图留空字符串",
  "tags": ["月龄", "疫苗"]
}
```

`category` 必须是 5 个固定分类之一；`cover` 只接受主域名 `/media/*` 公开地址（或空字符串）。

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

需先在仓库配置两个 Secret（Settings → Secrets and variables → Actions）：

| Secret | 值 | 权限要求 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF API Token | Account → Cloudflare Pages → **Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | `99032f2638cd2ead55b4f0f42e462902` | — |

> ⚠️ 现有 `.cf_token`（`cfut_` 前缀）**没有 Pages 权限**（实测 403），不能直接用于 CI，需新建带 Pages:Edit 的 Token。

**判断 CI 失败原因**：workflow 里 Build / Verify 全绿而只有 Deploy 红 ⇒ 逻辑没问题，缺 Secrets。
`node _trash_check_ci.mjs` 可打印本次 commit 的步骤级结论（含每个 step 的 OK/FAIL）。

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

## 十二、待人工处理项

1. ~~创建 GitHub OAuth App 并写入 Worker 环境变量~~ —— ✅ 已完成（2026-10-23）
2. ~~上传配图到 R2 并回填 `cover` 字段~~ —— ✅ 已完成（2026-10-24，Agent 代生成上传，10 张）
3. ~~人工核验所有第三方外链~~ —— ✅ 已完成（历史项，外部导航已于 2026-10-24 整体下线）
4. ~~在 Cloudflare 为 `xiaoguaiguai.cn` 绑定 Pages 自定义域~~ —— ✅ 已完成
5. **配置 GitHub Actions 部署 Secrets**（`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`）—— ⏳ **待办**，见第十节
6. **补其余 4 个分类的小工具**（每分类 ≥2 个，当前仅婴幼儿养育有 2 个）—— ⏳ 待办
   建议清单：📖 儿童教育（儿童专注计时器 / 亲子阅读打卡）、🌷 女性成长（情绪日记 / 四象限待办）、
   🏠 家庭关系（家务分工表 / 家庭开支记录）、💞 两性亲密成长（沟通句式转换器 / 纪念日计算）。
   复制 `tools/baby-age-calculator.html` 的片段结构即可，`build.mjs` 会自动生成外壳与列表项。

## 十三、许可

本站内容与配置为站点自用。
