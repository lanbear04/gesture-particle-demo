import type { Landmark, Vec2 } from "../types";
import { LANDMARK } from "../types";
import { FIST, HEART, SHUTTLE } from "../config";
import { landmarkToCanvas } from "./coords";

/**
 * 二维欧氏距离（只取 x/y 平面，用归一化坐标，分辨率无关）。
 * 刻意不含 z：正对摄像头握拳时指尖朝镜头方向蜷起，z(深度)会突变且 MediaPipe
 * 的 z 估计本就不可靠，含 z 会让"指尖到腕"距离反而变大，导致握拳判定失效。
 */
function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scoreRange(value: number, low: number, high: number): number {
  return clamp01((value - low) / (high - low));
}

function directionDot(
  a0: Landmark,
  a1: Landmark,
  b0: Landmark,
  b1: Landmark,
): number {
  const ax = a1.x - a0.x;
  const ay = a1.y - a0.y;
  const bx = b1.x - b0.x;
  const by = b1.y - b0.y;
  const al = Math.sqrt(ax * ax + ay * ay) || 1e-6;
  const bl = Math.sqrt(bx * bx + by * by) || 1e-6;
  return (ax * bx + ay * by) / (al * bl);
}

function palmCenter(landmarks: Landmark[]): Landmark {
  const pts = [
    landmarks[LANDMARK.WRIST],
    landmarks[LANDMARK.INDEX_MCP],
    landmarks[LANDMARK.MIDDLE_MCP],
    landmarks[LANDMARK.RING_MCP],
    landmarks[LANDMARK.PINKY_MCP],
  ];
  return {
    x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
    y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    z: pts.reduce((sum, p) => sum + p.z, 0) / pts.length,
  };
}

function fingerFoldedTowardPalm(
  landmarks: Landmark[],
  mcpIdx: number,
  pipIdx: number,
  tipIdx: number,
  palmLen: number,
  center: Landmark,
): boolean {
  const tipPalm = dist(landmarks[tipIdx], center) / palmLen;
  const pipPalm = dist(landmarks[pipIdx], center) / palmLen;
  const tipMcp = dist(landmarks[tipIdx], landmarks[mcpIdx]) / palmLen;

  return tipPalm < pipPalm + 0.1 || tipMcp < 0.9;
}

function fingerStraightness(
  landmarks: Landmark[],
  mcpIdx: number,
  pipIdx: number,
  dipIdx: number,
  tipIdx: number,
): number {
  const chainLen =
    dist(landmarks[mcpIdx], landmarks[pipIdx]) +
    dist(landmarks[pipIdx], landmarks[dipIdx]) +
    dist(landmarks[dipIdx], landmarks[tipIdx]) ||
    1e-6;
  return dist(landmarks[mcpIdx], landmarks[tipIdx]) / chainLen;
}

/** 提取食指指尖并映射到 canvas 像素坐标 */
export function getIndexTip(
  landmarks: Landmark[],
  canvasWidth: number,
  canvasHeight: number,
): Vec2 {
  return landmarkToCanvas(
    landmarks[LANDMARK.INDEX_TIP],
    canvasWidth,
    canvasHeight,
  );
}

/** 提取中指指尖并映射到 canvas 像素坐标 */
export function getMiddleTip(
  landmarks: Landmark[],
  canvasWidth: number,
  canvasHeight: number,
): Vec2 {
  return landmarkToCanvas(
    landmarks[LANDMARK.MIDDLE_TIP],
    canvasWidth,
    canvasHeight,
  );
}

/** 单根手指相对手掌长度的伸展比：dist(指尖,腕) / 手掌长度。
 *  伸直时≈1.6-2.0，握拳时≈0.8-1.2。用手掌长度做参照最稳定（不随手指蜷曲变化）。 */
function fingerExtension(
  landmarks: Landmark[],
  tipIdx: number,
  palmLen: number,
): number {
  const wrist = landmarks[LANDMARK.WRIST];
  return dist(landmarks[tipIdx], wrist) / palmLen;
}

/** 握拳判定的诊断数据：四指伸展比 + 最终判定。用于调试标定。 */
export interface FistMetrics {
  ratios: number[];
  fist: boolean;
}

/**
 * 计算握拳判据并返回诊断数据。
 * 参照长度 = 手腕到中指根（手掌长度），四指伸展比均低于 FIST.curlRatio 视为握拳。
 */
export function fistMetrics(landmarks: Landmark[]): FistMetrics {
  const palmLen =
    dist(landmarks[LANDMARK.WRIST], landmarks[LANDMARK.MIDDLE_MCP]) || 1e-6;
  const ratios = [
    fingerExtension(landmarks, LANDMARK.INDEX_TIP, palmLen),
    fingerExtension(landmarks, LANDMARK.MIDDLE_TIP, palmLen),
    fingerExtension(landmarks, LANDMARK.RING_TIP, palmLen),
    fingerExtension(landmarks, LANDMARK.PINKY_TIP, palmLen),
  ];
  return {
    ratios,
    fist: ratios.every((r) => r < FIST.curlRatio),
  };
}

/**
 * 是否握拳：食/中/无名/小指四指均蜷曲（伸展比低于阈值）。
 * 拇指不参与判定（拇指弯曲方向特殊，MVP 简化）。
 */
export function isFist(landmarks: Landmark[]): boolean {
  return fistMetrics(landmarks).fist;
}

/**
 * 捏合程度 0~1：0=张开，1=捏紧。
 * 取拇指尖(4)→食指尖(8) 距离，用手掌长度归一抵消手离镜头远近的影响，
 * 再把比值从 [pinchClosedRatio, pinchOpenRatio] 反向映射并 clamp 到 [0,1]。
 */
export function pinchAmount(landmarks: Landmark[]): number {
  const palmLen =
    dist(landmarks[LANDMARK.WRIST], landmarks[LANDMARK.MIDDLE_MCP]) || 1e-6;
  const ratio =
    dist(landmarks[LANDMARK.INDEX_TIP], landmarks[LANDMARK.THUMB_TIP]) / palmLen;
  const { pinchOpenRatio: open, pinchClosedRatio: closed } = HEART;
  const t = (open - ratio) / (open - closed);
  return Math.max(0, Math.min(1, t));
}

/**
 * 是否五指完全张开：四指伸展比均高于 openExtendRatio。
 * 用于触发爱心爆发（"反握拳"）。拇指同样不参与，与握拳判定对称。
 */
export function isOpenHand(landmarks: Landmark[]): boolean {
  return fistMetrics(landmarks).ratios.every((r) => r > HEART.openExtendRatio);
}

/**
 * 穿梭模式的五指张开判定更宽松：用于推远相机，不需要像爱心爆发那样严格。
 */
export function isShuttleOpenHand(landmarks: Landmark[]): boolean {
  const ratios = fistMetrics(landmarks).ratios;
  const extendedCount = ratios.filter(
    (r) => r > SHUTTLE.openPalmExtendRatio,
  ).length;
  const curledCount = ratios.filter(
    (r) => r < SHUTTLE.openPalmCurlRejectRatio,
  ).length;
  return (
    extendedCount >= SHUTTLE.openPalmMinFingers &&
    curledCount <= SHUTTLE.openPalmMaxCurledFingers
  );
}

export type ShuttleBaseHandMode =
  | "radius"
  | "orbit-horizontal"
  | "orbit-vertical";

export type ShuttleHandMode =
  | "push-far"
  | "pull-near"
  | "pause"
  | "orbit-horizontal"
  | "orbit-vertical";

/**
 * 穿梭模式专用手势：
 * - radius: 握拳/五指张开控制远近；普通手型保持当前距离
 * - orbit-horizontal: 只伸食指，比 1，左右移动控制水平环绕
 * - orbit-vertical: 食指+中指并拢，左右移动控制上下环绕
 */
export function shuttleHandMode(landmarks: Landmark[]): ShuttleBaseHandMode {
  const palmLen =
    dist(landmarks[LANDMARK.WRIST], landmarks[LANDMARK.MIDDLE_MCP]) || 1e-6;
  const metrics = fistMetrics(landmarks);
  const [index, middle, ring, pinky] = metrics.ratios;
  const center = palmCenter(landmarks);
  const folded = {
    index: fingerFoldedTowardPalm(
      landmarks,
      LANDMARK.INDEX_MCP,
      LANDMARK.INDEX_PIP,
      LANDMARK.INDEX_TIP,
      palmLen,
      center,
    ),
    middle: fingerFoldedTowardPalm(
      landmarks,
      LANDMARK.MIDDLE_MCP,
      LANDMARK.MIDDLE_PIP,
      LANDMARK.MIDDLE_TIP,
      palmLen,
      center,
    ),
    ring: fingerFoldedTowardPalm(
      landmarks,
      LANDMARK.RING_MCP,
      LANDMARK.RING_PIP,
      LANDMARK.RING_TIP,
      palmLen,
      center,
    ),
    pinky: fingerFoldedTowardPalm(
      landmarks,
      LANDMARK.PINKY_MCP,
      LANDMARK.PINKY_PIP,
      LANDMARK.PINKY_TIP,
      palmLen,
      center,
    ),
  };
  const thumbIndexRatio =
    dist(landmarks[LANDMARK.INDEX_TIP], landmarks[LANDMARK.THUMB_TIP]) /
    palmLen;
  const twoFingerGap =
    dist(landmarks[LANDMARK.INDEX_TIP], landmarks[LANDMARK.MIDDLE_TIP]) /
    palmLen;
  const isExtended = (ratio: number, isFolded: boolean): boolean =>
    ratio > SHUTTLE.orbitFingerExtendRatio && !isFolded;
  const isFolded = (ratio: number, foldedTowardPalm: boolean): boolean =>
    foldedTowardPalm || ratio < SHUTTLE.orbitFingerCurlRatio;
  const isTwoFingerControlExtended = (ratio: number): boolean =>
    ratio > SHUTTLE.orbitFingerExtendRatio - 0.12;

  const indexExtended = isExtended(index, folded.index);
  const indexTwoFingerExtended = isTwoFingerControlExtended(index);
  const middleTwoFingerExtended = isTwoFingerControlExtended(middle);
  const middleFolded = isFolded(middle, folded.middle);
  const ringFolded = isFolded(ring, folded.ring);
  const pinkyFolded = isFolded(pinky, folded.pinky);
  const nonControlFoldedCount = [ringFolded, pinkyFolded].filter(Boolean).length;
  const indexStraightness = fingerStraightness(
    landmarks,
    LANDMARK.INDEX_MCP,
    LANDMARK.INDEX_PIP,
    LANDMARK.INDEX_DIP,
    LANDMARK.INDEX_TIP,
  );
  const middleStraightness = fingerStraightness(
    landmarks,
    LANDMARK.MIDDLE_MCP,
    LANDMARK.MIDDLE_PIP,
    LANDMARK.MIDDLE_DIP,
    LANDMARK.MIDDLE_TIP,
  );
  const twoFingerParallel = directionDot(
    landmarks[LANDMARK.INDEX_MCP],
    landmarks[LANDMARK.INDEX_TIP],
    landmarks[LANDMARK.MIDDLE_MCP],
    landmarks[LANDMARK.MIDDLE_TIP],
  );
  const twoFingerScore =
    scoreRange(SHUTTLE.twoFingerTogetherRatio + 0.2 - twoFingerGap, 0, 0.35) *
      0.32 +
    ((scoreRange(index, 1.25, 1.58) + scoreRange(middle, 1.25, 1.58)) / 2) *
      0.24 +
    ((scoreRange(indexStraightness, 0.68, 0.88) +
      scoreRange(middleStraightness, 0.68, 0.88)) /
      2) *
      0.24 +
    scoreRange(twoFingerParallel, 0.68, 0.94) * 0.12 +
    (nonControlFoldedCount / 2) * 0.08;
  const openCScore = scoreRange(thumbIndexRatio, HEART.pinchOpenRatio - 0.18, HEART.pinchOpenRatio);

  if (
    indexTwoFingerExtended &&
    middleTwoFingerExtended &&
    nonControlFoldedCount >= 1 &&
    twoFingerScore > 0.66 &&
    (openCScore < 0.75 || twoFingerScore > 0.84)
  ) {
    return "orbit-vertical";
  }

  if (indexExtended && middleFolded && ringFolded && pinkyFolded) {
    return "orbit-horizontal";
  }

  return "radius";
}
