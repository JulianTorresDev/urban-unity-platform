import type { Transition, Variants } from 'framer-motion';

// Curva y duraciones compartidas con los tokens CSS (--ease-out, --duration-*)
export const easeOut = [0.2, 0, 0, 1] as const;

/**
 * Entrada escalonada para vistas que se abren pocas veces (inicio, resumen).
 * Los bloques entran cada 100 ms combinando opacidad, desplazamiento corto y desenfoque.
 * No usar en interacciones frecuentes (hover de filas, pestañas, teclado).
 */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: easeOut } },
};

/** Salida sutil: más corta y suave que la entrada. */
export const subtleExit = {
  opacity: 0,
  y: -12,
  filter: 'blur(4px)',
  transition: { duration: 0.15, ease: 'easeOut' } satisfies Transition,
};

/** Cambio de icono contextual (copiar → copiado, play → pausa). */
export const iconSwap = {
  initial: { scale: 0.25, opacity: 0, filter: 'blur(4px)' },
  animate: { scale: 1, opacity: 1, filter: 'blur(0px)' },
  exit: { scale: 0.25, opacity: 0, filter: 'blur(4px)' },
  transition: { type: 'spring', duration: 0.3, bounce: 0 } satisfies Transition,
};
