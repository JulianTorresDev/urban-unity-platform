import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  const payload = await req.json()
  
  // Logic to handle Kushki webhook
  // payload.ticketNumber, payload.transactionStatus, etc.
  
  const { transactionStatus, metadata } = payload
  
  if (transactionStatus === 'APPROVED') {
    // Update payment in database
    await supabase
      .from('payments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', metadata.paymentId)
      
    // Record transaction
    await supabase
      .from('kushki_transactions')
      .insert({
        payment_id: metadata.paymentId,
        amount: payload.amount,
        status: 'approved',
        response_data: payload
      })
  }
  
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  })
})
