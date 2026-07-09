/**
 * Lightweight i18n — English keys, Punjabi (Gurmukhi) dictionary.
 * t() falls back to the English key, so untranslated strings are never
 * broken, just English. Worker-facing screens use it; office stays English.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'en' | 'pa';
const KEY = 'consite.lang';

const PA: Record<string, string> = {
  // Tabs & nav
  'Home': 'ਹੋਮ',
  'Clock': 'ਹਾਜ਼ਰੀ',
  'Tasks': 'ਕੰਮ',
  // Dashboard modules
  'Clock In / Out': 'ਹਾਜ਼ਰੀ ਲਾਓ / ਛੁੱਟੀ ਕਰੋ',
  'GPS-verified': 'GPS ਨਾਲ ਪੱਕੀ',
  'AI Scan': 'AI ਸਕੈਨ',
  'Point, shoot, filed': 'ਫੋਟੋ ਖਿੱਚੋ, ਬਾਕੀ AI ਕਰੂ',
  'Work Update': 'ਕੰਮ ਦੀ ਜਾਣਕਾਰੀ',
  'Photo + voice → done': 'ਫੋਟੋ + ਆਵਾਜ਼ → ਹੋ ਗਿਆ',
  'My Tasks': 'ਮੇਰੇ ਕੰਮ',
  'Pinned work for you': 'ਤੁਹਾਡੇ ਲਈ ਕੰਮ',
  'Crew Hours': 'ਟੀਮ ਦੇ ਘੰਟੇ',
  'Approve crew shifts': 'ਟੀਮ ਦੀਆਂ ਸ਼ਿਫਟਾਂ ਮਨਜ਼ੂਰ ਕਰੋ',
  'FLHA Forms': 'FLHA ਫਾਰਮ',
  'AI auto-filled': 'AI ਆਪੇ ਭਰਦਾ ਹੈ',
  'My Hours': 'ਮੇਰੇ ਘੰਟੇ',
  'This week’s shifts & totals': 'ਇਸ ਹਫ਼ਤੇ ਦੀਆਂ ਸ਼ਿਫਟਾਂ',
  'Report Issue': 'ਸਮੱਸਿਆ ਦੱਸੋ',
  'Photo + voice': 'ਫੋਟੋ + ਆਵਾਜ਼',
  'Scan Receipt': 'ਰਸੀਦ ਸਕੈਨ ਕਰੋ',
  'To job cost': 'ਖਰਚੇ ਦਾ ਹਿਸਾਬ',
  'Daily Log': 'ਰੋਜ਼ਾਨਾ ਰਿਪੋਰਟ',
  'AI-written': 'AI ਲਿਖਦਾ ਹੈ',
  'Forms': 'ਫਾਰਮ',
  'QC, environmental & more': 'QC, ਵਾਤਾਵਰਣ ਤੇ ਹੋਰ',
  'Punch List': 'ਬਾਕੀ ਕੰਮਾਂ ਦੀ ਸੂਚੀ',
  'Open issues': 'ਖੁੱਲ੍ਹੀਆਂ ਸਮੱਸਿਆਵਾਂ',
  'My Tickets': 'ਮੇਰੇ ਸਰਟੀਫਿਕੇਟ',
  'WHMIS, fall arrest': 'WHMIS, ਫਾਲ ਅਰੈਸਟ',
  'Projects': 'ਪ੍ਰੋਜੈਕਟ',
  'My Profile': 'ਮੇਰੀ ਪ੍ਰੋਫਾਈਲ',
  'WCB, tickets & safety docs': 'WCB, ਸਰਟੀਫਿਕੇਟ ਤੇ ਸੇਫਟੀ ਕਾਗਜ਼',
  'Site Drawings': 'ਸਾਈਟ ਦੇ ਨਕਸ਼ੇ',
  'Plans & pin-tasks': 'ਨਕਸ਼ੇ ਤੇ ਕੰਮ',
  'Welcome back': 'ਜੀ ਆਇਆਂ ਨੂੰ',
  // Clock screen
  'Select project': 'ਸਾਈਟ ਚੁਣੋ',
  'Clock In': 'ਹਾਜ਼ਰੀ ਲਾਓ',
  'Clock Out': 'ਛੁੱਟੀ ਕਰੋ',
  'On the clock': 'ਕੰਮ ਚੱਲ ਰਿਹਾ ਹੈ',
  'No projects assigned': 'ਕੋਈ ਪ੍ਰੋਜੈਕਟ ਨਹੀਂ ਮਿਲਿਆ',
  'Ask your admin to add you to a project.': 'ਦਫ਼ਤਰ ਨੂੰ ਕਹੋ ਕਿ ਤੁਹਾਨੂੰ ਪ੍ਰੋਜੈਕਟ ਵਿੱਚ ਪਾਉਣ।',
  'Clocked out': 'ਛੁੱਟੀ ਹੋ ਗਈ',
  'See you next shift.': 'ਅਗਲੀ ਸ਼ਿਫਟ ਤੇ ਮਿਲਾਂਗੇ।',
  'Cannot clock in': 'ਹਾਜ਼ਰੀ ਨਹੀਂ ਲੱਗੀ',
  // Profile
  'Language': 'ਭਾਸ਼ਾ',
  'Safety ID': 'ਸੇਫਟੀ ID',
  'Save': 'ਸੇਵ ਕਰੋ',
};

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nState>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v === 'pa' || v === 'en') setLangState(v); });
  }, []);

  const value = useMemo<I18nState>(() => ({
    lang,
    setLang: (l) => { setLangState(l); AsyncStorage.setItem(KEY, l).catch(() => {}); },
    t: (key) => (lang === 'pa' ? PA[key] ?? key : key),
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nState {
  return useContext(I18nContext);
}
