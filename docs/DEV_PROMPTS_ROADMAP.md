# Restaurant Leads Finder — 研发提示词库（仓库修订版）

> 源文件：`~/Downloads/dev-prompts.md`（2025-06-02 同步）  
> **CEO 审阅**：见 [DEV_PROMPTS_CEO_REVIEW.md](./DEV_PROMPTS_CEO_REVIEW.md)  
> **硬约束**：每一步 `npm test` + `npm run build`；**不破坏**现有 ingest、仪表盘、登录、Cron、n8n、`/api/v1/*`。

---

## ⚠️ P1 必读修订（与本仓库冲突）

Downloads 版 P1 要求新建 `lead_contacts(phone/email + source_count)`，但本仓库 **已有** `lead_contacts`（`supabase/migrations/20260509120000_v2_pro.sql`：`name/role/phone/email` + `confidence` 0..1）。

| 原计划 | 本仓库做法 |
|--------|------------|
| 新建 `lead_contacts` | ❌ 禁止；沿用 v2_pro，P3 再扩展评分列或辅助表 |
| 新建 `lead_evidence` | ✅ `supabase/migrations/20260602000000_lead_evidence.sql`（P1a 已入库） |
| leads 扩展列 | ✅ 同上迁移 + `types/lead-evidence.ts` |

**P1a 状态**：迁移与类型已入库；**生产库需手动**在 Supabase SQL Editor 执行 up SQL。未执行前应用行为不变（新列未读未写）。

**P2 状态**：`lib/enrichment/*`（BatchData + mock 工厂 + 单测），不写库。

**P3 状态**：`lib/scoring/score-contact.ts`、`POST /api/leads/cross-validate`（`ENABLE_LEAD_EVIDENCE_CROSS_VALIDATE=1` 才启用，默认 503）。

---

## 使用说明

1. 顺序：`P1a(已完成迁移文件) → P2 → P3 → P4 → P5`；前一步测试不过不进下一步。
2. 外部数据一律 **adapter + 工厂**（见 AGENTS.md 补充）。
3. **禁止** outreach / 发送逻辑。
4. 新 HTTP 能力上线后同步 **`docs/COMPANY_API_INTEGRATION.md`** 与 `/api/v1/*`（若对外暴露）。

---

## 已有能力（复用，勿重复造轮子）

- **老板搜索**：`POST /api/owner/search`、`/api/v1/owner/search`（Whitepages + 关键词交叉验证）
- **联系人 enrichment**：`lib/pipeline/contact-enrich.ts` → `lead_contacts`
- **政府备案门户**：`lib/filing-portal-config.ts`
- **公司 API**：`docs/API_V1.md`

P2 skip-trace 应包装/扩展上述能力，而非平行实现。

---

## P0 ·（可选）现状报告

（与源文件相同，略）

---

## P1 · 修订版（P1a 迁移 + P1b 文档）

**P1a** — 见 `supabase/migrations/20260602000000_lead_evidence.sql` + `types/lead-evidence.ts`。

**P1b** — 设计 `lead_contacts` 与 P3 `scoreContact` 的映射（多源命中 → 更新 `confidence` 或新表 `lead_contact_channels`），单独 PR。

---

## P2–P5 · 与源文件一致

完整原文见用户 Downloads 中的 `dev-prompts.md`；执行前对照 [CEO 审阅](./DEV_PROMPTS_CEO_REVIEW.md) 中的「NOT in scope」与 adapter 要求。

---

## 串联（全部完成后）

```
n8n: upsert → identify → property/lookup → enrich(skip-trace) → cross-validate
```

需 `ENABLE_EVIDENCE_PIPELINE=1` 类 feature flag，默认关闭直至 staging 验证。
