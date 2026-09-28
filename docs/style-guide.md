# 样式规范 · pixel-pet-english

本项目的所有视觉常量都来自 `src/style.css` 顶部的 `:root`。**任何新代码都不允许写字面量**
`font-size: 14px` / `margin-top: 9px` / `border-radius: 13px` —— 一律引用下面的 token。

> 迁移前：字号 23 种、间距 22 种、圆角 13 种、app.js 里 43 处 inline margin。
> 迁移后：字号 11 种、间距 5 种、圆角 4 种、inline magic number 0 处。

---

## 1. 间距 Spacing —— 4px 基准，5 档

| token | 值 | 用途 |
|---|---|---|
| `--sp-1` | 4px | 控件内部：chip 上下 padding、图标↔文字 |
| `--sp-2` | 8px | 同组元素：pill 之间、meta 行之间 |
| `--sp-3` | 12px | 相关块之间：绿框 → 下一���按钮、卡片内区块 |
| `--sp-4` | 16px | 卡片 padding、区块分隔 |
| `--sp-5` | 24px | 大区块、页面边距 |

**唯一允许的例外**：`#app` 的 `padding-bottom: 108px` / `120px` 和 pet-test 的 `28px`。
这些是给固定底部 tabbar 预留的**布局空间**，不是 UI 间距，改小会让内容被 tabbar 盖住。

---

## 2. 字号 Type —— 10 档 + 音标专用

| token | 值 | 用途 |
|---|---|---|
| `--fs-hero` | 42px | 正在学的那个单词（全场最响的文字） |
| `--fs-d1` | 34px | 分数环、答题大数字 |
| `--fs-d2` | 26px | 统计数字 |
| `--fs-h1` | 24px | 区块标题、中文释义 |
| `--fs-h2` | 19px | 字母块、大按钮、选项文字、品牌名 |
| `--fs-ipa` | 20px | 音标作为**主标签**时（选项按钮内） |
| `--fs-body` | 15px | 正文、反馈文字、pill 里的字母 |
| `--fs-sub` | 14px | 次级文字、toast |
| `--fs-label` | 13px | 说明文字、chip、hint |
| `--fs-xs` | 12px | 小字、pill 里的中文类目 |
| `--fs-micro` | 11px | 角标、序号、pill 里的音标 |

### 2.1 字母 > 中文 > 音标

同一个 pill 里三样东西并排时（`.ph-tag`），顺序是 **字母 15px > 中文 12px > 音标 11px**：

```css
.ph-tag .ph-l   { font-size: var(--fs-body); }    /* 15px 字母，主角 */
.ph-tag em      { font-size: var(--fs-xs); }      /* 12px 中文，辅音/元音 */
.ph-tag .ph-ipa { font-size: var(--fs-micro); }   /* 11px 音标，最次 */
```

**为什么中文要比同级西文小一档**：CJK 字面高度天然大于拉丁，同字号时中文会显得更重更大，
缩一档才能和音标视觉平衡。**为什么音标最小**：`/θ/` `/ð/` `/ɪ/` 是细笔画，
低于 ~11px 在小屏上会糊成一团；但在 pill 里字母才是主角，所以音标降级为最次。

音标一律 `/…/` 斜杠包裹，**不要加 `font-style: italic`** —— PingFang 没有真斜体，
会退化成假斜体，反而更难认。

---

## 3. 图标 Icon —— 4 档，**独立于字号**

emoji 和图标尺寸**不属于**字号体系。混进去的后果是：76px 的词卡大图会被挤进 42px 的文字档。

| token | 值 | 用途 |
|---|---|---|
| `--icon-hero` | 76px | 词卡大图、闯关结果大 emoji |
| `--icon-lg` | 40px | 主按钮 emoji（麦克风、大喇叭、空态） |
| `--icon-md` | 26px | 常规 emoji（logo、任务图标、浮动特效） |
| `--icon-sm` | 14px | 字形符号（× ✓ 💩） |

圆形用 `border-radius: 50%`，不要用 `999px`。

---

## 4. 圆角 Radius —— 4 档

| token | 值 | 用途 |
|---|---|---|
| `--r-pill` | 999px | 胶囊（按钮、badge、进度条） |
| `--r-sm` | 8px | chip、小色块 |
| `--r-md` | 12px | 卡片内的行、答案框 |
| `--r-lg` | 22px | 主卡片 |

`border-width`（`2px solid`）是**描边粗细不是圆角**，保持字面量。

---

## 5. 结果容器规范（硬性）

`.feedback` 是**唯一**的结果容器。答案、解释、对照表**必须**放在它里面。

三条规则，任何新题型都套用：

1. **结果容器内的答案行不写 margin。**
   `.feedback` 是 `display:flex; align-items:center`，而 `align-items` 居中的是 **margin box**
   不是 border box。任何上下不等的 margin 都会把内容推离中心线 `(marginTop−marginBottom)/2`。
   答案行用 `.in-answer`（`margin: 0`），横向间距归父容器的 `gap`，纵向归 `padding`。

2. **结果容器与后续按钮的间距只由按钮一侧决定。**
   用 `.feedback + .next-round { margin-top: var(--sp-3); }`。
   绝不要指望容器内元素的 `margin-bottom` 和按钮的 `margin-top` 会「相加」——
   它们分属两个不同的盒子，之前正是这个误解让绿框和按钮贴到了一起（10px → 2px）。

3. **每个盒子只有一个间距来源。** 需要调间距时只改一处，不要两处一起动。

---

## 6. 迁移脚本的正确写法

批量改样式时，脚本必须**只改白名单属性**，其余字节不动：

- 只碰 `font-size` / `margin` / `padding` / `gap` / `border-radius` 的**值**
- 不碰 `border-width`、`box-shadow` 偏移、`width/height/top/left`、`transform`
- 负 margin 保留符号
- `auto` / `0` 保持原样（`margin: 4px auto 10px` 要逐值处理，不能整条跳过）
- 用**选择器**匹配而不是行号 —— `:root` 一改，所有行号都会漂
- 每次跑完校验花括号平衡，未命中就**拒绝写入**，不要静默改一半
