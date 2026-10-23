/**
 * media-proxy · xiaoguaiguai.cn
 * ------------------------------------------------------------
 * 用途：把 Cloudflare R2 桶 `xiaoguaiguai-media` 反代到主域名路径 `/media/*`，
 *       让 cover 配图可以用 `https://xiaoguaiguai.cn/media/<key>` 直接访问。
 *
 * 为什么需要它（规范内部冲突的解法）：
 *   - 规范要求「cover 只接受 R2 公开 URL」 → 图片必须在 R2 桶里
 *   - 规范又要求「首期禁止任何子域名」     → 不能用 media.xiaoguaiguai.cn
 *   - 且 r2.dev 域名在国内被 DNS 污染（项目铁律 11），绝不可用
 *   → 故用 Worker 绑定主域名子路径 /media/* 反代桶，两条约束同时满足。
 *
 * 路由：xiaoguaiguai.cn/media/*（绑定主域名，不使用任何子域名，不使用 workers.dev）
 * 绑定：R2 桶 xiaoguaiguai-media（wrangler.jsonc 的 r2_buckets）
 *
 * 行为：
 *   GET /media/<key>       → 从桶取对象返回；带 ETag / Cache-Control / 正确 Content-Type
 *   GET /media/            → 返回桶内对象清单（JSON，便于核对已传文件）
 *   HEAD                   → 同上，只回头
 *   OPTIONS                → CORS 预检
 *   其他方法               → 405
 */

const BUCKET_NAME = "xiaoguaiguai-media";
const PUBLIC_PREFIX = "/media/";

/** 允许的图片扩展名 → MIME（防止误传非图片被当资源分发） */
const MIME = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  ico: "image/x-icon",
};

const extOf = (key) => {
  const i = key.lastIndexOf(".");
  return i < 0 ? "" : key.slice(i + 1).toLowerCase();
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://xiaoguaiguai.cn",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    const { method } = request;
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS 预检
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD, OPTIONS", ...corsHeaders },
      });
    }

    if (!pathname.startsWith(PUBLIC_PREFIX)) {
      return new Response("Not Found", { status: 404 });
    }

    // 去掉前缀与前导斜杠，得到 R2 object key
    const key = decodeURIComponent(pathname.slice(PUBLIC_PREFIX.length).replace(/^\/+/, ""));

    // /media/ 或 /media → 输出桶内清单
    if (key === "") {
      const list = await env.MEDIA.list({ limit: 1000 });
      const items = (list.objects || []).map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded,
        url: `https://xiaoguaiguai.cn/media/${o.key}`,
      }));
      return new Response(
        JSON.stringify(
          {
            bucket: BUCKET_NAME,
            count: items.length,
            truncated: list.truncated || false,
            prefix: `https://xiaoguaiguai.cn/media/`,
            items,
          },
          null,
          2
        ),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            ...corsHeaders,
          },
        }
      );
    }

    // 取对象
    const obj = await env.MEDIA.get(key);
    if (!obj) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store", ...corsHeaders },
      });
    }

    const headers = new Headers(corsHeaders);
    // 用桶里存的 contentType；缺失时按扩展名兜底
    const ct = obj.httpMetadata?.contentType || MIME[extOf(key)] || "application/octet-stream";
    headers.set("Content-Type", ct);
    // 配图变更不频繁，长缓存；但不用 immutable，便于换图后能刷新
    headers.set("Cache-Control", "public, max-age=86400, must-revalidate");
    if (obj.httpEtag) headers.set("ETag", obj.httpEtag);
    if (obj.httpMetadata?.contentLanguage) {
      headers.set("Content-Language", obj.httpMetadata.contentLanguage);
    }

    return new Response(method === "HEAD" ? null : obj.body, { status: 200, headers });
  },
};
