/**
 * sveltia-oauth-proxy · xiaoguaiguai.cn
 * ------------------------------------------------------------
 * 用途：Sveltia CMS 的 GitHub OAuth 回调代理，解决浏览器端跨域。
 * 路由：xiaoguaiguai.cn/oauth/*（绑定主域名，不使用任何子域名，不使用 workers.dev）
 * 环境变量（加密）：GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET
 *
 * 端点：
 *   GET /oauth/authorize  → 302 跳转 GitHub 授权页
 *   GET /oauth/callback   → 用 code 换 token，再 302 回 /admin
 *   GET /oauth/*（其他）  → 200 存活探测
 */

const REDIRECT_URI = "https://xiaoguaiguai.cn/oauth/callback";
const SITE_URL = "https://xiaoguaiguai.cn/admin";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "https://xiaoguaiguai.cn",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    // 授权入口：拼装 GitHub authorize 地址并跳转
    if (url.pathname === "/oauth/authorize") {
      const state = url.searchParams.get("state") || "";
      if (!env.GITHUB_CLIENT_ID) {
        return new Response("OAuth 代理未配置 GITHUB_CLIENT_ID", { status: 500 });
      }
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: "repo",
        state,
      });
      return Response.redirect(
        `https://github.com/login/oauth/authorize?${params.toString()}`,
        302
      );
    }

    // 回调：用 code 换 access_token，再带回 /admin
    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code) {
        return new Response("缺少授权 code", { status: 400 });
      }
      if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
        return new Response("OAuth 代理未配置 Client 凭证", { status: 500 });
      }

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const tokenData = await tokenRes.json();

      const returnParams = new URLSearchParams({ ...tokenData });
      if (state) returnParams.set("state", state);
      return Response.redirect(`${SITE_URL}?${returnParams.toString()}`, 302);
    }

    return new Response("OAuth 代理服务", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  },
};
