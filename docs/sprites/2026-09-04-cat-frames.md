# 小猫 sprite 素材资源规范

> 文档日期：2026-09-04 ｜ 项目：pixel-pet-english ｜ 物种：小猫（cat）

本文件定义电子宠物游戏中**小猫（cat）**物种的阶段化像素精灵素材，以及当前实现与后续美术打磨边界。

参考：游戏运行时使用 `scripts/build.js` 把 PNG 转 base64 注入 `window.__PET_IMGS__`，`src/app.js` 的 `drawPet` 按 `PET_FRAMES` 表按需取帧。

---

## 1. 技术规格（所有帧通用）

| 项 | 值 |
|---|---|
| 画布尺寸 | **48×48 px**（运行时画布，与角色站姿底边对齐） |
| 网格基准 | 16×16 逻辑格（3× 像素放大） |
| 背景 | **透明**（禁止任何背景色/阴影/底板） |
| 调色板 | 主体橘色 tabby：`B=#ef8a76`（橘）/ `S=#b85a3a`（暗部）/ `A=#f6c445`（黄点缀）/ `W=#fff6ea`（高光）/ `O=#3a2a1f`（描边） |
| 风格 | chunky pixel、可见像素、暖色暗棕轮廓 |
| 视角 | **正向**（朝相机方向），走路帧用侧视（朝右，向左走由 CSS `scaleX(-1)` 翻转） |
| 文件格式 | PNG-24+alpha，**无压缩索引**保留，便于后续脚本处理 |

### 命名约定

```
{ species }-{ animation }[ -{ index }].png

species:   cat（小猫）
animation: baby | kid | adult | walk-{0..6} | eat-{0..2} | sleep-{0,1}
                | happy-{0..2} | excited-{0..2} | idle-{0,1} | blink
                | droopy | sad-{0,1} | wash-{0,1} | grunt-{0,1}
```

例：`cat-baby.png`、`cat-walk-3.png`、`cat-eat.png`。

---

## 2. 当前已实现（feature/gpt-cat-sprites 分支）

来源：`gpt-assets/ChatGPT Image 2026年9月4日 00_35_05.png`，经 `scripts/process-pet-frames.py` 切割。

### 2.1 原始素材清单（14 个，可按名检索）

以下文件位于 **`feature/gpt-cat-sprites` 分支**的 `assets/sprites/` 目录（main 分支无 PNG 素材）：

**成长阶段站姿（3 个）**
- `cat-baby.png` — 奶猫站姿（Lv5–8）
- `cat-kid.png` — 猫崽站姿（Lv9–12）
- `cat-adult.png` — 大猫站姿（Lv13+）

**走路循环（7 个，110ms/帧，朝右）**
- `cat-walk-0.png`
- `cat-walk-1.png`
- `cat-walk-2.png`
- `cat-walk-3.png`
- `cat-walk-4.png`
- `cat-walk-5.png`
- `cat-walk-6.png`

**状态底图（4 个，供阶段化管线派生）**
- `cat-eat.png` — 吃饭低头饭碗底图
- `cat-sleep.png` — 睡觉蜷卧底图
- `cat-happy.png` — 开心跳跃底图
- `cat-big.png` — 早期兴奋底图（当前运行时已由三阶段 `excited-0..2` 替代）

**代码映射结构**（`src/app.js` 的 `PET_FRAMES`）：
```js
cat: { stage: { 0: 'cat-egg', 1: 'cat-baby', 2: 'cat-kid', 3: 'cat-adult' },
       expr: { idle: { 0: [...], 1: [...], 2: [...], 3: [...] },
               eat: { 0: [...], 1: [...], 2: [...], 3: [...] },
               sleep: { 0: [...], 1: [...], 2: [...], 3: [...] },
               happy: { 0: [...], 1: [...], 2: [...], 3: [...] },
               excited: { 0: [...], 1: [...], 2: [...], 3: [...] }, ... },
       walk: { 1: 'cat-baby-walk-', 2: 'cat-kid-walk-', 3: 'cat-walk-' } }
```

这 14 个是原始底图；运行时实际使用的阶段化帧由 `scripts/process-cat-idle.py`、
`scripts/process-cat-states.py` 和 `scripts/process-cat-sleep-walk.py` 生成，均已登记到 `PET_FRAMES`。

---

## 3. 完整帧清单（当前态）

P0/P1/P2 分级，与功能缺口对应。

### 3.1 常驻与基础动画（P0，补齐「缺动画」缺口）

| 动画 | 帧数 | 用途 | 播放 |
|---|---|---|---|
| `cat-baby` | 1 | 阶段 1 奶猫站姿（Lv5–8） | 静态主帧 |
| `cat-kid` | 1 | 阶段 2 猫崽站姿（Lv9–12） | 静态主帧 |
| `cat-adult` | 1 | 阶段 3 大猫站姿（Lv13+） | 静态主帧 |
| `cat-idle-0` / `cat-idle-1` | 2 | 待机呼吸（A 站姿 / B 微沉） | 800ms 交替，常驻 |
| `cat-blink` | 1 | 眨眼（闭眼帧） | 与 idle 交替 ~200ms |
| `cat-walk-0..6` | 7 | 走路（已实现） | 110ms 循环 |

### 3.2 状态动画（P0/P1，覆盖游戏交互）

| 动画 | 帧数 | 用途 | 优先级 |
|---|---|---|---|
| `cat-eat-0..2` | 3 | 吃饭：低头咬 / 闭嘴嚼 / 抬头咽 | P0 |
| `cat-sleep-0..1` | 2 | 睡觉：呼吸 + Zzz 位置变 | P0 |
| `cat-happy-0..2` | 3 | 开心：弹跳低位 / 高位张嘴笑 / 落地 | P0 |
| `cat-excited-0..2` | 3 | 兴奋/跳舞：跳 A / 跳 B / 星星眼 | P1 |
| `cat-droopy` | 1 | 没精打采（饿/脏） | P1（1 帧静态可接受） |
| `cat-sad-0..1` | 2 | 难过：抽泣两相（泪滴位置变） | P1 |
| `cat-wash-0..1` | 2 | 搓澡：左蹭 / 右蹭 + 泡泡 | P2 |
| `cat-grunt-0..1` | 2 | 用力/拉屎：憋气两相（脸红） | P2 |

### 3.3 走路帧扩展（P2）

| 动画 | 帧数 | 用途 |
|---|---|---|
| `cat-baby-walk-0..6` | 7 | 奶猫走路侧影（阶段缩放） |
| `cat-kid-walk-0..6` | 7 | 猫崽走路侧影（阶段缩放） |

> 当前 `cat-walk-*` 是成年猫的侧影，奶猫/猫崽走路时直接使用成年走路帧，比例略显违和。

---

## 4. 逻辑帧汇总表

| 类别 | 帧数 | 累计 |
|---|---|---|
| 成长阶段（站姿） | 3 | 3 |
| 待机呼吸 | 2 | 5 |
| 眨眼 | 1 | 6 |
| 走路（成年） | 7 | 13 |
| 吃饭 | 3 | 16 |
| 睡觉 | 2 | 18 |
| 开心 | 3 | 21 |
| 兴奋 | 3 | 24 |
| 没劲 | 1 | 25 |
| 难过 | 2 | 27 |
| 搓澡 | 2 | 29 |
| 用力 | 2 | 31 |
| 走路（奶猫） | 7 | 38 |
| 走路（猫崽） | 7 | **45** |

**P0 子集（当前优先）**：成长阶段 3 + 待机 2 + 眨眼 1 + 走路 7 + 吃饭 3 + 睡觉 2 + 开心 3 = **21 帧**。

---

## 5. 当前缺口与建议生成顺序

1. **已完成**：成长阶段、待机呼吸、眨眼、吃饭、睡觉、开心，共 **21 个逻辑帧**
2. **已完成**：兴奋、没劲、难过，共 **6 个逻辑帧**
3. **已完成**：搓澡、用力、奶猫走路、猫崽走路，共 **18 个逻辑帧**（走路按 7 帧循环）
4. **可选打磨**：成人阶段的脸部差分仍可换成更夸张的美术稿，但不再是功能缺口。

---

## 6. 生成提示词模板（参考）

适用于 ChatGPT/DALL·E 类工具。P0 全部状态可一次性生成在同一张 sprite sheet 上：

```
A sprite sheet of [N] cat sprites arranged in a single horizontal row,
transparent background, cute retro pixel art style with chunky visible
pixels and a soft dark-brown outline (#3a2a1f), for a tamagotchi-style
virtual pet game. Same orange tabby cat in all frames: warm cream
belly/chest (#fff6ea), orange body (#ef8a76), darker orange shading
(#b85a3a), yellow accent (#f6c445). Same size 48×48 px, bottom-aligned,
evenly spaced, no grid lines, no shadows, no text.

[per-frame description here, each describing only what differs]
```

生成后用 `scripts/process-pet-frames.py`（`scripts/` 下）切割：
- 连通域检测 + 垂直投影合并 + 列缝切分
- 统一缩放到 48px ref 高度
- 64 色调色板量化

切割产物直接放到 `assets/sprites/`，`scripts/build.js` 会自动 base64 注入。

---

## 7. 接入检查清单（每次新动画完成后）

- [ ] 文件已落到 `assets/sprites/` 并符合命名约定
- [ ] `src/app.js` 的 `PET_FRAMES[cat].expr` / `.stage` 已登记新键
- [ ] `drawPet` PNG 分支能命中该键（即有 `PET_IMG_EL[key]`）
- [ ] `scripts/build.js` 重新生成 `pixel-pet-english.html`
- [ ] 试验台（test-bench）页面能预览新动画（点对应 chip）

---

## 8. 相关文件位置

| 路径 | 角色 |
|---|---|
| `assets/sprites/` | PNG 素材落点（运行时打包进 HTML） |
| `scripts/build.js` | PNG → base64 注入 |
| `scripts/process-pet-frames.py` | GPT sheet 切割工具 |
| `src/app.js`（`PET_FRAMES` + `drawPet`） | 帧调度与渲染 |
| `gpt-assets/` | 原始 GPT 生成图（feature 分支） |
| `pets-assets/` | 第三方素材调研（feature 分支，未采用） |
