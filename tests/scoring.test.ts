import { describe, it, expect } from 'vitest';
import { calculateLeadScore, getScoreColor, getScoreLabel } from '@/lib/scoring';

describe('calculateLeadScore', () => {
  const today = new Date();
  
  function daysAgo(days: number): string {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  it('should give 40 points for license within 7 days', () => {
    const lead = {
      license_date: daysAgo(5),
      cuisine_type: null,
      city: 'Other',
      phone: null,
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(40 + 5); // 40 for date + 5 for other city
  });

  it('should give 35 points for license within 14 days', () => {
    const lead = {
      license_date: daysAgo(10),
      cuisine_type: null,
      city: 'Other',
      phone: null,
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(35 + 5);
  });

  it('should give 30 points for license within 30 days', () => {
    const lead = {
      license_date: daysAgo(25),
      cuisine_type: null,
      city: 'Other',
      phone: null,
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(30 + 5);
  });

  it('should give 30 points for Chinese cuisine', () => {
    const lead = {
      license_date: null,
      cuisine_type: '川菜',
      city: 'Other',
      phone: null,
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(30 + 5);
  });

  it('should give 20 points for San Francisco', () => {
    const lead = {
      license_date: null,
      cuisine_type: null,
      city: 'San Francisco',
      phone: null,
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(20);
  });

  it('should give 10 points for having phone', () => {
    const lead = {
      license_date: null,
      cuisine_type: null,
      city: 'Other',
      phone: '415-555-1234',
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(5 + 10);
  });

  it('should cap score at 100', () => {
    const lead = {
      license_date: daysAgo(3),
      cuisine_type: '粤菜',
      city: 'San Francisco',
      phone: '415-555-1234',
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(100); // 40 + 30 + 20 + 10 = 100
  });

  it('should return 5 for empty lead', () => {
    const lead = {
      license_date: null,
      cuisine_type: null,
      city: 'Unknown',
      phone: null,
    };
    const score = calculateLeadScore(lead);
    expect(score).toBe(5); // only default city score
  });
});

describe('getScoreColor', () => {
  it('should return red for score >= 80', () => {
    expect(getScoreColor(85)).toBe('bg-red-500');
    expect(getScoreColor(100)).toBe('bg-red-500');
  });

  it('should return orange for score >= 60', () => {
    expect(getScoreColor(65)).toBe('bg-orange-500');
    expect(getScoreColor(79)).toBe('bg-orange-500');
  });

  it('should return yellow for score >= 40', () => {
    expect(getScoreColor(45)).toBe('bg-yellow-500');
    expect(getScoreColor(59)).toBe('bg-yellow-500');
  });

  it('should return gray for score < 40', () => {
    expect(getScoreColor(30)).toBe('bg-gray-400');
    expect(getScoreColor(0)).toBe('bg-gray-400');
  });
});

describe('getScoreLabel', () => {
  it('should return Hot for score >= 80', () => {
    expect(getScoreLabel(85)).toBe('Hot');
  });

  it('should return Warm for score >= 60', () => {
    expect(getScoreLabel(65)).toBe('Warm');
  });

  it('should return Cool for score >= 40', () => {
    expect(getScoreLabel(45)).toBe('Cool');
  });

  it('should return Cold for score < 40', () => {
    expect(getScoreLabel(30)).toBe('Cold');
  });
});
