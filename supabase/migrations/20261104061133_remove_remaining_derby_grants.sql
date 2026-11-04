/*
# Remove remaining unnecessary Derby grants

1. Security
- Remove direct authenticated INSERT and DELETE access from profiles and payment methods.
- Revoke direct calls to the signup trigger function; it is invoked only by the auth trigger.
- Keep the existing authenticated read policies and admin-checked functions unchanged.

2. Data safety
- This changes privileges only and does not modify or delete application records.
*/

REVOKE INSERT, DELETE ON public.profiles, public.payment_methods FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_player_profile() FROM PUBLIC, anon, authenticated;
