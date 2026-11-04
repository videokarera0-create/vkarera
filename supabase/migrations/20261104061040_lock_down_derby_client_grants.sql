/*
# Lock down Derby client grants

1. Security correction
- Remove inherited anon and authenticated write privileges from account, wallet, request, role, race, and settings tables.
- Keep only the authenticated SELECT access required by the player and admin screens.
- Keep profile self-edit access limited to username, phone, and avatar.
- Keep QR path updates available to authenticated admins; the row policy remains the admin gate.
- Wallet balances, ledger rows, requests, roles, races, and win-rate values are changed only through trusted server functions or admin-protected paths.

2. Important notes
- Row-level security remains enabled and continues to decide which authenticated rows are visible.
- This migration changes grants only; no user data is deleted or rewritten.
*/

REVOKE ALL ON public.user_roles, public.profiles, public.wallets, public.coin_transactions, public.coin_requests, public.game_settings, public.payment_methods, public.player_races FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles, public.wallets, public.coin_transactions, public.coin_requests, public.player_races FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.game_settings FROM authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.payment_methods FROM authenticated;

GRANT SELECT ON public.user_roles, public.profiles, public.wallets, public.coin_transactions, public.coin_requests, public.game_settings, public.payment_methods, public.player_races TO authenticated;
GRANT UPDATE (username, phone, avatar) ON public.profiles TO authenticated;
GRANT UPDATE (qr_path) ON public.payment_methods TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral(text), public.request_coins(text, bigint, text, text), public.review_coins(uuid, boolean), public.admin_update_profile(uuid, text, text), public.admin_set_role(uuid, public.app_role) TO authenticated;
