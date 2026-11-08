import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';

gsap.registerPlugin(useGSAP);

interface CountUpProps {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Cifra que cuenta hasta su valor cuando llegan los datos.
 * Solo para resúmenes que se abren pocas veces; con "reducir movimiento" muestra el valor final.
 */
export function CountUp({ value, format = (n) => Math.round(n).toString(), duration = 0.9, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || value === shown.current) {
        shown.current = value;
        el.textContent = format(value);
        return;
      }

      const state = { n: shown.current };
      gsap.to(state, {
        n: value,
        duration,
        ease: 'power3.out',
        onUpdate: () => {
          shown.current = state.n;
          el.textContent = format(state.n);
        },
        onComplete: () => {
          shown.current = value;
          el.textContent = format(value);
        },
      });
    },
    { dependencies: [value] }
  );

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {format(shown.current)}
    </span>
  );
}
