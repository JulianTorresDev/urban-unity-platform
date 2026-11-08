import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/motion/CountUp';

interface StatCardProps {
  title: string;
  value: string | number;
  /** Formato para valores numéricos; las cifras numéricas cuentan hasta su valor al cargar. */
  format?: (n: number) => string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'primary';
  className?: string;
}

// El color se reserva para el icono: la cifra es la protagonista, en el color del texto
const iconTone = {
  primary: 'text-primary',
  default: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export function StatCard({ title, value, format, subtitle, icon: Icon, variant = 'default', className }: StatCardProps) {
  return (
    <div className={cn('surface p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
        <Icon className={cn('w-[18px] h-[18px] flex-shrink-0', iconTone[variant])} strokeWidth={1.75} />
      </div>
      <p className="mt-3 text-[28px] leading-none font-semibold tracking-tight tabular-nums text-foreground">
        {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
      </p>
      {subtitle && (
        <p className="mt-2 text-sm text-muted-foreground leading-snug">{subtitle}</p>
      )}
    </div>
  );
}
