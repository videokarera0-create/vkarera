/*
# Add public payment QR storage

1. Storage
- Create the `payment-qr` bucket as public because payment QR codes are intentionally shown to signed-in players.
- Limit uploads to common image formats and 5 MB.

2. Security
- Only authenticated administrators can upload, update, or delete QR files.
- Authenticated users can read QR files so the recharge screen can display them.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-qr', 'payment-qr', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS payment_qr_select_authenticated ON storage.objects;
CREATE POLICY payment_qr_select_authenticated ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'payment-qr');
DROP POLICY IF EXISTS payment_qr_insert_admin ON storage.objects;
CREATE POLICY payment_qr_insert_admin ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS payment_qr_update_admin ON storage.objects;
CREATE POLICY payment_qr_update_admin ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS payment_qr_delete_admin ON storage.objects;
CREATE POLICY payment_qr_delete_admin ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));
