#!/usr/bin/env node
/**
 * build.mjs · xiaoguaiguai.cn 静态构建
 * ------------------------------------------------------------
 * 站点定位：家庭与成长主题的**内容站**（原创文章 + 自研小工具），
 *           不承载外部资源导航。
 *
 * 输入（仓库根，均入库）：
 *   posts/*.md        文章（frontmatter + markdown，Sveltia CMS 按篇读写）
 *   tools/tools.json  工具索引
 *   tools/<slug>.html 各工具页面片段（外壳由本脚本注入）
 *   admin/            Sveltia CMS 后台
 *   favicon.svg / _headers
 *
 * 输出：_dist/（构建产物，不入库）
 *   index.html        首页（【生成】置顶精选 + 最新文章 + 分类入口 + 小工具）
 *   posts.json        【生成】文章索引，按日期倒序（供站内检索/降级）
 *   posts/index.html  【生成】文章列表页
 *   posts/<slug>/index.html 【生成】文章详情页
 *   category/<slug>/index.html 【生成】分类页 × 5
 *   tools.json        【生成】工具索引（从 tools/tools.json 派生）
 *   tools/index.html  【生成】工具列表页
 *   tools/<slug>/index.html 【生成】工具页（从 tools/<slug>.html 注入外壳）
 *
 * 设计取舍：
 *   - 零依赖：不引入 markdown 库，自带最小渲染器（够用即可，避免构建链脆弱）
 *   - 页面样式全部内联：本 zone 忽略 query string、无 purge 权限，外部 CSS 改版
 *     必须换路径才能生效（项目铁律 7）；内联则零子资源、零缓存问题。
 *   - 首页**构建时静态生成**（非运行时 fetch）：内容站依赖 SEO，静态 HTML
 *     可被爬虫直接抓取；同时彻底消除 fetch 失败导致的空白页路径。
 *   - 顶部站头 + 导航栏由 topbar() 统一注入，所有页面共用一套，改一次全站生效。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC_POSTS = path.join(ROOT, "posts");
const SRC_TOOLS = path.join(ROOT, "tools");
const OUT = path.join(ROOT, "_dist");

const SITE = {
  title: "小乖乖",
  subtitle: "家庭与成长",
  origin: "https://xiaoguaiguai.cn",
  desc: "面向妈妈与家庭的内容站，原创文章覆盖婴幼儿养育、儿童教育、女性成长、家庭关系与两性亲密成长五个方向，并提供本站自研的实用小工具。",
  disclaimer:
    "本站内容仅为经验分享与知识科普，不提供医疗诊断、诊疗建议。" +
    "涉及健康、育儿、心理问题时请以专业人士意见为准。所有内容仅供学习参考。",
};

/** 分类顺序（固定 5 个） */
const CATS = [
  { name: "🧸 婴幼儿养育", slug: "yuer", cover: "yuer-content", brief: "喂养、睡眠、发育、疫苗记录" },
  { name: "📖 儿童教育", slug: "jiaoyu", cover: "jiaoyu-content", brief: "亲子阅读、习惯养成、兴趣选择" },
  { name: "🌷 女性成长", slug: "nvxing", cover: "nvxing-content", brief: "情绪、时间、自我重启" },
  { name: "🏠 家庭关系", slug: "jiating", cover: "jiating-content", brief: "家务分工、预算、隔代沟通" },
  { name: "💞 两性亲密成长", slug: "qinmi", cover: "qinmi-content", brief: "沟通、边界、婚姻经营" },
];
const catOf = (name) =>
  CATS.find((c) => c.name === name) || CATS.find((c) => name && name.includes(c.name.replace(/^\S+\s*/, "")));

const log = (...a) => console.log(...a);
const ensure = (d) => fs.mkdirSync(d, { recursive: true });

/**
 * 清空构建产物目录。
 * 不用 fs.rmSync(dir) 整目录删除 —— 本机 Node 被 safe-delete shim 接管，
 * 整目录删除会走「移到回收站」，一旦目录被占用（例如本地 http.server 正在
 * 服务 _dist）就整体失败。改为逐项删除内容、保留目录本身，更稳。
 */
function rmrf(d) {
  if (!fs.existsSync(d)) return;
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    try {
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    } catch (e) {
      log(`  ⚠️ 无法清理 ${name}（${e.code || e.message}），跳过`);
    }
  }
}

/* ============================================================
 * 一、markdown 渲染（最小实现，先转义再套标记，防注入）
 * ========================================================== */

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function inline(s) {
  // 先取出行内代码，避免其中的 * _ [ ] 被后续规则误伤
  const codes = [];
  let t = String(s).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000C${codes.length - 1}\u0000`;
  });

  t = escapeHtml(t);

  // 链接（href 只放行 http(s) / 站内绝对路径 / 锚点）
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
    const ok = /^(https?:\/\/|\/|#)/.test(href);
    if (!ok) return txt;
    const ext = /^https?:\/\//.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${href}"${ext}>${txt}</a>`;
  });

  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  // 还原行内代码
  t = t.replace(/\u0000C(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
  return t;
}

const BLOCK_START = /^(#{1,6}\s|>|```|\s*[-*]\s|\s*\d+\.\s|---|\*\*\*\s*$)/;

/**
 * 渲染 markdown。
 * 标题层级：页面自身已有 h1，正文标题需整体降级。
 * 关键点是「按文档实际出现的最小标题层级对齐」——作者可能从 # 起写，
 * 也可能从 ## 起写（本站 20 篇与 CMS 提示统一用 ##）。若简单用 len+1，
 * 从 ## 起的文档会被推到 h3，既造成 h1→h3 语义跳级，又让 CSS 里
 * article.body h2 的章节装饰完全失效。故先扫出最小层级 minLen，
 * 令 minLen 映射为 h2：lv = len - minLen + 2。
 * @param {string} md
 * @param {number} [baseLv] 递归（引用块）时沿用外层基准，避免内层无标题时重算
 */
function renderMarkdown(md, baseLv) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let li = null; // 当前列表类型
  let buf = [];
  const flushList = () => {
    if (!li) return;
    out.push(`<${li}>${buf.map((x) => `<li>${x}</li>`).join("")}</${li}>`);
    li = null;
    buf = [];
  };

  // 基准层级：正文最小标题层级 → h2
  let minLen = 7;
  for (const l of lines) {
    const mm = /^(#{1,6})\s+/.exec(l);
    if (mm) minLen = Math.min(minLen, mm[1].length);
  }
  const lvBase = baseLv || (minLen === 7 ? 2 : minLen);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^\s*```/.test(line)) {
      flushList();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // 标题
    let m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flushList();
      const lv = Math.min(6, Math.max(2, m[1].length - lvBase + 2));
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushList();
      out.push("<hr />");
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      flushList();
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(q.join("\n"), lvBase)}</blockquote>`);
      continue;
    }

    // 列表
    m = /^\s*[-*]\s+(.*)$/.exec(line);
    if (m) {
      if (li !== "ul") { flushList(); li = "ul"; }
      buf.push(inline(m[1]));
      i++;
      continue;
    }
    m = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (m) {
      if (li !== "ol") { flushList(); li = "ol"; }
      buf.push(inline(m[1]));
      i++;
      continue;
    }

    // 空行
    if (/^\s*$/.test(line)) { flushList(); i++; continue; }

    // 段落
    flushList();
    const p = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !BLOCK_START.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${inline(p.join(" "))}</p>`);
  }
  flushList();
  return out.join("\n");
}

/* ============================================================
 * 二、frontmatter 解析（YAML 子集：标量 + 行内数组）
 * ========================================================== */

/**
 * YAML 子集解析。必须同时兼容两种写法：
 *   ① 手写行内数组  tags: [a, b]
 *   ② Sveltia CMS 保存的块序列 / 块标量
 *        tags:
 *          - a
 *          - b
 *        excerpt: >-
 *          多行折叠文本
 * 若只支持 ①，从后台保存过的文章标签会被静默丢掉。
 */
function parseFrontmatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };

  const data = {};
  const lines = m[1].split(/\r?\n/);
  const unq = (s) => s.trim().replace(/^["']|["']$/g, "");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s/.test(line)) continue; // 属于上一项的子行，已在其分支内消费
    const mm = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!mm) continue;
    const key = mm[1];
    const v = mm[2].trim();

    // 值为空或块指示符（> / |- / |）→ 消费后续缩进行
    if (v === "" || /^[>|][-+]?$/.test(v)) {
      const kids = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) kids.push(lines[++i]);
      if (kids.length && /^\s*-\s/.test(kids[0])) {
        // 块序列 → 数组
        data[key] = kids.map((k) => unq(k.replace(/^\s*-\s*/, ""))).filter(Boolean);
      } else if (kids.length) {
        // 块标量 → 字符串（| 保留换行，> 折成空格）
        const text = kids.map((k) => k.replace(/^\s+/, ""));
        data[key] = v.startsWith("|") ? text.join("\n") : text.join(" ");
      } else {
        data[key] = "";
      }
      continue;
    }

    if (v.startsWith("[") && v.endsWith("]")) {
      data[key] = v.slice(1, -1).split(",").map(unq).filter(Boolean);
    } else if (v === "true" || v === "false") {
      data[key] = v === "true";
    } else {
      data[key] = unq(v);
    }
  }
  return { data, body: m[2] };
}

/* ============================================================
 * 三、页面外壳（样式内联，风格与首页一致）
 * ========================================================== */

const BASE_CSS = `
  :root {
    --bg: #fdfbf7; --panel: #ffffff; --ink: #3d3833; --ink-soft: #7d756c;
    --line: #ece6dd; --accent: #d98b6a; --accent-soft: #fbf1ec;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
                 "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    line-height: 1.75; font-size: 15px;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
  .narrow { max-width: 760px; }

  a { color: var(--accent); }
  .crumb { margin: 26px 0 0; font-size: 13px; color: var(--ink-soft); }
  .crumb a { color: var(--ink-soft); text-decoration: none; }
  .crumb a:hover { color: var(--accent); }
  .crumb span { margin: 0 6px; color: #cbc2b6; }

  header.page { padding: 26px 0 22px; border-bottom: 1px solid var(--line); }
  header.page h1 { margin: 0 0 10px; font-size: 27px; font-weight: 600; line-height: 1.45; letter-spacing: .01em; }
  header.page .meta { color: var(--ink-soft); font-size: 13px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  header.page .meta .pill {
    background: var(--accent-soft); color: var(--accent);
    padding: 2px 10px; border-radius: 999px; font-size: 12.5px;
  }

  article.body { padding: 30px 0 10px; }
  article.body h2 { font-size: 20px; font-weight: 600; margin: 34px 0 12px; padding-left: 11px; border-left: 3px solid var(--accent); }
  article.body h3 { font-size: 17px; font-weight: 600; margin: 26px 0 10px; }
  article.body h4 { font-size: 15.5px; font-weight: 600; margin: 20px 0 8px; color: #554e46; }
  article.body p { margin: 0 0 16px; }
  article.body ul, article.body ol { margin: 0 0 16px; padding-left: 22px; }
  article.body li { margin-bottom: 7px; }
  article.body blockquote {
    margin: 0 0 18px; padding: 12px 16px; background: var(--accent-soft);
    border-left: 3px solid #e8c8b6; border-radius: 0 8px 8px 0; color: #6b6259;
  }
  article.body blockquote p:last-child { margin-bottom: 0; }
  article.body code {
    background: #f5f1ea; padding: 1px 6px; border-radius: 5px;
    font-size: 13.5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  article.body pre {
    background: #f7f4ee; border: 1px solid var(--line); border-radius: 10px;
    padding: 14px 16px; overflow-x: auto; margin: 0 0 18px;
  }
  article.body pre code { background: none; padding: 0; font-size: 13px; line-height: 1.7; }
  article.body hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
  article.body a { text-decoration: none; border-bottom: 1px solid #e8c8b6; }
  article.body a:hover { border-bottom-color: var(--accent); }

  .tags { display: flex; flex-wrap: wrap; gap: 7px; margin: 26px 0 0; }
  .tags span { font-size: 12px; color: #a09689; background: #faf7f2; padding: 2px 9px; border-radius: 5px; }

  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
  a.card {
    display: block; background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 16px 18px; text-decoration: none;
    color: inherit; transition: border-color .18s ease, box-shadow .18s ease;
  }
  a.card:hover { border-color: #e2d5c8; box-shadow: 0 6px 18px rgba(180,150,120,.09); }
  a.card .thumb {
    width: 100%; aspect-ratio: 16 / 9; object-fit: cover;
    border-radius: 9px; margin-bottom: 12px; display: block; background: var(--accent-soft);
  }
  a.card .row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  a.card .badge {
    flex: none; font-size: 11px; padding: 2px 8px; border-radius: 6px;
    background: var(--accent-soft); color: var(--accent); letter-spacing: .02em;
  }
  a.card .badge.tool { background: #eef4ef; color: #5d8a6c; }
  a.card .title { font-size: 15.5px; font-weight: 600; }
  a.card .desc { margin: 0; color: var(--ink-soft); font-size: 13.5px; line-height: 1.68; }
  a.card .date { margin-top: 9px; font-size: 12px; color: #b3aa9e; }

  section.block { margin: 38px 0 0; }
  section.block > h2 {
    font-size: 19px; font-weight: 600; margin: 0 0 4px;
    padding-bottom: 12px; border-bottom: 1px solid var(--line);
  }
  section.block > .lead { color: var(--ink-soft); font-size: 13px; margin: 8px 0 16px; }

  .disclaimer {
    margin-top: 4rem; padding: 1rem; font-size: .8rem; color: #777;
    text-align: center; line-height: 1.6;
  }
  .disclaimer .rule { max-width: 720px; margin: 0 auto 8px; height: 1px; background: var(--line); }
  footer.meta { text-align: center; color: #a8a096; font-size: 12px; padding: 0 0 40px; }
  footer.meta a { color: #a8a096; text-decoration: none; border-bottom: 1px dotted #d8d0c4; }
  .backlink { display: inline-block; margin: 30px 0 0; font-size: 13.5px; }

  /* ── 顶部站头 + 导航栏（全站统一，所有页面共用）── */
  header.site {
    background: rgba(253,251,247,.92); border-bottom: 1px solid var(--line);
    position: sticky; top: 0; z-index: 20; backdrop-filter: saturate(180%) blur(8px);
  }
  header.site .bar {
    max-width: 1080px; margin: 0 auto; padding: 13px 20px;
    display: flex; align-items: center; gap: 22px; flex-wrap: wrap;
  }
  header.site .brand { display: flex; align-items: baseline; gap: 9px; text-decoration: none; color: inherit; flex: none; }
  header.site .brand .nm { font-size: 19px; font-weight: 600; letter-spacing: .03em; }
  header.site .brand .sub { font-size: 12.5px; color: var(--ink-soft); letter-spacing: .02em; }
  header.site nav.top { display: flex; flex-wrap: wrap; gap: 4px; margin-left: auto; }
  header.site nav.top a {
    padding: 6px 12px; border-radius: 8px; font-size: 14px;
    color: #5c554d; text-decoration: none; white-space: nowrap;
    transition: background .15s ease, color .15s ease;
  }
  header.site nav.top a:hover { background: var(--accent-soft); color: var(--accent); }
  header.site nav.top a.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }

  /* ── 首页：置顶精选 ── */
  .hero-pick { display: block; margin: 30px 0 0; text-decoration: none; color: inherit; }
  .hero-pick .inner {
    display: grid; grid-template-columns: 1.15fr 1fr; gap: 0;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); overflow: hidden;
    transition: border-color .18s ease, box-shadow .18s ease;
  }
  .hero-pick:hover .inner { border-color: #e2d5c8; box-shadow: 0 10px 30px rgba(180,150,120,.13); }
  .hero-pick .cover { width: 100%; height: 100%; min-height: 250px; object-fit: cover; display: block; background: var(--accent-soft); }
  .hero-pick .txt { padding: 26px 30px; display: flex; flex-direction: column; justify-content: center; }
  .hero-pick .kicker {
    font-size: 11.5px; letter-spacing: .1em; color: var(--accent);
    text-transform: uppercase; margin-bottom: 10px;
  }
  .hero-pick h2 { margin: 0 0 12px; font-size: 24px; font-weight: 600; line-height: 1.42; }
  .hero-pick p { margin: 0; color: var(--ink-soft); font-size: 14px; line-height: 1.75; }
  .hero-pick .meta { margin-top: 16px; font-size: 12.5px; color: #b3aa9e; display: flex; gap: 10px; align-items: center; }

  /* ── 首页：分类入口卡 ── */
  .cat-cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(196px, 1fr)); }
  a.cat-card {
    display: block; padding: 16px 18px; text-decoration: none; color: inherit;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  }
  a.cat-card:hover { border-color: #e2d5c8; box-shadow: 0 6px 18px rgba(180,150,120,.1); transform: translateY(-2px); }
  a.cat-card .nm { font-size: 15.5px; font-weight: 600; margin-bottom: 5px; }
  a.cat-card .br { font-size: 12.5px; color: var(--ink-soft); line-height: 1.6; }
  a.cat-card .ct { margin-top: 11px; font-size: 12px; color: var(--accent); }

  /* ── 首页：区块标题（带「查看全部」）── */
  section.home { margin: 46px 0 0; }
  section.home > h2 {
    font-size: 19px; font-weight: 600; margin: 0 0 4px;
    padding-bottom: 12px; border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  }
  section.home > h2 .more {
    flex: none; font-size: 13px; font-weight: 400;
    color: var(--accent); text-decoration: none; white-space: nowrap;
  }
  section.home > h2 .more:hover { text-decoration: underline; }
  section.home > .lead { color: var(--ink-soft); font-size: 13px; margin: 8px 0 16px; }

  @media (max-width: 760px) {
    .hero-pick .inner { grid-template-columns: 1fr; }
    .hero-pick .cover { min-height: 180px; aspect-ratio: 16/9; }
    .hero-pick .txt { padding: 20px 22px; }
    .hero-pick h2 { font-size: 20px; }
  }

  @media (max-width: 560px) {
    header.page h1 { font-size: 22px; }
    .grid { grid-template-columns: 1fr; }
    .wrap { padding: 0 16px; }
    header.site .bar { padding: 11px 16px; gap: 12px; }
    header.site .brand .sub { display: none; }
    header.site nav.top { margin-left: 0; width: 100%; gap: 2px; }
    header.site nav.top a { padding: 5px 9px; font-size: 13px; }
  }

  /* ── 工具页通用控件（各工具共享，避免每个工具重复定义）── */
  .tool { padding: 26px 0 6px; }
  .tool .panel {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 20px 22px; margin-bottom: 18px;
  }
  .tool .panel > h2 {
    font-size: 16px; font-weight: 600; margin: 0 0 14px;
    padding-left: 10px; border-left: 3px solid var(--accent);
  }
  .tool .field { margin-bottom: 15px; }
  .tool .field:last-child { margin-bottom: 0; }
  .tool label.lbl {
    display: block; font-size: 13.5px; color: var(--ink-soft);
    margin-bottom: 7px; font-weight: 500;
  }
  .tool .hint { font-size: 12.5px; color: #a8a096; margin-top: 6px; line-height: 1.6; }
  .tool input[type="date"],
  .tool input[type="number"],
  .tool input[type="text"],
  .tool select {
    width: 100%; max-width: 320px; padding: 9px 12px; font-size: 15px;
    font-family: inherit; color: var(--ink); background: #fff;
    border: 1px solid #e2d9cd; border-radius: 9px; outline: none;
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  .tool input:focus, .tool select:focus {
    border-color: var(--accent); box-shadow: 0 0 0 3px rgba(217,139,106,.12);
  }
  .tool .btns { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
  .tool button {
    font-family: inherit; font-size: 14.5px; padding: 9px 20px; cursor: pointer;
    border-radius: 9px; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; transition: opacity .15s ease;
  }
  .tool button:hover { opacity: .88; }
  .tool button.ghost { background: #fff; color: var(--accent); }
  .tool .result { margin-top: 4px; }
  .tool .kv { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .tool .kv .cell {
    background: var(--accent-soft); border-radius: 10px; padding: 12px 14px;
  }
  .tool .kv .cell .k { font-size: 12.5px; color: var(--ink-soft); margin-bottom: 4px; }
  .tool .kv .cell .v { font-size: 21px; font-weight: 600; color: var(--accent); line-height: 1.3; }
  .tool .kv .cell .v small { font-size: 13px; font-weight: 400; color: var(--ink-soft); margin-left: 3px; }
  .tool table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .tool table th, .tool table td {
    text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .tool table th { font-weight: 600; color: #554e46; background: #faf7f2; font-size: 13px; }
  .tool table tr:last-child td { border-bottom: 0; }
  .tool .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .tool .tabs button {
    background: #fff; color: var(--ink-soft); border: 1px solid var(--line);
    padding: 7px 15px; font-size: 13.5px;
  }
  .tool .tabs button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
  .tool .empty { color: #a8a096; font-size: 13.5px; padding: 14px 0; }
  .tool .note {
    background: #faf7f2; border-radius: 10px; padding: 13px 16px;
    font-size: 13px; color: #6b6259; line-height: 1.7;
  }
  .tool ul.plain { margin: 0; padding-left: 20px; }
  .tool ul.plain li { margin-bottom: 6px; }
  .tool .chk { display: flex; align-items: flex-start; gap: 9px; padding: 9px 0; border-bottom: 1px solid #f4efe7; }
  .tool .chk:last-child { border-bottom: 0; }
  .tool .chk input { margin-top: 4px; flex: none; width: 16px; height: 16px; accent-color: var(--accent); }
  .tool .chk .nm { flex: 1; font-size: 14.5px; }
  .tool .chk .nm em { font-style: normal; display: block; font-size: 12.5px; color: #a8a096; margin-top: 2px; }
  .tool .chk .st { flex: none; font-size: 12px; color: #b3aa9e; }
  .tool .stat { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13.5px; color: var(--ink-soft); margin-bottom: 14px; }
  .tool .stat b { color: var(--accent); font-size: 16px; }
  @media (max-width: 560px) {
    .tool .kv .cell .v { font-size: 19px; }
    .tool table th, .tool table td { padding: 9px 8px; font-size: 13px; }
  }
`;

/**
 * 顶部站头 + 导航栏。全站统一注入，所有页面共用一套。
 * @param {string} [active] 当前页标识：home / posts / tools / <catSlug>
 */
function topbar(active) {
  const items = [
    { key: "home", text: "首页", href: "/" },
    ...CATS.map((c) => ({ key: c.slug, text: c.name.replace(/^\S+\s*/, ""), href: `/category/${c.slug}/` })),
    { key: "tools", text: "小工具", href: "/tools/" },
  ];
  return `<header class="site">
  <div class="bar">
    <a class="brand" href="/">
      <span class="nm">${escapeHtml(SITE.title)}</span>
      <span class="sub">${escapeHtml(SITE.subtitle)}</span>
    </a>
    <nav class="top" aria-label="主导航">
${items.map((i) => `      <a href="${i.href}"${i.key === active ? ' class="on" aria-current="page"' : ""}>${escapeHtml(i.text)}</a>`).join("\n")}
    </nav>
  </div>
</header>`;
}

function shell({ title, desc, body, canonical, active, noindex }) {
  const full = title === SITE.title ? `${SITE.title} · ${SITE.subtitle}` : `${title} ｜ ${SITE.title} · ${SITE.subtitle}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(full)}</title>
<meta name="description" content="${escapeHtml(desc || SITE.desc)}" />
${noindex ? `<meta name="robots" content="noindex" />` : ""}
${canonical ? `<link rel="canonical" href="${SITE.origin}${canonical}" />` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<style>${BASE_CSS}</style>
</head>
<body>
${topbar(active)}
<div class="wrap">
${body}
  <div class="disclaimer">
    <div class="rule"></div>
    <p>${escapeHtml(SITE.disclaimer)}</p>
  </div>
  <footer class="meta">
    <p>${escapeHtml(SITE.title)} · ${escapeHtml(SITE.subtitle)} ｜ <a href="/">首页</a> ｜ <a href="/posts/">全部内容</a> ｜ <a href="/tools/">小工具</a> ｜ <a href="/admin" target="_blank" rel="noopener noreferrer">后台</a></p>
  </footer>
</div>
</body>
</html>
`;
}

const crumb = (items) =>
  `<nav class="crumb">` +
  items.map((x, i) => (i === items.length - 1 ? `<strong>${escapeHtml(x.text)}</strong>` : `<a href="${x.href}">${escapeHtml(x.text)}</a><span>/</span>`)).join("") +
  `</nav>`;

const fmtDate = (d) => String(d || "").slice(0, 10);

/* ============================================================
 * 四、读取文章
 * ========================================================== */

function readPosts() {
  if (!fs.existsSync(SRC_POSTS)) return [];
  const posts = [];
  for (const f of fs.readdirSync(SRC_POSTS)) {
    if (!f.endsWith(".md")) continue;
    const slug = f.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(SRC_POSTS, f), "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.draft === true) continue;
    const cat = catOf(data.category);
    posts.push({
      slug,
      title: data.title || slug,
      date: fmtDate(data.date),
      category: cat ? cat.name : data.category || "",
      catSlug: cat ? cat.slug : "",
      excerpt: data.excerpt || "",
      cover: data.cover || (cat ? `${SITE.origin}/media/covers/${cat.cover}.webp` : ""),
      tags: Array.isArray(data.tags) ? data.tags : [],
      body,
    });
  }
  // 日期倒序，同日按 slug 稳定排序
  posts.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1));
  return posts;
}

/* ============================================================
 * 五、工具
 * ========================================================== */

function readTools() {
  const p = path.join(SRC_TOOLS, "tools.json");
  if (!fs.existsSync(p)) return [];
  const list = JSON.parse(fs.readFileSync(p, "utf8"));
  return (list.tools || []).filter((t) => t.published !== false);
}

/* ============================================================
 * 六、构建
 * ========================================================== */

function build() {
  log("→ 读取源文件");
  const posts = readPosts();
  const tools = readTools();
  log(`  文章 ${posts.length} 篇，工具 ${tools.length} 个`);

  rmrf(OUT);
  ensure(OUT);
  ensure(path.join(OUT, "posts"));
  ensure(path.join(OUT, "tools"));
  ensure(path.join(OUT, "category"));

  /* ---- 静态文件拷贝 ---- */
  // 注：不再拷贝 nav.json —— 站点已转为纯内容站，外部资源导航已下线。
  // _redirects 负责把已下线的 /nav.json 301 收口到首页。
  for (const f of ["favicon.svg", "_headers", "_redirects", "README.md"]) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
  }
  ensure(path.join(OUT, "admin"));
  for (const f of ["index.html", "config.yml"]) {
    const src = path.join(ROOT, "admin", f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, "admin", f));
  }

  /* ---- posts.json（供站内检索/降级使用，首页已改为构建时静态渲染）---- */
  const index = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    date: p.date,
    category: p.category,
    excerpt: p.excerpt,
    cover: p.cover,
    tags: p.tags,
    url: `/posts/${encodeURIComponent(p.slug)}/`,
  }));
  fs.writeFileSync(path.join(OUT, "posts.json"), JSON.stringify({ count: index.length, posts: index }, null, 2) + "\n", "utf8");
  log(`  posts.json（${index.length} 条）`);

  /* ---- 首页（构建时静态生成，利于 SEO，且无运行时 fetch 失败路径）---- */
  const pick = posts[0]; // 置顶精选 = 最新一篇
  const latest9 = posts.slice(pick ? 1 : 0, pick ? 10 : 9);
  const homeBody = `
<main>
${
  pick
    ? `<a class="hero-pick" href="/posts/${encodeURIComponent(pick.slug)}/">
  <div class="inner">
    ${pick.cover ? `<img class="cover" src="${escapeHtml(pick.cover)}" alt="${escapeHtml(pick.title)}" />` : ""}
    <div class="txt">
      <div class="kicker">置顶精选</div>
      <h2>${escapeHtml(pick.title)}</h2>
      <p>${escapeHtml(pick.excerpt)}</p>
      <div class="meta"><span>${escapeHtml(pick.category)}</span><span>·</span><span>${escapeHtml(pick.date)}</span></div>
    </div>
  </div>
</a>`
    : ""
}

<section class="home">
  <h2><span>最新文章</span><a class="more" href="/posts/">查看全部 ${posts.length} 篇 →</a></h2>
  <div class="lead">按发布时间倒序</div>
  ${
    latest9.length
      ? `<div class="grid">
${latest9
  .map(
    (p) => `    <a class="card" href="/posts/${encodeURIComponent(p.slug)}/">
      ${p.cover ? `<img class="thumb" src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : ""}
      <div class="row"><span class="badge">${escapeHtml(p.category.replace(/^\S+\s*/, ""))}</span><span class="title">${escapeHtml(p.title)}</span></div>
      <p class="desc">${escapeHtml(p.excerpt)}</p>
      <div class="date">${escapeHtml(p.date)}</div>
    </a>`
  )
  .join("\n")}
  </div>`
      : `<p class="lead">内容正在整理中，敬请期待。</p>`
  }
</section>

<section class="home">
  <h2><span>按分类浏览</span></h2>
  <div class="cat-cards">
${CATS.map((c) => {
  const n = posts.filter((p) => p.catSlug === c.slug).length;
  return `    <a class="cat-card" href="/category/${c.slug}/">
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="br">${escapeHtml(c.brief)}</div>
      <div class="ct">${n} 篇文章 →</div>
    </a>`;
}).join("\n")}
  </div>
</section>

<section class="home">
  <h2><span>本站小工具</span><a class="more" href="/tools/">全部 ${tools.length} 个 →</a></h2>
  <div class="lead">纯前端运行，数据不上传，全部在本站内使用</div>
  ${
    tools.length
      ? `<div class="grid">
${tools
  .map(
    (t) => `    <a class="card" href="/tools/${t.slug}/">
      <div class="row"><span class="badge tool">${escapeHtml(t.icon || "工具")}</span><span class="title">${escapeHtml(t.name)}</span></div>
      <p class="desc">${escapeHtml(t.desc)}</p>
    </a>`
  )
  .join("\n")}
  </div>`
      : `<p class="lead">工具正在开发中。</p>`
  }
</section>
</main>`;
  fs.writeFileSync(
    path.join(OUT, "index.html"),
    shell({ title: SITE.title, desc: SITE.desc, body: homeBody, canonical: "/", active: "home" }),
    "utf8"
  );
  log("  首页 /（静态生成）");

  /* ---- 文章详情页 ---- */
  for (const p of posts) {
    const dir = path.join(OUT, "posts", p.slug);
    ensure(dir);
    const related = posts.filter((x) => x.slug !== p.slug && x.catSlug === p.catSlug).slice(0, 3);
    const body = `
${crumb([{ text: "首页", href: "/" }, { text: "内容", href: "/posts/" }, { text: p.category || "内容" }])}
<header class="page">
  <h1>${escapeHtml(p.title)}</h1>
  <div class="meta">
    ${p.category ? `<span class="pill">${escapeHtml(p.category)}</span>` : ""}
    <span>${escapeHtml(p.date)}</span>
  </div>
</header>
<article class="body narrow">
${renderMarkdown(p.body)}
${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}
</article>
${
  related.length
    ? `<section class="block narrow">
  <h2>同类内容</h2>
  <div class="grid" style="margin-top:16px">
${related
  .map(
    (r) => `    <a class="card" href="/posts/${encodeURIComponent(r.slug)}/">
      <div class="row"><span class="badge">内容</span><span class="title">${escapeHtml(r.title)}</span></div>
      <p class="desc">${escapeHtml(r.excerpt)}</p>
    </a>`
  )
  .join("\n")}
  </div>
</section>`
    : ""
}
<a class="backlink" href="/posts/">← 返回全部内容</a>`;
    fs.writeFileSync(path.join(dir, "index.html"), shell({ title: p.title, desc: p.excerpt, body, canonical: `/posts/${encodeURIComponent(p.slug)}/`, active: p.catSlug }), "utf8");
  }
  log(`  文章页 ${posts.length} 个`);

  /* ---- 文章列表页 ---- */
  const byCat = CATS.map((c) => ({ cat: c, items: posts.filter((p) => p.catSlug === c.slug) }));
  const listBody = `
${crumb([{ text: "首页", href: "/" }, { text: "内容" }])}
<header class="page">
  <h1>全部内容</h1>
  <div class="meta"><span>共 ${posts.length} 篇</span><span>按发布时间倒序</span></div>
</header>
${byCat
  .filter((g) => g.items.length)
  .map(
    (g) => `<section class="block">
  <h2>${escapeHtml(g.cat.name)}</h2>
  <div class="lead">${g.items.length} 篇</div>
  <div class="grid">
${g.items
  .map(
    (p) => `    <a class="card" href="/posts/${encodeURIComponent(p.slug)}/">
      ${p.cover ? `<img class="thumb" src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : ""}
      <div class="row"><span class="badge">内容</span><span class="title">${escapeHtml(p.title)}</span></div>
      <p class="desc">${escapeHtml(p.excerpt)}</p>
      <div class="date">${escapeHtml(p.date)}</div>
    </a>`
  )
  .join("\n")}
  </div>
</section>`
  )
  .join("\n")}`;
  fs.writeFileSync(path.join(OUT, "posts", "index.html"), shell({ title: "全部内容", desc: "小乖乖收录的家庭与成长相关内容，按分类浏览。", body: listBody, canonical: "/posts/", active: "posts" }), "utf8");
  log("  文章列表页 /posts/");

  /* ---- 分类页 /category/<slug>/（顶部导航的 5 个分类入口）---- */
  for (const c of CATS) {
    const items = posts.filter((p) => p.catSlug === c.slug);
    const dir = path.join(OUT, "category", c.slug);
    ensure(dir);
    const catBody = `
${crumb([{ text: "首页", href: "/" }, { text: "分类" }, { text: c.name }])}
<header class="page">
  <h1>${escapeHtml(c.name)}</h1>
  <div class="meta"><span>共 ${items.length} 篇</span><span>${escapeHtml(c.brief)}</span></div>
</header>
${
  items.length
    ? `<div class="grid" style="margin-top:24px">
${items
  .map(
    (p) => `    <a class="card" href="/posts/${encodeURIComponent(p.slug)}/">
      ${p.cover ? `<img class="thumb" src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : ""}
      <div class="row"><span class="badge">${escapeHtml(c.name.replace(/^\S+\s*/, ""))}</span><span class="title">${escapeHtml(p.title)}</span></div>
      <p class="desc">${escapeHtml(p.excerpt)}</p>
      <div class="date">${escapeHtml(p.date)}</div>
    </a>`
  )
  .join("\n")}
  </div>`
    : `<p class="lead" style="margin-top:24px">该分类内容正在整理中。</p>`
}
<p class="backlink"><a href="/posts/">← 查看全部内容</a></p>`;
    fs.writeFileSync(
      path.join(dir, "index.html"),
      shell({ title: c.name, desc: `${c.name}：${c.brief}。小乖乖原创内容。`, body: catBody, canonical: `/category/${c.slug}/`, active: c.slug }),
      "utf8"
    );
  }
  log(`  分类页 ${CATS.length} 个`);

  /* ---- tools.json + 工具页 + 工具列表页 ---- */
  const toolsIndex = tools.map((t) => ({
    slug: t.slug,
    name: t.name,
    desc: t.desc,
    category: t.category,
    icon: t.icon || "",
    url: `/tools/${t.slug}/`,
  }));
  fs.writeFileSync(path.join(OUT, "tools.json"), JSON.stringify({ count: toolsIndex.length, tools: toolsIndex }, null, 2) + "\n", "utf8");
  log(`  tools.json（${toolsIndex.length} 个）`);

  for (const t of tools) {
    const srcFile = path.join(SRC_TOOLS, `${t.slug}.html`);
    if (!fs.existsSync(srcFile)) {
      log(`  ⚠️ 缺文件 tools/${t.slug}.html，跳过`);
      continue;
    }
    const dir = path.join(OUT, "tools", t.slug);
    ensure(dir);
    // 工具源文件只写「片段」（.tool 区块 + 内联 script），由这里统一注入站内外壳，
    // 保证导航、面包屑、免责声明、样式变量与全站一致；改一次外壳全站生效。
    const frag = fs.readFileSync(srcFile, "utf8");
    const body = `
${crumb([{ text: "首页", href: "/" }, { text: "小工具", href: "/tools/" }, { text: t.name }])}
<header class="page">
  <h1>${escapeHtml(t.name)}</h1>
  <div class="meta">
    ${t.category ? `<span class="pill">${escapeHtml(t.category)}</span>` : ""}
    <span>纯前端运行 · 数据不上传</span>
  </div>
</header>
${frag}
<p class="backlink"><a href="/tools/">← 返回全部小工具</a></p>`;
    fs.writeFileSync(
      path.join(dir, "index.html"),
      shell({ title: t.name, desc: t.desc, body, canonical: `/tools/${t.slug}/`, active: "tools" }),
      "utf8"
    );
  }
  log(`  工具页 ${toolsIndex.length} 个`);

  const byToolCat = CATS.map((c) => ({ cat: c, items: tools.filter((t) => t.category === c.name) }));
  const toolBody = `
${crumb([{ text: "首页", href: "/" }, { text: "小工具" }])}
<header class="page">
  <h1>自研小工具</h1>
  <div class="meta"><span>共 ${tools.length} 个</span><span>全部在本站内运行，不上传数据、不跳转外部网站</span></div>
</header>
${byToolCat
  .filter((g) => g.items.length)
  .map(
    (g) => `<section class="block">
  <h2>${escapeHtml(g.cat.name)}</h2>
  <div class="grid">
${g.items
  .map(
    (t) => `    <a class="card" href="/tools/${t.slug}/">
      <div class="row"><span class="badge tool">工具</span><span class="title">${escapeHtml(t.name)}</span></div>
      <p class="desc">${escapeHtml(t.desc)}</p>
    </a>`
  )
  .join("\n")}
  </div>
</section>`
  )
  .join("\n")}`;
  fs.writeFileSync(path.join(OUT, "tools", "index.html"), shell({ title: "自研小工具", desc: "小乖乖自研的家庭实用小工具，纯前端运行，不上传任何数据。", body: toolBody, canonical: "/tools/", active: "tools" }), "utf8");
  log("  工具列表页 /tools/");

  // 404 页：CF Pages 只要产物根存在 404.html 就会对未知路径返回真 404。
  // 缺它时未知路径会回落成「200 + 首页」，形成软 404 —— 对内容站 SEO 有害。
  const notFoundBody = `
<header class="page">
  <h1>页面走丢了</h1>
  <div class="meta"><span>404 Not Found</span></div>
</header>
<section class="block">
  <p class="lead">这个地址在站内不存在，可能是链接过期或输入有误。</p>
  <div class="grid">
    <a class="card" href="/"><div class="row"><span class="title">回到首页</span></div><p class="desc">置顶精选与最新文章都在这里</p></a>
    <a class="card" href="/posts/"><div class="row"><span class="title">全部文章</span></div><p class="desc">按分类浏览 ${posts.length} 篇原创内容</p></a>
    <a class="card" href="/tools/"><div class="row"><span class="title">自研小工具</span></div><p class="desc">共 ${tools.length} 个，纯前端运行</p></a>
  </div>
</section>
<p class="backlink"><a href="/">← 返回首页</a></p>`;
  fs.writeFileSync(
    path.join(OUT, "404.html"),
    shell({ title: "页面走丢了", desc: "页面不存在。", body: notFoundBody, noindex: true }),
    "utf8"
  );
  log("  404 页 /404.html");

  log(`\n✅ 构建完成 → ${OUT}`);
  log(`   文章 ${posts.length} 篇 ｜ 分类 ${CATS.length} 个 ｜ 工具 ${tools.length} 个`);
}

build();
