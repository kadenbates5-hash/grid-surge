import { useAuth } from "@/context/AuthContext";

const LEVEL_THRESHOLDS = [0,300,700,1300,2100,3200,4600,6300,8400,11000,14000,18000,23000,29000,36000,45000,56000,69000,85000,105000];
function getLevelFromXP(xp: number) {
  let l = 0;
  for (let i = LEVEL_THRESHOLDS.length-1; i>=0; i--) { if (xp >= LEVEL_THRESHOLDS[i]) { l=i; break; } }
  return Math.min(l, LEVEL_THRESHOLDS.length-1);
}
function xpPct(xp: number, level: number) {
  if (level >= LEVEL_THRESHOLDS.length-1) return 100;
  const s = LEVEL_THRESHOLDS[level], e = LEVEL_THRESHOLDS[level+1];
  return Math.round(((xp-s)/(e-s))*100);
}

export default function ProfileHeader({ onLoginClick }: { onLoginClick: () => void }) {
  const { user, logout } = useAuth();
  const level = user ? getLevelFromXP(user.xp) : 1;
  const pct = user ? xpPct(user.xp, level) : 0;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e2840] bg-[#0d1220] shrink-0">
      {/* LOGO */}
      <div className="text-lg font-black tracking-tight retro-glow" style={{ color:"#7dd3fc", textShadow:"0 0 10px #7dd3fc88" }}>
        GRID<span style={{color:"#38bdf8"}}>SURGE</span>
        <span className="text-[0.5rem] tracking-[0.15em] text-[#4a5580] font-normal ml-1 hidden sm:inline">by KJB</span>
      </div>

      {user ? (
        <div className="flex items-center gap-3">
          {/* COINS */}
          <div className="flex items-center gap-1">
            <span className="text-xs">🪙</span>
            <span className="text-xs font-black text-[#fbbf24] retro-glow">{user.coins.toLocaleString()}</span>
          </div>
          {/* LEVEL + XP */}
          <div className="flex flex-col items-end gap-0.5 min-w-[70px]">
            <div className="flex items-center gap-1">
              <span className="text-[0.55rem] text-[#4a5580]">LVL</span>
              <span className="text-sm font-black text-[#a78bfa] retro-glow">{level}</span>
              <span className="text-[0.5rem] text-[#4a5580] truncate max-w-[60px]">{user.username}</span>
            </div>
            <div className="w-16 h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width:`${pct}%`, background:"linear-gradient(90deg,#a78bfa,#ec4899)" }} />
            </div>
          </div>
          <button onClick={logout} className="text-[0.5rem] text-[#4a5580] hover:text-[#7dd3fc] retro-btn hidden sm:block">OUT</button>
        </div>
      ) : (
        <button onClick={onLoginClick} className="text-xs retro-btn px-3 py-1.5 rounded text-[#0d1220] font-black" style={{ background:"#7dd3fc", boxShadow:"0 0 12px #7dd3fc44" }}>
          LOGIN
        </button>
      )}
    </div>
  );
}
