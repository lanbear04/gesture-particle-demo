import type { ModeContext, ParticleMode } from "./ParticleMode";
import type { Particle } from "../Particle";
import type { RGB } from "../../types";
import { PARTICLES } from "../../config";

/**
 * 爆炸模式：粒子从指尖向四周随机方向高速射出，生命较短，向外炸开。
 * 无额外持续力（只有发射时的初速度 + 系统统一阻尼）。
 */
export class ExplosionMode implements ParticleMode {
  readonly name = "explosion";

  emit(ctx: ModeContext, color: RGB, acquire: () => Particle | null): void {
    const origin = ctx.origin;
    if (!origin) return;
    for (let i = 0; i < PARTICLES.emitPerFrame; i++) {
      const p = acquire();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 380; // 像素/秒
      const life =
        PARTICLES.lifeMin +
        Math.random() * (PARTICLES.lifeMax - PARTICLES.lifeMin) * 0.7;
      const radius = PARTICLES.baseRadius * (0.6 + Math.random() * 0.9);

      p.reset(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        life,
        radius,
        color,
      );
    }
  }

  applyForce(): void {
    // 爆炸模式无持续力，纯靠初速度 + 阻尼自然衰减
  }
}
