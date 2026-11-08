// Ejecuta las pruebas de base de datos contra el esquema SIN la migración de
// endurecimiento, para medir cuántos casos fallaban antes de las correcciones.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['vitest', 'run', 'tests/db'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DB_BASELINE: '1' },
});
process.exit(result.status ?? 1);
