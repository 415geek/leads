import { describe, it, expect, afterEach } from 'vitest';
import {
  buildNycInspectionWhere,
  dedupeNycRowsByCamis,
  parseNycInspectionType,
} from '@/lib/nyc-opening-intel';

describe('nyc-opening-intel', () => {
  afterEach(() => {
    delete process.env.NYC_INCLUDE_CYCLE_INSPECTIONS;
  });

  describe('parseNycInspectionType', () => {
    it('ranks Pre-permit Non-operational Initial highest', () => {
      const intel = parseNycInspectionType(
        'Pre-permit (Non-operational) / Initial Inspection',
      );
      expect(intel.priority_rank).toBe(1);
      expect(intel.new_opening_label).toBe('confirmed_new_opening');
      expect(intel.is_pre_permit).toBe(true);
      expect(intel.lead_value).toBe('high');
    });

    it('ranks Pre-permit Non-operational Re-inspection second', () => {
      const intel = parseNycInspectionType(
        'Pre-permit (Non-operational) / Re-inspection',
      );
      expect(intel.priority_rank).toBe(2);
      expect(intel.new_opening_label).toBe('likely_new_opening');
    });

    it('ranks Pre-permit Operational Initial third', () => {
      const intel = parseNycInspectionType(
        'Pre-permit (Operational) / Initial Inspection',
      );
      expect(intel.priority_rank).toBe(3);
      expect(intel.new_opening_label).toBe('likely_new_opening');
    });

    it('treats Cycle Inspection as weak signal', () => {
      const intel = parseNycInspectionType('Cycle Inspection / Initial Inspection');
      expect(intel.priority_rank).toBe(5);
      expect(intel.new_opening_label).toBe('weak_signal');
      expect(intel.is_pre_permit).toBe(false);
    });
  });

  describe('buildNycInspectionWhere', () => {
    it('defaults to Pre-permit filter with cuisine', () => {
      const w = buildNycInspectionWhere('2026-01-01', false);
      expect(w).toContain("inspection_date >= '2026-01-01T00:00:00'");
      expect(w).toContain("inspection_type like 'Pre-permit%'");
      expect(w).toContain('cuisine_description IS NOT NULL');
    });

    it('includes cycle when flag enabled', () => {
      const w = buildNycInspectionWhere('2026-01-01', true);
      expect(w).not.toContain('Pre-permit');
    });
  });

  describe('dedupeNycRowsByCamis', () => {
    it('keeps higher-priority inspection type per camis', () => {
      const rows = dedupeNycRowsByCamis([
        {
          camis: '99',
          inspection_type: 'Cycle Inspection / Initial Inspection',
          inspection_date: '2026-03-20',
          dba: 'A',
          cuisine_description: 'Pizza',
        },
        {
          camis: '99',
          inspection_type: 'Pre-permit (Non-operational) / Initial Inspection',
          inspection_date: '2026-03-01',
          dba: 'A',
          cuisine_description: 'Pizza',
        },
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].inspection_type).toContain('Pre-permit (Non-operational)');
    });

    it('prefers newer date when priority ties', () => {
      const rows = dedupeNycRowsByCamis([
        {
          camis: '88',
          inspection_type: 'Pre-permit (Operational) / Initial Inspection',
          inspection_date: '2026-03-01',
        },
        {
          camis: '88',
          inspection_type: 'Pre-permit (Operational) / Initial Inspection',
          inspection_date: '2026-03-15',
        },
      ]);
      expect(rows).toHaveLength(1);
      expect(String(rows[0].inspection_date)).toContain('2026-03-15');
    });
  });
});
