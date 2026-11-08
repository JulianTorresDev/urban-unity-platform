// Genera el plan Scrum (docs/SCRUM_PLAN.md) y el backlog para Jira (docs/jira/)
// a partir de docs/HISTORIAS_DE_USUARIO.md. Uso: node scripts/build-scrum.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const doc = readFileSync(new URL('../docs/HISTORIAS_DE_USUARIO.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---------- Historias desde el documento ----------
const stories = [];
for (const block of doc.split(/\n(?=### HU-)/).slice(1)) {
  const [head, ...rest] = block.split('\n');
  const m = head.match(/^### (HU-\d+) · (.+)$/);
  if (!m) continue;
  const body = rest.join('\n').split('\n## ')[0];
  const narrative = body.match(/\*\*Como\*\* (.+?) \*\*quiero\*\* (.+?) \*\*para\*\* (.+?)\n/);
  stories.push({
    key: m[1],
    title: m[2].replace(/ \(historia técnica\)$/, ''),
    como: narrative?.[1], quiero: narrative?.[2], para: narrative?.[3]?.replace(/\.$/, ''),
    priority: body.match(/Prioridad: (\S+)/)?.[1] ?? 'Debe',
    criteria: [...body.matchAll(/^\d+\. (.+)$/gm)].map((c) => c[1].replace(/\*\*/g, '')),
    tests: body.match(/^Pruebas: (.+)$/m)?.[1] ?? '',
    type: 'Historia',
  });
}
if (stories.length !== 36) throw new Error(`Se esperaban 36 historias y hay ${stories.length}`);

// ---------- Tareas técnicas (habilitadores) ----------
const tasks = [
  { key: 'TT-01', title: 'Configurar el proyecto (React, Vite, Tailwind, Supabase)', points: 3, criteria: ['El proyecto compila y se despliega en desarrollo', 'Variables de entorno documentadas en el README'] },
  { key: 'TT-02', title: 'Diseñar el modelo de datos y las políticas RLS iniciales', points: 5, criteria: ['Diagrama entidad-relación aprobado', 'Todas las tablas con RLS activado'] },
  { key: 'TT-03', title: 'Rediseñar la interfaz con principios de Apple y Amazon', points: 8, criteria: ['Tokens de color, sombras y movimiento unificados', 'Las 24 pantallas usan el sistema de diseño'] },
  { key: 'TT-04', title: 'Pulir textos y encabezados de todas las pantallas', points: 2, criteria: ['Textos en español de Ecuador, sin mayúsculas sostenidas ni anglicismos'] },
  { key: 'TT-05', title: 'Animaciones y microinteracciones (GSAP, transiciones)', points: 3, criteria: ['Respeta "reducir movimiento" del sistema', 'Sin saltos de diseño al cargar'] },
  { key: 'TT-06', title: 'Suite de pruebas automatizadas (seguridad, funcionalidad e interfaz)', points: 8, criteria: ['302 pruebas pasan', 'Pruebas de BD sobre las migraciones reales en PGlite', 'Informe de pruebas con hallazgos y matriz'] },
  { key: 'TT-07', title: 'Unificar migraciones y crear la base en el proyecto de Supabase', points: 5, criteria: ['Una sola migración idempotente y datos iniciales', 'Prueba de humo contra la base real: 23/23'] },
  { key: 'TT-08', title: 'Publicar la demo funcional y el informe de pruebas', points: 3, criteria: ['La app corre en modo demo con base en el navegador', 'Informe publicado con esquema de la base'] },
  { key: 'TT-09', title: 'Documentar historias de usuario y backlog Scrum', points: 2, criteria: ['36 historias con criterios Dado/Cuando/Entonces', 'Backlog importable en Jira'] },
].map((t) => ({ ...t, type: 'Tarea técnica', priority: 'Debe', tests: '' }));

// ---------- Estimación (puntos de historia, Fibonacci) ----------
const POINTS = {
  'HU-01': 3, 'HU-02': 3, 'HU-03': 5, 'HU-04': 1, 'HU-05': 3, 'HU-06': 5, 'HU-07': 3, 'HU-08': 2, 'HU-09': 1,
  'HU-10': 8, 'HU-11': 2, 'HU-12': 3, 'HU-13': 3, 'HU-14': 2, 'HU-15': 2, 'HU-16': 5, 'HU-17': 5, 'HU-18': 5,
  'HU-19': 3, 'HU-20': 2, 'HU-21': 5, 'HU-22': 5, 'HU-23': 5, 'HU-24': 3, 'HU-25': 5, 'HU-26': 5, 'HU-27': 3,
  'HU-28': 3, 'HU-29': 2, 'HU-30': 5, 'HU-31': 3, 'HU-32': 5, 'HU-33': 8, 'HU-34': 3, 'HU-35': 5, 'HU-36': 8,
};
stories.forEach((s) => { s.points = POINTS[s.key]; });

// ---------- Épicas ----------
const EPICS = [
  { key: 'EP-1', name: 'Acceso, roles y seguridad', items: ['HU-01', 'HU-02', 'HU-03', 'HU-04', 'HU-30', 'HU-31', 'HU-36', 'TT-01', 'TT-02'] },
  { key: 'EP-2', name: 'Alícuotas y pagos', items: ['HU-05', 'HU-06', 'HU-07', 'HU-08', 'HU-09', 'HU-21', 'HU-22', 'HU-23', 'HU-24', 'HU-25'] },
  { key: 'EP-3', name: 'Reservas de áreas comunes', items: ['HU-10', 'HU-11', 'HU-12', 'HU-26', 'HU-27', 'HU-35'] },
  { key: 'EP-4', name: 'Solicitudes y comunicación', items: ['HU-13', 'HU-14', 'HU-15', 'HU-16', 'HU-17', 'HU-20', 'HU-28', 'HU-29'] },
  { key: 'EP-5', name: 'Acceso con QR y garita', items: ['HU-18', 'HU-19', 'HU-32', 'HU-33'] },
  { key: 'EP-6', name: 'Experiencia, calidad y entrega', items: ['HU-34', 'TT-03', 'TT-04', 'TT-05', 'TT-06', 'TT-07', 'TT-08', 'TT-09'] },
];

// ---------- Sprints de 2 semanas: 9 sprints, 18 semanas ----------
const SPRINT_START = new Date(Date.UTC(2026, 6, 6)); // lunes 6 de julio de 2026
const SPRINTS = [
  { goal: 'Base del sistema: proyecto, modelo de datos y acceso', items: ['TT-01', 'TT-02', 'HU-01', 'HU-03', 'HU-04'] },
  { goal: 'Gestión de residentes, roles y suspensión', items: ['HU-30', 'HU-31', 'HU-02', 'HU-20'] },
  { goal: 'El residente consulta y paga sus alícuotas', items: ['HU-24', 'HU-05', 'HU-06', 'HU-08', 'HU-09'] },
  { goal: 'La administración emite, verifica y concilia cobros', items: ['HU-23', 'HU-22', 'HU-25', 'HU-07', 'HU-21'] },
  { goal: 'Reservas sin cruces de horario', items: ['HU-27', 'HU-10', 'HU-11', 'HU-26', 'HU-12'] },
  { goal: 'Solicitudes, comunicados, chat y notificaciones', items: ['HU-13', 'HU-28', 'HU-14', 'HU-29', 'HU-15', 'HU-16', 'HU-17'] },
  { goal: 'Ingreso con QR y control en garita', items: ['HU-18', 'HU-32', 'HU-33', 'HU-19'] },
  { goal: 'Marca, reportes y rediseño de la experiencia', items: ['HU-34', 'HU-35', 'TT-03', 'TT-04', 'TT-05'] },
  { goal: 'Seguridad, pruebas y entrega', items: ['HU-36', 'TT-06', 'TT-07', 'TT-08', 'TT-09'] },
];
const fmt = (d) => d.toISOString().slice(0, 10);
const human = (d) => d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' });
SPRINTS.forEach((s, i) => {
  const start = new Date(SPRINT_START); start.setUTCDate(start.getUTCDate() + i * 14);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 13);
  Object.assign(s, { name: `Sprint ${i + 1}`, start: fmt(start), end: fmt(end), startH: human(start), endH: human(end) });
});

// ---------- Validaciones ----------
const all = [...stories, ...tasks];
const byKey = Object.fromEntries(all.map((x) => [x.key, x]));
for (const list of [EPICS, SPRINTS]) {
  const seen = list.flatMap((g) => g.items);
  const missing = all.filter((x) => !seen.includes(x.key)).map((x) => x.key);
  const dup = seen.filter((k, i) => seen.indexOf(k) !== i);
  const unknown = seen.filter((k) => !byKey[k]);
  if (missing.length || dup.length || unknown.length) throw new Error(JSON.stringify({ missing, dup, unknown }));
}
EPICS.forEach((e) => e.items.forEach((k) => { byKey[k].epic = e; }));
SPRINTS.forEach((s) => {
  s.items.forEach((k) => { byKey[k].sprint = s; });
  s.points = s.items.reduce((n, k) => n + byKey[k].points, 0);
});
const totalPoints = all.reduce((n, x) => n + x.points, 0);

// ---------- Markdown ----------
const descOf = (x) => (x.como ? `Como ${x.como}, quiero ${x.quiero} para ${x.para}.` : x.title + '.');
let md = `# Plan Scrum — Gestor Residencial Gissel's 2

Generado con \`node scripts/build-scrum.mjs\` desde [HISTORIAS_DE_USUARIO.md](HISTORIAS_DE_USUARIO.md).
Los mismos datos están en [jira/backlog.csv](jira/backlog.csv) para importarlos en Jira.

## Marco de trabajo

| Elemento | Definición |
|---|---|
| Duración | ${SPRINTS.length} sprints de 2 semanas: 18 semanas, del ${SPRINTS[0].startH} al ${SPRINTS.at(-1).endH} de 2026 |
| Product Owner | Administración del conjunto Gissel's 2 (prioriza el backlog y acepta las historias) |
| Scrum Master y equipo | Julián Torres |
| Ceremonias | Planificación al inicio de cada sprint, daily de 15 minutos, revisión con demo al cierre y retrospectiva |
| Estimación | Puntos de historia en escala Fibonacci (1, 2, 3, 5, 8, 13) |
| Backlog | ${stories.length} historias de usuario y ${tasks.length} tareas técnicas en ${EPICS.length} épicas, ${totalPoints} puntos |
| Velocidad media | ${(totalPoints / SPRINTS.length).toFixed(1)} puntos por sprint |

**Definición de terminado (DoD):** el código compila sin errores de TypeScript ni ESLint; los criterios de
aceptación tienen pruebas automatizadas y pasan; la regla de negocio está protegida también en la base de
datos (RLS o trigger), no solo en la pantalla; los textos están en español; la historia se mostró en la revisión.

## Sprints

| Sprint | Fechas | Objetivo | Puntos |
|---|---|---|---|
${SPRINTS.map((s) => `| ${s.name} | ${s.startH} – ${s.endH} | ${s.goal} | ${s.points} |`).join('\n')}
| **Total** | | | **${totalPoints}** |

`;
for (const s of SPRINTS) {
  md += `### ${s.name} · ${s.goal}\n${s.startH} – ${s.endH} de 2026 · ${s.points} puntos\n\n| Clave | Tipo | Título | Épica | Puntos |\n|---|---|---|---|---|\n`;
  md += s.items.map((k) => { const x = byKey[k]; return `| ${x.key} | ${x.type} | ${x.title} | ${x.epic.name} | ${x.points} |`; }).join('\n') + '\n\n';
}
md += `## Épicas\n\n| Épica | Elementos | Puntos |\n|---|---|---|\n`;
md += EPICS.map((e) => `| ${e.key} · ${e.name} | ${e.items.join(', ')} | ${e.items.reduce((n, k) => n + byKey[k].points, 0)} |`).join('\n') + '\n\n';
md += `## Backlog del producto\n\n`;
for (const x of all) {
  md += `### ${x.key} · ${x.title}\n${descOf(x)}\n\n${x.type} · ${x.epic.name} · ${x.sprint.name} · ${x.points} puntos · Prioridad ${x.priority}\n\n`;
  md += x.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') + '\n';
  if (x.tests) md += `\nPruebas: ${x.tests}\n`;
  md += '\n';
}
writeFileSync(new URL('../docs/SCRUM_PLAN.md', import.meta.url), md);

// ---------- CSV para el importador de Jira ----------
mkdirSync(new URL('../docs/jira/', import.meta.url), { recursive: true });
const PRIO = { Debe: 'High', 'Debería': 'Medium', 'Podría': 'Low' };
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = [['Issue Id', 'Parent Id', 'Issue Type', 'Summary', 'Description', 'Priority', 'Story Points', 'Sprint', 'Labels', 'Status']];
EPICS.forEach((e, i) => rows.push([`E${i + 1}`, '', 'Epic', e.name, `Épica ${e.key}: ${e.items.join(', ')}`, 'High', '', '', 'epica', 'Done']));
for (const x of all) {
  const desc = `${descOf(x)}\n\nCriterios de aceptación:\n${x.criteria.map((c) => `- ${c}`).join('\n')}${x.tests ? `\n\nPruebas: ${x.tests}` : ''}`;
  rows.push([x.key, `E${EPICS.indexOf(x.epic) + 1}`, x.type === 'Historia' ? 'Story' : 'Task', `${x.key} ${x.title}`, desc, PRIO[x.priority] ?? 'Medium', x.points, x.sprint.name, x.type === 'Historia' ? 'historia-de-usuario' : 'tarea-tecnica', 'Done']);
}
writeFileSync(new URL('../docs/jira/backlog.csv', import.meta.url), '\uFEFF' + rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n');

// ---------- JSON para crear el proyecto por API ----------
writeFileSync(new URL('../docs/jira/backlog.json', import.meta.url), JSON.stringify({
  project: { key: 'GIS', name: "Gestor Residencial Gissel's 2" },
  sprints: SPRINTS.map(({ name, goal, start, end, items, points }) => ({ name, goal, start, end, items, points })),
  epics: EPICS.map(({ key, name, items }) => ({ key, name, items })),
  issues: all.map((x) => ({ key: x.key, type: x.type, title: x.title, description: descOf(x), criteria: x.criteria, tests: x.tests, priority: x.priority, points: x.points, epic: x.epic.key, sprint: x.sprint.name })),
}, null, 2) + '\n');

console.log(`${stories.length} historias, ${tasks.length} tareas, ${EPICS.length} épicas, ${SPRINTS.length} sprints, ${totalPoints} puntos`);
console.log(SPRINTS.map((s) => `${s.name}: ${s.start} → ${s.end} · ${s.points} pts`).join('\n'));
