# CI 注解清零报告

**日期**：2026-10-24
**仓库**：`FBX-Dev/xiaoguaiguai-nav`
**结论**：两条注解全部消除，注解数 **0**，部署仍全绿。

---

## 一、用户反馈的两条注解

```
Annotations — 1 warning and 1 notice

① build-and-deploy
   Node.js 20 is deprecated. The following actions target Node.js 20 but are being
   forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4,
   cloudflare/wrangler-action@v3.

② build-and-deploy
   "The ubuntu-latest label will migrate to Ubuntu 26 beginning October 19, 2026."
```

两条都是**非阻塞注解**（不影响部署成功），但确实可以根治。

---

## 二、根因与修法

### 注解 ①：Node 20 弃用

**根因**：三个 action 的 `action.yml` 里声明的是 `using: node20`。GitHub 的 runner 已经是 Node 24，
于是把这几个 action **强制提权**到 Node 24 上跑，并打出弃用警告。

**修法**：升到声明 `node24` 的版本。

| Action | 旧 | 新 | 新版本运行时 |
|---|---|---|---|
| `actions/checkout` | `@v4` | **`@v7`** | `using: node24` |
| `actions/setup-node` | `@v4` | **`@v7`** | `using: 'node24'` |
| `cloudflare/wrangler-action` | `@v3` | **`@v4`** | `using: "node24"` |

**升级前先核对入参名有没有变**（否则会静默失效）。实测三者入参名全部保留：

- `cloudflare/wrangler-action@v4` → `apiToken` / `accountId` / `command` / `wranglerVersion` /
  `workingDirectory` / `packageManager` / `secrets` / `vars` 均在，`wranglerVersion: '4'` 可原样保留
- `actions/setup-node@v7` → `node-version` / `node-version-file` / `cache` 均在
- `actions/checkout@v7` → `fetch-depth` / `token` / `persist-credentials` / `submodules` 等均在

> 额外收益：`wrangler-action@v4` 不再硬编码 wrangler 3.90。不过本项目仍显式写 `wranglerVersion: '4'`，
> 目的是把 wrangler 大版本钉死，避免升级带来的行为漂移。

### 注解 ②：`ubuntu-latest` 迁移预告

**根因**：`runs-on: ubuntu-latest` 是**浮动标签**。GitHub 每次迁移 runner 镜像都会发一条 notice，
且迁移前后 Node 运行时与系统镜像存在差异，构建环境不可预测。

**修法**：改为 `runs-on: ubuntu-24.04`，钉住具体 LTS。

```
维护点：Ubuntu 24.04 被弃用时（GitHub 会提前数月公告）改成新的 LTS 编号即可。
```

---

## 三、验收结果

### 三条判据全部命中

| 判据 | 命令 | 结果 |
|---|---|---|
| 注解清零 | `GET /repos/{r}/check-runs/{id}/annotations` | **`[]`**（0 条） |
| runner 钉版本生效 | `GET /repos/{r}/actions/jobs/{id}` 的 `labels` | **`["ubuntu-24.04"]`** |
| 部署仍成功 | job 步骤级结论 | **10/10 success** |

**运行记录**：run `40077138869`，commit `4ae9cb7`，conclusion **success**

```
 1. Set up job                   success
 2. Checkout                     success   ← @v7
 3. Setup Node                   success   ← @v7
 4. Build static site            success
 5. Verify build output          success
 6. Check deploy credentials     success
 7. Deploy to Cloudflare Pages   success   ← @v4
 8. Post Setup Node              success
 9. Post Checkout                success
10. Complete job                 success
```

### 线上回归核验（确认升级未引入问题）

**12 条主路径状态码，连续 2 轮稳定**：

| 路径 | 状态码 | 说明 |
|---|---|---|
| `/` | 200 | |
| `/posts/` | 200 | |
| `/tools/` | 200 | |
| `/category/yuer/` `/jiaoyu/` `/nvxing/` `/jiating/` `/qinmi/` | 200 | 5 个分类页 |
| `/admin/` | 200 | |
| `/nav.json` | **301** | 已下线资源收口 |
| `/404.html` | **308** | |
| 未知路径 | **404** | 真 404，非软 404 |

**自动化校验**：
- 线上 e2e（Playwright）：**43 / 43 通过**
- `_selfcheck.py`：**全部通过**（首页零外链、置顶精选区块、404 noindex、`_redirects` 已下发）

---

## 四、一个假故障（值得记）

升级后首次轮询时，`/category/jiating/` 返回了 **500**，其余路径全 200。

重试立刻恢复 200，后续两轮全路径扫描也稳定。

**判定**：这是 Cloudflare Pages **新版本切换瞬间**的瞬态 —— 旧部署已撤下、新部署尚未完全就绪，
此时落在该边缘节点的请求会拿到 500。**不是升级引入的回归**。

**教训**：状态码扫描要**连续跑 2 轮**，单次 500 不要立刻改代码。

---

## 五、当前工作流基线（后续照此维护）

```yaml
jobs:
  build-and-deploy:
    runs-on: ubuntu-24.04        # 钉具体 LTS，不用 ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v7              # node24
      - uses: actions/setup-node@v7            # node24
        with:
          node-version: '22'
      # … build / verify / credential check …
      - uses: cloudflare/wrangler-action@v4    # node24
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          wranglerVersion: '4'
          command: pages deploy _dist --project-name=xiaoguaiguai-nav --branch=main
```

> 后续如再出现同类注解，通用处理方式：**先读新版 `action.yml` 确认入参名，再升版本**，
> 不要凭版本号猜参数。
