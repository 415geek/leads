'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslations } from '@/lib/i18n';

export function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslations();

  if (pathname === '/login') {
    return null;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.success(t.nav_logout);
      router.push('/login');
      router.refresh();
    } catch {
      toast.error(t.error_load);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
    >
      {t.nav_logout}
    </Button>
  );
}
