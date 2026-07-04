import type { Renderer } from "./Renderer";
import type { Particle } from "../particles/Particle";
import type { Vec2 } from "../types";
import type { Camera } from "../camera/Camera";
import { HAND_CONNECTIONS } from "../types";
import { fadeTrail } from "../particles/trail";
import { SHUTTLE } from "../config";

/**
 * Canvas 2D 渲染实现。
 * - 拖尾：beginFrame 用半透明黑覆盖（fadeTrail），不清屏。
 * - 粒子：globalCompositeOperation="lighter" 做加色发光，重叠处更亮。
 * - DPR：按 devicePixelRatio 放大后备缓冲，绘制坐标用 CSS 像素。
 */
export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("无法获取 Canvas 2D 上下文");
    this.ctx = ctx;
    this.resize();
  }

  get width(): number {
    return this.cssWidth;
  }
  get height(): number {
    return this.cssHeight;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.cssWidth = w;
    this.cssHeight = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // 用 transform 把绘制坐标系换算到 CSS 像素
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // resize 会清空画布；保持透明，让背后的摄像头透出
    this.ctx.clearRect(0, 0, w, h);
  }

  beginFrame(alpha?: number): void {
    fadeTrail(this.ctx, this.cssWidth, this.cssHeight, alpha);
  }

  clearFrame(): void {
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  drawParticles(particles: readonly Particle[]): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";

    for (const p of particles) {
      if (p.dead) continue;
      const { r, g, b } = p.color;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 为大粒子添加柔和光晕，提升爆发/冲击波的视觉张力
    for (const p of particles) {
      if (p.dead || p.radius <= 3.8) continue;
      const { r, g, b } = p.color;
      const alpha = p.alpha;
      const glowR = p.radius * 2.6;
      const grad = ctx.createRadialGradient(
        p.x,
        p.y,
        p.radius,
        p.x,
        p.y,
        glowR,
      );
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * 穿梭模式 3D 渲染：
   * 1. 把每颗粒子用相机投影到屏幕，得到像素坐标 + 相机空间深度。
   * 2. 按深度从远到近排序（后到前画，近处粒子覆盖远处）。
   * 3. 透视缩放：近大远小（半径 ∝ 1/depth）。
   * 4. 景深虚化：偏离焦平面越远越暗越小（Canvas2D 近似，非真模糊）。
   */
  drawParticles3D(particles: readonly Particle[], camera: Camera): void {
    const ctx = this.ctx;

    // 投影所有存活粒子，收集可见的
    type Proj = {
      x: number;
      y: number;
      depth: number;
      radius: number;
      alpha: number;
      color: Particle["color"];
    };
    const projected: Proj[] = [];

    for (const p of particles) {
      if (p.dead) continue;
      const pr = camera.project({ x: p.x, y: p.y, z: p.z });
      if (!pr) continue;

      // 透视缩放：基准距离取焦平面深度，近大远小
      const perspScale = SHUTTLE.focalDepth / pr.depth;

      // 景深：偏离焦平面的距离决定变暗、变小程度
      const depthDiff = Math.abs(pr.depth - SHUTTLE.focalDepth);
      const dofT = Math.min(1, depthDiff / SHUTTLE.dofRange);
      const dofAlpha = 1 - (1 - SHUTTLE.dofMinAlpha) * dofT;
      const dofSize = 1 - (1 - SHUTTLE.dofMinSize) * dofT;

      const radius = p.radius * perspScale * dofSize;
      if (radius < 0.15) continue; // 太小不值得画

      projected.push({
        x: pr.x,
        y: pr.y,
        depth: pr.depth,
        radius,
        alpha: Math.max(0, Math.min(1, p.alpha * dofAlpha)),
        color: p.color,
      });
    }

    // 后到前排序（depth 大的远，先画）
    projected.sort((a, b) => b.depth - a.depth);

    // 加色发光，重叠处更亮，营造体积光感
    ctx.globalCompositeOperation = "lighter";
    for (const p of projected) {
      const { r, g, b } = p.color;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 近处大粒子加光晕（远近反差更强）
    for (const p of projected) {
      if (p.radius <= 3.5) continue;
      const { r, g, b } = p.color;
      const glowR = p.radius * 2.8;
      const grad = ctx.createRadialGradient(p.x, p.y, p.radius, p.x, p.y, glowR);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.5})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  drawCursor(pos: Vec2): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  }

  drawHand(points: readonly Vec2[]): void {
    if (points.length === 0) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";

    // 骨架连线
    ctx.strokeStyle = "rgba(0, 255, 160, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = points[a];
      const pb = points[b];
      if (!pa || !pb) continue;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();

    // 关键点
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      // 指尖（4/8/12/16/20）画大一点并标红，便于观察
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      ctx.fillStyle = isTip ? "rgba(255, 80, 80, 0.95)" : "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, isTip ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
