# xiaoguaiguai.cn · CMS 内容系统 + 自研小工具系统 交付报告

> 交付日期：**2026-10-24**（第三轮）
> 站点：https://xiaoguaiguai.cn ｜ 后台：https://xiaoguaiguai.cn/admin
> 本地源码：`D:\workbuddy\netspace\xiaoguaiguai-nav\`

---

## 一、需求与决策

### 用户原始需求

> 我需要添加CMS内容功能，并在各模块每个模块生成相关联内容不少于4篇，cms内容需要在管理后台有编辑、管理与发布的能力，首页需要展示不超过10篇最新的内容索引，cms功能可以在主目录下的/posts目录来实现内容的输出与发布
>
> 我需要增加调整网站小工具能力，本站自身提供，不要外链到其他网站，每个模块不少于2个小工具，具体如何开发你可以给我建议。小工具功能可以在主目录下的/tools目录来实现功能的实现与发布

### 拆解后的硬指标

| # | 指标 | 达成 |
|---|---|---|
| 1 | 每分类内容 ≥4 篇 | ✅ 每类 4 篇，共 20 篇 |
| 2 | 后台可编辑 / 管理 / 发布 | ✅ Sveltia `posts` folder 集合 |
| 3 | 首页展示 ≤10 篇最新内容 | ✅ 取最新 10 篇（日期倒序） |
| 4 | 内容走 `/posts` 目录 | ✅ 源 `posts/*.md` → 产物 `posts/` |
| 5 | 工具本站自研、**不跳外站** | ✅ 纯前端，零外链 |
| 6 | 每分类工具 ≥2 个 | ⚠️ 样板 2 个（婴幼儿养育），其余 4 类待补 |
| 7 | 工具走 `/tools` 目录 | ✅ 源 `tools/` → 产物 `tools/` |

### 三项关键决策（用户确认）

1. **CMS 存储** → 每篇一个 md 文件（而非单一大 JSON）→ 便于 Git diff、并发编辑、按篇删除
2. **发布方式** → 配 GitHub Actions 自动部署（而非每次手动 wrangler）
3. **工具范围** → 先做 2 个样板（验证架构，再批量复制）

---

## 二、交付内容

### 2.1 三套内容体系并存

| 体系 | 数据源 | 产物 | 编辑入口 |
|---|---|---|---|
| 资源导航 | `nav.json` | 首页区块 | Sveltia `nav` 集合 |
| 原创内容 | `posts/*.md` | `posts.json` + `posts/index.html` + `posts/<slug>/index.html` | Sveltia `posts` folder 集合 |
| 自研工具 | `tools/tools.json` + `tools/<slug>.html` | `tools.json` + `tools/index.html` + `tools/<slug>/index.html` | 手写（工具需代码，不适合 CMS） |

首页保持「**运行时 fetch**」模式：
`Promise.all([fetchJson("nav.json"), fetchJson("posts.json").catch(…), fetchJson("tools.json").catch(…)])`
—— `nav.json` 失败整页报错，`posts` / `tools` 失败降级为「暂无」，不阻塞主功能。

### 2.2 原创内容 20 篇（5 分类 × 4）

| 分类 | 文章（发布日期） |
|---|---|
| 🧸 婴幼儿养育 | 生长曲线怎么看(10-20)、辅食添加节奏(10-18)、疫苗接种记录管理(10-15)、生长记录习惯(10-12) |
| 📖 儿童教育 | 免费资源怎么挑(10-19)、亲子阅读(10-16)、写作业慢(10-14)、兴趣班选择(10-10) |
| 🌷 女性成长 | 情绪急救(10-17)、碎片时间(10-13)、不用等准备好再重启(10-11)、为自己要时间(10-08) |
| 🏠 家庭关系 | 家务标准(10-21)、隔代育儿分歧(10-18)、家庭预算(10-15)、家庭会议(10-09) |
| 💞 两性亲密成长 | 冲突降级(10-20)、需求不是抱怨(10-17)、冷战的成本(10-22)、日常亲密感(10-13) |

**内容红线遵守情况**：
- 每篇含免责表述（不提供医疗诊断、诊疗建议）
- 无焦虑营销词（必须 / 千万别 / 再不做就晚了 / 致命）
- 两性板块只谈沟通、边界、婚姻经营 —— 无擦边、低俗、PUA、猎奇

**文章写法**（frontmatter）：
```yaml
---
title: 生长曲线怎么看：盯趋势，别盯单个数
date: 2026-10-20
category: 🧸 婴幼儿养育
excerpt: 同一个数字，放在不同月龄、不同孩子身上意义完全不同。看曲线比看单点更有参考价值。
tags: [生长曲线, 发育参考, 记录方法]
---
```

### 2.3 自研小工具（2 个样板）

| 工具 | 功能 | 持久化 |
|---|---|---|
| **宝宝月龄计算器** | 精确月龄按**日历月**推算（非除以 30）；7 个发育观察节点表（2/4/6/9/12/18/24 月）随月龄联动「已到达 / 还有 N 个月」 | `localStorage` key `xgg_birth` 回填 |
| **辅食添加顺序参考表** | 4 阶段 tabs（6/7/9/12 月），每阶段 8~9 项可勾选记录；含「添加原则」7 条与「需要就医的情况」免责 | `localStorage` key `xgg_food`，格式 `${stage}\|${name}` 分阶段独立存储 |

**架构要点**：工具页源文件是**片段**（只写 `.tool` 区块与内联 `<script>`），
面包屑 / header / 免责 / 页脚 / 样式由 `build.mjs` 的 `shell()` 统一注入 —— 改一次全站生效。

### 2.4 构建系统 `build.mjs`

**零依赖** Node ESM（`import fs from "node:fs"`），不引入任何 npm 包。
自写：frontmatter 解析（YAML 子集）+ 最小 markdown 渲染器 + 详情页生成 + `_dist/` 组装。

产物清单：
```
_dist/
  index.html           首页
  nav.json  posts.json  tools.json
  posts/index.html     内容列表（按分类分组）
  posts/<slug>/index.html   × 20（含「同类内容」3 篇）
  tools/index.html     工具列表
  tools/<slug>/index.html   × 2
  admin/index.html  admin/config.yml
  favicon.svg  _headers  README.md
```

### 2.5 CMS 文章管理

`admin/config.yml` 的 `posts` folder collection：

```yaml
folder: posts
extension: md
format: frontmatter
create: true
delete: true
slug: "{{slug}}"
summary: "{{title}}（{{date}}）"
sortable_fields: [date, title]
view_filters:   # 6 条：5 分类 + 草稿
```

fields：`title` / `date`（datetime，`date_format: YYYY-MM-DD` + `time_format: false`）/
`category`（select，5 固定选项）/ `excerpt` / `cover`（required: false）/ `tags`(list) /
`draft`(bool) / `body`(markdown)。

### 2.6 GitHub Actions 自动部署

`.github/workflows/deploy.yml`，6 步：
Checkout → Setup Node 22 → `node build.mjs` → **Verify build output**（校验 7 个产物 + 逐个 slug 页）
→ **Check deploy credentials**（缺 Secrets 时 `::error` 明确指引并 `exit 1`）
→ Deploy（`cloudflare/wrangler-action@v3` + `wranglerVersion: '4'`）。

---

## 三、本轮修复的真 bug（3 个）

### 3.1 标题层级错误

`renderMarkdown` 原用 `lv = m[1].length + 1`，导致 20 篇以 `##` 起写的文章顶层章节被渲染成 `h3`，
CSS 中 `article.body h2` 的左边框装饰**全部失效**，且造成 h1→h3 语义跳级。

**修复**：按文档实际最小标题层级对齐：
```js
let minLen = 7;
for (const l of lines) { const mm = /^(#{1,6})\s+/.exec(l); if (mm) minLen = Math.min(minLen, mm[1].length); }
const lvBase = baseLv || (minLen === 7 ? 2 : minLen);
const lv = Math.min(6, Math.max(2, m[1].length - lvBase + 2));
```
递归引用块传 `baseLv` 沿用外层基准。
**验证**：20 篇全量体检「唯一 h1 + 正文含 h2」全绿。

### 3.2 frontmatter 解析器不支持 CMS 块序列（最隐蔽）

原只支持行内数组 `tags: [a, b]`，而 Sveltia CMS 保存时会写成块序列 `tags:\n  - a`
→ **从后台保存过的文章标签会静默丢失**（无报错、无警告）。

**修复**：新增块序列 / 块标量分支（`>` 折叠成空格、`|` 保留换行），
循环头 `if (/^\s/.test(line)) continue;` 跳过已消费的子行。
**验证**：5 项单测（行内数组 / 块序列 / 引号+布尔 / 无 tags / 块标量）+ 20 篇真实文章 0 字段缺失。

### 3.3 CSP 在 `/posts/*`、`/tools/*` 完全未生效

`curl -sI` 显示只有 `/*` 和 `/` 规则起作用，另两块像没写。

**根因**：**同一路径模式在 `_headers` 中出现两次**（一次给 CSP、一次给 `Cache-Control`）
→ CF Pages **整块静默丢弃**（不报错、不警告）。

**修复**：每条路径模式**只保留一块**，所有头部写在同一块内；
并删掉冗余的 `/posts/`、`/tools/` 精确路径（`/posts/*` 已能匹配）。
**判据**：`curl -sI <url> | grep -ci 'content-security-policy'` 应为 **1**。
⚠️ **必须直连 `<deploy>.pages.dev` 验证**，自定义域有边缘缓存干扰。

---

## 四、判据修正（2 个假阳性）

1. **`ERR_CONNECTION_RESET`**：`python -m http.server` 默认单线程 HTTPServer，
   验收脚本快速连续导航 20 页时连接被重置。
   → 写 `_trash_serve.py` 用 `ThreadingTCPServer`（`allow_reuse_address` + `daemon_threads`）。
2. **RUM 拦截判据**：被 CSP 拦截的请求在 Chromium 里**不触发** `requestfailed`，
   → 改为以控制台 `Content Security Policy` violation 消息为判据。
   另：首页「零外链」误判 —— 首页是资源导航站，指向第三方是核心职能，
   → 改为只测 `/tools/` 三路径零外链 + 首页外链完好（带 `noopener`）。

---

## 五、验收结果

### 5.1 端到端验收（`_trash_e2e.cjs`，35 项）

覆盖：首页最新内容（数量 / 倒序 / 站内链接 / 缩略图 DOM）、工具区块、5 分类回归、
胶囊导航 7 项、footer 统计、`/posts/` 列表 20 卡片 5 分组、文章 markdown 渲染、
同类推荐 3 篇、**20 篇标题层级全量体检**、首页外链完好、`/tools/` 列表、工具页外壳、
月龄计算器交互 + 节点联动 + `localStorage` 回填、辅食表清单 / 勾选计数 / 切阶段 /
分阶段记忆 / 刷新持久化 / 清空、工具零外链、工具列表全站内、文章外链安全属性、
**工具页零子资源 + RUM 已拦（以控制台 CSP violation 为判据）**、
**CSP 未误伤内联脚本**、CMS 双集合、控制台无错误（排除 RUM 拦截提示）。

**结果**：本地 **35/35 全绿**，线上 **35/35 全绿**。

### 5.2 线上关键路径

| 检查项 | 结果 |
|---|---|
| 10 条关键路径 HTTP 状态 | 全 **200** |
| 5 张分类配图 | curl 验证全 **200** + `content-type: image/webp` |
| CSP 生效条数 | 每条路径均为 **1** |
| RUM 信标 | **已被 CSP 拦截** |
| 内联脚本 | **未被误伤**（工具交互全部正常） |

### 5.3 部署记录

- GitHub 推送 **30 个文件**（25 新建 / 5 更新）
- CF Pages 最新 deployment：`https://20812719.xiaoguaiguai-nav.pages.dev`
- 站点：https://xiaoguaiguai.cn

---

## 六、遗留事项

### 6.1 ⚠️ 需人工配置 2 个 GitHub Actions Secrets

这是**唯一阻塞 CI 全自动部署**的环节。仓库 Settings → Secrets and variables → Actions：

| Secret | 值 | 权限 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 新建 CF Token | Account → Cloudflare Pages → **Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | `99032f2638cd2ead55b4f0f42e462902` | — |

⚠️ 现有 `.cf_token`（`cfut_` 前缀）**无 Pages 权限（实测 403）**，不能直接用于 CI。
配好后 push 到 `main` 即自动构建部署。

### 6.2 补齐其余 4 个分类的小工具

当前仅 🧸 婴幼儿养育有 2 个。建议清单（每类 2 个）：

| 分类 | 工具 1 | 工具 2 |
|---|---|---|
| 📖 儿童教育 | 儿童专注计时器 | 亲子阅读打卡 |
| 🌷 女性成长 | 情绪日记 | 四象限待办 |
| 🏠 家庭关系 | 家务分工表 | 家庭开支记录 |
| 💞 两性亲密成长 | 沟通句式转换器 | 纪念日计算 |

复制 `tools/baby-age-calculator.html` 的片段结构即可，`build.mjs` 会自动生成外壳与列表项。

### 6.3 不影响线上的遗留

`_deliverables/` 旧报告与 OAuth 二次修复尚未同步到 GitHub 仓库
（本机 PAT 文件已 401 失效，见 MEMORY.md 铁律 9）。
