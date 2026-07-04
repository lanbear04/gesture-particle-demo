import type { ModeContext, ParticleMode } from "./ParticleMode";
import type { Particle } from "../Particle";
import type { RGB, Vec3 } from "../../types";
import { SHUTTLE } from "../../config";

type ShuttleTarget = Vec3 & {
  color: RGB;
  radiusScale: number;
};

/**
 * 穿梭模式：真 3D 透视，相机环绕一个静态蓝色心形粒子云。
 *
 * 与其他模式根本不同——粒子不持续从指尖发射，而是一次性在 3D 世界空间中
 * 拼成固定的心形：
 * - 进入模式时，所有粒子从四散位置「飞入」各自的心形目标点（位置插值汇聚成形）。
 * - 之后粒子静止（位置精确等于目标点，速度恒为 0）。
 * - 握拳/五指张开控制相机环绕半径（远近），食指控制环绕角度（视角），均在 App 里读取
 *   并喂给 Camera；本模式只负责粒子的 3D 位置收敛与保持。
 * - 景深虚化在渲染器里按投影深度做（远离焦平面变暗变小），本模式不涉及相机。
 */
export class ShuttleMode implements ParticleMode {
  readonly name = "shuttle";

  /** 预采样的 3D 心形目标点（世界坐标，原点为中心，+y 向上） */
  private targets: readonly ShuttleTarget[] = [];

  /** 进入模式后是否还需要生成粒子（一次性汇聚） */
  private needsSpawn = false;

  constructor() {
    this.rebuildTargets();
  }

  rebuildTargets(): void {
    const totalCount = Math.round(SHUTTLE.samplePoints);
    const innerCount = Math.round(totalCount * SHUTTLE.innerPointRatio);
    const outerCount = Math.max(0, totalCount - innerCount);

    this.targets = [
      ...ShuttleMode.sampleHeartShell3D(
        outerCount,
        SHUTTLE.heartScale,
        SHUTTLE.heartDepth,
        SHUTTLE.color,
        1,
        SHUTTLE.outerShellThickness,
      ),
      ...ShuttleMode.sampleHeartSolid3D(
        innerCount,
        SHUTTLE.heartScale * SHUTTLE.innerScale,
        SHUTTLE.heartDepth * SHUTTLE.innerDepthScale,
        SHUTTLE.innerColor,
        SHUTTLE.innerRadiusScale,
      ),
    ];
  }

  /**
   * Sample points inside an implicit 3D heart volume.
   *
   * The old version sampled only the classic 2D parametric heart outline and
   * added a little z jitter, so mode 4 looked like a contour. This version uses
   * the standard implicit heart body and rejection-samples its interior:
   *
   *   (x^2 + 9/4 d^2 + y^2 - 1)^3 - x^2 y^3 - 9/80 d^2 y^3 <= 0
   *
   * x = horizontal, y = vertical, d = depth. The returned world coordinates use
   * +y as up and z as depth, matching Camera.project().
   */
  private static sampleHeartSolid3D(
    n: number,
    scale: number,
    depth: number,
    color: RGB,
    radiusScale: number,
  ): ShuttleTarget[] {
    const pts: ShuttleTarget[] = [];

    const maxAttempts = n * 220;
    let attempts = 0;
    while (pts.length < n && attempts++ < maxAttempts) {
      const x = -1.35 + Math.random() * 2.7;
      const d = -0.82 + Math.random() * 1.64;
      const y = -1.15 + Math.random() * 2.55;

      if (!ShuttleMode.isInsideHeart(x, d, y)) continue;

      pts.push({
        x: x * scale,
        y: y * scale,
        z: d * depth,
        color,
        radiusScale,
      });
    }

    // In case a future parameter tweak makes rejection sampling too sparse,
    // pad with central points instead of silently producing an underfilled cloud.
    while (pts.length < n) {
      pts.push({
        x: (Math.random() - 0.5) * scale * 0.3,
        y: (Math.random() - 0.5) * scale * 0.3,
        z: (Math.random() - 0.5) * depth * 0.3,
        color,
        radiusScale,
      });
    }
    return pts;
  }

  /**
   * Hollow 3D heart shell: sample the outer implicit heart, then subtract a
   * smaller inner heart from it. This keeps the whole silhouette heart-shaped
   * instead of concentrating particles only on three high-curvature lobes.
   */
  private static sampleHeartShell3D(
    n: number,
    scale: number,
    depth: number,
    color: RGB,
    radiusScale: number,
    shellThickness: number,
  ): ShuttleTarget[] {
    const pts: ShuttleTarget[] = [];
    const voidScale = Math.max(0.18, Math.min(0.92, 1 - shellThickness));
    const maxAttempts = n * 300;
    let attempts = 0;

    while (pts.length < n && attempts++ < maxAttempts) {
      const x = -1.35 + Math.random() * 2.7;
      const d = -0.82 + Math.random() * 1.64;
      const y = -1.15 + Math.random() * 2.55;

      if (!ShuttleMode.isInsideHeart(x, d, y)) continue;
      if (
        ShuttleMode.isInsideHeart(
          x / voidScale,
          d / voidScale,
          y / voidScale,
        )
      ) {
        continue;
      }

      pts.push({
        x: x * scale,
        y: y * scale,
        z: d * depth,
        color,
        radiusScale,
      });
    }

    while (pts.length < n) {
      pts.push({
        x: (Math.random() - 0.5) * scale * 0.3,
        y: (Math.random() - 0.5) * scale * 0.3,
        z: (Math.random() - 0.5) * depth * 0.3,
        color,
        radiusScale,
      });
    }
    return pts;
  }

  private static isInsideHeart(x: number, d: number, y: number): boolean {
    const a = x * x + 2.25 * d * d + y * y - 1;
    return a * a * a - x * x * y * y * y - 0.1125 * d * d * y * y * y <= 0;
  }

  /** 进入模式时调用：标记下一次 emit 生成全部粒子（汇聚动画起点）。 */
  activate(): void {
    this.needsSpawn = true;
  }

  emit(_ctx: ModeContext, _color: RGB, acquire: () => Particle | null): void {
    if (!this.needsSpawn) return;
    this.needsSpawn = false;

    // 生命设得很大，使粒子在模式存续期间不消亡
    const LONG_LIFE = 1e9;

    const scatterRadius =
      Math.max(SHUTTLE.heartScale * 1.35, SHUTTLE.heartDepth) *
      SHUTTLE.scatterRadiusMultiplier;

    for (let i = 0; i < this.targets.length; i++) {
      const p = acquire();
      if (!p) break;
      const target = this.targets[i];

      // 从四散位置出生（球面随机），随后被位置插值拉向目标点 → 汇聚成形
      // 散布范围约为心形尺度的 1.8 倍，让粒子从周围飞入（不要太远，否则汇聚太慢）
      const sx = (Math.random() - 0.5) * 2 * scatterRadius;
      const sy = (Math.random() - 0.5) * 2 * scatterRadius;
      const sz = (Math.random() - 0.5) * 2 * scatterRadius;

      p.reset(
        sx,
        sy,
        0,
        0,
        LONG_LIFE,
        SHUTTLE.baseRadius * target.radiusScale,
        target.color,
      );
      p.z = sz;
      p.vz = 0;
      p.tx = target.x;
      p.ty = target.y;
      p.tz = target.z;
      p.displayAlphaScale = 1;
      p.shockwave = false;
    }
  }

  /**
   * 直接位置插值（指数逼近目标点），不累积速度、不做物理积分。
   *
   * 这是与其他模式根本不同的更新方式：粒子不受力、不积分速度，而是每帧
   * 朝心形目标点滑动一个固定比例。这样无条件稳定——粒子单调收敛到目标点
   * 后精确静止（速度恒为 0），永远不会过冲、震荡或飞散。所有视觉运动都来自
   * 相机环绕，粒子云本身是静态的。
   *
   * 注意：ParticleSystem.update() 对穿梭模式跳过速度积分（见该文件 is3D 分支），
   * 本方法直接写 p.x/y/z。
   */
  applyForce(p: Particle, ctx: ModeContext): void {
    const { dt } = ctx;

    // 帧率无关的插值系数：以 60fps 为基准换算，避免掉帧时收敛变慢。
    // t = 1 - (1 - convergeSpeed)^(dt*60)
    const t = 1 - Math.pow(1 - SHUTTLE.convergeSpeed, dt * 60);

    p.x += (p.tx - p.x) * t;
    p.y += (p.ty - p.y) * t;
    p.z += (p.tz - p.z) * t;

    // 速度恒为 0：粒子云完全静止，不参与任何物理积分
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
  }
}
