# 宠物精灵视觉修复记录 · 2026-09-17

范围：检查猫、狗、狐狸、龙的正式三阶段精灵，重点排查身体透明孔洞、残留背景、五官错位、动画裁切、重复帧以及特效与主体重叠。保留既有角色造型和选定参考图。

[修复前后对照图](visual-audit-preview.png)：小狗抬头时的颈部与口鼻、成年狐狸的透明口鼻及地面残影、少年龙的缺失腿尾像素及灰影。

## 发现与处理

| 宠物 | 问题与处理 |
|---|---|
| 猫 | 87 帧未发现身体内部透明孔或半透明脏边；保留上一轮小奶猫所有动作右移 2px 的视觉居中校正。 |
| 狗 | 口鼻椭圆原先绕过 `Canvas.offset`，吃饭与走路时不跟随五官；改为同一坐标偏移。恢复闭眼区域的毛色，补齐抬头时的颈部连接。待机改为上移呼吸、开心不再向下裁脚底；下垂尾巴保留完整描边，成年狗洗澡不再向左裁耳。睡姿用足够大的母画布绘制再缩放，两个 Z 与身体分离。每侧 5 颗泡泡放在主体外。 |
| 狐狸 | 恢复幼狐及成年狐缺失的口鼻底色、修复中间阶段的颈部连接，移除成年狐脚下背景阴影及杂点。修复多组重复动画帧、吃饭表情变化、移动裁切和泡泡 / Z 覆盖主体的问题。 |
| 龙 | 对照已选原始量化图恢复中间阶段误删的腿 / 尾部像素，并移除脚下灰色阴影。清除旧眼残留，校正鼻嘴中心；修复重复帧、上跳裁头顶及泡泡 / Z 覆盖主体的问题。 |

透明背景、身体外侧留白，以及小狗尾巴与颈部 / 腿之间的自然缝隙属于正常轮廓，不做整张 flood fill 填实。正式 PNG 使用二值 alpha；特效的独立连通块需与缺失像素区分。

狐狸生成器改为读取 `assets/sprite-bases/fox-{kid,teen,adult}-source.png`，不再把自己上次输出的正式帧当作输入；三张 source 保留修复前已选底图，清理与补色由脚本复现。龙沿用 `tmp-dragon-concept` 中既有已选 base，少年龙误删像素从同尺寸的 `dragon-teen-v4_001-base.png` 原位恢复。

## 复现

沿用项目的程序差分工作流（Python 3 + Pillow）。三个物种各自生成，不要运行历史猫手绘脚本覆盖已完成的 mmx 猫素材。

```bash
python3 scripts/redraw-dog-local.py
python3 scripts/fox-differential.py
python3 scripts/dragon-differential.py
python3 scripts/test-cat-redraw.py
python3 scripts/test-dog-redraw.py
python3 scripts/test-fox-sprites.py
python3 scripts/test-dragon-sprites.py
python3 scripts/test-sprite-contract.py
node scripts/test-pet-preview.js
node --check src/app.js
node scripts/build.js
```

`node scripts/serve-no-cache.js` 启动本地预览。`?pet-test=cat|dog|fox|dragon` 中的值任选一个；页面顶部可直接切换物种，支持 11 种动作、暂停和前后逐帧。设置里的“状态试验台 · 点了就看”也有“动作预览 →”入口，打开当前宠物的预览。

预览不读写学习存档。修改素材后需重新构建单文件 HTML，再刷新浏览器。

## 验证结果

- 4 个物种共 348 张正式三阶段帧已逐帧检查；无半透明脏边、真实身体孔洞或非特效孤点。小狗正常尾腿间隙保留。
- 猫 / 狗 / 狐狸 / 龙的素材测试、精灵接线测试和 11 组预览及正常入口回归均通过。
- 三个生成器重新运行后，仓库全部 487 张 PNG 的 SHA256 均未变化，确认正式产物可复现且未覆盖其他物种。
- 单文件构建成功；浏览器实测狗、狐狸、龙的吃饭、跳动、睡眠和洗澡预览，无控制台错误。
