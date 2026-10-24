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
const SRC_PAGES = path.join(ROOT, "pages");
const OUT = path.join(ROOT, "_dist");

const SITE = {
  title: "小乖乖",
  subtitle: "家庭与成长",
  origin: "https://xiaoguaiguai.cn",
  email: "contact@xiaoguaiguai.cn",
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
    --bg: #fbfaf8; --panel: #ffffff; --ink: #2f2b27; --ink-2: #4a443d;
    --ink-soft: #7c746b; --ink-mute: #a39a8f;
    --line: #e9e4dc; --line-soft: #f2eee8;
    --accent: #c96f4a; --accent-deep: #a95636; --accent-soft: #fdf3ee;
    --radius: 10px; --radius-lg: 14px;
    --shadow: 0 1px 2px rgba(90,70,50,.04), 0 4px 14px rgba(90,70,50,.05);
    --shadow-hover: 0 2px 4px rgba(90,70,50,.05), 0 10px 26px rgba(90,70,50,.09);
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
                 "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
    line-height: 1.75; font-size: 15px;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 22px; }
  .narrow { max-width: 720px; }

  a { color: var(--accent); }
  .crumb { margin: 22px 0 0; font-size: 12.5px; color: var(--ink-mute); }
  .crumb a { color: var(--ink-mute); text-decoration: none; }
  .crumb a:hover { color: var(--accent); }
  .crumb span { margin: 0 6px; color: #cfc7bb; }
  .crumb strong { font-weight: 500; color: var(--ink-soft); }

  /* ── 页面标题区：门户式「主标题 + 副标题 + 右对齐统计」── */
  header.page {
    padding: 30px 0 20px; border-bottom: 2px solid var(--line);
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 20px; flex-wrap: wrap;
  }
  header.page .hd-main { min-width: 0; }
  header.page h1 {
    margin: 0; font-size: 30px; font-weight: 700; line-height: 1.32;
    letter-spacing: -.01em; color: var(--ink);
  }
  header.page .sub {
    margin: 9px 0 0; font-size: 14px; color: var(--ink-soft); line-height: 1.7;
    max-width: 640px;
  }
  header.page .meta {
    color: var(--ink-mute); font-size: 12.5px; display: flex; flex-wrap: wrap;
    gap: 12px; align-items: center; flex: none;
  }
  header.page .meta .pill {
    background: var(--accent-soft); color: var(--accent);
    padding: 3px 11px; border-radius: 6px; font-size: 12.5px; font-weight: 500;
  }
  header.page .meta .stat b { color: var(--accent); font-size: 15px; font-weight: 600; }

  article.body { padding: 30px 0 10px; }
  article.body h2 {
    font-size: 19.5px; font-weight: 700; margin: 36px 0 13px;
    padding-left: 12px; border-left: 3px solid var(--accent); color: var(--ink);
  }
  article.body h3 { font-size: 16.5px; font-weight: 600; margin: 27px 0 10px; color: var(--ink-2); }
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

  /* ══════════════════════════════════════════════════════════
   * 索引列表（纯文字）—— 首页最新内容 / 全部内容 / 分类页共用
   * 参照母婴门户与品牌站的索引结构：左侧分类色条 + 标题 + 摘要
   * + 底部元信息，行间细线分隔，扫读优先，不使用配图。
   * ══════════════════════════════════════════════════════════ */
  ul.index { list-style: none; margin: 0; padding: 0; }
  ul.index > li { border-bottom: 1px solid var(--line-soft); }
  ul.index > li:last-child { border-bottom: 0; }
  a.item {
    display: block; padding: 17px 4px 17px 16px; text-decoration: none;
    color: inherit; position: relative; border-radius: 0 var(--radius) var(--radius) 0;
    transition: background .16s ease, padding-left .16s ease;
  }
  a.item::before {
    content: ""; position: absolute; left: 0; top: 20px; bottom: 20px; width: 3px;
    background: var(--accent); border-radius: 2px; opacity: 0;
    transition: opacity .16s ease;
  }
  a.item:hover { background: var(--panel); padding-left: 22px; }
  a.item:hover::before { opacity: 1; }
  a.item .ttl {
    font-size: 16.5px; font-weight: 600; line-height: 1.5; color: var(--ink);
    margin: 0 0 6px; transition: color .16s ease;
  }
  a.item:hover .ttl { color: var(--accent-deep); }
  a.item .sm {
    margin: 0; font-size: 13.5px; color: var(--ink-soft); line-height: 1.72;
  }
  a.item .mt {
    margin-top: 9px; display: flex; flex-wrap: wrap; align-items: center;
    gap: 9px; font-size: 12px; color: var(--ink-mute);
  }
  a.item .mt .tag {
    background: var(--accent-soft); color: var(--accent); font-weight: 500;
    padding: 2px 9px; border-radius: 5px; font-size: 11.5px; letter-spacing: .02em;
  }
  a.item .mt .dot { color: #ddd5c9; }

  /* 双栏索引（分类页用，宽屏下两列，窄屏回落单列）*/
  ul.index.two { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); column-gap: 34px; }
  ul.index.two > li { break-inside: avoid; }

  /* 索引为空时的占位 */
  .empty-note {
    padding: 34px 20px; text-align: center; color: var(--ink-mute); font-size: 14px;
    background: var(--panel); border: 1px dashed var(--line); border-radius: var(--radius-lg);
  }

  /* ══════════════════════════════════════════════════════════
   * 卡片网格（仅用于「小工具」，以及文章页的同类内容推荐）
   * ══════════════════════════════════════════════════════════ */
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(268px, 1fr)); }
  a.card {
    display: block; background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius-lg); padding: 16px 18px; text-decoration: none;
    color: inherit; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  }
  a.card:hover { border-color: #e0d4c6; box-shadow: var(--shadow-hover); transform: translateY(-2px); }
  a.card .thumb {
    width: 100%; aspect-ratio: 16 / 9; object-fit: cover;
    border-radius: 9px; margin-bottom: 12px; display: block; background: var(--accent-soft);
  }
  a.card .row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  a.card .badge {
    flex: none; font-size: 11px; padding: 2px 8px; border-radius: 6px;
    background: var(--accent-soft); color: var(--accent); letter-spacing: .02em;
  }
  a.card .badge.tool { background: #eef4ef; color: #5d8a6c; }
  a.card .title { font-size: 15.5px; font-weight: 600; line-height: 1.5; }
  a.card .desc { margin: 0; color: var(--ink-soft); font-size: 13.5px; line-height: 1.68; }
  a.card .date { margin-top: 9px; font-size: 12px; color: #b3aa9e; }

  /* ══════════════════════════════════════════════════════════
   * 区块标题：门户式「左侧竖条 + 主标题 + 右侧查看全部」
   * ══════════════════════════════════════════════════════════ */
  section.block { margin: 38px 0 0; }
  section.block > h2, section.home > h2 {
    font-size: 18px; font-weight: 700; margin: 0 0 6px; color: var(--ink);
    padding: 0 0 0 12px; border-left: 3px solid var(--accent);
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; line-height: 1.5;
  }
  section.block > h2 .more, section.home > h2 .more {
    flex: none; font-size: 12.5px; font-weight: 400;
    color: var(--accent); text-decoration: none; white-space: nowrap;
  }
  section.block > h2 .more:hover, section.home > h2 .more:hover { text-decoration: underline; }
  section.block > .lead, section.home > .lead {
    color: var(--ink-mute); font-size: 12.5px; margin: 0 0 4px; padding-left: 12px;
  }
  section.block > .lead + ul.index, section.home > .lead + ul.index { margin-top: 6px; }
  section.block > ul.index, section.home > ul.index { margin-top: 6px; }

  .disclaimer {
    margin-top: 4rem; padding: 1rem; font-size: .8rem; color: #777;
    text-align: center; line-height: 1.6;
  }
  .disclaimer .rule { max-width: 720px; margin: 0 auto 8px; height: 1px; background: var(--line); }
  footer.meta { text-align: center; color: #a8a096; font-size: 12px; padding: 0 0 40px; }
  footer.meta a { color: #a8a096; text-decoration: none; border-bottom: 1px dotted #d8d0c4; }
  footer.meta .fnav { display: flex; flex-wrap: wrap; gap: 6px 16px; justify-content: center; margin: 0 0 12px; }
  .backlink { display: inline-block; margin: 30px 0 0; font-size: 13.5px; }

  /* ── 顶部站头 + 导航栏（全站统一，所有页面共用）── */
  header.site {
    background: rgba(251,250,248,.94); border-bottom: 1px solid var(--line);
    position: sticky; top: 0; z-index: 20; backdrop-filter: saturate(180%) blur(10px);
  }
  header.site .bar {
    max-width: 1120px; margin: 0 auto; padding: 12px 22px;
    display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
  }
  header.site .brand { display: flex; align-items: baseline; gap: 9px; text-decoration: none; color: inherit; flex: none; }
  header.site .brand .nm { font-size: 20px; font-weight: 700; letter-spacing: .02em; }
  header.site .brand .sub {
    font-size: 12px; color: var(--ink-mute); letter-spacing: .06em;
    padding-left: 9px; border-left: 1px solid var(--line);
  }
  header.site nav.top { display: flex; flex-wrap: wrap; gap: 2px; margin-left: auto; }
  header.site nav.top a {
    padding: 6px 11px; border-radius: 7px; font-size: 13.5px;
    color: var(--ink-2); text-decoration: none; white-space: nowrap;
    transition: background .15s ease, color .15s ease;
  }
  header.site nav.top a:hover { background: var(--accent-soft); color: var(--accent); }
  header.site nav.top a.on { background: var(--accent); color: #fff; font-weight: 500; }

  /* ── 首页焦点区（全站唯一使用大图的位置）── */
  .hero-pick { display: block; margin: 26px 0 0; text-decoration: none; color: inherit; }
  .hero-pick .inner {
    display: grid; grid-template-columns: 1.08fr 1fr; gap: 0;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow);
    transition: box-shadow .2s ease;
  }
  .hero-pick:hover .inner { box-shadow: var(--shadow-hover); }
  .hero-pick .cover { width: 100%; height: 100%; min-height: 268px; object-fit: cover; display: block; background: var(--accent-soft); }
  .hero-pick .txt { padding: 30px 34px; display: flex; flex-direction: column; justify-content: center; }
  .hero-pick .kicker {
    font-size: 11px; letter-spacing: .14em; color: var(--accent);
    text-transform: uppercase; margin-bottom: 12px; font-weight: 600;
  }
  .hero-pick h2 { margin: 0 0 13px; font-size: 25px; font-weight: 700; line-height: 1.4; letter-spacing: -.01em; }
  .hero-pick p { margin: 0; color: var(--ink-soft); font-size: 14px; line-height: 1.78; }
  .hero-pick .meta { margin-top: 18px; font-size: 12.5px; color: var(--ink-mute); display: flex; gap: 10px; align-items: center; }

  /* ── 首页：分类入口卡（门户式紧凑导航块）── */
  .cat-cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  a.cat-card {
    display: block; padding: 16px 18px; text-decoration: none; color: inherit;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-lg);
    transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease;
    border-top: 3px solid var(--accent);
  }
  a.cat-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); }
  a.cat-card .nm { font-size: 15.5px; font-weight: 600; margin-bottom: 5px; }
  a.cat-card .br { font-size: 12.5px; color: var(--ink-soft); line-height: 1.62; }
  a.cat-card .ct { margin-top: 12px; font-size: 12px; color: var(--accent); font-weight: 500; }

  /* ── 首页区块 ── */
  section.home { margin: 44px 0 0; }

  @media (max-width: 860px) {
    .hero-pick .inner { grid-template-columns: 1fr; }
    .hero-pick .cover { min-height: 190px; aspect-ratio: 16/9; }
    .hero-pick .txt { padding: 22px 24px; }
    .hero-pick h2 { font-size: 21px; }
    ul.index.two { grid-template-columns: 1fr; column-gap: 0; }
  }

  @media (max-width: 560px) {
    header.page { padding: 24px 0 16px; }
    header.page h1 { font-size: 24px; }
    header.page .meta { font-size: 12px; gap: 9px; }
    .grid { grid-template-columns: 1fr; }
    .wrap { padding: 0 16px; }
    a.item { padding: 15px 2px 15px 13px; }
    a.item:hover { padding-left: 17px; }
    a.item .ttl { font-size: 15.5px; }
    header.site .bar { padding: 10px 16px; gap: 12px; }
    header.site .brand .sub { display: none; }
    header.site nav.top { margin-left: 0; width: 100%; gap: 1px; overflow-x: auto; }
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
    { key: "about", text: "关于", href: "/about/" },
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

/**
 * 页脚导航。合规页面（隐私 / 免责 / 条款 / 联系）必须全站可达 ——
 * Google AdSense 审核与搜索质量评估都会检查这些页面能否从站内找到。
 */
const FOOT_LINKS = [
  { text: "关于我们", href: "/about/" },
  { text: "联系我们", href: "/contact/" },
  { text: "隐私政策", href: "/privacy/" },
  { text: "免责声明", href: "/disclaimer/" },
  { text: "使用条款", href: "/terms/" },
  { text: "全部内容", href: "/posts/" },
  { text: "小工具", href: "/tools/" },
];

function shell({ title, desc, body, canonical, active, noindex, updated }) {
  const full = title === SITE.title ? `${SITE.title} · ${SITE.subtitle}` : `${title} ｜ ${SITE.title} · ${SITE.subtitle}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(full)}</title>
<meta name="description" content="${escapeHtml(desc || SITE.desc)}" />
${noindex ? `<meta name="robots" content="noindex" />` : `<meta name="robots" content="index, follow, max-image-preview:large" />`}
${canonical ? `<link rel="canonical" href="${SITE.origin}${canonical}" />` : ""}
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${escapeHtml(SITE.title)}" />
<meta property="og:title" content="${escapeHtml(title === SITE.title ? SITE.title : title)}" />
<meta property="og:description" content="${escapeHtml(desc || SITE.desc)}" />
${canonical ? `<meta property="og:url" content="${SITE.origin}${canonical}" />` : ""}
<meta name="twitter:card" content="summary" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="sitemap" type="application/xml" href="/sitemap.xml" />
${updated ? `<meta name="last-modified" content="${escapeHtml(updated)}" />` : ""}
<style>${BASE_CSS}</style>
</head>
<body>
<!--email_off-->
${topbar(active)}
<div class="wrap">
${body}
  <div class="disclaimer">
    <div class="rule"></div>
    <p>${escapeHtml(SITE.disclaimer)}</p>
  </div>
  <footer class="meta">
    <nav class="fnav" aria-label="页脚导航">
${FOOT_LINKS.map((l) => `      <a href="${l.href}">${escapeHtml(l.text)}</a>`).join("\n")}
    </nav>
    <p>${escapeHtml(SITE.title)} · ${escapeHtml(SITE.subtitle)} ｜ 联系邮箱：${escapeHtml(SITE.email)}</p>
    <p style="margin:6px 0 0">© ${new Date().getFullYear()} ${escapeHtml(SITE.title)} ｜ 本站内容仅供学习参考</p>
  </footer>
</div>
<!--/email_off-->
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
 * 五之二、静态合规页面（关于 / 隐私 / 免责 / 条款 / 联系）
 * ------------------------------------------------------------
 * 这些页面是 Google AdSense 审核与搜索质量评估的必需项：
 * 必须有清晰可读的隐私政策（说明第三方广告 Cookie）、免责声明、
 * 联系方式与关于说明，且都要能从站内任意页面到达。
 * 源文件放 pages/*.md，按 order 排序，走同一套 markdown 渲染器。
 * ========================================================== */

function readPages() {
  if (!fs.existsSync(SRC_PAGES)) return [];
  const out = [];
  for (const f of fs.readdirSync(SRC_PAGES)) {
    if (!f.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(SRC_PAGES, f), "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (data.draft === true) continue;
    out.push({
      slug: data.slug || f.replace(/\.md$/, ""),
      title: data.title || f.replace(/\.md$/, ""),
      desc: data.desc || "",
      updated: fmtDate(data.updated),
      order: Number(data.order) || 99,
      pri: Number(data.pri) || 0.3,
      body,
    });
  }
  out.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  return out;
}

/* ============================================================
 * 六、构建
 * ========================================================== */

/**
 * 纯文字索引条目（首页最新内容 / 全部内容 / 分类页共用）。
 * 刻意不放配图：列表页的价值在于「快速扫读标题与摘要」，
 * 大图会挤压信息密度、拖慢首屏，且缩略图在窄屏下排版容易失衡。
 * @param {object} p 文章对象
 * @param {{withCat?:boolean, tagText?:string}} [opt]
 */
function itemRow(p, opt = {}) {
  const tag = opt.tagText || (opt.withCat ? p.category.replace(/^\S+\s*/, "") : "");
  return `    <li>
      <a class="item" href="/posts/${encodeURIComponent(p.slug)}/">
        <p class="ttl">${escapeHtml(p.title)}</p>
        ${p.excerpt ? `<p class="sm">${escapeHtml(p.excerpt)}</p>` : ""}
        <div class="mt">
          ${tag ? `<span class="tag">${escapeHtml(tag)}</span>` : ""}
          <span>${escapeHtml(p.date)}</span>
          ${p.tags && p.tags.length ? `<span class="dot">·</span><span>${escapeHtml(p.tags.slice(0, 3).join(" / "))}</span>` : ""}
        </div>
      </a>
    </li>`;
}

function build() {
  log("→ 读取源文件");
  const posts = readPosts();
  const tools = readTools();
  const pages = readPages();
  log(`  文章 ${posts.length} 篇，工具 ${tools.length} 个，静态页 ${pages.length} 个`);

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
  // 排版取舍：首页只在「焦点区」保留一张大图（全站唯一），
  // 其余列表一律用纯文字索引 —— 大图压文字在列表里既不好看也伤扫读效率。
  const pick = posts[0]; // 焦点文章 = 最新一篇
  const latest = posts.slice(pick ? 1 : 0, pick ? 13 : 12); // 焦点区占 1 篇，合计首页呈现 13 篇
  const homeBody = `
<main>
${
  pick
    ? `<a class="hero-pick" href="/posts/${encodeURIComponent(pick.slug)}/">
  <div class="inner">
    ${pick.cover ? `<img class="cover" src="${escapeHtml(pick.cover)}" alt="${escapeHtml(pick.title)}" />` : ""}
    <div class="txt">
      <div class="kicker">最新推荐</div>
      <h2>${escapeHtml(pick.title)}</h2>
      <p>${escapeHtml(pick.excerpt)}</p>
      <div class="meta"><span>${escapeHtml(pick.category)}</span><span>·</span><span>${escapeHtml(pick.date)}</span></div>
    </div>
  </div>
</a>`
    : ""
}

<section class="home">
  <h2><span>最新内容</span><a class="more" href="/posts/">查看全部 ${posts.length} 篇 →</a></h2>
  <div class="lead">按发布时间倒序</div>
  ${
    latest.length
      ? `<ul class="index">
${latest.map((p) => itemRow(p, { withCat: true })).join("\n")}
  </ul>`
      : `<div class="empty-note">内容正在整理中，敬请期待。</div>`
  }
</section>

<section class="home">
  <h2><span>按分类浏览</span></h2>
  <div class="lead">五个固定方向，每个方向持续更新</div>
  <div class="cat-cards" style="margin-top:16px">
${CATS.map((c) => {
  const n = posts.filter((p) => p.catSlug === c.slug).length;
  return `    <a class="cat-card" href="/category/${c.slug}/">
      <div class="nm">${escapeHtml(c.name)}</div>
      <div class="br">${escapeHtml(c.brief)}</div>
      <div class="ct">${n} 篇内容 →</div>
    </a>`;
}).join("\n")}
  </div>
</section>

<section class="home">
  <h2><span>本站小工具</span><a class="more" href="/tools/">全部 ${tools.length} 个 →</a></h2>
  <div class="lead">纯前端运行，数据不上传，全部在本站内使用</div>
  ${
    tools.length
      ? `<div class="grid" style="margin-top:16px">
${tools
  .map(
    (t) => `    <a class="card" href="/tools/${t.slug}/">
      <div class="row"><span class="badge tool">${escapeHtml(t.icon || "工具")}</span><span class="title">${escapeHtml(t.name)}</span></div>
      <p class="desc">${escapeHtml(t.desc)}</p>
    </a>`
  )
  .join("\n")}
  </div>`
      : `<div class="empty-note">工具正在开发中。</div>`
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
${crumb([{ text: "首页", href: "/" }, { text: "全部内容", href: "/posts/" }, { text: p.category || "内容" }])}
<header class="page">
  <div class="hd-main">
    <h1>${escapeHtml(p.title)}</h1>
    ${p.excerpt ? `<p class="sub">${escapeHtml(p.excerpt)}</p>` : ""}
  </div>
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
  <h2><span>同类内容</span><a class="more" href="/category/${p.catSlug}/">查看该分类 →</a></h2>
  <ul class="index">
${related.map((r) => itemRow(r, { tagText: "同分类" })).join("\n")}
  </ul>
</section>`
    : ""
}
<a class="backlink" href="/posts/">← 返回全部内容</a>`;
    fs.writeFileSync(path.join(dir, "index.html"), shell({ title: p.title, desc: p.excerpt, body, canonical: `/posts/${encodeURIComponent(p.slug)}/`, active: p.catSlug }), "utf8");
  }
  log(`  文章页 ${posts.length} 个`);

  /* ---- 文章列表页（CMS 式索引：全部分类顺序铺开，纯文字）---- */
  const byCat = CATS.map((c) => ({ cat: c, items: posts.filter((p) => p.catSlug === c.slug) }));
  const listBody = `
${crumb([{ text: "首页", href: "/" }, { text: "全部内容" }])}
<header class="page">
  <div class="hd-main">
    <h1>全部内容</h1>
    <p class="sub">${escapeHtml(SITE.title)}收录的家庭与成长内容，共 ${posts.length} 篇，按分类归集、按发布时间倒序。</p>
  </div>
  <div class="meta">
    <span class="stat"><b>${posts.length}</b> 篇内容</span>
    <span class="stat"><b>${CATS.length}</b> 个分类</span>
  </div>
</header>
<nav class="cat-cards" style="margin-top:24px" aria-label="分类快捷入口">
${CATS.map((c) => {
  const n = posts.filter((p) => p.catSlug === c.slug).length;
  return `  <a class="cat-card" href="#cat-${c.slug}">
    <div class="nm">${escapeHtml(c.name)}</div>
    <div class="br">${escapeHtml(c.brief)}</div>
    <div class="ct">${n} 篇 →</div>
  </a>`;
}).join("\n")}
</nav>
${byCat
  .filter((g) => g.items.length)
  .map(
    (g) => `<section class="block" id="cat-${g.cat.slug}">
  <h2><span>${escapeHtml(g.cat.name)}</span><a class="more" href="/category/${g.cat.slug}/">进入分类页 →</a></h2>
  <div class="lead">${g.items.length} 篇 · ${escapeHtml(g.cat.brief)}</div>
  <ul class="index">
${g.items.map((p) => itemRow(p)).join("\n")}
  </ul>
</section>`
  )
  .join("\n")}`;
  fs.writeFileSync(path.join(OUT, "posts", "index.html"), shell({ title: "全部内容", desc: `小乖乖收录的家庭与成长相关内容，共 ${posts.length} 篇，按分类浏览。`, body: listBody, canonical: "/posts/", active: "posts" }), "utf8");
  log("  文章列表页 /posts/");

  /* ---- 分类页 /category/<slug>/（顶部导航的 5 个分类入口）---- */
  for (const c of CATS) {
    const items = posts.filter((p) => p.catSlug === c.slug);
    const dir = path.join(OUT, "category", c.slug);
    ensure(dir);
    const others = CATS.filter((x) => x.slug !== c.slug);
    const catBody = `
${crumb([{ text: "首页", href: "/" }, { text: "分类", href: "/posts/" }, { text: c.name }])}
<header class="page">
  <div class="hd-main">
    <h1>${escapeHtml(c.name)}</h1>
    <p class="sub">${escapeHtml(c.brief)}。本分类共 ${items.length} 篇内容，按发布时间倒序。</p>
  </div>
  <div class="meta">
    <span class="stat"><b>${items.length}</b> 篇内容</span>
    ${items.length ? `<span>最近更新 ${escapeHtml(items[0].date)}</span>` : ""}
  </div>
</header>
${
  items.length
    ? `<ul class="index two" style="margin-top:22px">
${items.map((p) => itemRow(p, { tagText: p.category.replace(/^\S+\s*/, "") })).join("\n")}
  </ul>`
    : `<div class="empty-note" style="margin-top:22px">该分类内容正在整理中。</div>`
}
<section class="block">
  <h2><span>浏览其他分类</span><a class="more" href="/posts/">全部内容 →</a></h2>
  <div class="cat-cards" style="margin-top:14px">
${others
  .map((o) => {
    const n = posts.filter((p) => p.catSlug === o.slug).length;
    return `    <a class="cat-card" href="/category/${o.slug}/">
      <div class="nm">${escapeHtml(o.name)}</div>
      <div class="br">${escapeHtml(o.brief)}</div>
      <div class="ct">${n} 篇 →</div>
    </a>`;
  })
  .join("\n")}
  </div>
</section>`;
    fs.writeFileSync(
      path.join(dir, "index.html"),
      shell({ title: c.name, desc: `${c.name}：${c.brief}。小乖乖原创内容，共 ${items.length} 篇。`, body: catBody, canonical: `/category/${c.slug}/`, active: c.slug }),
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
  <div class="hd-main">
    <h1>${escapeHtml(t.name)}</h1>
    <p class="sub">${escapeHtml(t.desc)}</p>
  </div>
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
  <div class="hd-main">
    <h1>自研小工具</h1>
    <p class="sub">全部在本站内运行，不上传数据、不跳转外部网站、不需要注册。计算结果仅供参考。</p>
  </div>
  <div class="meta">
    <span class="stat"><b>${tools.length}</b> 个工具</span>
  </div>
</header>
${byToolCat
  .filter((g) => g.items.length)
  .map(
    (g) => `<section class="block">
  <h2><span>${escapeHtml(g.cat.name)}</span><a class="more" href="/category/${g.cat.slug}/">相关文章 →</a></h2>
  <div class="grid" style="margin-top:14px">
${g.items
  .map(
    (t) => `    <a class="card" href="/tools/${t.slug}/">
      <div class="row"><span class="badge tool">${escapeHtml(t.icon || "工具")}</span><span class="title">${escapeHtml(t.name)}</span></div>
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

  /* ---- 静态合规页 /about/ /privacy/ /disclaimer/ /terms/ /contact/ ---- */
  for (const pg of pages) {
    const dir = path.join(OUT, pg.slug);
    ensure(dir);
    const pageBody = `
${crumb([{ text: "首页", href: "/" }, { text: pg.title }])}
<header class="page">
  <div class="hd-main">
    <h1>${escapeHtml(pg.title)}</h1>
    ${pg.desc ? `<p class="sub">${escapeHtml(pg.desc)}</p>` : ""}
  </div>
  <div class="meta">${pg.updated ? `<span>最近更新 ${escapeHtml(pg.updated)}</span>` : ""}</div>
</header>
<article class="body narrow">
${renderMarkdown(pg.body)}
</article>
<section class="block narrow">
  <h2><span>相关页面</span></h2>
  <ul class="index">
${pages
  .filter((x) => x.slug !== pg.slug)
  .map(
    (x) => `    <li>
      <a class="item" href="/${x.slug}/">
        <p class="ttl">${escapeHtml(x.title)}</p>
        <p class="sm">${escapeHtml(x.desc)}</p>
      </a>
    </li>`
  )
  .join("\n")}
  </ul>
</section>`;
    fs.writeFileSync(
      path.join(dir, "index.html"),
      shell({ title: pg.title, desc: pg.desc, body: pageBody, canonical: `/${pg.slug}/`, active: pg.slug, updated: pg.updated }),
      "utf8"
    );
  }
  log(`  合规页 ${pages.length} 个（${pages.map((p) => "/" + p.slug + "/").join(" ")}）`);

  /* ---- sitemap.xml（搜索引擎索引入口，必须放产物根目录）----
   * 只收录可索引页面：首页、分类页、列表页、工具页、文章页、合规页。
   * 404 与 /admin/ 刻意排除 —— 前者 noindex，后者是后台入口。
   * lastmod 取该页最后有实质变更的日期，优先用内容日期，其次用构建日。
   */
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: "/", pri: "1.0", freq: "daily", last: posts[0] ? posts[0].date : today },
    { loc: "/posts/", pri: "0.9", freq: "daily", last: posts[0] ? posts[0].date : today },
    ...CATS.map((c) => {
      const items = posts.filter((p) => p.catSlug === c.slug);
      return { loc: `/category/${c.slug}/`, pri: "0.8", freq: "weekly", last: items[0] ? items[0].date : today };
    }),
    { loc: "/tools/", pri: "0.7", freq: "weekly", last: today },
    ...tools.map((t) => ({ loc: `/tools/${t.slug}/`, pri: "0.6", freq: "monthly", last: today })),
    ...posts.map((p) => ({ loc: `/posts/${encodeURIComponent(p.slug)}/`, pri: "0.7", freq: "monthly", last: p.date || today })),
    ...pages.map((pg) => ({ loc: `/${pg.slug}/`, pri: String(pg.pri), freq: "yearly", last: pg.updated || today })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${SITE.origin}${u.loc}</loc>
    <lastmod>${u.last}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap, "utf8");
  log(`  sitemap.xml（${urls.length} 条 URL）`);

  /* ---- robots.txt ----
   * 放行全站抓取，只屏蔽后台与 CMS 配置文件；
   * 显式声明 Sitemap 位置，方便搜索引擎发现。
   * 注意：/admin/ 的 Disallow 是「不被收录」，不是「安全防护」——
   * 后台本身依赖 GitHub OAuth 鉴权，未登录拿不到任何数据。
   */
  const robots = `# robots.txt · ${SITE.origin}
# 全站内容欢迎搜索引擎收录。

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /posts.json
Disallow: /tools.json
Disallow: /404.html

# ── 显式放行主流搜索引擎 ──────────────────────────────────────
# 注意：Cloudflare 的托管 robots.txt（Content Signals Policy）会在此文件
# 之前追加一段 "BEGIN/END Cloudflare Managed content" 块，其中把
# Baiduspider / PetalBot 误当作「训练爬虫」写了 Disallow: /。
# 那是 CF 的已知问题（这两个是中国百度与华为的搜索爬虫，不是训练爬虫）。
# 关闭开关在 Dashboard → 对应 zone → Security → Settings（免费版可用）。
# 在关闭之前，这里显式声明 Allow，按 RFC 9309 第 2.2.2 节：
# 同一 User-agent 的多个分组须合并，同等具体度的 Allow / Disallow 取较宽松者。
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Baiduspider
Allow: /

User-agent: PetalBot
Allow: /

User-agent: Sogou web spider
Allow: /

User-agent: 360Spider
Allow: /

User-agent: YisouSpider
Allow: /

# ── 明确拒绝生成式 AI 训练爬虫 ────────────────────────────────
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

Sitemap: ${SITE.origin}/sitemap.xml
`;
  fs.writeFileSync(path.join(OUT, "robots.txt"), robots, "utf8");
  log("  robots.txt");

  // 404 页：CF Pages 只要产物根存在 404.html 就会对未知路径返回真 404。
  // 缺它时未知路径会回落成「200 + 首页」，形成软 404 —— 对内容站 SEO 有害。
  const notFoundBody = `
<header class="page">
  <div class="hd-main">
    <h1>页面走丢了</h1>
    <p class="sub">这个地址在站内不存在，可能是链接过期或输入有误。</p>
  </div>
  <div class="meta"><span>404 Not Found</span></div>
</header>
<section class="block">
  <h2><span>你可以从这里继续</span></h2>
  <ul class="index">
    <li><a class="item" href="/"><p class="ttl">回到首页</p><p class="sm">最新推荐与全部分类入口都在这里</p></a></li>
    <li><a class="item" href="/posts/"><p class="ttl">全部内容</p><p class="sm">按分类浏览 ${posts.length} 篇原创内容</p></a></li>
    <li><a class="item" href="/tools/"><p class="ttl">自研小工具</p><p class="sm">共 ${tools.length} 个，纯前端运行、不上传数据</p></a></li>
    <li><a class="item" href="/about/"><p class="ttl">关于我们</p><p class="sm">了解本站的内容方向与写作原则</p></a></li>
  </ul>
</section>`;
  fs.writeFileSync(
    path.join(OUT, "404.html"),
    shell({ title: "页面走丢了", desc: "页面不存在。", body: notFoundBody, noindex: true }),
    "utf8"
  );
  log("  404 页 /404.html");

  log(`\n✅ 构建完成 → ${OUT}`);
  log(`   文章 ${posts.length} 篇 ｜ 分类 ${CATS.length} 个 ｜ 工具 ${tools.length} 个 ｜ 合规页 ${pages.length} 个`);
}

build();
