import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { POWERUP_DEFS, type PowerUpKey } from "@shared/schema";

const JWT_SECRET = process.env.JWT_SECRET || "gridsurge_secret_kjb_2026";
const REMEMBER_DAYS = 30;

// Extend session type
declare module "express-session" {
  interface SessionData { userId?: number; }
}

// ── AUTH MIDDLEWARE -- accepts session OR Bearer token ───────────
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Session cookie (preferred -- persists across refreshes)
  if ((req.session as any)?.userId) {
    (req as any).userId = (req.session as any).userId;
    return next();
  }
  // 2. Bearer token fallback
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    (req as any).userId = payload.userId;
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}

function safeUser(u: any) {
  const { passwordHash, rememberToken, ...safe } = u;
  return safe;
}

// ── LEVEL THRESHOLDS (harder curve at higher levels) ─────────────
const LEVEL_THRESHOLDS = [
  0, 500, 1200, 2200, 3700, 5700, 8500, 12500, 18000, 25500,
  35000, 48000, 65000, 87000, 115000, 150000, 195000, 252000, 325000, 420000
];
function getLevelFromXP(xp: number): number {
  let level = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) { level = i; break; }
  }
  return Math.min(level, LEVEL_THRESHOLDS.length - 1);
}
const LEVEL_COIN_REWARDS: Record<number, number> = {
  2:75,3:100,4:150,5:200,6:150,7:200,8:300,9:200,10:400,12:250,14:350,15:600
};

export async function registerRoutes(httpServer: Server, app: Express) {

  // ── REGISTER ────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    const schema = z.object({ username: z.string().min(3).max(20), email: z.string().email(), password: z.string().min(6) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { username, email, password } = parsed.data;
    if (await storage.getUserByEmail(email)) return res.status(400).json({ error: "Email already in use" });
    if (await storage.getUserByUsername(username)) return res.status(400).json({ error: "Username taken" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await storage.createUser({ username, email, passwordHash });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    // Set session so cookie persists across page refreshes
    (req.session as any).userId = user.id;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.json({ token, user: safeUser(user) });
  });

  // ── LOGIN ────────────────────────────────────────────────────────
  app.post("/api/auth/login", async (req, res) => {
    const schema = z.object({ email: z.string(), password: z.string(), rememberMe: z.boolean().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
    const { email, password, rememberMe } = parsed.data;
    const user = await storage.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: rememberMe ? `${REMEMBER_DAYS}d` : "7d" });
    let rememberToken: string | undefined;
    if (rememberMe) {
      rememberToken = randomBytes(32).toString("hex");
      await storage.updateUser(user.id, { rememberToken });
    }
    // Set session so cookie persists across page refreshes
    (req.session as any).userId = user.id;
    if (rememberMe) req.session.cookie.maxAge = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
    await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.json({ token, rememberToken: rememberToken || null, user: safeUser(user) });
  });

  // ── REMEMBER TOKEN LOGIN ─────────────────────────────────────────
  app.post("/api/auth/remember", async (req, res) => {
    const { rememberToken } = req.body;
    if (!rememberToken) return res.status(401).json({ error: "No token" });
    const user = await storage.getUserByRememberToken(rememberToken);
    if (!user) return res.status(401).json({ error: "Invalid remember token" });
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: `${REMEMBER_DAYS}d` });
    res.json({ token, user: safeUser(user) });
  });

  // ── ME ───────────────────────────────────────────────────────────
  app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
    const user = await storage.getUserById(req.userId);
    if (!user) { req.session.destroy(() => {}); return res.status(404).json({ error: "User not found" }); }
    res.json(safeUser(user));
  });

  // ── LOGOUT ─────────────────────────────────────────────
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  // ── SAVE GAME PROGRESS ───────────────────────────────────────────
  app.post("/api/game/save", authMiddleware, async (req: any, res) => {
    const schema = z.object({ score: z.number(), xpGained: z.number() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid" });
    const { score, xpGained } = parsed.data;
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Not found" });
    const newXP = user.xp + xpGained;
    const oldLevel = user.level;
    const newLevel = getLevelFromXP(newXP);
    let coinsEarned = Math.floor(score / 100); // 1 coin per 100 score
    if (newLevel > oldLevel) {
      for (let l = oldLevel + 1; l <= newLevel; l++) {
        coinsEarned += (LEVEL_COIN_REWARDS[l] || 50);
      }
    }
    const newHighScore = Math.max(user.highScore, score);
    const updated = await storage.updateUser(user.id, {
      xp: newXP, level: newLevel,
      highScore: newHighScore,
      totalGames: user.totalGames + 1,
      totalScore: user.totalScore + score,
      coins: user.coins + coinsEarned,
    });
    // Auto-submit to leaderboard when high score is beaten
    if (score >= user.highScore && score > 0) {
      await storage.addScore({ name: user.username, score, level: newLevel, userId: user.id });
    }
    const allScores = await storage.getTopScores(1000);
    const globalRank = allScores.filter(e => e.score > newHighScore).length + 1;
    res.json({ user: safeUser(updated), coinsEarned, leveledUp: newLevel > oldLevel, newLevel, globalRank });
  });

  // ── SHOP: BUY POWER-UP ───────────────────────────────────────────
  app.post("/api/shop/buy", authMiddleware, async (req: any, res) => {
    const schema = z.object({ powerUp: z.string(), qty: z.number().min(1).max(10).default(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid" });
    const { powerUp, qty } = parsed.data;
    if (!(powerUp in POWERUP_DEFS)) return res.status(400).json({ error: "Unknown power-up" });
    const def = POWERUP_DEFS[powerUp as PowerUpKey];
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Not found" });
    const totalCost = def.coinCost * qty;
    if (user.coins < totalCost) return res.status(400).json({ error: "Not enough coins" });
    const inv = { ...(user.inventory as Record<string, number>) };
    inv[powerUp] = (inv[powerUp] || 0) + qty;
    const updated = await storage.updateUser(user.id, { coins: user.coins - totalCost, inventory: inv });
    res.json({ user: safeUser(updated) });
  });

  // ── USE POWER-UP (deduct from inventory) ────────────────────────
  app.post("/api/shop/use", authMiddleware, async (req: any, res) => {
    const schema = z.object({ powerUp: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid" });
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Not found" });
    const inv = { ...(user.inventory as Record<string, number>) };
    if (!inv[parsed.data.powerUp] || inv[parsed.data.powerUp] <= 0) return res.status(400).json({ error: "No power-up" });
    inv[parsed.data.powerUp]--;
    if (inv[parsed.data.powerUp] === 0) delete inv[parsed.data.powerUp];
    const updated = await storage.updateUser(user.id, { inventory: inv });
    res.json({ user: safeUser(updated) });
  });

  // ── CASINO: GAMBLE ───────────────────────────────────────────────
  // blackjack or roulette — coins or power-up as stake
  app.post("/api/casino/play", authMiddleware, async (req: any, res) => {
    const schema = z.object({
      game: z.enum(["blackjack", "roulette"]),
      stakeType: z.enum(["coins", "powerup"]),
      stakeCoins: z.number().min(10).optional(),
      stakePowerUp: z.string().optional(),
      // roulette: bet type
      rouletteBet: z.enum(["red","black","number","dozen"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid" });
    const { game, stakeType, stakeCoins, stakePowerUp, rouletteBet } = parsed.data;
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Not found" });

    // Validate stake
    if (stakeType === "coins") {
      if (!stakeCoins || user.coins < stakeCoins) return res.status(400).json({ error: "Not enough coins" });
    } else {
      if (!stakePowerUp) return res.status(400).json({ error: "No power-up specified" });
      const inv = user.inventory as Record<string, number>;
      if (!inv[stakePowerUp] || inv[stakePowerUp] <= 0) return res.status(400).json({ error: "No power-up to stake" });
    }

    // 40% win ratio
    const win = Math.random() < 0.40;
    let coinDelta = 0;
    let invDelta: Record<string, number> = {};
    let resultMsg = "";
    let resultData: any = {};

    if (game === "blackjack") {
      // Simple blackjack sim: deal cards, player wins or loses
      const deal = () => Math.min(Math.floor(Math.random() * 13) + 1, 10);
      const playerCards = [deal(), deal()];
      const dealerCards = [deal(), deal()];
      const playerTotal = playerCards.reduce((a, b) => a + b, 0);
      const dealerTotal = dealerCards.reduce((a, b) => a + b, 0);
      resultData = { playerCards, dealerCards, playerTotal, dealerTotal };
      resultMsg = win ? "Blackjack WIN!" : "Dealer wins.";
    } else {
      // Roulette: spin 0-36
      const spin = Math.floor(Math.random() * 37);
      const red = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
      const isRed = red.includes(spin);
      const betType = rouletteBet || "red";
      let betWin = false;
      let multiplierPayout = 2;
      if (betType === "red" || betType === "black") { betWin = betType === "red" ? isRed : !isRed && spin !== 0; multiplierPayout = 2; }
      else if (betType === "number") { betWin = true; multiplierPayout = 35; } // simplified
      else if (betType === "dozen") { betWin = spin >= 1 && spin <= 12; multiplierPayout = 3; }
      resultData = { spin, isRed, betType };
      resultMsg = win ? `Roulette WIN! ${spin}` : `Roulette LOSS. ${spin}`;
    }

    // Apply outcome
    const inv = { ...(user.inventory as Record<string, number>) };
    if (stakeType === "coins" && stakeCoins) {
      coinDelta = win ? stakeCoins : -stakeCoins;
    } else if (stakeType === "powerup" && stakePowerUp) {
      inv[stakePowerUp] = (inv[stakePowerUp] || 0) - 1;
      if (inv[stakePowerUp] <= 0) delete inv[stakePowerUp];
      if (win) {
        // Win 2x the power-up
        inv[stakePowerUp] = (inv[stakePowerUp] || 0) + 2;
      }
      invDelta = inv;
    }

    const updated = await storage.updateUser(user.id, {
      coins: Math.max(0, user.coins + coinDelta),
      inventory: stakeType === "powerup" ? inv : user.inventory,
    });

    res.json({ win, coinDelta, resultMsg, resultData, user: safeUser(updated) });
  });

  // ── LEADERBOARD ──────────────────────────────────────────────────
  app.get("/api/leaderboard", async (req, res) => {
    const scores = await storage.getTopScores(20);
    res.json(scores);
  });
  // Called by server on game save — auto-submit to leaderboard if high score improved
  app.post("/api/leaderboard", async (req, res) => {
    const schema = z.object({ name: z.string(), score: z.number(), level: z.number().default(1), userId: z.number().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid" });
    const entry = await storage.addScore(parsed.data);
    // Rank = number of unique scores strictly higher + 1
    const all = await storage.getTopScores(1000);
    const rank = all.filter(e => e.score > parsed.data.score).length + 1;
    res.json({ entry, rank });
  });
  // Global rank for a user
  app.get("/api/leaderboard/rank", authMiddleware, async (req: any, res) => {
    const user = await storage.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "Not found" });
    const all = await storage.getTopScores(1000);
    const rank = all.filter(e => e.score > user.highScore).length + 1;
    res.json({ rank, highScore: user.highScore });
  });

  // ── FRIENDS ──────────────────────────────────────────────────────
  app.post("/api/friends/request", authMiddleware, async (req: any, res) => {
    const { friendId } = req.body;
    if (!friendId) return res.status(400).json({ error: "No friend ID" });
    const target = await storage.getUserByFriendId(friendId);
    if (!target) return res.status(404).json({ error: "User not found with that ID" });
    if (target.id === req.userId) return res.status(400).json({ error: "Can't add yourself" });
    const already = await storage.areFriends(req.userId, target.id);
    if (already) return res.status(400).json({ error: "Already friends" });
    const request = await storage.sendFriendRequest(req.userId, target.id);
    res.json(request);
  });
  app.get("/api/friends/requests", authMiddleware, async (req: any, res) => {
    const requests = await storage.getFriendRequests(req.userId);
    res.json(requests);
  });
  app.post("/api/friends/respond", authMiddleware, async (req: any, res) => {
    const { requestId, action } = req.body;
    if (!requestId || !["accepted","rejected"].includes(action)) return res.status(400).json({ error: "Invalid" });
    const result = await storage.respondFriendRequest(requestId, action);
    res.json(result);
  });
  app.get("/api/friends", authMiddleware, async (req: any, res) => {
    const friends = await storage.getFriends(req.userId);
    res.json(friends);
  });
  app.get("/api/friends/stats/:friendId", authMiddleware, async (req: any, res) => {
    const target = await storage.getUserByFriendId(req.params.friendId);
    if (!target) return res.status(404).json({ error: "Not found" });
    const areFriends = await storage.areFriends(req.userId, target.id);
    if (!areFriends) return res.status(403).json({ error: "Not friends" });
    const { passwordHash, rememberToken, email, ...safe } = target;
    res.json(safe);
  });
}
