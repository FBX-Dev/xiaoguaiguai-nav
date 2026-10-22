# 小乖乖 · 家庭资源导航（xiaoguaiguai.cn）

面向妈妈与家庭群体的**极简资源索引导航站**。只做外部资源跳转，本站不承载长篇正文。

- 唯一访问域名：**https://xiaoguaiguai.cn**
- 后台入口：**https://xiaoguaiguai.cn/admin**
- 数据源：`nav.json`（根目录，Sveltia CMS 读写）
- 图片存储：Cloudflare R2（桶 `xiaoguaiguai-media`），**不上传 Git 仓库**

> 首期**不启用任何子域名**，全部配置收敛于主域名。

## 一、一级分类（固定 5 个，不可新增/删减）

| 分类 | 内容条目 content | 工具条目 tool |
|---|---|---|
| 🧸 婴幼儿养育 | 6 | 2 |
| 📖 儿童教育 | 6 | 2 |
| 🌷 女性成长 | 6 | 2 |
| 🏠 家庭关系 | 6 | 2 |
| 💞 两性亲密成长 | 6 | 2 |
| **合计** | **30** | **10** |

另有 2 条备选条目（见 `_deliverables/内容底稿.md`），不计入保底配额，供上线筛选。

## 二、目录结构

```
.
├─ index.html          # 导航首页（新标签跳转 + 底部免责 + cover 容错）
├─ nav.json            # 导航数据源（Sveltia CMS 读写）
├─ favicon.svg         # 站点图标
├─ _headers            # 安全头与缓存策略
├─ README.md           # 本文件
├─ admin/
│  ├─ index.html       # Sveltia CMS 后台入口
│  └─ config.yml       # Sveltia CMS 配置
└─ oauth-proxy/        # GitHub OAuth 回调代理 Worker
   ├─ src/index.js
   └─ wrangler.jsonc
```

## 三、数据模型

**模型 A · 内容条目**（文章 / 书单 / 播客 / 专栏 / 优质科普）

```json
{
  "title": "标题（12 字以内优先）",
  "desc": "摘要 30～60 字，共情调性",
  "url": "第三方跳转链接",
  "cover": "R2 图片公开地址，无图留空字符串",
  "type": "content",
  "tags": ["标签"]
}
```

**模型 B · 工具条目**（App / 在线工具 / 清单模板 / 记录工具）

```json
{
  "title": "工具名称",
  "desc": "适合人群、核心用途、价值",
  "url": "官网 / 应用商店链接",
  "cover": "R2 图标或截图地址",
  "type": "tool",
  "tags": ["标签"]
}
```

`type` 只有 `content` / `tool` 两个枚举值；`cover` 只接受 R2 公开 URL。

## 四、前端固定改造（3 项）

1. **所有外链强制新标签**：`target="_blank" rel="noopener noreferrer"`
2. **cover 空值判断**：为空字符串 / null 时不渲染图片，并对加载失败做移除兜底，杜绝破损图
3. **底部免责声明**：`.disclaimer` 简约样式，文案见下

> 本站点仅做优质资源索引跳转，不提供医疗诊断、诊疗建议。第三方内容由原平台负责，请理性甄别。所有内容仅供学习参考。

## 五、内容红线

1. 禁止医疗诊断、医嘱、疗效承诺、偏方；育儿与产后内容仅做资源索引与经验科普
2. 两性亲密板块只聚焦沟通、边界、婚姻经营；严禁擦边、低俗、PUA、猎奇内容
3. 文案禁用焦虑营销词汇（必须、千万别、再不做就晚了、致命等）
4. 整体调性温和、共情、反焦虑、松弛，避免说教感

## 六、部署

### 站点（Cloudflare Pages）

```bash
# 项目：xiaoguaiguai-nav
npx --yes wrangler@4 pages deploy . --project-name=xiaoguaiguai-nav --branch=main
```

### OAuth 代理 Worker

```bash
cd oauth-proxy
npx --yes wrangler@4 deploy

# 写入加密环境变量（由人工提供 GitHub OAuth App 的 Client ID / Secret）
npx --yes wrangler@4 secret put GITHUB_CLIENT_ID
npx --yes wrangler@4 secret put GITHUB_CLIENT_SECRET
```

路由：`xiaoguaiguai.cn/oauth/*`（绑定主域名，不使用 Worker 自带域名）。

### R2 CORS

```bash
npx --yes wrangler@4 r2 bucket cors set xiaoguaiguai-media --file cors.json
```

允许来源：`https://xiaoguaiguai.cn`

## 七、待人工处理项

1. 在 GitHub 创建 OAuth App（Homepage `https://xiaoguaiguai.cn`，Callback `https://xiaoguaiguai.cn/oauth/callback`，scope `repo`），把 Client ID / Secret 写入 Worker 环境变量
2. 上传配图到 R2 并回填 `cover` 字段（清单见 `_deliverables/R2配图需求清单.md`）
3. 人工核验所有第三方外链的可用性与内容合规性
4. 在 Cloudflare 为 `xiaoguaiguai.cn` 绑定 Pages 自定义域

## 八、许可

本站内容与配置为站点自用。首页 UI 参考开源项目 [liuzi6612/nav](https://github.com/liuzi6612/nav) 的清爽风格重新实现。
