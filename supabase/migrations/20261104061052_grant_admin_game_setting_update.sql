/*
# Allow the admin win-rate control to save

1. Privileges
- Grant authenticated clients update access to the `win_rate` column only.
- The existing row-level policy still requires the signed-in caller to have the admin role.

2. Security
- No balance, role, request, or audit columns are granted.
*/

GRANT UPDATE (win_rate) ON public.game_settings TO authenticated;
