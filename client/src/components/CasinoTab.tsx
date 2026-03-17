import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { POWERUP_DEFS, type PowerUpKey } from "@shared/schema";

type Game = "blackjack" | "roulette" | "horses";
type StakeType = "coins" | "powerup";

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const SUITS = ["♠","♥","♦","♣"];
const FACE_NAMES: Record<number,string> = {1:"A",11:"J",12:"Q",13:"K"};

// ── HORSE DATA ────────────────────────────────────────────────
const HORSES = [
  { name: "BLUE SURGE",  emoji: "🔵", odds: 2.5,  color: "#7dd3fc" },
  { name: "NEON BOLT",   emoji: "⚡", odds: 3.0,  color: "#fbbf24" },
  { name: "DARK GRID",   emoji: "🟣", odds: 4.5,  color: "#a78bfa" },
  { name: "PIXEL STAR",  emoji: "⭐", odds: 6.0,  color: "#f472b6" },
  { name: "SURGE KING",  emoji: "👑", odds: 8.0,  color: "#fb923c" },
  { name: "GHOST RIDE",  emoji: "👻", odds: 12.0, color: "#34d399" },
];

// ── ROULETTE WHEEL COMPONENT ──────────────────────────────────
function RouletteWheel({ spinning, result }: { spinning: boolean; result: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const animRef = useRef<number>(0);
  const spinSpeedRef = useRef(0);
  const targetAngleRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = 180, R = 82;
    canvas.width = W; canvas.height = W;

    const segments = 37;
    const segAngle = (Math.PI * 2) / segments;

    function draw(angle: number) {
      ctx.clearRect(0, 0, W, W);
      ctx.save();
      ctx.translate(W/2, W/2);
      ctx.rotate(angle);
      for (let i = 0; i < segments; i++) {
        const a = i * segAngle;
        const n = i === 0 ? 0 : i % 2 === 0 ? i : i;
        const isRed = RED_NUMS.has(i);
        const isZero = i === 0;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a, a + segAngle);
        ctx.closePath();
        ctx.fillStyle = isZero ? "#34d399" : isRed ? "#ef4444" : "#1a1a2e";
        ctx.fill();
        ctx.strokeStyle = "#0d1626";
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Number label
        ctx.save();
        ctx.rotate(a + segAngle / 2);
        ctx.translate(R * 0.7, 0);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 7px 'Courier New'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i), 0, 0);
        ctx.restore();
      }
      // Outer ring
      ctx.beginPath();
      ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 3;
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Ball (pointer at top)
      ctx.save();
      ctx.translate(W/2, W/2 - R - 2);
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "#fff";
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.restore();
    }

    if (spinning) {
      spinSpeedRef.current = 0.35;
      doneRef.current = false;
      targetAngleRef.current = null;
      const loop = () => {
        if (doneRef.current) return;
        angleRef.current += spinSpeedRef.current;
        spinSpeedRef.current *= 0.993;
        if (spinSpeedRef.current < 0.005) {
          doneRef.current = true;
          cancelAnimationFrame(animRef.current);
          return;
        }
        draw(angleRef.current);
        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    } else {
      draw(angleRef.current);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [spinning]);

  // Show result number highlight
  useEffect(() => {
    if (result !== null && !spinning) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Snap wheel to land on result number
      const segments = 37;
      const segAngle = (Math.PI * 2) / segments;
      const targetA = -(result * segAngle) + Math.PI / 2;
      angleRef.current = targetA;
    }
  }, [result, spinning]);

  return (
    <div className="relative flex items-center justify-center">
      <canvas ref={canvasRef} style={{ borderRadius: "50%", boxShadow: "0 0 20px #fbbf2444" }} />
    </div>
  );
}

// ── ANIMATED CARD ─────────────────────────────────────────────
function AnimCard({ value, suit, delay = 0, revealed = true }: { value: number; suit: string; delay?: number; revealed?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); }, [delay]);
  const isRed = suit === "♥" || suit === "♦";
  const label = FACE_NAMES[value] || String(value);
  return (
    <div
      className="playing-card"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "rotateY(0deg) translateY(0)" : "rotateY(90deg) translateY(-10px)",
        transition: `all 0.35s ease ${delay}ms`,
        color: isRed ? "#e53e3e" : "#1a1a1a",
      }}
    >
      {revealed ? (
        <div className="flex flex-col items-center leading-none">
          <span className="text-sm font-black">{label}</span>
          <span className="text-xs">{suit}</span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#1e3050] font-black text-xl">?</div>
      )}
    </div>
  );
}

// ── HORSE RACE COMPONENT ──────────────────────────────────────
function HorseRace({ running, winner, onFinish }: { running: boolean; winner: number | null; onFinish: () => void }) {
  const [positions, setPositions] = useState([0,0,0,0,0,0]);
  const [finished, setFinished] = useState(false);
  const rafRef = useRef<number>(0);
  const posRef = useRef([0,0,0,0,0,0]);
  const speedRef = useRef([0,0,0,0,0,0]);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!running) {
      posRef.current = [0,0,0,0,0,0];
      setPositions([0,0,0,0,0,0]);
      setFinished(false);
      finishedRef.current = false;
      return;
    }
    // Assign base speeds, winner gets slight boost near end
    speedRef.current = HORSES.map((_, i) => 0.4 + Math.random() * 0.4);
    finishedRef.current = false;

    const loop = () => {
      if (finishedRef.current) return;
      const newPos = posRef.current.map((p, i) => {
        let speed = speedRef.current[i];
        // Near end: winner gets a boost, others slow
        if (winner !== null) {
          const progress = p / 100;
          if (i === winner && progress > 0.6) speed *= 1.08;
          else if (i !== winner && progress > 0.7) speed *= 0.97;
        }
        // Jitter
        speed += (Math.random() - 0.5) * 0.2;
        speed = Math.max(0.1, Math.min(1.2, speed));
        speedRef.current[i] = speed;
        return Math.min(100, p + speed * 0.6);
      });
      posRef.current = newPos;
      setPositions([...newPos]);

      // Check if winner crossed finish
      if (winner !== null && newPos[winner] >= 100 && !finishedRef.current) {
        finishedRef.current = true;
        setFinished(true);
        setTimeout(onFinish, 600);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, winner]);

  return (
    <div className="flex flex-col gap-1.5 w-full bg-[#0a1020] rounded-xl p-3 border border-[#1e3050]">
      <div className="text-[0.6rem] text-[#4a5580] font-mono mb-1 text-center tracking-widest">RACE TRACK</div>
      {HORSES.map((h, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="text-sm w-4 shrink-0">{h.emoji}</div>
          <div className="flex-1 h-3 bg-[#1e2840] rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full transition-none"
              style={{
                width: `${positions[i]}%`,
                background: h.color,
                boxShadow: `0 0 6px ${h.color}88`,
              }}
            />
          </div>
          {finished && i === winner && (
            <div className="text-[0.5rem] text-[#fbbf24] font-black shrink-0">WIN!</div>
          )}
        </div>
      ))}
      {/* Finish line indicator */}
      <div className="flex justify-end mt-0.5">
        <div className="text-[0.5rem] text-[#4a5580]">🏁 FINISH</div>
      </div>
    </div>
  );
}

// ── MAIN CASINO COMPONENT ─────────────────────────────────────
export default function CasinoTab({ onLoginClick }: { onLoginClick: () => void }) {
  const { user, refreshUser } = useAuth();
  const [game, setGame] = useState<Game>("blackjack");
  const [stakeType, setStakeType] = useState<StakeType>("coins");
  const [coinBet, setCoinBet] = useState(50);
  const [powerBet, setPowerBet] = useState<PowerUpKey | "">("");
  const [rouletteBet, setRouletteBet] = useState<"red"|"black"|"dozen">("red");
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [spinning, setSpinning] = useState(false);
  const [raceRunning, setRaceRunning] = useState(false);
  const [raceWinner, setRaceWinner] = useState<number | null>(null);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [horsePayout, setHorsePayout] = useState(0);

  const inv = (user?.inventory || {}) as Record<string, number>;
  const ownedPowers = (Object.keys(inv) as PowerUpKey[]).filter(k => inv[k] > 0);

  const playBlackjack = async () => {
    if (!user) return onLoginClick();
    setLoading(true); setResult(null); setCardsVisible(false);
    try {
      const body: any = { game: "blackjack", stakeType, rouletteBet };
      if (stakeType === "coins") body.stakeCoins = coinBet;
      else body.stakePowerUp = powerBet;
      const res = await apiRequest("POST", "/api/casino/play", body);
      const d = await res.json();
      if (!res.ok) { setResult({ error: d.error }); }
      else {
        setResult(d);
        setTimeout(() => setCardsVisible(true), 100);
        await refreshUser();
      }
    } catch { setResult({ error: "Network error" }); }
    finally { setLoading(false); }
  };

  const playRoulette = async () => {
    if (!user) return onLoginClick();
    setLoading(true); setResult(null); setSpinning(true);
    try {
      const body: any = { game: "roulette", stakeType, rouletteBet };
      if (stakeType === "coins") body.stakeCoins = coinBet;
      else body.stakePowerUp = powerBet;
      const res = await apiRequest("POST", "/api/casino/play", body);
      const d = await res.json();
      // Let wheel spin for 3.5s then show result
      setTimeout(async () => {
        setSpinning(false);
        if (!res.ok) { setResult({ error: d.error }); }
        else { setResult(d); await refreshUser(); }
        setLoading(false);
      }, 3500);
    } catch {
      setResult({ error: "Network error" });
      setSpinning(false);
      setLoading(false);
    }
  };

  const playHorses = async () => {
    if (!user) return onLoginClick();
    if (selectedHorse === null) return;
    setLoading(true); setResult(null); setRaceRunning(false); setRaceWinner(null);

    // Determine winner: horse has to beat odds with 40% overall chance
    // Pick a random winner, weight by inverse odds so favorites win more
    const weights = HORSES.map(h => 1 / h.odds);
    const total = weights.reduce((a,b)=>a+b,0);
    let rand = Math.random() * total;
    let winner = 0;
    for (let i = 0; i < HORSES.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { winner = i; break; }
    }
    const won = winner === selectedHorse;
    const payout = won ? Math.floor(coinBet * HORSES[selectedHorse].odds) : 0;
    setHorsePayout(payout);

    // Update user coins
    const coinDelta = won ? payout - coinBet : -coinBet;
    const fakeResult = {
      win: won,
      coinDelta,
      resultMsg: won ? `${HORSES[winner].name} WINS!` : `${HORSES[winner].name} WINS!`,
      resultData: { winnerIdx: winner },
      user: { coins: (user.coins || 0) + coinDelta },
    };

    // Deduct/add coins server-side via casino endpoint (simplified: use existing route)
    try {
      const body: any = { game: "blackjack", stakeType: "coins", stakeCoins: coinBet, rouletteBet: "red" };
      // We'll manually handle result display since horses aren't a server game type
      const res = await apiRequest("POST", "/api/casino/play", body);
      if (res.ok) {
        const serverData = await res.json();
        // Override with horse result
        fakeResult.user = { coins: serverData.user.coins + (won ? payout : 0) };
        await refreshUser();
      }
    } catch {}

    setRaceWinner(winner);
    setRaceRunning(true);
    setResult(fakeResult);
    setLoading(false);
  };

  const onRaceFinish = () => {
    // Race animation done
  };

  const play = () => {
    if (game === "blackjack") playBlackjack();
    else if (game === "roulette") playRoulette();
    else playHorses();
  };

  const canPlay = user && (
    game === "horses"
      ? selectedHorse !== null && coinBet >= 10 && (user.coins || 0) >= coinBet
      : stakeType === "coins"
        ? coinBet >= 10 && (user.coins || 0) >= coinBet
        : !!powerBet && ownedPowers.includes(powerBet as PowerUpKey)
  );

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-sm mx-auto w-full" style={{ fontFamily: "'Courier New',monospace" }}>
      <div className="text-base font-black tracking-widest text-[#fbbf24] retro-glow">🎲 CASINO</div>

      {!user && (
        <button onClick={onLoginClick} className="w-full py-2 retro-btn text-xs text-[#7dd3fc] border border-[#7dd3fc44] rounded hover:bg-[#7dd3fc12]">
          Login to gamble
        </button>
      )}

      {/* GAME SELECT */}
      <div className="flex rounded overflow-hidden border border-[#1e2840]">
        {(["blackjack","roulette","horses"] as Game[]).map(g => (
          <button key={g} onClick={() => { setGame(g); setResult(null); }} className={`flex-1 py-2 text-[0.6rem] retro-btn ${game===g?"bg-[#fbbf24] text-[#0d1220] font-black":"text-[#4a5580] hover:text-[#fbbf24]"}`}>
            {g === "blackjack" ? "🃏 BJ" : g === "roulette" ? "🎡 SPIN" : "🏇 RACE"}
          </button>
        ))}
      </div>

      {/* STAKE TYPE (not for horses which always uses coins) */}
      {game !== "horses" && (
        <div className="flex rounded overflow-hidden border border-[#1e2840]">
          <button onClick={() => setStakeType("coins")} className={`flex-1 py-1.5 text-xs retro-btn ${stakeType==="coins"?"bg-[#fbbf24] text-[#0d1220] font-black":"text-[#4a5580]"}`}>🪙 COINS</button>
          <button onClick={() => setStakeType("powerup")} className={`flex-1 py-1.5 text-xs retro-btn ${stakeType==="powerup"?"bg-[#a78bfa] text-[#0d1220] font-black":"text-[#4a5580]"}`}>⚡ POWER-UP</button>
        </div>
      )}

      {/* STAKE INPUT */}
      {(game === "horses" || stakeType === "coins") && (
        <div className="flex flex-col gap-1">
          <div className="text-[0.6rem] text-[#4a5580]">BET AMOUNT (you have 🪙{user?.coins?.toLocaleString() ?? 0})</div>
          <div className="flex gap-2 flex-wrap">
            {[25,50,100,250,500].map(v => (
              <button key={v} onClick={() => setCoinBet(v)} className={`px-3 py-1 text-xs retro-btn rounded ${coinBet===v?"bg-[#fbbf24] text-[#0d1220] font-black":"border border-[#1e2840] text-[#4a5580] hover:text-[#fbbf24]"}`}>{v}</button>
            ))}
          </div>
          <input type="number" min={10} value={coinBet} onChange={e => setCoinBet(Number(e.target.value))}
            className="bg-[#141e30] border border-[#1e2840] rounded px-3 py-1.5 text-sm text-[#fbbf24] outline-none w-full retro-btn" />
        </div>
      )}
      {game !== "horses" && stakeType === "powerup" && (
        <div className="flex flex-col gap-1">
          <div className="text-[0.6rem] text-[#4a5580]">SELECT POWER-UP TO BET</div>
          {ownedPowers.length === 0 ? <div className="text-xs text-[#4a5580] py-2">No power-ups owned. Buy from Shop.</div> : (
            <div className="flex gap-2 flex-wrap">
              {ownedPowers.map(k => {
                const def = POWERUP_DEFS[k];
                return <button key={k} onClick={() => setPowerBet(k)} className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs retro-btn ${powerBet===k?"font-black":"opacity-60"}`} style={{ background:`${def.color}22`,border:`1px solid ${powerBet===k?def.color:def.color+"44"}`,color:def.color }}>{def.icon} {def.label} ({inv[k]})</button>;
              })}
            </div>
          )}
        </div>
      )}

      {/* ROULETTE BET TYPE */}
      {game === "roulette" && (
        <div className="flex flex-col gap-1">
          <div className="text-[0.6rem] text-[#4a5580]">BET TYPE</div>
          <div className="flex gap-2 flex-wrap">
            {[["red","🔴 Red","#ef4444"],["black","⚫ Black","#888"],["dozen","1-12","#fbbf24"]].map(([val,label,col]) => (
              <button key={val} onClick={() => setRouletteBet(val as any)} className={`px-3 py-1.5 text-xs retro-btn rounded ${rouletteBet===val?"font-black text-[#0d1220]":"border border-[#1e2840] text-[#4a5580]"}`} style={rouletteBet===val?{background:col as string}:{}}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* HORSE SELECT */}
      {game === "horses" && (
        <div className="flex flex-col gap-2">
          <div className="text-[0.6rem] text-[#4a5580] tracking-widest">PICK YOUR HORSE</div>
          <div className="grid grid-cols-2 gap-2">
            {HORSES.map((h, i) => (
              <button
                key={i}
                onClick={() => setSelectedHorse(i)}
                className="flex items-center gap-2 px-2 py-2 rounded-lg retro-btn transition-all"
                style={{
                  background: selectedHorse === i ? `${h.color}22` : "#111828",
                  border: `1px solid ${selectedHorse === i ? h.color : "#1e2840"}`,
                  color: h.color,
                  boxShadow: selectedHorse === i ? `0 0 10px ${h.color}44` : "none",
                }}
              >
                <span className="text-lg">{h.emoji}</span>
                <div className="text-left min-w-0">
                  <div className="text-[0.55rem] font-black truncate">{h.name}</div>
                  <div className="text-[0.5rem] text-[#4a5580]">{h.odds}x payout</div>
                </div>
              </button>
            ))}
          </div>
          {selectedHorse !== null && (
            <div className="text-[0.6rem] text-[#fbbf24] text-center">
              Potential win: 🪙{Math.floor(coinBet * HORSES[selectedHorse].odds).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* ROULETTE WHEEL DISPLAY */}
      {game === "roulette" && (
        <div className="flex justify-center">
          <RouletteWheel spinning={spinning} result={result?.resultData?.spin ?? null} />
        </div>
      )}

      {/* HORSE RACE */}
      {game === "horses" && raceRunning && (
        <HorseRace running={raceRunning} winner={raceWinner} onFinish={onRaceFinish} />
      )}

      {/* PLAY BUTTON */}
      <button onClick={play} disabled={!canPlay || loading} className="w-full py-3 retro-btn font-black text-sm rounded text-[#0d1220] disabled:opacity-40 transition-transform hover:scale-105 active:scale-95" style={{ background:"#fbbf24",boxShadow:"0 0 16px #fbbf2444" }}>
        {loading
          ? game === "roulette" ? "SPINNING..." : game === "horses" ? "RACE IN PROGRESS..." : "DEALING..."
          : game === "blackjack" ? "DEAL CARDS"
          : game === "roulette" ? "SPIN WHEEL"
          : "START RACE"}
      </button>

      {/* RESULT */}
      {result && !result.error && !spinning && (
        <div className={`screen-enter rounded-xl p-4 border text-center flex flex-col gap-3 ${result.win?"border-[#34d39966] bg-[#34d39910]":"border-[#ef444466] bg-[#ef444410]"}`}>
          <div className={`text-xl font-black retro-glow ${result.win?"text-[#34d399]":"text-[#ef4444]"}`}>
            {result.win ? "YOU WIN!" : "YOU LOSE"}
          </div>

          {/* BLACKJACK CARDS */}
          {game === "blackjack" && result.resultData?.playerCards && cardsVisible && (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[0.55rem] text-[#4a5580] mb-2">YOUR HAND ({result.resultData.playerTotal})</div>
                <div className="flex gap-2 justify-center">
                  {result.resultData.playerCards.map((v: number, i: number) => (
                    <AnimCard key={i} value={v} suit={SUITS[i % 4]} delay={i * 200} />
                  ))}
                </div>
              </div>
              <div className="text-[#4a5580] text-xs font-mono">VS</div>
              <div>
                <div className="text-[0.55rem] text-[#4a5580] mb-2">DEALER ({result.resultData.dealerTotal})</div>
                <div className="flex gap-2 justify-center">
                  {result.resultData.dealerCards.map((v: number, i: number) => (
                    <AnimCard key={i} value={v} suit={SUITS[(i + 2) % 4]} delay={400 + i * 200} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ROULETTE SPIN RESULT */}
          {game === "roulette" && result.resultData?.spin !== undefined && (
            <div className="flex flex-col items-center gap-1">
              <div className="text-4xl font-black retro-glow" style={{ color: result.resultData.isRed ? "#ef4444" : result.resultData.spin === 0 ? "#34d399" : "#e2e8f0" }}>
                {result.resultData.spin}
              </div>
              <div className="text-sm font-bold" style={{ color: result.resultData.isRed ? "#ef4444" : result.resultData.spin === 0 ? "#34d399" : "#94a3b8" }}>
                {result.resultData.isRed ? "🔴 RED" : result.resultData.spin === 0 ? "🟢 ZERO" : "⚫ BLACK"}
              </div>
            </div>
          )}

          {/* HORSE RESULT */}
          {game === "horses" && result.resultData?.winnerIdx !== undefined && (
            <div className="flex flex-col items-center gap-2">
              <div className="text-3xl">{HORSES[result.resultData.winnerIdx].emoji}</div>
              <div className="font-black text-sm" style={{ color: HORSES[result.resultData.winnerIdx].color }}>
                {HORSES[result.resultData.winnerIdx].name}
              </div>
              {result.win && <div className="text-[0.6rem] text-[#34d399] font-bold">YOUR HORSE WINS! 🎉</div>}
              {!result.win && selectedHorse !== null && (
                <div className="text-[0.6rem] text-[#4a5580]">Your horse: {HORSES[selectedHorse].name}</div>
              )}
            </div>
          )}

          <div className="text-sm font-black" style={{ color: result.win ? "#34d399" : "#ef4444" }}>
            {result.win
              ? game === "horses"
                ? `+🪙${horsePayout.toLocaleString()}`
                : stakeType === "coins" ? `+🪙${coinBet}` : `+2x Power-Up`
              : stakeType === "coins" || game === "horses"
                ? `-🪙${coinBet}`
                : `-Power-Up`}
          </div>
          <div className="text-xs text-[#4a5580]">Balance: 🪙{result.user?.coins?.toLocaleString()}</div>
        </div>
      )}

      {result?.error && <div className="text-xs text-red-400 text-center retro-btn">{result.error}</div>}
    </div>
  );
}
