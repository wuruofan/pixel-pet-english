# Project Progress

> Last updated: 2026-09-07

## 🎯 Current Focus

- 小狗物种本地化已完结：三阶段形体差异化（小狗奶白/狗崽棕/大狗金+红项圈）、87 张本地帧（站姿/呼吸/眨眼/18 状态/7 走路）、垂耳+凸吻部+摇尾、契约 + sprite 接线双绿，待提交+push。下一步接小狐狸（fox）同一管线。

## 📥 Next Phases

| 阶段 | 目标 | 状态 |
|---|---|---|
| D | 清理不再被 PET_FRAMES 引用的旧 GPT 猫素材（含旧蛋帧） | ⏳ pending |
| E | 小狐狸（fox）物种本地化：复刻 `redraw-dog-local.py` 管线 | ⏳ pending |
| F | 龙（dragon）物种本地化 | ⏳ pending |

## ✅ Recently Completed

- 2026-09-07 狗 v2 全量动画：dog-baby/kid/adult 三阶段本地重绘（垂耳+凸吻部+白色胸斑+奶白/棕/金配色+大狗红项圈）、87 张帧（站姿×3 + idle×6 + blink×3 + 18 状态×3 + 走路×21）、`scripts/test-dog-redraw.py` 契约 + `scripts/test-sprite-contract.py` 接线锁定双绿；蛋阶段共用 cat-egg-v2（斑点运行时按狗主色染色）。
- 2026-09-07 蛋阶段本地重绘 + 表情肢体动画：蛋阶段 17 张差分接入；全部表情加入摇尾/垂尾/举爪（idle 呼吸带尾摆、开心兴奋摇尾、excited 举爪、难过垂尾到地），试验台逐像素验收。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。
- 2026-09-06 猫 v2 全量动画：三阶段形体差异化（奶猫/猫崽/大猫三种体态）、87 张本地帧（站姿/呼吸/眨眼/18 状态/7 走路）、进化庆祝（星星粒子+提示+开心跳）、试验台多帧冻结修复，全部逐像素验收通过。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。
- 2026-09-05 猫基础站姿 v2：完成 baby/kid/adult 本地像素绘制、脸部锚点和可复现测试。详见 [猫重绘交接文档](docs/sprites/HANDOFF-2026-09-05-cat-local-redraw.md)。

## 🧱 Blockers & Issues

- 无代码阻塞。

## 🧠 Context Notes

- 猫/狗的脸不能复用蛋的几何表情或跨阶段绝对坐标；后续每个阶段都要从对应 v2 基础图派生，并保留独立眼、鼻、嘴锚点。详细规则见 [HANDOFF-2026-09-05-cat-local-redraw.md](docs/sprites/HANDOFF-2026-09-05-cat-local-redraw.md)。
- 多物种共享 `cat-egg-v2-*` 蛋帧；运行时按当前物种主色（PET_SPECIES[sp].egg / palette）染斑点，让蛋壳天然按物种变色，无需多套蛋 PNG。
- 多物种共用 PIL Canvas 接口：`Canvas` 只有 `r / p / l / px / offset / d`，**椭圆**用 `c.d.ellipse(...)` 直接走 ImageDraw。多物种 redraw 脚本若以 dashed 文件名（`redraw-cat-local.py`）就要 `importlib.util.spec_from_file_location`，不能用裸 `import`。
- 试验台 `tbRedraw` 会重置 `exprIdx`，多帧循环必须直接调 `drawPet`（已修，契约锁定）；首页 `startExprAnim` 无此问题。
- 进化庆祝在 `celebrateEvolution`：toast 立即弹，星星+开心跳延迟 1.2s，否则会被喂食/玩耍自己的 playAction 清掉定时器。
- 道具用 FX 词汇表的专用色：眼泪 = zzz 特效的淡蓝 `#9fb7ff`，饭盆 = 落盆特效的蓝 `#4a7fc1`——奶油色底上白色泪滴不可见、奶油饭盆会和胸口混色。Zzz 在 NEAREST 缩放后按阶段坐标直接画在最终画布上（缩放会把 1px 斜线糊成"Ⅰ"）。
- PIL 坑：对两张全不透明 RGBA 图做 `ImageChops.difference().getbbox()` 会因 alpha 全 0 误报 None；像素比较要用 `getpixel` 或 `tobytes()`。

## ⚡ Quick Recovery

```bash
python3 scripts/redraw-cat-local.py
python3 scripts/redraw-dog-local.py
python3 scripts/test-cat-redraw.py
python3 scripts/test-dog-redraw.py
python3 scripts/test-sprite-contract.py
node --check src/app.js
```

## 🔍 Unverified

- 无。
