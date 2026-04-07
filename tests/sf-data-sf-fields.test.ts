import { describe, expect, it } from 'vitest';
import {
  isSfG8m3SourceRaw,
  sfG8m3DisplayName,
  summarizeSfG8m3FromSourceRaw,
} from '@/lib/sf-data-sf-fields';

describe('sf-data-sf-fields', () => {
  it('sfG8m3DisplayName prefers DBA then ownership', () => {
    expect(
      sfG8m3DisplayName({
        ownership_name: 'Acme LLC',
        dba_name: 'Tasty Bites',
      }),
    ).toBe('Tasty Bites');
    expect(sfG8m3DisplayName({ ownership_name: 'Solo Owner', dba_name: '' })).toBe('Solo Owner');
    expect(
      sfG8m3DisplayName({
        business_name: 'Legal Corp',
        ownership_name: '',
        dba_name: '',
      }),
    ).toBe('Legal Corp');
  });

  it('isSfG8m3SourceRaw detects DataSF rows', () => {
    expect(isSfG8m3SourceRaw({ uniqueid: 'x-1' })).toBe(true);
    expect(isSfG8m3SourceRaw({ certificate_number: '9' })).toBe(true);
    expect(isSfG8m3SourceRaw({ foo: 1 })).toBe(false);
  });

  it('summarizeSfG8m3FromSourceRaw extracts owner and DBA', () => {
    const s = summarizeSfG8m3FromSourceRaw({
      ownership_name: 'Pham Trang Thi',
      dba_name: 'Trang Pham',
      certificate_number: '1022549',
      uniqueid: '1048100-01-161-1022549',
      full_business_address: '800 Sw Summit Way Unit 98',
      city: 'San Francisco',
      state: 'CA',
      business_zip: '94132',
    });
    expect(s?.ownershipName).toBe('Pham Trang Thi');
    expect(s?.dbaName).toBe('Trang Pham');
    expect(s?.certificateNumber).toBe('1022549');
    expect(s?.cityStateZip).toBe('San Francisco, CA, 94132');
  });
});
