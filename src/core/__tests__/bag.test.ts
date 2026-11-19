import { describe, expect, it } from 'vitest';
import { PieceBag, PITY_MONOMINO_INTERVAL, TETROMINO_KINDS } from '../index';

function createSeededRng(seed = 123456789): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('PieceBag', () => {
  it('guarantees all 7 classic tetrominoes appear in every bag cycle', () => {
    const bag = new PieceBag(createSeededRng(42));
    const tetroSet = new Set(TETROMINO_KINDS);

    // Draw 100 pieces at level 1 and check tetromino-only chunks of 7
    const tetroDraws: string[] = [];
    for (let i = 0; i < 150; i++) {
      const k = bag.draw(1);
      if (tetroSet.has(k)) {
        tetroDraws.push(k);
      }
    }

    const fullCycles = Math.floor(tetroDraws.length / 7);
    expect(fullCycles).toBeGreaterThanOrEqual(10);
    for (let c = 0; c < fullCycles; c++) {
      const chunk = new Set(tetroDraws.slice(c * 7, (c + 1) * 7));
      expect(chunk.size).toBe(7);
    }
  });

  it('matches lubricant ratio curve across levels (25% -> 20% -> 15% -> 10%)', () => {
    const levelsAndTargets: Array<[number, number]> = [
      [1, 0.25],
      [4, 0.20],
      [7, 0.15],
      [10, 0.10],
    ];

    for (const [level, expectedRatio] of levelsAndTargets) {
      const bag = new PieceBag(createSeededRng(99 + level));
      let nonPityCount = 0;
      let lubCount = 0;

      for (let i = 0; i < 1000; i++) {
        const k = bag.draw(level);
        if (k === 'M1') continue;
        nonPityCount++;
        if (k === 'L3' || k === 'D2') {
          lubCount++;
        }
      }

      const actualRatio = lubCount / nonPityCount;
      expect(Math.abs(actualRatio - expectedRatio)).toBeLessThan(0.02);
    }
  });

  it('yields pity 1x1 monomino M1 every 20 draws without one', () => {
    const bag = new PieceBag(createSeededRng(7));
    const draws: string[] = [];
    for (let i = 0; i < 60; i++) {
      draws.push(bag.draw(1));
    }

    expect(draws[PITY_MONOMINO_INTERVAL - 1]).toBe('M1');
    expect(draws[PITY_MONOMINO_INTERVAL * 2 - 1]).toBe('M1');
    expect(draws[PITY_MONOMINO_INTERVAL * 3 - 1]).toBe('M1');
  });
});
