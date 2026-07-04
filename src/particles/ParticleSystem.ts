import { Particle } from "./Particle";
import type { ParticleMode } from "./modes/ParticleMode";
import type { ModeContext } from "./modes/ParticleMode";
import type { RGB } from "../types";
import { PARTICLES } from "../config";

/**
 * 粒子系统：维护固定大小的对象池，按当前模式发射、更新、回收粒子。
 *
 * 池在构造时预分配 maxParticles 个 Particle，发射时复用 dead 粒子，
 * 不在运行时 new，避免 GC 抖动。update 负责施力、积分、阻尼、生命衰减。
 */
export class ParticleSystem {
  private readonly pool: Particle[];
  private mode: ParticleMode;

  constructor(initialMode: ParticleMode) {
    this.mode = initialMode;
    this.pool = Array.from({ length: PARTICLES.maxParticles }, () => new Particle());
  }

  setMode(mode: ParticleMode): void {
    this.mode = mode;
  }

  /** 立即回收所有粒子（生命置 0）。穿梭模式进入时清场，便于干净汇聚成形。 */
  clear(): void {
    for (const p of this.pool) p.life = 0;
  }

  get particles(): readonly Particle[] {
    return this.pool;
  }

  /** 当前存活粒子数（用于调试 / FPS 面板） */
  get aliveCount(): number {
    let n = 0;
    for (const p of this.pool) if (!p.dead) n++;
    return n;
  }

  /** 从池中取一个 dead 粒子复用；池满返回 null */
  private acquire = (): Particle | null => {
    for (const p of this.pool) {
      if (p.dead) return p;
    }
    return null;
  };

  /** 在指尖位置按当前模式发射一批粒子 */
  emit(ctx: ModeContext, color: RGB): void {
    this.mode.emit(ctx, color, this.acquire);
  }

  /**
   * 推进一帧：对每个存活粒子施力 → 积分 → 阻尼 → 生命衰减。
   * @param ctx 当前帧上下文（指尖、中心、捏合、爆发、dt）
   * @param damping 速度阻尼系数（不同模式可不同）
   */
  update(ctx: ModeContext, damping: number = PARTICLES.damping): void {
    const dt = ctx.dt;
    const is3D = this.mode.name === "shuttle";

    for (const p of this.pool) {
      if (p.dead) continue;

      this.mode.applyForce(p, ctx);

      if (is3D) {
        // 穿梭模式：applyForce 已直接做位置插值（指数逼近目标点），
        // 不积分速度、不施加阻尼——粒子云完全静止，无过冲飞散风险。
        // 仅推进生命计数。
        p.life -= dt;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.vx *= damping;
      p.vy *= damping;

      p.life -= dt;
    }
  }
}
