// Alta de residentes con la clave de servicio, solo para la administración.
// Permite desactivar los registros públicos ("Allow new users to sign up"):
// antes el alta usaba signUp con la clave pública desde el navegador.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { authorizeRequest, validateNewResident } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = await authorizeRequest(
    req.headers.get("Authorization"),
    {
      getUserId: async (jwt) => (await supabase.auth.getUser(jwt)).data.user?.id ?? null,
      isAdmin: async (id) => Boolean((await supabase.rpc("is_admin", { _user_id: id })).data),
    },
    true,
    "Solo la administración puede registrar residentes",
  );
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "El cuerpo de la solicitud no es JSON válido" }, 400);
  }
  const parsed = validateNewResident((body ?? {}) as Record<string, unknown>);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const r = parsed.value;

  // El trigger handle_new_user crea el perfil, el rol de residente y la llave QR
  const { data, error } = await supabase.auth.admin.createUser({
    email: r.email,
    password: r.password,
    email_confirm: true,
    user_metadata: { full_name: r.fullName, phone: r.phone },
  });
  if (error || !data.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? "");
    return json({ error: taken ? "Ese correo ya está registrado" : `No se pudo crear la cuenta: ${error?.message ?? "sin detalle"}` }, taken ? 409 : 400);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ apartment_number: r.apartment, phone: r.phone, nfc_card_id: r.nfc })
    .eq("id", data.user.id);
  if (profileError) {
    return json({ id: data.user.id, error: `La cuenta se creó, pero no se pudo asignar la unidad: ${profileError.message}` }, 207);
  }

  console.log("Residente creado", { id: data.user.id, by: auth.userId });
  return json({ id: data.user.id }, 201);
});
