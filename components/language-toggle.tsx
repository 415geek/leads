'use client';

import { useTranslations } from '@/lib/i18n';

export function LanguageToggle() {
  const { lang, setLang, t } = useTranslations();

  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      className="rounded border border-white/40 bg-white/10 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20"
      title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
    >
      {t.lang_toggle}
    </button>
  );
}
