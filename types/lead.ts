export type LeadStatus = 'new' | 'contacted' | 'in_progress' | 'converted' | 'not_interested';

export interface Lead {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  cuisine_type: string | null;
  city: string;
  source: string;
  license_date: string | null;
  license_type: string | null;
  lead_score: number;
  lead_status: LeadStatus;
  outreach_message: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadCreateInput {
  name: string;
  address?: string;
  phone?: string;
  cuisine_type?: string;
  city?: string;
  source?: string;
  license_date?: string;
  license_type?: string;
}

export interface LeadUpdateInput {
  lead_status?: LeadStatus;
  outreach_message?: string;
  notes?: string;
}

export interface LeadFilters {
  status?: LeadStatus;
  city?: string;
  cuisine_type?: string;
  min_score?: number;
  search?: string;
}
