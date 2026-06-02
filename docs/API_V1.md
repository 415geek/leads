# Restaurant Leads Finder — API v1

面向公司内网 / 第三方系统接入，能力与网页版（登录后）一致：线索列表、详情、政府备案、地图、老板搜索、AI 开发信与联网情报等。

## 鉴权

在 Vercel 或 `.env.local` 配置：

```bash
API_V1_KEY=your-long-random-secret-at-least-32-chars
# 或多个 Key（逗号分隔）
# API_V1_KEYS=key-for-crm,key-for-etl
```

请求头（二选一）：

- `Authorization: Bearer <API_V1_KEY>`
- `X-API-Key: <API_V1_KEY>`

`/api/v1/*` 不走浏览器 Session；未配置 `API_V1_KEY` 时返回 `503`。

## 基础 URL

生产：`https://leads.maxwelllai.com/api/v1`

所有成功响应 JSON 均含 `"api_version": "v1"`。

## 端点一览

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/health` | 健康检查 | read |
| GET | `/regions` | 地区下拉（与网页一致） | read |
| GET | `/leads` | 线索列表（分页+筛选） | read |
| GET | `/leads/:id` | 线索详情 + 州备案门户 + 链接 | read |
| PATCH | `/leads/:id` | 更新 status/notes 等 | write |
| GET | `/leads/:id/filings` | 政府备案时间线 | read |
| POST | `/leads/:id/filings` | 追加/替换 CA SOS 备案 | write |
| POST | `/leads/:id/opening-intel` | 刷新联网开业情报 | write |
| POST | `/leads/generate` | 生成 AI 开发信 | write |
| GET | `/cities` | 城市筛选列表 | read |
| GET | `/map-markers` | 地图标点 | read |
| POST | `/owner/search` | 老板信息（Whitepages + 可选 AI 交叉验证） | write |
| POST | `/pdl/search` | People Data Labs 人员搜索 | write |

### GET `/leads` 查询参数

与网页 `/leads` 列表相同：

- `page`, `limit`（最大 100）
- `region` — `sf_bay`, `houston`, `nyc`, `all` 等
- `city`, `status`, `cuisine_type`, `search`
- `min_score`, `min_confidence`
- `chinese_only`, `hide_chains` — `1` 或 `true`
- `date_from`, `date_to` — ISO 日期
- `sort`, `order` — 默认 `lead_score` desc

### GET `/leads/:id` 额外字段

```json
{
  "api_version": "v1",
  "lead": { "...": "..." },
  "filing_portal": {
    "stateCode": "TX",
    "panelTitle": "...",
    "searchUrl": "https://direct.sos.state.tx.us/",
    "clipboardOnOpen": true
  },
  "links": {
    "detail_path": "/leads/uuid",
    "dashboard_business_search_path": "/?biz=...",
    "filing_portal_search_url": "https://..."
  }
}
```

对接方可用 `links` 拼完整 URL：`https://leads.maxwelllai.com` + `detail_path`。

## 示例

```bash
export BASE=https://leads.maxwelllai.com
export KEY=your-api-v1-key

curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/leads?region=houston&limit=5" | jq .

curl -s -H "Authorization: Bearer $KEY" \
  "$BASE/api/v1/leads/LEAD_UUID" | jq .

curl -s -X POST -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"LEAD_UUID"}' \
  "$BASE/api/v1/leads/generate" | jq .
```

## 暂未纳入 v1 的能力（仍用原路径）

| 能力 | 路径 | 鉴权 |
|------|------|------|
| 批量数据源导入 | `POST /api/leads/import` | 浏览器 Session |
| HubSpot 导出 | `POST /api/leads/export/hubspot` | Session |
| PDL 深度人物情报 | `POST /api/pdl/deep-search` | Session |
| n8n 线索入库 | `POST /api/leads/upsert` | `x-webhook-secret` |
| 定时 ingest | `GET /api/cron/ingest-all` | `CRON_SECRET` |

如需上述也走 API Key，可再加 `/api/v1/import` 等（第二批）。

## 与现有 `/api/leads` 的关系

- 网页仍用 Session + `/api/leads/*`
- 自动化 / 公司系统用 `/api/v1/*` + API Key
- n8n 入库仍用 `/api/leads/upsert` + `x-webhook-secret`（未改）
- Cron 仍用 `/api/cron/*` + `CRON_SECRET`

## 私有化部署

交付时在公司环境设置：

- `API_V1_KEY` — 发给对接方的 Key
- `ANTHROPIC_API_KEY` — 公司 AI 账号
- `WHITEPAGES_PRO_API_KEY`、`PEOPLE_DATA_LABS_API_KEY` — 按需
- 其余 Supabase / 数据源变量与现网相同

对接方 Base URL 改为公司域名即可。
