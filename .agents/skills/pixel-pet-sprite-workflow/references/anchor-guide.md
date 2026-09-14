# 锚点表结构与绘制约定

差分脚本的核心是**表驱动锚点**：把五官坐标放进一个 face 字典，绘制函数只从字典取坐标。
好处：换物种只改表，不改绘制逻辑；对称性靠 eye_L/eye_R 同 y 保证。

## FACE 锚点表（dragon 风格，推荐）

```python
FACE = {
    # 眼睛：左/右眼 3x3 区域起点（左上角），两眼的 y 必须相同（对称）
    'eye_L': (7, 12), 'eye_R': (18, 12),
    # 高光：瞳孔内的白点
    'highlight_L': (8, 12), 'highlight_R': (19, 12),
    # 鼻子：中心点，程序画 2px 横向
    'nose': (14, 15),
    # 嘴巴：中心点（ω 的顶点位置）
    'mouth': (14, 17),
    # 腮红：2x2 区域左上角
    'blush_L': (5, 14), 'blush_R': (22, 14),
    # 眼泪：2 像素竖线起点
    'tear_L': (6, 14), 'tear_R': (20, 14),
    # 擦除填充色：擦除 mmx 原脸区域时用身体主色填充（关键！）
    'erase_color': (154, 207, 95, 255),
}
```

**校准方法**：先在 clean base 上画测试脸，放大 12x 检查位置，再批量渲染。
鼻/嘴/眼必须与 mmx 原图真实位置对齐——**不要凭感觉猜**，用像素 bbox 检测深色区域定位。

## 阶段配置（STAGES）

```python
STAGES = [
    {
        'name': 'kid',                       # 阶段名
        'base': 'tmp-<物种>-concept/<物种>-kid-clean-base.png',  # clean base
        'prefix': '<物种>-kid-v2',           # 输出前缀 → assets/sprites/<prefix>-{pose}.png
        'w': 36, 'h': 38,                    # 画布尺寸（与 base 一致）
        'face': KID_FACE,
        'erase_full': None,                  # 整块擦除矩形 (x1,y1,x2,y2)——原图残留眼/鼻/嘴时用
        'erase_extra': [...],                # 小矩形补擦——清除残留噪点，保留轮廓
        'bubbles': (BUBBLES_R, BUBBLES_L),   # 阶段气泡位置（或 None）
        'zz_pos': ZZ_POS,                    # 阶段 Zz 位置（或 None）
    },
    # ... teen / adult 同理
]
```

**擦除策略**（两个物种验证过）：
- 原图脸部干净 → 不传 erase_full/erase_extra，按锚点自动擦眼(3x3)/鼻(3x1)/嘴(7x4)/腮红(2x2)
- 原图有残留眼/鼻/嘴 → `erase_full` 整块擦除（adult 用过）
- 原图有孤立残留噪点但轮廓要保留 → `erase_extra` 小矩形补擦（kid/teen 用过）
- 擦除后必须检查：残留像素清干净了吗？轮廓还圆润吗（左下角方角补圆）？

## 眼睛 6 态（相对 eye_L/eye_R 绘制）

| 状态 | 形状 | 用途 |
|---|---|---|
| `open` | 3x3 深色 + 白高光 | 默认 |
| `closed` | 3x1 横线（眼中线） | blink / sleep |
| `lid` | 上半深色 + 下半肤色 | droopy 半闭眼 |
| `squeeze` | > < 形 | grunt 挤眼 |
| `arc` | ⌒ 形（上弯） | happy 笑眯眯 |
| `star` | ★ 形（中央亮黄） | excited 兴奋 |

## 嘴巴 5 态（相对 mouth 中心）

| 状态 | 形状 | 用途 |
|---|---|---|
| `smile` | 3 点 ω | 默认 |
| `laugh` | 5 点 ω（更大） | excited / eat-1 |
| `frown` | 倒 ω | sad / droopy / grunt |
| `crumbs` | ω + 8 个食物碎屑（深浅棕分散） | eat-2 |
| `tiny` | 1 点 | 小嘴 |

## 状态层

| 层 | 配置键 | 说明 |
|---|---|---|
| 腮红 | `'blush': True` | 2x2 粉色，**必须放白色口鼻区两侧，y 低于眼睛** |
| 眼泪 | `'tear': True` | 2 像素竖线，挂下眼睑 |
| 气泡 | `'bubbles': 'R'/'L'` | wash-0 右侧 / wash-1 左侧交替；每侧 ≥5 个，大小不一，放头部外侧，勿贴耳 |
| Zz | `'zz': True` | 两个（大 4x4 + 小 2x2 错开），放头部右侧空白，勿与耳朵重叠 |
| 头部位移 | `'offset_y': n` | eat/walk 用；**五官/擦除区域自动跟随偏移**（_offset_face） |

## 全量 pose 配置（28 个，勿删 pose）

见 `scripts/sprite-differential.py` 顶部 `ALL_POSES`——直接复用，已验证。

**关键约定**：
- 走路 = **跳跳蹦蹦**（offset_y = 0/-2/-1/0/+1/-1/0），**不要做腿部差分**（已明确否决：
  腿部差分抠图缺像素、腿分叉到胸口，效果差）
- eat = 三帧不同表情 + offset_y 带动头部（eat-0 open/smile、eat-1 arc/laugh、eat-2 open/crumbs）
- wash = wash-0 右气泡 / wash-1 左气泡交替（跟 dog 一致）

## 两种 face 表风格的取舍

- **dragon 风格**（eye_L/eye_R 起点 + 相对绘制）：表小、对称性好保证，**推荐新物种用**
- **fox 风格**（socket/pupil/glint per-side 独立）：适配非对称 base，但表大、校准费时
- 新物种（cat/dog）优先 dragon 风格；若 mmx 原图左右眼高低不一，再退回 fox 风格逐侧校准
