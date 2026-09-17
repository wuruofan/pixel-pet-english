# Cat 翻新・mmx 基础图已选定・差分难点交接

> 日期：2026-09-16 ｜ 项目：pixel-pet-english ｜ 主题：cat 三阶段 base 已由用户选定（mmx 出图），差分渲染尚未开始
> 前置：fox /dragon 已定稿（流程见 
>
> `.agents/skills/pixel-pet-sprite-workflow/`
>
> ）；cat 之前走过 mmx（失败）→ gpt-assets 复用（失败）→ 本轮 mmx 重出（base 已选定）
> 状态：
>
> **base 图已确认，等待差分处理方案**
>
> 。用户点名担心 adult #1 的表情差分不好处理，本文件给出难点诊断 + 完整上下文。

## 1. 结论先行

三张 base 已由用户选定：



| 阶段    | 文件                         | 路径                                                   |
| ----- | -------------------------- | ---------------------------------------------------- |
| baby  | `cat-baby-minimal_001.jpg` | `tmp-cat-concept/mmx-retry/cat-baby-minimal_001.jpg` |
| kid   | `cat-kid-v2_003.jpg`       | `tmp-cat-concept/mmx-retry/cat-kid-v2_003.jpg`       |
| adult | `cat-adult-v2_001.jpg`     | `tmp-cat-concept/mmx-retry/cat-adult-v2_001.jpg`     |

**当前卡点**：adult #1（和 kid #3）的面部比 baby #1 复杂 —— 不是纯黑小点眼，擦除重画需要更大、更精确的擦除区。用户要求先写本 handoff，由其他 agent 评估怎么处理。

## 2. 三张 base 的面部实况（放大 2x 逐像素诊断过）



| 部位 | baby #1 ✅         | kid #3 ⚠️               | adult #1 ⚠️             |
| -- | ----------------- | ----------------------- | ----------------------- |
| 眼睛 | 纯黑小点，无眼白无高光       | 黑色方眼 + **白色高光**         | **大圆眼 + 白色眼白 + 红色轮廓点缀** |
| 鼻子 | 红色小点              | 粉色小点                    | 粉色鼻头                    |
| 嘴巴 | 简单线条              | 线条（略弯）                  | 弯曲线条                    |
| 腮红 | 无（实际有少量粉色圆点，位置独立） | **有粉色腮红**（NO blush 未生效） | 背景有粉色杂块                 |
| 其他 | 干净                | **颈部浅灰色项圈**（装饰元素，注意）    | —                       |
| 背景 | 浅蓝纯色              | 浅蓝                      | 浅蓝 + 少量粉色块              |

**差分难点本质**：mmx 对 "NO blush / NO eye highlights /tiny black dot eyes" 的遵守不稳定。眼睛从 "纯黑小点" 漂移成 "大圆眼 + 眼白 + 高光 + 红轮廓"，意味着：



1. **擦除区必须变大**：大圆眼（带眼白）约 5×5\~6×6 像素，比 baby 的 3×3 大一倍；擦不干净会残留白圈 / 红轮廓

2. **擦除填充色要按真实位置选**：眼睛若在白色口鼻区内 → 填 FACE\_WHITE；若压在橙色毛发上 → 填橙色毛色（fox 教训：用错色留白块）

3. **腮红位置**：原图腮红与程序腮红位置可能不一致，需在原腮红位置也补擦（或确认程序腮红能覆盖）

4. **adult 背景粉色杂块**：清背景时 tolerance 要够，别把粉块当主体

## 3. 出图历程（重要：避免重蹈覆辙）

### 3.1 cat 翻新完整时间线



| 轮次                     | 方案                                 | 结果                                                              | 根因                                                                     |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| mmx v1-v3              | mmx 出三阶段 + 智能清背景                   | ❌ 用户否决："面部表情错位严重，kids cat 比 baby cat 还小、猫咪特征还不明显，三种形态的猫色调差距也很大" | mmx 出的猫主体色（白脸 + 奶油毛）与暖米色背景差异 <10，24 色量化后合并，flood fill 把整只猫清掉；且三阶段造型不统一 |
| gpt-assets             | 从 sprite sheet 裁剪                  | ❌ 用户否决："眼睛位置擦除绘制的很差"                                            | gpt 素材原眼不对称（左眼偏上、右眼偏下），擦除区难以精确覆盖                                       |
| mmx retry 单张           | 单张出图 subject-ref                   | ⚠️ kid/adult #4 与 baby #1 不匹配                                   | subject-ref 锁不住细节（adult 眼睛漂白成浅灰）                                       |
| mmx retry sprite sheet | 一张 sheet 出三阶段                      | ❌ 全部否决                                                          | mmx 控制不住：sheet1 三只全闭眼（闭眼 base 无法做睁眼差分）、sheet4 画成四只猫 + 腮红               |
| **mmx retry v2（当前）**   | 单张 + 强化 "same design only size up" | ✅ **base 已选定**（baby#1 / kid#3 / adult#1）                        | —                                                                      |

### 3.2 有效的出图提示词（当前这套）

baby（无 subject-ref，首图）：



```
minimalist pixel art sprite of a cute baby orange tabby cat, perfect front view, 100% perfectly symmetrical, flat colors only with hard pixel edges, simple round body, white muzzle and chest area as blank solid white, very tiny simple black dot eyes, tiny pink dot nose, simple straight line mouth, NO blush, NO eye highlights, NO gradients, NO shadows, small triangular ears with pink inner, sitting pose, chibi style, orange tabby stripes on body, solid light blue background, clean simple pixel art, 32x32 pixel grid style
```

kid /adult（subject-ref 参考 baby，prompt 结构）：



```
pixel art sprite of the exact same orange tabby cat character as the reference image, {kid stage, slightly larger body | adult stage, larger and more mature body}, perfect front view, 100% perfectly symmetrical, same facial features as reference: very tiny simple black dot OPEN eyes, tiny pink dot nose, simple straight line mouth, no blush, no eye highlights, no gradients, flat colors with hard pixel edges, white muzzle and chest, small triangular ears with pink inner, sitting pose, chibi style, orange tabby stripes, {, long tail for adult}, solid light blue background, no shadows, clean simple pixel art, 32x32 grid

\--subject-ref "type=character,image=tmp-cat-concept/mmx-retry/cat-baby-minimal\_001.jpg"
```

### 3.3 出图踩坑记录（mmx）



* **sprite sheet 方式不可控**（数量 / 睁眼 / 腮红都管不住）→ 已弃用

* **subject-ref 锁不住眼部细节**（大圆眼 / 眼白 / 高光漂移）→ 换 "same facial features as reference" 措辞有改善但仍不完美

* **NO blush 经常不生效** → 差分阶段按 "原图有腮红就擦掉" 处理，别指望 mmx 听话

* **背景选浅蓝色**（与橙色主体差异大）→ 彻底解决清背景误清问题（对比旧坑：暖米色背景 + 奶油白猫）

* mmx token 额度：`mmx quota show` 查看；重置后即可用

## 4. 后续步骤（差分处理建议方案）

### 4.1 推荐流程（沿用 fox/dragon 定稿管线）



```
1\. 量化：python3 .agents/skills/pixel-pet-sprite-workflow/scripts/quantize.py \<mmx图> <输出.png> <宽> <高>

&#x20;  （8x LANCZOS → 24色 MEDIANCUT → NEAREST；量化后脸常消失 → 靠差分脚本程序画脸）

&#x20;  \- baby/kid 目标 36×38；adult 44×48（与 cat 旧规格一致）

2\. 清背景：严格颜色阈值 + 从边缘 flood fill（浅蓝背景与橙色差异大，bg\_tolerance 可用 20-30 起步）

&#x20;  \- 注意清除 adult 背景粉色杂块、kid 项圈保留与否（需用户拍板：项圈是装饰还是杂色？）

&#x20;  \- 清完后检查底部无地面阴影

3\. 差分渲染：复制 .agents/skills/pixel-pet-sprite-workflow/scripts/sprite-differential.py

&#x20;  到 scripts/cat-differential.py（已存在，改 STAGES 指向新 base）

4\. 接入 src/app.js PET\_FRAMES.cat（帧名已匹配 cat-\*-v2 前缀，无需改）

5\. node scripts/build.js → 浏览器验证 → git commit
```

### 4.2 adult #1 差分难点专项建议



1. **擦除区**：先量化 + 清背景后，用像素 bbox 定位 adult 原眼真实范围（大圆眼～6×6），`erase_full` 或大 `erase_extra` 整块擦除，填充色看眼睛落在白区还是橙毛上

2. **校准方法**：先在 clean base 上画测试脸，12x 放大检查位置，再批量渲染（skill 的 anchor-guide.md 有详细方法）

3. **腮红**：原图腮红位置记录 → 程序腮红若不同位则先补擦

4. **背景粉块**：清背景 tolerance 按粉色杂块的实际 RGB 与背景差异调（粉块 vs 浅蓝背景差异大，应该能清掉）

### 4.3 kid #3 项圈

kid #3 颈部有浅灰色项圈（装饰元素）。**需要用户拍板**：



* (a) 保留项圈（作为 kid 特征，差分不影响）

* (b) 擦掉（如果觉得和 baby/adult 不统一）

建议保留 —— 它是 mmx 出的自然装饰，不影响表情差分。

## 5. 关键约束（用户已拍板，勿偏离）



* **走路 = 跳跳蹦蹦**（offset\_y 上下起伏 7 帧），**不要腿部差分**（已明确否决）

* **wash 气泡左右交替**（wash-0 右 /wash-1 左）

* **eat 三帧不同表情** + 五官跟随头部（offset\_y 时锚点自动偏移）

* **teen 必须完全正面对称脸**（cat 没有 teen 阶段，是 baby/kid/adult；同样要求正面 + 对称）

* 鼻嘴不要过大；excited 嘴宽 ≤ adult

* 蛋用通用 `cat-egg-v2`（勿做专属蛋）

* 三阶段色调统一（本次 mmx 浅蓝背景 + subject-ref 已改善）

* 所有帧透明背景、底部无阴影

## 6. 资源导航



| 资源           | 路径                                                                             | 用途                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 项目 skill     | `.agents/skills/pixel-pet-sprite-workflow/`                                    | 完整流程 + SKILL.md + references/（anchor-guide /acceptance/prompts）+ scripts/（quantize /clean-base/sprite-differential） |
| 已定稿差分脚本      | `scripts/fox-differential.py`、`scripts/dragon-differential.py`                 | 对照写法                                                                                                                |
| 当前 cat 差分脚本  | `scripts/cat-differential.py`                                                  | 现指向 gpt-base，需改 STAGES 到新 mmx base                                                                                  |
| 新 base 源图    | `tmp-cat-concept/mmx-retry/cat-{baby-minimal_001,kid-v2_003,adult-v2_001}.jpg` | 三张选定图（1024×1024）                                                                                                    |
| 候选图目录        | `tmp-cat-concept/mmx-retry/`                                                   | 全部候选 + 对比图（COMPARE-\*.png）                                                                                          |
| 旧失败 base（勿用） | `tmp-cat-concept/cat-{baby,kid,adult}-clean*.png`、`cat-*-gpt-base.png`         | 历史存档                                                                                                                |
| build        | `node scripts/build.js` → `pixel-pet-english.html`                             | 自包含单文件                                                                                                              |

## 7. Quick Recovery



```
\# 看三张选定 base 放大对比

open tmp-cat-concept/mmx-retry/zoom-kid3.png tmp-cat-concept/mmx-retry/zoom-adult1.png

\# 看全部候选对比

open tmp-cat-concept/mmx-retry/COMPARE-kid-adult-v2.png

\# 量化（示例，先出 baby）

python3 .agents/skills/pixel-pet-sprite-workflow/scripts/quantize.py \\

&#x20; tmp-cat-concept/mmx-retry/cat-baby-minimal\_001.jpg \\

&#x20; tmp-cat-concept/cat-baby-mmx-base.png 36 38

\# 清背景（示例：浅蓝背景，先取四角像素定 bg 色）

\# 参考 skill scripts/clean-base.py 用法

\# 差分渲染：改 scripts/cat-differential.py 的 STAGES base 路径 → python3 scripts/cat-differential.py

\# 检查 mmx 额度

mmx quota show
```

## 8. 核心教训（沉淀到 skill acceptance.md 的候选条目）



1. **mmx 出图背景必须与主体色差异大**（浅蓝 vs 橙色 ✅ / 暖米 vs 奶油白 ❌）—— 这是 cat 三次失败的根因之一

2. **mmx 对负面提示词（NO blush / NO highlight）遵守不稳定** → 差分阶段按 "原图必然有残留五官" 设计擦除策略，别依赖 mmx 听话

3. **sprite sheet 一次出多阶段不可控**（闭眼 / 数量漂移）→ 单张 + subject-ref 更稳

4. **大圆眼（带眼白 / 高光）的擦除区要按量化后真实 bbox 定**，不能沿用 baby 的小擦除区

## 9. 待用户拍板事项



* [ ] kid #3 项圈：保留 or 擦除？

* [ ] adult #1 差分方案：走标准擦除重画（大擦除区）还是先试试只擦眼睛周围？

* [ ] 三张 base 是否需要先量化 + 清背景出对比图给用户过目，再进入差分？（建议：是）