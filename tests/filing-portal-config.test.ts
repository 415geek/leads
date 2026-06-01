import { describe, expect, it } from 'vitest';
import {
  formatFiledDateForPortal,
  resolveFilingPortalConfig,
} from '@/lib/filing-portal-config';

describe('resolveFilingPortalConfig', () => {
  it('maps Houston metro to TX SOSDirect', () => {
    const cfg = resolveFilingPortalConfig({
      metro_area: 'houston',
      source: 'houston_permit_portal',
      address: '123 Main St, Houston, TX 77036',
    });
    expect(cfg.stateCode).toBe('TX');
    expect(cfg.panelTitle).toContain('Texas');
    expect(cfg.searchUrl).toContain('sos.state.tx.us');
    expect(cfg.showEntityField).toBe(false);
  });

  it('maps SF Bay to CA BizFile', () => {
    const cfg = resolveFilingPortalConfig({
      metro_area: 'sf_bay',
      source: 'sf_datasf',
    });
    expect(cfg.stateCode).toBe('CA');
    expect(cfg.searchUrl).toContain('bizfileonline.sos.ca.gov');
    expect(cfg.showEntityField).toBe(true);
  });

  it('infers TX from houston_* source when metro missing', () => {
    const cfg = resolveFilingPortalConfig({
      source: 'houston_permit_ereport',
      address: '77036',
    });
    expect(cfg.stateCode).toBe('TX');
  });

  it('infers state from address when metro and source unknown', () => {
    const cfg = resolveFilingPortalConfig({
      address: '500 W Madison St, Chicago, IL 60661',
    });
    expect(cfg.stateCode).toBe('IL');
    expect(cfg.searchUrl).toContain('ilsos.gov');
  });

  it('falls back to generic panel for unknown jurisdiction', () => {
    const cfg = resolveFilingPortalConfig({ city: 'Nowhere' });
    expect(cfg.stateCode).toBe('US');
    expect(cfg.searchUrl).toBeNull();
  });
});

describe('formatFiledDateForPortal', () => {
  it('formats date in portal timezone', () => {
    const s = formatFiledDateForPortal('2025-11-21', 'America/Chicago');
    expect(s).toMatch(/11\/21\/2025/);
  });
});
