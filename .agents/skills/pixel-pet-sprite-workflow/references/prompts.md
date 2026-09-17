# mmx 出图提示词模板（像素精灵参考图）

## 命令模板

```bash
mmx image generate \
  --prompt "<物种描述>" \
  --n 4 --seed <固定seed> --aspect-ratio 1:1 \
  --out-dir tmp-<物种>-concept --out-prefix <物种>-<stage> \
  --quiet
```

- `--n 4`：一次出 4 张候选，选最好的一张
- `--seed`：固定 seed 保证可复现（固定 seed 下候选图变化极小）
- `--subject-ref type=character,image=<path>`：用已有角色图做参考保持风格一致
  （注意：subject-ref + 固定 seed 时多张候选几乎一模一样，变化小）
- 调用前先 `mmx auth status` 确认登录态

## 基础 prompt 骨架

```
a cute <species descriptor>, big head chibi proportion, <body features>,
<face features>, front view, centered, plain solid light cream background,
kawaii style, simple flat illustration
```

**必含要素**：
- `big head chibi proportion`（大头比例）或 `large head, small body`
- `front view` + `centered`（正面、居中）——不加必出侧脸
- `plain solid light cream background`（纯色背景，方便 flood fill 清除）

**禁止要素**：
- 不要说 `ears poking out` —— mmx 会理解成瓶子开口
- 蛋形要强调 `perfectly oval egg shape`，不说 ears

## teen 阶段专用（正面脸的关键）

teen 是三个阶段里最容易出侧脸的。v1-v3 即使强调 front view 也可能生成侧向脸，
v4 用以下组合才成功生成完全正面对称脸：

```
pixel art style, IDENTICAL TO A POKEMON SPRITE, ABSOLUTELY PERFECT FRONT VIEW,
100% SYMMETRICAL
```

完整 teen prompt 骨架：
```
a pixel art style cute young <species>, <stage features>, big head chibi proportion,
<species-specific features>, IDENTICAL TO A POKEMON SPRITE, ABSOLUTELY PERFECT FRONT VIEW,
100% SYMMETRICAL, single tail (if applicable), no arms, no spikes on back,
plain solid light cream background
```

**经验**：
- teen v1（普通 prompt）：侧向脸 + 双尾巴 → 否
- teen v2（强调 front view + 单尾）：左眼比右眼大、鼻嘴偏左 → 否
- teen v3（subject-ref 用 adult 正面图）：仍是侧向 → 否
- teen v4（pixel art + POKEMON + PERFECT FRONT VIEW + SYMMETRICAL）：完全正面对称脸 ✓

## 各物种实战 prompt

### fox（狐狸）

- kid: `a cute baby fox, big head chibi proportion, orange fur with cream white chest and belly, pointy ears, big round adorable eyes, tiny cute smile, front view, centered, plain solid light cream background, kawaii style, simple flat illustration`
- adult: `a cute adult fox, big fluffy tail, big head chibi proportion, orange fur with cream white chest and belly, pointy ears with dark tips, big round eyes, gentle smile, front view, centered, plain solid light cream background, kawaii style`
- teen: `a cute young fox, medium size, between baby and adult proportion, orange fur with cream white chest, pointy ears, big round eyes, shy smile, front view, centered, plain solid light cream background, kawaii style`

### dragon（小龙，耀西小恐龙风格）

- kid: `a cute baby dragon, big head chibi proportion, green body with cream white belly, tiny wings, big round eyes, tiny cute smile, front view, centered, plain solid light cream background, kawaii style, simple flat illustration, no spikes on back, no arms`
- adult: `a cute adult dragon, big head chibi proportion, green body with cream white belly, small wings, big round eyes, gentle smile, front view, centered, plain solid light cream background, kawaii style, no long snout, no spikes on back`
- teen: `a pixel art style cute young dragon, medium size, green body with cream white belly, big head chibi proportion, IDENTICAL TO A POKEMON SPRITE, ABSOLUTELY PERFECT FRONT VIEW, 100% SYMMETRICAL, single tail, no arms, no spikes on back, plain solid light cream background`

**dragon 经验**：
- kid 第一批没强调 front view → 全是侧面 → 第二批强调 front view 选中
- adult 第一批没强调 no long snout → 头偏左 + 大鼻子 → 第二批强调 no long snout 选中
- 强调 `no spikes on back` 仍可能出背部刺 → 出图后检查，刺由程序清除或重画
- 强调 `no arms` 仍可能出手臂 → 出图后检查
- 尾巴务必强调 `single tail`（避免双尾巴）

### 蛋（egg）

不做专属蛋。通用蛋 cat-egg-v2 已定稿（暖色调、耀西蛋风格不对称斑点），所有物种共用，
不需要 mmx 出图。

## 出图后检查清单（提交给 mmx 前）

- [ ] 是否正面朝向、完全对称（teen 必须）？
- [ ] 是否单条尾巴 / 无多余肢体？
- [ ] 是否有背部刺 / 手臂残留？
- [ ] 背景是否纯色（方便清除）？
- [ ] 底部是否有地面阴影？（有 → 后续 flood fill 清除）
