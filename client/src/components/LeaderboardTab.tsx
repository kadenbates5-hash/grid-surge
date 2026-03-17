import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";

interface LeaderboardEntry {
  id: number;
  userId: number | null;
  name: string;
  score: number;
  level: number;
  createdAt: string;
}

const LEVEL_THRESHOLDS = [0,300,700,1300,2100,3200,4600,6300,8400,11000,14000,18000,23000,29000,36000,45000,56000,69000,85000,105000];

function xpForLevel(level: number): number {
  return LEVEL_THRESHOLDS[Math.min(level, LEVEL_THRESHOLDS.length - 1)] || 0;
}

function rankBadge(rank: number): { label: string; color: string } {
  if (rank === 1) return { label: "🥇", color: "#facc15" };
  if (rank === 2) return { label: "🥈", color: "#94a3b8" };
  if (rank === 3) return { label: "🥉", color: "#fb923c" };
  return { label: `#${rank}`, color: "#4a5580" };
}

export default function LeaderboardTab() {
  const { user } = useAuth();

  const { data: entries = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard"],
    queryFn: () => apiRequest("GET", "/api/leaderboard").then(r => r.json()),
    refetchInterval: 30000,
  });

  // Find personal rank
  const myRank = user
    ? entries.findIndex(e => e.userId === user.id) + 1 || null
    : null;

  return (
    <div className="p-4 space-y-4 screen-enter max-w-lg mx-auto">

      {/* HEADER */}
      <div className="text-center space-y-1">
        <div className="text-[#7dd3fc] text-lg font-mono font-bold retro-glow tracking-widest">
          GLOBAL RANKS
        </div>
        <div className="text-[#4a5580] text-xs font-mono">Top 20 all-time scores</div>
        <div className="text-[#1e2840] text-xs font-mono">Developed by KJB</div>
      </div>

      {/* PERSONAL STANDING */}
      {user && (
        <div className="retro-border rounded-lg p-3 bg-[#0d1220] flex items-center gap-3">
          <div className="text-2xl">
            {myRank ? rankBadge(myRank).label : "🎮"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[#7dd3fc] font-mono text-sm font-bold truncate">{user.username}</div>
            <div className="text-[#4a5580] text-xs font-mono">
              Lv.{user.level} &bull; {user.xp.toLocaleString()} XP &bull; {user.highScore.toLocaleString()} pts
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[#7dd3fc] font-mono text-sm font-bold">
              {myRank ? `RANK #${myRank}` : "UNRANKED"}
            </div>
            <div className="text-[#4a5580] text-xs font-mono">{user.coins} coins</div>
          </div>
        </div>
      )}

      {/* LEVEL XP TABLE */}
      {user && (
        <div className="retro-border rounded-lg p-3 bg-[#0d1220]">
          <div className="text-[#7dd3fc] text-xs font-mono font-bold tracking-widest mb-2">YOUR PROGRESS</div>
          <div className="flex items-center gap-2">
            <div className="text-[#fb923c] font-mono font-bold text-sm">Lv.{user.level}</div>
            <div className="flex-1 h-2 bg-[#1e2840] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7dd3fc] transition-all duration-500"
                style={{
                  width: user.level >= 19 ? "100%" :
                    `${Math.min(100, ((user.xp - xpForLevel(user.level)) / (xpForLevel(user.level + 1) - xpForLevel(user.level))) * 100)}%`
                }}
              />
            </div>
            <div className="text-[#4a5580] font-mono text-xs">Lv.{Math.min(user.level + 1, 19)}</div>
          </div>
          <div className="text-[#4a5580] text-xs font-mono mt-1">
            {user.level >= 19
              ? "MAX LEVEL"
              : `${(xpForLevel(user.level + 1) - user.xp).toLocaleString()} XP to next level`}
          </div>
        </div>
      )}

      {/* LEADERBOARD TABLE */}
      <div className="retro-border rounded-lg bg-[#0d1220] overflow-hidden">
        <div className="flex items-center px-3 py-2 border-b border-[#1e2840]">
          <div className="text-[#4a5580] text-xs font-mono w-10">#</div>
          <div className="text-[#4a5580] text-xs font-mono flex-1">PLAYER</div>
          <div className="text-[#4a5580] text-xs font-mono text-right w-14">LV</div>
          <div className="text-[#4a5580] text-xs font-mono text-right w-20">SCORE</div>
        </div>

        {isLoading ? (
          <div className="text-[#4a5580] text-xs font-mono text-center py-8 animate-pulse">LOADING...</div>
        ) : entries.length === 0 ? (
          <div className="text-[#4a5580] text-xs font-mono text-center py-8">
            No scores yet. Play a game to be first!
          </div>
        ) : (
          entries.map((entry, i) => {
            const rank = i + 1;
            const badge = rankBadge(rank);
            const isMe = user && entry.userId === user.id;
            return (
              <div
                key={entry.id}
                data-testid={`row-leaderboard-${entry.id}`}
                className={`flex items-center px-3 py-2 border-b border-[#111828] transition-colors ${
                  isMe ? "bg-[#1a2440]" : "hover:bg-[#111828]"
                }`}
              >
                <div
                  className="text-xs font-mono w-10 font-bold"
                  style={{ color: badge.color }}
                >
                  {badge.label}
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="font-mono text-sm font-bold truncate block"
                    style={{ color: isMe ? "#38bdf8" : "#cbd5e1" }}
                  >
                    {entry.name}
                    {isMe && <span className="text-[#4a5580] text-xs ml-1">(you)</span>}
                  </span>
                </div>
                <div className="text-[#4a5580] text-xs font-mono text-right w-14">
                  Lv.{entry.level}
                </div>
                <div
                  className="font-mono text-sm font-bold text-right w-20"
                  style={{ color: rank <= 3 ? badge.color : "#7dd3fc" }}
                >
                  {entry.score.toLocaleString()}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PERSONAL GAME HISTORY NOTE */}
      {user && (
        <div className="text-center text-[#4a5580] text-xs font-mono py-1">
          {user.totalGames} game{user.totalGames !== 1 ? "s" : ""} played &bull; {user.totalScore.toLocaleString()} total score
        </div>
      )}
    </div>
  );
}
