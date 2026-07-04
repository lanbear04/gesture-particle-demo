import { TRAIL_FADE_ALPHA } from "../config";

/**
 * 拖尾效果：不清屏，而是每帧用 destination-out 擦除已有像素的透明度，
 * 让上一帧的粒子逐渐淡为透明，形成拖影并露出背后的摄像头画面。
 * alpha 越小拖尾越长。配合粒子的 "lighter" 合成模式产生发光叠加。
 */
export function fadeTrail(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha = TRAIL_FADE_ALPHA,
): void {
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
}
