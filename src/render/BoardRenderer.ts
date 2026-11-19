import Phaser from 'phaser';
import {
  BOARD_SIZE,
  CENTER_MIN,
  DIR_VECTORS,
  DIRECTIONS_8,
  findNearFullLineGaps,
  getBestRingProgress,
  getPieceCells,
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
  elapsedMs: number;
  durationMs: number;
  maxRadius: number;
  color: number;
}

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
  private readonly boardGraphics: Phaser.GameObjects.Graphics;
  private readonly overlayGraphics: Phaser.GameObjects.Graphics;
  private readonly centerBorderGraphics: Phaser.GameObjects.Graphics;
  private readonly introText: Phaser.GameObjects.Text;
  private readonly gameOverGroup: Phaser.GameObjects.Container;
  private readonly gameOverScoreText: Phaser.GameObjects.Text;
  private readonly gameOverStatsText: Phaser.GameObjects.Text;

  private readonly flashes: FlashCell[] = [];
  private readonly quickTrails: FlashCell[] = [];
  private readonly activeShifts = new Map<number, ShiftAnim>();
  private readonly shockwaves: ShockwaveAnim[] = [];
  private dangerPulseMs = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.drawStaticBackdrop();

    this.boardGraphics = scene.add.graphics();
    this.centerBorderGraphics = scene.add.graphics();
    this.overlayGraphics = scene.add.graphics();

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

    // Stage 2 Game Over overlay over the board
    const goBg = scene.add.graphics();
    goBg.fillStyle(0x070914, 0.8);
    goBg.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_PIXEL_SIZE, BOARD_PIXEL_SIZE, 12);
    goBg.lineStyle(3, 0xf43f5e, 0.85);
    goBg.strokeRoundedRect(BOARD_X + 180, BOARD_Y + 260, BOARD_PIXEL_SIZE - 360, 392, 20);
    goBg.fillStyle(0x111936, 0.92);
    goBg.fillRoundedRect(BOARD_X + 180, BOARD_Y + 260, BOARD_PIXEL_SIZE - 360, 392, 20);

    const goTitle = scene.add
      .text(BOARD_CENTER_X, BOARD_CENTER_Y - 120, 'GAME OVER', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#fda4af',
      })
      .setOrigin(0.5);

    this.gameOverScoreText = scene.add
      .text(BOARD_CENTER_X, BOARD_CENTER_Y - 24, 'SCORE: 0', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#e0f2fe',
      })
      .setOrigin(0.5);

    this.gameOverStatsText = scene.add
      .text(BOARD_CENTER_X, BOARD_CENTER_Y + 34, 'RINGS: 0   LEVEL: 1', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '24px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    const goPrompt = scene.add
      .text(BOARD_CENTER_X, BOARD_CENTER_Y + 118, '[ENTER / R]  PLAY AGAIN', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#67e8f9',
      })
      .setOrigin(0.5);

    this.gameOverGroup = scene.add.container(0, 0, [
      goBg,
      goTitle,
      this.gameOverScoreText,
      this.gameOverStatsText,
      goPrompt,
    ]);
    this.gameOverGroup.setDepth(30).setVisible(false);
  }

  clearAnimations(): void {
    this.flashes.length = 0;
    this.quickTrails.length = 0;
    this.activeShifts.clear();
    this.shockwaves.length = 0;
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
          delayMs: 90,
          durationMs: 180,
        });
      }
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
      elapsedMs: 0,
      durationMs: 340,
      maxRadius: CELL_SIZE * 2.1,
      color: 0xfef08a,
    });
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

    // 1. Center 4x4 core border (pulses crimson in danger state)
    const centerOffset = CENTER_MIN * CELL_SIZE;
    const centerSize = 4 * CELL_SIZE;
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

    // 2. Advance shift animations & render settled board blocks
    for (const [id, shift] of this.activeShifts.entries()) {
      shift.elapsedMs += dtMs;
      if (shift.elapsedMs >= shift.delayMs + shift.durationMs) {
        this.activeShifts.delete(id);
      }
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = state.board[r][c];
        if (!cell) continue;
        const shift = this.activeShifts.get(cell.id);
        if (shift) {
          const fromPx = cellToPixel(shift.from.r, shift.from.c);
          const toPx = cellToPixel(shift.to.r, shift.to.c);
          let t = 0;
          if (shift.elapsedMs > shift.delayMs) {
            const u = Math.min(1, (shift.elapsedMs - shift.delayMs) / shift.durationMs);
            t = 1 - Math.pow(1 - u, 3);
          }
          const drawX = fromPx.x + (toPx.x - fromPx.x) * t;
          const drawY = fromPx.y + (toPx.y - fromPx.y) * t;
          drawCrystalCell(this.boardGraphics, drawX, drawY, CELL_SIZE, cell.kind, 1);
        } else {
          const { x, y } = cellToPixel(r, c);
          drawCrystalCell(this.boardGraphics, x, y, CELL_SIZE, cell.kind, 1);
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

    // 6. Active ring clear / nova flash cells & expanding shockwaves
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

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.elapsedMs += dtMs;
      if (sw.elapsedMs >= sw.durationMs) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      const progress = sw.elapsedMs / sw.durationMs;
      const radius = CELL_SIZE * 0.3 + (sw.maxRadius - CELL_SIZE * 0.3) * (1 - Math.pow(1 - progress, 2));
      const alpha = (1 - progress) * 0.85;
      this.overlayGraphics.lineStyle(4 * (1 - progress) + 1.5, sw.color, alpha);
      this.overlayGraphics.strokeCircle(sw.cx, sw.cy, radius);
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

    // 8. Stage 2 Game Over overlay
    if (state.phase === 'GAME_OVER') {
      this.gameOverScoreText.setText(`SCORE: ${state.score.toLocaleString()}`);
      this.gameOverStatsText.setText(
        `LINES: ${state.linesCleared}   RINGS: ${state.ringsCleared}   LEVEL: ${state.level}`,
      );
      this.gameOverGroup.setVisible(true);
    } else {
      this.gameOverGroup.setVisible(false);
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
        BOARD_CENTER_Y + uy * 178,
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

    const frame = this.scene.add.graphics();
    frame.lineStyle(4, 0x4cc9f0, 0.4);
    frame.strokeRoundedRect(
      BOARD_X - 12,
      BOARD_Y - 12,
      BOARD_PIXEL_SIZE + 24,
      BOARD_PIXEL_SIZE + 24,
      18,
    );
    frame.lineStyle(1.5, 0xa5f3fc, 0.8);
    frame.strokeRoundedRect(
      BOARD_X - 4,
      BOARD_Y - 4,
      BOARD_PIXEL_SIZE + 8,
      BOARD_PIXEL_SIZE + 8,
      12,
    );

    const grid = this.scene.add.graphics();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const { x, y } = cellToPixel(r, c);
        const ring = getRingIndex(r, c);
        const center = isInCenter(r, c);

        if (center) {
          grid.fillStyle(0x22d3ee, 0.13);
          grid.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
          grid.lineStyle(1, 0x67e8f9, 0.35);
          grid.strokeRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
        } else if (ring !== null) {
          grid.fillStyle(RING_BG_COLORS[ring], 0.1);
          grid.fillRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
          grid.lineStyle(1, RING_BG_COLORS[ring], 0.25);
          grid.strokeRect(x + 3, y + 3, CELL_SIZE - 6, CELL_SIZE - 6);
        }
      }
    }
  }
}
