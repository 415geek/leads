import { describe, expect, it } from 'vitest';
import { pickPrimaryOfficer } from '@/lib/opencorporates/officers';

describe('pickPrimaryOfficer', () => {
  it('prefers CEO over CFO and agent', () => {
    const chosen = pickPrimaryOfficer([
      { name: 'JINZHUO HUANG', position: 'chief financial officer' },
      { name: 'QITING LEI', position: 'chief executive officer' },
      { name: 'LIMEI HUANG', position: 'secretary (inactive)' },
    ]);
    expect(chosen?.name).toBe('QITING LEI');
  });
});
