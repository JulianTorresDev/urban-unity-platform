/**
 * Datos de ejemplo de la demo. Las fechas se calculan desde hoy para que el
 * calendario, las alícuotas del mes y las reservas próximas siempre tengan sentido.
 * Todas las personas y unidades son ficticias.
 */
type Row = Record<string, unknown>;

export interface DemoDb {
  tables: Record<string, Row[]>;
}

export const DEMO_PASSWORD = 'demo1234';

export interface DemoAccount {
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'resident';
  label: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'ana.perez@gissels2.demo', name: 'Ana Pérez', role: 'resident', label: 'Residente' },
  { email: 'lucia.andrade@gissels2.demo', name: 'Lucía Andrade', role: 'admin', label: 'Administración' },
  { email: 'admin@gissels2.demo', name: 'Administración General', role: 'super_admin', label: 'Superadministrador' },
];

// Comprobante de transferencia de ejemplo (SVG en línea)
const receiptSvg = (bank: string, amount: string, ref: string) =>
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480">
      <rect width="360" height="480" fill="#ffffff"/>
      <rect width="360" height="72" fill="#0f3d6e"/>
      <text x="24" y="44" font-family="Arial" font-size="20" fill="#ffffff" font-weight="bold">${bank}</text>
      <text x="24" y="120" font-family="Arial" font-size="14" fill="#5b6878">Transferencia exitosa</text>
      <text x="24" y="168" font-family="Arial" font-size="36" fill="#15202e" font-weight="bold">${amount}</text>
      <text x="24" y="220" font-family="Arial" font-size="13" fill="#5b6878">Beneficiario</text>
      <text x="24" y="240" font-family="Arial" font-size="15" fill="#15202e">Conjunto Gissel's 2</text>
      <text x="24" y="280" font-family="Arial" font-size="13" fill="#5b6878">Referencia</text>
      <text x="24" y="300" font-family="Arial" font-size="15" fill="#15202e">${ref}</text>
      <text x="24" y="340" font-family="Arial" font-size="13" fill="#5b6878">Comprobante de ejemplo · demo</text>
    </svg>`);

export function createSeed(): DemoDb {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number, h = 10) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return iso(d); };
  const at = (days: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return iso(d); };
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const prev = (k: number) => { const d = new Date(year, now.getMonth() - k, 1); return { month: d.getMonth() + 1, year: d.getFullYear() }; };

  // Tipos de departamento y áreas
  const types = [
    { id: 't-1h', name: 'Departamento 1 habitación', monthly_fee: 40, description: 'Unidades de una habitación' },
    { id: 't-2h', name: 'Departamento 2 habitaciones', monthly_fee: 50, description: 'Unidades de dos habitaciones' },
    { id: 't-3h', name: 'Departamento 3 habitaciones', monthly_fee: 65, description: 'Unidades de tres habitaciones' },
    { id: 't-casa', name: 'Casa', monthly_fee: 80, description: 'Casas del conjunto' },
  ].map((t) => ({ ...t, created_at: daysAgo(120), updated_at: daysAgo(120) }));

  const resources = [
    { id: 'r-salon', name: 'Salón Social', description: 'Espacio cerrado para reuniones y eventos privados', max_hours_per_booking: 4, available_from: '09:00:00', available_until: '22:00:00', base_price: 25, price_per_hour: 0 },
    { id: 'r-bbq', name: 'Zona BBQ', description: 'Parrillas y mesas al aire libre', max_hours_per_booking: 4, available_from: '10:00:00', available_until: '21:00:00', base_price: 10, price_per_hour: 0 },
    { id: 'r-piscina', name: 'Piscina', description: 'Zona de piscina y descanso', max_hours_per_booking: 3, available_from: '08:00:00', available_until: '19:00:00', base_price: 0, price_per_hour: 0 },
    { id: 'r-cancha', name: 'Cancha múltiple', description: 'Fútbol, básquet y vóley', max_hours_per_booking: 2, available_from: '07:00:00', available_until: '21:00:00', base_price: 0, price_per_hour: 5 },
  ].map((r) => ({ ...r, created_at: daysAgo(120) }));

  // Personas (ficticias)
  const people = [
    { id: 'u-root', email: 'admin@gissels2.demo', full_name: 'Administración General', role: 'super_admin', apt: null, type: null, phone: '+593 99 000 0001' },
    { id: 'u-lucia', email: 'lucia.andrade@gissels2.demo', full_name: 'Lucía Andrade', role: 'admin', apt: null, type: null, phone: '+593 98 412 3301' },
    { id: 'u-ana', email: 'ana.perez@gissels2.demo', full_name: 'Ana Pérez', role: 'resident', apt: '12-A', type: 't-2h', phone: '+593 99 274 1180' },
    { id: 'u-carlos', email: 'carlos.mena@gissels2.demo', full_name: 'Carlos Mena', role: 'resident', apt: '7-B', type: 't-1h', phone: '+593 98 651 0042' },
    { id: 'u-majo', email: 'mariajose.vega@gissels2.demo', full_name: 'María José Vega', role: 'resident', apt: 'Casa 3', type: 't-casa', phone: '+593 99 830 7712' },
    { id: 'u-diego', email: 'diego.salazar@gissels2.demo', full_name: 'Diego Salazar', role: 'resident', apt: '15-C', type: 't-3h', phone: '+593 97 112 9034' },
    { id: 'u-paola', email: 'paola.cevallos@gissels2.demo', full_name: 'Paola Cevallos', role: 'resident', apt: '4-A', type: 't-2h', phone: '+593 98 905 4471' },
    { id: 'u-andres', email: 'andres.rivas@gissels2.demo', full_name: 'Andrés Rivas', role: 'resident', apt: '9-B', type: 't-1h', phone: '+593 99 563 2208', blocked: true },
  ];

  const auth_users = people.map((p) => ({ id: p.id, email: p.email, password: DEMO_PASSWORD, full_name: p.full_name, created_at: daysAgo(110) }));
  const profiles = people.map((p, i) => ({
    id: p.id, email: p.email, full_name: p.full_name, phone: p.phone, apartment_number: p.apt, apartment_type_id: p.type,
    status: p.blocked ? 'blocked' : 'active', nfc_card_id: p.apt ? `NFC-${String(1040 + i)}` : null,
    created_at: daysAgo(110 - i), updated_at: daysAgo(30),
  }));
  const user_roles = people.map((p) => ({ id: `role-${p.id}`, user_id: p.id, role: p.role, created_at: daysAgo(110) }));
  const access_tokens = people.map((p, i) => ({
    id: `tok-${p.id}`, user_id: p.id, domicile_id: p.apt ?? 'S/N', type: 'permanent', expires_at: null, created_at: daysAgo(110),
    token: `demo${String(i).padStart(2, '0')}${'7f3a9c1e5b2d8046'.repeat(4)}`.slice(0, 64),
  }));

  // Alícuotas: dos meses anteriores y el actual
  const fee = (typeId: string | null) => types.find((t) => t.id === typeId)?.monthly_fee ?? 0;
  const dues: Row[] = [];
  const residents = people.filter((p) => p.role === 'resident');
  for (const p of residents) {
    for (const k of [2, 1, 0]) {
      const m = k === 0 ? { month, year } : prev(k);
      const due: Row = {
        id: `due-${p.id}-${m.year}-${m.month}`, user_id: p.id, apartment_type_id: p.type, amount: fee(p.type), month: m.month, year: m.year,
        status: k === 0 ? 'pending' : 'paid', paid_at: k === 0 ? null : daysAgo(k * 30 - 3), notes: null, receipt_url: null, rejection_reason: null,
        created_at: daysAgo(k * 30 + 2), updated_at: daysAgo(k * 30),
      };
      dues.push(due);
    }
  }
  const dueOf = (uid: string, k: number) => {
    const m = k === 0 ? { month, year } : prev(k);
    return dues.find((d) => d.id === `due-${uid}-${m.year}-${m.month}`)!;
  };
  Object.assign(dueOf('u-ana', 0), { receipt_url: receiptSvg('Banco Pichincha', '$50.00', 'TRX-884120'), updated_at: daysAgo(1) });
  Object.assign(dueOf('u-carlos', 0), { rejection_reason: 'El comprobante no pudo validarse. Sube una captura clara de la transferencia.' });
  Object.assign(dueOf('u-diego', 1), { status: 'overdue', paid_at: null });
  Object.assign(dueOf('u-majo', 0), { status: 'paid', paid_at: daysAgo(2), receipt_url: receiptSvg('Produbanco', '$80.00', 'TRX-771093') });
  Object.assign(dueOf('u-andres', 1), { status: 'overdue', paid_at: null });
  Object.assign(dueOf('u-andres', 2), { status: 'overdue', paid_at: null });

  const payments = [
    { id: 'pay-1', user_id: 'u-diego', description: 'Multa por ruido después de las 22:00', amount: 20, due_date: at(7, 12).slice(0, 10), payment_type: 'fine', status: 'pending', paid_at: null, receipt_url: null, rejection_reason: null, created_at: daysAgo(5) },
    { id: 'pay-2', user_id: 'u-ana', description: 'Cuota extraordinaria: pintura de fachada', amount: 35, due_date: at(10, 12).slice(0, 10), payment_type: 'other', status: 'pending', paid_at: null, receipt_url: receiptSvg('Banco Guayaquil', '$35.00', 'TRX-902311'), rejection_reason: null, created_at: daysAgo(8) },
    { id: 'pay-3', user_id: 'u-paola', description: 'Reposición de tarjeta de acceso', amount: 8, due_date: daysAgo(12).slice(0, 10), payment_type: 'other', status: 'paid', paid_at: daysAgo(14), receipt_url: null, rejection_reason: null, created_at: daysAgo(20) },
  ].map((p) => ({ ...p, updated_at: p.created_at }));

  const reservations = [
    { id: 'res-1', user_id: 'u-ana', resource_id: 'r-salon', start_time: at(3, 15), end_time: at(3, 19), status: 'confirmed', price: 25, notes: 'Cumpleaños familiar', rejection_reason: null, created_at: daysAgo(4) },
    { id: 'res-2', user_id: 'u-carlos', resource_id: 'r-bbq', start_time: at(5, 12), end_time: at(5, 16), status: 'pending', price: 10, notes: null, rejection_reason: null, created_at: daysAgo(1) },
    { id: 'res-3', user_id: 'u-paola', resource_id: 'r-salon', start_time: at(9, 10), end_time: at(9, 13), status: 'pending', price: 25, notes: 'Reunión de copropietarios de la torre A', rejection_reason: null, created_at: daysAgo(2) },
    { id: 'res-4', user_id: 'u-diego', resource_id: 'r-cancha', start_time: at(2, 18), end_time: at(2, 20), status: 'rejected', price: 10, notes: null, rejection_reason: 'La cancha está en mantenimiento esa semana.', created_at: daysAgo(3) },
    { id: 'res-5', user_id: 'u-majo', resource_id: 'r-piscina', start_time: daysAgo(6, 10), end_time: daysAgo(6, 12), status: 'confirmed', price: 0, notes: null, rejection_reason: null, created_at: daysAgo(10) },
    { id: 'res-6', user_id: 'u-ana', resource_id: 'r-cancha', start_time: daysAgo(12, 17), end_time: daysAgo(12, 19), status: 'confirmed', price: 10, notes: null, rejection_reason: null, created_at: daysAgo(15) },
  ];

  const tickets = [
    { id: 'tk-1', user_id: 'u-ana', subject: 'Fuga de agua en el parqueadero', description: 'Hay una fuga junto al parqueadero 14; el piso está siempre mojado.', category: 'maintenance', status: 'open', admin_notes: null, created_at: daysAgo(1) },
    { id: 'tk-2', user_id: 'u-carlos', subject: 'Luz del pasillo del piso 7 apagada', description: 'La lámpara frente al 7-B no enciende desde el lunes.', category: 'maintenance', status: 'in_progress', admin_notes: 'El electricista viene el jueves por la mañana.', created_at: daysAgo(4) },
    { id: 'tk-3', user_id: 'u-majo', subject: 'Ruido en la madrugada', description: 'Música alta el sábado hasta las 3:00.', category: 'complaint', status: 'resolved', admin_notes: 'Se conversó con el residente y se emitió una multa.', created_at: daysAgo(9) },
    { id: 'tk-4', user_id: 'u-paola', subject: 'Bicicletero en la entrada', description: 'Propongo instalar un bicicletero techado junto a la garita.', category: 'suggestion', status: 'open', admin_notes: null, created_at: daysAgo(6) },
  ].map((t) => ({ ...t, updated_at: t.created_at }));

  const news = [
    { id: 'n-1', title: 'Corte de agua programado', content: 'El jueves de 09:00 a 13:00 se suspenderá el servicio de agua por mantenimiento de la cisterna. Les pedimos almacenar lo necesario.', author_id: 'u-lucia', image_url: null, created_at: daysAgo(1), updated_at: daysAgo(1) },
    { id: 'n-2', title: 'Asamblea general de copropietarios', content: 'Se convoca a la asamblea ordinaria el último sábado del mes a las 10:00 en el Salón Social. Orden del día: presupuesto anual y pintura de fachada.', author_id: 'u-root', image_url: null, created_at: daysAgo(5), updated_at: daysAgo(5) },
    { id: 'n-3', title: 'Bienvenidos a la plataforma', content: 'Desde aquí pueden ver y pagar sus alícuotas, reservar las áreas comunes, enviar solicitudes a la administración y recibir los comunicados del conjunto.', author_id: 'u-root', image_url: null, created_at: daysAgo(30), updated_at: daysAgo(30) },
  ];

  const chat_messages = [
    { id: 'c-1', sender_id: 'u-majo', content: 'Buenos días, vecinos. ¿Alguien encontró un llavero azul cerca de la piscina?', image_url: null, created_at: daysAgo(2, 8) },
    { id: 'c-2', sender_id: 'u-carlos', content: 'Lo dejaron en la garita ayer por la tarde.', image_url: null, created_at: daysAgo(2, 9) },
    { id: 'c-3', sender_id: 'u-majo', content: '¡Gracias, Carlos!', image_url: null, created_at: daysAgo(2, 9) },
    { id: 'c-4', sender_id: 'u-lucia', content: 'Recuerden que el jueves hay corte de agua de 09:00 a 13:00.', image_url: null, created_at: daysAgo(1, 11) },
    { id: 'c-5', sender_id: 'u-paola', content: '¿A qué hora es la asamblea del sábado?', image_url: null, created_at: daysAgo(0, 8) },
    { id: 'c-6', sender_id: 'u-ana', content: 'A las 10:00 en el Salón Social.', image_url: null, created_at: daysAgo(0, 9) },
  ];

  const notifications = [
    { id: 'no-1', user_id: 'u-ana', title: 'Reserva aprobada', message: 'Tu reserva del Salón Social fue aprobada.', type: 'success', link: '/reservations', is_read: false, created_at: daysAgo(1, 16) },
    { id: 'no-2', user_id: 'u-ana', title: 'Nuevo comunicado', message: 'Corte de agua programado', type: 'info', link: '/news', is_read: false, created_at: daysAgo(1, 11) },
    { id: 'no-3', user_id: 'u-ana', title: 'Pago verificado', message: 'La administración aprobó tu alícuota del mes anterior.', type: 'success', link: '/dues', is_read: true, created_at: daysAgo(27) },
    { id: 'no-4', user_id: 'u-carlos', title: 'Comprobante rechazado', message: 'Sube una captura clara de la transferencia.', type: 'warning', link: '/dues', is_read: false, created_at: daysAgo(1) },
    { id: 'no-5', user_id: 'u-lucia', title: 'Nueva solicitud', message: 'Ana Pérez reportó una fuga de agua en el parqueadero.', type: 'info', link: '/admin/tickets', is_read: false, created_at: daysAgo(1) },
  ];

  const access_codes = [
    { id: 'ac-1', code: 'ACC-7K2M9QXD', type: 'visitor', user_id: 'u-ana', visitor_name: 'Roberto Pérez', visitor_document: '1712345678', expires_at: at(1, 22), is_active: true, notes: 'Visita familiar', created_by: 'u-lucia', created_at: daysAgo(0, 9) },
    { id: 'ac-2', code: 'ACC-P4T8W2NB', type: 'visitor', user_id: 'u-diego', visitor_name: 'Servicio de internet', visitor_document: '0991234567001', expires_at: at(0, 18), is_active: true, notes: 'Técnico de instalación', created_by: 'u-lucia', created_at: daysAgo(0, 8) },
    { id: 'ac-3', code: 'ACC-H6R3J9CV', type: 'visitor', user_id: 'u-majo', visitor_name: 'Carmen Vega', visitor_document: '1709876543', expires_at: daysAgo(3, 20), is_active: true, notes: null, created_by: 'u-lucia', created_at: daysAgo(4) },
    { id: 'ac-4', code: 'ACC-Z9L5F1YE', type: 'resident', user_id: 'u-paola', visitor_name: null, visitor_document: null, expires_at: null, is_active: true, notes: 'Tarjeta de respaldo', created_by: 'u-root', created_at: daysAgo(40) },
  ].map((a) => ({ ...a, updated_at: a.created_at }));

  const access_logs = [
    { id: 'al-1', access_code_id: 'ac-1', direction: 'entry', scanned_by: 'u-lucia', created_at: daysAgo(0, 10) },
    { id: 'al-2', access_code_id: 'ac-2', direction: 'entry', scanned_by: 'u-lucia', created_at: daysAgo(0, 9) },
    { id: 'al-3', access_code_id: 'ac-3', direction: 'entry', scanned_by: 'u-lucia', created_at: daysAgo(4, 15) },
    { id: 'al-4', access_code_id: 'ac-3', direction: 'exit', scanned_by: 'u-lucia', created_at: daysAgo(4, 19) },
  ];

  const system_settings = [{ id: 'settings', company_name: "Gestor Residencial — Gissel's 2", primary_color: '#1168bd', secondary_color: '#1e293b', logo_url: null, updated_at: daysAgo(60) }];

  return {
    tables: {
      auth_users, profiles, user_roles, access_tokens, apartment_types: types, resources, dues, payments,
      reservations, tickets, news, chat_messages, notifications, access_codes, access_logs, system_settings,
      kushki_transactions: [],
    },
  };
}
