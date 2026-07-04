/**
 * requestAnimationFrame 主循环。计算帧间隔 dt（秒，封顶防止切后台后跳变），
 * 维护平滑 FPS，逐帧回调 tick(dt)。
 */
export class Loop {
  private rafId = 0;
  private lastTime = 0;
  private running = false;
  private fps = 0;

  constructor(private readonly tick: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  getFps(): number {
    return this.fps;
  }

  private frame = (now: number): void => {
    if (!this.running) return;

    // dt 封顶 0.05s（切后台/卡顿后回来不会出现巨大跳变）
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (dt > 0) {
      // 指数平滑 FPS，读数更稳
      this.fps += (1 / dt - this.fps) * 0.1;
    }

    this.tick(dt);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
