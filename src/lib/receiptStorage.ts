import { supabase } from '@/integrations/supabase/client';

/**
 * Resizes and compresses an image to an optimized base64 DataURL (WebP or JPEG).
 * Keeps size around ~50-150KB for fast local rendering and resilient fallback.
 */
export const fileToOptimizedDataUrl = (file: File, maxWidth = 1200, quality = 0.8): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      // If it's a PDF or non-image, read directly as DataURL
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const LOCAL_STORAGE_PREFIX = 'gissels2_receipt_';

export const saveLocalReceipt = (id: string, dataUrl: string) => {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${id}`, dataUrl);
  } catch (e) {
    console.warn('LocalStorage full or disabled, skipping receipt cache:', e);
  }
};

export const clearLocalReceipt = (id: string) => {
  try {
    localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${id}`);
  } catch (e) {
    console.warn('Could not clear local receipt cache:', e);
  }
};

export const getReceiptUrl = (id: string, serverUrl?: string | null): string | null => {
  if (serverUrl && serverUrl.trim().length > 0) return serverUrl;
  try {
    return localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${id}`);
  } catch {
    return null;
  }
};

const SAFE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'pdf'];

/**
 * Ruta del comprobante en el bucket: "<id del usuario>/<tipo>-<registro>-<marca>.<ext>".
 * La carpeta del usuario es la que permite la política de storage; la extensión se
 * normaliza para no aceptar nombres arbitrarios (p. ej. "foto.html").
 */
export const receiptPath = (
  userId: string,
  tableName: 'dues' | 'payments',
  recordId: string,
  originalName: string,
  now: number = Date.now()
): string => {
  const ext = originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : '';
  const safeExt = SAFE_EXTENSIONS.includes(ext) ? ext : 'png';
  return `${userId}/${tableName === 'dues' ? 'due' : 'payment'}-${recordId}-${now}.${safeExt}`;
};

/**
 * Resilient receipt uploader:
 * 1. Generates local base64 preview immediately.
 * 2. Attempts to upload to Supabase 'receipts' storage bucket.
 * 3. If storage bucket does not exist or fails with 400, falls back gracefully to base64 data URL.
 * 4. Updates record in database (dues or payments) with receipt_url and pending status.
 */
export const uploadReceiptResilient = async (
  recordId: string,
  file: File,
  tableName: 'dues' | 'payments'
): Promise<{ success: boolean; url: string; usingFallback: boolean; error?: string }> => {
  // Generate fast optimized base64
  const dataUrl = await fileToOptimizedDataUrl(file);
  saveLocalReceipt(recordId, dataUrl);

  let finalUrl = dataUrl;
  let usingFallback = true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const fileName = receiptPath(session?.user.id ?? 'anon', tableName, recordId, file.name);

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, file, { upsert: true });

    if (!uploadError) {
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(fileName);

      if (publicUrl) {
        finalUrl = publicUrl;
        usingFallback = false;
        saveLocalReceipt(recordId, finalUrl);
      }
    } else {
      console.warn('Supabase storage bucket notice, using optimized local buffer fallback:', uploadError.message);
    }
  } catch (storageErr) {
    console.warn('Storage upload exception, continuing with local fallback:', storageErr);
  }

  // Update table in Supabase
  try {
    // Al reenviar se limpia el motivo del rechazo anterior (dues y payments tienen la columna)
    const updatePayload = {
      status: 'pending',
      receipt_url: finalUrl,
      rejection_reason: null,
    };

    const { error: dbError } = await supabase.from(tableName)
      .update(updatePayload)
      .eq('id', recordId);

    if (dbError) {
      // If column receipt_url does not exist yet (code 42703), update status only
      if (dbError.code === '42703' || dbError.message.includes('receipt_url')) {
        console.warn(`Column receipt_url does not exist on ${tableName} yet. Updating status to pending and caching receipt locally.`);
        const { error: retryError } = await supabase.from(tableName)
          .update({ status: 'pending' })
          .eq('id', recordId);
        if (retryError) throw retryError;
      } else {
        throw dbError;
      }
    }
  } catch (err) {
    // Antes se informaba "enviado" aunque la base de datos rechazara el cambio
    console.error(`Error updating ${tableName} record:`, err);
    clearLocalReceipt(recordId);
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message;
    return { success: false, url: finalUrl, usingFallback, error: message || 'No se pudo registrar el comprobante' };
  }

  return { success: true, url: finalUrl, usingFallback };
};
