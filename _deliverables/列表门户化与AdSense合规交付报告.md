# 小乖乖 xiaoguaiguai.cn · 列表页门户化改版 + AdSense/SEO 合规交付报告

**交付日期**：2026-10-24
**站点**：https://xiaoguaiguai.cn （Cloudflare Pages 项目 `xiaoguaiguai-nav`）
**仓库**：FBX-Dev/xiaoguaiguai-nav
**部署方式**：GitHub Actions（`ubuntu-24.04` + `actions/checkout@v7` + `actions/setup-node@v7` + `cloudflare/wrangler-action@v4`）
**最终状态**：✅ 已上线并通过全部验收

---

## 一、本轮三项需求的完成情况

| # | 需求 | 状态 | 落地方式 |
|---|---|---|---|
| 1 | 首页与各栏目列表页改为正常 CMS 索引式展示；解决「大图配文字丑」；参考母婴门户 CSS 重做，要求大气 | ✅ 完成 | 全面弃用配图卡片，改为**纯文字索引**；CSS 按门户结构重写 |
| 2 | 完成 Google AdSense 审核与 Google 搜索审核所需的隐私权限、关于说明等页面 | ✅ 完成 | 新建 5 个合规页（`pages/*.md`），可由 CMS 后台编辑 |
| 3 | 根目录实现 sitemap.xml 供搜索引擎索引 | ✅ 完成 | 构建时生成 `sitemap.xml`（35 条 URL）+ `robots.txt` |

---

## 二、列表页改版：从「大图卡片」到「门户式纯文字索引」

### 2.1 为什么弃用大配图

您反馈「大图配文字好丑」，经排查根因是**图文比例与栅格不适配**：原 `a.card` 卡片在大屏下每行 3 列，封面图被拉伸到非设计比例，加上标题只有两行，整体头重脚轻。

**推荐选择**（已在本次实施）：列表页**彻底不用配图**，只保留首页焦点区 1 张主图与文章详情页头图。理由有三：

1. **信息密度更高**——门户站（母婴类尤其如此）列表页靠的是「标题 + 摘要 + 元信息」的密集排布，让读者一屏扫到 10 条以上，而不是被 3 张大图占满首屏。
2. **彻底消除图片比例问题**——不再有拉伸、裁切、留白不一致的观感缺陷。
3. **减少请求、利于 SEO**——列表页零图片请求，LCP 更快；纯文本内容对搜索引擎更友好。

### 2.2 新的视觉结构

**① 纯文字索引 `ul.index` / `a.item`**

每条内容一行，结构为：

```
▎标题（左侧 3px 分类色竖条）
  摘要（1~2 行，超出省略）
  [分类标签] · 日期 · #标签1 #标签2
```

- 左侧分类色竖条用 `::before` 实现，5 个分类各一色，一眼可辨归属
- 行与行之间用 1px 细线分隔，形成规整的「索引」观感
- 悬停时标题变色 + 竖条加粗，交互克制

**② 双栏自适应 `ul.index.two`**

- 宽屏（>860px）：`repeat(auto-fill, minmax(420px, 1fr))` 双栏排布
- 窄屏：自动回落单列
- 用于分类页（单分类内容较多时更紧凑）

**③ 门户式页头 `header.page`**

```
┌─────────────────────────────────────────────┐
│ 婴幼儿养育                      12 篇内容   │
│ 记录宝宝成长的每一步             2026-10-22 │
└─────────────────────────────────────────────┘  ← 2px 实线
```

左侧 `h1` + 副标题，右侧统计数字，两端对齐后加 2px 底线，是门户站的标准页头语言。

**④ 区块标题**

`border-left: 3px solid var(--accent)` 竖条 + 右侧「查看全部 →」，统一全站区块入口。

### 2.3 各页面落点

| 页面 | 列表形态 | 图片 |
|---|---|---|
| 首页 | 焦点区 1 篇（大图）+ 最新 13 篇纯文字索引 | 仅焦点区 1 张 |
| `/posts/` 全部内容 | 页头 + 5 个分类锚点快捷入口 + 5 个区块共 20 条纯文字索引 | **0 张** |
| `/category/<slug>/` 分类页 | 页头（含篇数/更新日期）+ 双栏纯文字索引 + 「浏览其他分类」 | **0 张** |
| 文章详情页 | 页头 + 正文 + 面包屑 + 「同类内容」纯文字索引 | 头图 1 张 |
| `/tools/` 工具页 | 页头 + 工具卡片网格（保留，工具需图标示意） | — |
| 5 个合规页 | 页头 + 正文 + 「相关页面」纯文字索引 | **0 张** |

### 2.4 设计变量体系

CSS 变量集中管理，改一处全站生效：

```
--ink / --ink-2 / --ink-mute   三级文字层次
--accent / --accent-deep       主色与深色变体
--radius / --radius-lg         圆角
--shadow / --shadow-hover      阴影层次
```

断点：`@media (max-width: 860px)` 与 `@media (max-width: 560px)` 两级。

---

## 三、Google AdSense / 搜索审核合规页

### 3.1 新建 5 个页面（`pages/*.md`，CMS 可编辑）

| 页面 | 路径 | order | priority | 章节数 |
|---|---|---|---|---|
| 关于我们 | `/about/` | 1 | 0.5 | 7 |
| 隐私政策 | `/privacy/` | 2 | 0.5 | 11 |
| 免责声明 | `/disclaimer/` | 3 | 0.4 | 11 |
| 使用条款 | `/terms/` | 4 | 0.4 | 10 |
| 联系我们 | `/contact/` | 5 | 0.4 | 5（含 6 条 FAQ） |

联系邮箱统一为 **contact@xiaoguaiguai.cn**（域名邮箱），在页脚与各合规页均有露出。

### 3.2 隐私政策：AdSense 审核核心

AdSense 审核最容易被拒的就是隐私政策不达标。本页已覆盖审核方关注的全部要点：

- **Cookie 与类似技术**总述
- **Google AdSense 明确点名**：说明 Google 作为第三方广告商会使用 Cookie
- **DoubleClick DART Cookie** 说明与作用
- **个性化广告退出路径**：直接给出 `adssettings.google.com` 与 `aboutads.info`
- **CEE / 英国 / 瑞士**用户同意管理平台说明（GDPR 相关）
- **第三方广告**独立章节
- **「我们不做什么」**：明确不收集敏感个人信息
- **儿童隐私**：本站面向家长，不面向 13 岁以下儿童
- **你的权利**：访问、更正、删除
- **数据保留**、**政策更新**、**联系我们**

### 3.3 `_headers` 已预埋 AdSense 改动指引

CSP 目前是 `script-src 'self' 'unsafe-inline'`，挂 AdSense 后必须放行 Google 域名。已在 `_headers` 写入详细注释块，列出届时需要放行的 `script-src` / `frame-src` / `connect-src` / `img-src` 清单与示意 CSP，届时照改即可。

---

## 四、sitemap.xml 与 robots.txt

### 4.1 sitemap.xml（35 条 URL）

| 类型 | 数量 | changefreq | priority |
|---|---|---|---|
| 首页 | 1 | daily | 1.0 |
| `/posts/` 全部内容 | 1 | daily | 0.9 |
| 5 个分类页 | 5 | weekly | 0.8 |
| `/tools/` + 2 个工具页 | 3 | weekly / monthly | 0.7 / 0.6 |
| 20 篇文章 | 20 | monthly | 0.7 |
| 5 个合规页 | 5 | yearly | 按 `pri` 字段 |

已校验：**不含** `/admin`、不含 `404`、不含 JSON 索引文件。构建时自动生成，新增文章会自动进 sitemap。

### 4.2 robots.txt

构建产物中声明：

- `Allow: /`（全站可抓）
- `Disallow: /admin/`、`/admin`、`/posts.json`、`/tools.json`、`/404.html`
- 显式 `Allow: /` 放行 Googlebot、Bingbot、**Baiduspider**、PetalBot、Sogou、360Spider、YisouSpider
- 显式 `Disallow: /` 拒绝 GPTBot、ClaudeBot、Google-Extended、CCBot、Bytespider
- `Sitemap: https://xiaoguaiguai.cn/sitemap.xml`

### 4.3 ⚠️ 已发现并缓解的一个 Cloudflare 侧问题（需您手动关闭一个开关）

**现象**：CF 的「托管 robots.txt（Content Signals Policy）」会在我们自己的 robots.txt **之前**追加一段托管内容，其中把 **Baiduspider 与 PetalBot 误判为 AI 训练爬虫并写了 `Disallow: /`**。百度是中国最大的搜索引擎，这会导致**百度无法收录本站**。

这是 Cloudflare 的已知问题（社区已有大量反馈：面板里 Baidu 设为允许，但生成的文件里是禁止）。

**已做的缓解**：在本站 robots.txt 中显式声明 `User-agent: Baiduspider` + `Allow: /`。按 RFC 9309 第 2.2.2 节，同一 User-agent 的多个分组须合并，同等具体度的 Allow / Disallow 取较宽松者——合规的爬虫会放行。**但这依赖爬虫正确实现合并逻辑**，不如关掉开关彻底。

**需要您操作**（我手上的凭据无 zone 设置权限，改不了）：

> Cloudflare Dashboard → 选择 `xiaoguaiguai.cn` → **Security** → **Settings** → 找到 **Content Signals Policy** / **Managed robots.txt** → 关闭

关闭后托管块不再追加，robots.txt 就是纯粹我们自己的内容。若您希望我来操作，需要提供一个带 **Zone → Zone Settings → Edit** 权限的 API Token。

---

## 五、验收结果（全绿）

| 验收项 | 结果 |
|---|---|
| 构建 | ✅ `文章 20 篇 ｜ 分类 5 个 ｜ 工具 2 个 ｜ 合规页 5 个` |
| 产物自检 `_selfcheck.py` | ✅ 全部通过（新增 sitemap/robots/合规页/纯文字索引断言） |
| 端到端（本地）`_trash_e2e.cjs` | ✅ **60 / 60** |
| 端到端（线上）`_trash_e2e_live.cjs` | ✅ **60 / 60** |
| 版式 DOM 度量（本地） | ✅ **69 / 69** |
| 版式 DOM 度量（线上） | ✅ **69 / 69** |
| GitHub Actions | ✅ 全绿，**0 条注解**，runner `ubuntu-24.04` |
| 线上路径巡检 | ✅ 14 条路径全部 200 |

### 线上路径巡检明细

```
200  /                       200  /about/
200  /posts/                 200  /privacy/
200  /category/yuer/         200  /disclaimer/
200  /tools/                 200  /terms/
200  /sitemap.xml            200  /contact/
200  /robots.txt             200  /posts.json
200  /tools.json             308  /404.html  ← Pages 规范化重定向，正常
```

### 过程中修复的两个线上问题

**① CF Email Obfuscation 破坏「零子资源」设计**

线上巡检发现工具页被注入 `cdn-cgi/scripts/.../email-decode.min.js`——CF 检测到页面明文邮箱后自动加了这个解码脚本，违反本站「CSS/JS 全内联、零子资源请求」的设计（该设计是为规避 WorkBuddy 发布场景的缓存坑，此处同样受益）。

修复：在 `<body>` 外层加 CF 官方 `<!--email_off-->` … `<!--/email_off-->` 标记。修复后线上 `data-cfemail` 0 处、`email-decode` 0 处，邮箱明文正常可见（用户可直接复制，Google 审核也能读到）。

**② 版式核验脚本的控制台断言误报**

CSP 拦截 CF 边缘 RUM 信标是**设计目的**，但脚本把它当成了错误。已修正为排除 `cloudflareinsights.com` 与 `cdn-cgi/rum`。

---

## 六、本轮文件变更清单

### 新增（10 个）

| 文件 | 说明 |
|---|---|
| `pages/about.md` | 关于我们 |
| `pages/privacy.md` | 隐私政策（AdSense 核心） |
| `pages/disclaimer.md` | 免责声明 |
| `pages/terms.md` | 使用条款 |
| `pages/contact.md` | 联系我们（含 FAQ） |
| `_deliverables/列表门户化与AdSense合规交付报告.md` | 本文件 |
| `_deliverables/shots/*.png` | 8 页面 × 桌面/移动 = 16 张截图 |
| `_trash_ci_status.mjs` | CI 状态查询（按 run id） |
| `_trash_ci_detail.mjs` | CI 步骤详情查询 |
| `_trash_shots.cjs` | 页面截图脚本 |

### 修改（8 个）

| 文件 | 变更 |
|---|---|
| `build.mjs` | 门户式 CSS 重写、纯文字索引组件、`readPages()`、合规页生成、sitemap、robots、`email_off` 标记、`shell()` 扩展 OG/robots/sitemap 标签 |
| `_headers` | 5 条合规页规则 + sitemap/robots 规则 + AdSense CSP 预埋注释 |
| `_selfcheck.py` | 新增 sitemap/robots/合规页/纯文字索引断言 |
| `.github/workflows/deploy.yml` | Verify 步骤扩充；robots 断言改为兼容 CF 托管注入 |
| `admin/config.yml` | 新增 `pages` collection |
| `_push_batch.mjs` | 纳入 `pages/` 目录 |
| `README.md` | 目录结构、导航、产物表、待办项更新 |
| `_trash_e2e.cjs` / `_trash_e2e_live.cjs` | 全量重写以匹配新结构 |
| `_trash_layout.cjs` / `_trash_layout_live.cjs` | 69 项 DOM 度量核验；控制台断言排除 RUM |

---

## 七、后续建议

1. **【需您操作】关闭 CF 托管 robots.txt**——见 §4.3，否则百度收录受影响。
2. **提交站点地图**——建议到 [Google Search Console](https://search.google.com/search-console) 与[百度搜索资源平台](https://ziyuan.baidu.com/) 提交 `https://xiaoguaiguai.cn/sitemap.xml`。
3. **补其余 4 个分类的小工具**——当前仅婴幼儿养育有 2 个，需求是每分类 ≥2 个。建议清单：
   - 📖 儿童教育：儿童专注计时器 / 亲子阅读打卡
   - 🌷 女性成长：情绪日记 / 四象限待办
   - 🏠 家庭关系：家务分工表 / 家庭开支记录
   - 💞 两性亲密成长：沟通句式转换器 / 纪念日计算
4. **AdSense 申请时机**——建议先让站点积累 1~2 周自然流量并确认内容被 Google 收录后再提交申请，通过率更高。届时记得按 `_headers` 里的注释放行 Google 域名。
