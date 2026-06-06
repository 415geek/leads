import { describe, it, expect } from 'vitest';
import {
  buildOwnerSearchDefaultsFromLead,
  parseStateFromAddress,
} from '@/lib/lead-owner-search-defaults';

describe('lead-owner-search-defaults', () => {
  it('prefills from lead fields and source_raw owner_name', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Lu\'s Kitchen',
      address: '2406 19th Ave, San Francisco, CA 94116',
      city: 'San Francisco',
      source_raw: { owner_name: 'Tony Lu', dba: 'Lu\'s Kitchen' },
    });
    expect(v.name).toBe('Tony Lu');
    expect(v.region).toBe('San Francisco, CA');
    expect(v.address).toContain('19th Ave');
    expect(v.keywords).toBe('Lu\'s Kitchen');
  });

  it('maps DataSF ownership_name to entityName, not Whitepages name', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Dumpling Patio',
      address: '2499 Lombard St',
      city: 'San Francisco',
      source_raw: {
        ownership_name: 'Original Buffalo Wings Inc.',
        dba_name: 'Dumpling Patio',
      },
    });
    expect(v.name).toBe('');
    expect(v.entityName).toBe('Original Buffalo Wings Inc.');
    expect(v.keywords).toBe('Dumpling Patio');
  });

  it('passes ca_entity_number for CA SOS direct lookup', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Test LLC Cafe',
      address: '1 Market St, San Francisco, CA',
      city: 'San Francisco',
      ca_entity_number: '202150010654',
      source_raw: { ownership_name: 'Test LLC' },
    });
    expect(v.caEntityNumber).toBe('202150010654');
  });

  it('prefills Whitepages name from owner_person_name after identify', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Dumpling Patio',
      address: '2499 Lombard St',
      city: 'San Francisco',
      owner_person_name: 'JINZHUO HUANG',
      owner_entity_name: 'Original Buffalo Wings Inc.',
      source_raw: null,
    });
    expect(v.name).toBe('JINZHUO HUANG');
    expect(v.entityName).toBe('Original Buffalo Wings Inc.');
  });

  it('uses city alone when address has no state suffix', () => {
    const v = buildOwnerSearchDefaultsFromLead({
      name: 'Test Cafe',
      address: '123 Main St',
      city: 'Duarte',
      source_raw: null,
    });
    expect(v.name).toBe('');
    expect(v.region).toBe('Duarte');
    expect(v.keywords).toBe('Test Cafe');
  });

  it('parseStateFromAddress extracts US state', () => {
    expect(parseStateFromAddress('2229 HUNTINGTON DR, DUARTE, CA 91010')).toBe('CA');
  });
});
