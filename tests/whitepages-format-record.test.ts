import { describe, expect, it } from 'vitest';
import { extractPhones, formatAddress, formatOwnerRecord } from '@/lib/whitepages/format-record';

describe('formatAddress', () => {
  it('解析 address 字符串字段', () => {
    expect(formatAddress({ address: '2630 Crestmoor Dr San Bruno, CA 94066' })).toBe(
      '2630 Crestmoor Dr San Bruno, CA 94066',
    );
  });

  it('拼接 street/city/state', () => {
    expect(
      formatAddress({
        street_line_1: '123 Main St',
        city: 'San Francisco',
        state_code: 'CA',
        postal_code: '94102',
      }),
    ).toBe('123 Main St, San Francisco, CA, 94102');
  });
});

describe('extractPhones', () => {
  it('提取号码与类型', () => {
    expect(
      extractPhones({
        phones: [
          { number: '(650) 808-9818', type: 'voip', score: 99 },
          { number: '(415) 555-0100', type: 'mobile' },
        ],
      }),
    ).toEqual([
      { number: '(650) 808-9818', type: 'voip', score: 99 },
      { number: '(415) 555-0100', type: 'mobile', score: undefined },
    ]);
  });
});

describe('formatOwnerRecord', () => {
  it('整理卡片字段', () => {
    const card = formatOwnerRecord({
      id: 'PX3vBNWzjq3',
      name: 'Tony K Lu',
      aliases: ['Anthony K Lu', 'Tong K Lu'],
      match_score: 93,
      company_name: 'Lu Restaurant LLC',
      job_title: 'Owner',
      phones: [{ number: '(650) 808-9818', type: 'voip' }],
      emails: [{ email: 'tony@example.com' }],
      current_addresses: [{ address: '100 Market St, San Francisco, CA' }],
      owned_properties: [{ address: '2630 Crestmoor Dr San Bruno, CA 94066' }],
      linkedin_url: 'https://linkedin.com/in/tony',
      is_dead: false,
    });

    expect(card.name).toBe('Tony K Lu');
    expect(card.matchScore).toBe(93);
    expect(card.aliases).toEqual(['Anthony K Lu', 'Tong K Lu']);
    expect(card.companyName).toBe('Lu Restaurant LLC');
    expect(card.phones[0]?.number).toBe('(650) 808-9818');
    expect(card.emails).toEqual(['tony@example.com']);
    expect(card.currentAddresses[0]).toContain('Market St');
    expect(card.ownedProperties[0]).toContain('Crestmoor');
    expect(card.linkedinUrl).toContain('linkedin.com');
  });
});
