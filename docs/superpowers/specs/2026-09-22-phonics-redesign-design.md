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

1. **数据脱节**：`build.js` 在构造 `PHONICS.groups.items` 时已经识别并丢弃 10 个"粘合块"（`il / eye / nd / ao / dp / dn / es / wo / ne / pe`，这些 letters 在源站的对齐算法里出现但不是可教学的标准字素）。但 `renderPhBuild` 直接读 `WORDS[w].pindu` 而绕过这层过滤 → 10 个词（pencil / eyes / grandma / jiaozi / grandpa / wednesday / two / nine / grapes / noodles）会在游戏里展示出伪字素；其中 9 个词（含 `wednesday` 在外）在当前 pool filter 范围内（86 → 77 词池）。
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

- **build.js**：在原 PHONICS.groups 基础上新增导出 `PHONEMES_BY_WORD` —— 一个 `{ word → [phonemeItem, ...] }` 字典。phonemeItem 用 **浅拷贝**（spread `{...item}`）从 `PHONICS.groups.items` 里挑，避免引用共享导致运行时修改污染 PHONICS.groups。浅拷贝依赖的不变式：`PHONICS.groups.items[*].audio` 在 build 阶段已确定且永不变化（实际数据验证：359 条 pindu 的 `audio` 恒等于 `f(sound)`，0 例外）；运行时只读 audio 字段、不修改它，因此浅拷贝安全。
- **app.js**：4 个子游戏统一通过 `PHONICS.groups.items`（题池+干扰项池）和 `PHONEMES_BY_WORD`（拆词游戏词池）取数据。**绕过 `WORDS[w].pindu` 字面字段**。
- **统计**：拆词拼对时，对**每个去重后的**字素调一次 `phTrack(letters, true)`（纯统计），词级调一次 `gainXp(1, 'toy')` 和 `dayStat().phonics++`。这样字素表绿勾反映拆词练习、但首页"拼读 x/5"按词计数语义不被破坏。
- **统计拆分**（解决 P0-1）：把 `pgrade(letters, ok)` 拆成两层：
  - `phTrack(letters, ok)`：纯 per-grapheme 统计（S.phonics[letters].right/wrong）
  - `pgrade(letters, ok)`：调 phTrack + gainXp + dayStat（保留原 hear/see 的"答对 1 个字素 = +1 XP + 1 次练习"语义）
- **掌握度判定统一**（解决 P1-1）：抽 `isPhMastered(letters)` helper，单一事实来源 = `S.phonics[letters].right >= 3 && S.phonics[letters].right >= S.phonics[letters].wrong * 2`。字素表绿勾（`renderPhCards` 的 mastered 判定）和拆词游戏抽词时的未掌握判定都调用这个 helper。
- **app.js**：4 个子游戏统一通过 `PHONICS.groups.items`（题池+干扰项池）和 `PHONEMES_BY_WORD`（拆词游戏词池）取数据。**绕过 `WORDS[w].pindu` 字面字段**。

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

1. **每个喇叭下方显示一个参考词**（从 phonemeItem.words 数组里挑第一个**当前课本里**有的）。**Fallback**：如果 `phonemeItem.words` 里没有当前课本词（数据源每个字素只挂 4 个词，可能都不在当前课本），用 PHONICS.groups.items 里其它 sound 相同但 letters 不同的项的 words 数组兜底；再兜不住则隐藏参考词（喇叭旁边只显示字素类型标签）。
2. **判分后播放正确答案参考词的整体发音**（`speakWord(referenceWord)`），强化"字素→词"连接。
3. 反馈区"是 X"旁边也显示参考词。

### §4.5 拆词拼读 (renderPhBuild) — 核心重做

1. **改数据源**：用 `PHONEMES_BY_WORD[word]` 取代 `WORDS[w].pindu`。
2. **pool filter**：`currentBookWords().filter(w => PHONEMES_BY_WORD[w] && 2 <= PHONEMES_BY_WORD[w].length <= 5)`。**长度过滤只在 runtime 这一层**（build 只保证所有字素可分类，不做长度裁剪）。
3. **抽词策略**：优先抽含未掌握字素的词：
   - `未掌握数 = phonemes.filter(p => !isPhMastered(p.letters)).length`
   - 优先从 `未掌握数 >= 1` 的词里抽
   - 全部已掌握时退回随机
   - **连续上限**：同一字素连续出现 ≤3 次后，下一词强制跳过含该字素的词（避免孩子连拼同一字素的 5 个词）
4. **拼对反馈**（教学时刻）：
   - 每个 slot 亮起颜色（蓝/粉/紫/橙/青/灰）+ 分类标签（"辅音"/"元音"/"辅音组合"/"元音组合"/"r 控元音"/"不发音"）
   - 同字母不同音标注 `(1)` / `(2)`，反馈里说明"两个 `a` 都发 a，但第一个 /æ/、第二个 /ɑː/"
5. **拼错 hint**：回放下一个该点的字素的音
6. **拼对统计**：对**去重后的**字素集合调 `phTrack(letters, true)`（纯统计，避免 panda 双 `a` 重复 +2）；词级调一次 `gainXp(1, 'toy')` 和 `dayStat().phonics++`（保留首页"拼读 x/5"的按词计数语义）

### §4.6 干扰项策略 (phDistractors) — 分层

| 优先级 | 选法 |
|---|---|
| 1 | 同长度 + 同首字母的字素（如 `gr` 优先 `gl / br / dr`） |
| 2 | 同 kind（保留原行为） |
| 3 | 全池（兜底） |

**所有层必须满足 `x.letters !== item.letters`**。原因：PHONICS.groups.items 里同一 letters 拥有多个 sound（如 `a` 有 /æ/、/ɑː/、/ə/、/eɪ/、/ɒ/ 五个音），原实现只过滤 `sound !==` 不过滤 `letters !==`，导致听音/见字游戏里点同字母异音的干扰项会被判对。第 1 层"同长度+同首字母"对单字母字素会必然选中其它 4 个 `a` 音，恰好放大这个 bug —— 必须全层加 letters 不等过滤。

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

1. 拆词拼读里**绝不再出现** `il eye / nd / ao / dp / dn / es / wo / ne / pe` 伪字素
2. 拆词拼读里**绝不再出现** 10 个粘合块词（pencil / eyes / grandma / jiaozi / grandpa / wednesday / two / nine / grapes / noodles），其中 9 个笔（86 → 77 词池）会从游戏中消失；验证池大小
3. 拆词拼读拼对调 `phTrack()`，字素表绿勾会因拆词游戏而更新；首页"拼读 x/5"按词计数（每词 +1，不按字素重计）
4. 见字选音每个选项下方显示参考词；当前课本无对应参考词时 fallback 到全局池，再兜不住时隐藏
5. 听音选字母 / 见字选音判分后自动播放正确答案的音
6. 拆词拼读拼对后展示字素分类标签（6 色）
7. 抽词策略优先抽含未掌握字素的词（手动构造 right=0 验证）
8. 同字母不同音的词（如 panda `a / æ / ə`、seven `e / e / ə`、eraser `er / ɪr / ər`）拼对后，slot 标注 `(1)` / `(2)` 区分
9. **干扰项过滤 letters 不等**：手动构造正确项 `letters='a'/sound='ɒ'` 场景，验证 4 个干扰项 letters 全不为 `a`（含其它 sound 的 item）
11. 干扰项凑不齐时 fallback 到下一层：手动构造极端场景（如 item letters='x' 单字母小池子）验证第二层兜底
12. console 无新增报错
13. build 后单文件可双击运行

## 6. Scope Estimate

净改动约 **180 行**：

| 模块 | 行数 | 备注 |
|---|---|---|
| build.js 新增 PHONEMES_BY_WORD | ~30 | 数据层导出 |
| renderPhBuild 重做 | ~70 行 | pool filter + 抽词策略（含未掌握上限）+ 教学时刻 + phTrack 调用（去重） |
| renderPhHear / renderPhSee 微调 | ~30 行 | 自动回放 + 参考词 + fallback |
| phDistractors 重写 | ~20 行 | 三层 fallback + letters 不等过滤（全层） |
| 拆 pgrade → phTrack + 抽 isPhMastered | ~15 行 | 拆分统计与奖励 + 单一掌握度事实来源 |

可在一个 commit 内完成。

## 7. Risks

- **PHONEMES_BY_WORD 与 PHONICS.groups 的同步**：浅拷贝只读 audio 不修改，依赖 §4.1 写明的不变式。运行时禁止修改 `PHONICS.groups.items` 或 `PHONEMES_BY_WORD` 的元素。
- **pgrade / phTrack 拆分后的语义**：拆词游戏只调 `phTrack`，词级 `gainXp` 和 `dayStat().phonics` 调一次。如果未来 hear/see 也只调 `phTrack` 不调 `pgrade`，需要单独评估首页"拼读 x/5"的指标是否还合理。
- **同字母不同音的对比文本**："两个 `a` 都发 a，但第一个 /æ/、第二个 /ɑː/" —— 用了音标字符但 README 说"一二年级不学音标"。需要权衡：是否简化成"两个 a 发的音不一样"（不显示音标），还是保留音标但加 ⓘ 提示。

## 8. Follow-ups (out of scope for this spec)

- **同字母不同音的视觉细化**：本 spec 内只做 `(1)` / `(2)` 标注 + 文字提示。如果实测表明孩子看不懂，需要进一步细化视觉（如 slot 颜色渐变、加小标记等）→ 独立 spec 处理。
- **字素 SRS 复习引擎**：每个字素引入艾宾浩斯稳定度 S，答对 S*=1.5、答错 S*=0.4，R<0.85 自动进复习队列；首页"拼读 0/5" 改为基于 SRS → 独立 spec。
- **拆词游戏补词**：10 个粘合块词中 9 个（86 → 77 词池）被踢出拆词池，词表缩水约 10.5%。如果体验变差，可手动补几个有意的"非粘合块"新词进 `data/words.json` → 待评估。

## 9. References

- `src/app.js` renderPhonics / renderPhCards / renderPhHear / renderPhSee / renderPhBuild（行号约 2660-2906）
- `scripts/build.js` classify() / PHONICS.groups 构造（行号约 17-95）
- `data/words.json` 词条 pindu 字段
- 临时 spec（早期版本，引用本设计文档作废）：`docs/phonics-redesign-spec.md`