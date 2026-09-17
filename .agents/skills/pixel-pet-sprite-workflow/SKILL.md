---
name: pixel-pet-sprite-workflow
description: pixel-pet-english 项目专用的像素宠物精灵制作/翻新工作流（mmx 出图 + 量化 + 程序差分渲染）。当用户要求制作或翻新宠物精灵（fox/dragon/cat/dog 等物种的 kid/teen/adult 三阶段）、修改已有精灵的表情或动画、调整脸部锚点/气泡/Zz/走路动画、或将新精灵接入运行时 PET_FRAMES 时使用。核心流程：mmx 出参考图 → 量化 → 清理背景/阴影 → 表驱动锚点差分渲染 28 pose → 接入 src/app.js → build → commit。
---

# Pixel Pet Sprite Workflow

pixel-pet-english 项目专用精灵制作工作流。**核心思路**：mmx 负责"好看的造型和比例"
（AI 擅长的审美），程序负责"精确的像素级表情差分"（代码擅长的可复现性）。

## 项目上下文（已知事实）

- 项目根：`/Users/wuruofan/mine/rfw/pixel-pet-english`；分支：`feature/gpt-cat-sprites`
- 画布：kid/teen=36×38、adult=44×48（dragon teen=40×44）；运行时统一 48×48 底边对齐
- 命名：`<物种>-<stage>-v2.png` + `<前缀>-{pose}.png`；蛋共用 `cat-egg-v2`（勿做专属蛋）
- 三阶段：stage 1=kid（幼年）、2=teen（中间）、3=adult（成年）；蛋=stage 0
- 全量 28 pose/stage：idle-0/1, blink, droopy, eat-0/1/2, excited-0/1/2, grunt-0/1,
  happy-0/1/2, sad-0/1, sleep-0/1, walk-0~6, wash-0/1
- build：`node scripts/build.js` → `pixel-pet-english.html`（自包含单文件）

## 工作流总览

```
mmx 出参考图 → quantize.py 量化 → clean-base.py 清背景/阴影 → sprite-differential.py 差分渲染
→ 接入 src/app.js PET_FRAMES → node scripts/build.js → 浏览器验证 → git commit
```

## 快速开始（新物种 / 翻新）

1. **mmx 出图**：参考 `references/prompts.md` 的 prompt 模板。三阶段各出 4 张候选选最好。
   **teen 必须用 pixel art + POKEMON + PERFECT FRONT VIEW + 100% SYMMETRICAL 组合**，否则必出侧脸。
2. **量化**：`python3 <skill>/scripts/quantize.py <mmx图> <输出.png> <宽> <高>`
   （8x LANCZOS → 24 色 MEDIANCUT → NEAREST；量化后脸常消失 → 靠差分脚本程序画脸）
3. **清背景**：`python3 <skill>/scripts/clean-base.py <输入> <输出> <bg_r> <bg_g> <bg_b> [tolerance]`
   （flood fill 从边缘 + 孤立像素补刀；**底部地面阴影需单独清除**）
4. **差分渲染**：复制 `<skill>/scripts/sprite-differential.py` 到项目 `scripts/`，
   改 `STAGES` 配置（clean base 路径、FACE 锚点表、气泡/擦除区域、输出前缀）后运行。
   锚点表结构见 `references/anchor-guide.md`。
5. **接入运行时**：在 `src/app.js` 的 `PET_FRAMES` 注册新物种（结构见 anchor-guide）。
6. **build + 验证 + 提交**：`node scripts/build.js` → 浏览器检查 → `git commit`。

## 关键约束（用户已拍板，勿偏离）

- **走路 = 跳跳蹦蹦**（offset_y 上下起伏 7 帧），**不要腿部差分**（已明确否决）
- **wash 气泡左右交替**（wash-0 右 / wash-1 左，跟 dog 一致）
- **eat 三帧不同表情** + 五官跟随头部（offset_y 时锚点自动偏移）
- **teen 必须完全正面对称脸**；鼻嘴不要过大；excited 嘴宽 ≤ adult
- 蛋用通用 `cat-egg-v2`（暖色调、耀西蛋风格不对称斑点），所有物种共用

## 资源导航

| 资源 | 用途 | 何时读 |
|---|---|---|
| `references/prompts.md` | mmx 提示词模板 + 出图踩坑 | 出图前必读 |
| `references/anchor-guide.md` | FACE 锚点表结构、绘制约定、STAGES 配置、PET_FRAMES 结构 | 写差分脚本前必读 |
| `references/acceptance.md` | 验收清单（历史反馈固化的坑 + 失败教训表） | 每次渲染/提交前必读 |
| `scripts/sprite-differential.py` | 差分渲染骨架（复制到项目改 STAGES） | 直接使用 |
| `scripts/quantize.py` | mmx 图量化 | 直接使用 |
| `scripts/clean-base.py` | 背景/阴影清除 | 直接使用 |

## 项目内已有参照（真实样例）

- `scripts/fox-differential.py`、`scripts/dragon-differential.py`：已定稿的差分脚本（新物种可对照）
- `docs/sprites/WORKFLOW-mmx-pixel-sprite.md`：工作流详细文档（量化/清除代码片段）
- `assets/sprites/`：已定稿精灵（fox/dragon 全量 84 帧 + 通用蛋 18 帧）
- `tmp-fox-concept/`、`tmp-dragon-concept/`：mmx 原图、clean base、预览网格

## 验收

交付前对照 `references/acceptance.md` 逐项检查。**任何一项不过关不要提交**。
重点：所有帧透明背景、底部无阴影、五官对称且与 mmx 原图对齐、28 pose 帧全、
PET_FRAMES 映射全、build 成功、浏览器实际渲染正常。
