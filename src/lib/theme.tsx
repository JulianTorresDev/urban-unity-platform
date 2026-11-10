import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ThemeSettings {
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

interface ThemeContextType {
  settings: ThemeSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<ThemeSettings>) => Promise<void>;
  previewTheme: (preview: Partial<ThemeSettings>) => void;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: ThemeSettings = {
  company_name: "Gestor Residencial — Gissel's 2",
  logo_url: null,
  // Rojo carmín y café de columna de la fachada del conjunto
  primary_color: '#9b272d',
  secondary_color: '#42393b',
};

const STORAGE_KEY = 'gissels2_theme_settings';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const FALLBACK_HSL = '357 60% 38%';

export function hexToHsl(hex: string): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return FALLBACK_HSL;
  const cleanHex = hex.replace('#', '');
  
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255;
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255;
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Variantes del color de marca para cada modo. En oscuro se aclara (60-74 % de luminosidad)
 * para que el acento siga leyéndose sobre fondos casi negros con texto oscuro encima.
 */
export function brandVariants(hex: string): { light: string; dark: string } {
  const light = hexToHsl(hex);
  const [h, s, l] = light.split(' ').map((v) => parseFloat(v));
  const darkL = Math.min(74, Math.max(60, l + 28));
  return { light, dark: `${h} ${Math.min(s, 80)}% ${darkL}%` };
}

function applyBrand(root: HTMLElement, hex: string) {
  const { light, dark } = brandVariants(hex);
  root.style.setProperty('--brand-light', light);
  root.style.setProperty('--brand-dark', dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Inicializar desde localStorage para evitar cualquier parpadeo de estilos
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (e) {
        console.warn('Could not read cached theme settings:', e);
      }
    }
    return defaultSettings;
  });

  const [loading, setLoading] = useState(true);

  const applyTheme = (theme: ThemeSettings) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    applyBrand(root, theme.primary_color);

    if (theme.company_name) {
      document.title = `${theme.company_name} · Gestión Residencial`;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch (e) {
      console.warn('Could not cache theme settings:', e);
    }
  };

  const previewTheme = (preview: Partial<ThemeSettings>) => {
    const combined = { ...settings, ...preview };
    setSettings(combined);
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (combined.primary_color) applyBrand(root, combined.primary_color);
      if (combined.company_name) {
        document.title = `${combined.company_name} · Gestión Residencial`;
      }
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .limit(1);

      if (error) {
        console.warn('System settings query notice:', error.message);
        setLoading(false);
        return;
      }

      const settingsRow = data && data.length > 0 ? data[0] : null;
      if (settingsRow) {
        const themeData: ThemeSettings = {
          company_name: settingsRow.company_name || defaultSettings.company_name,
          logo_url: settingsRow.logo_url || null,
          primary_color: settingsRow.primary_color || defaultSettings.primary_color,
          secondary_color: settingsRow.secondary_color || defaultSettings.secondary_color,
        };
        setSettings(themeData);
        applyTheme(themeData);
      }
    } catch (err) {
      console.error('Error fetching theme settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Aplicar tema inicial desde cache
    applyTheme(settings);
    fetchSettings();

    // Suscripción Realtime para actualizar la personalización en todos los dispositivos en vivo
    const channel = supabase
      .channel('theme-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const row = payload.new as Partial<ThemeSettings>;
            const updated: ThemeSettings = {
              company_name: row.company_name || defaultSettings.company_name,
              logo_url: row.logo_url || null,
              primary_color: row.primary_color || defaultSettings.primary_color,
              secondary_color: row.secondary_color || defaultSettings.secondary_color,
            };
            setSettings(updated);
            applyTheme(updated);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const updateSettings = async (newSettings: Partial<ThemeSettings>) => {
    // Buscar si existe registro actual
    const { data: rows } = await supabase
      .from('system_settings')
      .select('id')
      .limit(1);

    const current = rows && rows.length > 0 ? rows[0] : null;

    let error;

    if (current) {
      const result = await supabase
        .from('system_settings')
        .update({
          company_name: newSettings.company_name,
          primary_color: newSettings.primary_color,
          secondary_color: newSettings.secondary_color,
          logo_url: newSettings.logo_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('system_settings')
        .insert({
          company_name: newSettings.company_name || settings.company_name,
          primary_color: newSettings.primary_color || settings.primary_color,
          secondary_color: newSettings.secondary_color || settings.secondary_color,
          logo_url: newSettings.logo_url || settings.logo_url,
        });
      error = result.error;
    }

    if (!error) {
      const updated: ThemeSettings = {
        company_name: newSettings.company_name ?? settings.company_name,
        logo_url: newSettings.logo_url !== undefined ? newSettings.logo_url : settings.logo_url,
        primary_color: newSettings.primary_color ?? settings.primary_color,
        secondary_color: newSettings.secondary_color ?? settings.secondary_color,
      };
      setSettings(updated);
      applyTheme(updated);
    } else {
      console.error('Error updating settings in database:', error);
      throw error;
    }
  };

  return (
    <ThemeContext.Provider value={{ settings, loading, updateSettings, previewTheme, refreshSettings: fetchSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
