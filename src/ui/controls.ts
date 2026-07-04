import type { App, ShuttleTuning, ShuttleTuningKey } from "../app/App";
import type { ShuttleHandMode } from "../hand/gestures";
import type { ParticleModeName } from "../types";

type TuningControl = {
  key: ShuttleTuningKey;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  regenerate: boolean;
};

const TUNING_CONTROLS: readonly TuningControl[] = [
  { key: "heartScale", label: "Outer size", group: "Heart shape", min: 360, max: 760, step: 10, regenerate: true },
  { key: "heartDepth", label: "Outer depth", group: "Heart shape", min: 160, max: 720, step: 10, regenerate: true },
  { key: "outerShellThickness", label: "Shell thickness", group: "Heart shape", min: 0.08, max: 0.8, step: 0.01, regenerate: true },
  { key: "innerScale", label: "Inner size", group: "Heart shape", min: 0.2, max: 0.75, step: 0.01, regenerate: true },
  { key: "innerDepthScale", label: "Inner depth", group: "Heart shape", min: 0.18, max: 0.8, step: 0.01, regenerate: true },
  { key: "samplePoints", label: "Particles", group: "Particle density", min: 1600, max: 9000, step: 100, regenerate: true },
  { key: "innerPointRatio", label: "Inner ratio", group: "Particle density", min: 0.12, max: 0.55, step: 0.01, regenerate: true },
  { key: "baseRadius", label: "Outer radius", group: "Particle density", min: 1.2, max: 4.2, step: 0.1, regenerate: true },
  { key: "innerRadiusScale", label: "Inner radius", group: "Particle density", min: 0.65, max: 1.6, step: 0.01, regenerate: true },
  { key: "trailFadeAlpha", label: "Trail fade", group: "Motion", min: 0.18, max: 0.75, step: 0.01, regenerate: false },
  { key: "autoRotateSpeed", label: "Auto rotate", group: "Motion", min: 0, max: 0.9, step: 0.01, regenerate: false },
  { key: "orbitFarRadius", label: "Far distance", group: "Camera", min: 900, max: 2800, step: 50, regenerate: false },
];

const MODE_LABELS: Record<ParticleModeName, string> = {
  explosion: "爆炸",
  vortex: "旋涡",
  heart: "爱心",
  shuttle: "穿梭",
};

/** 镜头显示三档：关闭 / 淡显（默认背景）/ 清晰 */
type CameraVisibility = "off" | "dim" | "clear";
const CAMERA_ORDER: CameraVisibility[] = ["off", "dim", "clear"];
const CAMERA_LABELS: Record<CameraVisibility, string> = {
  off: "镜头：关闭",
  dim: "镜头：淡显",
  clear: "镜头：清晰",
};
const CAMERA_CLASSES: Record<CameraVisibility, string> = {
  off: "cam-off",
  dim: "",
  clear: "cam-clear",
};

/** 状态文本更新器：由 App 的 onStatus 回调调用 */
export interface StatusUpdater {
  update(info: {
    fps: number;
    mode: ParticleModeName;
    fist: boolean;
    handPresent: boolean;
    ratios: number[] | null;
    pinch: number;
    paused: boolean;
    shuttleHandMode: ShuttleHandMode;
  }): void;
}

function formatTuningValue(value: number, step: number): string {
  if (step >= 1) return Math.round(value).toString();
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return value.toFixed(decimals);
}

function createTuningPanel(app: App): {
  toggle(): void;
  hide(): void;
  sync(): void;
} {
  const panel = document.createElement("div");
  panel.id = "tuning-panel";
  panel.className = "hidden";

  const head = document.createElement("div");
  head.className = "tuning-head";
  const title = document.createElement("div");
  title.className = "tuning-title";
  title.textContent = "Shuttle tuning";
  const actions = document.createElement("div");
  actions.className = "tuning-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "tuning-save";
  save.textContent = "Save default";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "tuning-reset";
  reset.textContent = "Reset";
  actions.append(save, reset);
  head.append(title, actions);
  panel.append(head);

  const controlsByKey = new Map<
    ShuttleTuningKey,
    { input: HTMLInputElement; value: HTMLElement; control: TuningControl }
  >();

  const groups = Array.from(new Set(TUNING_CONTROLS.map((control) => control.group)));
  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "tuning-group";
    const groupTitle = document.createElement("div");
    groupTitle.className = "tuning-group-title";
    groupTitle.textContent = group;
    section.append(groupTitle);

    for (const control of TUNING_CONTROLS.filter((item) => item.group === group)) {
      const row = document.createElement("label");
      row.className = "tuning-row";
      const name = document.createElement("span");
      name.textContent = control.label;
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      const value = document.createElement("span");
      value.className = "tuning-value";
      row.append(name, input, value);
      section.append(row);
      controlsByKey.set(control.key, { input, value, control });
    }

    panel.append(section);
  }

  document.body.append(panel);

  let pending: Partial<ShuttleTuning> = {};
  let pendingRegenerate = false;
  let pendingTimer = 0;

  const sync = (): void => {
    const tuning = app.getShuttleTuning();
    for (const [key, entry] of controlsByKey) {
      const current = tuning[key];
      entry.input.value = String(current);
      entry.value.textContent = formatTuningValue(current, entry.control.step);
    }
  };

  const applyPending = (): void => {
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    }
    const values = pending;
    const regenerate = pendingRegenerate;
    pending = {};
    pendingRegenerate = false;
    app.updateShuttleTuning(values, regenerate);
  };

  const scheduleApply = (control: TuningControl, value: number): void => {
    pending[control.key] = value;
    pendingRegenerate = pendingRegenerate || control.regenerate;
    if (pendingTimer) window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(applyPending, control.regenerate ? 140 : 40);
  };

  for (const { input, value, control } of controlsByKey.values()) {
    input.addEventListener("input", () => {
      const next = Number(input.value);
      value.textContent = formatTuningValue(next, control.step);
      scheduleApply(control, next);
    });
    input.addEventListener("change", applyPending);
  }

  reset.addEventListener("click", () => {
    pending = {};
    pendingRegenerate = false;
    if (pendingTimer) window.clearTimeout(pendingTimer);
    app.resetShuttleTuning();
    sync();
  });

  save.addEventListener("click", () => {
    applyPending();
    app.saveCurrentShuttleTuningAsDefault();
    save.textContent = "Saved";
    window.setTimeout(() => {
      save.textContent = "Save default";
    }, 1000);
  });

  sync();

  return {
    toggle() {
      panel.classList.toggle("hidden");
    },
    hide() {
      panel.classList.add("hidden");
    },
    sync,
  };
}

/**
 * 绑定 UI 控件：模式切换按钮、键盘 1/2 快捷键。
 * 返回一个 StatusUpdater，供 main 接到 App.onStatus 上驱动状态/FPS 文本。
 */
export function bindControls(app: App): StatusUpdater {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#ui button[data-mode]"),
  );
  const statusEl = document.getElementById("status");
  const fpsEl = document.getElementById("fps");
  const uiEl = document.getElementById("ui");
  const tuningPanel = createTuningPanel(app);
  const tuningBtn = document.createElement("button");
  tuningBtn.type = "button";
  tuningBtn.id = "toggle-tuning";
  tuningBtn.textContent = "Params";
  uiEl?.insertBefore(tuningBtn, statusEl);
  let tuningOpen = false;

  const toggleTuning = (): void => {
    if (document.body.classList.contains("immersive")) return;
    tuningOpen = !tuningOpen;
    tuningPanel.toggle();
    tuningBtn.classList.toggle("active", tuningOpen);
  };
  tuningBtn.addEventListener("click", toggleTuning);

  const closeTuning = (): void => {
    tuningOpen = false;
    tuningPanel.hide();
    tuningBtn.classList.remove("active");
  };

  const syncActive = (): void => {
    for (const btn of buttons) {
      btn.classList.toggle("active", btn.dataset.mode === app.mode);
    }
  };

  const selectMode = (mode: ParticleModeName): void => {
    app.setMode(mode);
    syncActive();
  };

  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      selectMode(btn.dataset.mode as ParticleModeName);
    });
  }

  // 镜头显示开关：按钮点击 / 键盘 C 循环 关闭→淡显→清晰
  const videoEl = document.getElementById("video");
  const cameraBtn = document.getElementById("toggle-camera");
  let cameraVis: CameraVisibility = "dim";

  const applyCamera = (): void => {
    if (videoEl) {
      videoEl.classList.remove("cam-off", "cam-clear");
      const cls = CAMERA_CLASSES[cameraVis];
      if (cls) videoEl.classList.add(cls);
    }
    if (cameraBtn) cameraBtn.textContent = CAMERA_LABELS[cameraVis];
  };

  const cycleCamera = (): void => {
    const next = (CAMERA_ORDER.indexOf(cameraVis) + 1) % CAMERA_ORDER.length;
    cameraVis = CAMERA_ORDER[next];
    applyCamera();
  };

  cameraBtn?.addEventListener("click", cycleCamera);

  // 关键点骨架开关：按钮点击 / 键盘 H
  const landmarksBtn = document.getElementById("toggle-landmarks");
  const applyLandmarks = (): void => {
    const on = app.landmarksVisible;
    landmarksBtn?.classList.toggle("active", on);
    if (landmarksBtn) landmarksBtn.textContent = on ? "关键点：开" : "关键点：关";
  };
  const toggleLandmarks = (): void => {
    if (document.body.classList.contains("immersive")) return;
    app.setShowLandmarks(!app.landmarksVisible);
    applyLandmarks();
  };
  landmarksBtn?.addEventListener("click", toggleLandmarks);

  const fullscreenBtn = document.getElementById("toggle-fullscreen");
  let landmarksBeforeImmersive = app.landmarksVisible;

  const setImmersive = async (
    enabled: boolean,
    syncBrowserFullscreen = true,
  ): Promise<void> => {
    document.body.classList.toggle("immersive", enabled);
    fullscreenBtn?.classList.toggle("active", enabled);
    if (fullscreenBtn) fullscreenBtn.textContent = enabled ? "退出全屏" : "全屏";

    if (enabled) {
      closeTuning();
      landmarksBeforeImmersive = app.landmarksVisible;
      if (app.landmarksVisible) {
        app.setShowLandmarks(false);
        applyLandmarks();
      }
      if (syncBrowserFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => undefined);
      }
      return;
    }

    if (app.landmarksVisible !== landmarksBeforeImmersive) {
      app.setShowLandmarks(landmarksBeforeImmersive);
      applyLandmarks();
    }
    if (syncBrowserFullscreen && document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  const toggleFullscreen = (): void => {
    void setImmersive(!document.body.classList.contains("immersive"));
  };

  fullscreenBtn?.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("immersive")) {
      void setImmersive(false, false);
    }
  });

  // 键盘 1 = 爆炸，2 = 旋涡，3 = 爱心，4 = 穿梭，C = 切换镜头显示，H = 切换关键点
  window.addEventListener("keydown", (e) => {
    if (e.key === "1") selectMode("explosion");
    else if (e.key === "2") selectMode("vortex");
    else if (e.key === "3") selectMode("heart");
    else if (e.key === "4") selectMode("shuttle");
    else if (e.key === "c" || e.key === "C") cycleCamera();
    else if (e.key === "h" || e.key === "H") toggleLandmarks();
    else if (e.key === "t" || e.key === "T") toggleTuning();
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
  });

  syncActive();
  applyCamera();
  applyLandmarks();

  return {
    update({ fps, mode, fist, handPresent, ratios, pinch, paused, shuttleHandMode }) {
      if (fpsEl) {
        const dbg = ratios ? ` · 伸展比 ${ratios.map((r) => r.toFixed(2)).join(" ")}` : "";
        const controlDbg =
          mode === "heart"
            ? ` · 捏合 ${pinch.toFixed(2)}`
            : mode === "shuttle"
              ? ` · 远近 ${pinch.toFixed(2)}`
              : "";
        fpsEl.textContent = `FPS: ${fps}${dbg}${controlDbg}`;
      }
      if (statusEl) {
        let gesture: string;
        if (!handPresent && mode === "shuttle") {
          gesture = "无手：自动展示";
        } else if (!handPresent) {
          gesture = "未检测到手";
        } else if (mode === "shuttle") {
          if (shuttleHandMode === "orbit-horizontal") {
            gesture = "比1：水平环绕";
          } else if (shuttleHandMode === "orbit-vertical") {
            gesture = "双指：上下环绕";
          } else if (shuttleHandMode === "pause" || paused) {
            gesture = "保持距离";
          } else if (shuttleHandMode === "pull-near") {
            gesture = "握拳：拉近";
          } else {
            gesture = "五指张开：推远";
          }
        } else if (mode === "heart") {
          gesture = pinch > 0.5 ? "捏合 🤌" : "张开 🖐️";
        } else {
          gesture = fist ? "握拳 ✊" : "张开 ✋";
        }
        statusEl.textContent = `${MODE_LABELS[mode]} · ${gesture}`;
      }
    },
  };
}
