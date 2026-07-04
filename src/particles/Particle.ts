import type { RGB } from "../types";

/**
 * 单个粒子。字段公开，由 ParticleSystem 与 ParticleMode 直接读写以提升性能。
 * 通过对象池复用，dead 的粒子会被 reset 重新激活。
 */
export class Particle {
  x = 0;
  y = 0;
  /** 3D 世界深度（仅穿梭模式使用；2D 模式忽略，恒为 0） */
  z = 0;
  vx = 0;
  vy = 0;
  /** 3D 世界 z 方向速度（仅穿梭模式使用） */
  vz = 0;
  /** 剩余生命（秒） */
  life = 0;
  /** 初始生命（秒），用于计算 alpha 渐隐 */
  maxLife = 1;
  radius = 1;
  /** 模式可覆盖的显示半径上限（用于爆发/冲击波时动态放大） */
  maxRadius = 1;
  color: RGB = { r: 255, g: 255, b: 255 };
  /**
   * 模式自用的目标点（爱心模式：该粒子要吸附到的心形目标点，存为相对屏幕中心的像素偏移，
   * 已含抖动，y 已翻转）。其他模式不使用。reset 不重置，由模式 emit 时设定。
   */
  tx = 0;
  ty = 0;
  /** 模式自用的目标点 z 分量（穿梭模式：心形目标点的世界深度）。 */
  tz = 0;
  /** 呼吸相位偏移（爱心模式用） */
  pulseOffset = 0;
  /** 冲击波粒子标记（爱心模式用） */
  shockwave = false;
  /** 模式可覆盖的额外透明度系数（爱心模式用聚焦梯度） */
  displayAlphaScale = 1;

  get dead(): boolean {
    return this.life <= 0;
  }

  /** 当前透明度：随生命线性衰减，再乘以模式覆盖系数 */
  get alpha(): number {
    return Math.max(0, this.life / this.maxLife) * this.displayAlphaScale;
  }

  /** 重新激活（从池中取出复用时调用） */
  reset(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    radius: number,
    color: RGB,
  ): void {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.vx = vx;
    this.vy = vy;
    this.vz = 0;
    this.life = life;
    this.maxLife = life;
    this.radius = radius;
    this.maxRadius = radius;
    this.color = color;
    this.shockwave = false;
    this.displayAlphaScale = 1;
  }
}
