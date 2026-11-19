import Phaser from 'phaser';
import { t } from '../i18n/i18n';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../render/layout';
import { appStorage } from '../storage/storage';
import { createGlassButton } from './uiHelpers';
import type { GlassButton } from './uiHelpers';

export class ControlsModal {
  private readonly container: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly subtitleText: Phaser.GameObjects.Text;
  private readonly colTitles: Phaser.GameObjects.Text[] = [];
  private readonly colBodies: Phaser.GameObjects.Text[] = [];
  private readonly footerText: Phaser.GameObjects.Text;
  private readonly closeBtn: GlassButton;
  private openState = false;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const w = 1180;
    const h = 620;
    const left = cx - w / 2;
    const top = cy - h / 2;

    const backdrop = scene.add
      .rectangle(cx, cy, CANVAS_WIDTH, CANVAS_HEIGHT, 0x04060f, 0.8)
      .setInteractive();
    backdrop.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        onClose();
      }
    });

    const cardBlock = scene.add.zone(cx, cy, w, h).setInteractive();

    const card = scene.add.graphics();
    card.fillStyle(0x0f172a, 0.95);
    card.fillRoundedRect(left, top, w, h, 24);
    card.lineStyle(2, 0x67e8f9, 0.7);
    card.strokeRoundedRect(left, top, w, h, 24);

    this.titleText = scene.add
      .text(cx, top + 48, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#e0f2fe',
      })
      .setOrigin(0.5);

    this.subtitleText = scene.add
      .text(cx, top + 92, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '19px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    const colW = (w - 112) / 3;
    const colBoxY = top + 136;
    const colBoxH = 336;
    for (let i = 0; i < 3; i++) {
      const bx = left + 44 + i * (colW + 12);
      card.fillStyle(0x16203d, 0.8);
      card.fillRoundedRect(bx, colBoxY, colW, colBoxH, 16);
      card.lineStyle(1.5, 0x334155, 0.85);
      card.strokeRoundedRect(bx, colBoxY, colW, colBoxH, 16);

      const cTitle = scene.add.text(bx + 22, colBoxY + 24, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#67e8f9',
      });
      const cBody = scene.add.text(bx + 22, colBoxY + 68, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '15px',
        lineSpacing: 22,
        color: '#e2e8f0',
      });
      this.colTitles.push(cTitle);
      this.colBodies.push(cBody);
    }

    this.footerText = scene.add
      .text(cx, top + h - 102, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '17px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    this.closeBtn = createGlassButton(
      scene,
      {
        x: cx,
        y: top + h - 46,
        w: 220,
        h: 48,
        label: '',
        fontSize: 18,
      },
      onClose,
    );

    this.container = scene.add
      .container(0, 0, [
        backdrop,
        cardBlock,
        card,
        this.titleText,
        this.subtitleText,
        ...this.colTitles,
        ...this.colBodies,
        this.footerText,
        this.closeBtn.container,
      ])
      .setDepth(60)
      .setVisible(false);

    this.refreshLocale();
  }

  open(): void {
    this.refreshLocale();
    this.openState = true;
    this.container.setVisible(true);
  }

  close(): void {
    this.openState = false;
    this.container.setVisible(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  refreshLocale(): void {
    this.titleText.setText(t('controls.title'));
    this.subtitleText.setText(t('controls.subtitle'));

    this.colTitles[0].setText(t('controls.numpadTitle'));
    this.colBodies[0].setText(t('controls.numpadLines'));
    this.colTitles[1].setText(t('controls.wasdTitle'));
    this.colBodies[1].setText(t('controls.wasdLines'));
    this.colTitles[2].setText(t('controls.mouseTitle'));
    this.colBodies[2].setText(t('controls.mouseLines'));

    this.footerText.setText(t('controls.footer'));
    this.closeBtn.setLabel(t('controls.close'));
  }

  destroy(): void {
    this.container.destroy(true);
  }
}

export class HighScoresModal {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly easyHeaderText: Phaser.GameObjects.Text;
  private readonly hardHeaderText: Phaser.GameObjects.Text;
  private readonly rowsContainer: Phaser.GameObjects.Container;
  private readonly closeBtn: GlassButton;

  private readonly easyPanelOrigin: { x: number; y: number; w: number };
  private readonly hardPanelOrigin: { x: number; y: number; w: number };
  private openState = false;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    this.scene = scene;
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    const w = 1180;
    const h = 640;
    const left = cx - w / 2;
    const top = cy - h / 2;

    const backdrop = scene.add
      .rectangle(cx, cy, CANVAS_WIDTH, CANVAS_HEIGHT, 0x04060f, 0.8)
      .setInteractive();
    backdrop.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        onClose();
      }
    });

    const cardBlock = scene.add.zone(cx, cy, w, h).setInteractive();

    const card = scene.add.graphics();
    card.fillStyle(0x0f172a, 0.95);
    card.fillRoundedRect(left, top, w, h, 24);
    card.lineStyle(2, 0x67e8f9, 0.7);
    card.strokeRoundedRect(left, top, w, h, 24);

    this.titleText = scene.add
      .text(cx, top + 46, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#e0f2fe',
      })
      .setOrigin(0.5);

    const panelW = (w - 108) / 2;
    const panelY = top + 96;
    const panelH = 442;
    const easyX = left + 40;
    const hardX = left + w - 40 - panelW;

    this.easyPanelOrigin = { x: easyX, y: panelY, w: panelW };
    this.hardPanelOrigin = { x: hardX, y: panelY, w: panelW };

    card.fillStyle(0x062c2b, 0.45);
    card.fillRoundedRect(easyX, panelY, panelW, panelH, 16);
    card.lineStyle(1.5, 0x10b981, 0.6);
    card.strokeRoundedRect(easyX, panelY, panelW, panelH, 16);

    card.fillStyle(0x36081a, 0.45);
    card.fillRoundedRect(hardX, panelY, panelW, panelH, 16);
    card.lineStyle(1.5, 0xf43f5e, 0.6);
    card.strokeRoundedRect(hardX, panelY, panelW, panelH, 16);

    this.easyHeaderText = scene.add.text(easyX + 24, panelY + 22, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#6ee7b7',
    });

    this.hardHeaderText = scene.add.text(hardX + 24, panelY + 22, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#fda4af',
    });

    this.rowsContainer = scene.add.container(0, 0);

    this.closeBtn = createGlassButton(
      scene,
      {
        x: cx,
        y: top + h - 46,
        w: 220,
        h: 48,
        label: '',
        fontSize: 18,
      },
      onClose,
    );

    this.container = scene.add
      .container(0, 0, [
        backdrop,
        cardBlock,
        card,
        this.titleText,
        this.easyHeaderText,
        this.hardHeaderText,
        this.rowsContainer,
        this.closeBtn.container,
      ])
      .setDepth(60)
      .setVisible(false);

    this.refreshLocale();
  }

  open(): void {
    this.refreshLocale();
    this.openState = true;
    this.container.setVisible(true);
  }

  close(): void {
    this.openState = false;
    this.container.setVisible(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  refreshLocale(): void {
    this.titleText.setText(t('scores.title'));
    this.easyHeaderText.setText(t('scores.easyHeader'));
    this.hardHeaderText.setText(t('scores.hardHeader'));
    this.closeBtn.setLabel(t('controls.close'));
    this.rebuildRows();
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private rebuildRows(): void {
    this.rowsContainer.removeAll(true);
    this.renderColumn('easy', this.easyPanelOrigin, '#6ee7b7');
    this.renderColumn('hard', this.hardPanelOrigin, '#fda4af');
  }

  private renderColumn(
    difficulty: 'easy' | 'hard',
    origin: { x: number; y: number; w: number },
    accent: string,
  ): void {
    const entries = appStorage.getHighScores(difficulty);
    const headerY = origin.y + 66;

    const cols = [
      { text: t('scores.colRank'), x: origin.x + 24, align: 0 },
      { text: t('scores.colScore'), x: origin.x + 86, align: 0 },
      { text: t('scores.colLv'), x: origin.x + 256, align: 0 },
      { text: t('scores.colClears'), x: origin.x + 324, align: 0 },
      { text: t('scores.colDate'), x: origin.x + origin.w - 24, align: 1 },
    ];
    for (const col of cols) {
      this.rowsContainer.add(
        this.scene.add
          .text(col.x, headerY, col.text, {
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: '15px',
            color: '#94a3b8',
          })
          .setOrigin(col.align, 0),
      );
    }

    if (entries.length === 0) {
      this.rowsContainer.add(
        this.scene.add
          .text(origin.x + origin.w / 2, origin.y + 240, t('scores.empty'), {
            fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
            fontSize: '18px',
            color: '#64748b',
          })
          .setOrigin(0.5),
      );
      return;
    }

    entries.forEach((entry, idx) => {
      const ry = origin.y + 114 + idx * 60;
      const bg = this.scene.add.graphics();
      bg.fillStyle(0x0b1024, idx === 0 ? 0.82 : 0.55);
      bg.fillRoundedRect(origin.x + 18, ry - 8, origin.w - 36, 46, 10);
      if (idx === 0) {
        bg.lineStyle(1, 0xfacc15, 0.5);
        bg.strokeRoundedRect(origin.x + 18, ry - 8, origin.w - 36, 46, 10);
      }
      this.rowsContainer.add(bg);

      const rankColor = idx === 0 ? '#facc15' : accent;
      this.rowsContainer.add(
        this.scene.add.text(origin.x + 28, ry + 4, `#${idx + 1}`, {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: rankColor,
        }),
      );
      this.rowsContainer.add(
        this.scene.add.text(origin.x + 86, ry + 4, entry.score.toLocaleString(), {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#f8fafc',
        }),
      );
      this.rowsContainer.add(
        this.scene.add.text(origin.x + 256, ry + 6, `${entry.level}`, {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '18px',
          color: '#67e8f9',
        }),
      );
      this.rowsContainer.add(
        this.scene.add.text(origin.x + 324, ry + 6, `${entry.linesCleared}/${entry.ringsCleared}`, {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '17px',
          color: '#cbd5e1',
        }),
      );
      this.rowsContainer.add(
        this.scene.add
          .text(origin.x + origin.w - 26, ry + 7, entry.date, {
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: '15px',
            color: '#94a3b8',
          })
          .setOrigin(1, 0),
      );
    });
  }
}
