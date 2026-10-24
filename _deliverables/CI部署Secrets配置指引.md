# CI 部署 Secrets 配置指引

> 目标：让 GitHub Actions 能把 `xiaoguaiguai-nav` 自动部署到 Cloudflare Pages。
> 配好后，**后台点保存文章 = 一次 commit = 自动上线**，无需本地介入。

## 当前状态（2026-10-24 实测）

| Secret | 状态 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | ✅ **已配置**（Agent 经 GitHub API 写入） |
| `CLOUDFLARE_API_TOKEN` | ⏳ **待你配置**（必须去 CF 后台现生成，无法代劳） |

验证命令：

```bash
cd D:/workbuddy/netspace/xiaoguaiguai-nav
C:/Users/dynabook/.workbuddy/binaries/python/envs/default/Scripts/python.exe _trash_set_secrets.py --list
```

---

## 第一步：在 Cloudflare 生成 API Token

### 入口（两个都能到同一个页面）

- **主入口**：https://dash.cloudflare.com/profile/api-tokens
  （右上角头像 → **My Profile** → 左侧 **API Tokens**）
- **备用入口**：https://dash.cloudflare.com/99032f2638cd2ead55b4f0f42e462902/api-tokens
  （直接进该账号的 API Tokens 页）

### 点击顺序

1. 点 **Create Token**
2. 找到 **Custom token** 一行（**不要**选上面「Edit Cloudflare Workers」模板 —— 官方文档明确说明该模板**不含 Pages 权限**），点 **Get started**
3. **Token name** 随便填，例如 `xiaoguaiguai-pages-deploy`
4. **Permissions** 只加这一条：

   | 栏目 | 选择 |
   |---|---|
   | 第 1 个下拉 | **Account** |
   | 第 2 个下拉 | **Cloudflare Pages** |
   | 第 3 个下拉 | **Edit** |

5. **Account Resources**：Include → **Fbx@msn.com's Account**
   （即 `99032f2638cd2ead55b4f0f42e462902`，与本站 CF 账号一致）
6. 其余（Zone Resources / Client IP / TTL）**全部留空**
7. 点 **Continue to summary** → **Create Token**
8. **立刻复制那串 token** —— 页面只显示一次，关掉就再也看不到（只能重新生成）

> token 形如 `cfut_` 或长串随机字符，长度约 40 位。

### ⚠️ 与现有 `.cf_token` 的区别

本地 `D:/workbuddy/netspace/.cf_token` 里那串（`cfut_Mzh...`）**不能用**：

- 实测调 Pages API 返回 `10000 Authentication error`
- 它是给 DNS 操作用的，**没有 Pages 权限**
- **不要改这个文件**，它是别的流程在用的凭据

---

## 第二步：写入 GitHub 仓库 Secrets

### 入口

https://github.com/FBX-Dev/xiaoguaiguai-nav/settings/secrets/actions

（仓库页 → **Settings** → 左侧 **Secrets and variables** → **Actions**）

### 操作

1. 点 **New repository secret**
2. **Name** 填 `CLOUDFLARE_API_TOKEN`（**一字不差，全大写，下划线**）
3. **Secret** 粘贴第一步复制的 token
4. 点 **Add secret**

`CLOUDFLARE_ACCOUNT_ID` 已经配好了，不用重复添加。

---

## 第三步：验证

### 方式 A：重跑一次工作流（推荐）

1. 打开 https://github.com/FBX-Dev/xiaoguaiguai-nav/actions
2. 左侧选 **Deploy to Cloudflare Pages**
3. 右上 **Run workflow** → 分支选 `main` → 点绿色 **Run workflow**
4. 等约 1 分钟，看这一次 run 是否全绿

预期结果：

| 步骤 | 结果 |
|---|---|
| Build static site | ✅ |
| Verify build output | ✅ |
| Check deploy credentials | ✅（配好前这一步会红） |
| Deploy to Cloudflare Pages | ✅ |

### 方式 B：本地打印步骤级结论

```bash
cd D:/workbuddy/netspace/xiaoguaiguai-nav
node _trash_check_ci.mjs
```

会打印本次 commit 每个 step 的 OK / FAIL。

### 失败判读

- **Build / Verify 全绿，只有 Deploy 红** ⇒ 逻辑没问题，就是缺 Secrets
- **Check deploy credentials 红** ⇒ 对应 Secret 没配或名字拼错
- **Deploy 报 `Authentication error` 10000** ⇒ token 权限不对，回第一步确认是 `Account → Cloudflare Pages → Edit`
- **Deploy 报 `Could not route to .../pages/projects`** ⇒ token 缺 Pages 权限（官方文档点名的典型症状）

---

## 备用：让我代写 Token

生成 token 后，把它作为参数传给我，我可以直接写进仓库（PAT 已验证有 Secrets 写权限）：

```bash
python _trash_set_secrets.py <你的CF_TOKEN>
```

---

## 附：本仓库用到的完整清单

| 项 | 值 |
|---|---|
| GitHub 仓库 | `FBX-Dev/xiaoguaiguai-nav` |
| Cloudflare 账号 ID | `99032f2638cd2ead55b4f0f42e462902` |
| CF 账号名 | `Fbx@msn.com's Account` |
| Pages 项目名 | `xiaoguaiguai-nav` |
| 工作流文件 | `.github/workflows/deploy.yml` |
| 生产分支 | `main` |
| 访问域名 | https://xiaoguaiguai.cn |
