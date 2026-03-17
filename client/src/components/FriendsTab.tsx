import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface FriendUser {
  id: number;
  username: string;
  friendId: string;
  level: number;
  highScore: number;
  totalGames: number;
}

interface FriendRequest {
  id: number;
  fromId: number;
  toId: number;
  status: string;
  fromUser: { id: number; username: string; friendId: string; level: number };
  toUser: { id: number; username: string };
}

export default function FriendsTab({ onLoginClick }: { onLoginClick: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [searchId, setSearchId] = useState("");
  const [viewingFriend, setViewingFriend] = useState<FriendUser | null>(null);

  const { data: friends = [], isLoading: loadingFriends } = useQuery<FriendUser[]>({
    queryKey: ["/api/friends"],
    queryFn: () => apiRequest("GET", "/api/friends").then(r => r.json()),
    enabled: !!user,
  });

  const { data: requests = [], isLoading: loadingRequests } = useQuery<FriendRequest[]>({
    queryKey: ["/api/friends/requests"],
    queryFn: () => apiRequest("GET", "/api/friends/requests").then(r => r.json()),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const sendReq = useMutation({
    mutationFn: (friendId: string) => apiRequest("POST", "/api/friends/request", { friendId }).then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error); });
      return r.json();
    }),
    onSuccess: () => {
      toast({ title: "Friend request sent!" });
      setSearchId("");
      qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const respond = useMutation({
    mutationFn: ({ requestId, action }: { requestId: number; action: "accepted" | "rejected" }) =>
      apiRequest("POST", "/api/friends/respond", { requestId, action }).then(r => r.json()),
    onSuccess: (_, vars) => {
      toast({ title: vars.action === "accepted" ? "Friend accepted!" : "Request declined" });
      qc.invalidateQueries({ queryKey: ["/api/friends"] });
      qc.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    },
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 screen-enter">
        <div className="text-4xl">👥</div>
        <p className="text-[#7dd3fc] text-sm retro-glow text-center">Login to connect with friends</p>
        <Button onClick={onLoginClick} className="retro-btn bg-[#7dd3fc] text-[#0a0e1a] hover:bg-[#38bdf8] font-bold px-6">
          LOGIN / REGISTER
        </Button>
      </div>
    );
  }

  const pendingIncoming = requests.filter(r => r.toId === user.id && r.status === "pending");
  const pendingOutgoing = requests.filter(r => r.fromId === user.id && r.status === "pending");

  return (
    <div className="p-4 space-y-4 screen-enter max-w-lg mx-auto">

      {/* MY FRIEND ID */}
      <div className="retro-border rounded-lg p-4 bg-[#0d1220]">
        <div className="text-[#4a5580] text-xs mb-1 font-mono">YOUR FRIEND ID</div>
        <div className="text-[#7dd3fc] text-2xl font-mono font-bold retro-glow tracking-widest">{user.friendId}</div>
        <div className="text-[#4a5580] text-xs mt-1">Share this ID so others can add you</div>
      </div>

      {/* SEND FRIEND REQUEST */}
      <div className="retro-border rounded-lg p-4 bg-[#0d1220] space-y-2">
        <div className="text-[#7dd3fc] text-xs font-mono font-bold tracking-widest">ADD A FRIEND</div>
        <div className="flex gap-2">
          <Input
            data-testid="input-friend-id"
            placeholder="Enter Friend ID..."
            value={searchId}
            onChange={e => setSearchId(e.target.value.toUpperCase())}
            maxLength={6}
            className="bg-[#111828] border-[#1e2840] text-[#7dd3fc] font-mono placeholder:text-[#2a3450] uppercase tracking-widest"
          />
          <Button
            data-testid="button-send-request"
            onClick={() => searchId.length >= 4 && sendReq.mutate(searchId)}
            disabled={searchId.length < 4 || sendReq.isPending}
            className="retro-btn bg-[#7dd3fc] text-[#0a0e1a] hover:bg-[#38bdf8] font-bold shrink-0"
          >
            {sendReq.isPending ? "..." : "ADD"}
          </Button>
        </div>
      </div>

      {/* INCOMING REQUESTS */}
      {pendingIncoming.length > 0 && (
        <div className="retro-border rounded-lg p-4 bg-[#0d1220] space-y-2">
          <div className="text-[#fb923c] text-xs font-mono font-bold tracking-widest">
            INCOMING REQUESTS ({pendingIncoming.length})
          </div>
          {pendingIncoming.map(req => (
            <div key={req.id} className="flex items-center justify-between gap-2 bg-[#111828] rounded p-2">
              <div>
                <span className="text-[#7dd3fc] font-mono text-sm font-bold">{req.fromUser?.username}</span>
                <span className="text-[#4a5580] text-xs ml-2">Lv.{req.fromUser?.level}</span>
                <div className="text-[#4a5580] text-xs font-mono">#{req.fromUser?.friendId}</div>
              </div>
              <div className="flex gap-1">
                <Button
                  data-testid={`button-accept-${req.id}`}
                  size="sm"
                  onClick={() => respond.mutate({ requestId: req.id, action: "accepted" })}
                  className="retro-btn bg-[#34d399] text-[#0a0e1a] hover:bg-[#10b981] text-xs h-7 px-2"
                >
                  ACCEPT
                </Button>
                <Button
                  data-testid={`button-reject-${req.id}`}
                  size="sm"
                  onClick={() => respond.mutate({ requestId: req.id, action: "rejected" })}
                  className="retro-btn bg-[#ef4444] text-white hover:bg-[#dc2626] text-xs h-7 px-2"
                >
                  DECLINE
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OUTGOING REQUESTS */}
      {pendingOutgoing.length > 0 && (
        <div className="retro-border rounded-lg p-4 bg-[#0d1220] space-y-2">
          <div className="text-[#4a5580] text-xs font-mono font-bold tracking-widest">PENDING SENT ({pendingOutgoing.length})</div>
          {pendingOutgoing.map(req => (
            <div key={req.id} className="flex items-center gap-2 bg-[#111828] rounded p-2">
              <span className="text-[#7dd3fc] font-mono text-sm">{req.toUser?.username}</span>
              <span className="text-[#4a5580] text-xs ml-auto">Awaiting...</span>
            </div>
          ))}
        </div>
      )}

      {/* FRIENDS LIST */}
      <div className="retro-border rounded-lg p-4 bg-[#0d1220] space-y-2">
        <div className="text-[#7dd3fc] text-xs font-mono font-bold tracking-widest">
          FRIENDS ({friends.length})
        </div>
        {loadingFriends ? (
          <div className="text-[#4a5580] text-xs font-mono text-center py-3">Loading...</div>
        ) : friends.length === 0 ? (
          <div className="text-[#4a5580] text-xs font-mono text-center py-3">No friends yet. Add someone above!</div>
        ) : (
          friends.map(f => (
            <button
              key={f.id}
              data-testid={`card-friend-${f.id}`}
              onClick={() => setViewingFriend(viewingFriend?.id === f.id ? null : f)}
              className="w-full flex items-center gap-3 bg-[#111828] rounded p-3 hover:bg-[#1a2440] transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full bg-[#1e2840] border border-[#7dd3fc44] flex items-center justify-center text-[#7dd3fc] font-mono font-bold text-sm shrink-0">
                {f.username[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[#7dd3fc] font-mono text-sm font-bold truncate">{f.username}</div>
                <div className="text-[#4a5580] text-xs font-mono">#{f.friendId} &bull; Lv.{f.level}</div>
              </div>
              <div className="text-[#34d399] text-xs font-mono shrink-0">
                {f.highScore.toLocaleString()}pts
              </div>
            </button>
          ))
        )}
      </div>

      {/* FRIEND STATS PANEL */}
      {viewingFriend && (
        <div className="retro-border rounded-lg p-4 bg-[#0d1220] space-y-3 screen-enter">
          <div className="flex items-center justify-between">
            <div className="text-[#7dd3fc] text-xs font-mono font-bold tracking-widest">{viewingFriend.username.toUpperCase()} STATS</div>
            <button onClick={() => setViewingFriend(null)} className="text-[#4a5580] hover:text-[#7dd3fc] text-lg leading-none">&times;</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "LEVEL", value: viewingFriend.level },
              { label: "HIGH SCORE", value: viewingFriend.highScore.toLocaleString() },
              { label: "TOTAL GAMES", value: viewingFriend.totalGames },
              { label: "FRIEND ID", value: `#${viewingFriend.friendId}` },
            ].map(stat => (
              <div key={stat.label} className="bg-[#111828] rounded p-2">
                <div className="text-[#4a5580] text-xs font-mono">{stat.label}</div>
                <div className="text-[#7dd3fc] font-mono font-bold text-sm">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BRANDING */}
      <div className="text-center text-[#1e2840] text-xs font-mono pb-2">Developed by KJB</div>
    </div>
  );
}
