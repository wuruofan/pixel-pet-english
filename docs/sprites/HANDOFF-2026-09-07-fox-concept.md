# 狐狸概念稿 v1 交接与复盘

> 日期：2026-09-07 ｜ 项目：pixel-pet-english ｜ 主题：小狐狸（fox）物种本地化 — 概念稿阶段暂停，待用户方向
>
> 前置文档：[`HANDOFF-2026-09-06-cat-animation.md`](./HANDOFF-2026-09-06-cat-animation.md) §8.5（狐狸推广方案）+ §9（必继承视觉规则）
>
> 状态：**概念稿未通过**。已落地的脚手架和 stance 像素保留可用，物种识别度不达标，需换思路。

## 1. 结论先行

本轮按"参考 dog 概念稿流程"出 PIL mockup 概念稿，但用户验收时反馈**整体不像狐狸**。具体反馈：

- "狐狸怎么就是个圆脸的动物了呢？" — v1 圆脸已改成倒三角（v4），仍被否决
- "我觉得画得还是不行" — v4 后整体仍不达标

已落地、保留可用的：
- `scripts/redraw-fox-local.py` 完整脚手架（含 §9 规则的 fox_tear/fox_bubbles/fox_face_anchers 实现）
- `scripts/test-fox-redraw.py` 脚手架状态报告
- v4 fox-kid + fox-adult stance 概念稿 PNG（在 `tmp-fox-concept/`，不在 `assets/sprites/`）
- 设计迭代历史 + 已知问题（本文件）

## 2. 上下文

PROGRESS.md 把小狐狸排在 Phase E（pending）。本轮目标只是**概念稿**（dog 流程是先有外部概念稿获批，再开工；本轮尝试由 PIL 直接出 mockup）。87 张全量帧画稿**未启动**。

物种识别目标（来自 handoff §8.5）：
- 尖耳 + 深色耳尖
- 白口鼻 + ω 嘴
- 白胸
- 粗尾（kid 直线白尖，adult 缠身环纹）

必继承 §9 规则（来自 handoff §9）：双眼泪、蓝泡泡 per-side、腮红在 head offset 内、不画中缝横条、侧影直绘。

## 3. 已落地的工作

### 3.1 脚手架

`scripts/redraw-fox-local.py`（已实现 vs 占位）：

| 组件 | 状态 |
|---|---|
| `PALS` / `FOX_BODY` / `FOX_EAR` / `FOX_ACCENT` | ✅ 已实现（fox-rust + fox-bright 调色板，对齐 app.js fox-2/fox-3 既有身份）|
| `FOX_EYES` / `FOX_TEAR` / `FOX_TEAR_RIGHT` / `FOX_TAIL_BOX` 等契约表 | ✅ 占位常量（已定义但未跑断言）|
| `FOX_FACE_SPECS`（nose + omega-mouth 坐标）| ✅ 已实现 |
| `fox_face_anchors()` 助手 | ✅ 已实现 |
| `fox_eyes()` 五种 style（open/closed/lid/squeeze/arc/star）| ✅ 已实现（与 dog 同 API）|
| `fox_tear()`（§9 双眼泪）| ✅ 已实现（左右眼 x 独立登记，不镜像）|
| `fox_bubbles()`（§9 蓝泡泡 per-side）| ✅ 已实现（占位 spots 空表等概念稿）|
| `fox_mouth()`（smile/crumbs/laugh/tiny/frown）| ❌ 占位（抛 NotImplementedError）|
| `fox_body_kid()` / `fox_body_adult()` | ✅ 已实现（v4，详见 §4）|
| `fox_head_kid()` / `fox_head_adult()` | ✅ 已实现（v4，详见 §4）|
| `fox_walk()` / `fox_sleep()` | ❌ 占位 |
| `fox_frame()` 状态帧调度器 | ❌ 占位 |
| `render_fox_pose()` 骨架 | ✅ 已实现（复用 cat/dog 模式：offset 顺序已锁 §9）|
| `render_concept()` 概念稿入口 | ✅ 已实现（写 `tmp-fox-concept/fox-{stage}-stance.png`）|
| `write_all()` 全量帧写盘 | ✅ 已实现但未启用（依赖 fox_frame/fox_walk）|

### 3.2 契约测试

`scripts/test-fox-redraw.py` 是脚手架状态——跑出来是 SCAFFOLDING 报告，不假报 PASS。列出 §9 规则的 6 条断言和 8 项基础契约（待概念稿通过后实跑化）。

### 3.3 概念稿 PNG

- `tmp-fox-concept/fox-kid-stance.png` (36×38) — v4 倒三角脸
- `tmp-fox-concept/fox-adult-stance.png` (44×48) — v4 倒三角脸
- `/tmp/fox_compare.png` — fox vs cat vs dog kid+adult 并排对比
- `/tmp/fox_only.png` — fox kid+adult 12x 放大并排

**未写入** `assets/sprites/`，避免占位 PNG 干扰运行时接线（`PET_FRAMES.fox` 还没接入）。

## 4. 设计迭代历史

| 版本 | 改动 | 用户反馈 |
|---|---|---|
| **v1** 初始 | 圆脸 + 圆角矩形口鼻；胸口白毛盖满 adult 身体；尾巴从身体右上一路拉到头顶（像竖纹） | "狐狸怎么就是个圆脸的动物了呢？" |
| **v2** 修尾巴 | adult 尾巴从右侧伸出、扫到右下折回，奶油环纹在曲线外侧 | (无) |
| **v3** 缩胸口 | adult 胸口白毛从 16 列宽缩到 12 列（对齐 cat-adult 比例），狐狸皮色两侧露出 | (无) |
| **v4** 改脸型 | 圆脸改成倒三角（窄额头 12 列 → 宽腮 24 列 → 尖下巴）；圆口鼻改成倒三角鼻吻；白额纹从 6 行缩到 4 行只到眼中 | "我觉得画得还是不行" — 整体仍不通过 |

### v4 仍存在的问题（用户未具体点出，但视觉上明显）

1. **比例仍偏圆胖**：kid 头身比 1:1.3 跟 cat-kid 一样，但狐狸物种签名是"瘦长"，整体应该更瘦
2. **吻部不够突出**：三角口鼻在 v4 里仍贴着底边，像猫/狗口鼻的下半截，不像狐狸吻从脸中央突出
3. **耳朵位置**：v4 耳朵紧贴头顶两侧、几乎不超出头部轮廓。狐狸耳朵应该更长、更立、向上突破头顶
4. **kid 白额纹 + 三角口鼻合并**视觉上仍是"一大片白"，没有狐狸签名里"窄吻 + 窄额"的清爽感
5. **adult 尾巴环纹贴着身体外缘**，没"立"出来
6. **配色**：fox-rust (217,126,76) 比 cat-kid 颜色更深更红——可能本身选色没问题，但和"狐狸"气质仍差一截（真实狐狸橙红偏黄，胸腹更白）

## 5. 用户的方向决策（本轮没有拍板）

用户只说了"画得不行"——没说什么"行"。可能的真问题：

- (a) 我画的狐狸**物种签名不对**（脸太圆/吻太短/耳太小）→ 需重新设计物种识别度
- (b) **配色不对**（太红/太深/不够橙）→ 换调色板
- (c) **整体气质不对**（可爱感 vs 狐狸的"灵/野"感）→ 需明确气质方向（卡通可爱 vs 写实野性）
- (d) **比例不对**（头身比、腿长、尾巴大小）→ 需重新校准
- (e) 用户其实**已经有外部概念稿**，但我没看到 → 需用户提供参考图

下次开工**先问用户是哪个问题**，再决定策略。

## 6. 已知坑（如果继续走 fox 本地画稿路线）

- **PIL mockup 出概念稿效率低**：本轮 4 个版本才走到倒三角脸，每版要重新画 polygon + 渲染 + 对比。如果还要再迭代 5-10 版才能找到对的画法，时间成本高
- **dog 概念稿是外部出图获批的**（handoff §7 "概念稿已按流程出图并获用户确认"）——本轮尝试绕过这步直接出 PIL mockup，事实证明不靠谱
- **fox ASCII 草图（app.js fox-2/fox-3）是 16×16 的**，只能作为配色和粗略结构参考，不能直接放大用作 v2 概念

## 7. 建议的下一步方向（三选一或组合）

下次会话开工时，先和用户确认走哪条路：

### 选项 A：用户提供外部概念稿（dog 流程，推荐）
- 用户按 cat/dog 流程外部出 fox 概念稿
- 本轮脚手架直接复用，把外部稿翻译成 polygon 填进 `fox_body_kid/adult` + `fox_head_kid/adult`
- 时间：1 个会话画完 stance + 走通 §9 契约

### 选项 B：用 mmx-cli 生成 GPT 风格概念参考
- 用 MiniMax 平台 GPT-image API 出几张 fox 概念稿供用户选
- 把选中的概念稿当作选项 A 的"外部概念稿"走
- 时间：半个会话出参考 + 一个会话翻译

### 选项 C：本轮继续迭代 PIL polygon
- 把 §4 里的 6 个具体问题逐个调，再出 v5/v6/v7...
- 风险：物种识别度可能根本不在 polygon 调优层面，而是气质/配色方向问题
- 时间：未知，可能 5+ 版仍不通过

## 8. 文件位置索引

```
scripts/redraw-fox-local.py         # 完整脚手架（v4 body/head 已实现）
scripts/test-fox-redraw.py          # 脚手架契约（待实跑化）
tmp-fox-concept/fox-kid-stance.png  # v4 概念稿 kid（36×38）
tmp-fox-concept/fox-adult-stance.png# v4 概念稿 adult（44×48）
pets-assets/animals/fox/0.png       # 外部参考（32×32 侧视狐狸）
pets-assets/animals/fox/1.png       # 外部参考（32×32 站立狐狸）
src/app.js fox-2 / fox-3            # 16×16 ASCII 既有物种身份标记
docs/sprites/HANDOFF-2026-09-06-cat-animation.md  # §8.5 推广方案 + §9 视觉规则
```

## 9. Quick Recovery

```bash
# 重新渲染 v4 概念稿
python3 scripts/redraw-fox-local.py

# 看脚手架状态报告
python3 scripts/test-fox-redraw.py

# 看 cat/dog 现状（同尺寸参考）
ls assets/sprites/cat-{kid,adult}-v2.png assets/sprites/dog-{kid,adult}-v2.png

# 如果走选项 B（mmx-cli 生成概念）
# 见 .agents/skills/mmx-cli/SKILL.md
```

## 10. 本轮未做的（避免下次会话重复尝试）

- ❌ 没把 `fox-kid-v2.png` / `fox-adult-v2.png` 写进 `assets/sprites/`（避免占位 PNG）
- ❌ 没接入 `src/app.js` 的 `PET_FRAMES.fox`（概念稿未定，不该动运行时接线）
- ❌ 没实现 `fox_mouth` / `fox_walk` / `fox_sleep` / `fox_frame`（依赖概念稿敲定）
- ❌ 没把脚手架测试实跑化（`test-fox-redraw.py` 仍报 SCAFFOLDING）

## 11. 总结：核心教训

> **像素 polygon 调优不能替代物种概念稿。** dog 流程之所以顺，是因为概念稿先于实现；本轮尝试直接 PIL 出 mockup，结果迭代 4 版仍"不像狐狸"。下次先确认选项 A/B/C，再开工。
