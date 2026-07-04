import type { RGB } from "./types";

// 全局可调参数集中在此，便于打磨阶段统一调参。

/** MediaPipe 资源路径（本地，不依赖 CDN） */
export const ASSETS = {
  wasmDir: "/wasm",
  modelPath: "/models/hand_landmarker.task",
} as const;

/** 粒子系统参数 */
export const PARTICLES = {
  /** 对象池上限，超过则不再发射（防止掉帧） */
  maxParticles: 9000,
  /** 每帧在指尖发射的粒子数 */
  emitPerFrame: 14,
  /** 速度阻尼（每帧乘以该系数） */
  damping: 0.92,
  /** 粒子基础半径（像素） */
  baseRadius: 2.6,
  /** 生命衰减下限/上限（秒） */
  lifeMin: 0.5,
  lifeMax: 1.2,
} as const;

/** 拖尾：每帧用该 alpha 的黑色全屏覆盖，值越小拖尾越长 */
export const TRAIL_FADE_ALPHA = 0.14;

/** 颜色：默认色（青蓝）与握拳色（红） */
export const COLORS = {
  default: { r: 80, g: 180, b: 255 } as RGB,
  fist: { r: 255, g: 60, b: 60 } as RGB,
  /** 颜色插值速度（每帧向目标色靠拢的比例 0-1） */
  lerpSpeed: 0.15,
} as const;

/** 爱心模式参数 */
export const HEART = {
  /** 心形曲线采样点数（粒子被吸向这些目标点拼成心形） */
  samplePoints: 220,
  /** 心形整体缩放（参数方程坐标 ×该系数 = 像素，约等于半个心高 = 16*scale） */
  heartScale: 11,
  /** 每帧补充发射的粒子数（维持心形粒子总量；存活量≈emitPerFrame×life×fps） */
  emitPerFrame: 10,
  /** 粒子生命（秒）：爱心粒子生命长，便于长期悬浮成形 */
  lifeMin: 2.0,
  lifeMax: 3.5,
  /** 吸力强度：pinch=0(张开) 用 min，pinch=1(捏紧) 用 max，线性插值 */
  pullMin: 1.5,
  pullMax: 16,
  /** 速度阻尼（爱心模式专用，比全局略大，聚拢更稳不抖） */
  damping: 0.86,
  /** 心跳脉动：目标半径在 1±amp 间按 period 秒周期缩放 */
  pulseAmp: 0.06,
  pulsePeriod: 0.85,
  /** 爆发（五指张开）：每颗粒子获得的向外径向冲量（像素/秒） */
  burstSpeed: 880,
  /** 爆发后冷却帧数，避免连续误触发 */
  burstCooldownFrames: 30,
  /**
   * 捏合程度映射：拇指尖(4)→食指尖(8) 距离 / 手掌长度。
   * 该比值 ≥ open 视为完全张开(pinch=0)，≤ closed 视为捏紧(pinch=1)，中间线性。
   */
  pinchOpenRatio: 0.9,
  pinchClosedRatio: 0.25,
  /** 五指张开判定：四指伸展比均高于此值视为张开（触发爆发） */
  openExtendRatio: 1.55,
  /** 聚焦半径：粒子到心形目标点的距离在该范围内可见，越近越亮越大 */
  focusRadius: 160,
  /** 呼吸抖动：接近目标点的粒子受到的切向力振幅（像素/秒²） */
  breatheAmp: 5.5,
  /** 呼吸抖动：频率（周期/秒，与 elapsed 相乘） */
  breatheFreq: 7.0,
  /** 冲击波：每次爆发发射的粒子数 */
  shockwaveParticles: 220,
  /** 冲击波：生命周期（秒），实际会乘 0.8~1.2 随机 */
  shockwaveLife: 0.7,
  /** 冲击波： outward 速度（像素/秒），实际会乘 0.8~1.2 随机 */
  shockwaveSpeed: 920,
  /** 冲击波：颜色提亮量（RGB 各通道加多少，封顶 255） */
  shockwaveColorBoost: 75,
} as const;

/** 爱心模式颜色：粉（散开）→ 红（聚拢/脉动） */
export const HEART_COLORS = {
  loose: { r: 255, g: 150, b: 200 } as RGB,
  tight: { r: 255, g: 40, b: 90 } as RGB,
} as const;

/** 穿梭模式参数：3D 透视，相机环绕静态蓝色心形粒子云 */
export const SHUTTLE = {
  // ── 心形（3D 世界坐标） ──
  /** 心形曲线采样点数（粒子吸附到这些 3D 目标点拼成心形） */
  samplePoints: 4800,
  /** Outer shell thickness for the hollow 3D heart. Larger = thicker shell. */
  outerShellThickness: 0.28,
  /** Inner heart particle ratio for the nested shuttle layer. */
  innerPointRatio: 0.36,
  /** 心形整体缩放（世界坐标，参数方程最大值约 16，所以心形半径约 16*scale） */
  heartScale: 520,
  /** Inner heart scale relative to the outer heart. */
  innerScale: 0.42,
  /** Z 方向厚度（给心形体积感，粒子在 ±heartDepth 内随机偏移） */
  heartDepth: 420,
  /** Inner heart depth relative to the outer heart. */
  innerDepthScale: 0.48,
  /** 粒子基础半径（世界尺寸基准，投影后再按透视缩放） */
  baseRadius: 2.4,
  /** 蓝色 */
  color: { r: 80, g: 150, b: 255 } as RGB,
  /** Brighter color for the nested inner heart. */
  innerColor: { r: 125, g: 220, b: 255 } as RGB,
  /** Smaller particles keep the inner layer legible when zoomed in. */
  innerRadiusScale: 1.05,
  /** Shuttle uses a short trail instead of a hard clear. Larger = shorter trail. */
  trailFadeAlpha: 0.38,

  // ── 相机环绕 ──
  /** 环绕最小半径（握拳拉近时，最近）。可以非常近，让心形撑满屏幕。 */
  orbitNearRadius: 450,
  /** 环绕最大半径（五指张开推远时，最远）。限制最大距离，避免心形缩得过小/雾化看不见。 */
  orbitFarRadius: 1800,
  /** 初始环绕半径：居中位置，保证心形初始清晰可见 */
  orbitInitRadius: 1200,
  /** 半径平滑插值速度（每帧向目标靠拢比例） */
  radiusLerpSpeed: 0.08,

  // ── 食指 → 环绕角度 ──
  /**
   * 食指移动速度映射到角速度的增益（弧度/像素）。
   * 食指在画面上移动时，相机角度按移动距离增量旋转，停止移动则角度锁定。
   */
  azimuthSensitivity: 0.004,
  elevationSensitivity: 0.003,
  /** 角度平滑插值速度 */
  orbitLerpSpeed: 0.1,

  // ── 自动旋转（无手势时） ──
  /** 自动旋转速度（弧度/秒，0.26 ≈ 15°/秒，约 24 秒转一圈） */
  autoRotateSpeed: 0.26,

  // ── 手势识别（仅穿梭模式） ──
  /** 食指/双指旋转手势的伸直阈值。 */
  orbitFingerExtendRatio: 1.42,
  /** 食指/双指旋转手势中，非控制手指的蜷曲阈值。 */
  orbitFingerCurlRatio: 1.35,
  /** 食指+中指并拢阈值：两指尖距离 / 手掌长度。 */
  twoFingerTogetherRatio: 0.5,
  /** 穿梭模式五指张开推远的伸展阈值，比爱心爆发更宽松。 */
  openPalmExtendRatio: 1.32,
  /** 低于该值视为明显蜷曲。 */
  openPalmCurlRejectRatio: 1.12,
  /** 至少几根控制手指达到伸展阈值才判成穿梭五指张开。 */
  openPalmMinFingers: 3,
  /** 允许少量手指因角度偏短，避免小指等导致张开手误判失败。 */
  openPalmMaxCurledFingers: 1,

  // ── 景深（Canvas2D 近似：远离焦平面变暗变小） ──
  /** 焦平面深度（相机空间距离；约等于初始半径，让心形中心清晰） */
  focalDepth: 950,
  /** 偏离焦平面多远开始完全雾化。范围越小远近反差越明显。 */
  dofRange: 900,
  /** 远处粒子最低透明度 */
  dofMinAlpha: 0.45,
  /** 远处粒子最低尺寸系数 */
  dofMinSize: 0.5,

  // ── 物理 ──
  /**
   * 收敛速度：粒子每帧（按 60fps 基准）向心形目标点移动的比例 0~1。
   * 采用直接位置插值（指数逼近），无速度累积、无过冲，到达后精确静止。
   * 值越大汇聚越快；0.08 约 0.5 秒贴合成形。
   */
  convergeSpeed: 0.08,
  /** 散布半径乘数（相对心形半径，初始粒子散布范围） */
  scatterRadiusMultiplier: 1.8,
} as const;

/** 握拳判定 */
export const SHUTTLE_DEFAULTS = { ...SHUTTLE } as const;

export const FIST = {
  /**
   * 判定四指弯曲的阈值：指尖到手腕距离 / 指根(MCP)到手腕距离（均为 x/y 平面 2D 距离）。
   * 小于该比值视为该指弯曲（指尖缩回到接近手掌）。
   * 伸直时该比值≈2.0、握拳时≈1.0，取 1.3 留容错且不误判张开手。
   */
  curlRatio: 1.2,
  /** 状态切换去抖：需连续达到该帧数才翻转 fist 状态 */
  debounceFrames: 5,
} as const;
