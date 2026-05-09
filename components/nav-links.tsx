'use client';

import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';

export function NavLinks() {
  const { t } = useTranslations();
  return (
    <>
      <Link href="/" className="text-sm hover:text-[#f59e0b] transition-colors">
        {t.nav_dashboard}
      </Link>
      <Link href="/leads" className="text-sm hover:text-[#f59e0b] transition-colors">
        {t.nav_leads}
      </Link>
    </>
  );
}
