# GRID SURGE

> A retro baby-blue block-stacking arcade platform — place pieces, clear lines, survive the surge.

**Developed by KJB**

---

## Play Now

**[grid-surge.vercel.app](https://www.perplexity.ai/computer/a/grid-surge-YRJLnAk9RdyNpPN2FXcAmw)** — Live hosted version, playable on mobile and desktop.

---

## Features

| Feature | Details |
|---|---|
| **Game** | 7x7 grid, drag-and-drop pieces, horizontal + vertical line clears |
| **Surge** | Rising wall every 30s — resets when you clear a line |
| **Power-Ups** | Freeze 5/10/30s, Bomb, Clear Row, Clear All, Refresh |
| **Levels** | 20 levels with escalating XP requirements, coin + power-up rewards |
| **Coins** | Earned from score and leveling up, spent in the Shop |
| **Casino** | Blackjack (animated deal), Roulette (spinning wheel), Horse Racing (live race) |
| **Leaderboard** | Global top 20, one entry per player showing their best score |
| **Social** | Friend IDs, friend requests, view friend stats |
| **Auth** | Register / Login with Remember Me (stays logged in) |

---

## Tech Stack

- **Frontend** — React 18, Vite, Tailwind CSS v3, shadcn/ui, TanStack Query
- **Backend** — Express.js, JWT auth, bcryptjs, in-memory storage
- **Language** — TypeScript (full-stack)
- **Build** — Vite + esbuild monorepo

---

## Local Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/kadenbates5-hash/grid-surge.git
cd grid-surge
npm install
npm run dev
```

The app starts at `http://localhost:5000`.

### Build

```bash
npm run build
```

Outputs to `dist/public` (frontend) and `dist/index.cjs` (backend).

### Production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

---

## Project Structure

```
grid-surge/
├── client/
│   ├── index.html
│   └── src/
│       ├── components/       # GameTab, CasinoTab, ShopTab, FriendsTab, LeaderboardTab
│       ├── context/          # AuthContext (JWT + Remember Me)
│       ├── lib/              # apiRequest, auth helpers
│       └── pages/            # MainApp, not-found
├── server/
│   ├── index.ts              # Express entrypoint
│   ├── routes.ts             # All API routes
│   ├── storage.ts            # In-memory MemStorage
│   └── vite.ts               # Dev server integration
├── shared/
│   └── schema.ts             # Types, power-up defs, DB schema
└── dist/                     # Build output (gitignored)
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | `gridsurge_secret_kjb_2026` | JWT signing secret — change in production |
| `NODE_ENV` | `development` | Set to `production` for prod builds |

---

## API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login (returns JWT + optional remember token) |
| POST | `/api/auth/remember` | — | Auto-login via remember token |
| GET | `/api/auth/me` | JWT | Get current user |
| POST | `/api/game/save` | JWT | Save game result, earn coins + XP |
| POST | `/api/shop/buy` | JWT | Buy power-up with coins |
| POST | `/api/shop/use` | JWT | Use a power-up (deduct from inventory) |
| POST | `/api/casino/play` | JWT | Blackjack or Roulette |
| GET | `/api/leaderboard` | — | Top 20 global scores |
| POST | `/api/friends/request` | JWT | Send friend request by Friend ID |
| GET | `/api/friends/requests` | JWT | Get all pending requests |
| POST | `/api/friends/respond` | JWT | Accept or decline a request |
| GET | `/api/friends` | JWT | Get friends list |
| GET | `/api/friends/stats/:friendId` | JWT | View a friend's stats |

---

## License

MIT — free to use, modify, and deploy.

---

*Developed by KJB · Built with Perplexity Computer*
