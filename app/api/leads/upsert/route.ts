import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateLeadScore } from '@/lib/scoring';
import { LeadCreateInput } from '@/types/lead';

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 requests per minute
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = request.headers.get('x-webhook-secret');
    
    if (webhookSecret !== process.env.N8N_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后重试' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const leads: LeadCreateInput[] = body.leads;

    if (!Array.isArray(leads)) {
      return NextResponse.json(
        { error: 'leads 必须是数组' },
        { status: 400 }
      );
    }

    if (leads.length === 0) {
      return NextResponse.json({ message: '没有数据需要处理', count: 0 });
    }

    const leadsWithScores = leads.map(lead => ({
      ...lead,
      lead_score: calculateLeadScore(lead),
      city: lead.city || 'San Francisco',
      source: lead.source || 'sf_gov',
    }));

    const { data, error } = await supabaseAdmin
      .from('leads')
      .upsert(leadsWithScores, {
        onConflict: 'name,address',
        ignoreDuplicates: false,
      })
      .select();

    if (error) throw error;

    return NextResponse.json({
      message: '导入成功',
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('[POST /api/leads/upsert]', error);
    return NextResponse.json(
      { error: '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}
