/**
 * 数据源注册表的统一类型
 *
 * 新加一个城市 = 新增一个 adapter 文件 + 在 registry.ts 注册。
 * 所有下游（UI 过滤、导入 API、cron、评分）都从 registry 读配置，不允许 if/else 硬编码。
 */

import type { LeadSourceRaw } from '@/types/lead';
import type { DatasfOpeningSignals } from '@/lib/datasf-opening-intel';
import type { HoustonOpeningIntel } from '@/lib/houston-opening-intel';
import type { NycOpeningIntel } from '@/lib/nyc-opening-intel';

/** 都会区代码；和 leads.metro_area 列一一对应 */
export type MetroArea =
  | 'sf_bay'
  | 'la'
  | 'nyc'
  | 'chicago'
  | 'houston'
  | 'seattle'
  | 'austin'
  | 'boston'
  // New metros added in V2 Pro (gated on data-availability spike)
  | 'las_vegas'
  | 'miami'
  | 'dallas'
  | 'phoenix'
  | 'denver'
  | 'atlanta';

/** 数据源类型：影响 first_inspection_date 推断逻辑 */
export type SourceKind = 'permit' | 'inspection' | 'registration';

/** 来源数据经 normalize 后的统一 schema（不含 lead_score；score 由 pipeline 层统一计算） */
export interface NormalizedDraft {
  /** 来源内业务唯一键（facility_id / camis / license_no …），与 source 组成跨城唯一键 */
  external_id: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  /** 来源提供的原始业态/菜系文本（未经 AI 分类） */
  cuisine_type: string;
  city: string;
  metro_area: MetroArea;
  source: string;
  /** permit/registration 的登记日期；inspection 源按 (external_id) 取最早检查日 */
  license_date: string | null;
  first_inspection_date: string | null;
  license_type: string | null;
  source_raw: LeadSourceRaw;
  lead_status: 'new';
  /** DataSF 新开店/转手推断（仅 sf_gov 等有值） */
  opening_signals?: DatasfOpeningSignals;
  /** 休斯顿多源：DBA / TX SOS /（未来）食品许可 —— 写入 ai_classification.houston_opening */
  houston_opening?: HoustonOpeningIntel;
  /** NYC DOHMH inspection_type 推断 —— 写入 ai_classification.nyc_opening */
  nyc_opening?: NycOpeningIntel;
}

/** 单个数据源的拉取结果（run 摘要用） */
export interface SourceFetchResult {
  id: string;
  label: string;
  ok: boolean;
  fetched: number;
  error?: string;
  /** 非致命提示（如数据源在门户侧长期未更新） */
  warning?: string;
}

export interface FetchOptions {
  /** ISO 日期（YYYY-MM-DD）；permit/registration 类用作 since 过滤；inspection 类可忽略 */
  sinceDate: string;
  /** 单次上限；adapter 可以取 min(limit, adapter 自己的 cap) */
  limit?: number;
}

/**
 * 数据源 adapter 接口
 *
 * 两种实现模式：
 *   A) fetchAndNormalize(opts) → { result, drafts }  —— 一步到位（现有 SF/Houston 代码就是这种）
 *   B) fetch(opts) + normalize(row)  —— 拆开；便于单元测试
 *
 * registry 只要求暴露 fetchAndNormalize；B 模式的 adapter 可以内部自己 fetch+normalize。
 */
export interface FoodDataSource {
  /** 稳定字符串 ID，存进 leads.source 列；新增后不改（有数据依赖） */
  readonly id: string;
  /** 人类可读标签（UI / toast / 日志用） */
  readonly label: string;
  readonly metro: MetroArea;
  readonly state: string;
  readonly kind: SourceKind;
  /** 门户 URL，UI 可链接 */
  readonly portalUrl: string;
  /** 限流声明；ingest 层按此做并发 throttle */
  readonly rateLimit: { rps: number; dailyCap?: number };
  /** 灰度开关：false 时 cron / UI 导入跳过（用于 Phase 3 按城市上线） */
  readonly enabled: boolean;
  /**
   * 覆盖 pipeline 默认 lookback；DataSF 新开店窗口建议 90 天（文档默认）
   */
  readonly lookbackDays?: number;

  /** 拉取 + 规整为 NormalizedDraft[]；不负责 score / classify / enrich */
  fetchAndNormalize(opts: FetchOptions): Promise<{
    result: SourceFetchResult;
    drafts: NormalizedDraft[];
  }>;
}

/** 都会区内含的城市白名单（UI 二级下拉用）；metro_area 是主过滤键 */
export interface MetroConfig {
  id: MetroArea;
  label: string;
  shortLabel: string;
  /** 下拉里的城市选项；留空表示"全美洲/跨市"，不做二级过滤 */
  cities: readonly string[];
  openDataUrl: string;
}
