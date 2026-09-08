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

---

# 2026-09-08 增量更新：v5 + v6 路线都已失败

> 本节由 9-08 session 追加。背景：用户接受走 §7 选项 B（mmx-cli 出参考图），本轮尝试了 v5 (mmx 像素化 base + 手绘 polygon 按锚点) 和 v6 (mmx 像素化 base + 程序化差分覆盖) 两条路，**两条都失败**。

## 12. 这次会话做了什么（v1-v4 之后）

### 12.1 选项 B 落地：mmx-cli 出概念参考

用户选了 §7 选项 B：用 MiniMax 平台 GPT-image API 出 fox 概念参考。

- 出 3 张 fox 侧视图候选 `ref_001/002/003.jpg`（seed 42）
- 出 1 张三阶段正视图 `ref-front_001.jpg`
- 用户选定 **002 风格**（圆润娇憨 + 橙红 + 奶油 + 大眼 + 大耳 + 大尾）
- 出 6 张参考图：fox-kid-front / fox-adult-front（朝前）+ fox-kid-walk / fox-adult-walk（朝右侧视）+ fox-kid-sleep / fox-adult-sleep（侧躺）

### 12.2 锚点提取

写 `scripts/extract-mmx-anchors.py`，从 mmx 1024×1024 参考图自动提取关键点（眼/鼻/嘴/耳/胸/脚/尾）的像素位置。

### 12.3 mmx 像素化 base

写 `tmp-fox-concept/quantize-base.py`，把 6 张 mmx 1024×1024 缩到 36×38/44×48 并量化颜色 → `tmp-fox-concept/fox-{stage}-v2-base.png` + 12x 放大版。

### 12.4 v5 路线：mmx 像素化 base + 手绘 polygon 按锚点（FAILED）

**思路**：mmx 002 风格用 mmx 画形，程序用 polygon 按锚点画"形"（替代 mmx base 整体）。

**实现**：重写 `scripts/redraw-fox-local.py` 4 个 polygon 函数（fox_body_kid/adult + fox_head_kid/adult）按 mmx 锚点画 v5。

**结果**：用户反馈 **"v5 丑死了，理解不了示例图是吗"**。原因：v5 polygon 是我**自己想象的几何形状**（三角眼/椭圆嘴/方尾巴）按 mmx 锚点位置摆放，**没照 mmx 形状描**。

**教训**：光按"位置"摆放不够，必须照 mmx 实际像素形状描。

### 12.5 v6 路线：mmx 像素化 base + 程序化差分覆盖（FAILED）

**思路**：mmx 002 风格直接用 mmx 像素化 base 作 sprite 源，程序只画"眼/鼻/嘴/泪/泡泡/zzz"状态层。

**实现**：重写 `scripts/fox-differential.py`：
- 头/耳/尾/胸/腿/脚范围锚点 LOCKED
- mmx 原面部表情位置擦除（用 FOX_ACCENT 奶油色覆盖）
- 程序画 mmx 风格眼（深棕 + 白高光，不是纯黑矩形）
- 程序画 mmx 风格鼻（深棕小点）
- 程序画 mmx 风格 ω 嘴（深棕像素）
- 闭眼线 L/R y 错开（mmx 原图两眼 y 错开）
- 状态层：tear / bubble / zzz / blush（per-side 独立登记）

**输出**：
- `tmp-fox-concept/differential-12x/fox-{kid,adult}-{idle-0,blink,sad-0,sad-1,excited,wash-0,wash-1,sleep-0}.png`（16 张 12x 放大版）
- `tmp-fox-concept/GRID-kid.png` + `GRID-adult.png`（8 pose 网格）
- `tmp-fox-concept/REGIONS-kid.png` + `REGIONS-adult.png`（范围标记图）
- `tmp-fox-concept/fox-{kid,adult}-v2.png`（已落 assets/sprites/，但被否决）

**结果**：用户反馈 **"v6 还是一坨屎，表情还是画在脸外面了"**。

**根因**（验证 mmx 002 kid 实际像素发现）：
1. **mmx 002 kid 整体姿态非对称**（前视但左半脸 + 右耳），程序画的 R 眼 (19, 16)(20, 16) **落在 mmx 右耳深色像素区 (17-22, 2-6)** —— 表情画在耳朵上，不是脸
2. **kid 鼻 (18, 19) 落在 mmx 原嘴区** —— 鼻画在嘴位置
3. **kid ω 嘴 (17,20)(18,21)(19,20) 落在 mmx 原嘴区下方** —— 嘴画在嘴下方
4. **adult 也有类似偏移**：闭眼线 L/R 错开后嘴位置略偏下，擦除区 4×4 仍有可见白块

**核心问题**：mmx 002 风格整体"头大 + 圆胖 + 不规则 + 非对称"，程序化绘制难精确对齐 mmx 实际脸部位置。**v6 路线不可行**。

## 13. v5 + v6 都失败的共同根因

1. **mmx 002 风格跟 cat/dog 风格根本不同**：cat/dog 002 是"对称、可程序化"的姿态；mmx 002 fox 是"头大 + 圆胖 + 非对称"——程序 polygon 路线**通配不上**
2. **mmx 像素化 base + 程序覆盖**这条路假设 mmx 头部结构规整，但 mmx 002 头部边缘不规则（左半脸 + 右耳错位）
3. **"AI 画形 + 程序画表情"分工在 fox 物种不成立**：mmx 002 头部的"形"跟程序 polygon 画的"形"对不齐

## 14. 这次会话未完成（避免下次重复）

- ❌ **没接入** `src/app.js` 的 `PET_FRAMES.fox`（v5/v6 都没通过，不该动运行时接线）
- ❌ **没实现** `fox_mouth` / `fox_walk` / `fox_sleep` / `fox_frame`（依赖概念稿敲定）
- ❌ **没写** 22 pose × 2 stage + 7 walk × 2 stage + 2 sleep = 72 帧到 `assets/sprites/`
- ❌ **没出** 7 帧 fox-kid-walk + 7 帧 fox-adult-walk + 1 张 fox-adult-sleep mmx 参考图
- ❌ **没实跑化** `test-fox-redraw.py`（仍报 SCAFFOLDING）
- ❌ **没写** fox v2 完整交接 handoff（独立文件）

**已落地的、可保留的**：
- `scripts/extract-mmx-anchors.py`（mmx 锚点提取工具）
- `tmp-fox-concept/quantize-base.py`（mmx 1024→36×38/44×48 像素化）
- `tmp-fox-concept/fox-{kid,adult}-{front,walk,sleep}_001.jpg`（6 张 mmx 参考图）
- `tmp-fox-concept/fox-{kid,adult}-v2-base.png` + 12x 版（mmx 像素化 base 资产）
- `tmp-fox-concept/REGIONS-{kid,adult}.png`（头/耳/尾/胸/脚范围标记图，mmx 002 真实范围）
- `scripts/fox-differential.py`（v6 完整源码 + 8 pose 渲染 + 范围标记生成）
- `tmp-fox-concept/differential/fox-{stage}-{pose}.png`（16 张差分 PNG）
- `tmp-fox-concept/GRID-{kid,adult}.png`（8 pose 网格）

**已落地的、但被否决的（保留作历史但不在主流程用）**：
- `tmp-fox-concept/fox-{kid,adult}-stance.png`（v4 倒三角脸）
- `assets/sprites/fox-{kid,adult}-v2.png`（v6 differential 落 assets，但 v6 本身被否）
- `scripts/redraw-fox-local.py`（v4 body/head，**v5 重写后又被 v6 取代**）

## 15. 下次开工方向（4 选 1 或组合）

### 选项 A：用户提供外部概念稿（dog 流程，推荐）
- 跳过 mmx 路线，由用户直接出 fox 概念稿
- 用 §3 现有脚手架 + 9-08 锚点表 + mmx 参考图作为辅助
- 时间：1 个会话画完 stance + 走通 §9 契约

### 选项 B：换 mmx 风格（不是 002，是 001 或 003）
- 002 风格"头大 + 圆胖 + 非对称"难程序化
- 001 或 003 可能是"瘦长 + 对称 + 规整"风格，**程序化可能更可行**
- 风险：风格换了用户可能又不接受

### 选项 C：mmx 像素化 base **完全保留** mmx 原图，**不擦除任何像素**
- idle-0 / blink / sad 等所有 pose 都**不动 mmx base**（保留 mmx 原眼神/原鼻/原嘴）
- 程序只画**状态层**：tear / bubble / zzz / blush / 闭眼线（仅在 mmx 原眼上加横线）
- 风险：mmx 原图本身"温柔眼神"够不够"狐狸"未知

### 选项 D：v6 differential 重新校准锚点（按 36×38/44×48 实际像素精确抠出 mmx 脸部）
- 当前锚点是按"擦除 mmx 原深色像素范围"推的，没精确锁定 mmx 002 真实脸部中心
- 需要重写 `extract-mmx-anchors.py` 识别 mmx 002 头/脸/耳具体边界
- 风险：mmx 002 非对称姿态下程序化仍可能不达用户期待

### 推荐
**先验证 mmx 002 风格本身是否可接受**（用户已选 002 但 v5/v6 失败可能是 002 风格本身就难程序化）。如想换风格试 001/003（选项 B）；如想保留 002 走程序路线试选项 C（最小改动）。

## 16. Quick Recovery（9-08 增量）

```bash
# 重看 v6 8 pose 效果
open tmp-fox-concept/GRID-kid.png tmp-fox-concept/GRID-adult.png

# 重看 v6 范围标记图（mmx 002 真实范围）
open tmp-fox-concept/REGIONS-kid.png tmp-fox-concept/REGIONS-adult.png

# 重看 v6 differential 源码 + 16 张差分 PNG
cat scripts/fox-differential.py
ls tmp-fox-concept/differential/

# 重看 mmx 像素化 base
open tmp-fox-concept/fox-kid-v2-base-12x.png tmp-fox-concept/fox-adult-v2-base-12x.png

# v5 / v4 历史（被否决）
python3 scripts/redraw-fox-local.py  # v4 重新渲染
ls tmp-fox-concept/fox-*-stance.png  # v4 stance

# 走 §15 选项 C（最小改动路线）
# 编辑 scripts/fox-differential.py 把 _erase_face 改成"只擦眼+鼻"（不擦嘴）
# 把 diff_mouth 改成"在 mmx 原嘴上叠加覆盖"（不是擦除重画）
```

## 17. 核心教训（追加）

> **v5 + v6 路线都失败的根本原因不是 polygon 写得不好或差分写得不好，是 mmx 002 风格本身跟"程序化绘制"假设不兼容。** mmx 002 头部非对称、头大、圆胖——程序 polygon 难精确描；mmx 像素化 base + 程序覆盖难对齐。下次开工前**先验证风格本身可程序化**（用一张 mmx 参考图直接画到 36×38 看程序 polygon 能不能描对头部轮廓），再选路线。


---

# 2026-09-08 增量更新：v6.1 修复「表情画在脸外面」

> 本节由 9-08 session 追加。用户反馈 "v6 还是一坨屎，表情还是画在脸外面了"，本轮**修好了**：v6 根因是锚点表错位 + 擦除填充色用错，不是风格问题。

## 18. 根因（v6 为什么表情在脸外）

对 `fox-{kid,adult}-v2-base.png`（36×38 / 44×48）逐像素 dump 后发现，**v6 的 FOX_FACE 锚点表把 kid 的脸部位置整体认错了**：

1. **kid 真眼在 (11-13, 14-16) / (17-19, 14-16)**，v6 却把鼻子 (15,17-18) 当左眼、把 R 眼画到 (19-20,16) —— 新眼睛画在鼻子上，真眼没被擦掉，残留在脸上
2. **擦除填充用了奶油色**：眼位周边是橙色毛（kid #f7a05b / adult #f69139），v6 用 FOX_ACCENT 奶油色填擦除区 → 脸上留白块
3. adult 嘴偏右下（mmx 原嘴 (15-17,22-23) 不对称），v6 没归正

## 19. v6.1 修复内容（`scripts/fox-differential.py` 已重写）

1. **眼窝/瞳孔/高光/闭眼线/腮红/泪全部按真实像素重新校准**：
   - kid 眼窝 (11,14,13,16)/(17,14,19,16)，3×2 深棕瞳孔 + 白高光
   - adult 眼窝 (8,17,9,19)/(14,16,15,19)（R 含 mmx 杂点 (15,16)），2×2 瞳孔
2. **擦除眼窝用毛色填充**（`FUR_EYE`），不再留白块
3. **鼻/嘴原位重画**：kid 鼻 1×2 (15,17-18)、3 点 ω 嘴 (14,20)(15,21)(16,20)；adult 鼻 2×2 (11-12,20-21)、5 点 ω 嘴归正到鼻正下 (x=10-14, y=22-23)
4. 双眼泪挂在各自下眼睑（kid y=17 / adult y=20），腮红 2×2 在脸颊侧

## 20. 验证

- 像素级：idle-0 渲染结果逐格 dump，眼/鼻/嘴全部落在真脸部像素上，无残留深色杂点、无白块
- 视觉：kid/adult 各 8 pose 网格（`GRID-{stage}-v61-compact.png`）表情全部在脸上
- 前后对照：`COMPARE-{stage}-v6-vs-v61.png`

## 21. 当前状态

- ✅ v6.1 8 pose × 2 stage 差分 PNG 已渲染到 `tmp-fox-concept/differential/`（16 张）
- ⏸ 未写入 `assets/sprites/` 正式帧、未接 `PET_FRAMES.fox`、未实现 fox_mouth/walk/sleep/frame —— 等用户验收 v6.1 再继续
- 保留：`assets/sprites/fox-{kid,adult}-v2.png` 仍是 mmx 像素化 base（差分脚本的 Layer 1，勿删）

## 22. Quick Recovery（v6.1）

```bash
python3 scripts/fox-differential.py   # 重渲染 16 pose + 网格
open tmp-fox-concept/GRID-kid-v61-compact.png tmp-fox-concept/GRID-adult-v61-compact.png
open tmp-fox-concept/COMPARE-kid-v6-vs-v61.png tmp-fox-concept/COMPARE-adult-v6-vs-v61.png
```
