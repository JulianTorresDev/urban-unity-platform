/**
 * Flujos restantes: redirección inicial, tipos de departamento, roles, logo, imagen en el chat y perfil.
 */
import '@/test/pageSetup';
import { renderPage } from '@/test/pageSetup';
import { sb, setUser, resetAll, toasts, auth } from '@/test/supabaseMock';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Index from './Index';
import ManageDues from './admin/ManageDues';
import ManageUsers from './admin/ManageUsers';
import AdminSettings from './admin/AdminSettings';
import Chat from './Chat';
import Profile from './Profile';

beforeEach(() => {
  resetAll();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sb.rows.profiles = [
    { id: 'ana', full_name: 'Ana Pérez', email: 'ana@gissels2.test', apartment_number: '12', phone: null, status: 'active', created_at: new Date().toISOString() },
    { id: 'root', full_name: 'Julián Torres', email: 'root@gissels2.test', apartment_number: null, phone: null, status: 'active', created_at: new Date().toISOString() },
  ];
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('Entrada a la aplicación', () => {
  const at = (path: string) =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<p>Inicio</p>} />
          <Route path="/auth" element={<p>Acceso</p>} />
        </Routes>
      </MemoryRouter>
    );

  test('UI-Z01 sin sesión, la raíz lleva a la pantalla de acceso', async () => {
    at('/');
    expect(await screen.findByText('Acceso')).toBeInTheDocument();
  });

  test('UI-Z02 con sesión, la raíz lleva al inicio', async () => {
    setUser('ana');
    at('/');
    expect(await screen.findByText('Inicio')).toBeInTheDocument();
  });
});

describe('Tipos de departamento', () => {
  beforeEach(() => {
    setUser('admin', 'admin');
    sb.rows.apartment_types = [];
    sb.rows.dues = [];
  });

  const openNewType = async () => {
    renderPage(<ManageDues />);
    await userEvent.click(await screen.findByRole('tab', { name: /tipos de departamento/i }));
    await userEvent.click(await screen.findByRole('button', { name: /nuevo modelo/i }));
    return screen.findByRole('dialog');
  };

  test('UI-M05 crea un tipo de departamento con su cuota', async () => {
    const dialog = await openNewType();
    await userEvent.type(within(dialog).getByLabelText(/nombre del tipo/i), ' Suite 3 habitaciones ');
    await userEvent.type(within(dialog).getByLabelText(/cuota mensual/i), '75');
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar modelo/i }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Tipo creado'));
    expect(sb.writes('apartment_types', 'insert')[0].payload).toEqual({ name: 'Suite 3 habitaciones', monthly_fee: 75, description: null });
  });

  test('UI-M06 no acepta una cuota negativa', async () => {
    const dialog = await openNewType();
    await userEvent.type(within(dialog).getByLabelText(/nombre del tipo/i), 'Bodega');
    await userEvent.type(within(dialog).getByLabelText(/cuota mensual/i), '-10');
    await userEvent.click(within(dialog).getByRole('button', { name: /guardar modelo/i }));
    expect(toasts.error).toHaveBeenCalledWith('La cuota mensual no puede ser negativa');
    expect(sb.writes('apartment_types')).toHaveLength(0);
  });
});

describe('Roles', () => {
  beforeEach(() => {
    sb.rows.user_roles = [{ user_id: 'ana', role: 'resident' }, { user_id: 'root', role: 'super_admin' }];
    sb.rows.access_tokens = [];
  });

  test('UI-U04 el superadministrador promueve a un residente con la función atómica', async () => {
    setUser('root', 'super_admin');
    renderPage(<ManageUsers />);
    await screen.findAllByText('Ana Pérez');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Administrador' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Rol actualizado con éxito'));
    expect(sb.calls.find((c) => c.table === 'rpc:set_user_role')?.payload).toEqual({ _target: 'ana', _role: 'admin' });
    expect(sb.writes('user_roles')).toHaveLength(0); // ya no se usa upsert
  });

  test('UI-U05 un administrador no ve el selector de roles', async () => {
    setUser('admin', 'admin');
    renderPage(<ManageUsers />);
    await screen.findAllByText('Ana Pérez');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  test('UI-U06 si la base rechaza el cambio de rol, se muestra el motivo', async () => {
    setUser('root', 'super_admin');
    sb.fail('rpc:set_user_role', 'Solo un superadministrador puede asignar o modificar ese rol');
    renderPage(<ManageUsers />);
    await screen.findAllByText('Ana Pérez');
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Administrador' }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith(expect.stringContaining('superadministrador')));
  });
});

describe('Logo del conjunto', () => {
  beforeEach(() => setUser('admin', 'admin'));
  const logoInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  test('UI-W03 sube un logo válido al bucket de logos', async () => {
    renderPage(<AdminSettings />);
    await screen.findAllByRole('button', { name: /subir imagen/i });
    fireEvent.change(logoInput(), { target: { files: [new File(['png'], 'logo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith('Logo subido con éxito'));
    expect(sb.calls.find((c) => c.table === 'storage:logos')).toBeDefined();
  });

  test('UI-W04 rechaza archivos que no son imagen o pesan más de 3 MB', async () => {
    renderPage(<AdminSettings />);
    await screen.findAllByRole('button', { name: /subir imagen/i });
    fireEvent.change(logoInput(), { target: { files: [new File(['x'], 'logo.pdf', { type: 'application/pdf' })] } });
    expect(toasts.error).toHaveBeenCalledWith('Por favor selecciona una imagen válida (PNG, JPG, SVG o WEBP)');
    const big = new File(['x'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 4 * 1024 * 1024 });
    fireEvent.change(logoInput(), { target: { files: [big] } });
    expect(toasts.error).toHaveBeenCalledWith('El tamaño de la imagen no debe superar los 3 MB');
    expect(sb.calls.find((c) => c.table === 'storage:logos')).toBeUndefined();
  });
});

describe('Imagen en el chat', () => {
  beforeEach(() => {
    setUser('ana');
    sb.rows.chat_messages = [];
  });
  const imageInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  test('UI-H04 adjunta una foto: se sube a la carpeta propia y se envía con el mensaje', async () => {
    renderPage(<Chat />);
    await screen.findByLabelText('Mensaje para la comunidad');
    fireEvent.change(imageInput(), { target: { files: [new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' })] } });
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await waitFor(() => expect(sb.writes('chat_messages', 'insert')).toHaveLength(1));
    const upload = sb.calls.find((c) => c.table === 'storage:chat_images')!;
    expect((upload.payload as { path: string }).path).toMatch(/^ana\/.+\.jpg$/);
    expect((sb.writes('chat_messages', 'insert')[0].payload as { image_url: string }).image_url).toContain('https://cdn.test/chat_images/ana/');
  });

  test('UI-H05 no adjunta archivos que no son imágenes', async () => {
    renderPage(<Chat />);
    await screen.findByLabelText('Mensaje para la comunidad');
    fireEvent.change(imageInput(), { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } });
    expect(toasts.error).toHaveBeenCalledWith('Solo se pueden adjuntar imágenes');
  });
});

describe('Perfil: validación', () => {
  test('UI-F03 no guarda el perfil con el nombre vacío', async () => {
    setUser('ana');
    renderPage(<Profile />);
    const name = await screen.findByLabelText(/nombre completo/i);
    await waitFor(() => expect(name).toHaveValue('Ana Pérez'));
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(sb.writes('profiles')).toHaveLength(0);
  });
});

void auth;
