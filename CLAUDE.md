# 手势粒子交互系统

## 项目定位

基于 AI 手势识别与粒子特效的浏览器端沉浸式交互 Demo。用户通过自然手势隔空操控虚拟粒子，适用于教学演示、艺术创作或远程协作场景。

## 核心体验

- 打开页面即自动请求摄像头，单手伸出即可开始交互。
- 食指指尖是粒子的"画笔"，移动时持续拖出光点；画面默认不额外绘制指尖追踪点。
- 四种粒子模式一键切换：爆炸、旋涡、爱心、穿梭。
- 手势直接改变粒子行为：握拳变色、捏合聚散、五指张开爆开；穿梭模式下握拳拉近、五指张开推远、普通手型保持相机距离，无手自动展示，比 1 控制水平环绕，食指+中指并拢并左右移动控制上下环绕。
- 镜头画面可随时切换；手部骨架可视化默认关闭，只在需要调试和对齐时手动打开。
- 全屏展示模式会隐藏按钮、状态、FPS/阈值和调参面板，并临时关闭骨架可视化，适合演示和录屏。

## 技术架构

- **手势识别**：MediaPipe Tasks Vision `HandLandmarker`（21 点，浏览器端推理，数据不出本地）。
- **渲染**：Canvas 2D + 自研粒子引擎；`lighter` 合成做发光效果，半透明覆盖产生拖尾；穿梭模式在 Canvas2D 中实现真 3D 透视投影与景深近似。
- **工程**：Vite + TypeScript，无前端框架，保持轻量。
- **资源**：WASM 与 `.task` 模型放在 `public/` 本地托管，不依赖 CDN，离线可用。

关键代码分布：

```
src/
├── main.ts              # 入口：组装 App、错误覆盖层
├── config.ts            # 全局可调参数
├── types.ts             # 共享类型、关键点索引、骨架连线
├── app/
│   ├── App.ts           # 主控状态机：手势→粒子→渲染
│   └── loop.ts          # requestAnimationFrame 主循环
├── hand/
│   ├── HandTracker.ts   # MediaPipe 初始化和每帧检测
│   ├── gestures.ts      # 握拳/捏合/张开判定
│   └── coords.ts        # 归一化关键点 → canvas 像素坐标
├── particles/
│   ├── Particle.ts      # 粒子对象池条目
│   ├── ParticleSystem.ts # 对象池、发射、更新
│   ├── trail.ts         # 拖尾渐隐
│   └── modes/
│       ├── ParticleMode.ts   # 模式接口
│       ├── ExplosionMode.ts  # 爆炸模式
│       ├── VortexMode.ts     # 旋涡模式
│       ├── HeartMode.ts      # 爱心模式
│       └── ShuttleMode.ts    # 穿梭模式（3D）
├── camera/
│   └── Camera.ts        # 3D 透视相机：手势远近/食指驱动环绕
├── math/
│   └── Vec3.ts          # 3D 向量、球坐标运算
├── render/
│   ├── Renderer.ts          # 渲染接口
│   └── Canvas2DRenderer.ts  # Canvas 2D 实现（含 3D 投影）
└── ui/
    └── controls.ts      # 按钮、快捷键、状态文本、全屏展示模式
```

## MVP 功能清单（已实现）

- [x] 单手 21 关键点实时追踪。
- [x] 粒子跟随食指指尖移动并产生拖尾；默认不额外绘制食指指尖追踪点，关键点骨架默认关闭。
- [x] 四种粒子模式一键切换：爆炸 / 旋涡 / 爱心 / 穿梭（按钮或 `1`/`2`/`3`/`4`）。
- [x] 握拳判定：四指伸展比均低于阈值时触发，爆炸/旋涡模式下粒子由青蓝变红。
- [x] 爱心模式：
  - 持续在屏幕中心生成粒子并吸向心形轮廓。
  - 捏合程度连续控制吸力强弱，粒子在"松散漂移"与"紧实聚形"之间过渡。
  - 心跳脉动：心形目标点按正弦缩放，产生呼吸感。
  - 五指张开触发爆发：普通粒子获得 outward 冲量，并沿心形轮廓生成高亮冲击波。
- [x] 穿梭模式：
  - 真 3D 透视：外层空心 3D 爱心 + 内层实心 3D 爱心位于世界空间，相机环绕观察。
  - 握拳拉近，五指张开推远，普通手型保持当前距离。
  - 手移出画面触发缓慢自动旋转展示。
  - 手指比 1 时，左右移动食指只控制水平环绕，不改变远近。
  - 食指+中指并拢时，左右移动双指只控制上下环绕，不改变远近。
  - 粒子一次性从四周飞入心形目标点并静止，所有视觉运动来自相机运动。
- [x] 穿梭模式运行时调参面板：结构、粒子密度、残影、自动旋转和相机距离均可滑块调整，并可保存为浏览器本地默认值。
- [x] 镜头画面显示三档循环：关闭 / 淡显 / 清晰（按钮或 `C`）。
- [x] 手部 21 点骨架可视化调试开关（按钮或 `H`，默认关闭），打开后指尖标红、骨架绿色。
- [x] 全屏展示模式（按钮或 `F`）：隐藏控制条、FPS/阈值、状态文本和调参面板，并临时关闭骨架可视化；退出后恢复进入前的骨架开关状态。
- [x] 左上角实时显示 FPS、四指伸展比、爱心模式捏合程度、穿梭模式远近值；底部状态显示穿梭模式当前识别到的相机手势。

## 手势定义与判定

所有判定基于 2D 归一化坐标（不含 z），因为 MediaPipe 的 z 估计在正对摄像头握拳时不可靠，含 z 反而会让握拳判定失效。

| 手势 | 判定依据 | 调参入口 |
|------|---------|---------|
| 握拳 | 食/中/无名/小指指尖到腕距离 ÷ 中指根到腕距离，四指均 `< FIST.curlRatio` | `config.ts` → `FIST.curlRatio` / `debounceFrames` |
| 捏合程度 0~1 | 拇指尖(4)到食指尖(8)距离 ÷ 手掌长度，映射到 `[pinchClosedRatio, pinchOpenRatio]` | `config.ts` → `HEART.pinchClosedRatio` / `pinchOpenRatio` |
| 五指张开（爱心爆发） | 四指伸展比均 `> HEART.openExtendRatio`；在上升沿触发一次，带冷却 | `config.ts` → `HEART.openExtendRatio` / `burstCooldownFrames` |
| 穿梭相机拉近 | 握拳进入 `pull-near`，相机半径平滑靠近 `orbitNearRadius` | `config.ts` → `SHUTTLE.orbitNearRadius` / `radiusLerpSpeed` |
| 穿梭相机推远 | 五指张开进入 `push-far`；判定比爱心爆发更宽松，允许小指等少量手指因角度偏短 | `config.ts` → `SHUTTLE.openPalmExtendRatio` / `openPalmMinFingers` / `openPalmMaxCurledFingers` / `orbitFarRadius` |
| 穿梭保持距离 | 普通手型进入 `pause`，冻结当前半径；无手时自动旋转展示 | `App.resolveShuttleHandMode` / `Camera.freezeRadius()` |
| 穿梭水平环绕 | 手指比 1：仅食指伸出，左右移动食指控制方位角，不改变远近 | `config.ts` → `SHUTTLE.orbitFingerExtendRatio` / `orbitFingerCurlRatio` / `azimuthSensitivity` |
| 穿梭双指上下环绕 | 食指+中指并拢：双指伸出且指尖间距小，左右移动控制上下环绕，不改变远近；使用 `twoFingerScore` 综合评分降低误判 | `config.ts` → `SHUTTLE.twoFingerTogetherRatio` / `orbitFingerExtendRatio` / `elevationSensitivity` |

握拳状态带 `debounceFrames` 去抖；穿梭模式手势状态还会在 `App.updateShuttleHandMode` 中做 2-3 帧稳定确认，避免远近/冻结/旋转手势逐帧误跳。相机驱动使用当前帧的 `rawShuttleHandMode`，因此远近控制和旋转手势切换时会立即接管控制；底部文案仍使用稳定后的 `lastShuttleHandMode`，减少显示闪烁。

穿梭双指识别不是单一阈值：`twoFingerScore` 综合两指指尖距离、食/中指伸展比、两指直度、两指方向平行度，以及无名指/小指退出控制的程度；双指足够贴近、伸直、平行时进入上下环绕。穿梭远近控制使用握拳/五指张开的离散手势；其中五指张开使用 `isShuttleOpenHand`，比爱心爆发的 `isOpenHand` 更宽松，不再依赖手靠近镜头、C 形松手或捏合，减少识别丢失和手势互抢的问题。

## 粒子模式

### 爆炸模式
粒子从指尖以随机方向高速射出，生命较短，纯靠初速度 + 全局阻尼向外炸开。

### 旋涡模式
粒子在指尖周围生成，受切向力旋转，同时受弱向心力拉回，形成围绕指尖的漩涡。

### 爱心模式
- 粒子在屏幕中心附近生成，被吸向预采样的心形目标点。
- 吸力由捏合程度线性插值：`pullMin`（张开）到 `pullMax`（捏紧）。
- 心形目标点随时间做正弦脉动（`pulseAmp` / `pulsePeriod`）。
- 贴近轮廓的粒子受切向呼吸抖动（`breatheAmp` / `breatheFreq`），保持"活"的质感。
- 聚焦梯度：越靠近心形轮廓的粒子越大越亮，远离则雾化变淡。
- 爆发时：
  - 所有普通粒子获得一次径向冲量 `burstSpeed`。
  - 沿心形轮廓发射一层高亮冲击波粒子（`shockwaveParticles` / `shockwaveSpeed` / `shockwaveLife`）。

### 穿梭模式
- 粒子一次性在 3D 世界空间中生成，从四散位置向心形目标点做位置插值汇聚，最终精确静止。
- 采用隐式心形体（implicit heart volume）拒绝采样：外层通过“大 3D 爱心 - 内部缩小 3D 爱心”形成空心厚壳，内层是独立实心 3D 爱心。
- 所有运动来自相机环绕：握拳拉近，五指张开推远，普通手型保持距离，无手自动旋转，手指比 1 控制水平环绕，食指+中指并拢并左右移动控制上下环绕。
- 旋转手势进入后会通过 `Camera.freezeRadius()` 锁住当前相机远近，只改变角度；锁定发生在原始手势候选出现的当前帧，而不是等稳定状态确认后才发生。
- 模式 4 手势有专用分类与稳定器：`shuttleHandMode` 负责 radius / orbit-horizontal / orbit-vertical，`App.resolveShuttleHandMode` 把 radius 细分为 pull-near / push-far / pause。
- 模式 4 相机控制使用当前帧原始手势 `rawShuttleHandMode` 驱动，避免上一稳定状态滞留导致远近控制或双指环绕切换不及时；UI 状态文本使用稳定模式展示。
- 渲染时按投影深度排序（后到前），并基于偏离焦平面的距离做尺寸与透明度衰减，近似景深虚化。
- 穿梭模式使用短残影淡出（`SHUTTLE.trailFadeAlpha`），不是硬清屏。
- 粒子生命设为极大值，在模式存续期间不消亡；离开穿梭模式时清场并恢复默认颜色。

## 可调参数

全局调参集中在 [src/config.ts](src/config.ts)：

- `PARTICLES.maxParticles`：对象池上限，池满自动限流。
- `PARTICLES.emitPerFrame`：每帧发射粒子数。
- `PARTICLES.damping`：全局速度阻尼。
- `TRAIL_FADE_ALPHA`：拖尾长度（值越小拖尾越长）。
- `COLORS`：默认色、握拳色、颜色插值速度。
- `FIST.*`：握拳阈值与去抖帧数。
- `HEART.*`：爱心采样点数、大小、吸力、脉动、爆发冲量、冲击波等。
- `HEART_COLORS`：爱心模式松散/紧实颜色。
- `SHUTTLE.*`：穿梭模式 3D 心形规模、外层空心壳厚度、内层实心爱心比例、相机环绕半径范围、景深虚化参数、短残影、自动旋转和模式 4 专用手势阈值（含更宽松的五指张开推远阈值）。

运行时还可通过 `Params` 面板调整穿梭模式参数：

- `Heart shape`：外层大小/厚度、外层空心壳厚、内层大小/厚度。
- `Particle density`：粒子总量、内层占比、外/内层粒径。
- `Motion`：残影长度、自动旋转速度。
- `Camera`：最远相机距离。
- `Save default` 将当前值保存到浏览器 `localStorage`（key: `gesture-particle.shuttle-tuning.v1`）；`Reset` 回到已保存默认值，若无保存则回到 `SHUTTLE_DEFAULTS`。

## 性能与稳定性注记

- 渲染循环 60fps，摄像头约 30fps。`HandTracker.detect` 对视频帧未推进的情况返回 `"stale"`，`App` 保持上一帧手势状态，避免握拳信号在 60fps 下反复闪烁导致去抖失效。
- 粒子使用固定大小对象池，运行期不 `new`，避免 GC 抖动。
- Canvas 按 `devicePixelRatio`（最高 2x）设置后备缓冲，绘制坐标使用 CSS 像素。
- `Loop` 对 `dt` 封顶 0.05s，切后台返回时不会出现巨大跳变。
- 穿梭模式每帧按投影深度对粒子排序，配合 `lighter` 合成营造体积光感；粒子量增大时可无缝迁移到 WebGL 渲染器。

## 明确不做

- 双手交互与多用户协作。
- 自定义粒子编辑器。
- 复杂手势组合（如指定顺序的多步手势）。
- 录制/回放手势操作序列（MVP 阶段不实现）。
- 云端存储与分享功能。

## 后续可扩展方向

- 双手交互：双手捏合缩放粒子、双手靠拢吸引。
- 更多预设场景：星云、火焰、雪花等。
- 录制回放：把每帧 `GestureState` 序列化到 `localStorage` 或下载为 JSON。
- WebGL 渲染器：粒子量增大时替换 `Canvas2DRenderer`，上层依赖 `Renderer` 接口无需改动。
- 声音反馈：爆发/切换模式时触发音效。
