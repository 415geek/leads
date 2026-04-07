import type { LeadStatus } from '@/types/lead';

export interface LeadMapMarker {
  id: string;
  name: string;
  address: string | null;
  city: string;
  lead_score: number;
  lead_status: LeadStatus;
  lat: number;
  lng: number;
}
