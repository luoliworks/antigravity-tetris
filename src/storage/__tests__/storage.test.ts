import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, StorageService } from '../storage';
import type { StorageLike } from '../storage';

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('StorageService', () => {
  it('returns default preferences, clamps volumes, notifies subscribers, and tolerates corrupted JSON', () => {
    const broken = createMemoryStorage({
      antigravity_tetris_prefs_v1: '{broken-json',
    });
    const service = new StorageService(broken);
    expect(service.getPreferences()).toEqual(DEFAULT_PREFERENCES);

    const listener = vi.fn();
    const unsub = service.subscribePreferences(listener);

    const updated = service.updatePreferences({
      language: 'zh',
      bgmVolume: 1.8,
      sfxVolume: -0.4,
      muted: true,
      aiCommentary: false,
    });
    expect(updated).toEqual({
      language: 'zh',
      bgmVolume: 1,
      sfxVolume: 0,
      muted: true,
      aiCommentary: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(updated);

    unsub();
    service.updatePreferences({ language: 'en' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('maintains separate Easy and Hard Top-5 leaderboards sorted descending and flags NEW RECORD', () => {
    const service = new StorageService(createMemoryStorage());

    // Zero score does not enter leaderboard
    const zeroRes = service.recordHighScore('easy', {
      score: 0,
      level: 1,
      linesCleared: 0,
      ringsCleared: 0,
      maxFlowCombo: 0,
      quickRate: 0,
      date: '2026-11-18',
    });
    expect(zeroRes.isNewRecord).toBe(false);
    expect(zeroRes.rank).toBeNull();
    expect(zeroRes.entries).toHaveLength(0);

    // Record 6 Easy scores -> keeps Top 5 descending
    const scores = [1200, 4800, 3100, 900, 6200, 2500];
    let lastRes = zeroRes;
    for (const sc of scores) {
      lastRes = service.recordHighScore('easy', {
        score: sc,
        level: 2,
        linesCleared: 5,
        ringsCleared: 1,
        maxFlowCombo: 1,
        quickRate: 0.4,
        date: '2026-11-18',
      });
    }
    expect(lastRes.isNewRecord).toBe(false);
    expect(lastRes.rank).toBe(4); // 6200, 4800, 3100, 2500, 1200

    const easyTop = service.getHighScores('easy');
    expect(easyTop.map((e) => e.score)).toEqual([6200, 4800, 3100, 2500, 1200]);
    expect(service.getHighScores('hard')).toEqual([]);

    // New Hard score becomes Hard #1 without affecting Easy
    const hardRes = service.recordHighScore('hard', {
      score: 4000,
      level: 3,
      linesCleared: 6,
      ringsCleared: 2,
      maxFlowCombo: 2,
      quickRate: 0.75,
      date: '2026-11-18',
    });
    expect(hardRes.isNewRecord).toBe(true);
    expect(hardRes.rank).toBe(1);
    expect(service.getHighScores('hard')).toHaveLength(1);
  });
});
