import Phaser from 'phaser';
import {
  FLOW_MULTIPLIERS,
  getBestRingProgress,
  getLevelProgress,
  getLocalPieceCells,
} from '../core';
import type { Difficulty, GameStateSnapshot, PieceKind } from '../core';
import { t } from '../i18n/i18n';
import { appStorage } from '../storage/storage';
import { HUD_PANEL, MASCOT_PANEL } from './layout';
import { drawCrystalCell } from './pieceColors';

export interface HudCallbacks {
  onToggleDifficulty(): void;
  onToggleLanguage(): void;
  onToggleMute(): void;
  onPause(): void;
  onActivateStarCore(): void;
}

export class HudRenderer {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: HudCallbacks;
  private readonly previewGraphics: Phaser.GameObjects.Graphics;
  private readonly chargeBarGraphics: Phaser.GameObjects.Graphics;
  private readonly levelBarGraphics: Phaser.GameObjects.Graphics;
  private readonly modePillBg: Phaser.GameObjects.Graphics;
  private readonly mutePillBg: Phaser.GameObjects.Graphics;

  private readonly modeText: Phaser.GameObjects.Text;
  private readonly langText: Phaser.GameObjects.Text;
  private readonly muteText: Phaser.GameObjects.Text;
  private readonly pauseText: Phaser.GameObjects.Text;

  private readonly scoreLabelText: Phaser.GameObjects.Text;
  private readonly levelLabelText: Phaser.GameObjects.Text;
  private readonly linesLabelText: Phaser.GameObjects.Text;
  private readonly ringsLabelText: Phaser.GameObjects.Text;
  private readonly nextLabelText: Phaser.GameObjects.Text;
  private readonly holdLabelText: Phaser.GameObjects.Text;

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

  private readonly controlsTitleText: Phaser.GameObjects.Text;
  private readonly mascotSlotText: Phaser.GameObjects.Text;
  private readonly quickTipText: Phaser.GameObjects.Text;
  private readonly colTitleTexts: Phaser.GameObjects.Text[] = [];
  private readonly colBodyTexts: Phaser.GameObjects.Text[] = [];

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

    // Header Title
    scene.add.text(px + 28, py + 24, 'ANTIGRAVITY TETRIS', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#e0f2fe',
    });

    // Difficulty Pill
    const modeX = px + pw - 372;
    const pillY = py + 20;
    const pillH = 36;
    const modeW = 88;
    this.modePillBg = scene.add.graphics();
    this.modeText = scene.add
      .text(modeX + modeW / 2, pillY + pillH / 2, 'EASY', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#6ee7b7',
      })
      .setOrigin(0.5);
    const modeHit = scene.add
      .zone(modeX + modeW / 2, pillY + pillH / 2, modeW, pillH)
      .setInteractive({ useHandCursor: true });
    modeHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.callbacks.onToggleDifficulty();
    });

    // Language Pill
    const langX = px + pw - 274;
    const langW = 86;
    const langBg = scene.add.graphics();
    langBg.fillStyle(0x16203d, 0.9);
    langBg.fillRoundedRect(langX, pillY, langW, pillH, 10);
    langBg.lineStyle(1.5, 0x38bdf8, 0.65);
    langBg.strokeRoundedRect(langX, pillY, langW, pillH, 10);
    this.langText = scene.add
      .text(langX + langW / 2, pillY + pillH / 2, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#e0f2fe',
      })
      .setOrigin(0.5);
    const langHit = scene.add
      .zone(langX + langW / 2, pillY + pillH / 2, langW, pillH)
      .setInteractive({ useHandCursor: true });
    langHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.callbacks.onToggleLanguage();
    });

    // Mute Pill
    const muteX = px + pw - 178;
    const muteW = 74;
    this.mutePillBg = scene.add.graphics();
    this.muteText = scene.add
      .text(muteX + muteW / 2, pillY + pillH / 2, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);
    const muteHit = scene.add
      .zone(muteX + muteW / 2, pillY + pillH / 2, muteW, pillH)
      .setInteractive({ useHandCursor: true });
    muteHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.callbacks.onToggleMute();
    });

    // Pause Pill
    const pauseX = px + pw - 94;
    const pauseW = 70;
    const pauseBg = scene.add.graphics();
    pauseBg.fillStyle(0x1e293b, 0.9);
    pauseBg.fillRoundedRect(pauseX, pillY, pauseW, pillH, 10);
    pauseBg.lineStyle(1.5, 0x94a3b8, 0.6);
    pauseBg.strokeRoundedRect(pauseX, pillY, pauseW, pillH, 10);
    this.pauseText = scene.add
      .text(pauseX + pauseW / 2, pillY + pillH / 2, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5);
    const pauseHit = scene.add
      .zone(pauseX + pauseW / 2, pillY + pillH / 2, pauseW, pillH)
      .setInteractive({ useHandCursor: true });
    pauseHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.callbacks.onPause();
    });

    // Stats Row
    const statsY = py + 82;
    this.scoreLabelText = scene.add.text(px + 28, statsY, '', {
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

    this.levelLabelText = scene.add.text(px + 314, statsY, '', {
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

    this.linesLabelText = scene.add.text(px + 446, statsY, '', {
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

    this.ringsLabelText = scene.add.text(px + 586, statsY, '', {
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

    this.flowBadgeText = scene.add.text(px + 28, statsY + 86, '', {
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

    this.nextLabelText = scene.add.text(nextBoxX + 18, boxY + 12, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#94a3b8',
    });
    this.holdLabelText = scene.add.text(holdBoxX + 18, boxY + 12, '', {
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
      y: py + 402,
      w: pw - 56,
      h: 72,
    };
    this.chargeBarGraphics = scene.add.graphics();

    this.chargeLabelText = scene.add.text(this.chargeRect.x + 18, this.chargeRect.y + 10, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '16px',
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
    chargeHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) this.callbacks.onActivateStarCore();
    });

    // Bottom-right controls panel (Stage 5 AI-chan slot)
    const { x, y, w, h } = MASCOT_PANEL;
    const panel = scene.add.graphics();
    panel.fillStyle(0x111936, 0.64);
    panel.fillRoundedRect(x, y, w, h, 20);
    panel.lineStyle(1.5, 0x8b5cf6, 0.45);
    panel.strokeRoundedRect(x, y, w, h, 20);

    this.controlsTitleText = scene.add.text(x + 28, y + 22, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#c4b5fd',
    });

    this.mascotSlotText = scene.add
      .text(x + w - 28, y + 24, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '14px',
        color: '#94a3b8',
      })
      .setOrigin(1, 0);

    const colW = (w - 56) / 3;
    for (let i = 0; i < 3; i++) {
      const cx = x + 28 + i * colW;
      const cy = y + 72;
      this.colTitleTexts.push(
        scene.add.text(cx, cy, '', {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#67e8f9',
        }),
      );
      this.colBodyTexts.push(
        scene.add.text(cx, cy + 30, '', {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '12px',
          lineSpacing: 13,
          color: '#cbd5e1',
        }),
      );
    }

    this.quickTipText = scene.add.text(x + 28, y + h - 38, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '14px',
      color: '#94a3b8',
    });

    this.drawDifficultyPill('easy');
    this.refreshLocale();
  }

  refreshLocale(): void {
    const prefs = appStorage.getPreferences();

    this.langText.setText(t('title.langToggle'));
    this.pauseText.setText(t('hud.pauseBtn'));
    this.drawMutePill(prefs.muted);

    this.scoreLabelText.setText(t('hud.score'));
    this.levelLabelText.setText(t('hud.level'));
    this.linesLabelText.setText(t('hud.lines'));
    this.ringsLabelText.setText(t('hud.rings'));
    this.nextLabelText.setText(t('hud.next'));
    this.holdLabelText.setText(t('hud.hold'));

    this.controlsTitleText.setText(t('controls.title'));
    this.mascotSlotText.setText(t('hud.mascotSlot'));
    this.quickTipText.setText(t('hud.quickTip'));

    this.colTitleTexts[0].setText(t('controls.numpadTitle'));
    this.colBodyTexts[0].setText(t('controls.numpadLines'));
    this.colTitleTexts[1].setText(t('controls.wasdTitle'));
    this.colBodyTexts[1].setText(t('controls.wasdLines'));
    this.colTitleTexts[2].setText(t('controls.mouseTitle'));
    this.colBodyTexts[2].setText(t('controls.mouseLines'));
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
        .setText(`${t('hud.flow')} ×${mult.toFixed(1)} (${12 - state.piecesSinceLastClear} ${t('hud.left')})`)
        .setColor('#38bdf8');
    } else {
      this.flowBadgeText.setText(`${t('hud.flow')} ×1.0`).setColor('#64748b');
    }

    if (state.quickStreak >= 2) {
      this.quickBadgeText.setText(`${t('callout.quick')} ×${state.quickStreak}`);
    } else {
      this.quickBadgeText.setText('');
    }

    const bestRing = getBestRingProgress(state.board);
    if (bestRing && bestRing.ratio >= 0.5) {
      this.bestRingBadgeText.setText(
        `${t('hud.ring')} ${bestRing.ring}: ${bestRing.filled}/${bestRing.total}`,
      );
    } else {
      this.bestRingBadgeText.setText('');
    }

    // Draw NEXT and HOLD previews
    this.previewGraphics.clear();
    this.drawPiecePreview(state.nextPiece, this.nextBoxCenter.x, this.nextBoxCenter.y, 1);
    if (state.holdPiece) {
      const alpha = state.holdUsedThisTurn ? 0.35 : 1;
      this.drawPiecePreview(state.holdPiece, this.holdBoxCenter.x, this.holdBoxCenter.y, alpha);
      this.holdHintText.setText(state.holdUsedThisTurn ? t('hud.holdUsed') : t('hud.holdReady'));
    } else {
      this.holdHintText.setText(t('hud.holdEmpty'));
    }

    this.drawChargeBar(state);
  }

  private drawDifficultyPill(difficulty: Difficulty): void {
    const px = HUD_PANEL.x;
    const py = HUD_PANEL.y;
    const pw = HUD_PANEL.w;
    const modeX = px + pw - 372;
    const pillY = py + 20;
    const modeW = 88;
    const pillH = 36;

    const isEasy = difficulty === 'easy';
    const borderColor = isEasy ? 0x10b981 : 0xf43f5e;
    const fillColor = isEasy ? 0x064e3b : 0x4c0519;

    this.modePillBg.clear();
    this.modePillBg.fillStyle(fillColor, 0.85);
    this.modePillBg.fillRoundedRect(modeX, pillY, modeW, pillH, 10);
    this.modePillBg.lineStyle(1.5, borderColor, 0.9);
    this.modePillBg.strokeRoundedRect(modeX, pillY, modeW, pillH, 10);

    this.modeText
      .setText(isEasy ? 'EASY' : 'HARD')
      .setColor(isEasy ? '#6ee7b7' : '#fda4af');
  }

  private drawMutePill(muted: boolean): void {
    const px = HUD_PANEL.x;
    const py = HUD_PANEL.y;
    const pw = HUD_PANEL.w;
    const muteX = px + pw - 178;
    const pillY = py + 20;
    const muteW = 74;
    const pillH = 36;

    this.mutePillBg.clear();
    this.mutePillBg.fillStyle(muted ? 0x3b1322 : 0x16203d, 0.9);
    this.mutePillBg.fillRoundedRect(muteX, pillY, muteW, pillH, 10);
    this.mutePillBg.lineStyle(1.5, muted ? 0xf43f5e : 0x67e8f9, 0.65);
    this.mutePillBg.strokeRoundedRect(muteX, pillY, muteW, pillH, 10);

    this.muteText
      .setText(muted ? t('hud.muteOff') : t('hud.muteOn'))
      .setColor(muted ? '#fda4af' : '#e0f2fe');
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
    const coreName = state.difficulty === 'easy' ? t('hud.coreEasy') : t('hud.coreHard');

    this.chargeBarGraphics.clear();
    this.chargeBarGraphics.fillStyle(0x0b1024, 0.82);
    this.chargeBarGraphics.fillRoundedRect(x, y, w, h, 14);

    if (ready) {
      const pulse = 0.65 + 0.35 * Math.sin(this.pulseMs * 0.01);
      this.chargeBarGraphics.fillStyle(0xfacc15, 0.25 * pulse);
      this.chargeBarGraphics.fillRoundedRect(x + 12, y + 38, w - 24, 22, 8);
      this.chargeBarGraphics.fillStyle(0xec4899, 0.78);
      this.chargeBarGraphics.fillRoundedRect(x + 12, y + 38, w - 24, 22, 8);
      this.chargeBarGraphics.lineStyle(2, 0xfef08a, pulse);
      this.chargeBarGraphics.strokeRoundedRect(x, y, w, h, 14);

      this.chargeLabelText
        .setText(`${t('hud.chargeReady')} · ${coreName}`)
        .setColor('#fef08a');
      this.chargePctText.setText('100%').setColor('#fef08a');
    } else {
      const barMaxW = w - 24;
      const fillW = Math.round((barMaxW * pct) / 100);
      this.chargeBarGraphics.fillStyle(0x1e293b, 0.85);
      this.chargeBarGraphics.fillRoundedRect(x + 12, y + 38, barMaxW, 22, 8);
      if (fillW > 0) {
        this.chargeBarGraphics.fillStyle(0x38bdf8, 0.9);
        this.chargeBarGraphics.fillRoundedRect(x + 12, y + 38, Math.max(10, fillW), 22, 8);
      }
      this.chargeBarGraphics.lineStyle(1.5, 0x334155, 0.8);
      this.chargeBarGraphics.strokeRoundedRect(x, y, w, h, 14);

      this.chargeLabelText.setText(`${t('hud.charge')} · ${coreName}`).setColor('#cbd5e1');
      this.chargePctText.setText(`${Math.floor(pct)}%`).setColor('#67e8f9');
    }
  }
}
