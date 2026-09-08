# mmx 出图 + 量化 + 程序差分 — 像素精灵工作流

> 日期：2026-09-08 ｜ 项目：pixel-pet-english ｜ 主题：像素精灵快速迭代工作流沉淀
>
> 背景：fox 物种 v1–v6 用 PIL 手绘 polygon 反复失败（"不像狐狸"/"画得不行"/"表情画在脸外面"），v7 改用 mmx 出参考图 + 量化 + 程序差分，一次成功并经多轮细节调整获用户认可。本文沉淀该工作流，供 cat/dog 重制或新物种接入参考。

## 1. 工作流总览

```
mmx 出参考图 → 量化到 sprite 尺寸 → 清理背景/阴影 → 程序画脸/差分渲染 → 接入运行时 → build → commit
```

**核心思路**：mmx 负责"好看的造型和比例"（AI 擅长的审美），程序负责"精确的像素级表情差分"（代码擅长的可复现性）。两者结合，比纯手绘快 10 倍以上，且表情一致性有保障。

## 2. 详细步骤

### 2.1 mmx 出参考图

**目标**：拿到一张造型好看、比例正确、正面朝向的高分辨率参考图。

**命令模板**：
```bash
mmx image generate \
  --prompt "<物种描述>, big head chibi proportion, front view, centered, plain solid light cream background, simple flat illustration, kawaii style" \
  --n 4 --seed <固定seed> --aspect-ratio 1:1 \
  --out-dir tmp-<物种>-concept --out-prefix <物种>-<stage> \
  --quiet
```

**关键参数**：
- `--n 4`：一次出 4 张候选，选最好的一张
- `--seed`：固定 seed 保证可复现；mmx 在固定 seed 下多张候选变化极小
- `--aspect-ratio 1:1`：正方形画布，方便后续量化
- `--subject-ref type=character,image=<path>`：可选，用已有角色图做参考保持风格一致

**Prompt 要点**：
- 必须强调 `front view`（正面）和 `centered`（居中）
- 必须强调 `plain solid background`（纯色背景），方便后续 flood fill 清除
- 大头比例用 `big head chibi proportion` 或 `large head, small body`
- 不要说 `ears poking out`——mmx 会理解成瓶子开口；蛋形要强调 `perfectly oval egg shape`

**fox 实战 prompt**：
- kid: `a cute baby fox, big head chibi proportion, orange fur with cream white chest and belly, pointy ears, big round adorable eyes, tiny cute smile, front view, centered, plain solid light cream background, kawaii style, simple flat illustration`
- adult: `a cute adult fox, big fluffy tail, big head chibi proportion, orange fur with cream white chest and belly, pointy ears with dark tips, big round eyes, gentle smile, front view, centered, plain solid light cream background, kawaii style`
- teen: `a cute young fox, medium size, between baby and adult proportion, orange fur with cream white chest, pointy ears, big round eyes, shy smile, front view, centered, plain solid light cream background, kawaii style`

### 2.2 量化到 sprite 尺寸

**目标**：把 1024×1024 的 mmx 图量化到目标 sprite 尺寸（如 36×38 / 44×48 / 29×40），保留关键造型和颜色。

**量化脚本**（纯 PIL，可复用）：
```python
from PIL import Image

TARGET = (36, 38)  # 目标尺寸

def detect_bbox(img, tolerance=25):
    """从四角检测背景色，找到非背景区域的 bbox"""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    corners = [px[0,0], px[w-1,0], px[0,h-1], px[w-1,h-1]]
    bg = tuple(sum(c[i] for c in corners)//4 for i in range(3))
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if sum(abs(px[x,y][i]-bg[i]) for i in range(3)) > tolerance*3:
                min_x, min_y = min(min_x,x), min(min_y,y)
                max_x, max_y = max(max_x,x), max(max_y,y)
    return (min_x, min_y, max_x+1, max_y+1), bg

def pixelize(src_path, out_path):
    img = Image.open(src_path).convert("RGBA")
    bbox, bg = detect_bbox(img)
    # 加 3% margin
    bw, bh = bbox[2]-bbox[0], bbox[3]-bbox[1]
    mx, my = int(bw*0.03), int(bh*0.03)
    crop = img.crop((max(0,bbox[0]-mx), max(0,bbox[1]-my),
                      min(img.width,bbox[2]+mx), min(img.height,bbox[3]+my)))
    # 补成正方形
    side = max(crop.size)
    square = Image.new("RGBA", (side,side), bg+(255,))
    square.paste(crop, ((side-crop.width)//2, (side-crop.height)//2))
    # 8x LANCZOS 放大 → 24色 MEDIANCUT 量化 → NEAREST 缩小到目标
    big = square.resize((TARGET[0]*8, TARGET[1]*8), Image.LANCZOS)
    bg_rgb = Image.new("RGB", big.size, bg)
    bg_rgb.paste(big, mask=big.split()[3])
    q = bg_rgb.quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    final = q.convert("RGBA").resize(TARGET, Image.NEAREST)
    final.save(out_path)
```

**关键参数**：
- `8x LANCZOS`：先放大 8 倍再缩小，比直接缩小保留更多细节
- `24色 MEDIANCUT`：量化到 24 色，足够表达造型又不会太碎
- `dither=NONE`：关闭抖动，保持像素块干净
- `NEAREST`：最终缩小时用最近邻，保持像素锐利

**输出**：`<物种>-<stage>-v2-base.png`（目标尺寸，带背景色）

### 2.3 清理背景和阴影

**目标**：把量化后的背景色和地面阴影清除为透明，得到 clean base。

**背景清除**（flood fill 从边缘）：
```python
from collections import deque

def flood_fill_transparent(img, bg_color, tolerance=30):
    """从四边边缘 flood fill，把连通的背景色设为透明"""
    px = img.load()
    w, h = img.size
    visited = set()
    queue = deque()
    # 从四边所有边缘像素开始
    for x in range(w):
        queue.extend([(x,0), (x,h-1)])
    for y in range(h):
        queue.extend([(0,y), (w-1,y)])
    cleared = 0
    while queue:
        x, y = queue.popleft()
        if (x,y) in visited or x<0 or x>=w or y<0 or y>=h:
            continue
        visited.add((x,y))
        r,g,b,a = px[x,y]
        if a == 0:
            continue
        if sum(abs((r,g,b)[i]-bg_color[i]) for i in range(3)) <= tolerance*3:
            px[x,y] = (0,0,0,0)
            cleared += 1
            queue.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    return cleared
```

**地面阴影清除**：mmx 图底部常有浅橙色/灰色地面阴影，需要单独清除。fox 实战中阴影色是 `#f4c18e`（浅橙），从底部边缘 flood fill 清除。

**注意**：flood fill 可能漏掉不连通边缘的孤立阴影像素（如 teen fox 左下角的 5px 横线），需要逐像素检查并手动清除。

**输出**：`<物种>-<stage>-clean-base.png`（目标尺寸，透明背景，无脸或带 mmx 量化的脸）

### 2.4 程序画脸（如需要）

**问题**：mmx 量化到 24 色后，深色的眼睛和嘴巴经常被合并到身体主色里，导致"没有脸"。

**解决方案**：程序绘制脸部，用表驱动锚点精确定位。

**fox 脸部锚点表**（36×38 kid/teen）：
```python
FACE = {
    # 眼窝 3×3（深色填充区）
    'eye_socket_L': (9, 15, 11, 17),
    'eye_socket_R': (23, 15, 25, 17),
    # 瞳孔起点
    'pupil_L': (9, 15),
    'pupil_R': (23, 15),
    # 白色高光
    'highlight_L': (10, 15),
    'highlight_R': (24, 15),
    # 嘴巴中心
    'mouth_center': (17, 22),
    # smile 3点ω: [(-1,0), (0,1), (1,0)]
    # laugh 5点ω: [(-2,0), (-1,1), (0,1), (1,1), (2,0)]
    # 腮红 2×2 粉色
    'blush_L': (5, 18, 6, 19),
    'blush_R': (28, 18, 29, 19),
    # 眼泪
    'tear_L': (8, 18),
    'tear_R': (26, 18),
    # 擦除填充色（画表情时先擦除原脸区域）
    'erase_fill': (248, 160, 70, 255),  # fox 橙色
}
```

**眼睛状态**（6 种）：
- `open`：3×3 深色填充 + 白色高光
- `closed`：1×3 横线（闭眼）
- `lid`：上半填充 + 下半肤色（半闭眼）
- `squeeze`：> < 形（挤眼）
- `arc`：⌒ 形（笑眯眯）
- `star`：★ 形（兴奋）

**嘴巴状态**（5 种）：
- `smile`：3 点 ω
- `laugh`：5 点 ω（更大）
- `frown`：倒 ω（难过）
- `crumbs`：ω + 周围食物碎屑
- `tiny`：1 点（小嘴）

### 2.5 差分渲染全量帧

**目标**：从 clean base 出发，用表驱动锚点渲染所有表情帧，保证一致性。

**差分脚本结构**（`scripts/fox-differential.py`）：
```python
# 1. 加载 clean base
base = Image.open(CLEAN_BASE_PATH).convert("RGBA")

# 2. 定义所有 pose 的表情配置
ALL_POSES = [
    ('idle-0',   {'eyes':'open',   'mouth':'smile'}),
    ('idle-1',   {'eyes':'open',   'mouth':'smile'}),  # 呼吸变体（暂同帧）
    ('blink',    {'eyes':'closed', 'mouth':'smile'}),
    ('eat-0',    {'eyes':'open',   'mouth':'crumbs'}),
    ('excited-0',{'eyes':'star',   'mouth':'laugh', 'blush':True}),
    ('sad-0',    {'eyes':'open',   'mouth':'frown', 'tear':True}),
    ('sleep-0',  {'eyes':'closed', 'mouth':'smile', 'zz':True}),
    ('wash-0',   {'eyes':'open',   'mouth':'smile', 'bubbles':'R'}),
    # ... 共 28 个 pose
]

# 3. 逐帧渲染
for pose_name, config in ALL_POSES:
    frame = base.copy()
    draw_eyes(frame, config['eyes'])
    draw_mouth(frame, config['mouth'])
    if config.get('blush'): draw_blush(frame)
    if config.get('tear'): draw_tears(frame)
    if config.get('zz'): draw_zz(frame)
    if config.get('bubbles'): draw_bubbles(frame, config['bubbles'])
    frame.save(f"assets/sprites/fox-{stage}-v2-{pose_name}.png")

# 4. base 帧（默认表情 open+smile）
base_with_face = base.copy()
draw_eyes(base_with_face, 'open')
draw_mouth(base_with_face, 'smile')
base_with_face.save(f"assets/sprites/fox-{stage}-v2.png")
```

**fox 全量 pose 列表**（28 个，对齐 cat v2）：
`blink, droopy, eat-0/1/2, excited-0/1/2, grunt-0/1, happy-0/1/2, idle-0/1, sad-0/1, sleep-0/1, walk-0~6, wash-0/1`

**蛋的 pose 列表**（17 个 + base）：
`idle-0/1, blink, eat, sleep-0/1, happy, excited-0/1/2, droopy, sad-0/1, wash-0/1, grunt-0/1`

### 2.6 接入运行时

**目标**：在 `src/app.js` 的 `PET_FRAMES` 中注册新物种/新阶段。

**PET_FRAMES 结构**：
```javascript
PET_FRAMES = {
  fox: {
    stage: { 0: 'cat-egg-v2', 1: 'fox-kid-v2', 2: 'fox-teen-v2', 3: 'fox-adult-v2' },
    expr: {
      idle:    { 0: ['cat-egg-v2-idle-0','cat-egg-v2-idle-1'],
                 1: ['fox-kid-v2-idle-0','fox-kid-v2-idle-1'],
                 2: ['fox-teen-v2-idle-0','fox-teen-v2-idle-1'],
                 3: ['fox-adult-v2-idle-0','fox-adult-v2-idle-1'] },
      blink:   { 0: ['cat-egg-v2-blink'], 1: ['fox-kid-v2-blink'], ... },
      // ... 每个表情都要写全 stage 映射
    },
    walk: { 1: 'fox-kid-v2-walk-', 2: 'fox-teen-v2-walk-', 3: 'fox-adult-v2-walk-' }
  }
}
```

**注意事项**：
- stage 0（蛋）所有物种共用 `cat-egg-v2`，运行时通过 `EGG_SPOTS` 斑点变色区分
- 每个 expr 的每个 stage 都要写全，不能省略
- `walk` 只有 stage 1/2/3，蛋没有走路动画
- 多帧变体（idle-0/1、excited-0/1/2 等）暂同帧，后续补呼吸/动画效果

### 2.7 Build + Commit

```bash
node --check src/app.js          # 语法检查
node scripts/build.js             # 构建自包含 HTML（dataURL 注入所有 sprite）
git add -A
git commit -m "feat(<物种>): <描述>"
```

**build 产物**：`pixel-pet-english.html`（自包含单文件，~850KB）

## 3. 脚本清单

| 脚本 | 用途 | 可复用性 |
|---|---|---|
| `scripts/fox-differential.py` | fox 三阶段差分渲染（表驱动锚点） | 高——改 FACE 表和 CLEAN_BASE 路径即可用于新物种 |
| `scripts/fox-egg-differential.py` | fox-egg 差分渲染（已删除，逻辑同 fox） | 高——蛋的锚点表可复用 |
| `tmp-fox-concept/quantize-base.py` | mmx 图量化到 sprite 尺寸 | 高——纯通用，改 TARGET 即可 |
| `tmp-fox-concept/clean-base.py` | 背景/阴影 flood fill 清除 | 高——纯通用，改 bg_color/tolerance 即可 |

**建议**：把 quantize + clean + differential 合并成一个通用脚本 `scripts/sprite-pipeline.py`，参数化物种、阶段、尺寸、锚点表。

## 4. 踩坑记录

### 4.1 mmx 出图

| 坑 | 现象 | 解决方案 |
|---|---|---|
| `ears poking out` | 蛋变成瓶子开口形状 | 强调 `perfectly oval egg shape`，不说 ears |
| 固定 seed 多候选几乎一样 | 4 张图差别极小 | 可接受，选最干净的一张；或换 seed 出第二批 |
| 背景色不纯净 | 渐变背景导致 flood fill 漏 | prompt 强调 `plain solid background`；或 tolerance 调大 |
| 地面阴影 | 底部有浅橙色阴影 | 从底部边缘 flood fill 清除；注意孤立阴影像素 |

### 4.2 量化

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 脸被合并 | 24 色量化后眼睛/嘴巴消失 | 程序画脸，不用 mmx 量化的脸 |
| 颜色太碎 | 量化后颜色块太多 | 24 色足够；MEDIANCUT 比 MAXCOVERAGE 更均匀 |
| 边缘锯齿 | 直接缩小有锯齿 | 先 8x LANCZOS 放大再 NEAREST 缩小 |

### 4.3 差分渲染

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 表情画在脸外面 | 锚点坐标不对 | 先在 clean base 上画测试脸，放大 12x 检查位置 |
| 嘴型不统一 | kid/adult 嘴型不一样 | 统一用 ω 风格，嘴宽按阶段缩放 |
| 鼻子嘴巴挨太近 | 鼻 2px + 嘴 3px 挤在一起 | 鼻嘴间距至少 1px；嘴不要太大 |
| excited 嘴比 adult 还大 | kid 嘴宽失控 | kid 嘴宽 ≤ adult 嘴宽 |
| 腮红位置不对 | 腮红压在眼睛上 | 腮红放在白色胸毛/腹部区域，y 坐标低于眼睛 |
| Zz 跟耳朵重叠 | Zz 位置在耳朵上方 | Zz 放在头部右侧空白处，避开耳朵 |
| 气泡太少 | wash 只有 1-2 个气泡 | 气泡 5 个起，位置自由分布在头部两侧 |
| stage 2 映射错误 | replace_all 只替换了第一个 | 手动检查每个 stage 的帧名，不要批量替换 |

### 4.4 运行时接入

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 背景色没清除 | sprite 有奶油色背景 | flood fill 从边缘清除；检查所有 84+ 帧 |
| 地面阴影残留 | 底部有浅橙色阴影 | 从底部边缘清除；注意孤立阴影（flood fill 漏掉的） |
| EGG_SPOTS 冲突 | fox-egg 已有奶油斑点，运行时又叠橙色 | 通用蛋不用自带斑点，运行时 EGG_SPOTS 统一叠加 |

## 5. cat/dog 重制可行性分析

### 5.1 当前 cat/dog 状态

- cat：v2 版本，PIL 手绘，84 帧（kid/adult 各 28 pose + 蛋 18 帧）
- dog：v2 版本，PIL 手绘，同 cat 结构
- 问题：手绘风格跟新 fox（mmx 出图+量化）不统一，造型相对简单

### 5.2 重制预估

| 步骤 | fox 实际耗时 | cat/dog 重制预估 | 加速原因 |
|---|---|---|---|
| mmx 出参考图 | 3-5 轮（含失败） | 1-2 轮 | prompt 模板已验证，直接套用 |
| 量化 | 1 轮 | 1 轮 | 脚本已写好，改参数即可 |
| 清理背景/阴影 | 2-3 轮（含孤立阴影修复） | 1 轮 | 流程已验证，注意检查孤立像素 |
| 程序画脸/锚点校准 | 5-7 轮（v7.1-v7.5 细节调整） | 2-3 轮 | fox 锚点表可参考，猫/狗脸形不同需调整 |
| 差分渲染全量帧 | 1 轮 | 1 轮 | 脚本已写好，改锚点表即可 |
| 接入运行时 | 1 轮 | 1 轮 | PET_FRAMES 结构已熟悉 |
| build + commit | 1 轮 | 1 轮 | 标准流程 |
| **合计** | **约 15-20 轮迭代** | **约 8-12 轮迭代** | **提速 40-50%** |

### 5.3 重制建议

**优先级**：
1. **cat**（用户最常用，跟 fox 对比最明显）
2. **dog**（其次）

**每阶段重制步骤**：
1. 用 fox 的 prompt 模板，改物种描述，mmx 出 4 张候选
2. 选最好的一张，量化到对应尺寸（cat kid 36×38 / adult 44×48，dog 同）
3. 清理背景和阴影
4. 参考 fox 的 FACE 锚点表，调整猫/狗的脸形位置（猫脸更圆、狗脸更长）
5. 差分渲染 28 pose
6. 接入 PET_FRAMES（替换现有 cat/dog 的 stage 1/3）
7. build + commit

**蛋不需要重制**：通用蛋 cat-egg-v2 已调成暖色调，所有物种共用，风格统一。

**风险点**：
- 猫的识别特征（尖耳、胡须、花纹）在 36×38 尺寸下可能丢失，需要程序补画胡须/花纹
- 狗的识别特征（长嘴、垂耳）跟 fox 差异大，锚点表需要大幅调整
- 现有 cat/dog 的 walk 7 帧是手绘的，重制后 walk 暂用 idle 代替（跟 fox 一样）

## 6. 快速迭代检查清单

每次出新版 sprite 后，按此清单检查：

- [ ] 所有帧背景透明（无奶油色残留）
- [ ] 底部无地面阴影残留（检查孤立像素）
- [ ] 眼睛位置对称（左右眼 x 坐标镜像）
- [ ] 嘴巴在鼻子下方，间距 ≥ 1px
- [ ] 嘴宽 kid ≤ teen ≤ adult
- [ ] 腮红在白色区域，不压眼睛
- [ ] Zz 不跟耳朵重叠
- [ ] 气泡 ≥ 5 个，位置自由
- [ ] 所有 28 pose 帧存在且非空
- [ ] PET_FRAMES 每个 expr 的每个 stage 映射正确
- [ ] `node --check src/app.js` 通过
- [ ] `node scripts/build.js` 成功
- [ ] HTML 中实际渲染效果正常（浏览器打开检查）

## 7. 相关文件

- `docs/sprites/HANDOFF-2026-09-07-fox-concept.md` — fox v1-v6 手绘失败记录
- `scripts/fox-differential.py` — fox 差分渲染脚本（可复用模板）
- `src/app.js` — 运行时 PET_FRAMES 定义（line ~850-980）
- `assets/sprites/` — 所有 sprite PNG
- `tmp-fox-concept/` — fox 概念稿中间产物（mmx 原图、量化 base、预览网格）
