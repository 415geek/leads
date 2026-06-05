import { describe, it, expect } from 'vitest';
import {
  ownerEntitiesReferToSameBusiness,
  resolveOwnerPerson,
} from '@/lib/identity/resolve-owner-person';

describe('resolveOwnerPerson', () => {
  it('does not confirm on a single source', () => {
    const result = resolveOwnerPerson([
      { source: 'opencorporates', personName: 'Jane Doe' },
    ]);
    expect(result.status).toBe('review');
    expect(result.person).toBe('Jane Doe');
    expect(result.evidence.agreeingSources).toEqual(['opencorporates']);
  });

  it('confirms when two independent sources agree', () => {
    const result = resolveOwnerPerson([
      { source: 'opencorporates', personName: 'Jane Doe' },
      { source: 'license_snapshot', personName: 'JANE DOE' },
    ]);
    expect(result.status).toBe('confirmed');
    expect(result.person).toBe('Jane Doe');
    expect(result.evidence.agreeingSources.sort()).toEqual(
      ['license_snapshot', 'opencorporates'].sort(),
    );
  });

  it('treats Golden Dragon LLC and golden dragon, llc as the same entity', () => {
    expect(ownerEntitiesReferToSameBusiness('Golden Dragon LLC', 'golden dragon, llc')).toBe(true);
  });

  it('enters review when sources disagree on person name', () => {
    const result = resolveOwnerPerson([
      { source: 'opencorporates', personName: 'Alice Smith' },
      { source: 'license_snapshot', personName: 'Bob Jones' },
    ]);
    expect(result.status).toBe('review');
    expect(result.evidence.disagreeing).toHaveLength(1);
    expect(result.evidence.disagreeing[0]?.personName).toBe('Bob Jones');
  });
});
