export type LeadStatus = 'new' | 'contacted' | 'in_progress' | 'converted' | 'not_interested';

/** 政府开放数据等来源的完整登记快照（字段随来源变化） */
export type LeadSourceRaw = Record<string, unknown>;

/** 政府备案记录（如 CA SOS History / PDF） */
export type LeadFilingSource = 'ca_sos' | 'manual';

export interface LeadFiling {
  id: string;
  lead_id: string;
  source: LeadFilingSource;
  filing_type: string;
  control_id: string | null;
  filed_date: string | null;
  document_url: string | null;
  extra: Record<string, unknown> | null;
  created_at: string;
}

export interface LeadFilingInput {
  filing_type: string;
  control_id?: string | null;
  filed_date?: string | null;
  document_url?: string | null;
  source?: LeadFilingSource;
}

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
  /** California SOS 等企业实体编号，用于对照州网站 */
  ca_entity_number?: string | null;
  /** 来源 API 全量字段，用于界面展示（旧数据或未跑迁移时可能为空） */
  source_raw?: LeadSourceRaw | null;
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
  source_raw?: LeadSourceRaw;
}

export interface LeadUpdateInput {
  lead_status?: LeadStatus;
  outreach_message?: string;
  notes?: string;
  ca_entity_number?: string | null;
}

export interface LeadFilters {
  status?: LeadStatus;
  city?: string;
  cuisine_type?: string;
  min_score?: number;
  search?: string;
}
