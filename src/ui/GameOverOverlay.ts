import Phaser from 'phaser';
import { FLOW_MULTIPLIERS } from '../core';
import type { Difficulty, GameStateSnapshot } from '../core';
import { t } from '../i18n/i18n';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../render/layout';
import type { HighScoreRecordResult } from '../storage/storage';
import { createGlassButton } from './uiHelpers';
import type { GlassButton } from './uiHelpers';

export interface GameOverOverlayCallbacks {
  onPlayAgain(): void;
  onSwitchDifficulty(): void;
  onBackToTitle(): void;
}

export class GameOverOverlay {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly cardContainer: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly newRecordBadge: Phaser.GameObjects.Text;
  private readonly scoreLabelText: Phaser.GameObjects.Text;
  private readonly scoreValueText: Phaser.GameObjects.Text;
  private readonly statLabels: Phaser.GameObjects.Text[] = [];
  private readonly statValues: Phaser.GameObjects.Text[] = [];
  private readonly leaderboardHeaderText: Phaser.GameObjects.Text;
  private readonly leaderboardRowsContainer: Phaser.GameObjects.Container;

  private readonly playAgainBtn: GlassButton;
  private readonly switchDiffBtn: GlassButton;
  private readonly backTitleBtn: GlassButton;

  private openState = false;
  private lastSnapshot: GameStateSnapshot | null = null;
  private lastDifficulty: Difficulty = 'easy';
  private lastResult: HighScoreRecordResult | null = null;

  private readonly rightOrigin: { x: number; y: number; w: number };

  constructor(scene: Phaser.Scene, callbacks: GameOverOverlayCallbacks) {
    this.scene = scene;
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const w = 1120;
    const h = 680;
    const left = cx - w / 2;
    const top = cy - h / 2;

    const backdrop = scene.add
      .rectangle(cx, cy, CANVAS_WIDTH, CANVAS_HEIGHT, 0x04060f, 0.78)
      .setInteractive();

    const cardBg = scene.add.graphics();
    cardBg.fillStyle(0x0f172a, 0.96);
    cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    cardBg.lineStyle(2.5, 0xf43f5e, 0.75);
    cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 24);

    // Inner column panels (relative to cardContainer center)
    const leftColX = -w / 2 + 42;
    const colY = -h / 2 + 124;
    const leftColW = 450;
    const colH = 426;
    const rightColX = leftColX + leftColW + 32;
    const rightColW = w - 84 - leftColW - 32;

    cardBg.fillStyle(0x16203d, 0.78);
    cardBg.fillRoundedRect(leftColX, colY, leftColW, colH, 18);
    cardBg.lineStyle(1.5, 0x334155, 0.85);
    cardBg.strokeRoundedRect(leftColX, colY, leftColW, colH, 18);

    cardBg.fillStyle(0x16203d, 0.78);
    cardBg.fillRoundedRect(rightColX, colY, rightColW, colH, 18);
    cardBg.lineStyle(1.5, 0x334155, 0.85);
    cardBg.strokeRoundedRect(rightColX, colY, rightColW, colH, 18);

    this.rightOrigin = { x: rightColX, y: colY, w: rightColW };

    this.titleText = scene.add
      .text(0, -h / 2 + 56, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#fda4af',
      })
      .setOrigin(0.5);

    this.newRecordBadge = scene.add
      .text(280, -h / 2 + 56, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#0f172a',
        backgroundColor: '#facc15',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.scoreLabelText = scene.add.text(leftColX + 28, colY + 26, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '17px',
      color: '#94a3b8',
    });
    this.scoreValueText = scene.add.text(leftColX + 28, colY + 52, '0', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#f8fafc',
    });

    for (let i = 0; i < 4; i++) {
      const sy = colY + 146 + i * 66;
      const lbl = scene.add.text(leftColX + 28, sy, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '17px',
        color: '#94a3b8',
      });
      const val = scene.add
        .text(leftColX + leftColW - 28, sy, '0', {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#e0f2fe',
        })
        .setOrigin(1, 0);
      this.statLabels.push(lbl);
      this.statValues.push(val);
    }

    this.leaderboardHeaderText = scene.add.text(rightColX + 24, colY + 22, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#67e8f9',
    });
    this.leaderboardRowsContainer = scene.add.container(0, 0);

    const btnY = h / 2 - 58;
    this.playAgainBtn = createGlassButton(
      scene,
      {
        x: -290,
        y: btnY,
        w: 320,
        h: 54,
        label: '',
        fontSize: 20,
        fillColor: 0x0c4a6e,
        hoverFillColor: 0x0369a1,
        borderColor: 0x38bdf8,
        textColor: '#f0f9ff',
      },
      callbacks.onPlayAgain,
    );

    this.switchDiffBtn = createGlassButton(
      scene,
      { x: 64, y: btnY, w: 300, h: 54, label: '', fontSize: 19 },
      callbacks.onSwitchDifficulty,
    );

    this.backTitleBtn = createGlassButton(
      scene,
      { x: 368, y: btnY, w: 220, h: 54, label: '', fontSize: 19 },
      callbacks.onBackToTitle,
    );

    this.cardContainer = scene.add.container(left + w / 2, top + h / 2, [
      cardBg,
      this.titleText,
      this.newRecordBadge,
      this.scoreLabelText,
      this.scoreValueText,
      ...this.statLabels,
      ...this.statValues,
      this.leaderboardHeaderText,
      this.leaderboardRowsContainer,
      this.playAgainBtn.container,
      this.switchDiffBtn.container,
      this.backTitleBtn.container,
    ]);

    this.container = scene.add
      .container(0, 0, [backdrop, this.cardContainer])
      .setDepth(45)
      .setVisible(false);
  }

  show(
    snapshot: GameStateSnapshot,
    difficulty: Difficulty,
    result: HighScoreRecordResult,
  ): void {
    this.lastSnapshot = snapshot;
    this.lastDifficulty = difficulty;
    this.lastResult = result;
    this.openState = true;

    this.refreshLocale();
    this.container.setVisible(true);
    this.cardContainer.setScale(0.94).setAlpha(0);
    this.scene.tweens.add({
      targets: this.cardContainer,
      scale: 1,
      alpha: 1,
      duration: 240,
      ease: 'Cubic.easeOut',
    });
  }

  hide(): void {
    this.openState = false;
    this.container.setVisible(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  refreshLocale(): void {
    this.titleText.setText(t('gameover.title'));
    this.newRecordBadge.setText(t('gameover.newRecord'));
    this.scoreLabelText.setText(t('gameover.finalScore'));

    this.statLabels[0].setText(t('gameover.linesCleared'));
    this.statLabels[1].setText(t('gameover.ringsCleared'));
    this.statLabels[2].setText(t('gameover.maxFlow'));
    this.statLabels[3].setText(t('gameover.quickRate'));

    this.playAgainBtn.setLabel(t('gameover.playAgain'));
    this.switchDiffBtn.setLabel(
      this.lastDifficulty === 'easy'
        ? t('gameover.switchToHard')
        : t('gameover.switchToEasy'),
    );
    this.backTitleBtn.setLabel(t('gameover.backTitle'));

    const modeTag = this.lastDifficulty === 'easy' ? 'EASY' : 'HARD';
    this.leaderboardHeaderText.setText(`${t('gameover.top5Title')} · ${modeTag}`);

    if (!this.lastSnapshot || !this.lastResult) {
      return;
    }

    this.newRecordBadge.setVisible(this.lastResult.isNewRecord);
    this.scoreValueText.setText(this.lastSnapshot.score.toLocaleString());

    const mult = FLOW_MULTIPLIERS[this.lastSnapshot.maxFlowCombo] ?? 1.0;
    const quickPct = Math.round(this.lastSnapshot.quickRate * 100);

    this.statValues[0].setText(String(this.lastSnapshot.linesCleared));
    this.statValues[1].setText(String(this.lastSnapshot.ringsCleared));
    this.statValues[2].setText(`×${mult.toFixed(1)}`);
    this.statValues[3].setText(`${quickPct}%`);

    this.rebuildLeaderboard();
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private rebuildLeaderboard(): void {
    this.leaderboardRowsContainer.removeAll(true);
    if (!this.lastResult) return;

    const entries = this.lastResult.entries;
    const { x, y, w } = this.rightOrigin;

    if (entries.length === 0) {
      this.leaderboardRowsContainer.add(
        this.scene.add
          .text(x + w / 2, y + 210, t('scores.empty'), {
            fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
            fontSize: '18px',
            color: '#64748b',
          })
          .setOrigin(0.5),
      );
      return;
    }

    entries.forEach((entry, idx) => {
      const rank = idx + 1;
      const isCurrent = this.lastResult?.rank === rank;
      const ry = y + 72 + idx * 66;

      const rowBg = this.scene.add.graphics();
      rowBg.fillStyle(isCurrent ? 0x0c4a6e : 0x0b1024, isCurrent ? 0.92 : 0.6);
      rowBg.fillRoundedRect(x + 20, ry, w - 40, 52, 10);
      if (isCurrent) {
        rowBg.lineStyle(2, 0xfacc15, 0.9);
        rowBg.strokeRoundedRect(x + 20, ry, w - 40, 52, 10);
      }
      this.leaderboardRowsContainer.add(rowBg);

      this.leaderboardRowsContainer.add(
        this.scene.add.text(x + 36, ry + 13, `#${rank}`, {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: isCurrent ? '#facc15' : '#67e8f9',
        }),
      );

      this.leaderboardRowsContainer.add(
        this.scene.add.text(x + 96, ry + 13, entry.score.toLocaleString(), {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '21px',
          fontStyle: 'bold',
          color: '#f8fafc',
        }),
      );

      this.leaderboardRowsContainer.add(
        this.scene.add.text(x + 276, ry + 15, `LV ${entry.level}`, {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '17px',
          color: '#a5f3fc',
        }),
      );

      this.leaderboardRowsContainer.add(
        this.scene.add
          .text(x + w - 36, ry + 16, entry.date, {
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: '15px',
            color: '#94a3b8',
          })
          .setOrigin(1, 0),
      );
    });
  }
}
