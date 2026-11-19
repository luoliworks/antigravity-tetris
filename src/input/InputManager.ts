import type Phaser from 'phaser';
import type { CardinalDir, Direction8, GamePhase } from '../core';
import { BOARD_CENTER_X, BOARD_CENTER_Y, HUD_PANEL, isPointInBoard } from '../render/layout';
import {
  angleToDirection8,
  dir8ToFlightNudge,
  heldCardinalsToDirection8,
  isSoftDropDirection,
  numpadCodeToDirection8,
} from './inputHelpers';

export interface InputCallbacks {
  getPhase(): GamePhase;
  getFlightDirection(): Direction8 | null;
  onAim(dir: Direction8): void;
  onRotate(delta: 1 | -1): void;
  onLaunchOrHardDrop(): void;
  onNudge(dir: CardinalDir): void;
  onSoftDropChange(active: boolean): void;
  onHold(): void;
  onActivateStarCore(): void;
  onRestart(): void;
}

const KEY_TO_CARDINAL: Record<string, CardinalDir> = {
  KeyW: 'N',
  ArrowUp: 'N',
  KeyS: 'S',
  ArrowDown: 'S',
  KeyA: 'W',
  ArrowLeft: 'W',
  KeyD: 'E',
  ArrowRight: 'E',
};

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'Enter',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Numpad0',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'Numpad7',
  'Numpad8',
  'Numpad9',
  'NumpadEnter',
  'NumpadAdd',
  'NumpadSubtract',
  'NumpadDecimal',
  'NumpadDivide',
]);

const DAS_MS = 140;
const ARR_MS = 60;
const WHEEL_DEBOUNCE_MS = 60;

export class InputManager {
  private readonly scene: Phaser.Scene;
  private readonly callbacks: InputCallbacks;
  private readonly canvas: HTMLCanvasElement;

  private readonly heldHoverCardinals = new Map<string, CardinalDir>();
  private readonly flightPressedCodes = new Map<string, Direction8>();
  private activeFlightNudgeCode: string | null = null;
  private activeFlightNudgeDir: CardinalDir | null = null;
  private nudgeDasElapsedMs = 0;
  private nudgeArrElapsedMs = 0;
  private softDropActive = false;

  private lastPointerX = -1;
  private lastPointerY = -1;
  private lastWheelTime = 0;

  private readonly handleKeyDownBound: (e: KeyboardEvent) => void;
  private readonly handleKeyUpBound: (e: KeyboardEvent) => void;
  private readonly handleBlurBound: () => void;
  private readonly handleContextMenuBound: (e: MouseEvent) => void;
  private readonly handleMouseDownCanvasBound: (e: MouseEvent) => void;

  constructor(scene: Phaser.Scene, callbacks: InputCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.canvas = scene.game.canvas;

    this.handleKeyDownBound = this.onKeyDown.bind(this);
    this.handleKeyUpBound = this.onKeyUp.bind(this);
    this.handleBlurBound = this.onBlur.bind(this);
    this.handleContextMenuBound = (e: MouseEvent) => e.preventDefault();
    this.handleMouseDownCanvasBound = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', this.handleKeyDownBound);
    window.addEventListener('keyup', this.handleKeyUpBound);
    window.addEventListener('blur', this.handleBlurBound);
    this.canvas.addEventListener('contextmenu', this.handleContextMenuBound);
    this.canvas.addEventListener('mousedown', this.handleMouseDownCanvasBound);

    this.scene.input.mouse?.disableContextMenu();
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('wheel', this.onWheel, this);
  }

  resetFlightHolds(): void {
    this.flightPressedCodes.clear();
    this.activeFlightNudgeCode = null;
    this.activeFlightNudgeDir = null;
    this.nudgeDasElapsedMs = 0;
    this.nudgeArrElapsedMs = 0;
    if (this.softDropActive) {
      this.softDropActive = false;
      this.callbacks.onSoftDropChange(false);
    }
  }

  update(dtMs: number): void {
    const phase = this.callbacks.getPhase();
    if (phase !== 'FLIGHT' && phase !== 'LOCK_DELAY') {
      if (this.flightPressedCodes.size > 0 || this.softDropActive) {
        this.resetFlightHolds();
      }
      return;
    }

    if (!this.activeFlightNudgeDir) {
      return;
    }

    if (this.nudgeDasElapsedMs < DAS_MS) {
      this.nudgeDasElapsedMs += dtMs;
      if (this.nudgeDasElapsedMs >= DAS_MS) {
        this.nudgeArrElapsedMs = this.nudgeDasElapsedMs - DAS_MS;
        this.callbacks.onNudge(this.activeFlightNudgeDir);
      }
      return;
    }

    this.nudgeArrElapsedMs += dtMs;
    while (this.nudgeArrElapsedMs >= ARR_MS) {
      this.nudgeArrElapsedMs -= ARR_MS;
      this.callbacks.onNudge(this.activeFlightNudgeDir);
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDownBound);
    window.removeEventListener('keyup', this.handleKeyUpBound);
    window.removeEventListener('blur', this.handleBlurBound);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenuBound);
    this.canvas.removeEventListener('mousedown', this.handleMouseDownCanvasBound);

    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('wheel', this.onWheel, this);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (PREVENT_DEFAULT_CODES.has(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) {
      return;
    }

    const phase = this.callbacks.getPhase();

    if (e.code === 'KeyR' || (phase === 'GAME_OVER' && (e.code === 'Enter' || e.code === 'NumpadEnter'))) {
      this.callbacks.onRestart();
      return;
    }

    if (e.code === 'Enter' || e.code === 'KeyF' || e.code === 'Numpad5') {
      this.callbacks.onLaunchOrHardDrop();
      return;
    }

    if (
      e.code === 'Space' ||
      e.code === 'KeyE' ||
      e.code === 'KeyX' ||
      e.code === 'Numpad0' ||
      e.code === 'NumpadEnter' ||
      e.code === 'NumpadAdd'
    ) {
      this.callbacks.onRotate(1);
      return;
    }

    if (e.code === 'KeyQ' || e.code === 'KeyZ' || e.code === 'NumpadSubtract') {
      this.callbacks.onRotate(-1);
      return;
    }

    if (e.code === 'KeyC' || e.code === 'NumpadDecimal') {
      this.callbacks.onHold();
      return;
    }

    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'NumpadDivide') {
      this.callbacks.onActivateStarCore();
      return;
    }

    const cardinal = KEY_TO_CARDINAL[e.code];
    const numpadDir = numpadCodeToDirection8(e.code);

    if (cardinal) {
      this.heldHoverCardinals.set(e.code, cardinal);
    }

    if (phase === 'HOVER') {
      if (numpadDir) {
        this.callbacks.onAim(numpadDir);
      } else if (cardinal) {
        const combined = heldCardinalsToDirection8(new Set(this.heldHoverCardinals.values()));
        if (combined) {
          this.callbacks.onAim(combined);
        }
      }
      return;
    }

    if (phase === 'FLIGHT' || phase === 'LOCK_DELAY') {
      const flightDir = this.callbacks.getFlightDirection();
      if (!flightDir) {
        return;
      }

      const inputDir: Direction8 | null = numpadDir ?? cardinal ?? null;
      if (!inputDir) {
        return;
      }

      this.flightPressedCodes.set(e.code, inputDir);
      this.reconcileFlightInputs(flightDir, e.code, inputDir);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (KEY_TO_CARDINAL[e.code]) {
      this.heldHoverCardinals.delete(e.code);
    }

    if (this.flightPressedCodes.has(e.code)) {
      this.flightPressedCodes.delete(e.code);
      const flightDir = this.callbacks.getFlightDirection();
      this.syncSoftDropState(flightDir);

      if (this.activeFlightNudgeCode === e.code) {
        this.activeFlightNudgeCode = null;
        this.activeFlightNudgeDir = null;
        this.nudgeDasElapsedMs = 0;
        this.nudgeArrElapsedMs = 0;

        if (flightDir) {
          for (const [code, dir] of this.flightPressedCodes.entries()) {
            const nudgeDir = dir8ToFlightNudge(flightDir, dir);
            if (nudgeDir) {
              this.activeFlightNudgeCode = code;
              this.activeFlightNudgeDir = nudgeDir;
              break;
            }
          }
        }
      }
    }
  }

  private reconcileFlightInputs(
    flightDir: Direction8,
    pressedCode: string,
    inputDir: Direction8,
  ): void {
    this.syncSoftDropState(flightDir);

    const nudgeDir = dir8ToFlightNudge(flightDir, inputDir);
    if (nudgeDir) {
      this.activeFlightNudgeCode = pressedCode;
      this.activeFlightNudgeDir = nudgeDir;
      this.nudgeDasElapsedMs = 0;
      this.nudgeArrElapsedMs = 0;
      this.callbacks.onNudge(nudgeDir);
    }
  }

  private syncSoftDropState(flightDir: Direction8 | null): void {
    let wantSoftDrop = false;
    if (flightDir) {
      // Check direct numpad or single matching dir
      for (const dir of this.flightPressedCodes.values()) {
        if (isSoftDropDirection(flightDir, dir)) {
          wantSoftDrop = true;
          break;
        }
      }
      // Also support WASD/Arrow diagonal chord held freshly in flight matching diagonal flight
      if (!wantSoftDrop) {
        const flightCardinalSet = new Set<CardinalDir>();
        for (const [code, dir] of this.flightPressedCodes.entries()) {
          if (KEY_TO_CARDINAL[code] && (dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W')) {
            flightCardinalSet.add(dir);
          }
        }
        const combined = heldCardinalsToDirection8(flightCardinalSet);
        if (combined && isSoftDropDirection(flightDir, combined)) {
          wantSoftDrop = true;
        }
      }
    }

    if (wantSoftDrop !== this.softDropActive) {
      this.softDropActive = wantSoftDrop;
      this.callbacks.onSoftDropChange(wantSoftDrop);
    }
  }

  private onBlur(): void {
    this.heldHoverCardinals.clear();
    this.resetFlightHolds();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const moved = Math.hypot(pointer.x - this.lastPointerX, pointer.y - this.lastPointerY);
    if (moved < 2) {
      return;
    }
    this.lastPointerX = pointer.x;
    this.lastPointerY = pointer.y;

    if (this.callbacks.getPhase() !== 'HOVER') {
      return;
    }
    if (pointer.x >= HUD_PANEL.x - 20) {
      return;
    }

    const dir = angleToDirection8(pointer.x - BOARD_CENTER_X, pointer.y - BOARD_CENTER_Y);
    if (dir) {
      this.callbacks.onAim(dir);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.button === 0) {
      if (isPointInBoard(pointer.x, pointer.y)) {
        this.callbacks.onLaunchOrHardDrop();
      }
      return;
    }
    if (pointer.button === 2) {
      this.callbacks.onRotate(1);
      return;
    }
    if (pointer.button === 1 || pointer.button === 3 || pointer.button === 4) {
      this.callbacks.onHold();
    }
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _currentlyOver: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void {
    if (deltaY === 0) {
      return;
    }
    const now = performance.now();
    if (now - this.lastWheelTime < WHEEL_DEBOUNCE_MS) {
      return;
    }
    this.lastWheelTime = now;
    this.callbacks.onRotate(deltaY > 0 ? 1 : -1);
  }
}
