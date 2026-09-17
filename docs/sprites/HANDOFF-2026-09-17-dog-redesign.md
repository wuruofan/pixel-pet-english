# 小狗三阶段重做交接 · 2026-09-17

用户要求小狗**以金毛犬为原型，参考猫的三个形态**。本轮保持同一只狗的身份，参考猫对应阶段的体量与像素块风格，用头身比例、毛色、腿长、胸毛和尾巴呈现成长。

三阶段造型、87 张正式帧与浏览器预览已完成，本轮验收全部通过，结果见文末。

## 设计选择

三个阶段均为正面坐姿，沿用统一的金毛身份，体量和细节逐步成长：

| 阶段 | 造型与比例 | 正式画布 |
|---|---|---|
| baby | 浅金色小奶狗，体量较小，短前腿、小尾巴，保留大头幼态 | 36×38 |
| kid | 暖金色圆脸幼犬，身体长大，腿和尾巴更明显 | 36×38 |
| adult | 较深金色成犬，更宽的胸毛、更大的爪子与蓬松侧尾 | 44×48 |

baby 与 kid 使用相同画布尺寸；角色主体占位分别为 25×29、27×32、34×41。baby/adult 在素材中向右调整 1px，消除侧尾对整体中心的影响；运行时无需额外狗偏移。

本轮原始参考图使用内置 **imagegen** 以猫对应阶段原图为风格参考的编辑。出图工具与此前 mmx 路线不同，后续仍使用项目的量化、清理、按阶段锚点绘制表情和动画的流程。[提示词与选图映射](dog-redesign-prompts.json) 记录最终三张金毛的提示词、猫参考图路径、素材路径和 SHA-256；保存的 source PNG 与生成原图逐字节一致。

## 素材与生成入口

| 文件 | 用途 |
|---|---|
| `assets/sprite-bases/dog-{baby,kid,adult}-source.png` | 三张已选金毛参考图的原始 PNG，作为可追溯来源保留 |
| `scripts/prepare-dog-bases.py` | 清理分离的背景噪点、统一调色板并量化到各阶段画布 |
| `assets/sprite-bases/dog-{baby,kid,adult}-quantized.png` | 量化输出，供差分生成器读取 |
| `scripts/dog-differential.py` | 生成各阶段基础图和 28 个表情 / 动作帧 |
| `assets/sprites/dog-{baby,kid,adult}-v2*.png` | 正式基础图与动作帧，共 87 张 |
| `docs/sprites/dog-redesign-preview.png` | 三阶段造型与表情对照图 |
| `scripts/redraw-dog-local.py` | 兼容旧命令，委托 `dog-differential.py` 生成当前设计 |

量化从原始透明图提取角色主体，统一三阶段调色板，使用 8 倍 LANCZOS → NEAREST 缩小流程，输出二值 alpha。调色板与各阶段角色占位根据金毛参考图校准。仅修复缩小过程中产生的封闭透明孔；保留身体外侧、腿间和尾巴周围的正常留白，并预留跳动及侧边特效空间。

每一阶段都从自己的量化图派生五官和动作。后续修改应写入量化或差分脚本，再重生成正式 PNG，避免把上次输出当成新的原始来源。

## 动画与运行时契约

运行时继续使用 `PET_FRAMES` 的 dog 分支与 `dog-{baby,kid,adult}-v2` 前缀，阶段名称和文件映射保持一致。蛋仍共用 `cat-egg-v2`，沿用运行时按物种染斑点的机制。

三个阶段各包含一张基础图和以下 28 帧，共 87 张：

```text
idle-0 / idle-1
blink
droopy
eat-0 / eat-1 / eat-2
excited-0 / excited-1 / excited-2
grunt-0 / grunt-1
happy-0 / happy-1 / happy-2
sad-0 / sad-1
sleep-0 / sleep-1
walk-0 ... walk-6
wash-0 / wash-1
```

预览提供 idle、blink、happy、excited、eat、walk、sleep、droopy、sad、wash、grunt 共 11 种动作。走路为 7 帧整只上下蹦跳；五官、口鼻与身体同步移动。洗澡每侧 5 颗大小交错的蓝泡，睡觉为 4×4 和 3×3 的两个 Z，均与主体保持透明间隔。验收时应关注吃饭三帧的区别、眼嘴残留、角色边缘裁切、透明孔洞、地面阴影，以及泡泡和 Z 与主体的间隔。

## 重建与预览

需要 Python 3、Pillow 和 Node.js。在项目根目录执行：

```bash
python3 scripts/prepare-dog-bases.py
python3 scripts/dog-differential.py
python3 scripts/test-dog-redraw.py
python3 scripts/test-sprite-contract.py
node scripts/test-pet-preview.js
node --check src/app.js
node scripts/build.js
node scripts/serve-no-cache.js
```

在服务输出的本地地址后加 `?pet-test=dog`，同时查看三个阶段，可播放、暂停及逐帧检查。该预览入口不读写学习存档。设置中的“状态试验台 · 点了就看”也可通过“动作预览 →”进入当前宠物的预览。

正式页面使用构建后的单文件 HTML。修改素材后重新构建并刷新，确保检查的是本轮输出。[生成的对照图](dog-redesign-preview.png) 用于静态检查，实际播放效果仍需在浏览器验证。

## 验证状态

以下状态针对本轮金毛新设计。猫、狐狸、龙的图片检查也已通过；通用蛋像素校验值保持不变。

| 项目 | 状态 |
|---|---|
| 三张金毛原始参考图与提示词选图映射一致 | 通过；原始 PNG 字节一致，提示词附来源与校验值 |
| `python3 scripts/test-dog-redraw.py` | 通过 |
| `python3 scripts/test-sprite-contract.py` | 通过 |
| `node scripts/test-pet-preview.js` | 通过 |
| `node --check src/app.js` 与 `node scripts/build.js` | 通过 |
| 浏览器三阶段 11 动作、播放 / 暂停 / 逐帧、返回游戏 | 通过；11 动作切换、关键动画逐帧和返回游戏正常，控制台无警告或错误 |
| 量化及差分重跑后正式产物一致 | 通过；兼容入口重跑前后 497 个素材 / 源图 / 对照图 SHA-256 一致 |

此前 [全宠物视觉修复记录](HANDOFF-2026-09-17-visual-audit.md) 记录旧狗造型的问题和修复，保留历史内容。本轮之后的小狗造型、来源和生成入口以本交接文档为准。
