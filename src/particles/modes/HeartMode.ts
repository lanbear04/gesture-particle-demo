import type { ModeContext, ParticleMode } from "./ParticleMode";
import type { Particle } from "../Particle";
import type { RGB } from "../../types";
import { HEART, PARTICLES } from "../../config";

/**
 * 爱心模式：
 * - 持续在屏幕中心附近生成粒子，粒子被吸向预采样的心形目标点，
 *   捏合程度越高，吸力越强，粒子越快聚成心形轮廓。
 * - 聚焦：越靠近心形轮廓的粒子越大、越亮；远离的粒子雾化变淡，
 *   形成中心实、边缘虚的体积感。
 * - 心跳脉动：目标点整体随时间做正弦缩放，产生"扑通"感。
 * - 呼吸抖动：贴近轮廓的粒子带有轻微切向抖动，让心形保持生命力。
 * - 五指张开（ctx.burst=true）：给每颗粒子一次向外径向冲量，并生成
 *   一层沿心形轮廓向外扩散的高亮冲击波。
 */
export class HeartMode implements ParticleMode {
  readonly name = "heart";

  /**
   * 预采样的心形目标点（相对屏幕中心的像素偏移，y 已翻转适配屏幕坐标系）。
   * 构造时一次性生成，运行期只读。
   */
  private readonly baseTargets: readonly { x: number; y: number }[];

  /** 累积时间（用于心跳相位，不依赖 Date.now） */
  private elapsed = 0;

  constructor() {
    this.baseTargets = HeartMode.sampleHeart(HEART.samplePoints, HEART.heartScale);
  }

  /**
   * 在心形参数方程上均匀采样 n 个点，缩放后返回相对中心的偏移坐标。
   * 参数方程（数学坐标）：
   *   x = 16 sin³t
   *   y = 13 cos t − 5 cos 2t − 2 cos 3t − cos 4t
   * 屏幕 y 轴向下，所以 y 取负数翻转。
   */
  private static sampleHeart(n: number, scale: number) {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const mx = 16 * Math.pow(Math.sin(t), 3);
      const my =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t);
      pts.push({ x: mx * scale, y: -my * scale }); // 翻转 y
    }
    return pts;
  }

  /**
   * 当前帧的心跳缩放系数（1 ± amp，随 elapsed 正弦变化）。
   */
  private pulseFactor(): number {
    return (
      1 +
      HEART.pulseAmp * Math.sin((this.elapsed / HEART.pulsePeriod) * Math.PI * 2)
    );
  }

  /** 把颜色提亮，用于冲击波高亮显示 */
  private static brighten(c: RGB, amount: number): RGB {
    return {
      r: Math.min(255, c.r + amount),
      g: Math.min(255, c.g + amount),
      b: Math.min(255, c.b + amount),
    };
  }

  emit(ctx: ModeContext, color: RGB, acquire: () => Particle | null): void {
    const { center, burst } = ctx;

    // 爆发帧优先生成冲击波，再补普通粒子
    if (burst) {
      this.emitShockwave(center, color, acquire);
    }

    // 每帧补发 emitPerFrame 颗；池满时 acquire 返回 null 自动限流。
    // 配合较长生命，存活量自然稳定在 emitPerFrame × life × fps 附近。
    for (let i = 0; i < HEART.emitPerFrame; i++) {
      const p = acquire();
      if (!p) break;

      // 在屏幕中心附近随机散布生成，带轻微初速度，让粒子先飘再聚
      const angle = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 120;
      const x = center.x + Math.cos(angle) * r;
      const y = center.y + Math.sin(angle) * r;
      const speed = 20 + Math.random() * 40;
      const life =
        HEART.lifeMin + Math.random() * (HEART.lifeMax - HEART.lifeMin);
      const radius = PARTICLES.baseRadius * (0.7 + Math.random() * 0.6);

      // 随机分配一个心形目标点，存其相对中心的基础偏移
      const tidx = Math.floor(Math.random() * this.baseTargets.length);
      const target = this.baseTargets[tidx];
      p.reset(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, life, radius, color);
      p.tx = target.x;
      p.ty = target.y;
      p.pulseOffset = Math.random() * Math.PI * 2;
      p.maxRadius = radius;
      p.shockwave = false;
      p.displayAlphaScale = 1;
    }
  }

  /**
   * 生成一层沿心形轮廓向外扩散的冲击波粒子。
   * 这些粒子从中心附近出发，沿目标点方向高速飞出，生命周期短、半径大、更亮。
   */
  private emitShockwave(
    center: { x: number; y: number },
    color: RGB,
    acquire: () => Particle | null,
  ): void {
    const brightColor = HeartMode.brighten(color, HEART.shockwaveColorBoost);

    for (let i = 0; i < HEART.shockwaveParticles; i++) {
      const p = acquire();
      if (!p) break;

      const tidx = Math.floor(Math.random() * this.baseTargets.length);
      const target = this.baseTargets[tidx];

      // 起始位置在中心附近小范围内随机
      const spawnAngle = Math.random() * Math.PI * 2;
      const spawnR = Math.random() * 30;
      const x = center.x + Math.cos(spawnAngle) * spawnR;
      const y = center.y + Math.sin(spawnAngle) * spawnR;

      // outward 方向 = 从中心指向心形目标点
      const angle = Math.atan2(target.y, target.x);
      const speed = HEART.shockwaveSpeed * (0.8 + Math.random() * 0.4);
      const life = HEART.shockwaveLife * (0.8 + Math.random() * 0.4);
      const radius = PARTICLES.baseRadius * (2.2 + Math.random() * 1.3);

      p.reset(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        life,
        radius,
        brightColor,
      );
      p.tx = target.x;
      p.ty = target.y;
      p.pulseOffset = Math.random() * Math.PI * 2;
      p.maxRadius = radius * (2.2 + Math.random() * 1.0);
      p.shockwave = true;
      p.displayAlphaScale = 1;
    }
  }

  applyForce(p: Particle, ctx: ModeContext): void {
    const { center, pinch, burst, dt } = ctx;

    // ── 冲击波：沿心形轮廓向外扩散，半径随时间放大，透明度快速衰减 ──
    if (p.shockwave) {
      const progress = 1 - p.life / p.maxLife;
      // 半径先快速长大到 maxRadius，再保持稳定
      p.radius = p.maxRadius * Math.min(progress * 1.6, 1);
      // 透明度：先保持一下，后半段快速消散
      p.displayAlphaScale = Math.max(0, 1 - Math.pow(progress, 2.5));

      // 持续给一个小的 outward 加速度，让波形更舒展
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / d) * 60 * dt;
      p.vy += (dy / d) * 60 * dt;
      return;
    }

    // ── 爆发：所有普通粒子获得一次强 outward 冲量，核心更亮更大 ──
    if (burst) {
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx += (dx / d) * HEART.burstSpeed;
      p.vy += (dy / d) * HEART.burstSpeed;

      // 越靠近中心，爆发瞬间越亮越大
      const coreGlow = Math.max(0, 1 - d / 280);
      p.radius = p.maxRadius * (1 + coreGlow * 2.2);
      p.displayAlphaScale = 1;
      return; // 爆发帧不施加吸力，让冲量主导
    }

    // ── 常态：粒子被吸向心形目标点，同时形成聚焦梯度 ──
    const pulse = this.pulseFactor();
    const targetX = center.x + p.tx * pulse;
    const targetY = center.y + p.ty * pulse;

    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    // 聚焦梯度：越靠近目标轮廓越大越亮，远离则雾化
    const focus = Math.max(0, Math.min(1, 1 - dist / HEART.focusRadius));
    p.radius = PARTICLES.baseRadius * (0.5 + 1.3 * focus);
    p.displayAlphaScale = 0.2 + 0.8 * Math.pow(focus, 0.55);

    // 吸力强度随 pinch 线性插值：0=弱漂，1=强聚
    const pull = HEART.pullMin + (HEART.pullMax - HEART.pullMin) * pinch;

    // 弹簧力：越远越强，防止已到位的粒子被过度加速
    const forceMag = pull * Math.min(dist, 120);
    p.vx += (dx / dist) * forceMag * dt;
    p.vy += (dy / dist) * forceMag * dt;

    // 呼吸抖动：贴近轮廓的粒子沿切向轻微摆动，制造“活”的心形
    if (focus > 0.55) {
      const phase = this.elapsed * HEART.breatheFreq + p.pulseOffset;
      const jitter =
        Math.sin(phase) * HEART.breatheAmp * (focus - 0.55);
      // 切向 = 径向逆时针旋转 90°
      const tx = -dy / dist;
      const ty = dx / dist;
      p.vx += tx * jitter * dt;
      p.vy += ty * jitter * dt;
    }
  }

  /** 每帧由 App 调用，推进心跳相位 */
  tick(dt: number): void {
    this.elapsed += dt;
  }
}
