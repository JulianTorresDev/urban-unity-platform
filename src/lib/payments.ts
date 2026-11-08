import { supabase } from '@/integrations/supabase/client';

export const initiateKushkiPayment = async (amount: number, description: string, paymentId: string) => {
  const { data, error } = await supabase.functions.invoke('kushki-initiate', {
    body: { amount, description, paymentId },
  });

  if (error) throw error;
  return data;
};

export const getPaymentStatus = async (transactionId: string) => {
  const { data, error } = await supabase
    .from('kushki_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (error) throw error;
  return data;
};
