import type { ModeContext, ParticleMode } from "./ParticleMode";
import type { Particle } from "../Particle";
import type { RGB } from "../../types";
import { PARTICLES } from "../../config";

/**
 * 旋涡模式：粒子在指尖附近低速生成，受切向力（绕指尖旋转）+ 弱向心力，
 * 形成围绕指尖打旋的漩涡。生命较长，旋转更持久。
 */
export class VortexMode implements ParticleMode {
  readonly name = "vortex";

  /** 切向力强度（角加速度感） */
  private static readonly TANGENTIAL = 9.0;
  /** 向心力强度（拉回指尖，避免飞散） */
  private static readonly CENTRIPETAL = 2.2;

  emit(ctx: ModeContext, color: RGB, acquire: () => Particle | null): void {
    const origin = ctx.origin;
    if (!origin) return;
    for (let i = 0; i < PARTICLES.emitPerFrame; i++) {
      const p = acquire();
      if (!p) break;

      // 在指尖周围一圈内随机生成，带轻微初始切向速度
      const angle = Math.random() * Math.PI * 2;
      const ringR = 20 + Math.random() * 60;
      const x = origin.x + Math.cos(angle) * ringR;
      const y = origin.y + Math.sin(angle) * ringR;
      const tangSpeed = 60 + Math.random() * 80;

      const life =
        PARTICLES.lifeMin * 1.4 +
        Math.random() * (PARTICLES.lifeMax - PARTICLES.lifeMin);
      const radius = PARTICLES.baseRadius * (0.6 + Math.random() * 0.8);

      p.reset(
        x,
        y,
        -Math.sin(angle) * tangSpeed,
        Math.cos(angle) * tangSpeed,
        life,
        radius,
        color,
      );
    }
  }

  applyForce(p: Particle, ctx: ModeContext): void {
    const origin = ctx.origin;
    if (!origin) return;

    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq) || 1;

    // 单位径向向量
    const rx = dx / dist;
    const ry = dy / dist;
    // 切向 = 径向逆时针旋转 90°
    const tx = -ry;
    const ty = rx;

    // 切向力（旋转）+ 向心力（拉回），力随距离缩放避免近指尖处发散
    p.vx += (tx * VortexMode.TANGENTIAL - rx * VortexMode.CENTRIPETAL) * dist * ctx.dt;
    p.vy += (ty * VortexMode.TANGENTIAL - ry * VortexMode.CENTRIPETAL) * dist * ctx.dt;
  }
}
