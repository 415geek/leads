import { describe, expect, it } from 'vitest';
import {
  classifyEntityNameKind,
  isLegalEntityCompanyName,
  shouldSearchOpenCorporatesForEntity,
} from '@/lib/identity/entity-kind';

describe('entity-kind', () => {
  it('treats LLC/Inc as company', () => {
    expect(isLegalEntityCompanyName('Pangea Management LLC')).toBe(true);
    expect(classifyEntityNameKind('Original Buffalo Wings Inc.')).toBe('company');
    expect(shouldSearchOpenCorporatesForEntity('Pangea Management LLC')).toBe(true);
  });

  it('treats two-word names as person', () => {
    expect(classifyEntityNameKind('MICHAEL SHAO')).toBe('person');
    expect(shouldSearchOpenCorporatesForEntity('MICHAEL SHAO')).toBe(false);
  });
});
