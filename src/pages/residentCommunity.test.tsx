/**
 * HU-10 a HU-20 — Residente: reservas, solicitudes, comunicados, chat, perfil y accesos.
 */
import '@/test/pageSetup';
import { renderPage, futureAt } from '@/test/pageSetup';
import { sb, setUser, resetAll, toasts } from '@/test/supabaseMock';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// El calendario real tiene su propia prueba (abajo); aquí se simula la elección de un turno
vi.mock('@/components/reservations/AvailabilityCalendar', () => ({
  AvailabilityCalendar: ({ onSelectSlot }: { onSelectSlot: (d: Date, h: number) => void }) => {
    const day = new Date();
    day.setDate(day.getDate() + 3);
    return <button type="button" onClick={() => onSelectSlot(day, 10)}>Elegir turno de prueba</button>;
  },
}));

import Reservations from './Reservations';
import Tickets from './Tickets';
import News from './News';
import Chat from './Chat';
import Profile from './Profile';
import AccessQR from './AccessQR';
import MyAccess from './MyAccess';
import Dashboard from './Dashboard';

beforeEach(() => {
  resetAll();
  setUser('ana');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sb.rows.profiles = [{ id: 'ana', full_name: 'Ana Pérez', email: 'ana@gissels2.test', apartment_number: '12', phone: '0991234567', status: 'active' }];
});

describe('Reservas (residente)', () => {
  beforeEach(() => {
    sb.rows.resources = [{ id: 'salon', name: 'Salón Social', base_price: 25, price_per_hour: 0, max_hours_per_booking: 4 }];
    sb.rows.reservations = [];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  const openAndPick = async () => {
    renderPage(<Reservations />);
    await userEvent.click(await screen.findByRole('button', { name: /nueva reserva/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Elegir turno de prueba' }));
  };

  test('UI-V01 solicita una reserva pendiente con el horario elegido', async () => {
    await openAndPick();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Reserva solicitada. La administración la confirmará pronto.'));
    const insert = sb.writes('reservations', 'insert')[0].payload as Record<string, unknown>;
    expect(insert).toMatchObject({ user_id: 'ana', resource_id: 'salon', status: 'pending' });
    const hours = (new Date(insert.end_time as string).getTime() - new Date(insert.start_time as string).getTime()) / 3.6e6;
    expect(new Date(insert.start_time as string).getHours()).toBe(10);
    expect(hours).toBe(2); // duración por defecto
  });

  test('UI-V02 avisa si el horario ya está ocupado y no envía la solicitud', async () => {
    sb.rows.reservations = [{ id: 'otra', resource_id: 'salon', status: 'pending', user_id: 'bruno', start_time: futureAt(3, 9), end_time: futureAt(3, 12), resources: { name: 'Salón Social' } }];
    await openAndPick();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Este espacio ya se encuentra reservado en ese horario'));
    expect(sb.writes('reservations', 'insert')).toHaveLength(0);
  });

  test('UI-V03 muestra el motivo si la base de datos rechaza la reserva', async () => {
    sb.fail('reservations.insert', 'La reserva supera el máximo de 4 horas para esta área');
    await openAndPick();
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining('máximo de 4 horas')));
  });

  test('UI-V04 cancela su reserva vigente', async () => {
    sb.rows.reservations = [{ id: 'mia', resource_id: 'salon', status: 'pending', user_id: 'ana', start_time: futureAt(4, 10), end_time: futureAt(4, 12), resources: sb.rows.resources[0] }];
    renderPage(<Reservations />);
    await userEvent.click(await screen.findByTitle('Cancelar reserva'));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Reserva cancelada correctamente'));
    const upd = sb.writes('reservations', 'update')[0];
    expect(upd.payload).toEqual({ status: 'cancelled' });
    expect(upd.filters).toContainEqual(['eq', ['id', 'mia']]);
  });
});

describe('Solicitudes (residente)', () => {
  beforeEach(() => {
    sb.rows.tickets = [{ id: 't1', user_id: 'ana', subject: 'Fuga en el pasillo', description: 'Agua en el piso', category: 'maintenance', status: 'resolved', admin_notes: 'Plomero asignado el martes', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  });

  test('UI-T01 ve sus solicitudes y la respuesta de la administración', async () => {
    renderPage(<Tickets />);
    expect(await screen.findByText('Fuga en el pasillo')).toBeInTheDocument();
    expect(screen.getByText(/Plomero asignado el martes/)).toBeInTheDocument();
    expect(screen.getAllByText('Resuelta').length).toBeGreaterThan(0);
  });

  test('UI-T02 crea una solicitud con asunto, descripción y categoría', async () => {
    renderPage(<Tickets />);
    await userEvent.click(await screen.findByRole('button', { name: /nueva solicitud/i }));
    await userEvent.type(screen.getByLabelText(/asunto/i), 'Luminaria dañada');
    await userEvent.type(screen.getByLabelText(/descripci/i), 'La luz del bloque B no enciende');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Solicitud enviada. La administración te responderá pronto.'));
    expect(sb.writes('tickets', 'insert')[0].payload).toEqual({
      user_id: 'ana', subject: 'Luminaria dañada', description: 'La luz del bloque B no enciende', category: 'maintenance',
    });
  });

  test('UI-T03 no envía una solicitud vacía', async () => {
    renderPage(<Tickets />);
    await userEvent.click(await screen.findByRole('button', { name: /nueva solicitud/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(sb.writes('tickets', 'insert')).toHaveLength(0);
  });
});

describe('Comunicados', () => {
  beforeEach(() => {
    sb.rows.news = [{ id: 'n1', title: 'Corte de agua', content: 'El jueves de 9 a 12', image_url: null, author_id: 'admin', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  test('UI-N01 el residente lee los comunicados y no ve opciones de edición', async () => {
    renderPage(<News />);
    expect(await screen.findByText('Corte de agua')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publicar comunicado/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
  });

  test('UI-N02 la administración publica un comunicado con su autoría', async () => {
    setUser('admin', 'admin');
    renderPage(<News />);
    await userEvent.click(await screen.findByRole('button', { name: /publicar comunicado/i }));
    const dialog = await screen.findByRole('dialog');
    const [title, content] = within(dialog).getAllByRole('textbox');
    await userEvent.type(title, 'Asamblea general');
    await userEvent.type(content, 'Viernes a las 19:00 en el salón social');
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar|guardar/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Comunicado publicado exitosamente'));
    expect(sb.writes('news', 'insert')[0].payload).toEqual({
      title: 'Asamblea general', content: 'Viernes a las 19:00 en el salón social', image_url: null, author_id: 'admin',
    });
  });

  test('UI-N03 si publicar falla, el formulario sigue abierto con lo escrito', async () => {
    setUser('admin', 'admin');
    sb.fail('news.insert');
    renderPage(<News />);
    await userEvent.click(await screen.findByRole('button', { name: /publicar comunicado/i }));
    const dialog = await screen.findByRole('dialog');
    const [title, content] = within(dialog).getAllByRole('textbox');
    await userEvent.type(title, 'Asamblea');
    await userEvent.type(content, 'Detalle');
    await userEvent.click(within(dialog).getByRole('button', { name: /publicar|guardar/i }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Error al publicar noticia'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getAllByRole('textbox')[0]).toHaveValue('Asamblea');
  });

  test('UI-N04 la administración elimina un comunicado tras confirmar', async () => {
    setUser('admin', 'admin');
    renderPage(<News />);
    await userEvent.click(await screen.findByRole('button', { name: /eliminar/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Comunicado eliminado con éxito'));
    expect(sb.writes('news', 'delete')[0].filters).toContainEqual(['eq', ['id', 'n1']]);
  });
});

describe('Chat comunitario', () => {
  beforeEach(() => {
    sb.rows.chat_messages = [{ id: 'm1', sender_id: 'bruno', content: 'Buenos días, vecinos', image_url: null, created_at: new Date().toISOString() }];
    sb.rpcResults.get_public_profiles = { data: [{ id: 'bruno', full_name: 'Bruno Ruiz', apartment_number: '34' }], error: null };
    Element.prototype.scrollIntoView = vi.fn();
  });

  test('UI-H01 muestra los mensajes con el nombre y la unidad de cada vecino', async () => {
    renderPage(<Chat />);
    expect(await screen.findByText('Buenos días, vecinos')).toBeInTheDocument();
    expect(await screen.findByText('Bruno Ruiz')).toBeInTheDocument();
    expect(sb.calls.find((c) => c.table === 'rpc:get_public_profiles')?.payload).toEqual({ _ids: ['bruno'] });
  });

  test('UI-H02 envía un mensaje a nombre propio', async () => {
    renderPage(<Chat />);
    await userEvent.type(await screen.findByLabelText('Mensaje para la comunidad'), 'Hola a todos');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await waitFor(() => expect(sb.writes('chat_messages', 'insert')).toHaveLength(1));
    expect(sb.writes('chat_messages', 'insert')[0].payload).toEqual({ sender_id: 'ana', content: 'Hola a todos', image_url: null });
  });

  test('UI-H03 si el envío falla, retira el mensaje y avisa', async () => {
    sb.fail('chat_messages.insert', 'new row violates row-level security policy');
    renderPage(<Chat />);
    await userEvent.type(await screen.findByLabelText('Mensaje para la comunidad'), 'Mensaje bloqueado');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Error al enviar el mensaje'));
    expect(screen.queryByText('Mensaje bloqueado')).not.toBeInTheDocument();
  });
});

describe('Perfil', () => {
  test('UI-F01 guarda nombre y teléfono sin enviar la unidad', async () => {
    renderPage(<Profile />);
    const name = await screen.findByLabelText(/nombre completo/i);
    await waitFor(() => expect(name).toHaveValue('Ana Pérez'));
    await userEvent.clear(name);
    await userEvent.type(name, 'Ana María Pérez');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Perfil actualizado correctamente'));
    const payload = sb.writes('profiles', 'update')[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ full_name: 'Ana María Pérez', phone: '0991234567' });
    expect(payload).not.toHaveProperty('apartment_number');
  });

  test('UI-F02 la unidad se muestra pero no se puede editar', async () => {
    renderPage(<Profile />);
    const apt = await screen.findByLabelText(/departamento/i);
    await waitFor(() => expect(apt).toHaveValue('12'));
    expect(apt).toHaveAttribute('readonly');
  });
});

describe('Accesos', () => {
  test('UI-Q01 la llave digital muestra el código QR del residente', async () => {
    sb.rows.access_tokens = [{ user_id: 'ana', token: 'a'.repeat(64), type: 'permanent' }];
    const { container } = renderPage(<AccessQR />);
    await waitFor(() => expect(container.querySelector('svg[height="220"], svg[role="img"], svg')).toBeTruthy());
    expect(await screen.findByText('Código activo')).toBeInTheDocument();
  });

  test('UI-Q02 sin token asignado lo indica claramente', async () => {
    renderPage(<AccessQR />);
    expect(await screen.findByText('Sin código asignado')).toBeInTheDocument();
  });

  test('UI-Q03 un residente suspendido ve el aviso de acceso suspendido', async () => {
    sb.rows.profiles[0].status = 'blocked';
    sb.rows.access_tokens = [{ user_id: 'ana', token: 'b'.repeat(64), type: 'permanent' }];
    renderPage(<AccessQR />);
    expect(await screen.findByText('Acceso suspendido')).toBeInTheDocument();
  });

  test('UI-Q04 ve sus pases emitidos y su bitácora de ingresos', async () => {
    sb.rows.access_codes = [{ id: 'c1', user_id: 'ana', code: 'ACC-PRUEBA1', type: 'visitor', visitor_name: 'Técnico', is_active: true, expires_at: futureAt(1, 18), created_at: new Date().toISOString() }];
    sb.rows.access_logs = [{ id: 'l1', access_code_id: 'c1', direction: 'entry', created_at: new Date().toISOString() }];
    renderPage(<MyAccess />);
    expect(await screen.findByText('ACC-PRUEBA1')).toBeInTheDocument();
    expect(await screen.findByText(/Ingreso registrado/)).toBeInTheDocument();
  });
});

describe('Inicio del residente', () => {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();

  test('UI-I01 con la alícuota pendiente invita a subir el comprobante', async () => {
    sb.rows.dues = [{ id: 'd1', user_id: 'ana', amount: 50, month: m, year: y, status: 'pending', receipt_url: null }];
    renderPage(<Dashboard />);
    expect(await screen.findByText('Tienes una alícuota pendiente de pago.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /subir comprobante/i })).toHaveAttribute('href', '/dues');
  });

  test('UI-I02 con el comprobante enviado indica que está en revisión', async () => {
    sb.rows.dues = [{ id: 'd1', user_id: 'ana', amount: 50, month: m, year: y, status: 'pending', receipt_url: 'https://cdn.test/x.pdf' }];
    renderPage(<Dashboard />);
    expect(await screen.findByText('Recibimos tu comprobante. La administración lo está revisando.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reemplazar comprobante/i })).toBeInTheDocument();
  });

  test('UI-I03 al día: ofrece la llave QR', async () => {
    sb.rows.dues = [{ id: 'd1', user_id: 'ana', amount: 50, month: m, year: y, status: 'paid', receipt_url: 'https://cdn.test/x.pdf' }];
    renderPage(<Dashboard />);
    expect(await screen.findByText('Estás al día con tus alícuotas.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver mi acceso qr/i })).toHaveAttribute('href', '/access');
  });
});
