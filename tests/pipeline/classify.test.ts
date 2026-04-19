/**
 * Classifier 测试 —— 单元测试 + 注入 mock BatchClassifier
 *
 * 覆盖：
 *   - Phase 1 pass-through（无 ANTHROPIC_API_KEY）
 *   - 下游 enrich 的成本闸门：is_restaurant=true 且 confidence>阈值 才保留
 *   - 批内 1 条失败（classifier 返回数组长度不足）降级为 confidence=0
 *   - 金样集 smoke test：验证 fixture 50 条结构完整
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  classifyDrafts,
  defaultClassifier,
  type BatchClassifier,
} from '@/lib/pipeline/classify';
import type { NormalizedDraft } from '@/lib/sources/types';
import goldenSet from './classify-golden-set.json';

function makeDraft(name: string, extra: Partial<NormalizedDraft> = {}): NormalizedDraft {
  return {
    external_id: `ext-${name}`,
    name,
    address: '123 Test St',
    phone: null,
    cuisine_type: 'Restaurant',
    city: 'San Francisco',
    metro_area: 'sf_bay',
    source: 'sf_gov',
    license_date: null,
    first_inspection_date: null,
    license_type: null,
    source_raw: {},
    lead_status: 'new',
    ...extra,
  };
}

describe('classifyDrafts Phase 1 pass-through', () => {
  it('no classifier → all drafts retained as restaurants with null confidence', async () => {
    const drafts = [makeDraft('Golden Dragon'), makeDraft('Some Laundry')];
    const out = await classifyDrafts(drafts);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.is_restaurant === true)).toBe(true);
    expect(out.every((c) => c.confidence === null)).toBe(true);
  });

  it('defaultClassifier returns null when ANTHROPIC_API_KEY is unset', () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(defaultClassifier()).toBeNull();
    if (original) process.env.ANTHROPIC_API_KEY = original;
  });
});

describe('classifyDrafts with mock classifier', () => {
  let mockClassifier: BatchClassifier;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    mockClassifier = { classify: spy as unknown as BatchClassifier['classify'] };
  });

  it('calls classifier once, maps results by index', async () => {
    spy.mockResolvedValue([
      { is_restaurant: true, confidence: 0.95, cuisine_guess: '中餐', raw: { model: 'haiku' } },
      { is_restaurant: false, confidence: 0.1, cuisine_guess: null, raw: { model: 'haiku' } },
    ]);
    const out = await classifyDrafts(
      [makeDraft('Golden Dragon'), makeDraft('Cleaners')],
      { classifier: mockClassifier },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out[0].is_restaurant).toBe(true);
    expect(out[0].confidence).toBe(0.95);
    expect(out[1].is_restaurant).toBe(false);
  });

  it('CRITICAL: low confidence forces is_restaurant=false (cost gate)', async () => {
    // 下游 enrich 只对 is_restaurant=true 的条目调用 Google Places —— 这是成本闸门
    spy.mockResolvedValue([
      { is_restaurant: true, confidence: 0.4, cuisine_guess: null, raw: {} },
      { is_restaurant: true, confidence: 0.85, cuisine_guess: null, raw: {} },
    ]);
    const out = await classifyDrafts(
      [makeDraft('Uncertain Shop'), makeDraft('Clearly Restaurant')],
      { classifier: mockClassifier, minConfidence: 0.6 },
    );
    expect(out[0].is_restaurant).toBe(false); // 置信度不够 → 视为非餐厅
    expect(out[1].is_restaurant).toBe(true);
  });

  it('batch partial failure: missing index → confidence=0 fallback', async () => {
    // classifier 只返回 1 条结果，输入 3 条 —— 后 2 条必须降级，不能丢数据
    spy.mockResolvedValue([
      { is_restaurant: true, confidence: 0.95, cuisine_guess: null, raw: {} },
    ]);
    const out = await classifyDrafts(
      [makeDraft('A'), makeDraft('B'), makeDraft('C')],
      { classifier: mockClassifier },
    );
    expect(out).toHaveLength(3);
    expect(out[0].confidence).toBe(0.95);
    expect(out[1].confidence).toBe(0); // 缺失 → 降级
    expect(out[2].confidence).toBe(0);
    // 降级行 is_restaurant=true 但 confidence<阈值会被上层丢弃
  });

  it('empty drafts returns empty array', async () => {
    spy.mockResolvedValue([]);
    const out = await classifyDrafts([], { classifier: mockClassifier });
    expect(out).toEqual([]);
  });
});

describe('Golden set integrity (classify-golden-set.json)', () => {
  it('fixture contains at least 50 labeled entries', () => {
    expect(Array.isArray(goldenSet)).toBe(true);
    expect(goldenSet.length).toBeGreaterThanOrEqual(50);
  });

  it('each entry has name / expected_is_restaurant / reason fields', () => {
    for (const e of goldenSet as Array<Record<string, unknown>>) {
      expect(typeof e.name).toBe('string');
      expect(typeof e.expected_is_restaurant).toBe('boolean');
      expect(typeof e.reason).toBe('string');
    }
  });

  it('has at least 15 explicit non-restaurant negatives (false positives are the expensive error)', () => {
    const negatives = (goldenSet as Array<{ expected_is_restaurant: boolean }>).filter(
      (e) => !e.expected_is_restaurant,
    );
    expect(negatives.length).toBeGreaterThanOrEqual(15);
  });

  it('has at least 30 restaurant positives', () => {
    const positives = (goldenSet as Array<{ expected_is_restaurant: boolean }>).filter(
      (e) => e.expected_is_restaurant,
    );
    expect(positives.length).toBeGreaterThanOrEqual(30);
  });

  it('golden-set-driven integration with mock classifier (all correct by mock oracle)', async () => {
    // 这个测试验证 harness 工作：给定一个"完美"的 classifier mock，所有 golden set
    // 条目都应被正确分类。真实 Claude 集成测试在 CI 外跑（需 API key），此处不执行。
    const entries = goldenSet as Array<{
      name: string;
      expected_is_restaurant: boolean;
      reason: string;
    }>;
    const drafts = entries.map((e) => makeDraft(e.name));
    const oracleClassifier: BatchClassifier = {
      async classify(inputs) {
        return inputs.map((d) => {
          const match = entries.find((e) => e.name === d.name)!;
          return {
            is_restaurant: match.expected_is_restaurant,
            confidence: 0.95,
            cuisine_guess: null,
            raw: { oracle: true },
          };
        });
      },
    };
    const out = await classifyDrafts(drafts, { classifier: oracleClassifier });
    entries.forEach((e, i) => {
      expect(out[i].is_restaurant).toBe(e.expected_is_restaurant);
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
