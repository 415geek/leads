import { describe, it, expect, afterEach } from 'vitest';
import { parseNycInspectionType } from '@/lib/nyc-opening-intel';
import { buildNycOpeningSignals, nycLabelFromRank } from '@/lib/opening-intel/nyc';
import {
  buildLaOpeningSignals,
  laPassesNewFacilityHeuristic,
} from '@/lib/opening-intel/la';
import { buildHoustonOpeningSignals, houstonIsLikelyNewFromStatus } from '@/lib/opening-intel/houston';
import { scoreOpening } from '@/lib/opening-intel/score-opening';

const NYC_FIXTURES = [
  'Pre-permit (Non-operational) / Initial Inspection',
  'Pre-permit (Non-operational) / Re-inspection',
  'Pre-permit (Operational) / Initial Inspection',
  'Pre-permit (Operational) / Re-inspection',
  'Cycle Inspection / Initial Inspection',
  'Cycle Inspection / Re-inspection',
  'unknown',
] as const;

const HOUSTON_STATUSES = [
  'pre-opening',
  'opening soon',
  'entity registered',
  'health_inspection_facility',
] as const;

describe('opening-intel parity', () => {
  afterEach(() => {
    delete process.env.ENABLE_LEAD_OPENING_INTEL;
  });

  describe('NYC', () => {
    it.each(NYC_FIXTURES)('shared layer matches legacy intel for %s', (inspectionType) => {
      const legacy = parseNycInspectionType(inspectionType);
      const signals = buildNycOpeningSignals(inspectionType);
      const scored = scoreOpening(signals);

      expect(scored.openingLabel).toBe(legacy.new_opening_label);
      expect(scored.openingLabel).toBe(nycLabelFromRank(legacy.priority_rank));
      expect(scored.isLikelyNewStore).toBe(legacy.priority_rank <= 4);
      expect(legacy.is_pre_permit).toBe(
        signals.category === 'pre_permit_non_operational' ||
          signals.category === 'pre_permit_operational',
      );
    });

    it('flag on matches flag off for NYC fixtures', () => {
      for (const inspectionType of NYC_FIXTURES) {
        delete process.env.ENABLE_LEAD_OPENING_INTEL;
        const off = parseNycInspectionType(inspectionType);
        process.env.ENABLE_LEAD_OPENING_INTEL = '1';
        const on = parseNycInspectionType(inspectionType);
        expect(on).toEqual(off);
      }
    });
  });

  describe('LA new-facility heuristic', () => {
    const sinceMs = Date.parse('2026-01-01T00:00:00.000Z');

    const cases = [
      { first: sinceMs + 1, cnt: 3, max: 12, expect: true },
      { first: sinceMs - 1, cnt: 3, max: 12, expect: false },
      { first: sinceMs + 1, cnt: 20, max: 12, expect: false },
      { first: sinceMs + 1, cnt: 12, max: 12, expect: true },
    ] as const;

    it.each(cases)(
      'shared layer matches legacy filter (first=$first cnt=$cnt)',
      ({ first, cnt, max, expect: expected }) => {
        const legacy = laPassesNewFacilityHeuristic({
          firstActivityMs: first,
          sinceMs,
          inspectionRowCount: cnt,
          maxInspectionRowsForNew: max,
        });
        const scored = scoreOpening(
          buildLaOpeningSignals({
            strategy: 'new_facilities',
            firstActivityMs: first,
            sinceMs,
            inspectionRowCount: cnt,
            maxInspectionRowsForNew: max,
          }),
        );
        expect(legacy).toBe(expected);
        expect(scored.isLikelyNewStore).toBe(expected);
      },
    );
  });

  describe('Houston display_status', () => {
    it.each(HOUSTON_STATUSES)('shared layer matches legacy likely-new for %s', (status) => {
      const legacyLikely = houstonIsLikelyNewFromStatus(status);
      const scored = scoreOpening(buildHoustonOpeningSignals(status));
      expect(scored.isLikelyNewStore).toBe(legacyLikely);
      expect(scored.openingLabel).toBe(status);
    });
  });
});
