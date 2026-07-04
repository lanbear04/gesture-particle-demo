import type { Particle } from "../particles/Particle";
import type { Vec2 } from "../types";
import type { Camera } from "../camera/Camera";

/**
 * 渲染抽象接口。当前由 Canvas2DRenderer 实现；后续粒子量增大可换 WebGL 实现，
 * 上层（App）只依赖此接口，无需改动。
 */
export interface Renderer {
  /** canvas 当前像素宽度 */
  readonly width: number;
  /** canvas 当前像素高度 */
  readonly height: number;

  /** 根据容器尺寸 + DPR 调整 canvas 后备缓冲尺寸 */
  resize(): void;

  /** 每帧开始：应用拖尾渐隐（替代清屏） */
  beginFrame(alpha?: number): void;

  /** 每帧开始：清屏（穿梭模式用，粒子静止不需要拖尾） */
  clearFrame(): void;

  /** 绘制所有存活粒子 */
  drawParticles(particles: readonly Particle[]): void;

  /**
   * 穿梭模式：用相机把粒子 3D 世界坐标投影到屏幕后绘制，
   * 含按深度排序（后到前）与景深虚化（远离焦平面变暗变小）。
   */
  drawParticles3D(particles: readonly Particle[], camera: Camera): void;

  /** 可选：绘制指尖光标（指示当前发射点） */
  drawCursor(pos: Vec2): void;

  /** 调试：绘制单手 21 关键点骨架（点 canvas 坐标，按 LANDMARK 索引顺序） */
  drawHand(points: readonly Vec2[]): void;
}
