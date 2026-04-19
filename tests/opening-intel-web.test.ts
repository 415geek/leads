import { describe, expect, it } from 'vitest';
import {
  mergeAiClassificationOpeningWeb,
  parseOpeningIntelJsonObject,
} from '@/lib/opening-intel-web';

describe('opening-intel-web', () => {
  it('parseOpeningIntelJsonObject handles raw JSON object', () => {
    const j = parseOpeningIntelJsonObject(
      '{"new_opening_confidence": 60, "transfer_confidence": 55, "summary_zh": "测试", "rationale_zh": "因"}',
    );
    expect(j?.new_opening_confidence).toBe(60);
    expect(j?.transfer_confidence).toBe(55);
  });

  it('parseOpeningIntelJsonObject handles fenced markdown', () => {
    const j = parseOpeningIntelJsonObject(
      'Here:\n```json\n{"new_opening_confidence": 70, "transfer_confidence": 40, "summary_zh": "x", "rationale_zh": "y"}\n```',
    );
    expect(j?.new_opening_confidence).toBe(70);
  });

  it('mergeAiClassificationOpeningWeb preserves datasf_opening', () => {
    const merged = mergeAiClassificationOpeningWeb(
      { datasf_opening: { x: 1 }, foo: 'bar' },
      {
        updated_at: '2026-01-01T00:00:00.000Z',
        model: 'test',
        new_opening_confidence: 50,
        transfer_confidence: 50,
        summary_zh: 's',
        rationale_zh: 'r',
        search_snippets_used: 0,
        evidence: [],
      },
    );
    expect(merged.foo).toBe('bar');
    expect((merged.datasf_opening as { x: number }).x).toBe(1);
    expect(merged.opening_intel_web).toBeDefined();
    expect((merged.opening_intel_web as { summary_zh: string }).summary_zh).toBe('s');
  });

  it('mergeAiClassificationOpeningWeb replaces prior opening_intel_web', () => {
    const merged = mergeAiClassificationOpeningWeb(
      {
        opening_intel_web: { summary_zh: 'old' },
      },
      {
        updated_at: '2026-02-01T00:00:00.000Z',
        model: 'test',
        new_opening_confidence: 1,
        transfer_confidence: 2,
        summary_zh: 'new',
        rationale_zh: '',
        search_snippets_used: 0,
        evidence: [],
      },
    );
    expect((merged.opening_intel_web as { summary_zh: string }).summary_zh).toBe('new');
  });
});
