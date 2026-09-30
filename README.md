# Pixel Pet English

给孩子（二年级）做的游戏化英语学习站（单词记忆 + 自然拼读）。像素风电子宠物作为学习伙伴，可换成多种动物。单文件 HTML，无外部 JS/CSS 依赖。

> v3 起移除了「句子」tab：源站切句边界不准、重复句型多，且整句展示会把译文答案摆在题面上。课文数据在构建时剥离（只保留每册词表），体积 308KB → 224KB。
>
> v4 新增顶栏 ⚙️ 设置入口（底部弹层）：教材管理（切换 + 查看完整词库，点词听发音）+ 宠物图鉴（四个进化阶段预览，点一点看表情）+ 家长设置（音标开关 / 导入导出 / 清空，自统计页迁入）。
>
> **v5 词库从「教材分册」改为「难度分层」**（94 → 137 词）。理由和取舍见下面「词库怎么组织的」。
>
> **v6 启用 L3：接入剑桥官方 A2 Key (KET) 词表，137 → 1462 词**。同时把 `band` 标签改成从
> `books` 自动推导，并修掉三个真 bug（详见下面「v6 修掉的问题」）。
>
> **v7 L3 按 Oxford 3000 的 CEFR 等级再拆三层，3 层 → 5 层**。KET 官方词表本身是平铺的
> A2 列表、没有内部分级（Cambridge 只另外发布与之并列的 Starters/Flyers/Movers），
> 所以用 Oxford 3000 的 A1/A2/B1/B2 作为难度轴。修掉两个真 bug，详见「v7 修掉的问题」。

```
pixel-pet-english.html  ← 成品，双击即可用（也可部署到任意静态服务器）
data/words.json          ← 1462 词：音标、英美发音、逐音素自然拼读、释义、例句、band 分层标签
data/l2-words.txt        ← 日常词清单（43 词）。改这个文件就能加日常词，见下
data/l3a-words.txt       ← 拓展词清单（959 词，KET ∩ Oxford A1/A2）
data/l3b-words.txt       ← 挑战词清单（76 词，KET ∩ Oxford B1/B2）
data/l3c-words.txt       ← 补充词清单（290 词，KET 中 Oxford 未收录的）
data/oxford-cefr.json    ← Oxford 3000 的 CEFR 分级原始结果，由 fetch-oxford-cefr.js 拉取
data/ket-words.json      ← 剑桥官方 A2 Key (KET) 词表原始解析结果（1543 词，含 98 个短语）
data/textbooks.json      ← 三册课文（目录 / 逐句英文+中文 / 逐句音频时间轴）。已不打包进产物，
                           只作为 fetch_textbooks.js 的刷新目标和词频统计的输入
data/visuals.json        ← 词 → 图形（emoji / 字形徽章），359/1462 有图
src/app.js  src/style.css
scripts/fetch_textbooks.js  scripts/fetch_words.js  scripts/parse_ket_list.js  scripts/build.js
scripts/fetch-oxford-cefr.js  scripts/split-l3-bands.js
scripts/apply-emoji-l3.js  scripts/test-learning-pool.js
```

## 词库怎么组织的

词分五层，不按教材册也不按主题：

| 层 | 词数 | 依据 |
|---|---:|---|
| ⭐ L1 核心词 | 94 | 源站官方必背表（一上 21 + 二上 25）46 词，**加上**一下无官方词表、当年从课文正文人工整理的 57 词（去重后 94） |
| 🌱 L2 日常词 | 43 | 课本正文出现 ≥4 次、但任何必背表都没收录的实义词 |
| 🌳 L3A 拓展词 | 959 | KET 词表 ∩ Oxford 3000 A1/A2 —— KET 里最日常的一批，学完教材该往这儿走 |
| 🎯 L3B 挑战词 | 76 | KET 词表 ∩ Oxford 3000 B1/B2 —— 其中真难的尾巴：`examination` `helicopter` `photographer` `frightened` |
| 📦 L3C 补充词 | 290 | KET 词表里 Oxford 3000 **未收录**的词 |

L3A + L3B + L3C = 1325 词，即剑桥官方《A2 Key Vocabulary List》（UCLES 2018）里的单词。

**L3A/L3B/L3C 为什么这么切**：KET 官方词表本身是**平铺的 A2 列表，没有内部分级**。
Cambridge 确实有 Starters / Flyers / Movers，但那是与 KET **并列**的三张表，不是它的上下级，
所以「KET 一级 / 二级」官方不存在。改用 Oxford 3000 的 CEFR 等级（A1/A2/B1/B2）作难度轴——
它基于英国国家语料库的词频，正是 L3 需要的那个坐标。

**L3C 为什么单开一层，而不是并进 L3B**：Oxford 3000 是**去重后的 3000 个核心关键词**，
某词缺席意味着「Oxford 没把它当优先关键词」，不是「Oxford 认为它很难」。翻这 290 词就知道：
`about` `able` `across` `after` `and` 是虚词，`ball` `pizza` `beach` `cabinet` 是孩子早会的，
`glasses` `shorts` `feelings` `walking` 是复数派生形。把它们挂到 🎯 挑战名下，
是**凭空发明一个源数据从未声明过的难度**。所以给它们一层诚实的 📦 补充词——
排在最后是因为没有更好的难度依据，不是因为它们最难。

**L1 和 L2 的真实分界是「有没有教材背书」，不是词频。** 这点值得说清楚，因为
L1 里有 48 词和 L2 同源：源站对新版一年级下册没有词表页（见「已知缺口」），
那 57 词是当年从一下课文正文人工挑的。如果严格按 L2 的词频标准（≥4 次）重排，
这 57 词里有 49 词都够格进 L2。当时没有重排，因为它们都是低年级早该会的词，
留在 L1 只是「早学」而不是「学错」，改动收益不抵风险。

**KET 词表本身的取舍**：KET 词表有 1445 个单词 + 98 个多词短语。本项目只收了单词，
短语（`get up` / `write down` 这类）没做——它们需要词组级的释义和音频，
单音节对齐的 `pindu` 派不上场，收进来只会让出题口径变糊。
另有 15 个词源站没有数据（`cd` / `dvd` / `t-shirt` / `wifi` / `left-hand`
这类缩写和连写词），已从词表剔除。

**为什么不按主题分**：任何固定主题都会「学完即废」——颜色就那么几个，掌握之后
再学 `indigo` 没有意义，词库从此停止生长。分层不会：每层都足够大，学完自动升层。

**为什么不按教材分册**：册的真正职责不是「哪本书」，而是**给孩子的词划一条边界**
（尤其是干扰项不能超出一个孩子没学过的范围，见 `distractors()`）。既然要的是边界，
分层同样能给，而且多了一样教材册给不了的东西：**顺序**。

**层是上限，不是过滤器。** 选了 🎯 挑战，池子是「核心 + 日常 + 拓展 + 挑战」——
不包含 📦 补充的词，但包含所有更简单的词。所以切到挑战层后第一题仍可能出 `read`，
这是对的：孩子没学过它，它就是新词。

**自动升层**：`learningPool()` 从 L1 起，把当前层及以下的词作为池；这一层的新词学完
而上面还有新词时，顶层自动上移一级，直到遇到没学过的新词。所以孩子学完 94 个 L1 词
就会自动开始学 L2，学完 L2 自动进 959 词的 L3A，再往上是 L3B、L3C，全程不需要去设置里手动切。

## v7 修掉的问题

两个都是「代码能跑、界面不报错、日志全绿」那类，都是把测试断言写严之后才暴露的：

1. **学完整个词库的孩子被锁死在 94 个核心词里**。`learningPool()` 的升层循环靠
   「上面还有没有新词」决定要不要上移；全库学完后没有任何新词，循环就地 break，
   `ceiling` 停在设置档自己那一层，复习队列只剩 L1 的 94 词。这正是分层想消灭的
   「学完即废」，只是换了个位置发生。v6 就在这个状态，但旧测试只断言 `reviewing === true`
   和「队列非空」——94 词也满足，所以一直没被抓到。现在全库学完时池子放开成 1462 词：
   没有新词需要挡住，层与层的差别只剩复习轮换顺序。
2. **选了 🎯 挑战 / 📦 补充，拼读页整个是空的**。`pickBuildWord()` 只取当前层，
   而只有 L1/L2 进了拼读字素索引（KET 三层为省 416 KB 全部排除），
   于是这两层拼出空池，tab 看起来像坏了。层本来就是上限不是过滤器，
   已改成取到当前层为止——和词汇/闯关的口径一致。

另外顺手修掉的：`data/custom-words.txt` 在 v6 已改名 `l2-words.txt`，设置页文案没跟上；
两处空状态还写着「这本课本还没有词表」；`phWordsInBookOrder` 用的是「只取当前层」，
和拼读页同一个毛病。

## 体积：1462 词怎么塞进 1486 KB

全量注入是 1.9 MB，产物会从 1247 KB 涨到 3543 KB。砍到 1486 KB 用了两刀，
都是「删掉用不上的数据」而不是压缩：

| 手段 | 省下 | 理由 |
|---|---:|---|
| L3A/B/C 不注入 `pindu` + `examples` | 1230 KB | 这两块只在「学单词」词卡和「拼读」页渲染，闯关出题一个都不用。KET 三层是储备，绝大多数孩子几个月内碰不到 |
| L3A/B/C 不进拼读字素索引 | 373 KB | 同上，索引只服务「拆词拼读」练习 |
| 英音/美音去重，存一个 `audioId` | 115 KB | 源站的英美录音是同一份文件挂在两个目录下，1462 词逐个核对 id 100% 一致 |

净结果：**10.6 倍词量，体积 +19%**。L1/L2（137 词）保持全量，词卡和拼读完整；
KET 三层只带出题必需的 `explains` + `audioId`，`data/words.json` 里数据齐全，随时可补。
（拆分后从 1480 KB 微增到 1486 KB，是五层的 band 标签和每层的来源说明文案，1.4% 的代价。）

瘦身名单由 `BAND_ORDER` 推导而不是手写集合：新增一层时忘了往名单里补一个键，
那 959 个词会带着例句和逐音素音频进包，体积悄悄翻几倍而日志全绿。

## v6 修掉的问题

四个都是「代码能跑、界面不报错、日志全绿」那类，只有实测才暴露：

1. **自动升层只检查紧邻的上一层**。孩子跳着学（L2 先学完）或词库后加词时，
   L2 已空、L3 满满，升级逻辑却在 L2 卡死，永远停在 L1。改成检查「任意更高层」。
2. **产物比源码大 3 倍**。L3 的例句和逐音素数据占了 76%，见上面「体积」。
3. **`band` 标签是手工标的**，忘了和 `books` 同步就会全落进兜底的 L3。
   改成从 `books` 推导（`g1a/g2a/g1b → L1`，`l2 → L2`，`l3 → L3`），单一数据源。
4. **`fetch_words.js` 第一次跑挂死 5 分 46 秒**。诊断发现 CPU 时间只有 0.01 秒，
   卡在单个 HTTP 请求上：超时设了 30 秒且无重试，一个慢响应就堵死整个队列。
   改成 8 秒超时 + 2 次重试 + 每 25 词落盘（可断点续跑）。

## 加词

往 `data/l2-words.txt`（日常）、`data/l3a-words.txt`（拓展）、`data/l3b-words.txt`（挑战）、
`data/l3c-words.txt`（补充）里一行一个词，然后：

```bash
node scripts/fetch_words.js   # 只抓新词（已在 words.json 里的跳过），补齐音标/音频/拼读/例句
node scripts/build.js         # 体检 + 分层自检 + 打包
```

`fetch_words.js` 是**增量**的：改完词表再跑一次，每个新词只发一个请求，不会重抓全库。
每 25 词落盘，中途断了重跑会接着上次继续。`--all` 强制全量重抓。
它也会顺手把已有词的 `books` 标签刷新一遍，所以**只调分层归属时不需要重新抓**——
改词表文件、重跑 `fetch_words.js`（0 请求）、再 `build.js` 就行。

`l3a/l3b/l3c` 是同一张 KET 词表按 CEFR 切出来的三份，不该手改。要重切就
`git checkout data/l3-words.txt && node scripts/split-l3-bands.js`——
它读 `data/oxford-cefr.json`（`fetch-oxford-cefr.js` 拉的，可重现）重新分桶，
一个词出现在多个 Oxford 档时取**最低档**（源表是「一词一行 + 词性」，
`but` 同时是 A1 连词和 B2 副词，取高档会把连词塞进孩子的最难一层）。

抓完后在 `data/visuals.json` 里给它配一个 `{ "emoji": "⚽" }`——
**没配图形的词不会出图片题**（`en2pic` / `pic2en`），因为四个选项里三个都显示
`🔤` 的话孩子没法选；这类词仍然会出 `en2cn` / `cn2en` / `listen2en`。
`node scripts/apply-emoji-l3.js` 可以按一张具象词表批量配，
`--list-missing` 会把配不出的词导出来，那些多半是 `quickly` / `because`
这类本就没有诚实图片的抽象词。

现在 1462 词里 359 词有图（24.6%）。这个比例看着低，但对 KET 这种考试词表是合理的：
大部分是抽象词，硬配 emoji 只会出成猜谜题。

## 重建

```bash
node scripts/fetch_textbooks.js   # 抓教材 → data/textbooks.json
node scripts/parse_ket_list.js /path/to/ket.pdf   # 解析 KET 词表 → data/ket-words.json
node scripts/fetch-oxford-cefr.js # 拉 Oxford 3000 的 CEFR 分级 → data/oxford-cefr.json
node scripts/split-l3-bands.js    # 按 CEFR 把 L3 切成 l3a/l3b/l3c
node scripts/apply-emoji-l3.js    # 按具象词表批量配 emoji → data/visuals.json
node scripts/fetch_words.js       # 抓单词（增量 + 断点续跑）→ data/words.json
node scripts/build.js             # 纠错 + 体检 + 分层自检 + 瘦身 + 打包
node scripts/test-learning-pool.js  # 词池场景测试（5 层升层链 + 边界 + 迁移）
```

KET 词表 PDF 是 UCLES 版权，**不入库**，用到时从剑桥官网下载
（*A2 Key Vocabulary List*, 31 页）。`parse_ket_list.js` 依赖 `pypdf`
（`pip install pypdf`），也接受已提取好的 `.txt`。

## 加词库后怎么验

抓来的 `pindu` 是「字素 → 音素」的**对齐结果**，不是教学规则 —— 双写辅音当年四个词
全标反了（rabbit / happy / apple / yellow 标成「前哑后响」，其实该是前响后哑）。
这类错不会自己暴露，所以纠错和体检都挂在构建链上：`build.js` 先纠错再体检，
**有 ERROR 就不出包**。

```bash
node scripts/phonics-rules.js   # 纠错 + 体检当前 data/，有 ERROR 退出码 1
node scripts/probe-phonics.js   # 查已构建的产物
node scripts/test-learning-pool.js  # 词池场景：自动升层、越层词、空池回落
```

规则全在 `scripts/phonics-rules.js`，构建和体检共用同一份判定，不会出现「体检绿灯、
构建出来却不对」。体检跑四组，另加一组分层自检：

| 组 | 拦住什么 |
|---|---|
| 源词库 | 字素拼不回原词、`start` 与真实位置对不上（高亮直接指错字母）、有音没音频（死按钮）、双写辅音前后颠倒 |
| 字素表 | `letters\|sound` 键重复（会静默覆盖）、条目没有例词（卡片是空的）、有音没音频 |
| 题目 | 某字素干扰项候选不足 3 个（听音选字母凑不满 4 个选项）、某一层一个词都拆不了（拆词拼读空着） |
| 产物 | 例词高亮逐个回代核对：高亮必须落在**同时满足「字母相同」且「音相同」**的那一段上 |
| 分层 | 词条没有 `books` 来源标签、**带了这版构建不认识的 `books` 标签**、某层一个词都没有、`src/app.js` 读的不是 `words[*].band` |

最后一组是 v5 事故的产物：数据里字段叫 `band`、运行时读的是 `level`（那个键名被
`pet.level` 占了），结果 137 词全落进兜底的 L3，⚙️ 里前两层显示「词库 0 词」，
而构建日志全绿、界面也不报错。现在 `band` 由 `books` 推导，构建时对不上就中止；
v7 又加了一条**未知标签**检查——改了 tag 名但忘了同步 `BAND_FROM_BOOKS`，
就是同一类事故换个形状重演。

「产物」那一组是当初 phonics bug 的落点：`panda` 的第二个 `a` 读 /ə/，只按字母找会
标到第一个 `a` 去。体检查不了「读音本身对不对」（sister 第二个 `s` 其实读 /z/，
数据标成 /s/），那类只能靠人抽查。

## 本地预览与宠物动作测试

数据和精灵已在仓库中；日常开发只需构建，无需重新抓取教材：

```bash
node scripts/build.js
node scripts/serve-no-cache.js
```

终端会输出本地地址。打开根路径进入游戏，加上以下参数进入对应宠物的动作预览，也可在页面顶部切换宠物：

| 宠物 | 入口参数 |
|---|---|
| 小猫 | `?pet-test=cat` |
| 小狗 | `?pet-test=dog` |
| 小狐狸 | `?pet-test=fox` |
| 小龙 | `?pet-test=dragon` |

每个宠物同时展示三个成长阶段的 11 种动作，支持播放、暂停和逐帧检查。测试入口不读写学习存档。

设置中的“状态试验台 · 点了就看”提供“动作预览 →”链接，可直接打开当前宠物。狐狸和龙的透明像素及动画修复、重建命令见 [视觉修复记录](docs/sprites/HANDOFF-2026-09-17-visual-audit.md)；其中小狗部分是旧造型的历史记录，当前造型与重建流程见下方小狗交接文档。

小猫使用 handoff 选定的三张 mmx 原图，量化、清理五官和生成 87 张正式精灵均可复现（Python 3 + Pillow）：

```bash
python3 scripts/cat-differential.py
python3 scripts/test-cat-redraw.py
python3 scripts/test-dog-redraw.py
python3 scripts/test-sprite-contract.py
node scripts/test-pet-preview.js
node scripts/build.js
```

`--preview-only` 只输出基础图和表情对照图，不覆盖正式帧。详见 [小猫交接文档](docs/sprites/HANDOFF-2026-09-16-cat-mmx-base.md#10-2026-09-17-实现记录)；[表情对照图](docs/sprites/cat-mmx-preview.png) 可直接查看。旧的 `redraw-cat-local.py` 属于历史手绘方案，会覆盖当前精灵，请勿用于本轮重建。

小狗以**金毛犬**为原型，参考猫对应阶段的体量与像素块风格，三阶段均为正面坐姿：baby 是浅金色、短前腿的小奶狗；kid 是暖金色圆脸幼犬，腿和尾巴更明显；adult 毛色更深，胸毛更宽、爪子更大，带蓬松侧尾。baby/kid 画布为 36×38，adult 为 44×48。三张参考图使用内置 imagegen，保存为 `assets/sprite-bases/dog-{baby,kid,adult}-source.png`，后续沿用量化与程序差分流程：

```bash
python3 scripts/prepare-dog-bases.py
python3 scripts/dog-differential.py
python3 scripts/test-dog-redraw.py
python3 scripts/test-sprite-contract.py
node scripts/test-pet-preview.js
node scripts/build.js
```

差分生成 87 张正式精灵，沿用 `dog-{baby,kid,adult}-v2` 命名、11 种动作及共用蛋；走路仍为 7 帧整只蹦跳。`redraw-dog-local.py` 作为兼容入口委托新生成器。设计选择、[提示词](docs/sprites/dog-redesign-prompts.json)、[预览图](docs/sprites/dog-redesign-preview.png) 与本轮验证状态见 [小狗重做交接文档](docs/sprites/HANDOFF-2026-09-17-dog-redesign.md)。构建后打开 `?pet-test=dog` 检查三阶段。

## 数据来源与口径

| 数据 | 来源 | 说明 |
|---|---|---|
| 课文目录、逐句英文/中文 | 英语朗读宝（suyang123.com） | 页面 Nuxt SSR 载荷中取结构化数据，非 DOM 抓取 |
| 课文逐句音频 | `ywld-1315558954.51jiaoxi.com` | **教材配套原音**，逐句带 start/end 时间轴；腾讯 COS，可直连 |
| 单词音标 / 英美发音 | `static.suyang123.com/.../word-base/{uk,us}` | 词库录音 |
| 自然拼读（逐音素音频 + 对应字母） | `static.suyang123.com/.../syllable` | 例如 school → s / ch→k / oo→uː / l |
| 兜底 TTS | `dict.youdao.com/dictvoice` | 课文音频加载失败时降级；再失败则用浏览器内置 TTS |

## 版本口径（重要）

采用**新教材（2024 版）**，不是 2013 旧版。判据：

- 一年级上册 Unit Two = *You and Me*，Lesson 4 = *What's Your Name?* —— 与"暑假回来 what's your name 都忘了"完全对上。
- 北京 2024 秋起一年级启用新教材，孩子 2025 秋入学，一上/一下/二上均为新版。

旧版一上单元是 *Hello! I'm Maomao / Good morning / How are you?*，词表完全不同（boat / coat / gate…），**两套不能混用**。

## 已知缺口

1. **一下词表无官方来源。** 源站对新版一下没有词表页（旧版才有）。L1 里归给一下的 57 词是**从一下课文正文逐句人工提炼**的，非官方词表，需对照课本核对。L2 的 43 词同样来自课文正文词频（≥4 次），属人工筛选。
2. **配图是 emoji。** 零依赖、离线可用、孩子辨识度高；若要换成真实插图，替换 `data/visuals.json` 即可（建议改成图片 URL 字段）。
3. **跟读自动打分依赖浏览器语音识别。** 桌面/安卓 Chrome 可用；iOS Safari 会降级为"听范读 + 自评"。
4. **音频需联网。** 断网时只剩浏览器内置 TTS。
5. **进度存 localStorage。** 换设备用设置（⚙️）里的导出/导入。

## 设计要点

- **养宠只做外壳，不做驱动。** 像素画 canvas 精灵（蛋宝宝→小绒球→小龙崽→小火龙，参数化表情 + 眨眼 + CSS 动画），饱食度/心情/清洁度三数值随真实时间衰减（懒计算、上限追算 72h，清洁度衰减最慢）。三种学习行为各掉一种宠物素材：学单词得 🍖、拼读得 🎾、闯关得 🧼，对应喂食（饱食度 +28）/ 玩耍（心情 +18，90s 冷却，消耗 🎾）/ 洗澡（清洁度 +35，消耗 🧼），外加抚摸（每日 8 次上限）。答错不惩罚，无排行榜不限时 —— 照搬电子宠物的数值循环，但去掉死亡与挫败。
- **SRS 用艾宾浩斯遗忘曲线**：记忆保持率 R=e^(-t/S)，答对稳定度 S×1.5（上限 60 天）、答错 S×0.4（下限 1 天）；R 降到 0.85 自动进复习队列。**首页"今天的任务"清单就是这个引擎的呈现层**：复习到期词 → 学新词 → 拼读 5 次 → 每日闯关 → 照顾宠物，每项带实时进度徽标、点击直达对应入口，闯关支持复习/新词/混合三种队列。
- **干扰项只在当前及以下的难度层内取**，且优先取 emoji 不同的词，避免还没学的词出来干扰；图片题还会额外要求四个选项**都有配图**（没图的词直接不出 `en2pic`/`pic2en`）。
- **中文释义一律作答后才揭晓。** 题干给出的是词形（或图、或声音），选项也只给同一种形态，中文藏在反馈区里 —— 否则孩子可以直接读中文标签选答案，绕开词形，等于重演"认图不认词"的老问题。唯一的例外是 `en2cn`（题干是英文、选项就是中文），那一题考的本来就是英→中。作答后揭晓的是**全部四个选项**的对照卡（图 + 词形 + 中文），正确项高亮，点任意一行可再听发音 —— 干扰项也都是孩子接触过的词，顺手一起复习。
- **一二年级不学音标，全程无 IPA。** 词卡上的音标默认隐藏，用 6 色字素块代替（辅音蓝 / 元音粉 / 辅音组合紫 / 元音组合橙 / r 控元音青 / 不发音灰），点色块听真实音素音频。家长可在 ⚙️ 设置里开关音标（默认关）。
- **拼读专项 tab（🔤）**：① 字素表——L1/L2 提炼的 244 条"字母组合→读音"，按 6 类分组点读，练对 3 次自动打绿勾；② 听音选字母——听音素选字素；③ 见字选音——看字素从 4 段声音里选对的；④ 拆词拼读——把单词的音素按顺序点出来，拼对奖 🎾。所有玩法只用真实音频，不出现音标符号。
