import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { Landmark } from "../types";
import { ASSETS } from "../config";

/**
 * 封装 MediaPipe HandLandmarker：初始化模型、逐帧检测，输出单手 21 点。
 * VIDEO 模式，numHands=1，多手时只取第一只。
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastVideoTime = -1;

  /** 加载 WASM + 模型。需在使用前 await。 */
  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(ASSETS.wasmDir);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: ASSETS.modelPath,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }

  /**
   * 检测一帧。返回值三态：
   * - Landmark[]：检测到手
   * - null：本帧已检测，但画面中无手
   * - "stale"：视频帧未推进（渲染 ~60fps 但摄像头 ~30fps），本帧无新数据，
   *   调用方应保持上一帧状态，不可当作"无手"处理。
   *
   * MediaPipe 要求 timestamp 单调递增，同一 currentTime 不能重复检测。
   */
  detect(
    video: HTMLVideoElement,
    timestampMs: number,
  ): Landmark[] | null | "stale" {
    if (!this.landmarker) return "stale";
    if (video.currentTime === this.lastVideoTime) return "stale";
    this.lastVideoTime = video.currentTime;

    const result: HandLandmarkerResult = this.landmarker.detectForVideo(
      video,
      timestampMs,
    );
    const hand = result.landmarks[0];
    return hand && hand.length > 0 ? hand : null;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
