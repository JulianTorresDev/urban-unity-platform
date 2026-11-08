-- ============================================================
-- PRUEBA DE HUMO CONTRA LA BASE REAL DE SUPABASE
--
-- Comprueba las reglas de seguridad suplantando usuarios igual que PostgREST
-- (rol authenticated + "sub" del JWT). Todo ocurre dentro de un bloque que se
-- revierte al final: no quedan usuarios, alícuotas ni reservas de prueba.
--
-- Uso: npx supabase db query --linked --project-ref <ref> -f tests/db/smoke-real.sql
-- ============================================================
CREATE TEMP TABLE IF NOT EXISTS smoke (n INT, caso TEXT, ok BOOLEAN, detalle TEXT);
TRUNCATE smoke;

DO $smoke$
DECLARE
  res TEXT[] := '{}';
  r1 UUID := gen_random_uuid();   -- residente
  r2 UUID := gen_random_uuid();   -- otro residente
  adm UUID := gen_random_uuid();  -- administración
  blk UUID := gen_random_uuid();  -- residente suspendido
  due1 UUID; due2 UUID; area UUID; resv UUID;
  n INT; txt TEXT; st TEXT; price NUMERIC;
  t0 TIMESTAMPTZ := (date_trunc('day', now() AT TIME ZONE 'America/Guayaquil') + INTERVAL '3 days 10 hours') AT TIME ZONE 'America/Guayaquil';
  err TEXT;
BEGIN
  BEGIN
    -- ---------- Preparación (como dueño de la base) ----------
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
    SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
           jsonb_build_object('full_name', u.nombre, 'phone', '+593990000000'), '{}'::jsonb, now(), now(), now()
    FROM (VALUES (r1, 'humo-r1@prueba.invalid', 'Residente Uno'), (r2, 'humo-r2@prueba.invalid', 'Residente Dos'),
                 (adm, 'humo-adm@prueba.invalid', 'Admin Humo'), (blk, 'humo-blk@prueba.invalid', 'Suspendido Humo')) AS u(id, email, nombre);
    UPDATE public.user_roles SET role = 'admin' WHERE user_id = adm;
    UPDATE public.profiles SET status = 'blocked' WHERE id = blk;

    SELECT count(*) INTO n FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = r1 AND ur.role = 'resident' AND p.phone = '+593990000000';
    SELECT format('perfil+rol=%s tokens=%s', n, count(*)), n = 1 AND count(*) >= 1 INTO txt, st
      FROM public.access_tokens WHERE user_id = r1;
    res := res || format('01|Alta: perfil, rol residente y llave QR permanente automáticos|%s|%s', st, txt);

    INSERT INTO public.dues (user_id, year, month, amount, status) VALUES (r1, 2031, 1, 50, 'pending') RETURNING id INTO due1;
    INSERT INTO public.dues (user_id, year, month, amount, status) VALUES (r2, 2031, 1, 50, 'pending') RETURNING id INTO due2;
    INSERT INTO public.resources (name, max_hours_per_booking, available_from, available_until, base_price, price_per_hour)
      VALUES ('Área de humo', 4, '08:00', '22:00', 5, 2) RETURNING id INTO area;

    -- ---------- Como residente r1 ----------
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', r1::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);

    SELECT count(*) INTO n FROM public.profiles;
    res := res || format('02|Residente solo ve su propio perfil|%s|visibles=%s', n = 1, n);

    SELECT count(*) INTO n FROM public.dues WHERE id = due2;
    res := res || format('03|Residente no ve alícuotas de otros|%s|visibles=%s', n = 0, n);

    BEGIN
      UPDATE public.dues SET status = 'paid' WHERE id = due1;
      SELECT status INTO st FROM public.dues WHERE id = due1;
      res := res || format('04|Residente no puede marcar su alícuota como pagada|%s|estado=%s', st <> 'paid', st);
    EXCEPTION WHEN OTHERS THEN
      res := res || format('04|Residente no puede marcar su alícuota como pagada|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      UPDATE public.dues SET receipt_url = 'r1/due-humo.pdf', status = 'pending', rejection_reason = NULL WHERE id = due1;
      GET DIAGNOSTICS n = ROW_COUNT;
      res := res || format('05|Residente sube su comprobante|%s|filas=%s', n = 1, n);
    EXCEPTION WHEN OTHERS THEN
      res := res || format('05|Residente sube su comprobante|false|%s', SQLERRM);
    END;

    BEGIN
      INSERT INTO public.user_roles (user_id, role) VALUES (r1, 'super_admin');
      res := array_append(res, '06|Residente no puede darse un rol de administración|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('06|Residente no puede darse un rol de administración|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      PERFORM public.set_user_role(r1, 'admin');
      res := array_append(res, '07|Residente no puede usar set_user_role|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('07|Residente no puede usar set_user_role|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      UPDATE public.profiles SET apartment_number = '999', status = 'active' WHERE id = r1;
      res := array_append(res, '08|Residente no puede cambiar su departamento ni su estado|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('08|Residente no puede cambiar su departamento ni su estado|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      UPDATE public.profiles SET full_name = 'Residente Uno Editado', phone = '+593991111111' WHERE id = r1;
      GET DIAGNOSTICS n = ROW_COUNT;
      res := res || format('09|Residente edita su nombre y teléfono|%s|filas=%s', n = 1, n);
    EXCEPTION WHEN OTHERS THEN
      res := res || format('09|Residente edita su nombre y teléfono|false|%s', SQLERRM);
    END;

    BEGIN
      INSERT INTO public.reservations (resource_id, user_id, start_time, end_time, status, price)
        VALUES (area, r1, t0, t0 + INTERVAL '2 hours', 'confirmed', 0) RETURNING id, status, reservations.price INTO resv, st, price;
      res := res || format('10|Reserva: el sistema fija estado pendiente y precio|%s|estado=%s precio=%s', st = 'pending' AND price = 9, st, price);
    EXCEPTION WHEN OTHERS THEN
      res := res || format('10|Reserva: el sistema fija estado pendiente y precio|false|%s', SQLERRM);
    END;

    SELECT count(*) INTO n FROM public.get_public_profiles(ARRAY[r2]);
    SELECT to_jsonb(g)::text INTO txt FROM public.get_public_profiles(ARRAY[r2]) g;
    res := res || format('11|Directorio público: solo nombre, sin correo ni teléfono|%s|%s', n = 1 AND txt NOT LIKE '%humo-r2%' AND txt NOT LIKE '%5939%', txt);

    BEGIN
      INSERT INTO public.news (title, content, author_id) VALUES ('Falso', 'Comunicado falso', r1);
      res := array_append(res, '12|Residente no puede publicar comunicados|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('12|Residente no puede publicar comunicados|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      INSERT INTO storage.objects (bucket_id, name) VALUES ('receipts', r2::text || '/ajeno.pdf');
      res := array_append(res, '13|Residente no puede subir a la carpeta de otro|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('13|Residente no puede subir a la carpeta de otro|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      INSERT INTO storage.objects (bucket_id, name) VALUES ('receipts', r1::text || '/propio.pdf');
      res := array_append(res, '14|Residente sube a su propia carpeta|true|ok');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('14|Residente sube a su propia carpeta|false|%s', SQLERRM);
    END;

    BEGIN
      INSERT INTO storage.objects (bucket_id, name) VALUES ('logos', 'logo-falso.png');
      res := array_append(res, '15|Residente no puede cambiar el logo|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('15|Residente no puede cambiar el logo|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      INSERT INTO public.chat_messages (sender_id, content) VALUES (r1, 'Hola, comunidad');
      res := array_append(res, '23|Residente activo escribe en el chat|true|ok');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('23|Residente activo escribe en el chat|false|%s', SQLERRM);
    END;

    -- ---------- Como residente r2: cruce de horario ----------
    PERFORM set_config('request.jwt.claim.sub', r2::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
    BEGIN
      INSERT INTO public.reservations (resource_id, user_id, start_time, end_time)
        VALUES (area, r2, t0 + INTERVAL '1 hour', t0 + INTERVAL '3 hours');
      res := array_append(res, '16|Dos reservas no pueden cruzarse|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err = RETURNED_SQLSTATE;
      res := res || format('16|Dos reservas no pueden cruzarse|%s|%s %s', err = '23P01', err, SQLERRM);
    END;

    -- ---------- Como usuario suspendido ----------
    PERFORM set_config('request.jwt.claim.sub', blk::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', blk, 'role', 'authenticated')::text, true);
    BEGIN
      INSERT INTO public.chat_messages (sender_id, content) VALUES (blk, 'hola');
      res := array_append(res, '17|Usuario suspendido no puede escribir en el chat|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('17|Usuario suspendido no puede escribir en el chat|true|bloqueado: %s', SQLERRM);
    END;

    -- ---------- Como administración ----------
    PERFORM set_config('request.jwt.claim.sub', adm::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO n FROM public.profiles WHERE id IN (r1, r2, blk);
    res := res || format('18|Administración ve a todos los residentes|%s|visibles=%s', n = 3, n);

    BEGIN
      UPDATE public.dues SET status = 'paid', paid_at = now(), rejection_reason = NULL WHERE id = due1;
      GET DIAGNOSTICS n = ROW_COUNT;
      res := res || format('19|Administración aprueba el comprobante|%s|filas=%s', n = 1, n);
    EXCEPTION WHEN OTHERS THEN
      res := res || format('19|Administración aprueba el comprobante|false|%s', SQLERRM);
    END;

    BEGIN
      PERFORM public.set_user_role(r2, 'super_admin');
      res := array_append(res, '20|Administración no puede nombrar superadministradores|false|lo permitió');
    EXCEPTION WHEN OTHERS THEN
      res := res || format('20|Administración no puede nombrar superadministradores|true|bloqueado: %s', SQLERRM);
    END;

    BEGIN
      UPDATE public.reservations SET status = 'confirmed' WHERE id = resv;
      GET DIAGNOSTICS n = ROW_COUNT;
      res := res || format('21|Administración confirma la reserva|%s|filas=%s', n = 1, n);
    EXCEPTION WHEN OTHERS THEN
      res := res || format('21|Administración confirma la reserva|false|%s', SQLERRM);
    END;

    -- ---------- Como visitante anónimo ----------
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SELECT count(*) INTO n FROM public.profiles;
    res := res || format('22|Visitante anónimo no ve perfiles|%s|visibles=%s', n = 0, n);

    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'FIN_PRUEBA_HUMO';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'FIN_PRUEBA_HUMO' THEN
      res := res || format('99|Error inesperado|false|%s', SQLERRM);
    END IF;
  END;

  -- El bloque anterior se revirtió entero; solo se guardan los resultados
  INSERT INTO smoke
  SELECT split_part(x, '|', 1)::INT, split_part(x, '|', 2), split_part(x, '|', 3)::BOOLEAN, split_part(x, '|', 4)
  FROM unnest(res) AS x;
END
$smoke$;

SELECT n, ok, caso, detalle,
       (SELECT count(*) FROM auth.users WHERE email LIKE 'humo-%@prueba.invalid') AS usuarios_que_quedaron
FROM smoke ORDER BY n;
