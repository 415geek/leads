# Restaurant Leads Finder — AI 复刻用「研发主提示词」

将本文 **全文复制** 给负责搭建项目的 AI，并在文末「用户填写区」填入自己的 API Key 与域名。目标是复刻 **同等功能与数据逻辑** 的「多城政府开放数据餐饮线索 → Supabase → Next.js 仪表盘」系统。

---

## 1. 你的角色与交付物

你是全栈工程师。从零实现一个 **Next.js App Router** 应用，具备：

- **数据层**：Supabase（Postgres）`leads` 主表 + 可选 `lead_enrichment`、`lead_filings`、`lead_classification_log`。
- **采集管道**：按「城市/数据源」从 **Socrata / 政府开放 API** 拉取餐饮相关许可或检查数据，**规范化 →（可选）AI 分类 →（可选）Google Places  enrichment → 评分 → 写入数据库**。
- **仪表盘**：登录保护；列表筛选（地区/城市/状态/搜索/置信度/仅中餐）；地图标记；单条详情（政府原始字段、CA SOS 备案、开发信生成）。
- **自动化**：Vercel Cron 定时全量 ingest；n8n 兼容 `POST /api/leads/upsert`；交互式导入接口避免单次函数超时（单源 + 前端循环）。
- **情报扩展**：DataSF（旧金山）规则层「新开/转手」信号；详情页可选 **Tavily + Claude** 联网情报并缓存到 `ai_classification.opening_intel_web`。

交付：可 `npm run build` 通过的生产级代码、`.env.example`、与下文一致的 **SQL 迁移说明**（Supabase 需手动执行 SQL）。

---

## 2. 产品定义（业务逻辑）

- **用户**：销售团队（如 POS 厂商），找 **新开或易转化的餐厅线索**。
- **线索来源**：优先 **政府开放数据**（食品许可、卫生许可、税务登记等），不是泛泛的 LLC 注册。
- **多城**：每个城市一个或多个 `source_id`（如 `sf_gov`、`nyc_*`），用 **registry 单表注册**，禁止在业务代码里写死 `if (city === 'NYC')`。
- **去重**：
  - 主键：`(source, external_id)` 的 **非 partial** 唯一索引，供 PostgREST `upsert(..., onConflict: 'source,external_id')` 使用。
  - 回落：无 `external_id` 时，用 `(lower(name), lower(coalesce(address,'')), lower(city))` 的 **partial** 唯一索引（`where external_id is null`），应用层查重 + 单条 insert；**不要用 partial 索引做 ON CONFLICT 目标**（PostgREST 会报错）。
- **交互式导入**：默认 **跳过** 批量 AI 分类与 Google Places，防止 Vercel 超时；Cron 全量时可打开 classify + enrich。
- **评分**：综合新鲜度、AI 置信度、是否有电话、是否 enriched 营业中等；**旧金山 DataSF** 可对「新开店标签」加权。

---

## 3. 技术栈（须对齐或等价）

| 层级 | 选型 |
|------|------|
| 框架 | **Next.js 16.x** App Router，TypeScript |
| UI | React 19、Tailwind 4、shadcn/ui 风格组件、sonner toast |
| 地图 | Leaflet + react-leaflet |
| 数据库 | Supabase JS v2，服务端仅用 **service role** 写库 |
| 鉴权 | 自研 **JWT Cookie**（`jose`），环境变量 `AUTH_SECRET`（≥16 字符）、`AUTH_ALLOWED_EMAIL`、`AUTH_PASSWORD` |
| AI | `@anthropic-ai/sdk`：分类与联网情报用 **Haiku**（可配置模型 ID）；开发信用 **Sonnet** 类模型 |
| 校验 | zod（如需要） |
| 测试 | **vitest** + @testing-library/react（按需） |

---

## 4. 环境变量清单（`.env.example`）

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 登录（Cookie JWT）
AUTH_SECRET=
AUTH_ALLOWED_EMAIL=
AUTH_PASSWORD=

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_CLASSIFY_MODEL=   # 可选，默认 claude-haiku-4-5-20251001

# Google Places（enrichment）
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACES_DAILY_CAP=3000

# Socrata（可选，提高政府 API 限额）
SOCRATA_APP_TOKEN=

# Vercel Cron
CRON_SECRET=                # 勿含首尾空白，否则 Vercel 构建可能失败

# n8n / 自动化 upsert
N8N_WEBHOOK_SECRET=

# 应用 URL（邮件/跳转等）
NEXT_PUBLIC_APP_URL=

# 可选：详情页联网搜索
TAVILY_API_KEY=
```

**中间件规则摘要**：

- 未登录：页面重定向 `/login`；`/api/*`（除 `/api/auth/login`、`/api/auth/logout`、带 `x-webhook-secret` 的 **upsert** 与 **filings/sync**、带 `Authorization: Bearer CRON_SECRET` 的 cron）返回 401。
- `POST /api/leads/upsert` 与 `POST /api/leads/filings/sync`：**不**走 Cookie，走 header `x-webhook-secret === N8N_WEBHOOK_SECRET`（upsert 建议另加 IP 速率限制）。

---

## 5. 数据库要点（必须实现的语义）

### 5.1 `leads` 核心列

- `id` UUID PK  
- `name`, `address`, `phone`, `cuisine_type`, `city`, `source`, `license_date`, `license_type`  
- `source_raw` **jsonb**：政府 API 原始行快照；SF 可在其中嵌 `opening_signals`（新开店/转手规则输出）  
- `lead_score` int，`lead_status` enum 文本：`new | contacted | in_progress | converted | not_interested`  
- `outreach_message`, `notes`, `created_at`, `updated_at`  
- 扩展：`external_id`, `metro_area`, `first_seen_at`, `first_inspection_date`, `is_restaurant_confidence`, `ai_classification` jsonb, `ca_entity_number`  
- **唯一索引**：`unique (source, external_id)` — **整表唯一、非 partial**（允许多行 `(source, NULL)` 在 Postgres NULLS DISTINCT 下共存）。  
- **唯一索引**：`unique (lower(name), lower(coalesce(address,'')), lower(city)) where external_id is null`

### 5.2 其它表（按需）

- `lead_enrichment`：`lead_id` PK FK → leads，存 Google Places `place_id`、`business_status`、`formatted_phone`、`google_raw`、`fetched_at`  
- `lead_filings`：`lead_id` → leads，`source` 为 `ca_sos` / `manual`，含 `filing_type`, `filed_date`, `document_url`, `control_id`, `extra`；`(lead_id, control_id)` 非空时唯一  
- `lead_classification_log`：AI 分类审计行

---

## 6. 管道编排（与实现顺序）

实现模块及顺序：

1. **`lib/sources/types.ts`**  
   - `FoodDataSource`：`id`, `metro`, `enabled`, `label`, `lookbackDays?`，`fetch(sinceDate) → NormalizedDraft[]` 或等价异步接口。  
   - `NormalizedDraft`：至少含 `name`, `address`, `city`, `source`, `external_id`, `metro_area`, `license_date`, `cuisine_type`, `phone`, `source_raw`, `lead_status: 'new'` 等。

2. **`lib/sources/registry.ts`**  
   - `SOURCE_REGISTRY` 数组；`enabledSources()`, `getSourceById()`, `sourcesForMetro()`, `sourceIdsForMetro()`。

3. **各城 adapter**（`lib/sources/<city>.ts` + `lib/bay-area-food-import/*` 若拆分）：  
   - 对 **Socrata**：共用 helper（`$where`, `$limit`, `$order`, App Token header）。  
   - **SF DataSF**：资源如 `g8m3-pdis`；拉 active + 近期 closed 行；调用 **规则模块** 写入 `opening_signals`（`new_opening_*`, `transfer_*`, `reason_codes`）；`lookbackDays` 建议 90。

4. **`lib/datasf-opening-intel.ts`**（仅 SF 逻辑可迁移）  
   - 纯函数：地址归一、同址 closed 索引、新开店分、转手匹配、合并信号。  
   - 行参数类型用 **`object`** 再断言为 `Record<string, unknown>`，避免与强类型行结构冲突。

5. **`lib/pipeline/ingest.ts`**  
   - 对选中 sources `Promise.allSettled`；每源独立错误；支持每源 `lookbackDays`。

6. **`lib/pipeline/classify.ts`**  
   - 无 `ANTHROPIC_API_KEY` → 全部 `is_restaurant=true`, `confidence=null`。  
   - 有 Key → 批量 Haiku JSON 数组响应，解析 `is_restaurant`, `confidence`, `cuisine_guess`；低于阈值判非餐厅。

7. **`lib/pipeline/enrich.ts`**  
   - Google Places Text Search；**日调用上限** `GOOGLE_PLACES_DAILY_CAP`；结果写 `lead_enrichment` 或挂在 draft 上；`OPERATIONAL` 影响评分。

8. **`lib/pipeline/score.ts`**  
   - `scoreDraft`：freshness + confidence + phone + enrichment；**sf_gov + opening_signals** 时按 `new_opening_label` 加权。

9. **`lib/pipeline/dedupe.ts`**  
   - 管道内内存去重（同 batch）。

10. **`lib/pipeline/run.ts`**  
    - `runPipeline({ sourceIds?, singleSourceId?, lookbackDays?, skipClassify?, skipEnrich? })`  
    - classify 通过后才有 enrich；`ai_classification` 合并 **datasf_opening**（来自 draft.opening_signals）。

11. **`lib/pipeline/write-leads.ts`**  
    - 写 Supabase：若新列不存在，**捕获列错误并降级只写 legacy 列**，保证部署与迁移空窗期可用。

12. **`lib/scoring.ts`**（旧式 `calculateLeadScore`）供 upsert/简单入库复用。

---

## 7. HTTP API 规格

| 方法 | 路径 | 行为 |
|------|------|------|
| POST | `/api/auth/login` | body: email, password；校验 env 白名单与密码；Set-Cookie JWT |
| POST | `/api/auth/logout` | 清 Cookie |
| GET | `/api/leads` | 分页、筛选：`status`, `city`, `region`（按 `source in (...)` 映射 metro）, `cuisine_type`, `min_score`, `min_confidence`, `chinese_only`, `search`, `sort`, `order` |
| GET | `/api/leads/[id]` | 单条 |
| PATCH | `/api/leads/[id]` | 更新 `lead_status`, `notes`, `outreach_message`, `ca_entity_number` 等 |
| POST | `/api/leads/generate` | body: `lead_id`；Claude 生成开发信；写 `outreach_message` |
| POST | `/api/leads/import` | 见下 |
| POST | `/api/leads/upsert` | header `x-webhook-secret`；body `{ leads: [...] }`；n8n 兼容 |
| POST | `/api/leads/filings/sync` | 见下 **「CA 备案与 n8n」** |
| GET | `/api/leads/[id]/filings` | 登录；返回该 lead 的 `lead_filings` 列表（按 filed_date / created_at 倒序） |
| POST | `/api/leads/[id]/filings` | 登录；body：`{ filings: LeadFilingInput[], mode?: 'append' \| 'replace_ca_sos' }`；默认 append 追加；`replace_ca_sos` 会先删该 lead 下 `source=ca_sos` 再写入（与 sync 行为一致） |
| GET | `/api/leads/map-markers` | 地图点聚合 |
| GET | `/api/cron/ingest-all` | `Authorization: Bearer CRON_SECRET`；`runPipeline` 全 enabled 源 + classify + enrich + upsert；`maxDuration` 300s |
| POST | `/api/leads/[id]/opening-intel` | 登录；Tavily（可选）+ Haiku；合并 `ai_classification.opening_intel_web` |

### CA 州务卿备案（`lead_filings`）与 n8n

- **产品设定**：应用**不**内置爬取 CA SOS 网站；时间线与 PDF 链接由 **n8n**（或人工）抓取后写入。详情页提供 **BizFile 搜索**外链供人工核对。
- **表 `lead_filings`**（见 `schema.sql`）：`lead_id` FK → `leads`，`source` 枚举 `ca_sos | manual`，`filing_type`, `control_id`, `filed_date`, `document_url`, `extra` jsonb；`lead_id + control_id` 非空时唯一去重。
- **`POST /api/leads/filings/sync`**（与 upsert 相同鉴权）  
  - Header：`x-webhook-secret: N8N_WEBHOOK_SECRET`  
  - Body：`{ lead_id: string, filings: LeadFilingInput[] }`，每条至少含 `filing_type`。  
  - 行为：校验 lead 存在后 **`replaceCaSosFilings`**——删除该 lead 下 `source='ca_sos'` 的旧行，再插入新列表（全量替换式同步）。
- **登录用户**在详情页可 **手动追加** 备案：走 `POST /api/leads/[id]/filings`，`mode: 'append'`。
- **实现参考**：`lib/lead-filings.ts`（`leadExists`, `appendFilings`, `replaceCaSosFilings`）；UI：`components/filing-history-panel.tsx`（展开/收起、刷新、BizFile 链接、空状态提示 n8n 调 sync）、`components/source-registration-panel.tsx`（展示 `leads.source_raw` JSON；无数据时提示跑迁移 `source_raw` / `supabase/schema.sql`）。

### `/api/leads/import` 模式

- `POST { "sourceId": "..." }`：单源 pipeline，`skipClassify: true`, `skipEnrich: true`，`writePipelineLeads`。  
- `POST { "metro": "sf_bay" }`：该 metro 下所有 enabled 源（仍可能超时，需控制源数量或同样拆单源）。  
- `POST { "metro": "all" }`：**不执行**全量，只返回 `{ sourceIds: [...] }`，由 **前端 for 循环** 逐个 `sourceId` 请求。  
- `GET ?listSources=1`：返回可导入源列表。

---

## 8. 前端页面

- `/login`：邮箱密码登录。  
- `/`：营销/入口（可简）。  
- `/leads`：表格（名称、地址、菜系、评分、状态、开发信状态、操作）；地区/城市/状态/搜索；**导入**按钮：按 `metro=all` 返回的 `sourceIds` 循环调用 import；进度 toast。  
- `/leads/[id]`：详情、状态/备注/CA 实体编号、**政府登记原始信息**（`source_raw` 面板 + 迁移提示）、**政府备案 CA SOS**（备案时间线、n8n 同步说明、BizFile、手动添加）、开发信生成、**联网情报**（`opening_intel_web`，「AI分析」按钮）。  
- 地图：列表或独立视图拉 `map-markers`。

---

## 9. `vercel.json`

- 为 `app/api/cron/ingest-all/route.ts` 设置 `maxDuration: 300`。  
- 为 `app/api/leads/import/route.ts` 设置 `maxDuration: 120`（或 60，与实现一致）。  
- `crons` 数组若使用：确保 **`CRON_SECRET` 无换行/空格**，否则 Vercel 构建校验失败。

---

## 10. 关键测试用例（最低集）

- `datasf-opening-intel`：active 行、转手时间窗、合并信号。  
- `opening-intel-web`：JSON 解析、合并 `ai_classification`。  
- `schema-migration` / upsert：`(source, external_id)` 唯一索引 **无 partial WHERE**（与 PostgREST 一致）。  
- `import` API：list 模式、单源模式 mock pipeline。  
- classify：无 Key 时透传；有 Key 时 mock Anthropic。

---

## 11. 实现检查清单（交付前自检）

- [ ] 新库执行完整 `schema.sql`（或等价 migration），**手动**在 Supabase SQL Editor 运行。  
- [ ] `upsert` onConflict 与唯一索引定义一致。  
- [ ] 中间件：webhook 与 cron 路径放行正确。  
- [ ] 交互式 import 默认跳过 AI/Places；Cron 打开完整管道。  
- [ ] `.env.example` 与文档一致；生产配置 Vercel 环境变量。  
- [ ] `npm run build` 与 `npm test` 通过。

---

## 12. 用户填写区（复制后在下方填入，勿提交到 Git）

```
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_SECRET=
AUTH_ALLOWED_EMAIL=
AUTH_PASSWORD=
ANTHROPIC_API_KEY=
GOOGLE_PLACES_API_KEY=
N8N_WEBHOOK_SECRET=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=
TAVILY_API_KEY=          # 可选
SOCRATA_APP_TOKEN=       # 可选
```

---

## 13. 参考命名（保持一致便于迁移）

- 站点对外名：**Restaurant Leads Finder**  
- Cookie 名示例：`rlf_session`  
- SF 源 id：`sf_gov`  
- Metro 代码示例：`sf_bay`, `nyc`, `la`, `chicago`, `houston`, `seattle`, `austin`, `boston`

---

*本文档由当前仓库功能与代码结构抽象而成；若接收 AI 无法实现某一外部 API，须明确降级行为（跳过 enrich、跳过联网情报等），并保持管道与 UI 不崩溃。*
