import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import GameTab from "@/components/GameTab";
import ShopTab from "@/components/ShopTab";
import CasinoTab from "@/components/CasinoTab";
import FriendsTab from "@/components/FriendsTab";
import LeaderboardTab from "@/components/LeaderboardTab";
import AuthModal from "@/components/AuthModal";
import ProfileHeader from "@/components/ProfileHeader";

type Tab = "game" | "shop" | "casino" | "friends" | "ranks";

export default function MainApp() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("game");
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    return (
      <div className="w-screen h-dvh flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-[#7dd3fc] font-bold tracking-widest text-sm retro-glow animate-pulse">LOADING...</div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "game",    label: "PLAY",    icon: "🎮" },
    { id: "shop",    label: "SHOP",    icon: "🏪" },
    { id: "casino",  label: "CASINO",  icon: "🎲" },
    { id: "friends", label: "SOCIAL",  icon: "👥" },
    { id: "ranks",   label: "RANKS",   icon: "🏆" },
  ];

  return (
    <div className="w-screen h-dvh flex flex-col bg-[#0a0e1a] overflow-hidden">
      {/* TOP BAR */}
      <ProfileHeader onLoginClick={() => setShowAuth(true)} />

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {tab === "game"    && <GameTab onLoginClick={() => setShowAuth(true)} />}
        {tab === "shop"    && <ShopTab onLoginClick={() => setShowAuth(true)} />}
        {tab === "casino"  && <CasinoTab onLoginClick={() => setShowAuth(true)} />}
        {tab === "friends" && <FriendsTab onLoginClick={() => setShowAuth(true)} />}
        {tab === "ranks"   && <LeaderboardTab />}
      </div>

      {/* BOTTOM NAV */}
      <nav className="flex border-t border-[#1e2840] bg-[#0d1220] shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 nav-tab border-b-2 ${tab === t.id ? "active border-[#7dd3fc] text-[#7dd3fc]" : "border-transparent text-[#4a5580] hover:text-[#7dd3fc]"}`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[0.5rem]">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* AUTH MODAL */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
