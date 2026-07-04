import type { Vec3 } from "../types";
import { sphericalToCartesian, sub, normalize, cross, dot } from "../math/Vec3";

/**
 * 相机：环绕原点（爱心所在位置）观察的透视相机。
 *
 * - 位置由球坐标 (radius, azimuth, elevation) 控制，通过手势命令和食指手势调整
 * - 始终注视世界原点（爱心中心）
 * - 提供 project() 把 3D 世界坐标投影到 2D canvas 像素
 *
 * 坐标系：世界 +y 向上，+z 朝向观察者（右手坐标系）；
 * Canvas +y 向下，投影时翻转。
 */
export class Camera {
  // 球坐标（相机绕原点环绕）
  private radius = 500;
  private azimuth = 0; // 水平方位角（弧度）
  private elevation = 0; // 仰角（弧度）

  // 目标球坐标（手势驱动，平滑插值到这里）
  private targetRadius = 500;
  private targetAzimuth = 0;
  private targetElevation = 0;

  // 上一帧食指位置（像素），用于计算增量
  private lastFingerX: number | null = null;
  private lastFingerY: number | null = null;

  // 距离冻结状态
  private inPauseZone = false;

  private minRadius = 0;
  private maxRadius = Infinity;

  // canvas 尺寸（投影需要）
  private canvasWidth = 800;
  private canvasHeight = 600;

  // 透视参数
  private readonly fov = Math.PI / 3; // 60° 视场角
  private readonly near = 10;

  constructor(initialRadius: number, canvasWidth: number, canvasHeight: number) {
    this.radius = initialRadius;
    this.targetRadius = initialRadius;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * 设置半径边界。调用者传入心形粒子的安全半径范围，
   * 相机会把 targetRadius 限制在该区间内，确保粒子云始终在视野内。
   */
  setRadiusBounds(minRadius: number, maxRadius: number): void {
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.targetRadius = Math.max(minRadius, Math.min(maxRadius, this.targetRadius));
    this.radius = Math.max(minRadius, Math.min(maxRadius, this.radius));
  }

  /** 更新 canvas 尺寸（窗口 resize 时调用） */
  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  updateRadiusFromAmount(
    amount: number,
    minRadius: number,
    maxRadius: number,
  ): void {
    const t = Math.max(0, Math.min(1, amount));
    this.inPauseZone = false;
    this.targetRadius = maxRadius - (maxRadius - minRadius) * t;
    this.targetRadius = Math.max(this.minRadius, Math.min(this.maxRadius, this.targetRadius));
  }

  updateOrbitFromFinger(
    fingerX: number,
    fingerY: number,
    azimuthSensitivity: number,
    elevationSensitivity: number,
    useHorizontal: boolean,
    useVertical: boolean,
  ): void {
    this.inPauseZone = false;

    if (this.lastFingerX !== null && this.lastFingerY !== null) {
      const dx = fingerX - this.lastFingerX;
      const dy = fingerY - this.lastFingerY;

      if (useHorizontal) this.targetAzimuth += dx * azimuthSensitivity;
      if (useVertical) this.targetElevation -= dy * elevationSensitivity;

      this.targetElevation = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, this.targetElevation),
      );
    }

    this.lastFingerX = fingerX;
    this.lastFingerY = fingerY;
  }

  updateVerticalOrbitFromHorizontalFinger(
    fingerX: number,
    fingerY: number,
    elevationSensitivity: number,
  ): void {
    this.inPauseZone = false;

    if (this.lastFingerX !== null) {
      const dx = fingerX - this.lastFingerX;
      this.targetElevation += dx * elevationSensitivity;
      this.targetElevation = Math.max(
        -Math.PI / 2 + 0.1,
        Math.min(Math.PI / 2 - 0.1, this.targetElevation),
      );
    }

    this.lastFingerX = fingerX;
    this.lastFingerY = fingerY;
  }

  /** 冻结当前相机远近，避免切入旋转手势时继续追逐旧的半径目标。 */
  freezeRadius(): void {
    this.targetRadius = this.radius;
    this.inPauseZone = false;
  }

  /**
   * 平滑插值到目标位置（每帧调用）。
   * @param radiusSpeed 半径插值速度 0~1
   * @param orbitSpeed 角度插值速度 0~1
   */
  tick(radiusSpeed: number, orbitSpeed: number): void {
    this.radius += (this.targetRadius - this.radius) * radiusSpeed;
    this.azimuth += (this.targetAzimuth - this.azimuth) * orbitSpeed;
    this.elevation += (this.targetElevation - this.elevation) * orbitSpeed;

    // 再次夹住当前半径，确保即使外部直接修改也不会越界
    this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
  }

  /** 当前相机世界坐标（球坐标 → 笛卡尔坐标） */
  getPosition(): Vec3 {
    return sphericalToCartesian(this.radius, this.azimuth, this.elevation);
  }

  /** 相机注视目标（恒为世界原点） */
  getLookAt(): Vec3 {
    return { x: 0, y: 0, z: 0 };
  }

  /** 当前是否处于距离冻结状态（用于 UI 显示） */
  isInPauseZone(): boolean {
    return this.inPauseZone;
  }

  /**
   * 重置相机到初始状态。
   * @param radius 初始环绕半径
   */
  reset(radius: number): void {
    this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, radius));
    this.targetRadius = this.radius;
    this.azimuth = 0;
    this.targetAzimuth = 0;
    this.elevation = 0;
    this.targetElevation = 0;
    this.inPauseZone = false;
    this.lastFingerX = null;
    this.lastFingerY = null;
  }

  /** 手消失时调用：清除上一帧食指位置，避免重新出现时产生跳变 */
  resetFingerTracking(): void {
    this.lastFingerX = null;
    this.lastFingerY = null;
  }

  /**
   * 无手势时自动旋转相机（缓慢环绕展示）。
   * @param dt 帧间隔时间（秒）
   * @param speed 旋转速度（弧度/秒）
   */
  autoRotate(dt: number, speed: number): void {
    this.inPauseZone = false;
    this.targetAzimuth += speed * dt;
  }

  /**
   * 3D 世界坐标投影到 2D canvas 像素。
   * 返回 {x, y, depth}，depth 是相机空间的 -z（越大越远，用于排序和景深）。
   * 若点在视锥外或相机后方，返回 null（不绘制）。
   */
  project(world: Vec3): { x: number; y: number; depth: number } | null {
    const pos = this.getPosition();
    const target = this.getLookAt();

    // ── 构建视图变换：世界 → 相机空间 ──
    // forward = normalize(target - pos)
    const forward = normalize(sub(target, pos));
    // right = normalize(forward × worldUp)，worldUp = (0, 1, 0)
    const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
    const right = normalize(cross(forward, worldUp));
    // up = normalize(right × forward)
    const up = normalize(cross(right, forward));

    // 相机空间坐标：点相对相机原点，再投影到 (right, up, -forward) 坐标系
    const rel = sub(world, pos);
    const camX = dot(rel, right);
    const camY = dot(rel, up);
    const camZ = dot(rel, forward); // 沿视线 forward 方向为正深度

    // 后方剔除（点在相机后方）
    if (camZ < this.near) return null;

    // ── 透视投影 ──
    const aspect = this.canvasWidth / this.canvasHeight;
    const tanHalfFov = Math.tan(this.fov / 2);

    // NDC（归一化设备坐标）
    const ndcX = camX / (camZ * tanHalfFov * aspect);
    const ndcY = camY / (camZ * tanHalfFov);

    // NDC → canvas 像素（注意 y 翻转：世界 +y 向上，canvas +y 向下）
    const x = (ndcX * 0.5 + 0.5) * this.canvasWidth;
    const y = (0.5 - ndcY * 0.5) * this.canvasHeight;

    return { x, y, depth: camZ };
  }
}
