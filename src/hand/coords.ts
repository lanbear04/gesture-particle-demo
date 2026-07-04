import type { Landmark, Vec2 } from "../types";

/**
 * 把归一化关键点坐标（[0,1]，相对视频帧）映射到 canvas 像素坐标。
 *
 * 视频在页面上以 `transform: scaleX(-1)` 镜像显示（自拍视角），
 * 所以这里对 x 做水平翻转，让粒子与用户看到的手位置一致。
 *
 * 注意：MediaPipe 的归一化坐标基于「未镜像」的原始帧。视频用 object-fit:cover
 * 铺满屏幕；MVP 阶段直接按 canvas 尺寸线性映射（cover 的轻微裁剪在交互上可接受）。
 */
export function landmarkToCanvas(
  lm: Landmark,
  canvasWidth: number,
  canvasHeight: number,
): Vec2 {
  return {
    x: (1 - lm.x) * canvasWidth,
    y: lm.y * canvasHeight,
  };
}
