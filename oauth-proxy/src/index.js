/**
 * sveltia-oauth-proxy · xiaoguaiguai.cn
 * ------------------------------------------------------------
 * 用途：Sveltia CMS 的 GitHub OAuth 回调代理（解决浏览器端跨域 / 保护 client_secret）。
 * 路由：xiaoguaiguai.cn/oauth/*（绑定主域名，不使用任何子域名，不使用 workers.dev）
 *
 * 环境变量（用 wrangler secret put 写入，加密存储）：
 *   GITHUB_CLIENT_ID       GitHub OAuth App 的 Client ID
 *   GITHUB_CLIENT_SECRET   GitHub OAuth App 的 Client Secret
 *   ALLOWED_DOMAINS        允许使用本代理的域名，逗号分隔（如 xiaoguaiguai.cn）
 *
 * 端点：
 *   GET /oauth/authorize   ① 授权入口：校验域名 → 下发 CSRF Cookie → 302 跳 GitHub 授权页
 *   GET /oauth/callback    ② 回调：用 code 换 token → 返回 HTML，用 postMessage 交给 CMS
 *   GET /oauth/redirect    ② 的回调别名（GitHub 回调地址两种写法都兼容）
 *   GET /oauth/health      存活探测
 *
 * ⚠️ 协议说明（关键，勿按「query 传 token」改）：
 *   Sveltia CMS 走 popup + postMessage，不是 URL 参数回传。
 *   弹窗页需先向 opener 发 `authorizing:github`，收到 opener 回信后再发
 *   `authorization:github:success:{"provider":"github","token":"..."}`。
 *   本实现对齐官方 https://github.com/sveltia/sveltia-cms-auth 的行为。
 */

const SUPPORTED_PROVIDERS = ['github'];

/** 各 provider 默认 scope / 分隔符 / 允许的 scope 白名单 */
const PROVIDER_SCOPES = {
  github: {
    fallback: 'repo,user',
    separator: ',',
    allowed: ['repo', 'public_repo', 'user', 'read:user', 'user:email'],
  },
};

/** 转义正则元字符 */
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 把 ALLOWED_DOMAINS 转成正则源数组（支持 * 通配） */
const getDomainPatterns = (allowedDomains) =>
  (allowedDomains ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `^${escapeRegExp(s).replaceAll('\\*', '.+')}$`);

/** 安全地把值嵌入内联 <script> */
const serialize = (value) => JSON.stringify(value ?? null).replaceAll('<', '\\u003c');

/** 计算实际请求的 scope */
const getScope = (provider, requested, env) => {
  const { fallback, separator, allowed } = PROVIDER_SCOPES[provider];
  let scopes = (requested ?? '').split(/[\s,]+/).filter(Boolean);
  const allowWorkflow = provider === 'github' && env.GITHUB_ALLOW_WORKFLOW_SCOPE === 'true';

  // workflow scope 比默认更宽，必须运维显式同意；不同意时剔除而不是回退默认
  if (!allowWorkflow && scopes.includes('workflow')) {
    scopes = scopes.filter((s) => s !== 'workflow');
  }

  if (!scopes.length) return fallback;
  if (scopes.every((s) => allowed.includes(s) || (allowWorkflow && s === 'workflow'))) {
    return scopes.join(separator);
  }
  return fallback;
};

/**
 * 输出与 window.opener 通信的 HTML 页（popup 协议核心）
 */
const outputHTML = ({ provider = 'unknown', token, error, errorCode, env = {} }) => {
  const state = error ? 'error' : 'success';
  const content = error ? { provider, error, errorCode } : { provider, token };

  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>授权中…</title></head><body><script>
(() => {
  const trustedPatterns = ${serialize(getDomainPatterns(env.ALLOWED_DOMAINS))};
  const hasToken = ${serialize(!!token)};

  const isTrusted = (origin) => {
    try {
      const { hostname } = new URL(origin);
      return trustedPatterns.some((p) => new RegExp(p).test(hostname));
    } catch {
      return false;
    }
  };

  window.addEventListener('message', ({ data, origin }) => {
    if (data !== 'authorizing:${provider}') return;
    // 有 token 且配置了白名单时，只回传给受信来源；错误信息不含密钥，直接透传
    if (hasToken && trustedPatterns.length && !isTrusted(origin)) return;
    window.opener?.postMessage(
      'authorization:${provider}:${state}:${JSON.stringify(content)}',
      origin
    );
  });

  window.opener?.postMessage('authorizing:${provider}', '*');
})();
</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html;charset=UTF-8',
        'Cache-Control': 'no-store',
        // 清除 CSRF Cookie
        'Set-Cookie': 'csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure',
      },
    }
  );
};

/** ① 授权入口 */
const handleAuth = async (request, env) => {
  const { origin, searchParams } = new URL(request.url);
  const { provider, site_id: domain, scope: requestedScope } = Object.fromEntries(searchParams);

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
    return outputHTML({
      env,
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  const scope = getScope(provider, requestedScope, env);
  const { ALLOWED_DOMAINS, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_HOSTNAME = 'github.com' } = env;

  const domainPatterns = getDomainPatterns(ALLOWED_DOMAINS);
  if (domainPatterns.length && !domainPatterns.some((p) => new RegExp(p).test(domain ?? ''))) {
    return outputHTML({
      env,
      provider,
      error: 'Your domain is not allowed to use the authenticator.',
      errorCode: 'UNSUPPORTED_DOMAIN',
    });
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return outputHTML({
      env,
      provider,
      error: 'OAuth app client ID or secret is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    });
  }

  const csrfToken = globalThis.crypto.randomUUID().replaceAll('-', '');
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope,
    state: csrfToken,
  });
  const authURL = `https://${GITHUB_HOSTNAME}/login/oauth/authorize?${params.toString()}`;

  return new Response('', {
    status: 302,
    headers: {
      Location: authURL,
      // Cookie 10 分钟有效；SameSite=Lax 保证跳回时仍带上
      'Set-Cookie':
        `csrf-token=${provider}_${csrfToken}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
    },
  });
};

/** ② 回调 */
const handleCallback = async (request, env) => {
  const { origin, searchParams } = new URL(request.url);
  const { code, state } = Object.fromEntries(searchParams);

  const [, provider, csrfToken] =
    request.headers.get('Cookie')?.match(/\bcsrf-token=([a-z-]+?)_([0-9a-f]{32})\b/) ?? [];

  if (!provider || !SUPPORTED_PROVIDERS.includes(provider)) {
    return outputHTML({
      env,
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    });
  }

  if (!code || !state) {
    return outputHTML({
      env,
      provider,
      error: 'Failed to receive an authorization code. Please try again later.',
      errorCode: 'AUTH_CODE_REQUEST_FAILED',
    });
  }

  if (!csrfToken || state !== csrfToken) {
    return outputHTML({
      env,
      provider,
      error: 'Potential CSRF attack detected. Authentication flow aborted.',
      errorCode: 'CSRF_DETECTED',
    });
  }

  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_HOSTNAME = 'github.com' } = env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return outputHTML({
      env,
      provider,
      error: 'OAuth app client ID or secret is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    });
  }

  let response;
  try {
    response = await fetch(`https://${GITHUB_HOSTNAME}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
      }),
    });
  } catch {
    response = undefined;
  }

  if (!response) {
    return outputHTML({
      env,
      provider,
      error: 'Failed to request an access token. Please try again later.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    });
  }

  let token = '';
  let error = '';
  try {
    ({ access_token: token, error } = await response.json());
  } catch {
    return outputHTML({
      env,
      provider,
      error: 'Server responded with malformed data. Please try again later.',
      errorCode: 'MALFORMED_RESPONSE',
    });
  }

  return outputHTML({ env, provider, token, error });
};

export default {
  async fetch(request, env) {
    const { method } = request;
    const { pathname } = new URL(request.url);

    if (method === 'GET' && ['/oauth/authorize', '/oauth/auth'].includes(pathname)) {
      return handleAuth(request, env);
    }

    if (method === 'GET' && ['/oauth/callback', '/oauth/redirect'].includes(pathname)) {
      return handleCallback(request, env);
    }

    if (method === 'GET' && pathname === '/oauth/health') {
      return new Response('ok', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    return new Response('', { status: 404 });
  },
};
