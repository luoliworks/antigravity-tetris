import {
  getLevelConfig,
  LUBRICANT_KINDS,
  PITY_MONOMINO_INTERVAL,
  TETROMINO_KINDS,
} from './constants';
import type { PieceKind } from './types';

export class PieceBag {
  private readonly rng: () => number;
  private queue: PieceKind[] = [];
  private lubricantCredit = 0;
  private lubricantToggle = 0;
  private drawsSinceMonomino = 0;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  reset(): void {
    this.queue = [];
    this.lubricantCredit = 0;
    this.lubricantToggle = 0;
    this.drawsSinceMonomino = 0;
  }

  notifyBonusMonomino(): void {
    this.drawsSinceMonomino = 0;
  }

  draw(level: number): PieceKind {
    if (this.drawsSinceMonomino >= PITY_MONOMINO_INTERVAL - 1) {
      this.drawsSinceMonomino = 0;
      return 'M1';
    }

    if (this.queue.length === 0) {
      this.refill(level);
    }

    const kind = this.queue.shift()!;
    if (kind === 'M1') {
      this.drawsSinceMonomino = 0;
    } else {
      this.drawsSinceMonomino++;
    }
    return kind;
  }

  private refill(level: number): void {
    const ratio = getLevelConfig(level).lubricantRatio;
    const bag: PieceKind[] = [...TETROMINO_KINDS];

    this.lubricantCredit += (TETROMINO_KINDS.length * ratio) / (1 - ratio);
    const lubCount = Math.floor(this.lubricantCredit + 1e-9);
    this.lubricantCredit = Math.max(0, this.lubricantCredit - lubCount);

    for (let i = 0; i < lubCount; i++) {
      bag.push(LUBRICANT_KINDS[this.lubricantToggle % LUBRICANT_KINDS.length]);
      this.lubricantToggle++;
    }

    // Fisher-Yates shuffle
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = bag[i];
      bag[i] = bag[j];
      bag[j] = tmp;
    }

    this.queue = bag;
  }
}
