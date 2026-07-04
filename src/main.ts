import { App } from "./app/App";
import { bindControls } from "./ui/controls";

const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const overlay = document.getElementById("overlay") as HTMLElement;
const overlayMsg = document.getElementById("overlay-msg") as HTMLElement;

function showOverlay(message: string): void {
  overlay.classList.remove("hidden");
  overlayMsg.textContent = message;
}

function hideOverlay(): void {
  overlay.classList.add("hidden");
}

/** 把异常翻译成对用户友好的中文提示 */
function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError")
      return "摄像头权限被拒绝。请在浏览器地址栏的权限设置中允许摄像头，然后刷新页面。";
    if (err.name === "NotFoundError")
      return "未检测到摄像头设备。请连接摄像头后刷新页面。";
    return `摄像头打开失败：${err.message}`;
  }
  if (err instanceof Error) return `初始化失败：${err.message}`;
  return "初始化失败，请刷新重试。";
}

async function main(): Promise<void> {
  const app = new App(video, canvas);
  const status = bindControls(app);
  app.setStatusCallback(status.update);

  try {
    showOverlay("正在打开摄像头并加载手势识别模型…");
    await app.init();
    hideOverlay();
    app.start();
  } catch (err) {
    console.error(err);
    showOverlay(describeError(err));
  }
}

void main();
