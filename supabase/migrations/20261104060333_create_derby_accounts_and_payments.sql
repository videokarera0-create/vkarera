/*
# Create Derby accounts, wallet approvals, game controls, and payment proofs

1. New Tables
- `user_roles`: immutable role assignments for authenticated accounts; only a server-checked admin function may change roles.
- `profiles`: public account details tied to Supabase Auth users.
- `wallets`: server-controlled player balances.
- `coin_transactions`: append-only wallet ledger.
- `coin_requests`: recharge and withdrawal requests, including private proof image paths.
- `game_settings`: the single administrative win-rate setting.
- `payment_methods`: administrator-managed GCash, Maya, and bank transfer instructions and QR image paths.
- `player_races`: race records reserved for trusted server-side settlement.

2. Account and wallet behavior
- New email/password accounts automatically receive a profile, wallet, and welcome ledger entry.
- Wallet balances, request status, roles, and audit fields are not client-writable.
- Withdrawals reserve funds immediately; rejected withdrawals are refunded atomically.
- Approved recharges add funds atomically.

3. Security
- Row level security is enabled on every new table.
- Authenticated users can read only their own private records; admins can review protected records.
- Admin-only mutations use SECURITY DEFINER functions that verify the caller's role with auth.uid().
- Payment proofs are stored in a private `payment-proofs` bucket and are restricted to the uploader and admins.
- Client file uploads are limited to image MIME types and 5 MB by bucket configuration.

4. Important notes
- Supabase Auth email/password is the account system; no custom password table is created.
- The first administrator must be assigned by a trusted operator after the operator's account exists. No public self-serve admin escalation is provided.
- The frontend must never be trusted for balances, approvals, roles, or win-rate authorization.
*/

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  avatar text NOT NULL DEFAULT 'horse',
  referral_code text NOT NULL UNIQUE,
  referred_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 10000 CHECK (balance >= 0)
);

CREATE TABLE public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.coin_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recharge', 'withdrawal')),
  amount bigint NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
  proof_path text,
  payment_method text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz
);

CREATE TABLE public.game_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  win_rate integer NOT NULL DEFAULT 20 CHECK (win_rate BETWEEN 0 AND 100)
);

CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (name IN ('GCash', 'Maya', 'Bank transfer')),
  account_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  qr_path text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.player_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stake bigint NOT NULL CHECK (stake > 0),
  payout bigint NOT NULL DEFAULT 0,
  bet_type text NOT NULL,
  picks integer[] NOT NULL,
  finish_order integer[] NOT NULL,
  finish_times double precision[] NOT NULL,
  win_rate integer NOT NULL CHECK (win_rate BETWEEN 0 AND 100),
  started_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE UNIQUE INDEX one_active_race ON public.player_races(user_id) WHERE settled_at IS NULL;
CREATE INDEX coin_requests_status_created_idx ON public.coin_requests(status, created_at DESC);
CREATE INDEX coin_requests_user_created_idx ON public.coin_requests(user_id, created_at DESC);

INSERT INTO public.game_settings (id, win_rate) VALUES (true, 20) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.payment_methods (name, account_name, account_number, instructions) VALUES
  ('GCash', '', '', 'Send your payment to the account shown, then upload a clear screenshot of your receipt.'),
  ('Maya', '', '', 'Send your payment to the account shown, then upload a clear screenshot of your receipt.'),
  ('Bank transfer', '', '', 'Transfer to the account shown, then upload a clear screenshot of your receipt.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.create_player_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE code text;
BEGIN
  LOOP
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  INSERT INTO public.profiles (id, username, referral_code)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'username', 'Player'), 30), code);
  INSERT INTO public.wallets (user_id) VALUES (NEW.id);
  INSERT INTO public.coin_transactions (user_id, amount, reason) VALUES (NEW.id, 10000, 'Welcome coins');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_player ON auth.users;
CREATE TRIGGER create_player AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_player_profile();

CREATE OR REPLACE FUNCTION public.claim_referral(code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE ref uuid; me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = me AND referred_by IS NOT NULL) THEN RAISE EXCEPTION 'Referral already claimed'; END IF;
  SELECT id INTO ref FROM public.profiles WHERE referral_code = upper(trim(code));
  IF ref IS NULL OR ref = me THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  UPDATE public.profiles SET referred_by = ref WHERE id = me;
  UPDATE public.wallets SET balance = balance + 10 WHERE user_id IN (me, ref);
  INSERT INTO public.coin_transactions (user_id, amount, reason) VALUES (me, 10, 'Referral bonus'), (ref, 10, 'Referral bonus');
END;
$$;

CREATE OR REPLACE FUNCTION public.request_coins(request_kind text, coins bigint, request_proof_path text DEFAULT NULL, request_payment_method text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE rid uuid; me uuid := auth.uid(); bal bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF request_kind NOT IN ('recharge', 'withdrawal') OR coins NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF request_kind = 'recharge' AND request_proof_path IS NULL THEN RAISE EXCEPTION 'Payment proof required'; END IF;
  IF request_kind = 'withdrawal' THEN
    SELECT balance INTO bal FROM public.wallets WHERE user_id = me FOR UPDATE;
    IF bal IS NULL OR bal < coins THEN RAISE EXCEPTION 'Not enough coins'; END IF;
    UPDATE public.wallets SET balance = balance - coins WHERE user_id = me;
    INSERT INTO public.coin_transactions (user_id, amount, reason) VALUES (me, -coins, 'Withdrawal reserved');
  END IF;
  INSERT INTO public.coin_requests (user_id, kind, amount, proof_path, payment_method)
  VALUES (me, request_kind, coins, request_proof_path, request_payment_method) RETURNING id INTO rid;
  RETURN rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_coins(request_id uuid, approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.coin_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO r FROM public.coin_requests WHERE id = request_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'Request already reviewed'; END IF;
  IF (approve AND r.kind = 'recharge') OR (NOT approve AND r.kind = 'withdrawal') THEN
    UPDATE public.wallets SET balance = balance + r.amount WHERE user_id = r.user_id;
    INSERT INTO public.coin_transactions (user_id, amount, reason)
    VALUES (r.user_id, r.amount, CASE WHEN approve THEN 'Recharge approved' ELSE 'Withdrawal refunded' END);
  END IF;
  UPDATE public.coin_requests SET status = CASE WHEN approve THEN 'approved' ELSE 'rejected' END, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(target_user_id uuid, new_username text, new_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  UPDATE public.profiles SET username = left(trim(new_username), 30), phone = left(trim(new_phone), 40) WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_role(target_user_id uuid, new_role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF target_user_id = auth.uid() AND new_role <> 'admin' THEN RAISE EXCEPTION 'Cannot remove your own admin access'; END IF;
  DELETE FROM public.user_roles WHERE user_id = target_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (target_user_id, new_role);
END;
$$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_races ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, UPDATE (username, phone, avatar) ON public.profiles TO authenticated;
GRANT SELECT ON public.wallets, public.coin_transactions, public.coin_requests, public.player_races TO authenticated;
GRANT SELECT ON public.game_settings, public.payment_methods TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral(text), public.request_coins(text, bigint, text, text), public.review_coins(uuid, boolean), public.admin_update_profile(uuid, text, text), public.admin_set_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS wallets_select_own_or_admin ON public.wallets;
CREATE POLICY wallets_select_own_or_admin ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS transactions_select_own_or_admin ON public.coin_transactions;
CREATE POLICY transactions_select_own_or_admin ON public.coin_transactions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS requests_select_own_or_admin ON public.coin_requests;
CREATE POLICY requests_select_own_or_admin ON public.coin_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS settings_select_authenticated ON public.game_settings;
CREATE POLICY settings_select_authenticated ON public.game_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS settings_update_admin ON public.game_settings;
CREATE POLICY settings_update_admin ON public.game_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS settings_insert_admin ON public.game_settings;
CREATE POLICY settings_insert_admin ON public.game_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS payment_methods_select_authenticated ON public.payment_methods;
CREATE POLICY payment_methods_select_authenticated ON public.payment_methods FOR SELECT TO authenticated USING (enabled OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS payment_methods_update_admin ON public.payment_methods;
CREATE POLICY payment_methods_update_admin ON public.payment_methods FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS payment_methods_insert_admin ON public.payment_methods;
CREATE POLICY payment_methods_insert_admin ON public.payment_methods FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS payment_methods_delete_admin ON public.payment_methods;
CREATE POLICY payment_methods_delete_admin ON public.payment_methods FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS races_select_own_or_admin ON public.player_races;
CREATE POLICY races_select_own_or_admin ON public.player_races FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON FUNCTION public.claim_referral(text), public.request_coins(text, bigint, text, text), public.review_coins(uuid, boolean), public.admin_update_profile(uuid, text, text), public.admin_set_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS payment_proofs_insert_own ON storage.objects;
CREATE POLICY payment_proofs_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS payment_proofs_select_own_or_admin ON storage.objects;
CREATE POLICY payment_proofs_select_own_or_admin ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
DROP POLICY IF EXISTS payment_proofs_delete_own ON storage.objects;
CREATE POLICY payment_proofs_delete_own ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
