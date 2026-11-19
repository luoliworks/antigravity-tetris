import type { Language } from '../storage/storage';
import { AI_CHAN_EVENTS } from './aiChanLines';
import type { AiChanEventId, AiChanExpression } from './aiChanLines';

export const NORMAL_COOLDOWN_MIN_MS = 6000;
export const NORMAL_COOLDOWN_MAX_MS = 8000;
export const BUBBLE_DURATION_MS = 3200;
export const BUBBLE_FADE_IN_MS = 160;
export const BUBBLE_FADE_OUT_MS = 550;
export const SHOCKED_HARDEN_MS = 1000;
export const IDLE_BORED_MS = 18000;
export const IDLE_BORED_MIN_PIECES = 4;

export interface AiChanBubbleSnapshot {
  eventId: AiChanEventId;
  text: string;
  alpha: number;
  version: number;
  persistent: boolean;
}

export interface AiChanSnapshot {
  enabled: boolean;
  expression: AiChanExpression;
  expressionVersion: number;
  inDanger: boolean;
  bubble: AiChanBubbleSnapshot | null;
}

export interface AiChanControllerOptions {
  enabled?: boolean;
  rng?: () => number;
}

export interface AiChanTickContext {
  activePlay?: boolean;
  piecesSinceLastClear?: number;
}

interface ActiveBubbleState {
  eventId: AiChanEventId;
  lineIndex: number;
  elapsedMs: number;
  durationMs: number;
  persistent: boolean;
}

export class AiChanController {
  private readonly rng: () => number;
  private readonly decks = new Map<AiChanEventId, number[]>();
  private readonly lastLineIndex = new Map<AiChanEventId, number>();

  private enabled: boolean;
  private inDanger = false;
  private expression: AiChanExpression = 'smug';
  private expressionVersion = 1;
  private bubbleVersion = 0;

  private activeBubble: ActiveBubbleState | null = null;
  private normalCooldownRemainingMs = 0;
  private shockedElapsedMs = -1;
  private noClearElapsedMs = 0;

  constructor(options?: AiChanControllerOptions) {
    this.enabled = options?.enabled ?? true;
    this.rng = options?.rng ?? Math.random;
  }

  private getRestingExpression(): AiChanExpression {
    return this.inDanger ? 'malicious' : 'smug';
  }

  private setExpression(next: AiChanExpression): void {
    if (this.expression !== next) {
      this.expression = next;
      this.expressionVersion++;
    }
  }

  private drawLineIndex(eventId: AiChanEventId): number {
    const pool = AI_CHAN_EVENTS[eventId].lines;
    const count = pool.length;
    if (count <= 1) {
      this.lastLineIndex.set(eventId, 0);
      return 0;
    }

    let deck = this.decks.get(eventId);
    if (!deck || deck.length === 0) {
      deck = [];
      for (let i = 0; i < count; i++) {
        deck.push(i);
      }
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
      }
      const prev = this.lastLineIndex.get(eventId);
      if (prev !== undefined && deck[0] === prev) {
        const tmp = deck[0];
        deck[0] = deck[1];
        deck[1] = tmp;
      }
      this.decks.set(eventId, deck);
    }

    const chosen = deck.shift()!;
    this.lastLineIndex.set(eventId, chosen);
    return chosen;
  }

  trigger(eventId: AiChanEventId): boolean {
    if (!this.enabled) {
      return false;
    }

    const spec = AI_CHAN_EVENTS[eventId];
    if (spec.priority === 'normal') {
      if (this.activeBubble !== null || this.normalCooldownRemainingMs > 0) {
        return false;
      }
    }

    const lineIndex = this.drawLineIndex(eventId);
    this.setExpression(spec.expression);
    this.shockedElapsedMs = spec.expression === 'shocked' ? 0 : -1;

    const persistent = eventId === 'game_over_normal' || eventId === 'game_over_record';
    this.bubbleVersion++;
    this.activeBubble = {
      eventId,
      lineIndex,
      elapsedMs: 0,
      durationMs: BUBBLE_DURATION_MS,
      persistent,
    };

    this.normalCooldownRemainingMs =
      NORMAL_COOLDOWN_MIN_MS + this.rng() * (NORMAL_COOLDOWN_MAX_MS - NORMAL_COOLDOWN_MIN_MS);

    return true;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.activeBubble = null;
      this.shockedElapsedMs = -1;
      this.setExpression(this.getRestingExpression());
    }
  }

  setDanger(inDanger: boolean): void {
    if (this.inDanger === inDanger) {
      return;
    }
    this.inDanger = inDanger;
    if (this.activeBubble === null) {
      this.setExpression(this.getRestingExpression());
    }
  }

  notifyClear(): void {
    this.noClearElapsedMs = 0;
  }

  reset(inDanger = false): void {
    this.activeBubble = null;
    this.normalCooldownRemainingMs = 0;
    this.noClearElapsedMs = 0;
    this.shockedElapsedMs = -1;
    this.inDanger = inDanger;
    this.expression = this.getRestingExpression();
    this.expressionVersion++;
  }

  tick(dtMs: number, ctx?: AiChanTickContext): void {
    if (dtMs <= 0) {
      return;
    }

    if (this.normalCooldownRemainingMs > 0) {
      this.normalCooldownRemainingMs = Math.max(0, this.normalCooldownRemainingMs - dtMs);
    }

    if (this.expression === 'shocked' && this.shockedElapsedMs >= 0) {
      this.shockedElapsedMs += dtMs;
      if (this.shockedElapsedMs >= SHOCKED_HARDEN_MS) {
        this.shockedElapsedMs = -1;
        this.setExpression('smug');
      }
    }

    if (this.activeBubble) {
      this.activeBubble.elapsedMs += dtMs;
      if (
        !this.activeBubble.persistent &&
        this.activeBubble.elapsedMs >= this.activeBubble.durationMs
      ) {
        this.activeBubble = null;
        this.setExpression(this.getRestingExpression());
      }
    }

    if (ctx?.activePlay && !this.inDanger && this.enabled) {
      this.noClearElapsedMs += dtMs;
      if (
        this.noClearElapsedMs >= IDLE_BORED_MS &&
        (ctx.piecesSinceLastClear ?? 0) >= IDLE_BORED_MIN_PIECES
      ) {
        if (this.trigger('idle_bored')) {
          this.noClearElapsedMs = 0;
        }
      }
    }
  }

  getSnapshot(lang: Language): AiChanSnapshot {
    let bubble: AiChanBubbleSnapshot | null = null;
    if (this.enabled && this.activeBubble) {
      const b = this.activeBubble;
      const spec = AI_CHAN_EVENTS[b.eventId];
      const text = spec.lines[b.lineIndex]?.[lang] ?? spec.lines[0][lang];

      let alpha = 1;
      if (b.elapsedMs < BUBBLE_FADE_IN_MS) {
        alpha = Math.min(1, b.elapsedMs / BUBBLE_FADE_IN_MS);
      } else if (!b.persistent && b.elapsedMs > b.durationMs - BUBBLE_FADE_OUT_MS) {
        const remaining = Math.max(0, b.durationMs - b.elapsedMs);
        alpha = Math.max(0, Math.min(1, remaining / BUBBLE_FADE_OUT_MS));
      }

      bubble = {
        eventId: b.eventId,
        text,
        alpha,
        version: this.bubbleVersion,
        persistent: b.persistent,
      };
    }

    return {
      enabled: this.enabled,
      expression: this.expression,
      expressionVersion: this.expressionVersion,
      inDanger: this.inDanger,
      bubble,
    };
  }
}
