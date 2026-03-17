import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function AuthModal({ onClose }: { onClose: () => void }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login"|"register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "login") await login(email, password, rememberMe);
      else await register(username, email, password);
      onClose();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="screen-enter bg-[#0d1220] retro-border rounded-xl p-6 w-[90%] max-w-sm flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="text-center text-[#7dd3fc] font-black tracking-widest text-base retro-glow">
          {mode === "login" ? "LOGIN" : "CREATE ACCOUNT"}
        </div>

        <div className="flex rounded overflow-hidden border border-[#1e2840]">
          <button onClick={() => setMode("login")} className={`flex-1 py-1.5 text-xs retro-btn ${mode==="login"?"bg-[#7dd3fc] text-[#0d1220]":"text-[#4a5580]"}`}>LOGIN</button>
          <button onClick={() => setMode("register")} className={`flex-1 py-1.5 text-xs retro-btn ${mode==="register"?"bg-[#7dd3fc] text-[#0d1220]":"text-[#4a5580]"}`}>REGISTER</button>
        </div>

        <div className="flex flex-col gap-2">
          {mode === "register" && (
            <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username (3-20 chars)"
              className="bg-[#141e30] border border-[#1e2840] rounded px-3 py-2 text-sm text-[#e0f2fe] placeholder-[#4a5580] outline-none focus:border-[#7dd3fc44] retro-btn" />
          )}
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email"
            className="bg-[#141e30] border border-[#1e2840] rounded px-3 py-2 text-sm text-[#e0f2fe] placeholder-[#4a5580] outline-none focus:border-[#7dd3fc44] retro-btn" />
          <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password"
            className="bg-[#141e30] border border-[#1e2840] rounded px-3 py-2 text-sm text-[#e0f2fe] placeholder-[#4a5580] outline-none focus:border-[#7dd3fc44] retro-btn"
            onKeyDown={e => e.key==="Enter" && submit()} />
        </div>

        {mode === "login" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}
              className="accent-[#7dd3fc] w-3.5 h-3.5" />
            <span className="text-xs text-[#4a5580] retro-btn">Remember me (stay logged in)</span>
          </label>
        )}

        {error && <div className="text-xs text-red-400 text-center retro-btn">{error}</div>}

        <button onClick={submit} disabled={loading}
          className="w-full py-2.5 text-sm font-black retro-btn rounded text-[#0d1220] disabled:opacity-50"
          style={{ background:"#7dd3fc", boxShadow:"0 0 16px #7dd3fc44" }}>
          {loading ? "..." : mode === "login" ? "LOGIN" : "CREATE ACCOUNT"}
        </button>
        <div className="text-[0.55rem] text-[#2a3560] text-center retro-btn">
          500 coins awarded on first login · Developed by KJB
        </div>
      </div>
    </div>
  );
}
