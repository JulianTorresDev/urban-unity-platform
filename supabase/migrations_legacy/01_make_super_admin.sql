-- ============================================================
-- HACER UN USUARIO SUPER ADMIN
-- Ejecutar DESPUÉS de registrar tu primer usuario
-- ============================================================

-- Opción 1: Promover por email (RECOMENDADO)
-- Reemplaza 'tu@email.com' con el correo que usaste al registrarte
UPDATE public.user_roles 
SET role = 'super_admin' 
WHERE user_id = (
  SELECT id FROM public.profiles WHERE email = 'julytorreta@gmail.com'
);

-- Verificar que funcionó:
SELECT p.email, p.full_name, r.role 
FROM public.profiles p 
JOIN public.user_roles r ON r.user_id = p.id;
