import Phaser from 'phaser';
import {
  BOARD_SIZE,
  CENTER_MIN,
  DIR_VECTORS,
  DIRECTIONS_8,
  findNearFullLineGaps,
  getBestRingProgress,
  getPieceCells,
  getRingCells,
  getRingIndex,
  inBounds,
  isInCenter,
} from '../core';
import type {
  CellMovement,
  Direction8,
  GameStateSnapshot,
  GhostPlacement,
  GridPos,
  PieceKind,
  RingIndex,
} from '../core';
import {
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  BOARD_PIXEL_SIZE,
  BOARD_X,
  BOARD_Y,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_SIZE,
  cellCenterToPixel,
  cellToPixel,
} from './layout';
import { drawCrystalCell, PIECE_PALETTE } from './pieceColors';

interface FlashCell {
  pos: GridPos;
  elapsedMs: number;
  durationMs: number;
  color: number;
}

interface SweepCell {
  pos: GridPos;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
  color: number;
}

interface ShiftAnim {
  from: GridPos;
  to: GridPos;
  elapsedMs: number;
  delayMs: number;
  durationMs: number;
}

interface ShockwaveAnim {
  cx: number;
  cy: number;
  delayMs: number;
  elapsedMs: number;
  durationMs: number;
  maxRadius: number;
  color: number;
}

interface CrystalParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  vAngle: number;
  color: number;
  elapsedMs: number;
  durationMs: number;
  kind: 'diamond' | 'spark';
}

interface PiercerBeam {
  from: GridPos;
  to: GridPos;
  elapsedMs: number;
  durationMs: number;
}

interface ShakeState {
  elapsedMs: number;
  durationMs: number;
  amplitudePx: number;
}

const MAX_PARTICLES = 160;
const PRISM_SWEEP_COLORS = [
  0x67e8f9,
  0x38bdf8,
  0x818cf8,
  0xc084fc,
  0xf472b6,
  0xfacc15,
] as const;

const RING_BG_COLORS: Record<RingIndex, number> = {
  1: 0x0284c7,
  2: 0x2563eb,
  3: 0x4f46e5,
  4: 0x7c3aed,
  5: 0xc026d3,
  6: 0xe11d48,
};

export class BoardRenderer {
  private readonly scene: Phaser.Scene;
  private readonly boardContainer: Phaser.GameObjects.Container;
  private readonly boardGraphics: Phaser.GameObjects.Graphics;
  private readonly overlayGraphics: Phaser.GameObjects.Graphics;
  private readonly overdriveGraphics: Phaser.GameObjects.Graphics;
  private readonly centerBorderGraphics: Phaser.GameObjects.Graphics;
  private readonly introText: Phaser.GameObjects.Text;
  private readonly resumeText: Phaser.GameObjects.Text;
  private starTwinkleGraphics!: Phaser.GameObjects.Graphics;

  private readonly flashes: FlashCell[] = [];
  private readonly sweepWaves: SweepCell[] = [];
  private readonly quickTrails: FlashCell[] = [];
  private readonly activeShifts = new Map<number, ShiftAnim>();
  private readonly landingBounces = new Map<number, { elapsedMs: number; durationMs: number }>();
  private readonly shockwaves: ShockwaveAnim[] = [];
  private readonly particles: CrystalParticle[] = [];
  private readonly piercerBeams: PiercerBeam[] = [];
  private shakeState: ShakeState | null = null;
  private overdriveRemainingMs = 0;
  private quickRecoilMs = 0;
  private dangerPulseMs = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.drawStaticBackdrop();

    const boardFrameAndGrid = this.createBoardGridGraphics();
    this.boardGraphics = scene.add.graphics();
    this.centerBorderGraphics = scene.add.graphics();
    this.overlayGraphics = scene.add.graphics();
    this.overdriveGraphics = scene.add.graphics();

    this.boardContainer = scene.add.container(0, 0, [
      boardFrameAndGrid,
      this.boardGraphics,
      this.centerBorderGraphics,
      this.overlayGraphics,
      this.overdriveGraphics,
    ]);

    this.introText = scene.add
      .text(BOARD_CENTER_X, BOARD_CENTER_Y, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '128px',
        fontStyle: 'bold',
        color: '#e0f2fe',
        stroke: '#070914',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    this.resumeText = scene.add
      .text(BOARD_CENTER_X, BOARD_CENTER_Y, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '112px',
        fontStyle: 'bold',
        color: '#67e8f9',
        stroke: '#070914',
        strokeThickness: 12,
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setVisible(false);
  }

  setPausedBlur(paused: boolean): void {
    if (paused) {
      this.boardContainer.setPosition(0, 0);
    }
    const postFX = this.boardContainer.postFX;
    if (!postFX) {
      return;
    }
    postFX.clear();
    if (paused) {
      postFX.addBlur(1, 3, 3, 2);
    }
  }

  renderResumeCountdown(remainingMs: number, totalMs: number): void {
    if (remainingMs <= 0) {
      this.resumeText.setVisible(false);
      return;
    }
    const stepMs = totalMs / 3;
    const count = Math.min(3, Math.max(1, Math.ceil(remainingMs / stepMs)));
    const frac = (remainingMs % stepMs) / stepMs;
    this.resumeText
      .setText(String(count))
      .setScale(0.88 + 0.28 * frac)
      .setAlpha(0.5 + 0.5 * frac)
      .setVisible(true);
  }

  hideResumeCountdown(): void {
    this.resumeText.setVisible(false);
  }

  renderGameOverOverload(progress: number): void {
    const clamped = Math.min(1, Math.max(0, progress));
    const centerOffset = CENTER_MIN * CELL_SIZE;
    const centerSize = 4 * CELL_SIZE;
    const pulse = 0.5 + 0.45 * Math.sin(clamped * Math.PI * 6);

    this.overlayGraphics.fillStyle(0xf43f5e, 0.14 + 0.16 * clamped);
    this.overlayGraphics.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_PIXEL_SIZE, BOARD_PIXEL_SIZE, 12);

    this.overlayGraphics.fillStyle(0xf43f5e, 0.28 + 0.35 * pulse);
    this.overlayGraphics.fillRoundedRect(
      BOARD_X + centerOffset,
      BOARD_Y + centerOffset,
      centerSize,
      centerSize,
      10,
    );
    this.overlayGraphics.lineStyle(6, 0xfda4af, 0.85);
    this.overlayGraphics.strokeRoundedRect(
      BOARD_X + centerOffset - 4,
      BOARD_Y + centerOffset - 4,
      centerSize + 8,
      centerSize + 8,
      12,
    );
  }

  clearAnimations(): void {
    this.flashes.length = 0;
    this.sweepWaves.length = 0;
    this.quickTrails.length = 0;
    this.activeShifts.clear();
    this.landingBounces.clear();
    this.shockwaves.length = 0;
    this.particles.length = 0;
    this.piercerBeams.length = 0;
    this.shakeState = null;
    this.overdriveRemainingMs = 0;
    this.quickRecoilMs = 0;
    this.boardContainer.setPosition(0, 0);
    this.overdriveGraphics.clear();
  }

  triggerRingFlash(cells: { pos: GridPos }[], color = 0xe0f2fe): void {
    for (const item of cells) {
      this.flashes.push({
        pos: { ...item.pos },
        elapsedMs: 0,
        durationMs: 260,
        color,
      });
    }
  }

  triggerCellMovements(movements: CellMovement[]): void {
    for (const m of movements) {
      const existing = this.activeShifts.get(m.cell.id);
      if (existing) {
        existing.to = { ...m.to };
      } else {
        this.activeShifts.set(m.cell.id, {
          from: { ...m.from },
          to: { ...m.to },
          elapsedMs: 0,
          delayMs: 120,
          durationMs: 180,
        });
      }
    }
  }

  triggerShake(amplitudePx: number, durationMs: number): void {
    if (amplitudePx <= 0 || durationMs <= 0) return;
    if (
      !this.shakeState ||
      amplitudePx >= this.shakeState.amplitudePx ||
      durationMs > this.shakeState.durationMs - this.shakeState.elapsedMs
    ) {
      this.shakeState = { elapsedMs: 0, durationMs, amplitudePx };
    }
  }

  triggerQuickRecoil(): void {
    this.quickRecoilMs = 220;
    for (let i = 0; i < 8; i++) {
      const theta = (Math.PI * 2 * i) / 8 + Math.PI / 8;
      const speed = 0.22 + (i % 2) * 0.08;
      this.pushParticle({
        x: BOARD_CENTER_X + Math.cos(theta) * 90,
        y: BOARD_CENTER_Y + Math.sin(theta) * 90,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        size: 5,
        angle: theta,
        vAngle: 0.008,
        color: 0xfacc15,
        elapsedMs: 0,
        durationMs: 280,
        kind: 'spark',
      });
    }
  }

  triggerLandingBounce(
    placed: { pos: GridPos; cell: { id: number } }[],
    kind: PieceKind,
  ): void {
    if (placed.length === 0) return;
    for (const item of placed) {
      this.landingBounces.set(item.cell.id, { elapsedMs: 0, durationMs: 150 });
    }

    const palette = PIECE_PALETTE[kind];
    const sparkCount = Math.min(6, Math.max(4, placed.length + 1));
    for (let i = 0; i < sparkCount; i++) {
      const target = placed[i % placed.length].pos;
      const { x, y } = cellCenterToPixel(target.r, target.c);
      const theta = (Math.PI * 2 * i) / sparkCount + 0.35;
      const speed = 0.14 + (i % 3) * 0.05;
      this.pushParticle({
        x: x + Math.cos(theta) * (CELL_SIZE * 0.32),
        y: y + Math.sin(theta) * (CELL_SIZE * 0.32),
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        size: 4.5,
        angle: theta,
        vAngle: 0.01,
        color: i % 2 === 0 ? palette.highlight : palette.edge,
        elapsedMs: 0,
        durationMs: 260,
        kind: 'spark',
      });
    }
  }

  triggerPrismClear(
    clearedCells: { pos: GridPos }[],
    isRing: boolean,
    isMulti: boolean,
    isAllClear: boolean,
  ): void {
    if (clearedCells.length === 0) return;

    // 1. White impact flash during initial hitstop
    const flashDur = isMulti ? 200 : 140;
    for (const item of clearedCells) {
      this.flashes.push({
        pos: { ...item.pos },
        elapsedMs: 0,
        durationMs: flashDur,
        color: 0xffffff,
      });
    }

    // 2. Clockwise prism wave sweep & shattering crystal shards
    const sorted = [...clearedCells].sort((a, b) => {
      const angA = Math.atan2(a.pos.r - 7.5, a.pos.c - 7.5);
      const angB = Math.atan2(b.pos.r - 7.5, b.pos.c - 7.5);
      return angA - angB;
    });

    const stepDelay = isRing ? 4 : 7;
    const shardStride = sorted.length > 36 ? 2 : 1;

    sorted.forEach((item, idx) => {
      const color = PRISM_SWEEP_COLORS[idx % PRISM_SWEEP_COLORS.length];
      this.sweepWaves.push({
        pos: { ...item.pos },
        delayMs: Math.min(260, idx * stepDelay),
        elapsedMs: 0,
        durationMs: 240,
        color,
      });

      if (idx % shardStride === 0) {
        const { x, y } = cellCenterToPixel(item.pos.r, item.pos.c);
        const dx = x - BOARD_CENTER_X;
        const dy = y - BOARD_CENTER_Y;
        const baseAng = Math.atan2(dy, dx);
        const shards = isMulti ? 3 : 2;
        for (let s = 0; s < shards; s++) {
          const ang = baseAng + (s - 0.5) * 0.65;
          const speed = 0.22 + s * 0.1 + (idx % 3) * 0.04;
          this.pushParticle({
            x,
            y,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed,
            size: isMulti ? 7 : 5.5,
            angle: ang,
            vAngle: (s % 2 === 0 ? 1 : -1) * 0.012,
            color: PRISM_SWEEP_COLORS[(idx + s) % PRISM_SWEEP_COLORS.length],
            elapsedMs: 0,
            durationMs: isMulti ? 520 : 380,
            kind: 'diamond',
          });
        }
      }
    });

    // 3. Multi-ring / Cross Clear / All Clear rainbow shockwave + border overdrive
    if (isMulti || isAllClear) {
      const waveColors = [0x38bdf8, 0xf0abfc, 0xfacc15];
      waveColors.forEach((col, i) => {
        this.shockwaves.push({
          cx: BOARD_CENTER_X,
          cy: BOARD_CENTER_Y,
          delayMs: i * 65,
          elapsedMs: 0,
          durationMs: 480,
          maxRadius: BOARD_PIXEL_SIZE * 0.72,
          color: col,
        });
      });

      this.overdriveRemainingMs = isAllClear ? 1300 : 900;

      for (let i = 0; i < 36; i++) {
        const ang = (Math.PI * 2 * i) / 36;
        const speed = 0.34 + (i % 4) * 0.09;
        this.pushParticle({
          x: BOARD_CENTER_X,
          y: BOARD_CENTER_Y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          size: 7.5,
          angle: ang,
          vAngle: 0.014,
          color: PRISM_SWEEP_COLORS[i % PRISM_SWEEP_COLORS.length],
          elapsedMs: 0,
          durationMs: 620,
          kind: 'diamond',
        });
      }
    }
  }

  triggerResonanceSweep(): void {
    const ring1Cells = getRingCells(1);
    ring1Cells.forEach((pos, idx) => {
      this.sweepWaves.push({
        pos: { ...pos },
        delayMs: idx * 8,
        elapsedMs: 0,
        durationMs: 280,
        color: PRISM_SWEEP_COLORS[idx % PRISM_SWEEP_COLORS.length],
      });
    });

    const waveColors = [0x38bdf8, 0xf0abfc, 0xfacc15];
    waveColors.forEach((col, i) => {
      this.shockwaves.push({
        cx: BOARD_CENTER_X,
        cy: BOARD_CENTER_Y,
        delayMs: i * 65,
        elapsedMs: 0,
        durationMs: 480,
        maxRadius: BOARD_PIXEL_SIZE * 0.72,
        color: col,
      });
    });

    this.overdriveRemainingMs = Math.max(this.overdriveRemainingMs, 750);
  }

  triggerPiercerImpact(from: GridPos, to: GridPos): void {
    this.piercerBeams.push({
      from: { ...from },
      to: { ...to },
      elapsedMs: 0,
      durationMs: 280,
    });
    const pt = cellCenterToPixel(to.r, to.c);
    this.shockwaves.push({
      cx: pt.x,
      cy: pt.y,
      delayMs: 0,
      elapsedMs: 0,
      durationMs: 320,
      maxRadius: CELL_SIZE * 1.8,
      color: 0xf0abfc,
    });
    for (let i = 0; i < 14; i++) {
      const ang = (Math.PI * 2 * i) / 14;
      const speed = 0.2 + (i % 3) * 0.08;
      this.pushParticle({
        x: pt.x,
        y: pt.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        size: 5.5,
        angle: ang,
        vAngle: 0.012,
        color: i % 2 === 0 ? 0xf0abfc : 0x38bdf8,
        elapsedMs: 0,
        durationMs: 360,
        kind: 'diamond',
      });
    }
  }

  triggerNovaBlast(center: GridPos): void {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = center.r + dr;
        const c = center.c + dc;
        if (!inBounds(r, c)) continue;
        this.flashes.push({
          pos: { r, c },
          elapsedMs: 0,
          durationMs: 280,
          color: 0xfb7185,
        });
      }
    }
    const { x, y } = cellCenterToPixel(center.r, center.c);
    this.shockwaves.push({
      cx: x,
      cy: y,
      delayMs: 0,
      elapsedMs: 0,
      durationMs: 340,
      maxRadius: CELL_SIZE * 2.1,
      color: 0xfef08a,
    });
    this.shockwaves.push({
      cx: x,
      cy: y,
      delayMs: 55,
      elapsedMs: 0,
      durationMs: 380,
      maxRadius: CELL_SIZE * 2.9,
      color: 0xf43f5e,
    });
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      const speed = 0.24 + (i % 4) * 0.09;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        size: 6.5,
        angle: ang,
        vAngle: 0.015,
        color: i % 3 === 0 ? 0xfef08a : i % 3 === 1 ? 0xfb7185 : 0xf97316,
        elapsedMs: 0,
        durationMs: 420,
        kind: 'diamond',
      });
    }
  }

  private pushParticle(p: CrystalParticle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  recordQuickTrail(cells: GridPos[]): void {
    for (const pos of cells) {
      this.quickTrails.push({
        pos: { ...pos },
        elapsedMs: 0,
        durationMs: 240,
        color: 0xfacc15,
      });
    }
  }

  showCallout(label: string, color = '#67e8f9', yOffset = 0): void {
    const text = this.scene.add
      .text(BOARD_CENTER_X, BOARD_Y + 86 + yOffset, label, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '38px',
        fontStyle: 'bold',
        color,
        stroke: '#070914',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(25);

    this.scene.tweens.add({
      targets: text,
      y: BOARD_Y + 42 + yOffset,
      alpha: 0,
      scale: 1.12,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  render(state: GameStateSnapshot, ghost: GhostPlacement | null, dtMs: number): void {
    this.dangerPulseMs += dtMs;
    this.boardGraphics.clear();
    this.centerBorderGraphics.clear();
    this.overlayGraphics.clear();
    this.overdriveGraphics.clear();

    if (this.starTwinkleGraphics && dtMs > 0) {
      this.starTwinkleGraphics.setAlpha(0.5 + 0.45 * Math.sin(this.dangerPulseMs * 0.0025));
    }

    // 0. Micro-shake & Quick Launch Core Recoil
    if (this.shakeState && dtMs > 0) {
      this.shakeState.elapsedMs += dtMs;
      if (this.shakeState.elapsedMs >= this.shakeState.durationMs) {
        this.shakeState = null;
        this.boardContainer.setPosition(0, 0);
      } else {
        const progress = this.shakeState.elapsedMs / this.shakeState.durationMs;
        const decay = 1 - progress;
        const amp = this.shakeState.amplitudePx * decay;
        const ox = Math.sin(this.shakeState.elapsedMs * 0.43) * amp;
        const oy = Math.cos(this.shakeState.elapsedMs * 0.57) * amp;
        this.boardContainer.setPosition(ox, oy);
      }
    }

    if (this.quickRecoilMs > 0 && dtMs > 0) {
      this.quickRecoilMs = Math.max(0, this.quickRecoilMs - dtMs);
    }

    // 1. Center 4x4 core border (pulses crimson in danger state or golden on QUICK!)
    const centerOffset = CENTER_MIN * CELL_SIZE;
    const centerSize = 4 * CELL_SIZE;
    if (this.quickRecoilMs > 0) {
      const frac = this.quickRecoilMs / 220;
      const expand = (1 - frac) * 14;
      this.centerBorderGraphics.lineStyle(4 * frac + 1, 0xfacc15, frac * 0.9);
      this.centerBorderGraphics.strokeRoundedRect(
        BOARD_X + centerOffset - expand / 2,
        BOARD_Y + centerOffset - expand / 2,
        centerSize + expand,
        centerSize + expand,
        12,
      );
    }
    if (state.inDanger) {
      const pulse = 0.45 + 0.45 * Math.sin(this.dangerPulseMs * 0.008);
      this.centerBorderGraphics.lineStyle(5, 0xf43f5e, pulse);
      this.centerBorderGraphics.strokeRoundedRect(
        BOARD_X + centerOffset - 2,
        BOARD_Y + centerOffset - 2,
        centerSize + 4,
        centerSize + 4,
        10,
      );
    } else {
      this.centerBorderGraphics.lineStyle(3, 0x67e8f9, 0.85);
      this.centerBorderGraphics.strokeRoundedRect(
        BOARD_X + centerOffset,
        BOARD_Y + centerOffset,
        centerSize,
        centerSize,
        10,
      );
    }

    // 1b. 4-Side Ring Resonance border segments (N / S / W / E)
    this.renderResonanceBorders(state);

    // 2. Advance shift & landing bounce animations & render settled board blocks
    for (const [id, shift] of this.activeShifts.entries()) {
      shift.elapsedMs += dtMs;
      if (shift.elapsedMs >= shift.delayMs + shift.durationMs) {
        this.activeShifts.delete(id);
      }
    }
    for (const [id, bounce] of this.landingBounces.entries()) {
      bounce.elapsedMs += dtMs;
      if (bounce.elapsedMs >= bounce.durationMs) {
        this.landingBounces.delete(id);
      }
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = state.board[r][c];
        if (!cell) continue;
        const shift = this.activeShifts.get(cell.id);
        let drawX: number;
        let drawY: number;
        if (shift) {
          const fromPx = cellToPixel(shift.from.r, shift.from.c);
          const toPx = cellToPixel(shift.to.r, shift.to.c);
          let t = 0;
          if (shift.elapsedMs > shift.delayMs) {
            const u = Math.min(1, (shift.elapsedMs - shift.delayMs) / shift.durationMs);
            const s = 0.85;
            const u1 = u - 1;
            t = 1 + (s + 1) * (u1 * u1 * u1) + s * (u1 * u1);
          }
          drawX = fromPx.x + (toPx.x - fromPx.x) * t;
          drawY = fromPx.y + (toPx.y - fromPx.y) * t;
        } else {
          const px = cellToPixel(r, c);
          drawX = px.x;
          drawY = px.y;
        }

        const bounce = this.landingBounces.get(cell.id);
        if (bounce) {
          const phase = bounce.elapsedMs / bounce.durationMs;
          const extraScale = 0.08 * Math.sin(phase * Math.PI);
          const drawSize = CELL_SIZE * (1 + extraScale);
          const offset = (drawSize - CELL_SIZE) / 2;
          drawCrystalCell(this.boardGraphics, drawX - offset, drawY - offset, drawSize, cell.kind, 1);
        } else {
          drawCrystalCell(this.boardGraphics, drawX, drawY, CELL_SIZE, cell.kind, 1);
        }
      }
    }

    // 2b. Near-complete line & ring gap shimmer indicators
    const shimmer = 0.25 + 0.25 * Math.sin(this.dangerPulseMs * 0.008);
    const lineGaps = findNearFullLineGaps(state.board, 2);
    for (const pos of lineGaps) {
      const { x, y } = cellToPixel(pos.r, pos.c);
      this.boardGraphics.lineStyle(1.5, 0x38bdf8, shimmer);
      this.boardGraphics.strokeRoundedRect(x + 8, y + 8, CELL_SIZE - 16, CELL_SIZE - 16, 6);
    }

    const bestRing = getBestRingProgress(state.board);
    if (bestRing && bestRing.ratio >= 0.75 && bestRing.missing.length > 0) {
      const ringAlpha = 0.3 + 0.22 * Math.sin(this.dangerPulseMs * 0.01);
      for (const pos of bestRing.missing) {
        const { x, y } = cellCenterToPixel(pos.r, pos.c);
        const d = 10;
        this.boardGraphics.lineStyle(2, 0xe879f9, ringAlpha);
        this.boardGraphics.strokePoints(
          [
            { x, y: y - d },
            { x: x + d, y },
            { x, y: y + d },
            { x: x - d, y },
          ],
          true,
        );
      }
    }

    // 2c. QUICK! golden flight afterimages
    for (let i = this.quickTrails.length - 1; i >= 0; i--) {
      const tr = this.quickTrails[i];
      tr.elapsedMs += dtMs;
      if (tr.elapsedMs >= tr.durationMs) {
        this.quickTrails.splice(i, 1);
        continue;
      }
      const alpha = (1 - tr.elapsedMs / tr.durationMs) * 0.42;
      const { x, y } = cellToPixel(tr.pos.r, tr.pos.c);
      this.boardGraphics.fillStyle(tr.color, alpha);
      this.boardGraphics.fillRoundedRect(x + 6, y + 6, CELL_SIZE - 12, CELL_SIZE - 12, 8);
    }

    // 3. Ghost sightline and target outline
    if (ghost && state.activePiece) {
      this.renderGhost(state, ghost);
    }

    // 4. Active piece
    if (state.activePiece) {
      const cells = getPieceCells(
        state.activePiece.kind,
        state.activePiece.rotation,
        state.activePiece.origin,
      );
      for (const pos of cells) {
        const { x, y } = cellToPixel(pos.r, pos.c);
        drawCrystalCell(this.boardGraphics, x, y, CELL_SIZE, state.activePiece.kind, 1);
      }

      // Stardust Piercer mid-flight manual lock cue over valid empty outer hole
      if (
        state.activePiece.kind === 'STARDUST_PIERCER' &&
        (state.phase === 'FLIGHT' || state.phase === 'LOCK_DELAY') &&
        !isInCenter(state.activePiece.origin.r, state.activePiece.origin.c) &&
        state.board[state.activePiece.origin.r][state.activePiece.origin.c] === null
      ) {
        const { x, y } = cellCenterToPixel(
          state.activePiece.origin.r,
          state.activePiece.origin.c,
        );
        const cueAlpha = 0.65 + 0.35 * Math.sin(this.dangerPulseMs * 0.02);
        this.boardGraphics.lineStyle(3, 0x10b981, cueAlpha);
        this.boardGraphics.strokeCircle(x, y, CELL_SIZE * 0.44);
      }

      if (state.phase === 'LOCK_DELAY') {
        const ratio = Math.min(1, state.lockDelayElapsedMs / state.lockDelayDurationMs);
        this.boardGraphics.lineStyle(3, 0xffffff, 0.45 + 0.5 * (1 - ratio));
        for (const pos of cells) {
          const { x, y } = cellToPixel(pos.r, pos.c);
          this.boardGraphics.strokeRoundedRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6, 8);
        }
      }
    }

    // 5. Hover countdown ring and 8-way compass arrows
    if (state.phase === 'HOVER') {
      this.renderHoverCompass(state);
    }

    // 6. Active ring/line flashes, clockwise prism sweep waves, beams, shockwaves & shards
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.elapsedMs += dtMs;
      if (f.elapsedMs >= f.durationMs) {
        this.flashes.splice(i, 1);
        continue;
      }
      const alpha = (1 - f.elapsedMs / f.durationMs) * 0.85;
      const { x, y } = cellToPixel(f.pos.r, f.pos.c);
      this.overlayGraphics.fillStyle(f.color, alpha);
      this.overlayGraphics.fillRoundedRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4, 8);
    }

    for (let i = this.sweepWaves.length - 1; i >= 0; i--) {
      const swc = this.sweepWaves[i];
      swc.elapsedMs += dtMs;
      if (swc.elapsedMs < swc.delayMs) {
        continue;
      }
      const localMs = swc.elapsedMs - swc.delayMs;
      if (localMs >= swc.durationMs) {
        this.sweepWaves.splice(i, 1);
        continue;
      }
      const progress = localMs / swc.durationMs;
      const alpha = Math.sin(progress * Math.PI) * 0.85;
      const inset = 2 + progress * 10;
      const { x, y } = cellToPixel(swc.pos.r, swc.pos.c);
      this.overlayGraphics.fillStyle(swc.color, alpha * 0.55);
      this.overlayGraphics.fillRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, 8);
      this.overlayGraphics.lineStyle(2.5, 0xffffff, alpha);
      this.overlayGraphics.strokeRoundedRect(x + inset, y + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2, 8);
    }

    for (let i = this.piercerBeams.length - 1; i >= 0; i--) {
      const beam = this.piercerBeams[i];
      beam.elapsedMs += dtMs;
      if (beam.elapsedMs >= beam.durationMs) {
        this.piercerBeams.splice(i, 1);
        continue;
      }
      const alpha = 1 - beam.elapsedMs / beam.durationMs;
      const a = cellCenterToPixel(beam.from.r, beam.from.c);
      const b = cellCenterToPixel(beam.to.r, beam.to.c);
      this.overlayGraphics.lineStyle(12 * alpha + 2, 0x38bdf8, alpha * 0.45);
      this.overlayGraphics.lineBetween(a.x, a.y, b.x, b.y);
      this.overlayGraphics.lineStyle(4 * alpha + 1, 0xffffff, alpha * 0.95);
      this.overlayGraphics.lineBetween(a.x, a.y, b.x, b.y);
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.elapsedMs += dtMs;
      if (sw.elapsedMs < sw.delayMs) {
        continue;
      }
      const localMs = sw.elapsedMs - sw.delayMs;
      if (localMs >= sw.durationMs) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = localMs / sw.durationMs;
      const radius = CELL_SIZE * 0.3 + (sw.maxRadius - CELL_SIZE * 0.3) * (1 - Math.pow(1 - progress, 2));
      const alpha = (1 - progress) * 0.85;
      this.overlayGraphics.lineStyle(4.5 * (1 - progress) + 1.5, sw.color, alpha);
      this.overlayGraphics.strokeCircle(sw.cx, sw.cy, radius);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.elapsedMs += dtMs;
      if (p.elapsedMs >= p.durationMs) {
        this.particles.splice(i, 1);
        continue;
      }
      const drag = Math.pow(0.985, dtMs * 0.06);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dtMs;
      p.y += p.vy * dtMs;
      p.angle += p.vAngle * dtMs;

      const lifeFrac = 1 - p.elapsedMs / p.durationMs;
      const r = p.size * (0.45 + 0.55 * lifeFrac);
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);

      this.overlayGraphics.fillStyle(p.color, lifeFrac * 0.92);
      if (p.kind === 'diamond') {
        const aspect = 0.6;
        this.overlayGraphics.fillPoints(
          [
            { x: p.x + cos * r, y: p.y + sin * r },
            { x: p.x - sin * r * aspect, y: p.y + cos * r * aspect },
            { x: p.x - cos * r, y: p.y - sin * r },
            { x: p.x + sin * r * aspect, y: p.y - cos * r * aspect },
          ],
          true,
        );
      } else {
        this.overlayGraphics.fillCircle(p.x, p.y, r * 0.72);
      }
    }

    if (this.overdriveRemainingMs > 0) {
      if (dtMs > 0) {
        this.overdriveRemainingMs = Math.max(0, this.overdriveRemainingMs - dtMs);
      }
      const frac = Math.min(1, this.overdriveRemainingMs / 900);
      const colorIdx = Math.floor(this.dangerPulseMs / 90) % PRISM_SWEEP_COLORS.length;
      const borderColor = PRISM_SWEEP_COLORS[colorIdx];
      const nextColor = PRISM_SWEEP_COLORS[(colorIdx + 2) % PRISM_SWEEP_COLORS.length];

      this.overdriveGraphics.lineStyle(8, borderColor, frac * 0.36);
      this.overdriveGraphics.strokeRoundedRect(
        BOARD_X - 16,
        BOARD_Y - 16,
        BOARD_PIXEL_SIZE + 32,
        BOARD_PIXEL_SIZE + 32,
        20,
      );
      this.overdriveGraphics.lineStyle(3, nextColor, frac * 0.92);
      this.overdriveGraphics.strokeRoundedRect(
        BOARD_X - 6,
        BOARD_Y - 6,
        BOARD_PIXEL_SIZE + 12,
        BOARD_PIXEL_SIZE + 12,
        14,
      );
    }

    // 7. Intro 3-2-1 countdown
    if (state.phase === 'INTRO') {
      const remaining = Math.max(0, state.introDurationMs - state.introElapsedMs);
      const count = Math.min(3, Math.max(1, Math.ceil(remaining / 300)));
      const subFrac = (remaining % 300) / 300;
      this.introText
        .setText(String(count))
        .setScale(0.85 + 0.3 * subFrac)
        .setAlpha(0.4 + 0.6 * subFrac)
        .setVisible(true);
    } else {
      this.introText.setVisible(false);
    }
  }

  private renderGhost(state: GameStateSnapshot, ghost: GhostPlacement): void {
    const piece = state.activePiece!;
    const style = PIECE_PALETTE[piece.kind];

    // Faint dotted trajectory path
    if (ghost.path.length > 1) {
      for (let i = 0; i < ghost.path.length; i++) {
        const pt = cellCenterToPixel(ghost.path[i].r, ghost.path[i].c);
        this.boardGraphics.fillStyle(style.edge, i === ghost.path.length - 1 ? 0.5 : 0.25);
        this.boardGraphics.fillCircle(pt.x, pt.y, i === ghost.path.length - 1 ? 5 : 3);
      }
      this.boardGraphics.lineStyle(2, style.edge, 0.26);
      for (let i = 0; i < ghost.path.length - 1; i++) {
        const a = cellCenterToPixel(ghost.path[i].r, ghost.path[i].c);
        const b = cellCenterToPixel(ghost.path[i + 1].r, ghost.path[i + 1].c);
        this.boardGraphics.lineBetween(a.x, a.y, b.x, b.y);
      }
    }

    const finalCells = getPieceCells(
      ghost.finalPiece.kind,
      ghost.finalPiece.rotation,
      ghost.finalPiece.origin,
    );

    if (piece.kind === 'NOVA_BOMB') {
      const origin = ghost.finalPiece.origin;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = origin.r + dr;
          const c = origin.c + dc;
          if (!inBounds(r, c)) continue;
          const { x, y } = cellToPixel(r, c);
          this.boardGraphics.fillStyle(0xf43f5e, 0.16);
          this.boardGraphics.fillRoundedRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8, 8);
          this.boardGraphics.lineStyle(2, 0xfef08a, 0.55);
          this.boardGraphics.strokeRoundedRect(x + 4, y + 4, CELL_SIZE - 8, CELL_SIZE - 8, 8);
        }
      }
    }

    if (piece.kind === 'STARDUST_PIERCER') {
      // Glowing cyan-magenta piercing beam along ray path
      if (ghost.path.length > 1) {
        this.boardGraphics.lineStyle(6, 0x38bdf8, 0.28);
        for (let i = 0; i < ghost.path.length - 1; i++) {
          const a = cellCenterToPixel(ghost.path[i].r, ghost.path[i].c);
          const b = cellCenterToPixel(ghost.path[i + 1].r, ghost.path[i + 1].c);
          this.boardGraphics.lineBetween(a.x, a.y, b.x, b.y);
        }
        this.boardGraphics.lineStyle(2.5, 0xf0abfc, 0.88);
        for (let i = 0; i < ghost.path.length - 1; i++) {
          const a = cellCenterToPixel(ghost.path[i].r, ghost.path[i].c);
          const b = cellCenterToPixel(ghost.path[i + 1].r, ghost.path[i + 1].c);
          this.boardGraphics.lineBetween(a.x, a.y, b.x, b.y);
        }
      }

      const target = ghost.finalPiece.origin;
      const { x, y } = cellToPixel(target.r, target.c);
      const cx = x + CELL_SIZE / 2;
      const cy = y + CELL_SIZE / 2;
      const halfCross = Math.round(CELL_SIZE * 0.38);
      const noOuterHole = isInCenter(target.r, target.c) || !ghost.targetValid;
      const reticleColor = noOuterHole ? 0xf43f5e : 0xf0abfc;
      this.boardGraphics.fillStyle(reticleColor, 0.24);
      this.boardGraphics.fillRoundedRect(x + 5, y + 5, CELL_SIZE - 10, CELL_SIZE - 10, 8);
      this.boardGraphics.lineStyle(3, reticleColor, 0.9);
      this.boardGraphics.strokeCircle(cx, cy, CELL_SIZE * 0.34);
      this.boardGraphics.lineBetween(cx - halfCross, cy, cx + halfCross, cy);
      this.boardGraphics.lineBetween(cx, cy - halfCross, cx, cy + halfCross);
      return;
    }

    for (const pos of finalCells) {
      const { x, y } = cellToPixel(pos.r, pos.c);
      this.boardGraphics.fillStyle(style.fill, 0.18);
      this.boardGraphics.fillRoundedRect(x + 5, y + 5, CELL_SIZE - 10, CELL_SIZE - 10, 8);
      this.boardGraphics.lineStyle(2.5, style.edge, 0.72);
      this.boardGraphics.strokeRoundedRect(x + 5, y + 5, CELL_SIZE - 10, CELL_SIZE - 10, 8);
    }
  }

  private renderResonanceBorders(state: GameStateSnapshot): void {
    const sides = state.resonanceSides;
    const litCount = [sides.north, sides.south, sides.west, sides.east].filter(Boolean).length;
    const almostReady = litCount === 3;
    const pulse = 0.5 + 0.5 * Math.sin(this.dangerPulseMs * 0.009);

    const pad = 7;
    const gap = 16;
    const x0 = BOARD_X - pad;
    const x1 = BOARD_X + BOARD_PIXEL_SIZE + pad;
    const y0 = BOARD_Y - pad;
    const y1 = BOARD_Y + BOARD_PIXEL_SIZE + pad;

    const segments: { lit: boolean; ax: number; ay: number; bx: number; by: number }[] = [
      { lit: sides.north, ax: BOARD_X + gap, ay: y0, bx: BOARD_X + BOARD_PIXEL_SIZE - gap, by: y0 },
      { lit: sides.south, ax: BOARD_X + gap, ay: y1, bx: BOARD_X + BOARD_PIXEL_SIZE - gap, by: y1 },
      { lit: sides.west, ax: x0, ay: BOARD_Y + gap, bx: x0, by: BOARD_Y + BOARD_PIXEL_SIZE - gap },
      { lit: sides.east, ax: x1, ay: BOARD_Y + gap, bx: x1, by: BOARD_Y + BOARD_PIXEL_SIZE - gap },
    ];

    for (const seg of segments) {
      if (seg.lit) {
        const haloColor = almostReady ? 0xfacc15 : 0xe879f9;
        const coreColor = almostReady ? 0xfef08a : 0x38bdf8;
        const haloAlpha = almostReady ? 0.24 + 0.14 * pulse : 0.22;
        this.centerBorderGraphics.lineStyle(10, haloColor, haloAlpha);
        this.centerBorderGraphics.lineBetween(seg.ax, seg.ay, seg.bx, seg.by);
        this.centerBorderGraphics.lineStyle(4.5, coreColor, 0.95);
        this.centerBorderGraphics.lineBetween(seg.ax, seg.ay, seg.bx, seg.by);
      } else {
        this.centerBorderGraphics.lineStyle(3, 0x334155, 0.38);
        this.centerBorderGraphics.lineBetween(seg.ax, seg.ay, seg.bx, seg.by);
        if (almostReady) {
          this.centerBorderGraphics.lineStyle(4, 0xfacc15, 0.25 + 0.35 * pulse);
          this.centerBorderGraphics.lineBetween(seg.ax, seg.ay, seg.bx, seg.by);
        }
      }
    }
  }

  private renderHoverCompass(state: GameStateSnapshot): void {
    const remainingMs = Math.max(0, state.hoverDurationMs - state.hoverElapsedMs);
    const ratio = state.hoverDurationMs > 0 ? remainingMs / state.hoverDurationMs : 0;
    const isUrgent = remainingMs <= 400;

    const ringRadius = 148;
    this.overlayGraphics.lineStyle(6, 0x334155, 0.4);
    this.overlayGraphics.strokeCircle(BOARD_CENTER_X, BOARD_CENTER_Y, ringRadius);

    if (ratio > 0.005) {
      const arcColor = isUrgent ? 0xf43f5e : 0x38bdf8;
      const arcAlpha = isUrgent
        ? 0.7 + 0.3 * Math.sin(this.dangerPulseMs * 0.03)
        : 0.9;
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * ratio;

      this.overlayGraphics.lineStyle(7, arcColor, arcAlpha);
      this.overlayGraphics.beginPath();
      this.overlayGraphics.arc(
        BOARD_CENTER_X,
        BOARD_CENTER_Y,
        ringRadius,
        startAngle,
        endAngle,
        false,
      );
      this.overlayGraphics.strokePath();
    }

    // 8-way compass chevrons
    const selectedDir = state.activePiece?.direction ?? null;
    for (const dir of DIRECTIONS_8) {
      this.drawCompassChevron(dir, dir === selectedDir);
    }
  }

  private drawCompassChevron(dir: Direction8, active: boolean): void {
    const vec = DIR_VECTORS[dir];
    const len = Math.hypot(vec.dc, vec.dr);
    const ux = vec.dc / len;
    const uy = vec.dr / len;
    const px = -uy;
    const py = ux;

    const dist = active ? 182 : 174;
    const tipDist = dist + (active ? 20 : 13);
    const wing = active ? 12 : 8;

    const tipX = BOARD_CENTER_X + ux * tipDist;
    const tipY = BOARD_CENTER_Y + uy * tipDist;
    const baseX = BOARD_CENTER_X + ux * dist;
    const baseY = BOARD_CENTER_Y + uy * dist;
    const leftX = baseX + px * wing;
    const leftY = baseY + py * wing;
    const rightX = baseX - px * wing;
    const rightY = baseY - py * wing;

    if (active) {
      this.overlayGraphics.fillStyle(0x67e8f9, 0.95);
      this.overlayGraphics.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
      this.overlayGraphics.lineStyle(2, 0xfef08a, 0.85);
      this.overlayGraphics.strokeTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
      this.overlayGraphics.lineStyle(3, 0x67e8f9, 0.45);
      this.overlayGraphics.lineBetween(
        BOARD_CENTER_X + ux * 154,
        BOARD_CENTER_Y + uy * 154,
        baseX,
        baseY,
      );
    } else {
      this.overlayGraphics.fillStyle(0x94a3b8, 0.35);
      this.overlayGraphics.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);
    }
  }

  private drawStaticBackdrop(): void {
    const bg = this.scene.add.graphics();
    bg.fillGradientStyle(0x070914, 0x070914, 0x0e1430, 0x0a0f24, 1);
    bg.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const stars = this.scene.add.graphics();
    for (let i = 0; i < 140; i++) {
      const sx = (i * 197 + 43) % CANVAS_WIDTH;
      const sy = (i * 313 + 71) % CANVAS_HEIGHT;
      const alpha = 0.18 + ((i * 37) % 60) / 100;
      const radius = i % 7 === 0 ? 2.4 : 1.3;
      stars.fillStyle(i % 5 === 0 ? 0x9dd2ff : 0xffffff, alpha);
      stars.fillCircle(sx, sy, radius);
    }

    this.starTwinkleGraphics = this.scene.add.graphics();
    for (let i = 0; i < 36; i++) {
      const sx = (i * 409 + 113) % CANVAS_WIDTH;
      const sy = (i * 521 + 199) % CANVAS_HEIGHT;
      this.starTwinkleGraphics.fillStyle(i % 2 === 0 ? 0x67e8f9 : 0xe879f9, 0.55);
      this.starTwinkleGraphics.fillCircle(sx, sy, i % 3 === 0 ? 2.6 : 1.6);
    }
  }

  private createBoardGridGraphics(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.lineStyle(4, 0x4cc9f0, 0.4);
    g.strokeRoundedRect(
      BOARD_X - 12,
      BOARD_Y - 12,
      BOARD_PIXEL_SIZE + 24,
      BOARD_PIXEL_SIZE + 24,
      18,
    );
    g.lineStyle(1.5, 0xa5f3fc, 0.8);
    g.strokeRoundedRect(
      BOARD_X - 4,
      BOARD_Y - 4,
      BOARD_PIXEL_SIZE + 8,
      BOARD_PIXEL_SIZE + 8,
      12,
    );

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const { x, y } = cellToPixel(r, c);
        const ring = getRingIndex(r, c);
        const center = isInCenter(r, c);

        if (center) {
          g.fillStyle(0x22d3ee, 0.13);
          g.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
          g.lineStyle(1, 0x67e8f9, 0.35);
          g.strokeRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
        } else if (ring !== null) {
          g.fillStyle(RING_BG_COLORS[ring], 0.1);
          g.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
          g.lineStyle(1, RING_BG_COLORS[ring], 0.25);
          g.strokeRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
        }
      }
    }

    return g;
  }
}
