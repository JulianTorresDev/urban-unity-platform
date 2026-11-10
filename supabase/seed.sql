-- ============================================================
-- DATOS INICIALES — Gestor Residencial Gissel's 2
--
-- Configuración de marca, tipos de departamento, áreas comunes y un primer
-- comunicado. No crea cuentas: los usuarios se dan de alta desde la app o con
-- scripts/seed_users.mjs. Idempotente: no duplica nada si se ejecuta otra vez.
-- ============================================================

-- Marca del conjunto
INSERT INTO public.system_settings (company_name, primary_color, secondary_color)
SELECT 'Gestor Residencial — Gissel''s 2', '#9b272d', '#42393b'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- Tipos de departamento y su alícuota mensual
INSERT INTO public.apartment_types (name, monthly_fee, description)
SELECT v.name, v.fee, v.description
FROM (VALUES
  ('Departamento 1 habitación', 40.00, 'Unidades de una habitación'),
  ('Departamento 2 habitaciones', 50.00, 'Unidades de dos habitaciones'),
  ('Departamento 3 habitaciones', 65.00, 'Unidades de tres habitaciones'),
  ('Casa', 80.00, 'Casas del conjunto')
) AS v(name, fee, description)
WHERE NOT EXISTS (SELECT 1 FROM public.apartment_types t WHERE t.name = v.name);

-- Áreas comunes reservables (horario en hora de Ecuador)
INSERT INTO public.resources (name, description, max_hours_per_booking, available_from, available_until, base_price, price_per_hour)
SELECT v.name, v.description, v.max_hours, v.desde::time, v.hasta::time, v.base, v.por_hora
FROM (VALUES
  ('Salón Social', 'Espacio cerrado para reuniones y eventos privados', 4, '09:00', '22:00', 25.00, 0.00),
  ('Zona BBQ', 'Parrillas y mesas al aire libre', 4, '10:00', '21:00', 10.00, 0.00),
  ('Piscina', 'Zona de piscina y descanso', 3, '08:00', '19:00', 0.00, 0.00),
  ('Cancha múltiple', 'Fútbol, básquet y vóley', 2, '07:00', '21:00', 0.00, 5.00)
) AS v(name, description, max_hours, desde, hasta, base, por_hora)
WHERE NOT EXISTS (SELECT 1 FROM public.resources r WHERE r.name = v.name);

-- Primer comunicado
INSERT INTO public.news (title, content)
SELECT 'Bienvenidos a la plataforma',
       'Desde aquí pueden ver y pagar sus alícuotas, reservar las áreas comunes, enviar solicitudes a la administración y recibir los comunicados del conjunto.'
WHERE NOT EXISTS (SELECT 1 FROM public.news WHERE title = 'Bienvenidos a la plataforma');
