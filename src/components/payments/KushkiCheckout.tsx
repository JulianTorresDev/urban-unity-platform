import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, ShieldCheck } from 'lucide-react';
import { initiateKushkiPayment } from '@/lib/payments';
import { toast } from 'sonner';

interface KushkiCheckoutProps {
  amount: number;
  description: string;
  paymentId: string;
  onSuccess?: () => void;
}

declare global {
  interface Window {
    KushkiCheckout?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const KushkiCheckout = ({ amount, description, paymentId, onSuccess }: KushkiCheckoutProps) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    try {
      // 1. Get transaction token from our backend (Edge Function)
      const { token, public_key } = await initiateKushkiPayment(amount, description, paymentId);

      if (!window.KushkiCheckout) {
        throw new Error('Kushki SDK not loaded');
      }

      // 2. Open Kushki Smart Checkout
      const checkout = new window.KushkiCheckout({
        formId: 'kushki-form',
        publicId: public_key,
        amount: {
          currency: 'USD',
          subtotalIva: 0,
          iva: 0,
          subtotalIva0: amount,
        },
        callbackUrl: window.location.origin + '/payments/verify',
        onSuccess: () => {
          toast.success('Pago aprobado.');
          onSuccess?.();
        },
        onFailed: (response: { message?: string }) => {
          toast.error('El pago no pudo completarse: ' + response.message);
        }
      });

      checkout.open();
    } catch (error) {
      console.error('Kushki error:', error);
      toast.error('No se pudo iniciar el proceso de pago. Intente más tarde.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load Kushki Script
    if (!window.KushkiCheckout) {
      const script = document.createElement('script');
      script.src = 'https://cdn.kushkipagos.com/kushki-checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  return (
    <Button 
      onClick={handlePayment} 
      disabled={loading} 
      className="w-full h-12 rounded-xl bg-action hover:bg-action/90 text-action-foreground font-semibold shadow-lg gap-2 transition-[color,background-color,border-color,box-shadow,opacity,transform] active:scale-95"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <ShieldCheck className="w-5 h-5" />
      )}
      PAGAR ${(amount).toFixed(2)}
    </Button>
  );
};

export default KushkiCheckout;
