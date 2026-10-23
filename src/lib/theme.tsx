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
  refreshSettings: () => Promise<void>;
}

const defaultSettings: ThemeSettings = {
  company_name: "Gestor Residencial — Gissel's 2",
  logo_url: null,
  primary_color: '#1168bd',
  secondary_color: '#1e293b',
};

const STORAGE_KEY = 'gissels2_theme_settings';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToHsl(hex: string): string {
  if (!hex || !hex.startsWith('#')) return '215 85% 40%';
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return '215 85% 40%';
  
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
    const hslPrimary = hexToHsl(theme.primary_color);
    
    root.style.setProperty('--primary', hslPrimary);
    root.style.setProperty('--sidebar-primary', hslPrimary);
    root.style.setProperty('--ring', hslPrimary);
    
    if (theme.company_name) {
      document.title = `${theme.company_name} · Gestión Residencial`;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch (e) {
      console.warn('Could not cache theme settings:', e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .maybeSingle();

      if (error) {
        console.warn('System settings query notice:', error.message);
        setLoading(false);
        return;
      }

      if (data) {
        const themeData: ThemeSettings = {
          company_name: data.company_name || defaultSettings.company_name,
          logo_url: data.logo_url || null,
          primary_color: data.primary_color || defaultSettings.primary_color,
          secondary_color: data.secondary_color || defaultSettings.secondary_color,
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
            const row = payload.new as Record<string, any>;
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
    const { data: current } = await supabase
      .from('system_settings')
      .select('id')
      .maybeSingle();

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
    <ThemeContext.Provider value={{ settings, loading, updateSettings, refreshSettings: fetchSettings }}>
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
