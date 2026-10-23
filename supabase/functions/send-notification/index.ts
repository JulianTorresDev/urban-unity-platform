import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "ticket_status_change" | "new_announcement" | "reservation_status_change" | "new_dues_generated" | "access_registered";
  ticketId?: string;
  newsId?: string;
  reservationId?: string;
  recipientEmail?: string;
  recipientName?: string;
  action?: "approved" | "rejected";
  reason?: string;
  // For dues
  month?: string;
  year?: string;
  amount?: string;
  // For access
  accessDirection?: "entry" | "exit";
  accessPersonName?: string;
  accessType?: "resident" | "visitor";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { type } = body;

    console.log("Received notification request:", body);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let emailSubject = "";
    let emailHtml = "";

    // ── NEW DUES GENERATED ──
    if (type === "new_dues_generated" && body.recipientEmail) {
      emailSubject = `💰 Nueva alícuota generada - ${body.month}/${body.year}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
              .amount-box { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; text-align: center; margin: 20px 0; }
              .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🏢 Gestor Residencial Gissel's 2</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Nueva Alícuota</p>
              </div>
              <div class="content">
                <p>Hola ${body.recipientName || "Residente"},</p>
                <p>Se ha generado una nueva alícuota para el período <strong>${body.month}/${body.year}</strong>.</p>
                <div class="amount-box">
                  <p style="font-size: 14px; color: #6b7280; margin: 0;">Monto a pagar</p>
                  <p style="font-size: 32px; font-weight: bold; color: #1e3a5f; margin: 10px 0;">$${body.amount}</p>
                </div>
                <p>Ingresa a tu cuenta para ver más detalles y gestionar tu pago.</p>
                <div class="footer">
                  <p>Este es un mensaje automático de Gestor Residencial Gissel's 2.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const emailResponse = await resend.emails.send({
        from: "Gestor Residencial Gissel's 2 <onboarding@resend.dev>",
        to: [body.recipientEmail],
        subject: emailSubject,
        html: emailHtml,
      });

      console.log("Dues notification sent:", emailResponse);
      return new Response(JSON.stringify(emailResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── ACCESS REGISTERED ──
    if (type === "access_registered" && body.recipientEmail) {
      const directionLabel = body.accessDirection === "entry" ? "Entrada" : "Salida";
      const emoji = body.accessDirection === "entry" ? "🟢" : "🔴";
      
      emailSubject = `${emoji} Acceso registrado: ${directionLabel} - ${body.accessPersonName}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
              .access-box { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0; }
              .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🏢 Gestor Residencial Gissel's 2</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Registro de Acceso</p>
              </div>
              <div class="content">
                <p>Hola ${body.recipientName || "Residente"},</p>
                <p>Se ha registrado un acceso en tu residencia:</p>
                <div class="access-box">
                  <p><strong>Persona:</strong> ${body.accessPersonName}</p>
                  <p><strong>Tipo:</strong> ${body.accessType === "visitor" ? "Visitante" : "Residente"}</p>
                  <p><strong>Dirección:</strong> ${directionLabel}</p>
                  <p><strong>Fecha/Hora:</strong> ${new Date().toLocaleString("es-ES", { timeZone: "America/Caracas" })}</p>
                </div>
                <div class="footer">
                  <p>Este es un mensaje automático de Gestor Residencial Gissel's 2.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const emailResponse = await resend.emails.send({
        from: "Gestor Residencial Gissel's 2 <onboarding@resend.dev>",
        to: [body.recipientEmail],
        subject: emailSubject,
        html: emailHtml,
      });

      console.log("Access notification sent:", emailResponse);
      return new Response(JSON.stringify(emailResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── RESERVATION STATUS CHANGE ──
    if (type === "reservation_status_change" && body.reservationId && body.recipientEmail) {
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("*, resources(*)")
        .eq("id", body.reservationId)
        .single();

      if (reservationError) throw reservationError;

      const isApproved = body.action === "approved";
      const statusColor = isApproved ? "#10b981" : "#ef4444";
      const statusText = isApproved ? "APROBADA" : "RECHAZADA";
      const emoji = isApproved ? "✅" : "❌";

      emailSubject = `${emoji} Reservación ${statusText}: ${reservation.resources?.name || "Recurso"}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
              .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; color: white; font-weight: 600; font-size: 14px; }
              .reservation-details { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; border: 1px solid #e5e7eb; }
              .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
              .reason-box { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin-top: 15px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🏢 Gestor Residencial Gissel's 2</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Actualización de Reservación</p>
              </div>
              <div class="content">
                <p>Hola ${body.recipientName || "Residente"},</p>
                <p>Tu solicitud de reservación ha sido <strong>${body.action === "approved" ? "aprobada" : "rechazada"}</strong>.</p>
                
                <div class="reservation-details">
                  <h3 style="margin-top: 0;">${reservation.resources?.name || "Recurso"}</h3>
                  <p><strong>Fecha:</strong> ${new Date(reservation.start_time).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p><strong>Hora:</strong> ${new Date(reservation.start_time).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })} - ${new Date(reservation.end_time).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}</p>
                  <p><strong>Estado:</strong> <span class="status-badge" style="background-color: ${statusColor};">${statusText}</span></p>
                  ${reservation.notes ? `<p><strong>Notas:</strong> ${reservation.notes}</p>` : ""}
                </div>
                
                ${!isApproved && body.reason ? `
                  <div class="reason-box">
                    <p style="margin: 0; font-weight: 600; color: #991b1b;">Razón del rechazo:</p>
                    <p style="margin: 10px 0 0 0; color: #7f1d1d;">${body.reason}</p>
                  </div>
                ` : ""}
                
                <div class="footer">
                  <p>Este es un mensaje automático de Gestor Residencial Gissel's 2.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const emailResponse = await resend.emails.send({
        from: "Gestor Residencial Gissel's 2 <onboarding@resend.dev>",
        to: [body.recipientEmail],
        subject: emailSubject,
        html: emailHtml,
      });

      return new Response(JSON.stringify(emailResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ── TICKET STATUS CHANGE ──
    if (type === "ticket_status_change" && body.ticketId && body.recipientEmail) {
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", body.ticketId)
        .single();

      if (ticketError) throw ticketError;

      const statusColors: Record<string, string> = {
        open: "#f59e0b", in_progress: "#3b82f6", resolved: "#10b981", closed: "#6b7280",
      };

      emailSubject = `📋 Actualización de ticket: ${ticket.subject}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
              .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; color: white; font-weight: 600; font-size: 14px; }
              .ticket-details { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; border: 1px solid #e5e7eb; }
              .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">🏢 Gestor Residencial Gissel's 2</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Actualización de Ticket</p>
              </div>
              <div class="content">
                <p>Hola ${body.recipientName || "Residente"},</p>
                <p>Tu ticket de soporte ha sido actualizado:</p>
                <div class="ticket-details">
                  <h3 style="margin-top: 0;">${ticket.subject}</h3>
                  <p><strong>Categoría:</strong> ${ticket.category}</p>
                  <p><strong>Nuevo Estado:</strong> <span class="status-badge" style="background-color: ${statusColors[ticket.status] || "#6b7280"};">${ticket.status.replace("_", " ").toUpperCase()}</span></p>
                  ${ticket.admin_notes ? `<p><strong>Notas del admin:</strong> ${ticket.admin_notes}</p>` : ""}
                </div>
                <p style="margin-top: 20px;">Ingresa a tu cuenta para ver más detalles.</p>
                <div class="footer">
                  <p>Este es un mensaje automático de Gestor Residencial Gissel's 2.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const emailResponse = await resend.emails.send({
        from: "Gestor Residencial Gissel's 2 <onboarding@resend.dev>",
        to: [body.recipientEmail],
        subject: emailSubject,
        html: emailHtml,
      });

      return new Response(JSON.stringify(emailResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    // ── NEW ANNOUNCEMENT ──
    if (type === "new_announcement" && body.newsId) {
      const { data: news, error: newsError } = await supabase
        .from("news").select("*").eq("id", body.newsId).single();
      if (newsError) throw newsError;

      const { data: profiles } = await supabase.from("profiles").select("email, full_name");

      emailSubject = `📢 Nuevo anuncio: ${news.title}`;
      
      const emailPromises = (profiles || []).map(async (profile) => {
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px; }
                .announcement { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
                .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0;">🏢 Gestor Residencial Gissel's 2</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">Nuevo Anuncio</p>
                </div>
                <div class="content">
                  <p>Hola ${profile.full_name || "Residente"},</p>
                  <div class="announcement">
                    <h2 style="margin-top: 0; color: #1e3a5f;">${news.title}</h2>
                    <p>${news.content.substring(0, 300)}${news.content.length > 300 ? "..." : ""}</p>
                  </div>
                  <p style="margin-top: 20px;">Ingresa a tu cuenta para leer el anuncio completo.</p>
                  <div class="footer"><p>Este es un mensaje automático de Gestor Residencial Gissel's 2.</p></div>
                </div>
              </div>
            </body>
          </html>
        `;
        return resend.emails.send({
          from: "Gestor Residencial Gissel's 2 <onboarding@resend.dev>",
          to: [profile.email],
          subject: emailSubject,
          html,
        });
      });

      await Promise.all(emailPromises);
      return new Response(
        JSON.stringify({ success: true, message: `Enviado a ${(profiles || []).length} residentes` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    throw new Error("Tipo de notificación inválido o faltan parámetros");
  } catch (error: any) {
    console.error("Error in send-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
