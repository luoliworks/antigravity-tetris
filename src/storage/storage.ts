import type { Difficulty } from '../core';

export type Language = 'en' | 'zh';

export interface UserPreferences {
  language: Language;
  bgmVolume: number;
  sfxVolume: number;
  muted: boolean;
  aiCommentary: boolean;
}

export interface HighScoreEntry {
  score: number;
  level: number;
  linesCleared: number;
  ringsCleared: number;
  maxFlowCombo: number;
  quickRate: number;
  date: string;
}

export interface HighScoreRecordResult {
  isNewRecord: boolean;
  rank: number | null;
  entries: HighScoreEntry[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredScores {
  easy: HighScoreEntry[];
  hard: HighScoreEntry[];
}

const PREFS_KEY = 'antigravity_tetris_prefs_v1';
const SCORES_KEY = 'antigravity_tetris_scores_v1';
const MAX_HIGH_SCORES = 5;

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'en',
  bgmVolume: 0.65,
  sfxVolume: 0.8,
  muted: false,
  aiCommentary: true,
};

function clamp01(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || Number.isNaN(val)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, val));
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeScoreList(raw: unknown): HighScoreEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const clean: HighScoreEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<HighScoreEntry>;
    if (typeof obj.score !== 'number' || obj.score <= 0) continue;
    clean.push({
      score: Math.floor(obj.score),
      level: typeof obj.level === 'number' && obj.level >= 1 ? Math.floor(obj.level) : 1,
      linesCleared:
        typeof obj.linesCleared === 'number' && obj.linesCleared >= 0
          ? Math.floor(obj.linesCleared)
          : 0,
      ringsCleared:
        typeof obj.ringsCleared === 'number' && obj.ringsCleared >= 0
          ? Math.floor(obj.ringsCleared)
          : 0,
      maxFlowCombo:
        typeof obj.maxFlowCombo === 'number' && obj.maxFlowCombo >= 0
          ? Math.floor(obj.maxFlowCombo)
          : 0,
      quickRate:
        typeof obj.quickRate === 'number' ? Math.min(1, Math.max(0, obj.quickRate)) : 0,
      date: typeof obj.date === 'string' && obj.date.length > 0 ? obj.date : todayIsoDate(),
    });
  }
  clean.sort((a, b) => b.score - a.score || b.level - a.level);
  return clean.slice(0, MAX_HIGH_SCORES);
}

export class StorageService {
  private readonly backend: StorageLike | null;
  private readonly prefListeners = new Set<(prefs: UserPreferences) => void>();

  constructor(backend?: StorageLike | null) {
    this.backend = backend === undefined ? getDefaultStorage() : backend;
  }

  getPreferences(): UserPreferences {
    const raw = this.readJson(PREFS_KEY);
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_PREFERENCES };
    }
    const obj = raw as Partial<UserPreferences>;
    return {
      language: obj.language === 'zh' ? 'zh' : 'en',
      bgmVolume: clamp01(obj.bgmVolume, DEFAULT_PREFERENCES.bgmVolume),
      sfxVolume: clamp01(obj.sfxVolume, DEFAULT_PREFERENCES.sfxVolume),
      muted: typeof obj.muted === 'boolean' ? obj.muted : DEFAULT_PREFERENCES.muted,
      aiCommentary:
        typeof obj.aiCommentary === 'boolean'
          ? obj.aiCommentary
          : DEFAULT_PREFERENCES.aiCommentary,
    };
  }

  updatePreferences(patch: Partial<UserPreferences>): UserPreferences {
    const current = this.getPreferences();
    const next: UserPreferences = {
      language: patch.language === 'zh' ? 'zh' : patch.language === 'en' ? 'en' : current.language,
      bgmVolume:
        patch.bgmVolume !== undefined ? clamp01(patch.bgmVolume, current.bgmVolume) : current.bgmVolume,
      sfxVolume:
        patch.sfxVolume !== undefined ? clamp01(patch.sfxVolume, current.sfxVolume) : current.sfxVolume,
      muted: typeof patch.muted === 'boolean' ? patch.muted : current.muted,
      aiCommentary:
        typeof patch.aiCommentary === 'boolean' ? patch.aiCommentary : current.aiCommentary,
    };
    this.writeJson(PREFS_KEY, next);
    for (const listener of this.prefListeners) {
      listener({ ...next });
    }
    return { ...next };
  }

  subscribePreferences(cb: (prefs: UserPreferences) => void): () => void {
    this.prefListeners.add(cb);
    return () => {
      this.prefListeners.delete(cb);
    };
  }

  getHighScores(difficulty: Difficulty): HighScoreEntry[] {
    const stored = this.readScores();
    return stored[difficulty].map((e) => ({ ...e }));
  }

  recordHighScore(
    difficulty: Difficulty,
    input: Omit<HighScoreEntry, 'date'> & { date?: string },
  ): HighScoreRecordResult {
    const stored = this.readScores();
    const list = stored[difficulty];

    if (input.score <= 0) {
      return {
        isNewRecord: false,
        rank: null,
        entries: list.map((e) => ({ ...e })),
      };
    }

    const prevBest = list.length > 0 ? list[0].score : 0;
    const entry: HighScoreEntry = {
      score: Math.floor(input.score),
      level: Math.max(1, Math.floor(input.level)),
      linesCleared: Math.max(0, Math.floor(input.linesCleared)),
      ringsCleared: Math.max(0, Math.floor(input.ringsCleared)),
      maxFlowCombo: Math.max(0, Math.floor(input.maxFlowCombo)),
      quickRate: Math.min(1, Math.max(0, input.quickRate)),
      date: input.date ?? todayIsoDate(),
    };

    const merged = [...list, entry]
      .sort((a, b) => b.score - a.score || b.level - a.level)
      .slice(0, MAX_HIGH_SCORES);

    stored[difficulty] = merged;
    this.writeJson(SCORES_KEY, stored);

    const idx = merged.indexOf(entry);
    return {
      isNewRecord: entry.score > prevBest,
      rank: idx >= 0 ? idx + 1 : null,
      entries: merged.map((e) => ({ ...e })),
    };
  }

  private readScores(): StoredScores {
    const raw = this.readJson(SCORES_KEY);
    if (!raw || typeof raw !== 'object') {
      return { easy: [], hard: [] };
    }
    const obj = raw as Partial<StoredScores>;
    return {
      easy: sanitizeScoreList(obj.easy),
      hard: sanitizeScoreList(obj.hard),
    };
  }

  private readJson(key: string): unknown {
    if (!this.backend) return null;
    try {
      const str = this.backend.getItem(key);
      if (!str) return null;
      return JSON.parse(str) as unknown;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    if (!this.backend) return;
    try {
      this.backend.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore quota / private-browsing storage errors
    }
  }
}

export const appStorage = new StorageService();
