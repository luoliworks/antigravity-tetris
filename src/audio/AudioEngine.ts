import type { StarCoreKind } from '../core';
import { appStorage } from '../storage/storage';
import type { UserPreferences } from '../storage/storage';
import {
  BGM_BAR_CHORDS,
  computeEffectiveGain,
  getArpeggioHz,
  getClearChordHz,
  getQuickStreakNoteHz,
  PENTATONIC_HZ,
} from './pentatonic';
import type { AudioOverrideManifest, BgmMode, BgmTrackId, SfxId } from './pentatonic';

const BPM = 96;
const SIXTEENTH_SEC = 60 / BPM / 4; // 0.15625s
const STEPS_PER_LOOP = 64; // 4 bars × 16 sixteenth-notes
const SCHEDULER_INTERVAL_MS = 50;
const SCHEDULE_AHEAD_SEC = 0.14;
const TINY_GAIN = 0.0001;

type AudioContextCtor = typeof AudioContext;

interface WindowWithAudio {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
}

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const win = window as unknown as WindowWithAudio;
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private readonly sfxOverrides = new Map<SfxId, string>();
  private readonly bgmOverrides = new Map<BgmTrackId, string>();
  private readonly decodedBuffers = new Map<string, AudioBuffer>();
  private readonly pendingLoads = new Set<string>();

  private bgmMode: BgmMode = 'stopped';
  private inDanger = false;
  private paused = false;

  private schedulerTimer: number | null = null;
  private nextStepTime = 0;
  private currentStep = 0;

  private mainOverrideSource: AudioBufferSourceNode | null = null;
  private mainOverrideGain: GainNode | null = null;
  private dangerOverrideSource: AudioBufferSourceNode | null = null;
  private dangerOverrideGain: GainNode | null = null;

  private prefs: UserPreferences;
  private unsubPrefs: (() => void) | null = null;

  constructor() {
    this.prefs = appStorage.getPreferences();
    this.unsubPrefs = appStorage.subscribePreferences((next) => {
      this.prefs = next;
      this.applyVolumes();
    });
  }

  unlock(): void {
    const AudioCtor = resolveAudioContextCtor();
    if (!AudioCtor) {
      return;
    }

    if (!this.ctx) {
      try {
        const ctx = new AudioCtor();
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.9, ctx.currentTime);
        masterGain.connect(ctx.destination);

        const bgmFilter = ctx.createBiquadFilter();
        bgmFilter.type = 'lowpass';
        bgmFilter.frequency.setValueAtTime(1400, ctx.currentTime);
        bgmFilter.Q.setValueAtTime(0.9, ctx.currentTime);
        bgmFilter.connect(masterGain);

        const bgmGain = ctx.createGain();
        bgmGain.connect(bgmFilter);

        const sfxGain = ctx.createGain();
        sfxGain.connect(masterGain);

        this.ctx = ctx;
        this.bgmFilter = bgmFilter;
        this.bgmGain = bgmGain;
        this.sfxGain = sfxGain;
        this.noiseBuffer = this.createWhiteNoiseBuffer(ctx);

        this.applyVolumes();
        this.updateBgmMix();
      } catch {
        return;
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    for (const url of this.sfxOverrides.values()) {
      void this.ensureBufferLoaded(url);
    }
    for (const url of this.bgmOverrides.values()) {
      void this.ensureBufferLoaded(url);
    }

    if (this.bgmMode !== 'stopped') {
      this.startSchedulerIfNeeded();
      this.syncBgmOverrides();
    }
  }

  registerSfxOverride(id: SfxId, url: string): void {
    this.sfxOverrides.set(id, url);
    if (this.ctx) {
      void this.ensureBufferLoaded(url);
    }
  }

  registerBgmOverride(track: BgmTrackId, url: string): void {
    this.bgmOverrides.set(track, url);
    if (this.ctx) {
      void this.ensureBufferLoaded(url).then(() => {
        if (this.bgmMode !== 'stopped') {
          this.syncBgmOverrides();
        }
      });
    }
  }

  configureOverrides(manifest: AudioOverrideManifest): void {
    if (manifest.sfx) {
      for (const [id, url] of Object.entries(manifest.sfx)) {
        if (url) {
          this.registerSfxOverride(id as SfxId, url);
        }
      }
    }
    if (manifest.bgm) {
      for (const [track, url] of Object.entries(manifest.bgm)) {
        if (url) {
          this.registerBgmOverride(track as BgmTrackId, url);
        }
      }
    }
  }

  getOverrides(): {
    sfx: Partial<Record<SfxId, string>>;
    bgm: Partial<Record<BgmTrackId, string>>;
  } {
    const sfx: Partial<Record<SfxId, string>> = {};
    for (const [id, url] of this.sfxOverrides.entries()) {
      sfx[id] = url;
    }
    const bgm: Partial<Record<BgmTrackId, string>> = {};
    for (const [track, url] of this.bgmOverrides.entries()) {
      bgm[track] = url;
    }
    return { sfx, bgm };
  }

  setBgmMode(mode: BgmMode): void {
    this.bgmMode = mode;
    if (mode === 'stopped') {
      this.stopScheduler();
      this.stopBgmOverrideSources();
    } else if (this.ctx) {
      this.startSchedulerIfNeeded();
      this.syncBgmOverrides();
    }
    this.updateBgmMix();
  }

  setDanger(inDanger: boolean): void {
    if (this.inDanger === inDanger) {
      return;
    }
    this.inDanger = inDanger;
    this.updateBgmMix();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }
    this.paused = paused;
    this.updateBgmMix();
  }

  playAimTick(): void {
    if (this.tryPlaySfxOverride('aim_tick')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.playToneAt(1760, now, 0.022, 'sine', 0.08, 0.002);
    this.playNoiseAt(now, 0.014, 2400, 0.05, 'bandpass');
  }

  playRotate(): void {
    if (this.tryPlaySfxOverride('rotate')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // E5 -> G5 crystalline turn
    this.playToneAt(PENTATONIC_HZ[12], now, 0.045, 'triangle', 0.11, 0.003);
    this.playToneAt(PENTATONIC_HZ[13], now + 0.024, 0.055, 'sine', 0.1, 0.003);
  }

  playHoverUrgent(intensity = 0): void {
    if (this.tryPlaySfxOverride('hover_urgent')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const high = intensity > 0;
    this.playSweepAt(high ? 110 : 92, 54, now, 0.09, 'sine', high ? 0.2 : 0.14);
    this.playToneAt(
      high ? PENTATONIC_HZ[15] : PENTATONIC_HZ[14],
      now + 0.005,
      0.04,
      'triangle',
      0.08,
      0.002,
    );
  }

  playLaunch(isQuick: boolean, quickStreak: number, blind: boolean): void {
    const id: SfxId = isQuick ? 'launch_quick' : blind ? 'launch_blind' : 'launch';
    if (this.tryPlaySfxOverride(id)) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    if (isQuick) {
      const baseHz = getQuickStreakNoteHz(quickStreak);
      this.playToneAt(baseHz, now, 0.11, 'triangle', 0.18, 0.004);
      this.playToneAt(baseHz * 1.5, now + 0.032, 0.14, 'sine', 0.14, 0.005);
      return;
    }

    if (blind) {
      this.playToneAt(PENTATONIC_HZ[6], now, 0.08, 'triangle', 0.14, 0.004);
      this.playToneAt(PENTATONIC_HZ[5], now + 0.045, 0.12, 'sawtooth', 0.07, 0.004);
      this.playNoiseAt(now, 0.07, 900, 0.06, 'lowpass');
      return;
    }

    this.playSweepAt(PENTATONIC_HZ[8], PENTATONIC_HZ[10], now, 0.09, 'sine', 0.13);
  }

  playHold(): void {
    if (this.tryPlaySfxOverride('hold')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.playToneAt(PENTATONIC_HZ[8], now, 0.055, 'sine', 0.11, 0.004);
    this.playToneAt(PENTATONIC_HZ[11], now + 0.035, 0.08, 'triangle', 0.1, 0.004);
  }

  playLock(hardDropSteps = 0): void {
    if (this.tryPlaySfxOverride('lock')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // Translucent crystal glass tap (A5 bell ping + short transient)
    this.playToneAt(PENTATONIC_HZ[14], now, 0.085, 'sine', 0.13, 0.002);
    this.playNoiseAt(now, 0.024, 3200, 0.06, 'bandpass');
    if (hardDropSteps > 0) {
      this.playSweepAt(150, 72, now, 0.08, 'triangle', 0.14);
    }
  }

  playClear(
    count: number,
    flowCombo: number,
    isRing: boolean,
    isMulti: boolean,
    isAllClear: boolean,
  ): void {
    const id: SfxId = isAllClear ? 'all_clear' : isMulti ? 'clear_multi' : 'clear_single';
    if (this.tryPlaySfxOverride(id)) return;
    if (!this.canPlaySfx()) return;

    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const chord = getClearChordHz(count, flowCombo, isRing);
    chord.forEach((hz, idx) => {
      this.playToneAt(
        hz,
        now + idx * 0.025,
        isMulti ? 0.44 : 0.3,
        idx === 0 ? 'triangle' : 'sine',
        0.13,
        0.008,
      );
    });

    if (isMulti || isAllClear) {
      const arp = getArpeggioHz(isAllClear ? 8 : 6, 8);
      arp.forEach((hz, idx) => {
        this.playToneAt(hz, now + 0.05 + idx * 0.052, 0.24, 'triangle', 0.12, 0.006);
      });
    }
  }

  playCollapseClick(delayMs = 120): void {
    const delaySec = Math.max(0, delayMs) / 1000;
    if (this.tryPlaySfxOverride('collapse_click', delaySec)) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime + delaySec;
    this.playToneAt(PENTATONIC_HZ[10], at, 0.032, 'triangle', 0.11, 0.002);
    this.playToneAt(PENTATONIC_HZ[13], at + 0.042, 0.038, 'sine', 0.1, 0.002);
  }

  playStarCoreActivate(coreKind: StarCoreKind): void {
    if (this.tryPlaySfxOverride('star_core_activate')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const notes = [PENTATONIC_HZ[10], PENTATONIC_HZ[12], PENTATONIC_HZ[13], PENTATONIC_HZ[15]];
    const wave: OscillatorType = coreKind === 'NOVA_BOMB' ? 'triangle' : 'sine';
    notes.forEach((hz, idx) => {
      this.playToneAt(hz, now + idx * 0.045, 0.18, wave, 0.14, 0.005);
    });
  }

  playNovaBlast(): void {
    if (this.tryPlaySfxOverride('nova_blast')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.playSweepAt(135, 32, now, 0.36, 'sine', 0.34);
    this.playNoiseAt(now, 0.28, 720, 0.22, 'lowpass');
    this.playToneAt(PENTATONIC_HZ[13], now + 0.05, 0.22, 'triangle', 0.12, 0.005);
  }

  playPiercerSnipe(): void {
    if (this.tryPlaySfxOverride('piercer_snipe')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.playSweepAt(2100, 620, now, 0.18, 'sawtooth', 0.12);
    this.playToneAt(PENTATONIC_HZ[15], now + 0.04, 0.2, 'sine', 0.17, 0.004);
    this.playToneAt(PENTATONIC_HZ[17], now + 0.08, 0.22, 'triangle', 0.11, 0.005);
  }

  playLevelUp(): void {
    if (this.tryPlaySfxOverride('level_up')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const notes = [PENTATONIC_HZ[10], PENTATONIC_HZ[12], PENTATONIC_HZ[13], PENTATONIC_HZ[15]];
    notes.forEach((hz, idx) => {
      this.playToneAt(hz, now + idx * 0.065, 0.22, 'triangle', 0.15, 0.006);
    });
  }

  playCountdownTick(isGo = false): void {
    const id: SfxId = isGo ? 'countdown_go' : 'countdown_tick';
    if (this.tryPlaySfxOverride(id)) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    if (isGo) {
      this.playToneAt(PENTATONIC_HZ[15], now, 0.22, 'triangle', 0.16, 0.005);
      this.playToneAt(PENTATONIC_HZ[17], now + 0.025, 0.24, 'sine', 0.14, 0.005);
    } else {
      this.playToneAt(PENTATONIC_HZ[13], now, 0.08, 'sine', 0.14, 0.003);
    }
  }

  playGameOver(isNewRecord: boolean): void {
    const id: SfxId = isNewRecord ? 'game_over_record' : 'game_over';
    if (this.tryPlaySfxOverride(id)) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    const descent = [PENTATONIC_HZ[8], PENTATONIC_HZ[7], PENTATONIC_HZ[6], PENTATONIC_HZ[5]];
    descent.forEach((hz, idx) => {
      this.playToneAt(hz, now + idx * 0.12, 0.32, 'triangle', 0.16, 0.01);
    });

    if (isNewRecord) {
      const shimmer = [PENTATONIC_HZ[10], PENTATONIC_HZ[12], PENTATONIC_HZ[13], PENTATONIC_HZ[15]];
      shimmer.forEach((hz, idx) => {
        this.playToneAt(hz, now + 0.42 + idx * 0.07, 0.36, 'sine', 0.14, 0.008);
      });
    }
  }

  playUiClick(): void {
    if (this.tryPlaySfxOverride('ui_click')) return;
    if (!this.canPlaySfx()) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    this.playToneAt(PENTATONIC_HZ[12], now, 0.032, 'sine', 0.09, 0.002);
  }

  dispose(): void {
    this.stopScheduler();
    this.stopBgmOverrideSources();
    if (this.unsubPrefs) {
      this.unsubPrefs();
      this.unsubPrefs = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.bgmFilter = null;
      this.bgmGain = null;
      this.sfxGain = null;
    }
  }

  private canPlaySfx(): boolean {
    if (!this.ctx || !this.sfxGain) {
      return false;
    }
    return computeEffectiveGain(this.prefs.sfxVolume, this.prefs.muted) > 0;
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.bgmGain || !this.sfxGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const bgmDuck =
      this.bgmMode === 'stopped'
        ? 0
        : this.paused
          ? 0.42
          : this.bgmMode === 'title'
            ? 0.62
            : this.bgmMode === 'gameover'
              ? 0.38
              : this.inDanger
                ? 1.0
                : 0.85;

    const targetBgm = computeEffectiveGain(this.prefs.bgmVolume, this.prefs.muted, bgmDuck) * 0.42;
    const targetSfx = computeEffectiveGain(this.prefs.sfxVolume, this.prefs.muted) * 0.85;

    this.bgmGain.gain.setTargetAtTime(targetBgm, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(targetSfx, now, 0.02);
  }

  private updateBgmMix(): void {
    this.applyVolumes();
    if (this.ctx && this.bgmFilter) {
      const targetFreq = this.paused
        ? 480
        : this.bgmMode === 'gameover'
          ? 720
          : this.bgmMode === 'title'
            ? 1250
            : this.inDanger
              ? 3400
              : 1850;
      this.bgmFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
    }

    if (this.ctx && this.dangerOverrideGain) {
      const activeDangerOverride =
        this.bgmMode === 'gameplay' && this.inDanger && !this.paused ? 1 : 0;
      this.dangerOverrideGain.gain.setTargetAtTime(
        activeDangerOverride,
        this.ctx.currentTime,
        0.08,
      );
    }
  }

  private startSchedulerIfNeeded(): void {
    if (typeof window === 'undefined' || !this.ctx || this.schedulerTimer !== null) {
      return;
    }
    this.nextStepTime = this.ctx.currentTime + 0.04;
    this.schedulerTimer = window.setInterval(() => this.schedulerTick(), SCHEDULER_INTERVAL_MS);
  }

  private stopScheduler(): void {
    if (typeof window !== 'undefined' && this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private schedulerTick(): void {
    if (!this.ctx || !this.bgmGain || this.bgmMode === 'stopped') {
      return;
    }
    if (this.mainOverrideSource) {
      // External BGM buffer active
      return;
    }
    if (computeEffectiveGain(this.prefs.bgmVolume, this.prefs.muted) <= 0) {
      while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_SEC) {
        this.nextStepTime += SIXTEENTH_SEC;
        this.currentStep = (this.currentStep + 1) % STEPS_PER_LOOP;
      }
      return;
    }

    while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      this.scheduleBgmStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += SIXTEENTH_SEC;
      this.currentStep = (this.currentStep + 1) % STEPS_PER_LOOP;
    }
  }

  private scheduleBgmStep(step: number, time: number): void {
    const barIdx = Math.floor(step / 16) as 0 | 1 | 2 | 3;
    const stepInBar = step % 16;
    const bar = BGM_BAR_CHORDS[barIdx];

    // 1. Lush Pad on beat 1 of each bar
    if (stepInBar === 0) {
      for (const hz of bar.padHz) {
        this.scheduleBgmPadVoice(hz, time, 2.55, 0.09);
      }
    }

    // 2. Warm Synthwave Bass (gameplay only)
    if (this.bgmMode === 'gameplay') {
      const triggerBass = this.inDanger
        ? stepInBar % 2 === 0
        : stepInBar % 4 === 0 || stepInBar === 14;
      if (triggerBass) {
        const octaveMult = this.inDanger && stepInBar % 4 === 2 ? 2 : 1;
        this.scheduleBgmBass(bar.bassHz * octaveMult, time, this.inDanger ? 0.14 : 0.24, 0.19);
      }
    }

    // 3. Ethereal Pentatonic Arp (8th notes; sparser during title / gameover)
    if (stepInBar % 2 === 0) {
      const eighthIdx = Math.floor(stepInBar / 2);
      const shouldPlayArp =
        this.bgmMode === 'gameplay' ||
        (this.bgmMode === 'title' && eighthIdx % 2 === 0);
      if (shouldPlayArp) {
        const noteHz = bar.arpHz[eighthIdx];
        const amp = this.bgmMode === 'title' ? 0.065 : 0.09;
        this.scheduleBgmArp(noteHz, time, 0.16, amp);
        // Subtle echo
        this.scheduleBgmArp(noteHz, time + 0.18, 0.14, amp * 0.34);
      }
    }

    // 4. Danger Percussion Layer (kick + crisp off-beat hats)
    if (this.bgmMode === 'gameplay' && this.inDanger) {
      if (stepInBar % 4 === 0) {
        this.scheduleBgmKick(time);
      }
      if (stepInBar % 4 === 2) {
        this.scheduleBgmHat(time, 0.032, 0.085);
      } else if (stepInBar % 2 === 1) {
        this.scheduleBgmHat(time, 0.02, 0.04);
      }
    }
  }

  private scheduleBgmPadVoice(hz: number, time: number, dur: number, amp: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const oscDetune = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, time);
    oscDetune.type = 'sine';
    oscDetune.frequency.setValueAtTime(hz * 1.003, time);

    gain.gain.setValueAtTime(TINY_GAIN, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.35);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    osc.connect(gain);
    oscDetune.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    oscDetune.start(time);
    osc.stop(time + dur + 0.02);
    oscDetune.stop(time + dur + 0.02);
  }

  private scheduleBgmBass(hz: number, time: number, dur: number, amp: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(hz, time);

    const bassFilter = this.ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(380, time);
    bassFilter.frequency.exponentialRampToValueAtTime(140, time + dur);

    gain.gain.setValueAtTime(TINY_GAIN, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    osc.connect(bassFilter);
    bassFilter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private scheduleBgmArp(hz: number, time: number, dur: number, amp: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hz, time);

    gain.gain.setValueAtTime(TINY_GAIN, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private scheduleBgmKick(time: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);

    gain.gain.setValueAtTime(0.32, time);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + 0.13);

    osc.connect(gain);
    gain.connect(this.bgmGain);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private scheduleBgmHat(time: number, dur: number, amp: number): void {
    if (!this.ctx || !this.bgmGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);
    src.start(time);
    src.stop(time + dur + 0.01);
  }

  private playToneAt(
    hz: number,
    time: number,
    dur: number,
    type: OscillatorType,
    amp: number,
    attackSec = 0.004,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, time);

    gain.gain.setValueAtTime(TINY_GAIN, time);
    gain.gain.linearRampToValueAtTime(amp, time + attackSec);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playSweepAt(
    fromHz: number,
    toHz: number,
    time: number,
    dur: number,
    type: OscillatorType,
    amp: number,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), time + dur);

    gain.gain.setValueAtTime(TINY_GAIN, time);
    gain.gain.linearRampToValueAtTime(amp, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playNoiseAt(
    time: number,
    dur: number,
    filterHz: number,
    amp: number,
    filterType: BiquadFilterType,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterHz, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp, time);
    gain.gain.exponentialRampToValueAtTime(TINY_GAIN, time + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(time);
    src.stop(time + dur + 0.01);
  }

  private createWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.5));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private tryPlaySfxOverride(id: SfxId, delaySec = 0): boolean {
    if (!this.canPlaySfx()) return false;
    const url = this.sfxOverrides.get(id);
    if (!url) return false;

    const buffer = this.decodedBuffers.get(url);
    if (!buffer) {
      void this.ensureBufferLoaded(url);
      return false;
    }

    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxGain!);
    src.start(this.ctx!.currentTime + delaySec);
    return true;
  }

  private async ensureBufferLoaded(url: string): Promise<void> {
    if (!this.ctx || this.decodedBuffers.has(url) || this.pendingLoads.has(url)) {
      return;
    }
    this.pendingLoads.add(url);
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      if (!this.ctx) return;
      const decoded = await this.ctx.decodeAudioData(arr);
      this.decodedBuffers.set(url, decoded);
    } catch {
      // Fall back silently to procedural audio when override fails or offline
    } finally {
      this.pendingLoads.delete(url);
    }
  }

  private syncBgmOverrides(): void {
    if (!this.ctx || !this.bgmGain || this.bgmMode === 'stopped') {
      return;
    }

    const mainUrl = this.bgmOverrides.get('main');
    const mainBuf = mainUrl ? this.decodedBuffers.get(mainUrl) : undefined;
    if (mainUrl && !mainBuf) {
      void this.ensureBufferLoaded(mainUrl).then(() => this.syncBgmOverrides());
    }

    if (mainBuf && !this.mainOverrideSource) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1, this.ctx.currentTime);
      gain.connect(this.bgmGain);

      const src = this.ctx.createBufferSource();
      src.buffer = mainBuf;
      src.loop = true;
      src.connect(gain);
      src.start(this.ctx.currentTime);

      this.mainOverrideGain = gain;
      this.mainOverrideSource = src;
    }

    const dangerUrl = this.bgmOverrides.get('danger');
    const dangerBuf = dangerUrl ? this.decodedBuffers.get(dangerUrl) : undefined;
    if (dangerUrl && !dangerBuf) {
      void this.ensureBufferLoaded(dangerUrl).then(() => this.syncBgmOverrides());
    }

    if (dangerBuf && !this.dangerOverrideSource) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(
        this.bgmMode === 'gameplay' && this.inDanger && !this.paused ? 1 : 0,
        this.ctx.currentTime,
      );
      gain.connect(this.bgmGain);

      const src = this.ctx.createBufferSource();
      src.buffer = dangerBuf;
      src.loop = true;
      src.connect(gain);
      src.start(this.ctx.currentTime);

      this.dangerOverrideGain = gain;
      this.dangerOverrideSource = src;
    }
  }

  private stopBgmOverrideSources(): void {
    if (this.mainOverrideSource) {
      try {
        this.mainOverrideSource.stop();
        this.mainOverrideSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.mainOverrideSource = null;
    }
    if (this.mainOverrideGain) {
      this.mainOverrideGain.disconnect();
      this.mainOverrideGain = null;
    }
    if (this.dangerOverrideSource) {
      try {
        this.dangerOverrideSource.stop();
        this.dangerOverrideSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.dangerOverrideSource = null;
    }
    if (this.dangerOverrideGain) {
      this.dangerOverrideGain.disconnect();
      this.dangerOverrideGain = null;
    }
  }
}

export const audioEngine = new AudioEngine();
