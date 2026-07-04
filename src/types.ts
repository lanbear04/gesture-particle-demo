// 共享类型定义

/** 二维向量 / 坐标点 */
export interface Vec2 {
  x: number;
  y: number;
}

/** 三维向量 / 坐标点（穿梭模式的世界坐标） */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * MediaPipe 手部关键点。坐标已归一化到 [0,1]（相对视频帧），z 为相对深度。
 * 一只手共 21 个点，索引含义见 LANDMARK。
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** RGB 颜色，分量范围 0-255 */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 粒子模式标识 */
export type ParticleModeName = "explosion" | "vortex" | "heart" | "shuttle";

/** 手势状态：每帧由关键点解算得出，供 App 状态机消费 */
export interface GestureState {
  /** 是否检测到手 */
  present: boolean;
  /** 食指指尖坐标（canvas 像素），无手时为 null */
  indexTip: Vec2 | null;
  /** 是否握拳 */
  fist: boolean;
}

/** 常用关键点索引（MediaPipe 21 点标准） */
export const LANDMARK = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

/**
 * MediaPipe 手部骨架连线（21 点之间的"骨头"），用于可视化调试。
 * 五指各 4 段 + 掌部横向连接。
 */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // 拇指
  [0, 1], [1, 2], [2, 3], [3, 4],
  // 食指
  [0, 5], [5, 6], [6, 7], [7, 8],
  // 中指
  [9, 10], [10, 11], [11, 12],
  // 无名指
  [13, 14], [14, 15], [15, 16],
  // 小指
  [0, 17], [17, 18], [18, 19], [19, 20],
  // 掌部横向（指根相连）
  [5, 9], [9, 13], [13, 17],
];
