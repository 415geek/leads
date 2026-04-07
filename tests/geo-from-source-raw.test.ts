import { describe, expect, it } from 'vitest';
import { extractLatLngFromSourceRaw } from '@/lib/geo-from-source-raw';

describe('extractLatLngFromSourceRaw', () => {
  it('parses GeoJSON Point (Socrata location)', () => {
    const raw = {
      business_name: 'Test',
      location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
    };
    expect(extractLatLngFromSourceRaw(raw)).toEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it('parses GeoJSON Point on business_location (Berkeley-style)', () => {
    const raw = {
      dba: 'Cafe',
      business_location: { type: 'Point', coordinates: [-122.2727, 37.8715] },
    };
    expect(extractLatLngFromSourceRaw(raw)).toEqual({ lat: 37.8715, lng: -122.2727 });
  });

  it('parses latitude/longitude fields', () => {
    expect(
      extractLatLngFromSourceRaw({ latitude: 37.5, longitude: -122.2 })
    ).toEqual({ lat: 37.5, lng: -122.2 });
  });

  it('returns null for missing coords', () => {
    expect(extractLatLngFromSourceRaw({ foo: 1 })).toBeNull();
    expect(extractLatLngFromSourceRaw(null)).toBeNull();
  });
});
