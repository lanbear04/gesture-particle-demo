import type { Particle } from "../Particle";
import type { RGB, Vec2 } from "../../types";

/**
 * 每帧传给粒子模式的上下文。把指尖、屏幕中心、捏合程度、爆发信号等
 * 统一打包，便于模式按需取用（旧模式只用 origin/dt，爱心模式用全部）。
 */
export interface ModeContext {
  /** 食指指尖坐标（canvas 像素），无手时为 null */
  origin: Vec2 | null;
  /** 屏幕中心（爱心锚点） */
  center: Vec2;
  /** 捏合程度 0(张开)~1(捏紧)，无手时为 0 */
  pinch: number;
  /** 本帧是否触发爆发（仅五指张开那一帧为 true） */
  burst: boolean;
  /** 帧间隔（秒） */
  dt: number;
}

/**
 * 粒子模式策略接口。每种模式定义两件事：
 * - emit：按上下文生成一批粒子的初始状态
 * - applyForce：每帧对存活粒子施加的力 / 速度修改
 *
 * ParticleSystem 持有当前模式对象并委派这两步，切换模式只需替换对象，
 * 已存在的粒子会平滑过渡（继续受新模式的力影响）。
 */
export interface ParticleMode {
  readonly name: string;

  /**
   * 发射一批粒子。实现方从 pool 取出 dead 粒子并 reset。
   * @param ctx 当前帧上下文（指尖、中心、捏合等）
   * @param color 当前颜色
   * @param acquire 从对象池取一个可复用粒子的回调；池满返回 null
   */
  emit(ctx: ModeContext, color: RGB, acquire: () => Particle | null): void;

  /**
   * 对单个存活粒子施加力（修改 vx/vy）。在积分（pos += vel）之前调用。
   * @param p 粒子
   * @param ctx 当前帧上下文
   */
  applyForce(p: Particle, ctx: ModeContext): void;
}
