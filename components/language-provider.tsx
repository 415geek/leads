'use client';

import { useState, useEffect, useCallback } from 'react';
import { LanguageContext, translations, type Lang } from '@/lib/i18n';

const STORAGE_KEY = 'rlf_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('zh');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (stored === 'en' || stored === 'zh') {
      setLangState(stored);
      document.documentElement.lang = stored === 'zh' ? 'zh-CN' : 'en';
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}
