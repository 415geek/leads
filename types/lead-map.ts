import type { LeadStatus } from '@/types/lead';

export interface LeadMapMarker {
  id: string;
  name: string;
  address: string | null;
  city: string;
  /** 执照 / 登记相关日期（与详情页 license_date 一致） */
  license_date: string | null;
  lead_score: number;
  lead_status: LeadStatus;
  lat: number;
  lng: number;
}
