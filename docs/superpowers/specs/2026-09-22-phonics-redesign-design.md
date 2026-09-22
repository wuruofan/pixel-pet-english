# Phonics Tab Redesign — Design Spec

| | |
|---|---|
| Date | 2026-09-22 |
| Status | Draft · awaiting user review |
| Owner | mavis (root) |
| Brainstorming session | confirmed direction: A. 真正掌握拼读规则, A. 每天刷, D. 三者都要 |

## 1. Context

拼读 tab 是给孩子练习自然拼读的 4 个子游戏（字素表 / 听音选字母 / 见字选音 / 拆词拼读）。

## 2. Current State & Problems

经过代码审查发现，当前实现存在**数据脱节 bug** + **教学时刻缺失**两个层面的问题：

1. **数据脱节**：`build.js` 在构造 `PHONICS.groups.items` 时已经识别并丢弃 11 个"粘合块"（`il / eye / nd / ao / dp / dn / es / wo / ne / pe`，这些 letters 在源站的对齐算法里出现但不是可教学的标准字素）。但 `renderPhBuild` 直接读 `WORDS[w].pindu` 而绕过这层过滤 → 9 个高频词（pencil / eyes / grandma / jiaozi / grandpa / wednesday / two / nine / grapes / noodles）会在游戏里展示出伪字素。
2. **教学时刻缺失**：拆词拼读拼对后只祝贺、立刻给下一个词；听音/见字判分后不自动回放正确答案的音；同字母不同音（`grandma` 里两个 `a` 发 /æ/ 和 /ɑː/）视觉上完全一样 — 但拼读规则里"同字母不同音"恰恰是最核心要教的。
3. **统计脱节**：`renderPhBuild` 没调 `pgrade()`，所以字素表的"3 次对打绿勾"完全靠听音/见字两个游戏 → 拆词游戏的练习不进字素掌握度，违反"掌握 = 三者都要绿勾"的判定。

## 3. Goals & Non-Goals

### Goals
1. 4 个子游戏共享一个数据口径（PHONICS.groups.items + PHONEMES_BY_WORD），不再出现伪字素。
2. 拆词拼读拼对后有"教学时刻"反馈（字素颜色 + 分类标签 + 同字母不同音对比）。
3. 听音选字母 / 见字选音判分后自动播放正确答案的音。
4. 见字选音给视觉锚点（每个选项下方显示参考词）。
5. 拆词抽词策略优先含未掌握字素的词。
6. 听音/见字/拆词三个游戏都贡献到字素掌握度。

### Non-Goals
- 不引入音标（沿用 PB_TAG 6 色字素块）
- 不重写 `data/words.json`（数据源不变）
- 不做字素 SRS 复习引擎（独立 spec）
- 不动字素表 `cards`（保持浏览模式）
- 不动首页"拼读 0/5"指标（但拆词拼对会让该计数自然涨）

## 4. Design

### §4.1 Architecture

- **build.js**：在原 PHONICS.groups 基础上新增导出 `PHONEMES_BY_WORD` —— 一个 `{ word → [phonemeItem, ...] }` 字典。phonemeItem 用 **浅拷贝**（spread `{...item}`）从 `PHONICS.groups.items` 里挑，避免引用共享导致运行时修改污染 PHONICS.groups。
- **app.js**：4 个子游戏统一通过 `PHONICS.groups.items`（题池+干扰项池）和 `PHONEMES_BY_WORD`（拆词游戏词池）取数据。**绕过 `WORDS[w].pindu` 字面字段**。
- **统计**：拆词拼对时，对**每个**参与字素调一次 `pgrade(letters, true)`，让字素表的绿勾反映拆词练习。

### §4.2 Data Flow

```
build 时                                       runtime
─────────                                      ──────
WORDS[w].pindu (原始对齐数据)         ↓                     PHONEMES_BY_WORD[w] = [...]
  ↓                                       ↓ 过滤: 2-5 段 + 所有音素可分类
classify() 过滤粘合块                  ↓
  ↓                                       → renderPhBuild 词池
PHONICS.groups.items                  → renderPhHear / renderPhSee 题池
                                      → renderPhCards 浏览
```

### §4.3 听音选字母 (renderPhHear)

1. **判分后自动播放正确答案的音**（对错都播）：答对 = 强化记忆，答错 = 告知正确答案
2. **干扰项分层策略**（见 §4.6）
3. 答错界面已有播 `chosen` 音，确认是播正确答案而不是孩子的音

### §4.4 见字选音 (renderPhSee)

1. **每个喇叭下方显示一个参考词**（从 phonemeItem.words 数组里挑第一个当前课本里有的）。孩子有视觉锚点，不用纯靠听觉。
2. **判分后播放正确答案参考词的整体发音**（`speakWord(referenceWord)`），强化"字素→词"连接。
3. 反馈区"是 X"旁边也显示参考词。

### §4.5 拆词拼读 (renderPhBuild) — 核心重做

1. **改数据源**：用 `PHONEMES_BY_WORD[word]` 取代 `WORDS[w].pindu`。
2. **pool filter**：`currentBookWords().filter(w => PHONEMES_BY_WORD[w] && 2 <= PHONEMES_BY_WORD[w].length <= 5)`。
3. **抽词策略**：优先抽含未掌握字素的词：
   - `未掌握数 = phonemes.filter(p => !S.phonics[p.letters] || S.phonics[p.letters].right < 3).length`
   - 优先从 `未掌握数 >= 1` 的词里抽
   - 全部已掌握时退回随机
4. **拼对反馈**（教学时刻）：
   - 每个 slot 亮起颜色（蓝/粉/紫/橙/青/灰）+ 分类标签（"辅音"/"元音"/"辅音组合"/"元音组合"/"r 控元音"/"不发音"）
   - 同字母不同音标注 `(1)` / `(2)`，反馈里说明"两个 `a` 都发 a，但第一个 /æ/、第二个 /ɑː/"
5. **拼错 hint**：回放下一个该点的字素的音
6. **拼对调 pgrade**：对每个参与字素 `pgrade(letters, true)`

### §4.6 干扰项策略 (phDistractors) — 分层

| 优先级 | 选法 |
|---|---|
| 1 | 同长度 + 同首字母的字素（如 `gr` 优先 `gl / br / dr`） |
| 2 | 同 kind（保留原行为） |
| 3 | 全池（兜底） |

每层 shuffle 后取 n 个，不够补下一层。

### §4.7 教学时刻协议（统一）

判分 / 拼对后固定行为：

| 触发 | 行为 |
|---|---|
| 听音选字母判分 | 自动播放正确答案的音 |
| 见字选音判分 | 播放正确答案参考词的整体发音 |
| 拆词拼对 | 字素色 + 分类标签 + 同字母不同音对比 + 整词发音 |
| 拆词拼错 | 回放下一个该点字素的音（hint） |

## 5. Verification (Acceptance Criteria)

每条独立可验：

1. 拆词拼读里**绝不再出现** `nd / eye / il / ao / dp / dn / es / wo / ne / pe` 伪字素
2. 拆词拼读里**绝不再出现** 9 个粘合块词（pencil / eyes / grandma / jiaozi / grandpa / wednesday / two / nine / grapes / noodles）
3. 拆词拼读拼对调 `pgrade()`，字素表绿勾会因拆词游戏而更新
4. 见字选音每个选项下方显示参考词
5. 听音选字母 / 见字选音判分后自动播放正确答案的音
6. 拆词拼读拼对后展示字素分类标签（6 色）
7. 抽词策略优先抽含未掌握字素的词（手动构造 right=0 验证）
8. 同字母不同音的词（grandma）拼对后，slot 标注 `(1)` / `(2)` 区分
9. console 无新增报错
10. build 后单文件可双击运行
11. 干扰项凑不齐时 fallback 到下一层（手动构造 right=0 场景验证）

## 6. Scope Estimate

净改动约 **150 行**：

| 模块 | 行数 | 备注 |
|---|---|---|
| build.js 新增 PHONEMES_BY_WORD | ~30 | 数据层导出 |
| renderPhBuild 重做 | ~60 行 | pool filter + 抽词策略 + 教学时刻 + pgrade 调用 |
| renderPhHear / renderPhSee 微调 | ~30 行 | 自动回放 + 参考词 + 干扰项分层 |
| phDistractors 重写 | ~20 行 | 三层 fallback |

可在一个 commit 内完成。

## 7. Risks

- **PHONEMES_BY_WORD 与 PHONICS.groups 的同步**：必须保证 build 时序一致，否则 phonemeItem 的引用断链 → 改为浅拷贝或重新构造对象。
- **干扰项凑不齐**：同长度同首字母的池子小，可能凑不齐 3 个 → fallback 到同 kind。
- **抽词权重**：未掌握字素优先可能导致孩子每次都拼难的词 → 设上限（如最多连续 3 次含同一未掌握字素）。

## 8. Follow-ups (out of scope for this spec)

- **同字母不同音的视觉细化**：本 spec 内只做 `(1)` / `(2)` 标注 + 文字提示。如果实测表明孩子看不懂，需要进一步细化视觉（如 slot 颜色渐变、加小标记等）→ 独立 spec 处理。
- **字素 SRS 复习引擎**：每个字素引入艾宾浩斯稳定度 S，答对 S*=1.5、答错 S*=0.4，R<0.85 自动进复习队列；首页"拼读 0/5" 改为基于 SRS → 独立 spec。
- **拆词游戏补词**：9 个粘合块词被踢出拆词池后，词表会缩水。如果体验变差，可手动补几个有意的"非粘合块"新词进 `data/words.json` → 待评估。

## 9. References

- `src/app.js` renderPhonics / renderPhCards / renderPhHear / renderPhSee / renderPhBuild（行号约 2660-2906）
- `scripts/build.js` classify() / PHONICS.groups 构造（行号约 17-95）
- `data/words.json` 词条 pindu 字段
- 临时 spec（早期版本，引用本设计文档作废）：`docs/phonics-redesign-spec.md`