import type { Vec3 } from "../types";

/**
 * 轻量 3D 向量工具。穿梭模式只需基础线性代数：相机绕原点环绕、
 * 把世界坐标投影到屏幕。刻意不引入矩阵库，保持工程轻量、零依赖。
 *
 * 约定：右手坐标系，+x 向右，+y 向上，+z 朝向屏幕外（指向观察者）。
 * 注意：粒子世界坐标 y 向上为正；投影到 canvas 时再翻转成屏幕坐标（y 向下）。
 */

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

/** 归一化；零向量返回零向量（避免除零） */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/**
 * 球坐标 → 笛卡尔坐标，用于相机绕原点环绕。
 * - radius：到原点距离
 * - azimuth：水平方位角（绕 +y 轴），0 时相机在 +z 正前方
 * - elevation：仰角（向上为正），范围约 (-π/2, π/2)
 */
export function sphericalToCartesian(
  radius: number,
  azimuth: number,
  elevation: number,
): Vec3 {
  const cosE = Math.cos(elevation);
  return {
    x: radius * cosE * Math.sin(azimuth),
    y: radius * Math.sin(elevation),
    z: radius * cosE * Math.cos(azimuth),
  };
}
