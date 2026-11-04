import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Check, Copy, CreditCard, ExternalLink, Gauge, LogOut, QrCode, Settings2, Shield, Upload, Users, WalletCards, X } from "lucide-react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as SupabaseClient;
type Tab = "wallet" | "recharge" | "withdraw" | "admin";
type Method = { id: string; name: string; account_name: string; account_number: string; instructions: string; qr_path: string | null; enabled: boolean };
type Request = { id: string; user_id: string; kind: string; amount: number; status: string; payment_method: string | null; proof_path: string | null; created_at: string; profile?: { username: string; phone: string } };
type Profile = { id: string; username: string; phone: string; created_at: string; role?: string; balance?: number };

const money = (value: number) => `₱${Number(value || 0).toLocaleString("en-US")}`;
const safeMessage = () => "We could not complete that request. Please try again.";

interface AccountCenterProps {
  user: User;
  isAdmin: boolean;
  profile: Profile | null;
  balance: number;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export function AccountCenter({ user, isAdmin, profile, balance, onClose, onRefresh }: AccountCenterProps) {
  const [tab, setTab] = useState<Tab>("wallet");
  const [methods, setMethods] = useState<Method[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [winRate, setWinRate] = useState(20);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadMethods = async () => {
    const { data } = await db.from("payment_methods").select("*").order("name");
    setMethods((data ?? []) as Method[]);
  };
  const loadRequests = async () => {
    const { data } = await db.from("coin_requests").select("*").order("created_at", { ascending: false }).limit(isAdmin ? 60 : 12);
    setRequests((data ?? []) as Request[]);
  };
  const loadAdmin = async () => {
    const [{ data: people }, { data: settings }] = await Promise.all([
      db.from("profiles").select("id, username, phone, created_at").order("created_at", { ascending: false }).limit(100),
      db.from("game_settings").select("win_rate").eq("id", true).maybeSingle(),
    ]);
    const rows = (people ?? []) as Profile[];
    const wallets = await Promise.all(rows.map((person) => db.from("wallets").select("balance").eq("user_id", person.id).maybeSingle()));
    setProfiles(rows.map((person, index) => ({ ...person, balance: Number((wallets[index].data as { balance?: number } | null)?.balance ?? 0) })));
    setWinRate(Number((settings as { win_rate?: number } | null)?.win_rate ?? 20));
  };

  useEffect(() => { void loadMethods(); void loadRequests(); if (isAdmin) void loadAdmin(); }, [isAdmin]);

  const selectedMethod = useMemo(() => methods.find((method) => method.enabled) ?? methods[0], [methods]);
  const submitRequest = async (kind: "recharge" | "withdrawal", amount: number, methodName: string | null, proofPath: string | null) => {
    setBusy(true); setNotice("");
    try {
      const { error } = await db.rpc("request_coins", { request_kind: kind, coins: amount, request_proof_path: proofPath, request_payment_method: methodName });
      if (error) throw error;
      setNotice(kind === "recharge" ? "Recharge submitted for admin review." : "Withdrawal submitted. Your balance has been reserved until review.");
      await Promise.all([loadRequests(), onRefresh()]);
    } catch (cause) { console.error("coin request failed", cause); setNotice(safeMessage()); }
    finally { setBusy(false); }
  };

  const uploadProof = async (event: ChangeEvent<HTMLInputElement>, amount: number, methodName: string) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setNotice("Choose an image smaller than 5 MB."); return; }
    setBusy(true); setNotice("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage.from("payment-proofs").upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      await submitRequest("recharge", amount, methodName, path);
    } catch (cause) { console.error("payment proof upload failed", cause); setNotice(safeMessage()); setBusy(false); }
  };

  const review = async (requestId: string, approve: boolean) => {
    setBusy(true); setNotice("");
    try { const { error } = await db.rpc("review_coins", { request_id: requestId, approve }); if (error) throw error; await Promise.all([loadRequests(), onRefresh()]); setNotice(approve ? "Request approved." : "Request rejected."); }
    catch (cause) { console.error("request review failed", cause); setNotice(safeMessage()); }
    finally { setBusy(false); }
  };

  const saveWinRate = async () => {
    setBusy(true); setNotice("");
    try { const { error } = await db.from("game_settings").update({ win_rate: winRate }).eq("id", true); if (error) throw error; setNotice("Game win rate updated."); }
    catch (cause) { console.error("win rate update failed", cause); setNotice(safeMessage()); }
    finally { setBusy(false); }
  };

  const updateProfile = async (person: Profile) => {
    try { const { error } = await db.rpc("admin_update_profile", { target_user_id: person.id, new_username: person.username, new_phone: person.phone }); if (error) throw error; setNotice("Player details updated."); }
    catch (cause) { console.error("profile update failed", cause); setNotice(safeMessage()); }
  };

  const uploadQr = async (event: ChangeEvent<HTMLInputElement>, method: Method) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setNotice("Choose an image smaller than 5 MB."); return; }
    setBusy(true); setNotice("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${method.id}.${extension}`;
      const upload = await supabase.storage.from("payment-qr").upload(path, file, { contentType: file.type, upsert: true });
      if (upload.error) throw upload.error;
      const { error } = await db.from("payment_methods").update({ qr_path: path }).eq("id", method.id);
      if (error) throw error;
      await loadMethods(); setNotice(`${method.name} QR code updated.`);
    } catch (cause) { console.error("QR upload failed", cause); setNotice(safeMessage()); }
    finally { setBusy(false); }
  };

  const qrUrl = (path: string | null) => {
    if (!path) return "";
    return path.startsWith("/") ? path : supabase.storage.from("payment-qr").getPublicUrl(path).data.publicUrl;
  };
  const openProof = async (path: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { setNotice(safeMessage()); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
    <section className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl border border-[#d9b458]/25 bg-[#10221b] text-[#f7f1e5] shadow-2xl sm:rounded-3xl">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7"><div><p className="font-hud text-xs font-bold uppercase tracking-[0.25em] text-[#e8c96d]">Player center</p><h2 className="mt-1 font-display text-3xl font-bold">{profile?.username || "Player"}</h2></div><button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-[#aebbb1] transition hover:bg-white/10 hover:text-white"><X size={22} /></button></header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-3 md:w-52 md:flex-col md:border-b-0 md:border-r md:p-4">
          {([['wallet', WalletCards, 'Wallet'], ['recharge', QrCode, 'Recharge'], ['withdraw', CreditCard, 'Withdraw'], ...(isAdmin ? [['admin', Shield, 'Admin desk'] as const] : [])] as const).map(([id, Icon, label]) => <button key={id} onClick={() => { setTab(id); setNotice(""); }} className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-3 text-left font-hud text-xs font-bold uppercase tracking-wider transition ${tab === id ? "bg-[#e8c96d] text-[#17251d]" : "text-[#aebbb1] hover:bg-white/10 hover:text-white"}`}><Icon size={17} />{label}</button>)}
          <button onClick={() => void supabase.auth.signOut()} className="ml-auto flex items-center gap-3 rounded-xl px-3 py-3 font-hud text-xs font-bold uppercase tracking-wider text-[#d99a87] hover:bg-[#602d25]/40 md:mt-auto"><LogOut size={17} />Sign out</button>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          {notice && <p role="status" className="mb-5 rounded-xl border border-[#e8c96d]/30 bg-[#e8c96d]/10 px-4 py-3 text-sm text-[#f4d98d]">{notice}</p>}
          {tab === "wallet" && <WalletTab balance={balance} requests={requests.filter((request) => request.user_id === user.id)} onCopy={() => { void navigator.clipboard?.writeText(profile?.id || ""); setNotice("Player ID copied."); }} />}
          {tab === "recharge" && <RechargeTab methods={methods} selectedMethod={selectedMethod} busy={busy} onUpload={uploadProof} qrUrl={qrUrl} />}
          {tab === "withdraw" && <WithdrawTab balance={balance} busy={busy} onSubmit={(amount) => void submitRequest("withdrawal", amount, null, null)} />}
          {tab === "admin" && isAdmin && <AdminTab requests={requests} profiles={profiles} methods={methods} winRate={winRate} setWinRate={setWinRate} busy={busy} onReview={review} onSaveWinRate={saveWinRate} onProfileChange={(person) => setProfiles((items) => items.map((item) => item.id === person.id ? person : item))} onSaveProfile={updateProfile} onUploadQr={uploadQr} qrUrl={qrUrl} onOpenProof={openProof} />}
        </div>
      </div>
    </section>
  </div>;
}

function WalletTab({ balance, requests, onCopy }: { balance: number; requests: Request[]; onCopy: () => void }) {
  return <div><div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-[linear-gradient(135deg,#e8c96d,#b98b3d)] p-6 text-[#17251d]"><p className="font-hud text-xs font-bold uppercase tracking-widest opacity-70">Available balance</p><p className="mt-3 font-display text-5xl font-black">{money(balance)}</p><p className="mt-5 font-hud text-xs uppercase tracking-widest opacity-70">Use your balance to enter the next race</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><p className="font-hud text-xs font-bold uppercase tracking-widest text-[#94a59a]">Player ID</p><p className="mt-3 break-all text-sm text-[#d7e0d7]">{requests.length ? "Wallet active" : "Account active"}</p><button onClick={onCopy} className="mt-5 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 font-hud text-xs font-bold uppercase tracking-widest hover:bg-white/15"><Copy size={14} />Copy ID</button></div></div><div className="mt-8"><h3 className="font-display text-2xl font-bold">Recent requests</h3><div className="mt-4 space-y-2">{requests.length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-[#94a59a]">No wallet requests yet.</p> : requests.map((request) => <div key={request.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"><div><p className="font-semibold capitalize">{request.kind}</p><p className="text-xs text-[#94a59a]">{new Date(request.created_at).toLocaleString()}</p></div><div className="text-right"><p className="font-hud text-lg font-bold">{money(request.amount)}</p><p className={`font-hud text-xs font-bold uppercase ${request.status === "approved" ? "text-[#8bd3a3]" : request.status === "rejected" ? "text-[#e2a08d]" : "text-[#e8c96d]"}`}>{request.status}</p></div></div>)}</div></div></div>;
}

function RechargeTab({ methods, selectedMethod, busy, onUpload, qrUrl }: { methods: Method[]; selectedMethod?: Method; busy: boolean; onUpload: (event: ChangeEvent<HTMLInputElement>, amount: number, method: string) => void; qrUrl: (path: string | null) => string }) {
  const [amount, setAmount] = useState(500);
  const [method, setMethod] = useState(selectedMethod?.name || "GCash");
  const current = methods.find((item) => item.name === method) || selectedMethod;
  return <div><div className="flex items-start justify-between gap-4"><div><h3 className="font-display text-3xl font-bold">Recharge wallet</h3><p className="mt-2 max-w-xl text-[#aebbb1]">Choose a payment channel, send the exact amount, then upload a clear proof of payment.</p></div><QrCode className="hidden text-[#e8c96d] sm:block" size={34} /></div><div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1.1fr]"><div className="space-y-5"><label className="block"><span className="mb-2 block font-hud text-xs font-bold uppercase tracking-widest text-[#94a59a]">Payment channel</span><select value={method} onChange={(event) => setMethod(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b1814] px-4 py-3.5 outline-none focus:border-[#e8c96d]">{methods.filter((item) => item.enabled).map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label className="block"><span className="mb-2 block font-hud text-xs font-bold uppercase tracking-widest text-[#94a59a]">Amount</span><input type="number" min={1} max={1000000} value={amount} onChange={(event) => setAmount(Math.max(1, Math.floor(Number(event.target.value))))} className="w-full rounded-xl border border-white/10 bg-[#0b1814] px-4 py-3.5 outline-none focus:border-[#e8c96d]" /></label><div className="rounded-xl border border-[#e8c96d]/20 bg-[#e8c96d]/10 p-4 text-sm text-[#e6d9a9]">{current?.instructions || "Payment instructions will appear here."}<p className="mt-3 font-hud text-xs uppercase tracking-widest text-[#e8c96d]">{current?.account_name || "Account name pending"} · {current?.account_number || "Account number pending"}</p></div></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">{current?.qr_path ? <img src={qrUrl(current.qr_path)} alt={`${current.name} payment QR code`} className="mx-auto aspect-square w-full max-w-[240px] rounded-xl bg-white object-contain p-2" /> : <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-xl border border-dashed border-[#e8c96d]/40 bg-[#e8c96d]/5 text-sm text-[#bfae77]">QR code coming soon</div>}<label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 font-hud text-xs font-bold uppercase tracking-widest transition hover:bg-white/15"><Upload size={16} />Upload proof<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => onUpload(event, amount, current?.name || method)} className="hidden" /></label><p className="mt-3 text-xs text-[#94a59a]">Images only, up to 5 MB. Your request is reviewed before funds are added.</p></div></div></div>;
}

function WithdrawTab({ balance, busy, onSubmit }: { balance: number; busy: boolean; onSubmit: (amount: number) => void }) { const [amount, setAmount] = useState(500); return <div className="max-w-xl"><h3 className="font-display text-3xl font-bold">Withdraw balance</h3><p className="mt-2 text-[#aebbb1]">Your selected amount is reserved immediately and released after admin review.</p><div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="font-hud text-xs uppercase tracking-widest text-[#94a59a]">Available balance</p><p className="mt-2 font-display text-4xl font-bold text-[#e8c96d]">{money(balance)}</p><label className="mt-6 block"><span className="mb-2 block font-hud text-xs font-bold uppercase tracking-widest text-[#94a59a]">Withdrawal amount</span><input type="number" min={1} max={balance} value={amount} onChange={(event) => setAmount(Math.min(balance, Math.max(1, Math.floor(Number(event.target.value)))))} className="w-full rounded-xl border border-white/10 bg-[#0b1814] px-4 py-3.5 outline-none focus:border-[#e8c96d]" /></label><button disabled={busy || amount > balance || balance < 1} onClick={() => onSubmit(amount)} className="mt-5 w-full rounded-xl bg-[#e8c96d] py-3.5 font-hud text-sm font-bold uppercase tracking-widest text-[#17251d] disabled:opacity-50">{busy ? "Submitting" : "Submit withdrawal"}</button></div></div>; }

function AdminTab({ requests, profiles, methods, winRate, setWinRate, busy, onReview, onSaveWinRate, onProfileChange, onSaveProfile, onUploadQr, qrUrl }: { requests: Request[]; profiles: Profile[]; methods: Method[]; winRate: number; setWinRate: (value: number) => void; busy: boolean; onReview: (id: string, approve: boolean) => void; onSaveWinRate: () => void; onProfileChange: (profile: Profile) => void; onSaveProfile: (profile: Profile) => void; onUploadQr: (event: ChangeEvent<HTMLInputElement>, method: Method) => void; qrUrl: (path: string | null) => string; onOpenProof: (path: string | null) => void }) {
  return <div className="space-y-8"><div><div className="flex items-start justify-between gap-4"><div><p className="font-hud text-xs font-bold uppercase tracking-[0.25em] text-[#e8c96d]">Admin desk</p><h3 className="mt-1 font-display text-3xl font-bold">Run the room</h3></div><Settings2 className="text-[#e8c96d]" /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2 font-hud text-xs font-bold uppercase tracking-widest text-[#94a59a]"><Gauge size={16} />Game win rate</div><div className="mt-4 flex items-center gap-3"><input type="range" min={0} max={100} value={winRate} onChange={(event) => setWinRate(Number(event.target.value))} className="w-full accent-[#e8c96d]" /><span className="w-12 text-right font-hud text-xl font-bold text-[#e8c96d]">{winRate}%</span></div><button disabled={busy} onClick={onSaveWinRate} className="mt-4 rounded-lg bg-[#e8c96d] px-4 py-2 font-hud text-xs font-bold uppercase tracking-widest text-[#17251d] disabled:opacity-50">Save setting</button></div><div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex items-center gap-2 font-hud text-xs font-bold uppercase tracking-widest text-[#94a59a]"><QrCode size={16} />Payment QR codes</div><div className="mt-4 space-y-3">{methods.map((method) => <div key={method.id} className="flex items-center gap-3"><div className="h-10 w-10 overflow-hidden rounded-lg bg-white">{method.qr_path && <img src={qrUrl(method.qr_path)} alt="" className="h-full w-full object-contain" />}</div><span className="flex-1 text-sm">{method.name}</span><label className="cursor-pointer rounded-lg bg-white/10 px-3 py-2 font-hud text-[10px] font-bold uppercase tracking-widest hover:bg-white/15"><Upload size={13} className="inline" /> QR<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onUpload(event, method)} className="hidden" /></label></div>)}</div></div></div></div><div><div className="mb-4 flex items-center gap-2"><Users size={18} className="text-[#e8c96d]" /><h3 className="font-display text-2xl font-bold">Player accounts</h3></div><div className="space-y-2">{profiles.map((person) => <div key={person.id} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[1.15fr_1fr_0.7fr_auto] sm:items-center"><input value={person.username} onChange={(event) => onProfileChange({ ...person, username: event.target.value })} className="rounded-lg border border-white/10 bg-[#0b1814] px-3 py-2 text-sm outline-none focus:border-[#e8c96d]" /><input value={person.phone} onChange={(event) => onProfileChange({ ...person, phone: event.target.value })} placeholder="Phone" className="rounded-lg border border-white/10 bg-[#0b1814] px-3 py-2 text-sm outline-none focus:border-[#e8c96d]" /><span className="font-hud text-sm text-[#e8c96d]">{money(person.balance || 0)}</span><button onClick={() => void onSaveProfile(person)} className="rounded-lg bg-white/10 px-3 py-2 font-hud text-[10px] font-bold uppercase tracking-widest hover:bg-white/15">Save</button></div>)}</div></div><div><div className="mb-4 flex items-center gap-2"><WalletCards size={18} className="text-[#e8c96d]" /><h3 className="font-display text-2xl font-bold">Recharge & withdrawal queue</h3></div><div className="space-y-2">{requests.filter((request) => request.status === "pending").length === 0 ? <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-[#94a59a]">No pending requests.</p> : requests.filter((request) => request.status === "pending").map((request) => <div key={request.id} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr_auto_auto]"><div><p className="font-semibold capitalize">{request.kind} · {money(request.amount)}</p><p className="text-xs text-[#94a59a]">{request.payment_method || "Wallet request"} · {new Date(request.created_at).toLocaleString()}</p>{request.proof_path && <button onClick={() => onOpenProof(request.proof_path)} className="mt-2 inline-flex items-center gap-1 font-hud text-[10px] font-bold uppercase tracking-widest text-[#e8c96d] hover:text-white"><ExternalLink size={12} />View payment proof</button>}</div><div className="flex gap-2"><button onClick={() => void onReview(request.id, true)} disabled={busy} className="flex items-center gap-1 rounded-lg bg-[#285e3e] px-3 py-2 font-hud text-xs font-bold uppercase tracking-widest text-[#c9f0d4] disabled:opacity-50"><Check size={14} />Approve</button><button onClick={() => void onReview(request.id, false)} disabled={busy} className="rounded-lg bg-[#602d25] px-3 py-2 font-hud text-xs font-bold uppercase tracking-widest text-[#f3baa8] disabled:opacity-50">Reject</button></div></div>)}</div></div></div>;
}
