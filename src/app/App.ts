import type { Landmark, ParticleModeName, RGB, Vec2 } from "../types";
import { COLORS, FIST, HEART, HEART_COLORS } from "../config";
import { HandTracker } from "../hand/HandTracker";
import {
  getIndexTip,
  fistMetrics,
  pinchAmount,
  isOpenHand,
  isShuttleOpenHand,
  shuttleHandMode,
  type ShuttleBaseHandMode,
  type ShuttleHandMode,
} from "../hand/gestures";
import { landmarkToCanvas } from "../hand/coords";
import { ParticleSystem } from "../particles/ParticleSystem";
import { ExplosionMode } from "../particles/modes/ExplosionMode";
import { VortexMode } from "../particles/modes/VortexMode";
import { HeartMode } from "../particles/modes/HeartMode";
import { ShuttleMode } from "../particles/modes/ShuttleMode";
import type { ParticleMode, ModeContext } from "../particles/modes/ParticleMode";
import { Canvas2DRenderer } from "../render/Canvas2DRenderer";
import { Camera } from "../camera/Camera";
import { Loop } from "./loop";
import { PARTICLES, SHUTTLE, SHUTTLE_DEFAULTS } from "../config";

/** 颜色线性插值（每帧向目标色靠拢，平滑过渡避免突变） */
function lerpColor(c: RGB, target: RGB, t: number): RGB {
  return {
    r: c.r + (target.r - c.r) * t,
    g: c.g + (target.g - c.g) * t,
    b: c.b + (target.b - c.b) * t,
  };
}

export type ShuttleTuningKey =
  | "samplePoints"
  | "outerShellThickness"
  | "heartScale"
  | "heartDepth"
  | "innerScale"
  | "innerDepthScale"
  | "innerPointRatio"
  | "baseRadius"
  | "innerRadiusScale"
  | "trailFadeAlpha"
  | "autoRotateSpeed"
  | "orbitFarRadius";

export type ShuttleTuning = Record<ShuttleTuningKey, number>;

const SHUTTLE_TUNING_KEYS: readonly ShuttleTuningKey[] = [
  "samplePoints",
  "outerShellThickness",
  "heartScale",
  "heartDepth",
  "innerScale",
  "innerDepthScale",
  "innerPointRatio",
  "baseRadius",
  "innerRadiusScale",
  "trailFadeAlpha",
  "autoRotateSpeed",
  "orbitFarRadius",
];

const SHUTTLE_TUNING_STORAGE_KEY = "gesture-particle.shuttle-tuning.v1";

export interface AppCallbacks {
  /** FPS + 模式 + 状态文本更新 */
  onStatus?: (info: {
    fps: number;
    mode: ParticleModeName;
    fist: boolean;
    handPresent: boolean;
    /** 调试：四指伸展比（无手时为 null），用于标定握拳阈值 */
    ratios: number[] | null;
    /** 调试：爱心模式为捏合程度，穿梭模式为手掌远近值，范围 0~1 */
    pinch: number;
    /** 穿梭模式：相机是否处于距离冻结状态 */
    paused: boolean;
    shuttleHandMode: ShuttleHandMode;
  }) => void;
}

/**
 * 主控制器：编排 摄像头→手势→粒子→渲染 的每帧数据流，并维护交互状态机
 * （当前模式、握拳去抖、颜色插值、爱心捏合/爆发逻辑）。
 */
export class App {
  private readonly tracker = new HandTracker();
  private readonly renderer: Canvas2DRenderer;
  private readonly system: ParticleSystem;
  private readonly modes: Record<ParticleModeName, ParticleMode>;
  private readonly heartMode: HeartMode;
  private readonly shuttleMode: ShuttleMode;
  private readonly camera: Camera;
  private readonly loop: Loop;

  private currentModeName: ParticleModeName = "explosion";

  // 握拳去抖状态
  private rawFist = false;
  private stableFist = false;
  private fistStreak = 0;

  // 调试：最近一帧的四指伸展比（无手为 null）
  private lastRatios: number[] | null = null;
  // 最近一帧的原始关键点（无手为 null）+ 骨架可视化开关
  private lastLandmarks: Landmark[] | null = null;
  private showLandmarks = false;
  // 视频帧未推进时复用的上一帧指尖坐标（避免 60/30fps 错配导致的闪烁）
  private lastTip: Vec2 | null = null;

  // 当前发射色（向目标色平滑插值）
  private color: RGB = { ...COLORS.default };

  // 爱心模式：捏合程度与爆发状态
  private lastPinch = 0;
  private lastShuttleDepthAmount = 0.5;
  private lastOpenHand = false;
  private rawShuttleHandMode: ShuttleHandMode = "pause";
  private lastShuttleHandMode: ShuttleHandMode = "pause";
  private shuttleHandCandidateMode: ShuttleHandMode = "pause";
  private shuttleHandCandidateFrames = 0;
  private burstCooldown = 0; // 剩余冷却帧数

  private statusFrame = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    private readonly callbacks: AppCallbacks = {},
  ) {
    this.loadSavedShuttleTuning();
    this.renderer = new Canvas2DRenderer(canvas);
    this.heartMode = new HeartMode();
    this.shuttleMode = new ShuttleMode();
    this.modes = {
      explosion: new ExplosionMode(),
      vortex: new VortexMode(),
      heart: this.heartMode,
      shuttle: this.shuttleMode,
    };
    this.camera = new Camera(
      SHUTTLE.orbitInitRadius,
      this.renderer.width,
      this.renderer.height,
    );
    this.system = new ParticleSystem(this.modes[this.currentModeName]);
    this.loop = new Loop(this.tick);

    window.addEventListener("resize", this.handleResize);
  }

  /** 初始化：开摄像头 + 加载模型。任一步失败抛出，由 main 捕获展示。 */
  async init(): Promise<void> {
    await this.startCamera();
    await this.tracker.init();
  }

  start(): void {
    this.loop.start();
  }

  get mode(): ParticleModeName {
    return this.currentModeName;
  }

  setMode(name: ParticleModeName): void {
    const wasShuttle = this.currentModeName === "shuttle";
    this.currentModeName = name;
    this.system.setMode(this.modes[name]);

    // 进入穿梭模式：重置相机到初始位置，清场并触发粒子汇聚成形
    if (name === "shuttle") {
      this.camera.reset(SHUTTLE.orbitInitRadius);
      this.camera.setRadiusBounds(SHUTTLE.orbitNearRadius, SHUTTLE.orbitFarRadius);
      this.camera.setCanvasSize(this.renderer.width, this.renderer.height);
      this.system.clear();
      this.shuttleMode.activate();
    }

    // 离开穿梭模式：清除长寿命蓝色粒子，重置颜色
    if (wasShuttle && name !== "shuttle") {
      this.system.clear();
      this.color = { ...COLORS.default };
    }
  }

  getShuttleTuning(): ShuttleTuning {
    const values = {} as ShuttleTuning;
    for (const key of SHUTTLE_TUNING_KEYS) {
      values[key] = SHUTTLE[key];
    }
    return values;
  }

  saveCurrentShuttleTuningAsDefault(): void {
    try {
      window.localStorage.setItem(
        SHUTTLE_TUNING_STORAGE_KEY,
        JSON.stringify(this.getShuttleTuning()),
      );
    } catch {
      // Saving presets is a convenience; visual tuning should keep working.
    }
  }

  updateShuttleTuning(
    values: Partial<ShuttleTuning>,
    regenerateTargets = true,
  ): void {
    this.applyShuttleTuningValues(values);

    if (typeof values.orbitFarRadius === "number") {
      this.camera.setRadiusBounds(SHUTTLE.orbitNearRadius, SHUTTLE.orbitFarRadius);
    }

    if (!regenerateTargets) return;
    this.shuttleMode.rebuildTargets();
    if (this.currentModeName === "shuttle") {
      this.system.clear();
      this.shuttleMode.activate();
    }
  }

  resetShuttleTuning(): ShuttleTuning {
    const defaults = this.getSavedShuttleTuningDefaults();
    this.updateShuttleTuning(defaults, true);
    return this.getShuttleTuning();
  }

  private applyShuttleTuningValues(values: Partial<ShuttleTuning>): void {
    const mutableShuttle = SHUTTLE as unknown as Record<ShuttleTuningKey, number>;
    for (const key of SHUTTLE_TUNING_KEYS) {
      const value = values[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        mutableShuttle[key] = value;
      }
    }
  }

  private getSavedShuttleTuningDefaults(): ShuttleTuning {
    const defaults = {} as ShuttleTuning;
    for (const key of SHUTTLE_TUNING_KEYS) {
      defaults[key] = SHUTTLE_DEFAULTS[key];
    }

    try {
      const raw = window.localStorage.getItem(SHUTTLE_TUNING_STORAGE_KEY);
      if (!raw) return defaults;
      const saved = JSON.parse(raw) as Partial<ShuttleTuning>;
      for (const key of SHUTTLE_TUNING_KEYS) {
        const value = saved[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          defaults[key] = value;
        }
      }
    } catch {
      return defaults;
    }

    return defaults;
  }

  private loadSavedShuttleTuning(): void {
    this.applyShuttleTuningValues(this.getSavedShuttleTuningDefaults());
  }

  get landmarksVisible(): boolean {
    return this.showLandmarks;
  }

  /** 开关手部 21 关键点骨架可视化（调试用） */
  setShowLandmarks(visible: boolean): void {
    this.showLandmarks = visible;
  }

  /** 设置状态回调（FPS / 模式 / 手势文本更新） */
  setStatusCallback(cb: AppCallbacks["onStatus"]): void {
    this.callbacks.onStatus = cb;
  }

  private async startCamera(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  private handleResize = (): void => {
    this.renderer.resize();
    this.camera.setCanvasSize(this.renderer.width, this.renderer.height);
    if (this.currentModeName === "shuttle") {
      this.camera.setRadiusBounds(SHUTTLE.orbitNearRadius, SHUTTLE.orbitFarRadius);
    }
  };

  /** 屏幕中心（canvas 像素坐标） */
  private get center(): Vec2 {
    return { x: this.renderer.width / 2, y: this.renderer.height / 2 };
  }

  /** 主循环每帧回调：检测手 → 解算手势 → 驱动粒子 → 渲染 */
  private tick = (dt: number): void => {
    const tip = this.processHand();
    const isHeart = this.currentModeName === "heart";
    const isShuttle = this.currentModeName === "shuttle";

    // ── 颜色 ──────────────────────────────────────────────────────
    // 穿梭模式粒子颜色固定（蓝色，由模式内部设定），不参与颜色插值
    if (!isShuttle) {
      let targetColor: RGB;
      if (isHeart) {
        // 爱心模式：粉(松开) → 红(捏紧)，以捏合程度插值
        targetColor = lerpColor(HEART_COLORS.loose, HEART_COLORS.tight, this.lastPinch);
      } else {
        targetColor = this.stableFist ? COLORS.fist : COLORS.default;
      }
      this.color = lerpColor(this.color, targetColor, COLORS.lerpSpeed);
    }

    // ── 爱心心跳相位推进 ─────────────────────────────────────────
    if (isHeart) {
      this.heartMode.tick(dt);
    }

    // ── 穿梭模式：手势驱动相机环绕 或 无手时自动旋转 ──────────
    if (isShuttle) {
      if (tip) {
        // 有手：手势驱动相机位置和角度
        const fx = tip.x;
        const fy = tip.y;
        const shuttleControlMode = this.rawShuttleHandMode;

        if (shuttleControlMode === "orbit-horizontal") {
          this.camera.freezeRadius();
          this.camera.updateOrbitFromFinger(
            fx,
            fy,
            SHUTTLE.azimuthSensitivity,
            SHUTTLE.elevationSensitivity,
            true,
            false,
          );
        } else if (shuttleControlMode === "orbit-vertical") {
          this.camera.freezeRadius();
          this.camera.updateVerticalOrbitFromHorizontalFinger(
            fx,
            fy,
            SHUTTLE.elevationSensitivity,
          );
        } else if (shuttleControlMode === "pause") {
          this.camera.freezeRadius();
          this.camera.resetFingerTracking();
        } else if (shuttleControlMode === "pull-near") {
          this.camera.updateRadiusFromAmount(
            1,
            SHUTTLE.orbitNearRadius,
            SHUTTLE.orbitFarRadius,
          );
          this.lastShuttleDepthAmount = 1;
          this.camera.resetFingerTracking();
        } else {
          this.camera.updateRadiusFromAmount(
            0,
            SHUTTLE.orbitNearRadius,
            SHUTTLE.orbitFarRadius,
          );
          this.lastShuttleDepthAmount = 0;
          this.camera.resetFingerTracking();
        }
      } else {
        // 无手：自动旋转展示，并重置食指追踪避免重新出现时角度跳变
        this.camera.autoRotate(dt, SHUTTLE.autoRotateSpeed);
        this.camera.resetFingerTracking();
      }
      this.camera.tick(SHUTTLE.radiusLerpSpeed, SHUTTLE.orbitLerpSpeed);
    }

    // ── 爆发冷却计数 ─────────────────────────────────────────────
    if (this.burstCooldown > 0) this.burstCooldown--;

    // ── 爆发判定：五指张开的上升沿（每帧都更新边沿状态，避免冷却期内状态僵死）──
    const openRising = this.lastOpenHand && !this.prevOpenHand;
    this.prevOpenHand = this.lastOpenHand;
    const burst = isHeart && openRising && this.burstCooldown === 0;
    if (burst) this.burstCooldown = HEART.burstCooldownFrames;

    // ── 组装 ModeContext ──────────────────────────────────────────
    const ctx: ModeContext = {
      origin: tip,
      center: this.center,
      pinch: this.lastPinch,
      burst,
      dt,
    };

    // ── 发射 + 更新 ───────────────────────────────────────────────
    // 爱心/穿梭模式：始终发射（模式内部控制目标量/一次性汇聚）；其他：有手才发射
    if (isHeart || isShuttle || tip) {
      this.system.emit(ctx, this.color);
    }
    // 穿梭模式忽略 damping（位置插值不用阻尼，见 ParticleSystem.update 的 is3D 分支）
    let damping: number = PARTICLES.damping;
    if (isHeart) damping = HEART.damping;
    this.system.update(ctx, damping);

    // ── 渲染 ──────────────────────────────────────────────────────
    if (isShuttle) {
      this.renderer.beginFrame(SHUTTLE.trailFadeAlpha);
    } else {
      this.renderer.beginFrame();
    }
    if (isShuttle) {
      this.renderer.drawParticles3D(this.system.particles, this.camera);
    } else {
      this.renderer.drawParticles(this.system.particles);
    }
    if (this.showLandmarks && this.lastLandmarks) {
      const pts = this.lastLandmarks.map((lm) =>
        landmarkToCanvas(lm, this.renderer.width, this.renderer.height),
      );
      this.renderer.drawHand(pts);
    }

    this.reportStatus(tip !== null);
  };

  /**
   * 检测当前帧的手，返回指尖 canvas 坐标（无手返回 null），
   * 并更新握拳去抖、捏合/远近程度、张开状态。
   */
  private prevOpenHand = false;

  private processHand(): Vec2 | null {
    const landmarks = this.tracker.detect(this.video, performance.now());

    if (landmarks === "stale") {
      return this.lastTip;
    }

    if (!landmarks) {
      this.updateFistDebounce(false);
      this.lastRatios = null;
      this.lastLandmarks = null;
      this.lastTip = null;
      this.lastPinch = 0;
      this.lastShuttleDepthAmount = 0.5;
      this.lastOpenHand = false;
      this.rawShuttleHandMode = "pause";
      this.lastShuttleHandMode = "pause";
      this.shuttleHandCandidateMode = "pause";
      this.shuttleHandCandidateFrames = 0;
      return null;
    }

    const metrics = fistMetrics(landmarks);
    this.rawFist = metrics.fist;
    this.lastRatios = metrics.ratios;
    this.lastLandmarks = landmarks;
    this.updateFistDebounce(this.rawFist);

    this.lastPinch = pinchAmount(landmarks);
    this.lastOpenHand =
      this.currentModeName === "shuttle"
        ? isShuttleOpenHand(landmarks)
        : isOpenHand(landmarks);
    const shuttleMode = this.resolveShuttleHandMode(shuttleHandMode(landmarks));
    this.rawShuttleHandMode = shuttleMode;
    if (this.isShuttleOrbitMode(shuttleMode)) {
      this.camera.freezeRadius();
    }
    this.updateShuttleHandMode(shuttleMode);

    this.lastTip = getIndexTip(landmarks, this.renderer.width, this.renderer.height);
    return this.lastTip;
  }

  /** 握拳去抖：原始判定需连续 debounceFrames 帧一致才翻转稳定状态 */
  private updateFistDebounce(raw: boolean): void {
    if (raw === this.stableFist) {
      this.fistStreak = 0;
      return;
    }
    this.fistStreak++;
    if (this.fistStreak >= FIST.debounceFrames) {
      this.stableFist = raw;
      this.fistStreak = 0;
    }
  }

  private resolveShuttleHandMode(baseMode: ShuttleBaseHandMode): ShuttleHandMode {
    if (baseMode !== "radius") return baseMode;

    if (this.lastOpenHand) return "push-far";
    if (this.stableFist) return "pull-near";
    return "pause";
  }

  private isShuttleOrbitMode(mode: ShuttleHandMode): boolean {
    return mode === "orbit-horizontal" || mode === "orbit-vertical";
  }

  private updateShuttleHandMode(candidate: ShuttleHandMode): void {
    if (candidate === this.lastShuttleHandMode) {
      this.shuttleHandCandidateMode = candidate;
      this.shuttleHandCandidateFrames = 0;
      return;
    }

    if (candidate === this.shuttleHandCandidateMode) {
      this.shuttleHandCandidateFrames++;
    } else {
      this.shuttleHandCandidateMode = candidate;
      this.shuttleHandCandidateFrames = 1;
    }

    const requiredFrames = candidate === "pause" ? 3 : 2;
    if (this.shuttleHandCandidateFrames >= requiredFrames) {
      this.lastShuttleHandMode = candidate;
      this.shuttleHandCandidateFrames = 0;
    }
  }

  /** 每若干帧上报一次状态（FPS 等），避免每帧触发 DOM 更新 */
  private reportStatus(handPresent: boolean): void {
    if (!this.callbacks.onStatus) return;
    if (this.statusFrame++ % 10 !== 0) return;
    this.callbacks.onStatus({
      fps: Math.round(this.loop.getFps()),
      mode: this.currentModeName,
      fist: this.stableFist,
      handPresent,
      ratios: this.lastRatios,
      pinch:
        this.currentModeName === "shuttle"
          ? this.lastShuttleDepthAmount
          : this.lastPinch,
      paused:
        this.currentModeName === "shuttle" &&
        this.lastShuttleHandMode === "pause",
      shuttleHandMode: this.lastShuttleHandMode,
    });
  }
}
