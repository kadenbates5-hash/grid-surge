import { users, leaderboard, friendRequests, type User, type LeaderboardEntry, type FriendRequest, type PowerUpKey } from "@shared/schema";
import { randomBytes } from "crypto";

function genFriendId(): string {
  return randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F9B1"
}

export interface IStorage {
  // Users
  createUser(data: { username: string; email: string; passwordHash: string }): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByFriendId(friendId: string): Promise<User | undefined>;
  getUserByRememberToken(token: string): Promise<User | undefined>;
  updateUser(id: number, updates: Partial<User>): Promise<User>;

  // Leaderboard
  addScore(entry: { name: string; score: number; level: number; userId?: number }): Promise<LeaderboardEntry>;
  getTopScores(limit?: number): Promise<LeaderboardEntry[]>;
  getRank(score: number): Promise<number>;

  // Friends
  sendFriendRequest(fromId: number, toId: number): Promise<FriendRequest>;
  respondFriendRequest(requestId: number, status: "accepted" | "rejected"): Promise<FriendRequest>;
  getFriendRequests(userId: number): Promise<(FriendRequest & { fromUser: Partial<User>; toUser: Partial<User> })[]>;
  getFriends(userId: number): Promise<Partial<User>[]>;
  areFriends(a: number, b: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private _users: User[] = [];
  private _lb: LeaderboardEntry[] = [];
  private _fr: FriendRequest[] = [];
  private uid = 1; private lid = 1; private fid = 1;

  async createUser(data: { username: string; email: string; passwordHash: string }): Promise<User> {
    const user: User = {
      id: this.uid++, username: data.username, email: data.email,
      passwordHash: data.passwordHash, friendId: genFriendId(),
      level: 1, xp: 0, coins: 500, highScore: 0, totalGames: 0, totalScore: 0,
      inventory: {}, rememberToken: null, createdAt: new Date(),
    };
    this._users.push(user); return user;
  }
  async getUserById(id: number) { return this._users.find(u => u.id === id); }
  async getUserByEmail(email: string) { return this._users.find(u => u.email.toLowerCase() === email.toLowerCase()); }
  async getUserByUsername(username: string) { return this._users.find(u => u.username.toLowerCase() === username.toLowerCase()); }
  async getUserByFriendId(fid: string) { return this._users.find(u => u.friendId === fid.toUpperCase()); }
  async getUserByRememberToken(token: string) { return this._users.find(u => u.rememberToken === token); }
  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const idx = this._users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error("User not found");
    this._users[idx] = { ...this._users[idx], ...updates };
    return this._users[idx];
  }

  async addScore(entry: { name: string; score: number; level: number; userId?: number }): Promise<LeaderboardEntry> {
    // One entry per user: keep only their best score
    if (entry.userId != null) {
      const existingIdx = this._lb.findIndex(e => e.userId === entry.userId);
      if (existingIdx >= 0) {
        if (entry.score > this._lb[existingIdx].score) {
          this._lb[existingIdx] = { ...this._lb[existingIdx], score: entry.score, level: entry.level, name: entry.name, createdAt: new Date() };
          return this._lb[existingIdx];
        }
        return this._lb[existingIdx];
      }
    }
    const e: LeaderboardEntry = { id: this.lid++, name: entry.name, score: entry.score, level: entry.level, userId: entry.userId ?? null, createdAt: new Date() };
    this._lb.push(e); return e;
  }
  async getTopScores(limit = 20): Promise<LeaderboardEntry[]> {
    // Deduplicate by userId keeping best, then sort
    const seen = new Map<number | null, LeaderboardEntry>();
    for (const e of this._lb) {
      const key = e.userId;
      if (key == null) {
        // Anonymous: keep all but still sort
        seen.set(-(e.id), e);
      } else if (!seen.has(key) || seen.get(key)!.score < e.score) {
        seen.set(key, e);
      }
    }
    return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
  async getRank(score: number): Promise<number> {
    const top = await this.getTopScores(1000);
    return top.filter(e => e.score > score).length + 1;
  }

  async sendFriendRequest(fromId: number, toId: number): Promise<FriendRequest> {
    const existing = this._fr.find(r => r.fromId === fromId && r.toId === toId && r.status === "pending");
    if (existing) return existing;
    const r: FriendRequest = { id: this.fid++, fromId, toId, status: "pending", createdAt: new Date() };
    this._fr.push(r); return r;
  }
  async respondFriendRequest(requestId: number, status: "accepted" | "rejected"): Promise<FriendRequest> {
    const r = this._fr.find(r => r.id === requestId);
    if (!r) throw new Error("Request not found");
    r.status = status; return r;
  }
  async getFriendRequests(userId: number) {
    const reqs = this._fr.filter(r => (r.toId === userId || r.fromId === userId));
    return reqs.map(r => ({
      ...r,
      fromUser: this._users.find(u => u.id === r.fromId) ? { id: r.fromId, username: this._users.find(u => u.id === r.fromId)!.username, friendId: this._users.find(u => u.id === r.fromId)!.friendId, level: this._users.find(u => u.id === r.fromId)!.level } : {},
      toUser: this._users.find(u => u.id === r.toId) ? { id: r.toId, username: this._users.find(u => u.id === r.toId)!.username } : {},
    }));
  }
  async getFriends(userId: number): Promise<Partial<User>[]> {
    const accepted = this._fr.filter(r => r.status === "accepted" && (r.fromId === userId || r.toId === userId));
    const friendIds = accepted.map(r => r.fromId === userId ? r.toId : r.fromId);
    return friendIds.map(fid => {
      const u = this._users.find(u => u.id === fid);
      if (!u) return {};
      return { id: u.id, username: u.username, friendId: u.friendId, level: u.level, highScore: u.highScore, totalGames: u.totalGames };
    }).filter(u => u.id);
  }
  async areFriends(a: number, b: number): Promise<boolean> {
    return this._fr.some(r => r.status === "accepted" && ((r.fromId === a && r.toId === b) || (r.fromId === b && r.toId === a)));
  }
}

export const storage = new MemStorage();
