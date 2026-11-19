import Phaser from 'phaser';
import {
  FLOW_MULTIPLIERS,
  getBestRingProgress,
  getLevelProgress,
  getLocalPieceCells,
} from '../core';
import type { Difficulty, GameStateSnapshot, PieceKind } from '../core';
import { HUD_PANEL, MASCOT_PANEL } from './layout';
import { drawCrystalCell } from './pieceColors';

export interface HudCallbacks {
  onToggleDifficulty(): void;
  onRestart(): void;
  onActivateStarCore(): void;
}

export class HudRenderer {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: HudCallbacks;
  private readonly previewGraphics: Phaser.GameObjects.Graphics;
  private readonly chargeBarGraphics: Phaser.GameObjects.Graphics;
  private readonly levelBarGraphics: Phaser.GameObjects.Graphics;
  private readonly modePillBg: Phaser.GameObjects.Graphics;

  private readonly modeText: Phaser.GameObjects.Text;
  private readonly scoreValueText: Phaser.GameObjects.Text;
  private readonly levelValueText: Phaser.GameObjects.Text;
  private readonly levelProgressText: Phaser.GameObjects.Text;
  private readonly linesValueText: Phaser.GameObjects.Text;
  private readonly ringsValueText: Phaser.GameObjects.Text;
  private readonly flowBadgeText: Phaser.GameObjects.Text;
  private readonly quickBadgeText: Phaser.GameObjects.Text;
  private readonly bestRingBadgeText: Phaser.GameObjects.Text;
  private readonly holdHintText: Phaser.GameObjects.Text;
  private readonly chargeLabelText: Phaser.GameObjects.Text;
  private readonly chargePctText: Phaser.GameObjects.Text;

  private readonly scorePopupAnchor: { x: number; y: number };
  private readonly levelBarPos: { x: number; y: number; w: number; h: number };
  private readonly nextBoxCenter: { x: number; y: number };
  private readonly holdBoxCenter: { x: number; y: number };
  private readonly chargeRect: { x: number; y: number; w: number; h: number };

  private pulseMs = 0;

  constructor(scene: Phaser.Scene, callbacks: HudCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    const px = HUD_PANEL.x;
    const py = HUD_PANEL.y;
    const pw = HUD_PANEL.w;
    const ph = HUD_PANEL.h;

    const panelBg = scene.add.graphics();
    panelBg.fillStyle(0x111936, 0.78);
    panelBg.fillRoundedRect(px, py, pw, ph, 20);
    panelBg.lineStyle(1.5, 0x67e8f9, 0.45);
    panelBg.strokeRoundedRect(px, py, pw, ph, 20);

    // Header
    scene.add.text(px + 28, py + 24, 'ANTIGRAVITY TETRIS', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#e0f2fe',
    });

    // Difficulty Toggle Pill
    const modeX = px + pw - 270;
    const modeY = py + 20;
    const modeW = 122;
    const modeH = 38;
    this.modePillBg = scene.add.graphics();
    this.modeText = scene.add
      .text(modeX + modeW / 2, modeY + modeH / 2, 'EASY', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#6ee7b7',
      })
      .setOrigin(0.5);

    const modeHit = scene.add
      .zone(modeX + modeW / 2, modeY + modeH / 2, modeW, modeH)
      .setInteractive({ useHandCursor: true });
    modeHit.on('pointerdown', () => this.callbacks.onToggleDifficulty());

    // Restart Pill
    const rstX = px + pw - 134;
    const rstY = py + 20;
    const rstW = 106;
    const rstH = 38;
    const rstBg = scene.add.graphics();
    rstBg.fillStyle(0x1e293b, 0.9);
    rstBg.fillRoundedRect(rstX, rstY, rstW, rstH, 10);
    rstBg.lineStyle(1.5, 0x94a3b8, 0.6);
    rstBg.strokeRoundedRect(rstX, rstY, rstW, rstH, 10);

    scene.add
      .text(rstX + rstW / 2, rstY + rstH / 2, 'RESTART', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    const rstHit = scene.add
      .zone(rstX + rstW / 2, rstY + rstH / 2, rstW, rstH)
      .setInteractive({ useHandCursor: true });
    rstHit.on('pointerdown', () => this.callbacks.onRestart());

    // Stats Row
    const statsY = py + 82;
    scene.add.text(px + 28, statsY, 'SCORE', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '16px',
      color: '#94a3b8',
    });
    this.scoreValueText = scene.add.text(px + 28, statsY + 22, '0', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });

    scene.add.text(px + 314, statsY, 'LEVEL', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '16px',
      color: '#94a3b8',
    });
    this.levelValueText = scene.add.text(px + 314, statsY + 22, '1', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#67e8f9',
    });

    scene.add.text(px + 446, statsY, 'LINES', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '16px',
      color: '#94a3b8',
    });
    this.linesValueText = scene.add.text(px + 446, statsY + 22, '0', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#38bdf8',
    });

    scene.add.text(px + 586, statsY, 'RINGS', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '16px',
      color: '#94a3b8',
    });
    this.ringsValueText = scene.add.text(px + 586, statsY + 22, '0', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '38px',
      fontStyle: 'bold',
      color: '#c4b5fd',
    });

    this.scorePopupAnchor = { x: px + 188, y: statsY + 26 };
    this.levelBarPos = { x: px + 314, y: statsY + 67, w: 96, h: 6 };
    this.levelBarGraphics = scene.add.graphics();
    this.levelProgressText = scene.add.text(px + 416, statsY + 61, '0/6', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '13px',
      color: '#94a3b8',
    });

    this.flowBadgeText = scene.add.text(px + 28, statsY + 86, 'FLOW x1.0', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#64748b',
    });
    this.quickBadgeText = scene.add.text(px + 245, statsY + 86, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#facc15',
    });
    this.bestRingBadgeText = scene.add
      .text(px + pw - 28, statsY + 86, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#e879f9',
      })
      .setOrigin(1, 0);

    // NEXT & HOLD boxes
    const boxY = py + 198;
    const boxW = 324;
    const boxH = 178;
    const nextBoxX = px + 28;
    const holdBoxX = px + pw - 28 - boxW;

    const boxesBg = scene.add.graphics();
    boxesBg.fillStyle(0x0b1024, 0.72);
    boxesBg.fillRoundedRect(nextBoxX, boxY, boxW, boxH, 14);
    boxesBg.fillRoundedRect(holdBoxX, boxY, boxW, boxH, 14);
    boxesBg.lineStyle(1.5, 0x334155, 0.8);
    boxesBg.strokeRoundedRect(nextBoxX, boxY, boxW, boxH, 14);
    boxesBg.strokeRoundedRect(holdBoxX, boxY, boxW, boxH, 14);

    scene.add.text(nextBoxX + 18, boxY + 12, 'NEXT', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#94a3b8',
    });
    scene.add.text(holdBoxX + 18, boxY + 12, 'HOLD [C / .]', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#94a3b8',
    });
    this.holdHintText = scene.add
      .text(holdBoxX + boxW - 16, boxY + 12, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '15px',
        color: '#64748b',
      })
      .setOrigin(1, 0);

    this.nextBoxCenter = { x: nextBoxX + boxW / 2, y: boxY + 102 };
    this.holdBoxCenter = { x: holdBoxX + boxW / 2, y: boxY + 102 };
    this.previewGraphics = scene.add.graphics();

    // CHARGE bar
    this.chargeRect = {
      x: px + 28,
      y: py + 400,
      w: pw - 56,
      h: 70,
    };
    this.chargeBarGraphics = scene.add.graphics();

    this.chargeLabelText = scene.add.text(this.chargeRect.x + 18, this.chargeRect.y + 10, 'CHARGE', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#cbd5e1',
    });
    this.chargePctText = scene.add
      .text(this.chargeRect.x + this.chargeRect.w - 18, this.chargeRect.y + 10, '0%', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#67e8f9',
      })
      .setOrigin(1, 0);

    const chargeHit = scene.add
      .zone(
        this.chargeRect.x + this.chargeRect.w / 2,
        this.chargeRect.y + this.chargeRect.h / 2,
        this.chargeRect.w,
        this.chargeRect.h,
      )
      .setInteractive({ useHandCursor: true });
    chargeHit.on('pointerdown', () => this.callbacks.onActivateStarCore());

    this.drawDifficultyPill('easy');
    this.drawControlsPanel(scene);
  }

  showScoreDelta(delta: number, color = '#67e8f9'): void {
    if (delta <= 0) return;
    const text = this.scene.add
      .text(this.scorePopupAnchor.x, this.scorePopupAnchor.y, `+${delta.toLocaleString()}`, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
        stroke: '#070914',
        strokeThickness: 4,
      })
      .setDepth(25);

    this.scene.tweens.add({
      targets: text,
      y: this.scorePopupAnchor.y - 24,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  render(state: GameStateSnapshot, dtMs = 16): void {
    this.pulseMs += dtMs;
    this.drawDifficultyPill(state.difficulty);

    this.scoreValueText.setText(state.score.toLocaleString());
    this.levelValueText.setText(String(state.level));
    this.linesValueText.setText(String(state.linesCleared));
    this.ringsValueText.setText(String(state.ringsCleared));

    // Level progress mini-bar
    const lvlInfo = getLevelProgress(state.linesCleared, state.ringsCleared);
    this.levelBarGraphics.clear();
    this.levelBarGraphics.fillStyle(0x1e293b, 0.9);
    this.levelBarGraphics.fillRoundedRect(
      this.levelBarPos.x,
      this.levelBarPos.y,
      this.levelBarPos.w,
      this.levelBarPos.h,
      3,
    );
    if (lvlInfo.ratio > 0) {
      this.levelBarGraphics.fillStyle(0x67e8f9, 0.9);
      this.levelBarGraphics.fillRoundedRect(
        this.levelBarPos.x,
        this.levelBarPos.y,
        Math.max(4, Math.round(this.levelBarPos.w * lvlInfo.ratio)),
        this.levelBarPos.h,
        3,
      );
    }
    this.levelProgressText.setText(`${lvlInfo.currentPoints}/${lvlInfo.requiredPoints}`);

    const mult = FLOW_MULTIPLIERS[state.flowCombo] ?? 1.0;
    if (state.flowCombo > 0) {
      this.flowBadgeText
        .setText(`FLOW x${mult.toFixed(1)} (${12 - state.piecesSinceLastClear} left)`)
        .setColor('#38bdf8');
    } else {
      this.flowBadgeText.setText('FLOW x1.0').setColor('#64748b');
    }

    if (state.quickStreak >= 2) {
      this.quickBadgeText.setText(`QUICK! x${state.quickStreak}`);
    } else {
      this.quickBadgeText.setText('');
    }

    const bestRing = getBestRingProgress(state.board);
    if (bestRing && bestRing.ratio >= 0.5) {
      this.bestRingBadgeText.setText(`RING ${bestRing.ring}: ${bestRing.filled}/${bestRing.total}`);
    } else {
      this.bestRingBadgeText.setText('');
    }

    // Draw NEXT and HOLD previews
    this.previewGraphics.clear();
    this.drawPiecePreview(state.nextPiece, this.nextBoxCenter.x, this.nextBoxCenter.y, 1);
    if (state.holdPiece) {
      const alpha = state.holdUsedThisTurn ? 0.35 : 1;
      this.drawPiecePreview(state.holdPiece, this.holdBoxCenter.x, this.holdBoxCenter.y, alpha);
      this.holdHintText.setText(state.holdUsedThisTurn ? 'USED' : 'READY');
    } else {
      this.holdHintText.setText('EMPTY');
    }

    // Draw CHARGE bar
    this.drawChargeBar(state);
  }

  private drawDifficultyPill(difficulty: Difficulty): void {
    const px = HUD_PANEL.x;
    const py = HUD_PANEL.y;
    const pw = HUD_PANEL.w;
    const modeX = px + pw - 270;
    const modeY = py + 20;
    const modeW = 122;
    const modeH = 38;

    const isEasy = difficulty === 'easy';
    const borderColor = isEasy ? 0x10b981 : 0xf43f5e;
    const fillColor = isEasy ? 0x064e3b : 0x4c0519;

    this.modePillBg.clear();
    this.modePillBg.fillStyle(fillColor, 0.85);
    this.modePillBg.fillRoundedRect(modeX, modeY, modeW, modeH, 10);
    this.modePillBg.lineStyle(1.5, borderColor, 0.9);
    this.modePillBg.strokeRoundedRect(modeX, modeY, modeW, modeH, 10);

    this.modeText
      .setText(isEasy ? 'EASY' : 'HARD')
      .setColor(isEasy ? '#6ee7b7' : '#fda4af');
  }

  private drawPiecePreview(kind: PieceKind, cx: number, cy: number, alpha: number): void {
    const cells = getLocalPieceCells(kind, 0);
    let minR = 99;
    let maxR = -99;
    let minC = 99;
    let maxC = -99;
    for (const cell of cells) {
      if (cell.r < minR) minR = cell.r;
      if (cell.r > maxR) maxR = cell.r;
      if (cell.c < minC) minC = cell.c;
      if (cell.c > maxC) maxC = cell.c;
    }

    const size = 32;
    const cols = maxC - minC + 1;
    const rows = maxR - minR + 1;
    const originX = cx - (cols * size) / 2 - minC * size;
    const originY = cy - (rows * size) / 2 - minR * size;

    for (const cell of cells) {
      drawCrystalCell(
        this.previewGraphics,
        originX + cell.c * size,
        originY + cell.r * size,
        size,
        kind,
        alpha,
      );
    }
  }

  private drawChargeBar(state: GameStateSnapshot): void {
    const { x, y, w, h } = this.chargeRect;
    const pct = Math.max(0, Math.min(100, state.charge));
    const ready = pct >= 100;
    const coreName = state.difficulty === 'easy' ? 'NOVA BOMB 3x3' : 'STARDUST PIERCER';

    this.chargeBarGraphics.clear();
    this.chargeBarGraphics.fillStyle(0x0b1024, 0.82);
    this.chargeBarGraphics.fillRoundedRect(x, y, w, h, 14);

    if (ready) {
      const pulse = 0.65 + 0.35 * Math.sin(this.pulseMs * 0.01);
      this.chargeBarGraphics.fillStyle(0xfacc15, 0.25 * pulse);
      this.chargeBarGraphics.fillRoundedRect(x + 12, y + 36, w - 24, 22, 8);
      this.chargeBarGraphics.fillStyle(0xec4899, 0.78);
      this.chargeBarGraphics.fillRoundedRect(x + 12, y + 36, w - 24, 22, 8);
      this.chargeBarGraphics.lineStyle(2, 0xfef08a, pulse);
      this.chargeBarGraphics.strokeRoundedRect(x, y, w, h, 14);

      this.chargeLabelText
        .setText(`READY! [SHIFT / / / CLICK] · ${coreName}`)
        .setColor('#fef08a');
      this.chargePctText.setText('100%').setColor('#fef08a');
    } else {
      const barMaxW = w - 24;
      const fillW = Math.round((barMaxW * pct) / 100);
      this.chargeBarGraphics.fillStyle(0x1e293b, 0.85);
      this.chargeBarGraphics.fillRoundedRect(x + 12, y + 36, barMaxW, 22, 8);
      if (fillW > 0) {
        this.chargeBarGraphics.fillStyle(0x38bdf8, 0.9);
        this.chargeBarGraphics.fillRoundedRect(x + 12, y + 36, Math.max(10, fillW), 22, 8);
      }
      this.chargeBarGraphics.lineStyle(1.5, 0x334155, 0.8);
      this.chargeBarGraphics.strokeRoundedRect(x, y, w, h, 14);

      this.chargeLabelText.setText(`STAR CORE CHARGE · ${coreName}`).setColor('#cbd5e1');
      this.chargePctText.setText(`${Math.floor(pct)}%`).setColor('#67e8f9');
    }
  }

  private drawControlsPanel(scene: Phaser.Scene): void {
    const { x, y, w, h } = MASCOT_PANEL;
    const panel = scene.add.graphics();
    panel.fillStyle(0x111936, 0.64);
    panel.fillRoundedRect(x, y, w, h, 20);
    panel.lineStyle(1.5, 0x8b5cf6, 0.45);
    panel.strokeRoundedRect(x, y, w, h, 20);

    scene.add.text(x + 28, y + 22, 'CONTROLS · TRIPLE PARALLEL INPUT', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#c4b5fd',
    });

    scene.add
      .text(x + w - 28, y + 24, 'Gemini AI-chan arrives in Stage 5', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '15px',
        color: '#94a3b8',
      })
      .setOrigin(1, 0);

    const cols = [
      {
        title: 'NUMPAD (8-WAY)',
        lines: [
          '7 8 9 / 4 6 / 1 2 3  Aim & Nudge',
          '5                    Launch / Drop',
          '0 / Enter / + / -    Rotate',
          '.                    Hold',
          '/                    Star Core',
        ],
      },
      {
        title: 'WASD / ARROWS',
        lines: [
          'WASD / Arrows        Aim & Nudge',
          'Enter / F            Launch / Drop',
          'Space / Q E Z X      Rotate',
          'C                    Hold',
          'Shift                Star Core',
        ],
      },
      {
        title: 'MOUSE',
        lines: [
          'Move Around Core     Aim 8-Way',
          'Left Click           Launch / Drop',
          'Right / Wheel        Rotate',
          'Middle / Side        Hold',
          'Click Charge Bar     Star Core',
        ],
      },
    ];

    const colW = (w - 56) / 3;
    cols.forEach((col, i) => {
      const cx = x + 28 + i * colW;
      const cy = y + 74;
      scene.add.text(cx, cy, col.title, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#67e8f9',
      });
      scene.add.text(cx, cy + 32, col.lines.join('\n'), {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '13px',
        lineSpacing: 14,
        color: '#cbd5e1',
      });
    });

    scene.add.text(
      x + 28,
      y + h - 38,
      'R: Quick Restart   ·   Quick Launch <= 0.5s triggers QUICK! bonus & +8% charge',
      {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '15px',
        color: '#94a3b8',
      },
    );
  }
}
