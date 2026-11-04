/*
# Set the initial payment QR image

1. Payment configuration
- Point GCash, Maya, and Bank transfer to the supplied public QR image shipped with the app.

2. Notes
- The administrator can replace each channel's QR image from the admin desk without changing the database structure.
- The image is intentionally public because it is a payment destination shown to signed-in players.
*/

UPDATE public.payment_methods
SET qr_path = '/images/payment-methods/bank-payment_(2)_copy_2_copy.jpg', updated_at = now()
WHERE name IN ('GCash', 'Maya', 'Bank transfer');
