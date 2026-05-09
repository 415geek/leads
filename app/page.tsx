'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lead } from '@/types/lead';
import { ScoreBadge } from '@/components/score-badge';
import { StatusBadge } from '@/components/status-badge';
import Link from 'next/link';
import { BusinessSearchPanel } from '@/components/business-search-panel';
import { dashboardBusinessSearchHref } from '@/lib/dashboard-business-search';
import { useTranslations } from '@/lib/i18n';

function MapLoadingCard() {
  const { t } = useTranslations();
  return (
    <Card className="border-[#1e3a5f]/20">
      <CardHeader>
        <CardTitle className="text-lg text-[#1e3a5f]">{t.section_map}</CardTitle>
        <p className="text-sm text-muted-foreground">{t.map_loading}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[min(420px,55vh)] w-full animate-pulse rounded-lg bg-slate-100" />
      </CardContent>
    </Card>
  );
}

const LeadsMapPanel = dynamic(
  () => import('@/components/leads-map-panel').then((m) => ({ default: m.LeadsMapPanel })),
  {
    ssr: false,
    loading: () => <MapLoadingCard />,
  }
);

interface Stats {
  total: number;
  newThisWeek: number;
  hotLeads: number;
  contacted: number;
  converted: number;
}

export default function Dashboard() {
  const { t } = useTranslations();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/leads?limit=10&sort=created_at&order=desc');
        const result = await response.json();
        
        const leads = result.data || [];
        const total = result.pagination?.total || 0;
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const newThisWeek = leads.filter((l: Lead) => 
          new Date(l.created_at) >= oneWeekAgo
        ).length;
        
        const hotLeads = leads.filter((l: Lead) => l.lead_score >= 80).length;
        const contacted = leads.filter((l: Lead) => 
          ['contacted', 'in_progress', 'converted'].includes(l.lead_status)
        ).length;
        const converted = leads.filter((l: Lead) => l.lead_status === 'converted').length;
        
        setStats({ total, newThisWeek, hotLeads, contacted, converted });
        setRecentLeads(leads.slice(0, 5));
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#1e3a5f]">{t.dashboard_title}</h2>

      <BusinessSearchPanel />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {t.stat_total}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-[#1e3a5f]">
              {stats?.total || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {t.stat_new_this_week}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {stats?.newThisWeek || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {t.stat_hot_leads}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">
              {stats?.hotLeads || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              {t.stat_converted}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats?.converted || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <LeadsMapPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.section_recent}</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLeads.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {t.empty_state}
            </div>
          ) : (
            <div className="space-y-3">
              {recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                >
                  <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{lead.name}</div>
                    <div className="text-sm text-gray-500 truncate">
                      {lead.address || lead.city}
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Link
                      href={dashboardBusinessSearchHref(lead.name, lead.city)}
                      className="text-xs font-medium text-[#1e3a5f] underline underline-offset-2 hover:text-amber-700"
                    >
                      {t.business_search}
                    </Link>
                    <ScoreBadge score={lead.lead_score} />
                    <StatusBadge status={lead.lead_status} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 text-center">
            <Link
              href="/leads"
              className="text-[#1e3a5f] hover:text-[#f59e0b] font-medium"
            >
              {t.view_all}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
