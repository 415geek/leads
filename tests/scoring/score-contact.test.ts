import { describe, it, expect } from 'vitest';
import { scoreContactChannels, scoreNewStoreFromEvidence } from '@/lib/scoring/score-contact';
import { CONTACT_SCORE_CONFIG } from '@/lib/scoring/contact-score-config';

describe('scoreContactChannels', () => {
  it('single weak source scores below usable threshold', () => {
    const scored = scoreContactChannels([
      { field: 'phone', value: '5551112222', source: 'batchdata', confidence_raw: 0.5, raw_payload: null },
    ]);
    expect(scored[0].sourceCount).toBe(1);
    expect(scored[0].confidence).toBeLessThan(CONTACT_SCORE_CONFIG.thresholds.usable);
    expect(['review', 'discarded']).toContain(scored[0].status);
  });

  it('multiple sources push to usable', () => {
    const scored = scoreContactChannels([
      { field: 'phone', value: '5551112222', source: 'batchdata', confidence_raw: 0.9, raw_payload: { type: 'mobile', isMobile: true } },
      { field: 'phone', value: '(555) 111-2222', source: 'whitepages', confidence_raw: 0.85, raw_payload: { type: 'mobile' } },
      { field: 'phone', value: '5551112222', source: 'manual', confidence_raw: 0.7, raw_payload: null },
    ]);
    expect(scored[0].sourceCount).toBe(3);
    expect(scored[0].status).toBe('usable');
    expect(scored[0].confidence).toBeGreaterThanOrEqual(CONTACT_SCORE_CONFIG.thresholds.usable);
  });

  it('owner locked bonus increases score', () => {
    const base = scoreContactChannels([
      { field: 'email', value: 'a@b.com', source: 'batchdata', confidence_raw: 0.8, raw_payload: null },
      { field: 'email', value: 'a@b.com', source: 'ca_sos', confidence_raw: 0.8, raw_payload: null },
    ]);
    const boosted = scoreContactChannels(
      [
        { field: 'email', value: 'a@b.com', source: 'batchdata', confidence_raw: 0.8, raw_payload: null },
        { field: 'email', value: 'a@b.com', source: 'ca_sos', confidence_raw: 0.8, raw_payload: null },
      ],
      { ownerPersonLocked: true },
    );
    expect(boosted[0].confidence).toBeGreaterThan(base[0].confidence);
  });

  it('low score is discarded', () => {
    const scored = scoreContactChannels([
      { field: 'phone', value: '1', source: 'manual', confidence_raw: 0.1, raw_payload: null },
    ]);
    expect(scored[0].status).toBe('discarded');
  });

  it('ignores non phone/email fields', () => {
    const scored = scoreContactChannels([
      { field: 'owner_name', value: 'Jane', source: 'ca_sos', confidence_raw: 1, raw_payload: null },
    ]);
    expect(scored).toHaveLength(0);
  });
});

describe('scoreNewStoreFromEvidence', () => {
  it('votes new when majority true', () => {
    const s = scoreNewStoreFromEvidence([
      { field: 'is_new_store', value: 'true', source: 'attom', confidence_raw: null, raw_payload: null },
      { field: 'is_new_store', value: 'yes', source: 'abc', confidence_raw: null, raw_payload: null },
    ]);
    expect(s.storeStatus).toBe('new');
    expect(s.confidence).toBeGreaterThan(50);
  });
});
