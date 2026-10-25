import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isDesktop, setWindowTheme } from '@/lib/api';
import { useApp } from '@/lib/store';

export type ThemePreference = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function mediaDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useApp((state) => state.settings.theme);
  const setSettings = useApp((state) => state.setSettings);
  const [media, setMedia] = useState(mediaDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (): void => setMedia(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? (media ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.style.colorScheme = resolved;
    if (isDesktop()) setWindowTheme(preference === 'system' ? null : resolved).catch(() => undefined);
  }, [resolved, preference]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference: (next: ThemePreference) => {
        void setSettings({ theme: next });
      },
    }),
    [preference, resolved, setSettings],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
