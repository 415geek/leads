/**
 * Daily Digest Cron — 每日 08:00 UTC 发送新线索摘要邮件
 *
 * Trigger: vercel.json cron "0 8 * * *"
 * Auth:    Authorization: Bearer <CRON_SECRET> (Vercel auto-injects)
 * Email:   Resend API (RESEND_API_KEY env var)
 * To:      DIGEST_EMAIL env var (comma-separated for multiple recipients)
 *
 * Logic:
 *   1. Query leads created/updated since last digested_at (or last 24h)
 *   2. Rank by lead_score DESC, filter is_chain=false (or null)
 *   3. Send Resend email with top-N leads summary
 *   4. Update digested_at on sent leads
 *
 * Non-blocking: email failure does NOT prevent digested_at update.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TOP_N = 20;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

interface DigestLead {
  id: string;
  name: string;
  address: string | null;
  city: string;
  cuisine_type: string | null;
  lead_score: number;
  source: string;
  phone: string | null;
  is_chain: boolean | null;
}

async function fetchNewLeads(since: string): Promise<DigestLead[]> {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id,name,address,city,cuisine_type,lead_score,source,phone,is_chain')
    .gte('created_at', since)
    .or('is_chain.is.null,is_chain.eq.false')
    .order('lead_score', { ascending: false })
    .limit(TOP_N);

  if (error) {
    console.error('[digest] fetch leads error:', error.message);
    return [];
  }
  return (data ?? []) as DigestLead[];
}

async function markDigested(leadIds: string[]): Promise<void> {
  if (leadIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from('leads')
    .update({ digested_at: new Date().toISOString() })
    .in('id', leadIds);
  if (error) {
    console.warn('[digest] mark digested error:', error.message);
  }
}

function buildEmailHtml(leads: DigestLead[], since: string): string {
  const rows = leads
    .map(
      (l) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600">${l.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${l.city}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${l.cuisine_type ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">
        <span style="background:#1e3a5f;color:white;border-radius:12px;padding:2px 8px;font-size:13px">${l.lead_score}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666">${l.phone ?? '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#999">${l.source}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:800px;margin:0 auto;padding:24px">
  <h2 style="color:#1e3a5f">Restaurant Leads — 每日摘要</h2>
  <p style="color:#666">自 ${since.split('T')[0]} 起共找到 <strong>${leads.length}</strong> 条新线索（按评分排序，已过滤连锁品牌）</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr style="background:#f5f7fa">
        <th style="padding:8px 12px;text-align:left;color:#1e3a5f">餐厅名</th>
        <th style="padding:8px 12px;text-align:left;color:#1e3a5f">城市</th>
        <th style="padding:8px 12px;text-align:left;color:#1e3a5f">菜系</th>
        <th style="padding:8px 12px;text-align:center;color:#1e3a5f">评分</th>
        <th style="padding:8px 12px;text-align:left;color:#1e3a5f">电话</th>
        <th style="padding:8px 12px;text-align:left;color:#1e3a5f">来源</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:24px;font-size:12px;color:#999">
    Restaurant Leads Finder Pro · 自动生成，请勿回复
  </p>
</body>
</html>`;
}

async function sendDigestEmail(
  leads: DigestLead[],
  since: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[digest] RESEND_API_KEY not set, skipping email');
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const toRaw = process.env.DIGEST_EMAIL;
  if (!toRaw) {
    console.warn('[digest] DIGEST_EMAIL not set, skipping email');
    return { ok: false, error: 'DIGEST_EMAIL not configured' };
  }

  const to = toRaw.split(',').map((e) => e.trim()).filter(Boolean);
  const subject = `Restaurant Leads 每日摘要 — ${leads.length} 条新线索 (${new Date().toLocaleDateString('zh-CN')})`;
  const html = buildEmailHtml(leads, since);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM_EMAIL ?? 'leads@notifications.yourdomain.com',
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[digest] Resend error:', res.status, body);
      return { ok: false, error: `Resend HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[digest] fetch error:', msg);
    return { ok: false, error: msg };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const leads = await fetchNewLeads(since);

  if (leads.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No new leads in the last 24h, skipping digest',
      since,
    });
  }

  const emailResult = await sendDigestEmail(leads, since);
  await markDigested(leads.map((l) => l.id));

  return NextResponse.json({
    ok: true,
    leads: leads.length,
    since,
    email: emailResult,
  });
}
