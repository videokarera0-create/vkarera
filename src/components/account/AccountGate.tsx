import { useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthPanel } from "./AuthPanel";
import { AccountCenter } from "./AccountCenter";

interface AccountGateProps { children: ReactNode }
type Profile = { id: string; username: string; phone: string; created_at: string };

export function AccountGate({ children }: AccountGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [balance, setBalance] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAccount = async (user: User) => {
    const [{ data: profileData }, { data: walletData }, { data: roleData }] = await Promise.all([
      supabase.from("profiles").select("id, username, phone, created_at").eq("id", user.id).maybeSingle(),
      supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
    ]);
    setProfile(profileData as Profile | null);
    setBalance(Number((walletData as { balance?: number } | null)?.balance ?? 0));
    setIsAdmin(Boolean(roleData));
  };

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await refreshAccount(data.session.user);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        void (async () => { await refreshAccount(nextSession.user); setLoading(false); })();
      } else {
        setProfile(null); setBalance(0); setIsAdmin(false); setLoading(false);
      }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#0b1512] text-[#e8c96d]"><p className="font-hud text-xs font-bold uppercase tracking-[0.25em]">Opening race room</p></div>;
  if (!session) return <AuthPanel onAuthenticated={() => undefined} />;

  return <div className="relative min-h-screen">{children}<button onClick={() => setAccountOpen(true)} className="fixed bottom-4 right-4 z-20 rounded-full border border-[#e8c96d]/50 bg-[#10221b]/95 px-4 py-3 font-hud text-xs font-bold uppercase tracking-widest text-[#f4d98d] shadow-xl backdrop-blur transition hover:bg-[#1b382c]">{profile?.username || "Player"} · {`₱${balance.toLocaleString("en-US")}`}</button>{accountOpen && <AccountCenter user={session.user} isAdmin={isAdmin} profile={profile} balance={balance} onClose={() => setAccountOpen(false)} onRefresh={() => refreshAccount(session.user)} />}</div>;
}
