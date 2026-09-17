# Project Progress

> Last updated: 2026-09-17

## 🎯 Current Focus

- 小狗三阶段重新设计：以**金毛犬**为原型，参考猫对应阶段的体量和像素块风格。最终三阶段均为正面坐姿：浅金色短腿小奶狗 → 暖金色圆脸幼犬 → 胸毛更宽、爪子更大、带蓬松侧尾的较深金色成犬。
- 本轮狗参考图使用内置 imagegen，源图保存到 `assets/sprite-bases/dog-{baby,kid,adult}-source.png`；后续为 `prepare-dog-bases.py` 量化、`dog-differential.py` 差分生成。仍沿用 87 张正式帧、11 动作、7 帧蹦跳与通用蛋；实现及验证已完成，详见 [小狗重做交接文档](docs/sprites/HANDOFF-2026-09-17-dog-redesign.md)。
- `?pet-test=dog` 可预览狗的三个成长阶段，支持暂停和逐帧，不读写学习存档。新素材已构建，11 动作、暂停与逐帧均已验证。
- 猫三阶段 mmx 翻新已实现：采用 handoff 选定的 baby #1 / kid #3 / adult #1，保留 kid 项圈，清理复杂原五官并重新定位。
- 猫已生成 87 张正式帧，走路为 7 帧整只跳动，洗澡每侧 5 颗泡泡，吃饭三帧不同表情；共用蛋保持不变，测试入口为 `?pet-test=cat`。
- 复现步骤与实现决策见 [最新猫 handoff §10](docs/sprites/HANDOFF-2026-09-16-cat-mmx-base.md#10-2026-09-17-实现记录)。以下 Recently Completed 保留历史记录，狐狸 v5/v6 失败记录不再代表当前分支状态。

## 📥 Next Phases

| 阶段 | 目标 | 状态 |
|---|---|---|
| D | 清理不再被 PET_FRAMES 引用的旧 GPT 猫素材（含旧蛋帧） | ⏳ pending |
| E | 小狐狸（fox）物种本地化 | ✅ 已定稿（见 9 月 16 日 handoff 前置状态） |
| F | 龙（dragon）物种本地化 | ✅ 已定稿（见 9 月 16 日 handoff 前置状态） |
| G | 猫（cat）采用选定 mmx base 完成差分 | ✅ 已实现，测试入口供用户体验 |
| H | 狗（dog）以金毛犬为原型，参考猫三阶段比例，采用 imagegen 参考图完成量化与差分 | ✅ 87 帧已接入，图片 / 接线 / 预览测试与浏览器验收通过 |

## ✅ Recently Completed

- 2026-09-17 金毛三阶段重做：内置 imagegen 以猫对应阶段为风格参考生成原图，量化与五官差分生成 87 帧；透明孔洞 / 裁切 / 居中 / 动作 / 蛋不变检查通过，已开放 `?pet-test=dog`。

- 2026-09-17 全宠物视觉检查：修复狗的五官位移 / 裁切、狐狸的口鼻透明缺块、龙的腿尾缺像素及冻结动画；保留身体外正常留白。详见 [视觉修复记录](docs/sprites/HANDOFF-2026-09-17-visual-audit.md)。
- 2026-09-17 猫 mmx 三阶段差分、可复现生成器与独立测试入口完成；猫、狗及精灵接线测试通过。详见 [猫 handoff §10](docs/sprites/HANDOFF-2026-09-16-cat-mmx-base.md#10-2026-09-17-实现记录)。
- 2026-09-08 狐狸 v5 + v6 路线均失败，handoff 追加 §12-§17 — v5（mmx 002 像素化 base + 手绘 polygon 按锚点）用户反馈"丑死了"，v6（mmx 002 像素化 base + 程序化差分覆盖）用户反馈"v6 还是一坨屎，表情还是画在脸外面了"。根因：mmx 002 风格"头大+圆胖+非对称"难程序化。已落 `scripts/extract-mmx-anchors.py` / `tmp-fox-concept/quantize-base.py` / 6 张 mmx 参考图 / mmx 像素化 base / REGIONS 范围标记图 / `scripts/fox-differential.py` v6 源码 + 16 张差分 PNG 等可保留资产。下次方向 4 选 1（外部概念稿 / 换 mmx 风格 / 完全保留 mmx / 重新校准锚点）。详见 [狐狸交接文档 §12-§17](docs/sprites/HANDOFF-2026-09-07-fox-concept.md)。
- 2026-09-07 狐狸 v1 概念稿暂停 + 交接文档 — `redraw-fox-local.py` 脚手架完整（fox_tear/fox_bubbles/fox_face_anchors 等 §9 函数已实现，fox_body_kid/adult + fox_head_kid/adult v4 倒三角脸已画），4 版迭代仍未通过用户验收（"不像狐狸"）。交接文档含 3 个下次方向选项（外部概念稿 / mmx-cli 参考 / 继续 PIL 调优）。详见 [狐狸交接文档](docs/sprites/HANDOFF-2026-09-07-fox-concept.md)。
- 2026-09-07 蛋阶段画布留白 (0ed3613) — 蛋帧加 2px 上下透明边距、EGG_SPOTS 同步 +2、`test-cat-redraw.py` 锁定新尺寸 (29×40)；蛋壳弧线不再被画布边缘裁切，运行时逐像素验收通过。
- 2026-09-07 精灵视觉修复批次 (08aebbf) — 双眼流泪（猫/狗/蛋统一改双泪）、洗澡泡泡改蓝色大泡泡+描边+高光+按 r/l 分别登记（镜像会落到耳朵）、用力腮红随头运动（offset 顺序换了）、大猫奶油色重塑去中缝 bib line、狗睡姿重写（不再是"覆盖+重绘"侧影）、试验台定时器提到模块级重建时清理、睡觉小 Z 右上移不贴边。
- 2026-09-07 狗 v2 全量动画：dog-baby/kid/adult 三阶段本地重绘（垂耳+凸吻部+白色胸斑+奶白/棕/金配色+大狗红项圈）、87 张帧（站姿×3 + idle×6 + blink×3 + 18 状态×3 + 走路×21）、`scripts/test-dog-redraw.py` 契约 + `scripts/test-sprite-contract.py` 接线锁定双绿；蛋阶段共用 cat-egg-v2（斑点运行时按狗主色染色）。
- 2026-09-07 蛋阶段本地重绘 + 表情肢体动画：蛋阶段 17 张差分接入；全部表情加入摇尾/垂尾/举爪（idle 呼吸带尾摆、开心兴奋摇尾、excited 举爪、难过垂尾到地），试验台逐像素验收。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。
- 2026-09-06 猫 v2 全量动画：三阶段形体差异化（奶猫/猫崽/大猫三种体态）、87 张本地帧（站姿/呼吸/眨眼/18 状态/7 走路）、进化庆祝（星星粒子+提示+开心跳）、试验台多帧冻结修复，全部逐像素验收通过。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。
- 2026-09-07 蛋阶段画布留白 (0ed3613) — 蛋帧加 2px 上下透明边距、EGG_SPOTS 同步 +2、`test-cat-redraw.py` 锁定新尺寸 (29×40)；蛋壳弧线不再被画布边缘裁切，运行时逐像素验收通过。
- 2026-09-07 精灵视觉修复批次 (08aebbf) — 双眼流泪（猫/狗/蛋统一改双泪）、洗澡泡泡改蓝色大泡泡+描边+高光+按 r/l 分别登记（镜像会落到耳朵）、用力腮红随头运动（offset 顺序换了）、大猫奶油色重塑去中缝 bib line、狗睡姿重写（不再是"覆盖+重绘"侧影）、试验台定时器提到模块级重建时清理、睡觉小 Z 右上移不贴边。
- 2026-09-07 狗 v2 全量动画：dog-baby/kid/adult 三阶段本地重绘（垂耳+凸吻部+白色胸斑+奶白/棕/金配色+大狗红项圈）、87 张帧（站姿×3 + idle×6 + blink×3 + 18 状态×3 + 走路×21）、`scripts/test-dog-redraw.py` 契约 + `scripts/test-sprite-contract.py` 接线锁定双绿；蛋阶段共用 cat-egg-v2（斑点运行时按狗主色染色）。
- 2026-09-07 蛋阶段本地重绘 + 表情肢体动画：蛋阶段 17 张差分接入；全部表情加入摇尾/垂尾/举爪（idle 呼吸带尾摆、开心兴奋摇尾、excited 举爪、难过垂尾到地），试验台逐像素验收。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。
- 2026-09-06 猫 v2 全量动画：三阶段形体差异化（奶猫/猫崽/大猫三种体态）、87 张本地帧（站姿/呼吸/眨眼/18 状态/7 走路）、进化庆祝（星星粒子+提示+开心跳）、试验台多帧冻结修复，全部逐像素验收通过。详见 [猫动画交接文档](docs/sprites/HANDOFF-2026-09-06-cat-animation.md)。

## 🧱 Blockers & Issues

- 无代码阻塞。

## 🧠 Context Notes

- 猫/狗的脸不能复用蛋的几何表情或跨阶段绝对坐标；后续每个阶段都要从对应 v2 基础图派生，并保留独立眼、鼻、嘴锚点。详细规则见 [HANDOFF-2026-09-05-cat-local-redraw.md](docs/sprites/HANDOFF-2026-09-05-cat-local-redraw.md)。
- 当前狗造型以 [2026-09-17 狗重做 handoff](docs/sprites/HANDOFF-2026-09-17-dog-redesign.md) 为准。`redraw-dog-local.py` 保留为委托 `dog-differential.py` 的兼容入口，避免旧重绘逻辑覆盖新设计。此前狗 v2 与视觉修复记录保留历史含义。
- 多物种共享 `cat-egg-v2-*` 蛋帧；运行时按当前物种主色（PET_SPECIES[sp].egg / palette）染斑点，让蛋壳天然按物种变色，无需多套蛋 PNG。
- 多物种共用 PIL Canvas 接口：`Canvas` 只有 `r / p / l / px / offset / d`，**椭圆**用 `c.d.ellipse(...)` 直接走 ImageDraw。多物种 redraw 脚本若以 dashed 文件名（`redraw-cat-local.py`）就要 `importlib.util.spec_from_file_location`，不能用裸 `import`。
- 试验台 `tbRedraw` 会重置 `exprIdx`，多帧循环必须直接调 `drawPet`（已修，契约锁定）；首页 `startExprAnim` 无此问题。
- 进化庆祝在 `celebrateEvolution`：toast 立即弹，星星+开心跳延迟 1.2s，否则会被喂食/玩耍自己的 playAction 清掉定时器。
- 道具用 FX 词汇表的专用色：眼泪 = zzz 特效的淡蓝 `#9fb7ff`，饭盆 = 落盆特效的蓝 `#4a7fc1`——奶油色底上白色泪滴不可见、奶油饭盆会和胸口混色。Zzz 在 NEAREST 缩放后按阶段坐标直接画在最终画布上（缩放会把 1px 斜线糊成"Ⅰ"）。
- PIL 坑：对两张全不透明 RGBA 图做 `ImageChops.difference().getbbox()` 会因 alpha 全 0 误报 None；像素比较要用 `getpixel` 或 `tobytes()`。

## ⚡ Quick Recovery

```bash
python3 scripts/cat-differential.py
python3 scripts/prepare-dog-bases.py
python3 scripts/dog-differential.py
python3 scripts/test-cat-redraw.py
python3 scripts/test-dog-redraw.py
python3 scripts/test-sprite-contract.py
node scripts/test-pet-preview.js
node --check src/app.js
node scripts/build.js
node scripts/serve-no-cache.js
```

## 🔍 Unverified

- 本轮金毛重做无待验证项，详见 [狗重做 handoff 的验证状态](docs/sprites/HANDOFF-2026-09-17-dog-redesign.md#验证状态)。
