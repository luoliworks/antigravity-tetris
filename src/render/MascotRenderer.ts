import Phaser from 'phaser';
import { t } from '../i18n/i18n';
import { ALL_AI_CHAN_EXPRESSIONS } from '../mascot';
import type { AiChanExpression, AiChanSnapshot } from '../mascot';
import { MASCOT_PANEL } from './layout';

export interface MascotCallbacks {
  onToggleAiCommentary(): void;
  onOpenControls(): void;
}

export interface MoodAccent {
  readonly hex: number;
  readonly css: string;
  readonly bgHex: number;
}

export const MOOD_ACCENT: Record<AiChanExpression, MoodAccent> = {
  smug: { hex: 0x38bdf8, css: '#67e8f9', bgHex: 0x0c2b48 },
  mocking: { hex: 0xc084fc, css: '#d8b4fe', bgHex: 0x2b1747 },
  bored: { hex: 0x94a3b8, css: '#cbd5e1', bgHex: 0x1e293b },
  malicious: { hex: 0xf43f5e, css: '#fda4af', bgHex: 0x450d20 },
  shocked: { hex: 0xfacc15, css: '#fef08a', bgHex: 0x422e08 },
  clap: { hex: 0x34d399, css: '#6ee7b7', bgHex: 0x063d2d },
};

const PORTRAIT_SIZE = 268;
const PORTRAIT_MASK_SIZE = 264;

export function getAiChanTextureKey(expression: AiChanExpression): string {
  return `aichan_${expression}`;
}

export function preloadAiChanAssets(scene: Phaser.Scene): void {
  for (const expr of ALL_AI_CHAN_EXPRESSIONS) {
    const key = getAiChanTextureKey(expr);
    if (!scene.textures.exists(key)) {
      scene.load.image(key, `assets/aichan/${expr}.png`);
    }
  }
}

export class MascotRenderer {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: MascotCallbacks;

  private readonly panelBorderGraphics: Phaser.GameObjects.Graphics;
  private readonly portraitAuraGraphics: Phaser.GameObjects.Graphics;
  private readonly portraitMaskGraphics: Phaser.GameObjects.Graphics;
  private readonly portraitImage: Phaser.GameObjects.Image;

  private readonly nameText: Phaser.GameObjects.Text;
  private readonly moodPillBg: Phaser.GameObjects.Graphics;
  private readonly moodText: Phaser.GameObjects.Text;

  private readonly aiPillBg: Phaser.GameObjects.Graphics;
  private readonly aiPillText: Phaser.GameObjects.Text;
  private readonly controlsPillBg: Phaser.GameObjects.Graphics;
  private readonly controlsPillText: Phaser.GameObjects.Text;

  private readonly bubbleContainer: Phaser.GameObjects.Container;
  private readonly bubbleGraphics: Phaser.GameObjects.Graphics;
  private readonly bubbleText: Phaser.GameObjects.Text;

  private readonly idleContainer: Phaser.GameObjects.Container;
  private readonly idleBoxGraphics: Phaser.GameObjects.Graphics;
  private readonly roleText: Phaser.GameObjects.Text;
  private readonly idleText: Phaser.GameObjects.Text;

  private readonly quickTipText: Phaser.GameObjects.Text;

  private readonly portraitCenter: { x: number; y: number };
  private readonly bubbleOrigin: { x: number; y: number; w: number; h: number };
  private readonly aiPillRect: { x: number; y: number; w: number; h: number };
  private readonly controlsPillRect: { x: number; y: number; w: number; h: number };

  private portraitTween: Phaser.Tweens.Tween | null = null;
  private portraitShakeTween: Phaser.Tweens.Tween | null = null;
  private bubbleSlideTween: Phaser.Tweens.Tween | null = null;

  private lastExpressionVersion = -1;
  private lastBubbleVersion = -1;
  private lastRenderedExpression: AiChanExpression = 'smug';
  private lastRenderedEnabled = true;
  private lastRenderedDanger = false;
  private pulseMs = 0;

  constructor(scene: Phaser.Scene, callbacks: MascotCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;

    const { x, y, w, h } = MASCOT_PANEL;

    const panelBg = scene.add.graphics();
    panelBg.fillStyle(0x111936, 0.78);
    panelBg.fillRoundedRect(x, y, w, h, 20);
    this.panelBorderGraphics = scene.add.graphics();

    // Header: Name + Dynamic Mood Tag
    this.nameText = scene.add.text(x + 28, y + 22, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#e0f2fe',
    });

    this.moodPillBg = scene.add.graphics();
    this.moodText = scene.add
      .text(x + 220, y + 34, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#67e8f9',
      })
      .setOrigin(0.5);

    // Header right pills: AI ON/OFF & CONTROLS
    this.controlsPillRect = { x: x + w - 134, y: y + 18, w: 110, h: 32 };
    this.aiPillRect = { x: x + w - 252, y: y + 18, w: 108, h: 32 };

    this.aiPillBg = scene.add.graphics();
    this.aiPillText = scene.add
      .text(
        this.aiPillRect.x + this.aiPillRect.w / 2,
        this.aiPillRect.y + this.aiPillRect.h / 2,
        '',
        {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#6ee7b7',
        },
      )
      .setOrigin(0.5);

    const aiHit = scene.add
      .zone(
        this.aiPillRect.x + this.aiPillRect.w / 2,
        this.aiPillRect.y + this.aiPillRect.h / 2,
        this.aiPillRect.w,
        this.aiPillRect.h,
      )
      .setInteractive({ useHandCursor: true });
    aiHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.callbacks.onToggleAiCommentary();
      }
    });

    this.controlsPillBg = scene.add.graphics();
    this.controlsPillText = scene.add
      .text(
        this.controlsPillRect.x + this.controlsPillRect.w / 2,
        this.controlsPillRect.y + this.controlsPillRect.h / 2,
        '',
        {
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#e0f2fe',
        },
      )
      .setOrigin(0.5);

    const controlsHit = scene.add
      .zone(
        this.controlsPillRect.x + this.controlsPillRect.w / 2,
        this.controlsPillRect.y + this.controlsPillRect.h / 2,
        this.controlsPillRect.w,
        this.controlsPillRect.h,
      )
      .setInteractive({ useHandCursor: true });
    controlsHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.callbacks.onOpenControls();
      }
    });

    // Portrait Slot (Left)
    this.portraitCenter = { x: x + 158, y: y + 212 };
    this.portraitAuraGraphics = scene.add.graphics();

    this.portraitImage = scene.add
      .image(this.portraitCenter.x, this.portraitCenter.y, getAiChanTextureKey('smug'))
      .setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);

    this.portraitMaskGraphics = scene.make.graphics({}, false);
    this.portraitMaskGraphics.fillStyle(0xffffff, 1);
    this.portraitMaskGraphics.fillRoundedRect(
      this.portraitCenter.x - PORTRAIT_MASK_SIZE / 2,
      this.portraitCenter.y - PORTRAIT_MASK_SIZE / 2,
      PORTRAIT_MASK_SIZE,
      PORTRAIT_MASK_SIZE,
      20,
    );
    this.portraitImage.setMask(this.portraitMaskGraphics.createGeometryMask());

    // Speech Bubble & Idle Readout (Right)
    this.bubbleOrigin = { x: x + 314, y: y + 76, w: 394, h: 246 };

    this.bubbleGraphics = scene.add.graphics();
    this.bubbleText = scene.add
      .text(this.bubbleOrigin.w / 2, this.bubbleOrigin.h / 2, '', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '21px',
        lineSpacing: 10,
        color: '#f8fafc',
        align: 'center',
        wordWrap: { width: this.bubbleOrigin.w - 48, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    this.bubbleContainer = scene.add
      .container(this.bubbleOrigin.x, this.bubbleOrigin.y, [this.bubbleGraphics, this.bubbleText])
      .setVisible(false);

    this.idleBoxGraphics = scene.add.graphics();
    this.roleText = scene.add.text(24, 34, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#67e8f9',
    });
    this.idleText = scene.add.text(24, 72, '', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: '19px',
      lineSpacing: 9,
      color: '#cbd5e1',
      wordWrap: { width: this.bubbleOrigin.w - 48, useAdvancedWrap: true },
    });
    this.idleContainer = scene.add.container(this.bubbleOrigin.x, this.bubbleOrigin.y, [
      this.idleBoxGraphics,
      this.roleText,
      this.idleText,
    ]);

    // Footer tip
    this.quickTipText = scene.add.text(x + 28, y + h - 30, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '13px',
      color: '#94a3b8',
    });

    this.drawControlsPill();
    this.refreshLocale();
  }

  refreshLocale(): void {
    this.nameText.setText(t('mascot.name'));
    this.roleText.setText(t('mascot.role'));
    this.controlsPillText.setText(t('mascot.controlsBtn'));
    this.quickTipText.setText(t('hud.quickTip'));

    this.drawMoodPill(this.lastRenderedExpression);
    this.drawAiPill(this.lastRenderedEnabled);
    this.updateIdleCopy(this.lastRenderedEnabled, this.lastRenderedDanger, this.lastRenderedExpression);
  }

  render(snapshot: AiChanSnapshot, dtMs = 16): void {
    this.pulseMs += dtMs;

    const exprChanged =
      snapshot.expressionVersion !== this.lastExpressionVersion ||
      snapshot.expression !== this.lastRenderedExpression;
    const dangerChanged = snapshot.inDanger !== this.lastRenderedDanger;
    const enabledChanged = snapshot.enabled !== this.lastRenderedEnabled;

    if (exprChanged) {
      this.lastExpressionVersion = snapshot.expressionVersion;
      this.lastRenderedExpression = snapshot.expression;
      this.applyPortraitExpression(snapshot.expression);
      this.drawMoodPill(snapshot.expression);
    }

    if (enabledChanged) {
      this.lastRenderedEnabled = snapshot.enabled;
      this.portraitImage.setAlpha(snapshot.enabled ? 1 : 0.45);
      this.drawAiPill(snapshot.enabled);
    }

    if (dangerChanged) {
      this.lastRenderedDanger = snapshot.inDanger;
    }

    if (exprChanged || dangerChanged || enabledChanged) {
      this.drawPortraitAura(snapshot.expression, snapshot.inDanger, snapshot.enabled);
      this.drawBubbleFrame(snapshot.expression);
      this.drawIdleBox(snapshot.expression, snapshot.enabled);
      this.updateIdleCopy(snapshot.enabled, snapshot.inDanger, snapshot.expression);
    }

    this.drawPanelBorder(snapshot.expression, snapshot.inDanger, snapshot.enabled);

    if (snapshot.bubble) {
      this.idleContainer.setVisible(false);
      this.bubbleContainer.setVisible(true);
      this.bubbleText.setText(snapshot.bubble.text);

      if (snapshot.bubble.version !== this.lastBubbleVersion) {
        this.lastBubbleVersion = snapshot.bubble.version;
        this.bubbleSlideTween?.stop();
        this.bubbleContainer.x = this.bubbleOrigin.x + 12;
        this.bubbleSlideTween = this.scene.tweens.add({
          targets: this.bubbleContainer,
          x: this.bubbleOrigin.x,
          duration: 180,
          ease: 'Cubic.easeOut',
        });
      }

      this.bubbleContainer.setAlpha(snapshot.bubble.alpha);
    } else {
      this.bubbleContainer.setVisible(false);
      this.idleContainer.setVisible(true);
    }
  }

  destroy(): void {
    this.portraitTween?.stop();
    this.portraitShakeTween?.stop();
    this.bubbleSlideTween?.stop();
    this.portraitMaskGraphics.destroy();
  }

  private applyPortraitExpression(expression: AiChanExpression): void {
    this.portraitTween?.stop();
    this.portraitShakeTween?.stop();

    const key = getAiChanTextureKey(expression);
    if (this.scene.textures.exists(key)) {
      this.portraitImage.setTexture(key);
    }

    this.portraitImage.setPosition(this.portraitCenter.x, this.portraitCenter.y);
    this.portraitImage.setAngle(0);
    this.portraitImage.setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);

    const baseScale = this.portraitImage.scaleX;

    switch (expression) {
      case 'shocked':
        this.portraitImage.setScale(baseScale * 1.07);
        this.portraitTween = this.scene.tweens.add({
          targets: this.portraitImage,
          scaleX: baseScale,
          scaleY: baseScale,
          duration: 180,
          ease: 'Cubic.easeOut',
        });
        this.portraitShakeTween = this.scene.tweens.add({
          targets: this.portraitImage,
          x: this.portraitCenter.x + 5,
          duration: 45,
          yoyo: true,
          repeat: 2,
          onComplete: () => {
            this.portraitImage.x = this.portraitCenter.x;
          },
        });
        break;

      case 'malicious':
        this.portraitImage.setScale(baseScale * 1.07);
        this.portraitTween = this.scene.tweens.add({
          targets: this.portraitImage,
          scaleX: baseScale * 1.02,
          scaleY: baseScale * 1.02,
          duration: 240,
          ease: 'Cubic.easeOut',
        });
        break;

      case 'mocking':
      case 'clap':
        this.portraitImage.y = this.portraitCenter.y - 6;
        this.portraitTween = this.scene.tweens.add({
          targets: this.portraitImage,
          y: this.portraitCenter.y,
          duration: 180,
          ease: 'Back.easeOut',
        });
        break;

      case 'smug':
      case 'bored':
        this.portraitImage.setScale(baseScale * 1.04);
        this.portraitTween = this.scene.tweens.add({
          targets: this.portraitImage,
          scaleX: baseScale,
          scaleY: baseScale,
          duration: 180,
          ease: 'Cubic.easeOut',
        });
        break;
    }
  }

  private drawPanelBorder(
    expression: AiChanExpression,
    inDanger: boolean,
    enabled: boolean,
  ): void {
    const { x, y, w, h } = MASCOT_PANEL;
    const accent = MOOD_ACCENT[expression];
    const borderHex = inDanger ? 0xf43f5e : enabled ? accent.hex : 0x475569;
    const borderAlpha = inDanger
      ? 0.55 + 0.35 * Math.sin(this.pulseMs * 0.008)
      : enabled
        ? 0.52
        : 0.35;

    this.panelBorderGraphics.clear();
    this.panelBorderGraphics.lineStyle(inDanger ? 2 : 1.5, borderHex, borderAlpha);
    this.panelBorderGraphics.strokeRoundedRect(x, y, w, h, 20);
  }

  private drawPortraitAura(
    expression: AiChanExpression,
    inDanger: boolean,
    enabled: boolean,
  ): void {
    const { x: cx, y: cy } = this.portraitCenter;
    const accent = MOOD_ACCENT[expression];
    const glowHex = inDanger ? 0xf43f5e : enabled ? accent.hex : 0x475569;

    this.portraitAuraGraphics.clear();
    this.portraitAuraGraphics.fillStyle(glowHex, enabled ? 0.14 : 0.06);
    this.portraitAuraGraphics.fillRoundedRect(
      cx - PORTRAIT_MASK_SIZE / 2 - 6,
      cy - PORTRAIT_MASK_SIZE / 2 - 6,
      PORTRAIT_MASK_SIZE + 12,
      PORTRAIT_MASK_SIZE + 12,
      24,
    );
    this.portraitAuraGraphics.lineStyle(2, glowHex, enabled ? 0.72 : 0.3);
    this.portraitAuraGraphics.strokeRoundedRect(
      cx - PORTRAIT_MASK_SIZE / 2 - 2,
      cy - PORTRAIT_MASK_SIZE / 2 - 2,
      PORTRAIT_MASK_SIZE + 4,
      PORTRAIT_MASK_SIZE + 4,
      21,
    );
  }

  private drawMoodPill(expression: AiChanExpression): void {
    const labelKey = `mascot.mood.${expression}` as const;
    const label = t(labelKey);
    const accent = MOOD_ACCENT[expression];

    this.moodText.setText(label).setColor(accent.css);

    const pillX = this.nameText.x + this.nameText.width + 12;
    const pillY = MASCOT_PANEL.y + 21;
    const pillW = Math.max(76, Math.round(this.moodText.width) + 22);
    const pillH = 26;

    this.moodPillBg.clear();
    this.moodPillBg.fillStyle(accent.bgHex, 0.9);
    this.moodPillBg.fillRoundedRect(pillX, pillY, pillW, pillH, 8);
    this.moodPillBg.lineStyle(1, accent.hex, 0.75);
    this.moodPillBg.strokeRoundedRect(pillX, pillY, pillW, pillH, 8);

    this.moodText.setPosition(pillX + pillW / 2, pillY + pillH / 2);
  }

  private drawAiPill(enabled: boolean): void {
    const { x, y, w, h } = this.aiPillRect;
    this.aiPillBg.clear();
    this.aiPillBg.fillStyle(enabled ? 0x064e3b : 0x1e293b, 0.92);
    this.aiPillBg.fillRoundedRect(x, y, w, h, 9);
    this.aiPillBg.lineStyle(1.5, enabled ? 0x10b981 : 0x64748b, 0.8);
    this.aiPillBg.strokeRoundedRect(x, y, w, h, 9);

    this.aiPillText
      .setText(enabled ? t('mascot.aiOn') : t('mascot.aiOff'))
      .setColor(enabled ? '#6ee7b7' : '#94a3b8');
  }

  private drawControlsPill(): void {
    const { x, y, w, h } = this.controlsPillRect;
    this.controlsPillBg.clear();
    this.controlsPillBg.fillStyle(0x16203d, 0.92);
    this.controlsPillBg.fillRoundedRect(x, y, w, h, 9);
    this.controlsPillBg.lineStyle(1.5, 0x38bdf8, 0.65);
    this.controlsPillBg.strokeRoundedRect(x, y, w, h, 9);
  }

  private drawBubbleFrame(expression: AiChanExpression): void {
    const { w, h } = this.bubbleOrigin;
    const accent = MOOD_ACCENT[expression];

    this.bubbleGraphics.clear();
    // Tail triangle pointing left toward portrait
    this.bubbleGraphics.fillStyle(0x0b1228, 0.92);
    this.bubbleGraphics.fillRoundedRect(0, 0, w, h, 18);
    this.bubbleGraphics.fillTriangle(1, 102, -14, 114, 1, 126);

    this.bubbleGraphics.lineStyle(1.8, accent.hex, 0.78);
    this.bubbleGraphics.strokeRoundedRect(0, 0, w, h, 18);

    // Tail stroke accent
    this.bubbleGraphics.lineStyle(1.8, accent.hex, 0.78);
    this.bubbleGraphics.lineBetween(0, 102, -14, 114);
    this.bubbleGraphics.lineBetween(-14, 114, 0, 126);
  }

  private drawIdleBox(expression: AiChanExpression, enabled: boolean): void {
    const { w, h } = this.bubbleOrigin;
    const accent = MOOD_ACCENT[expression];

    this.idleBoxGraphics.clear();
    this.idleBoxGraphics.fillStyle(0x0b1024, 0.65);
    this.idleBoxGraphics.fillRoundedRect(0, 0, w, h, 18);
    this.idleBoxGraphics.lineStyle(1.2, enabled ? accent.hex : 0x334155, enabled ? 0.35 : 0.65);
    this.idleBoxGraphics.strokeRoundedRect(0, 0, w, h, 18);
  }

  private updateIdleCopy(
    enabled: boolean,
    inDanger: boolean,
    expression: AiChanExpression,
  ): void {
    const accent = MOOD_ACCENT[expression];
    this.roleText.setColor(enabled ? (inDanger ? '#fda4af' : accent.css) : '#64748b');

    if (!enabled) {
      this.idleText.setText(t('mascot.mutedHint')).setColor('#64748b');
    } else if (inDanger) {
      this.idleText.setText(t('mascot.idleDanger')).setColor('#fda4af');
    } else {
      this.idleText.setText(t('mascot.idleNormal')).setColor('#cbd5e1');
    }
  }
}
