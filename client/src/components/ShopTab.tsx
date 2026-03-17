import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { POWERUP_DEFS, type PowerUpKey } from "@shared/schema";
import { useState } from "react";

export default function ShopTab({ onLoginClick }: { onLoginClick: () => void }) {
  const { user, refreshUser } = useAuth();
  const [buying, setBuying] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const buy = async (key: PowerUpKey) => {
    if (!user) return onLoginClick();
    setBuying(key);
    try {
      const res = await apiRequest("POST", "/api/shop/buy", { powerUp: key, qty: 1 });
      const d = await res.json();
      if (!res.ok) { setMsg({ text: d.error, ok: false }); }
      else { setMsg({ text: `Bought ${POWERUP_DEFS[key].label}!`, ok: true }); await refreshUser(); }
    } catch { setMsg({ text: "Error", ok: false }); }
    finally { setBuying(null); setTimeout(() => setMsg(null), 2000); }
  };

  const inv = (user?.inventory || {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-sm mx-auto w-full" style={{ fontFamily: "'Courier New',monospace" }}>
      <div className="flex justify-between items-center">
        <div className="text-base font-black tracking-widest text-[#7dd3fc] retro-glow">POWER-UP SHOP</div>
        <div className="flex items-center gap-1 text-sm font-black text-[#fbbf24]">🪙 {user?.coins?.toLocaleString() ?? "---"}</div>
      </div>
      {!user && <div className="text-xs text-[#4a5580] text-center retro-btn py-2 border border-[#1e2840] rounded cursor-pointer hover:text-[#7dd3fc]" onClick={onLoginClick}>Login to purchase</div>}
      {msg && <div className={`text-xs text-center retro-btn py-1.5 rounded ${msg.ok ? "text-[#34d399] bg-[#34d39910]" : "text-red-400 bg-red-900/20"}`}>{msg.text}</div>}
      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(POWERUP_DEFS) as PowerUpKey[]).map(key => {
          const def = POWERUP_DEFS[key];
          const owned = inv[key] || 0;
          const canAfford = (user?.coins || 0) >= def.coinCost;
          return (
            <div key={key} className="flex items-center gap-3 px-3 py-3 rounded-lg border" style={{ background: `${def.color}08`, borderColor: `${def.color}30` }}>
              <span className="text-2xl w-8 text-center">{def.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black retro-btn" style={{ color: def.color }}>{def.label}</div>
                <div className="text-[0.55rem] text-[#4a5580] truncate">{def.description}</div>
                {owned > 0 && <div className="text-[0.5rem] text-[#fbbf24]">Owned: {owned}</div>}
              </div>
              <button
                onClick={() => buy(key)}
                disabled={buying === key || !canAfford}
                className="flex items-center gap-1 px-3 py-1.5 rounded retro-btn text-xs font-black disabled:opacity-40 transition-transform hover:scale-105 active:scale-95"
                style={{ background: canAfford ? def.color : "#1e2840", color: canAfford ? "#0d1220" : "#4a5580" }}
              >
                🪙 {def.coinCost}
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-[0.5rem] text-[#2a3560] text-center retro-btn">Earn coins by playing · Level up for bonuses</div>
    </div>
  );
}
