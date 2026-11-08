import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'destructive' | 'primary' | 'muted';
  children: React.ReactNode;
  className?: string;
  showIcon?: boolean;
}

// Fondo tintado suave, sin borde ni sombra; el punto de color comunica el estado de un vistazo
const statusStyles = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  primary: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
};

const dotStyles = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  primary: 'bg-primary',
  muted: 'bg-muted-foreground/60',
};

export function StatusBadge({ status, children, className, showIcon = true }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[13px] font-medium whitespace-nowrap',
        statusStyles[status] ?? statusStyles.muted,
        className
      )}
    >
      {showIcon && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotStyles[status] ?? dotStyles.muted)} />}
      <span>{children}</span>
    </span>
  );
}
