import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── USERS ─────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  friendId: text("friend_id").notNull().unique(), // 6-char alphanumeric
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  coins: integer("coins").notNull().default(500), // starting coins
  highScore: integer("high_score").notNull().default(0),
  totalGames: integer("total_games").notNull().default(0),
  totalScore: integer("total_score").notNull().default(0),
  // Power-up inventory as JSON: { freeze5: 2, freeze10: 1, ... }
  inventory: jsonb("inventory").notNull().default({}),
  rememberToken: text("remember_token"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── LEADERBOARD ───────────────────────────────────────────────────
export const leaderboard = pgTable("leaderboard", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  score: integer("score").notNull(),
  level: integer("level").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── FRIEND REQUESTS ───────────────────────────────────────────────
export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  fromId: integer("from_id").notNull(),
  toId: integer("to_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── INSERT SCHEMAS ────────────────────────────────────────────────
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, friendId: true, rememberToken: true });
export const insertLeaderboardSchema = createInsertSchema(leaderboard).omit({ id: true, createdAt: true });
export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LeaderboardEntry = typeof leaderboard.$inferSelect;
export type FriendRequest = typeof friendRequests.$inferSelect;

// ── POWER-UP TYPES ────────────────────────────────────────────────
export type PowerUpKey = "freeze5" | "freeze10" | "freeze30" | "clearRow" | "clearAll" | "bomb" | "refresh";
export const POWERUP_DEFS: Record<PowerUpKey, { label: string; icon: string; color: string; coinCost: number; description: string }> = {
  freeze5:  { label: "Freeze 5s",  icon: "❄",  color: "#7dd3fc", coinCost: 80,  description: "Stops the surge for 5 seconds" },
  freeze10: { label: "Freeze 10s", icon: "🧊",  color: "#38bdf8", coinCost: 150, description: "Stops the surge for 10 seconds" },
  freeze30: { label: "Freeze 30s", icon: "☃️",  color: "#0ea5e9", coinCost: 350, description: "Stops the surge for 30 seconds" },
  clearRow: { label: "Clear Row",  icon: "💠",  color: "#818cf8", coinCost: 120, description: "Clears the lowest filled row" },
  clearAll: { label: "Clear All",  icon: "🌊",  color: "#34d399", coinCost: 600, description: "Wipes the entire board" },
  bomb:     { label: "Bomb",       icon: "💥",  color: "#fb923c", coinCost: 200, description: "Blasts 2 surge rows" },
  refresh:  { label: "Refresh",    icon: "🔀",  color: "#a78bfa", coinCost: 100, description: "Swaps all tray pieces" },
};
