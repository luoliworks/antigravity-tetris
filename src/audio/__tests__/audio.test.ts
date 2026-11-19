import { describe, expect, it } from 'vitest';
import {
  AudioEngine,
  BGM_BAR_CHORDS,
  computeEffectiveGain,
  getArpeggioHz,
  getClearChordHz,
  getQuickStreakNoteHz,
  PENTATONIC_HZ,
} from '..';

describe('pentatonic helpers', () => {
  it('defines strictly ascending major pentatonic frequencies and valid BGM bars', () => {
    expect(PENTATONIC_HZ.length).toBeGreaterThanOrEqual(15);
    for (let i = 1; i < PENTATONIC_HZ.length; i++) {
      expect(PENTATONIC_HZ[i]).toBeGreaterThan(PENTATONIC_HZ[i - 1]);
    }

    expect(BGM_BAR_CHORDS).toHaveLength(4);
    for (const bar of BGM_BAR_CHORDS) {
      expect(bar.bassHz).toBeGreaterThan(0);
      expect(bar.padHz).toHaveLength(3);
      for (const p of bar.padHz) {
        expect(p).toBeGreaterThan(0);
      }
      expect(bar.arpHz).toHaveLength(8);
      for (const a of bar.arpHz) {
        expect(a).toBeGreaterThan(0);
      }
    }
  });

  it('ascends quick streak pitch from streak 1 to 6 and clamps upper bounds', () => {
    const notes: number[] = [];
    for (let streak = 1; streak <= 6; streak++) {
      notes.push(getQuickStreakNoteHz(streak));
    }
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]).toBeGreaterThan(notes[i - 1]);
    }

    // Clamps safely for very high streaks and zero/negative streaks
    expect(getQuickStreakNoteHz(0)).toBe(PENTATONIC_HZ[10]);
    expect(getQuickStreakNoteHz(999)).toBe(PENTATONIC_HZ[PENTATONIC_HZ.length - 1]);
  });

  it('builds strictly ascending clear chords that scale up with flowCombo and richness', () => {
    const cSingleLineFlow0 = getClearChordHz(1, 0, false);
    const cSingleLineFlow4 = getClearChordHz(1, 4, false);
    const cMultiRingFlow0 = getClearChordHz(2, 0, true);

    for (const chord of [cSingleLineFlow0, cSingleLineFlow4, cMultiRingFlow0]) {
      for (let i = 1; i < chord.length; i++) {
        expect(chord[i]).toBeGreaterThan(chord[i - 1]);
      }
    }

    const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;
    expect(avg(cSingleLineFlow4)).toBeGreaterThan(avg(cSingleLineFlow0));
    expect(cMultiRingFlow0.length).toBeGreaterThan(cSingleLineFlow0.length);
  });

  it('generates exact ascending arpeggio lengths', () => {
    const arp6 = getArpeggioHz(6, 8);
    expect(arp6).toHaveLength(6);
    for (let i = 1; i < arp6.length; i++) {
      expect(arp6[i]).toBeGreaterThan(arp6[i - 1]);
    }
    expect(getArpeggioHz(0, 8)).toEqual([]);
  });

  it('computes effective gain with mute, [0, 1] clamping, and ducking', () => {
    expect(computeEffectiveGain(0.8, true, 1)).toBe(0);
    expect(computeEffectiveGain(0, false, 1)).toBe(0);
    expect(computeEffectiveGain(0.8, false, 0)).toBe(0);
    expect(computeEffectiveGain(0.8, false, 0.5)).toBeCloseTo(0.4);
    expect(computeEffectiveGain(1.5, false, 2)).toBe(1);
    expect(computeEffectiveGain(-0.3, false, 1)).toBe(0);
  });
});

describe('AudioEngine', () => {
  it('runs safely in headless Node environments without Web Audio API', () => {
    const engine = new AudioEngine();
    expect(() => {
      engine.unlock();
      engine.setBgmMode('title');
      engine.setBgmMode('gameplay');
      engine.setDanger(true);
      engine.setPaused(true);
      engine.playAimTick();
      engine.playRotate();
      engine.playHoverUrgent(1);
      engine.playLaunch(true, 3, false);
      engine.playHold();
      engine.playLock(4);
      engine.playClear(2, 3, true, true, false);
      engine.playCollapseClick(120);
      engine.playStarCoreActivate('NOVA_BOMB');
      engine.playNovaBlast();
      engine.playPiercerSnipe();
      engine.playLevelUp();
      engine.playCountdownTick(false);
      engine.playCountdownTick(true);
      engine.playGameOver(true);
      engine.playUiClick();
      engine.setBgmMode('gameover');
      engine.setBgmMode('stopped');
      engine.dispose();
    }).not.toThrow();
  });

  it('registers and exposes external SFX and BGM override URLs', () => {
    const engine = new AudioEngine();
    engine.registerSfxOverride('nova_blast', '/audio/nova.ogg');
    engine.registerBgmOverride('main', '/audio/bgm-main.ogg');
    engine.configureOverrides({
      sfx: { lock: '/audio/lock.wav' },
      bgm: { danger: '/audio/bgm-danger.ogg' },
    });

    const overrides = engine.getOverrides();
    expect(overrides.sfx.nova_blast).toBe('/audio/nova.ogg');
    expect(overrides.sfx.lock).toBe('/audio/lock.wav');
    expect(overrides.bgm.main).toBe('/audio/bgm-main.ogg');
    expect(overrides.bgm.danger).toBe('/audio/bgm-danger.ogg');
    engine.dispose();
  });
});
