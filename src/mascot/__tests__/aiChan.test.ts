import { describe, expect, it } from 'vitest';
import {
  AI_CHAN_EVENTS,
  AiChanController,
  ALL_AI_CHAN_EVENT_IDS,
  ALL_AI_CHAN_EXPRESSIONS,
  BUBBLE_DURATION_MS,
  IDLE_BORED_MS,
  SHOCKED_HARDEN_MS,
} from '..';

function createDeterministicRng(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('AiChan line bank', () => {
  it('defines all 14 events with non-empty EN/ZH lines and valid expressions', () => {
    expect(ALL_AI_CHAN_EVENT_IDS).toHaveLength(14);
    for (const id of ALL_AI_CHAN_EVENT_IDS) {
      const spec = AI_CHAN_EVENTS[id];
      expect(spec).toBeDefined();
      expect(spec.id).toBe(id);
      expect(ALL_AI_CHAN_EXPRESSIONS).toContain(spec.expression);
      expect(spec.lines.length).toBeGreaterThanOrEqual(2);
      for (const line of spec.lines) {
        expect(line.en.trim().length).toBeGreaterThan(0);
        expect(line.zh.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('AiChanController', () => {
  it('enforces 6-8s global cooldown for normal triggers while allowing high-priority interrupts', () => {
    // rng = 0.5 -> cooldown = 7000ms
    const ctrl = new AiChanController({ rng: () => 0.5 });

    expect(ctrl.trigger('single_clear')).toBe(true);
    expect(ctrl.trigger('blind_shot')).toBe(false);

    // Bubble expires at 3200ms, still inside 7000ms cooldown
    ctrl.tick(BUBBLE_DURATION_MS);
    expect(ctrl.getSnapshot('en').bubble).toBeNull();
    expect(ctrl.trigger('consecutive_hold')).toBe(false);

    // High-priority event bypasses cooldown immediately
    expect(ctrl.trigger('nova_bomb')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('nova_bomb');
    expect(ctrl.getSnapshot('en').expression).toBe('mocking');

    // Expire high-priority bubble AND remaining 7000ms cooldown
    ctrl.tick(7000);
    expect(ctrl.getSnapshot('en').bubble).toBeNull();
    expect(ctrl.trigger('quick_streak_3')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('quick_streak_3');
  });

  it('interrupts active normal bubble immediately on multi_clear, danger_enter, and all_clear', () => {
    const ctrl = new AiChanController({ rng: () => 0.5 });

    expect(ctrl.trigger('single_clear')).toBe(true);
    ctrl.tick(200);
    expect(ctrl.trigger('multi_clear')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('multi_clear');
    expect(ctrl.getSnapshot('en').expression).toBe('shocked');

    expect(ctrl.trigger('danger_enter')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('danger_enter');
    expect(ctrl.getSnapshot('en').expression).toBe('malicious');

    expect(ctrl.trigger('all_clear')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('all_clear');
    expect(ctrl.getSnapshot('en').expression).toBe('shocked');
  });

  it('fades bubble out over 3.2s and reverts expression based on danger state', () => {
    const ctrl = new AiChanController({ rng: () => 0 });
    ctrl.trigger('nova_bomb');

    ctrl.tick(500);
    expect(ctrl.getSnapshot('en').bubble?.alpha).toBe(1);

    // Near end of 3200ms fade window
    ctrl.tick(2500); // total 3000ms -> remaining 200ms (< 550ms)
    const fading = ctrl.getSnapshot('en').bubble;
    expect(fading).not.toBeNull();
    expect(fading!.alpha).toBeGreaterThan(0);
    expect(fading!.alpha).toBeLessThan(1);

    // Complete 3200ms -> bubble vanishes & reverts to smug
    ctrl.tick(200);
    expect(ctrl.getSnapshot('en').bubble).toBeNull();
    expect(ctrl.getSnapshot('en').expression).toBe('smug');

    // In danger -> reverts to malicious after temporary bubble ends
    ctrl.setDanger(true);
    expect(ctrl.getSnapshot('en').expression).toBe('malicious');
    ctrl.trigger('nova_bomb');
    expect(ctrl.getSnapshot('en').expression).toBe('mocking');
    ctrl.tick(BUBBLE_DURATION_MS);
    expect(ctrl.getSnapshot('en').bubble).toBeNull();
    expect(ctrl.getSnapshot('en').expression).toBe('malicious');
  });

  it('hardens Shocked expression back to Smug after 1 second while keeping bubble visible', () => {
    const ctrl = new AiChanController({ rng: () => 0 });
    expect(ctrl.trigger('multi_clear')).toBe(true);
    expect(ctrl.getSnapshot('en').expression).toBe('shocked');
    expect(ctrl.getSnapshot('en').bubble).not.toBeNull();

    ctrl.tick(900);
    expect(ctrl.getSnapshot('en').expression).toBe('shocked');

    ctrl.tick(150); // total 1050ms >= 1000ms
    const snap = ctrl.getSnapshot('en');
    expect(snap.expression).toBe('smug');
    expect(snap.bubble).not.toBeNull();
    expect(snap.bubble?.eventId).toBe('multi_clear');
  });

  it('shuffles lines without immediate consecutive repeats across deck refills', () => {
    const ctrl = new AiChanController({ rng: createDeterministicRng(1337) });
    const seen: string[] = [];

    for (let i = 0; i < 25; i++) {
      expect(ctrl.trigger('nova_bomb')).toBe(true);
      const text = ctrl.getSnapshot('en').bubble!.text;
      if (seen.length > 0) {
        expect(text).not.toBe(seen[seen.length - 1]);
      }
      seen.push(text);
    }
  });

  it('switches live bubble text seamlessly between EN and ZH', () => {
    const ctrl = new AiChanController({ rng: () => 0 });
    expect(ctrl.trigger('start_easy')).toBe(true);

    const enText = ctrl.getSnapshot('en').bubble!.text;
    const zhText = ctrl.getSnapshot('zh').bubble!.text;
    const validEn = AI_CHAN_EVENTS.start_easy.lines.map((l) => l.en);
    const validZh = AI_CHAN_EVENTS.start_easy.lines.map((l) => l.zh);

    expect(validEn).toContain(enText);
    expect(validZh).toContain(zhText);
    expect(enText).not.toBe(zhText);
  });

  it('suppresses triggers and hides active bubble when disabled', () => {
    const ctrl = new AiChanController({ enabled: true, rng: () => 0 });
    expect(ctrl.trigger('single_clear')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble).not.toBeNull();

    ctrl.setEnabled(false);
    expect(ctrl.getSnapshot('en').enabled).toBe(false);
    expect(ctrl.getSnapshot('en').bubble).toBeNull();
    expect(ctrl.getSnapshot('en').expression).toBe('smug');
    expect(ctrl.trigger('multi_clear')).toBe(false);

    ctrl.setEnabled(true);
    expect(ctrl.trigger('multi_clear')).toBe(true);
    expect(ctrl.getSnapshot('en').bubble).not.toBeNull();
  });

  it('triggers idle_bored after 18s without clears when active and >= 4 pieces, suppressed in danger or after notifyClear', () => {
    const ctrl = new AiChanController({ rng: () => 0 });

    // Too few pieces -> should not fire even after 18s
    ctrl.tick(IDLE_BORED_MS, { activePlay: true, piecesSinceLastClear: 2 });
    expect(ctrl.getSnapshot('en').bubble).toBeNull();

    // notifyClear resets timer so another full 18s is needed
    ctrl.notifyClear();
    ctrl.tick(10000, { activePlay: true, piecesSinceLastClear: 5 });
    expect(ctrl.getSnapshot('en').bubble).toBeNull();

    // In danger -> does not accumulate bored timer
    ctrl.setDanger(true);
    ctrl.tick(20000, { activePlay: true, piecesSinceLastClear: 8 });
    expect(ctrl.getSnapshot('en').bubble).toBeNull();

    // Back to normal play and complete 18s without clears
    ctrl.setDanger(false);
    ctrl.tick(8000, { activePlay: true, piecesSinceLastClear: 6 });
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('idle_bored');
    expect(ctrl.getSnapshot('en').expression).toBe('bored');
  });

  it('keeps Game Over closing bubbles persistent past 3.2s until reset while still hardening Shocked->Smug on record', () => {
    const ctrl = new AiChanController({ rng: () => 0 });

    expect(ctrl.trigger('game_over_record')).toBe(true);
    expect(ctrl.getSnapshot('en').expression).toBe('shocked');

    ctrl.tick(SHOCKED_HARDEN_MS + 50);
    expect(ctrl.getSnapshot('en').expression).toBe('smug');
    expect(ctrl.getSnapshot('en').bubble?.persistent).toBe(true);

    // Still visible after 10 seconds!
    ctrl.tick(10000);
    expect(ctrl.getSnapshot('en').bubble).not.toBeNull();
    expect(ctrl.getSnapshot('en').bubble?.alpha).toBe(1);

    // Cleared on reset
    ctrl.reset(false);
    expect(ctrl.getSnapshot('en').bubble).toBeNull();

    expect(ctrl.trigger('game_over_normal')).toBe(true);
    ctrl.tick(5000);
    expect(ctrl.getSnapshot('en').expression).toBe('clap');
    expect(ctrl.getSnapshot('en').bubble?.eventId).toBe('game_over_normal');
  });
});
