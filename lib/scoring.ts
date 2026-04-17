import { Lead } from '@/types/lead';

const CHINESE_CUISINES = [
  'chinese', '中餐', '川菜', '粤菜', '湘菜', '东北菜', '火锅',
  'sichuan', 'cantonese', 'hunan', 'beijing', 'shanghai',
  'dim sum', '点心', '饺子', '面馆', 'noodle', 'hotpot'
];

function getDaysSince(dateString: string): number {
  const date = new Date(dateString);
  const today = new Date();
  const diffTime = today.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function isChinese(cuisineType: string | null): boolean {
  if (!cuisineType) return false;
  const lower = cuisineType.toLowerCase();
  return CHINESE_CUISINES.some(c => lower.includes(c));
}

export function calculateLeadScore(lead: Partial<Lead>): number {
  let score = 0;
  
  // 执照日期是核心（最高 40 分）
  if (lead.license_date) {
    const daysSinceLicense = getDaysSince(lead.license_date);
    if (daysSinceLicense <= 7)        score += 40;
    else if (daysSinceLicense <= 14)  score += 35;
    else if (daysSinceLicense <= 30)  score += 30;
    else if (daysSinceLicense <= 60)  score += 20;
    else if (daysSinceLicense <= 90)  score += 10;
  }
  
  // 菜系加分（中餐优先，最高 30 分）
  if (lead.cuisine_type && isChinese(lead.cuisine_type)) {
    score += 30;
  }
  
  // 城市权重（最高 20 分）
  const cityScores: Record<string, number> = {
    'San Francisco': 20,
    'SF': 20,
    'Oakland': 15,
    'San Jose': 15,
    'Fremont': 10,
    'Berkeley': 10,
    'Palo Alto': 10,
    'Mountain View': 10,
    Houston: 15,
  };
  score += cityScores[lead.city || ''] || 5;
  
  // 有电话号码 = 可联系（10 分）
  if (lead.phone) score += 10;
  
  return Math.min(score, 100);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-red-500';
  if (score >= 60) return 'bg-orange-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-gray-400';
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  if (score >= 40) return 'Cool';
  return 'Cold';
}
