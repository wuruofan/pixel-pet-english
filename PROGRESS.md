# Project Progress

> Last updated: 2026-09-07

## 🎯 Current Focus

- 猫咪全阶段差分动画已完结：蛋/小奶猫/猫崽/大猫四阶段共 105 张本地帧全部接入运行时并逐像素验收，无进行中任务。

## 📥 Next Phases

| 阶段 | 目标 | 状态 |
|---|---|---|
| D | 清理不再被 PET_FRAMES 引用的旧 GPT 猫素材（含旧蛋帧） | ⏳ pending |
| E | 可选打磨：其他物种（龙/狗/狐）同类本地化 | ⏳ pending |

## ✅ Recently Completed

- 2026-09-07 蛋阶段本地重绘：轮廓逐行复刻旧蛋（EGG_SPOTS 叠加不跑位）+ 17 张差分帧接入运行时，试验台 10/10 表情组带斑点逐像素验收。猫咪四阶段差分动画至此全部完结。
- 2026-09-06 猫 v2 全量动画：三阶段形体差异化（奶猫/猫崽/大猫三种体态）、87 张本地帧（站姿/呼吸/眨眼/18 状态/7 走路）、进化庆祝（星星粒子+提示+开心跳）、试验台多帧冻结修复，全部逐像素验收通过。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。
- 2026-09-05 猫基础站姿 v2：完成 baby/kid/adult 本地像素绘制、脸部锚点和可复现测试。详见 [猫重绘交接文档](docs/sprites/HANDOFF-2026-09-05-cat-local-redraw.md)。

## 🧱 Blockers & Issues

- 无代码阻塞。

## 🧠 Context Notes

- 猫的脸不能复用蛋的几何表情或跨阶段绝对坐标；后续每个阶段都要从对应 v2 基础图派生，并保留独立眼、鼻、嘴锚点。详细规则见 [HANDOFF-2026-09-05-cat-local-redraw.md](docs/sprites/HANDOFF-2026-09-05-cat-local-redraw.md)。
- 试验台 `tbRedraw` 会重置 `exprIdx`，多帧循环必须直接调 `drawPet`（已修，契约锁定）；首页 `startExprAnim` 无此问题。
- 进化庆祝在 `celebrateEvolution`：toast 立即弹，星星+开心跳延迟 1.2s，否则会被喂食/玩耍自己的 playAction 清掉定时器。
- 道具用 FX 词汇表的专用色：眼泪 = zzz 特效的淡蓝 `#9fb7ff`，饭盆 = 落盆特效的蓝 `#4a7fc1`——奶油色底上白色泪滴不可见、奶油饭盆会和胸口混色。Zzz 在 NEAREST 缩放后按阶段坐标直接画在最终画布上（缩放会把 1px 斜线糊成"Ⅰ"）。
- PIL 坑：对两张全不透明 RGBA 图做 `ImageChops.difference().getbbox()` 会因 alpha 全 0 误报 None；像素比较要用 `getpixel` 或 `tobytes()`。

## ⚡ Quick Recovery

```bash
python3 scripts/redraw-cat-local.py
python3 scripts/test-cat-redraw.py
python3 scripts/test-sprite-contract.py
node --check src/app.js
```

## 🔍 Unverified

- 无。
