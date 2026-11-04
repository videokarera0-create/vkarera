import { useState } from "react";
import { LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AuthPanelProps {
  onAuthenticated: () => void;
}

const friendlyAuthError = (message: string) => {
  if (message.toLowerCase().includes("invalid login")) return "Those sign-in details do not match our records.";
  if (message.toLowerCase().includes("already registered")) return "That email is already registered. Try signing in instead.";
  return "We could not complete that request. Please check your details and try again.";
};

export function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = mode === "sign-up"
        ? await supabase.auth.signUp({ email, password, options: { data: { username: username.trim() || "Player" } } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (mode === "sign-up" && !result.data.session) {
        setMessage("Your account was created. Sign in to continue.");
        setMode("sign-in");
      } else {
        onAuthenticated();
      }
    } catch (cause) {
      console.error("authentication failed", cause);
      setMessage(friendlyAuthError(cause instanceof Error ? cause.message : ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b1512] px-4 py-10 text-[#f7f1e5]">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#d9b458]/30 bg-[#13251e] shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] overflow-hidden bg-[radial-gradient(circle_at_18%_15%,rgba(220,179,77,.28),transparent_34%),linear-gradient(145deg,#18352b,#0e1b17)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="font-hud text-xs font-bold uppercase tracking-[0.28em] text-[#e8c96d]">Private player club</p>
            <h1 className="mt-5 max-w-md font-display text-6xl font-black italic leading-[0.92]">Play the race. Own the night.</h1>
            <p className="mt-6 max-w-sm text-lg leading-7 text-[#c8d0c6]">A polished derby room for live races, wallet approvals, and a better way to play.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 font-hud text-xs uppercase tracking-widest text-[#c8d0c6]">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><ShieldCheck className="mb-3 text-[#e8c96d]" size={20} />Secure access</div>
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><LockKeyhole className="mb-3 text-[#e8c96d]" size={20} />Protected wallet</div>
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><UserRound className="mb-3 text-[#e8c96d]" size={20} />Player account</div>
          </div>
        </section>
        <section className="p-6 sm:p-10">
          <div className="mb-10 lg:hidden">
            <p className="font-hud text-xs font-bold uppercase tracking-[0.28em] text-[#e8c96d]">Derby Nine</p>
            <h1 className="mt-3 font-display text-4xl font-black italic">Play the race.</h1>
          </div>
          <div className="mb-8 flex gap-6 border-b border-white/10 font-hud text-sm font-bold uppercase tracking-widest">
            {(["sign-in", "sign-up"] as const).map((item) => (
              <button key={item} type="button" onClick={() => { setMode(item); setMessage(""); }} className={`border-b-2 pb-3 transition ${mode === item ? "border-[#e8c96d] text-[#e8c96d]" : "border-transparent text-[#94a59a] hover:text-white"}`}>
                {item === "sign-in" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <h2 className="font-display text-4xl font-bold">{mode === "sign-in" ? "Welcome back" : "Join the club"}</h2>
          <p className="mt-2 text-[#aebbb1]">{mode === "sign-in" ? "Sign in to access your wallet and race room." : "Create your player account to get started."}</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            {mode === "sign-up" && <label className="block"><span className="mb-2 block font-hud text-xs font-bold uppercase tracking-widest text-[#b8c5bb]">Username</span><div className="relative"><UserRound className="absolute left-3 top-3.5 text-[#82968a]" size={18} /><input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={30} required className="w-full rounded-xl border border-white/10 bg-[#0d1c17] px-10 py-3.5 outline-none transition focus:border-[#e8c96d]" placeholder="Your player name" /></div></label>}
            <label className="block"><span className="mb-2 block font-hud text-xs font-bold uppercase tracking-widest text-[#b8c5bb]">Email</span><div className="relative"><Mail className="absolute left-3 top-3.5 text-[#82968a]" size={18} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-[#0d1c17] px-10 py-3.5 outline-none transition focus:border-[#e8c96d]" placeholder="you@example.com" /></div></label>
            <label className="block"><span className="mb-2 block font-hud text-xs font-bold uppercase tracking-widest text-[#b8c5bb]">Password</span><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 text-[#82968a]" size={18} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required className="w-full rounded-xl border border-white/10 bg-[#0d1c17] px-10 py-3.5 outline-none transition focus:border-[#e8c96d]" placeholder="At least 6 characters" /></div></label>
            {message && <p role="status" className="rounded-xl border border-[#d88065]/40 bg-[#602d25]/30 px-4 py-3 text-sm text-[#f3baa8]">{message}</p>}
            <button disabled={busy} className="w-full rounded-xl bg-[#e8c96d] py-4 font-hud text-sm font-bold uppercase tracking-widest text-[#17251d] transition hover:brightness-110 disabled:opacity-50">{busy ? "Please wait" : mode === "sign-in" ? "Enter the race room" : "Create player account"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
