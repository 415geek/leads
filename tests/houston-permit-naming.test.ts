import { describe, it, expect } from 'vitest';
import {
  buildPermitLeadDisplayName,
  inferHoustonPermitCuisineLabel,
  isHoustonPermitWorkDescription,
  resolveHoustonPermitLeadName,
} from '@/lib/houston-permit-naming';

describe('houston-permit-naming', () => {
  it('detects permit work descriptions from eReport Comments', () => {
    expect(isHoustonPermitWorkDescription('RESTAURANT REMODEL 1-1-2-A2-B \'21 IBC')).toBe(true);
    expect(isHoustonPermitWorkDescription('1,000 SF')).toBe(true);
    expect(isHoustonPermitWorkDescription('1,000 SF. LOUNGE REMODEL 1-1-5-A2-B')).toBe(true);
    expect(isHoustonPermitWorkDescription('Dragon Noodle Kitchen')).toBe(false);
  });

  it('uses address for eReport-style rows instead of remodel text', () => {
    expect(
      resolveHoustonPermitLeadName({
        candidateName: 'RESTAURANT REMODEL/ADDITION 1-1-2-A2-B \'21 IBC',
        comments: 'RESTAURANT REMODEL/ADDITION 1-1-2-A2-B \'21 IBC',
        address: '2704 NAVIGATION BLVD',
        projectNo: '25022330',
      }),
    ).toBe('New food service · 2704 NAVIGATION BLVD');

    expect(
      resolveHoustonPermitLeadName({
        candidateName: '1,000 SF',
        comments: '1,000 SF. LOUNGE REMODEL 1-1-5-A2-B FOR OCC RPT# 24122313',
        address: '4806 ALMEDA RD',
        projectNo: '25030458',
      }),
    ).toBe('New food service · 4806 ALMEDA RD');
  });

  it('keeps real business names', () => {
    expect(
      resolveHoustonPermitLeadName({
        candidateName: 'Lu\'s Kitchen',
        comments: '',
        address: '2406 19th Ave',
      }),
    ).toBe('Lu\'s Kitchen');
  });

  it('infers cuisine label from comments not permit boilerplate', () => {
    expect(
      inferHoustonPermitCuisineLabel(
        '1,000 SF. LOUNGE REMODEL 1-1-5-A2-B',
        'Building Pmt',
      ),
    ).toBe('酒吧/饮品 · Houston 许可');

    expect(
      inferHoustonPermitCuisineLabel(
        'RESTAURANT REMODEL 1-1-2-A2-B \'21 IBC',
        'Building Pmt',
      ),
    ).toBe('餐饮 · Houston 许可');
  });

  it('buildPermitLeadDisplayName falls back to project number', () => {
    expect(buildPermitLeadDisplayName({ address: null, projectNo: '25022330' })).toBe(
      'Houston permit 25022330',
    );
  });
});
