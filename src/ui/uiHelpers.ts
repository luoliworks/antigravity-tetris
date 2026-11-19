import Phaser from 'phaser';
import { audioEngine } from '../audio';

export interface GlassButtonOptions {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  fontSize?: number;
  fillColor?: number;
  hoverFillColor?: number;
  borderColor?: number;
  textColor?: string;
  radius?: number;
  fontFamily?: string;
}

export interface GlassButton {
  container: Phaser.GameObjects.Container;
  text: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  setLabel(label: string): void;
  setColors(fillColor: number, borderColor: number, textColor: string, hoverFillColor?: number): void;
}

export function createGlassButton(
  scene: Phaser.Scene,
  opts: GlassButtonOptions,
  onClick: () => void,
): GlassButton {
  const radius = opts.radius ?? 12;
  let fillColor = opts.fillColor ?? 0x16203d;
  let hoverFillColor = opts.hoverFillColor ?? 0x21315c;
  let borderColor = opts.borderColor ?? 0x67e8f9;
  let textColor = opts.textColor ?? '#e0f2fe';

  const bg = scene.add.graphics();
  const drawBg = (hovered: boolean) => {
    bg.clear();
    bg.fillStyle(hovered ? hoverFillColor : fillColor, hovered ? 0.94 : 0.85);
    bg.fillRoundedRect(-opts.w / 2, -opts.h / 2, opts.w, opts.h, radius);
    bg.lineStyle(hovered ? 2 : 1.5, borderColor, hovered ? 1 : 0.72);
    bg.strokeRoundedRect(-opts.w / 2, -opts.h / 2, opts.w, opts.h, radius);
  };
  drawBg(false);

  const text = scene.add
    .text(0, 0, opts.label, {
      fontFamily: opts.fontFamily ?? 'ui-monospace, Consolas, monospace',
      fontSize: `${opts.fontSize ?? 20}px`,
      fontStyle: 'bold',
      color: textColor,
    })
    .setOrigin(0.5);

  const zone = scene.add
    .zone(0, 0, opts.w, opts.h)
    .setInteractive({ useHandCursor: true });

  zone.on('pointerover', () => drawBg(true));
  zone.on('pointerout', () => drawBg(false));
  zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.button === 0) {
      audioEngine.unlock();
      audioEngine.playUiClick();
      onClick();
    }
  });

  const container = scene.add.container(opts.x, opts.y, [bg, text, zone]);

  return {
    container,
    text,
    zone,
    setLabel(label: string) {
      text.setText(label);
    },
    setColors(fill: number, border: number, txt: string, hoverFill?: number) {
      fillColor = fill;
      borderColor = border;
      textColor = txt;
      hoverFillColor = hoverFill ?? fill;
      text.setColor(txt);
      drawBg(false);
    },
  };
}

export interface VolumeSlider {
  container: Phaser.GameObjects.Container;
  setValue(val: number): void;
}

export function createVolumeSlider(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  initialValue: number,
  accentColor: number,
  onChange: (val: number) => void,
): VolumeSlider {
  const g = scene.add.graphics();
  const pctText = scene.add
    .text(x + w + 16, y, `${Math.round(initialValue * 100)}%`, {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#cbd5e1',
    })
    .setOrigin(0, 0.5);

  let current = Math.min(1, Math.max(0, initialValue));

  const redraw = () => {
    g.clear();
    const trackH = 10;
    g.fillStyle(0x1e293b, 0.95);
    g.fillRoundedRect(x, y - trackH / 2, w, trackH, 5);

    const fillW = Math.round(w * current);
    if (fillW > 0) {
      g.fillStyle(accentColor, 0.9);
      g.fillRoundedRect(x, y - trackH / 2, Math.max(6, fillW), trackH, 5);
    }

    const thumbX = x + fillW;
    g.fillStyle(0xf8fafc, 1);
    g.fillCircle(thumbX, y, 10);
    g.lineStyle(2, accentColor, 1);
    g.strokeCircle(thumbX, y, 10);

    pctText.setText(`${Math.round(current * 100)}%`);
  };

  redraw();

  const hit = scene.add
    .zone(x + w / 2, y, w + 24, 34)
    .setInteractive({ useHandCursor: true });

  const updateFromPointer = (pointer: Phaser.Input.Pointer) => {
    const next = Math.min(1, Math.max(0, (pointer.x - x) / w));
    if (Math.abs(next - current) > 0.005) {
      current = next;
      redraw();
      onChange(current);
    }
  };

  let dragging = false;
  hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    if (pointer.button === 0) {
      dragging = true;
      updateFromPointer(pointer);
    }
  });
  const onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (dragging && pointer.isDown) {
      updateFromPointer(pointer);
    }
  };
  const onPointerUp = () => {
    dragging = false;
  };
  scene.input.on('pointermove', onPointerMove);
  scene.input.on('pointerup', onPointerUp);

  const container = scene.add.container(0, 0, [g, pctText, hit]);
  container.once('destroy', () => {
    scene.input.off('pointermove', onPointerMove);
    scene.input.off('pointerup', onPointerUp);
  });

  return {
    container,
    setValue(val: number) {
      current = Math.min(1, Math.max(0, val));
      redraw();
    },
  };
}
