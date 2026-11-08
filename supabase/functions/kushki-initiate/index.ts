import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const KUSHKI_PRIVATE_KEY = Deno.env.get('KUSHKI_PRIVATE_KEY')
const KUSHKI_PUBLIC_KEY = Deno.env.get('KUSHKI_PUBLIC_KEY')

serve(async (req) => {
  const { amount, description, paymentId } = await req.json()
  
  // Here you would normally call Kushki API to create a payment intent
  // For now, we return the public key and a mock token
  
  return new Response(
    JSON.stringify({
      token: "mock_token_" + Math.random().toString(36).substr(2, 9),
      public_key: KUSHKI_PUBLIC_KEY || "YOUR_KUSHKI_PUBLIC_KEY"
    }),
    { headers: { "Content-Type": "application/json" } },
  )
})
