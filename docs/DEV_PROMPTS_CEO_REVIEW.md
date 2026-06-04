# CEO 审阅：dev-prompts 升级路线（2025-06-02）

**模式**：HOLD SCOPE + 增量对齐（不推倒重来）  
**约束**：每一步 `npm test` + `npm run build` 通过；不改动现有 `/api/leads/*`、登录、Cron、API v1 行为。

---

## 现状审计（与 Downloads/dev-prompts.md 的差异）

| dev-prompts 假设 | 本仓库现状 | 建议 |
|------------------|------------|------|
| 新建 `lead_contacts`（phone/email + source_count） | **已有** `lead_contacts`（v2_pro：name/role/phone/email + source 行） | **禁止按 P1 原文建表**；在现有表上扩展或新增 `lead_contact_scores` 视图层 |
| 无 `lead_evidence` | **无** | ✅ 可按 P1 新增（纯增量） |
| 无 owner_entity / store_status 列 | **无** | ✅ `ALTER TABLE leads ADD COLUMN IF NOT EXISTS` |
| P2 skip-trace | 已有 Whitepages `/api/owner/search` + v1 | P2 改为 **adapter 包装现有能力**，再接 BatchData |
| P3 cross-validate | 已有 `source_count`、`owner` 关键词交叉验证 | P3 消费 `lead_evidence`，与现有逻辑并存 |
| P5 identify | 已有 `lib/pipeline/contact-enrich.ts`（OpenCorporates） | P5 扩展 identity adapter，不重复造轮子 |

**API v1**（已上线）：新能力完成后需同步 `docs/COMPANY_API_INTEGRATION.md`，公司侧用 Key 调用，与网页能力一致。

---

## 推荐实施顺序（修订版）

```
P0  只读现状报告（可选，已完成本审阅）
P1a lead_evidence + leads 扩展列（仅 SQL + types，不接路由）  ← 当前第一步
P1b 文档修订：lead_contacts 对齐策略（扩展列 vs 新表）
P2  lib/enrichment skip-trace adapter（mock 单测，不写库）
P3  cross-validate（读 evidence，写 lead_contacts 或新评分列）
P4  property lookup → evidence
P5  identify → 复用 OpenCorporates + SOS 证据
串联 n8n（最后，且 feature flag）
```

---

## 风险与「不影响现网」规则

1. **迁移**：只 `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`；提供 down 脚本；**不在 Vercel 自动执行**（Supabase SQL Editor 手动）。
2. **代码**：新路由默认 **不挂 Cron、不挂 import 管道**，直到单测齐全。
3. **回滚**：任一步失败 → `git revert` + 不在生产执行未验证的 migration。
4. **Feature flag**：`ENABLE_CROSS_VALIDATE=1` 等，默认关。

---

## NOT in scope（本轮不做）

- 任何 outreach / 短信 / 邮件发送
- 替换现有 `lead_contacts` 表结构
- 修改 API v1 鉴权或 Key 轮换（除非公司对接需要）
- BatchData/ATTOM 生产密钥未到位前的真实外呼

---

## 12 个月理想态 vs 本步

| 维度 | 本步（P1a） | 12 个月 |
|------|-------------|---------|
| 证据可追溯 | `lead_evidence` 表就位 | 全管道自动写 evidence |
| 联系方式质量 | 仍用 Whitepages + lead_contacts | 多源打分 + usable/review 阈值 |
| 公司 API | v1 已覆盖读与 AI | v1 暴露 cross-validate / identify |

---

## 审阅结论

**可执行**，但必须 **按修订顺序** 做；P1 原文中的 `lead_contacts` 建表会与 v2_pro **冲突**，必须先改提示词再让 agent 写代码。

下一步（已授权的安全落地）：提交 `docs/DEV_PROMPTS_ROADMAP.md` + `P1a` 迁移与类型，跑通测试与 build。
