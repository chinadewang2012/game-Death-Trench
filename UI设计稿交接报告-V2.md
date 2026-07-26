# 死亡战壕 UI V2 设计稿交接报告

> **文档版本**: v1.0
> **设计稿版本**: death-trench-ui-v2
> **风格**: 纯黑 + 荧光绿终端风（Terminal / Hacker Military Interface）
> **设计稿路径**: `f:\ai\game\death-trench-ui-v2\`
> **目标代码路径**: `f:\ai\game\web\`
> **日期**: 2026-07-12

---

## 一、这次改了什么？

**风格完全推翻重做。** 之前是军事橄榄绿 + 暗金色 + 血红色的传统军事风格。现在是：

- **纯黑背景** `#000000`
- **唯一强调色** 荧光绿 `#00ff88`
- **终端/黑客/军事科技界面** 质感
- **等宽字体** Orbitron（标题）+ Consolas（正文）
- **无渐变、无模糊、无大圆角**（最大圆角 6px）
- **扫描线纹理、CSS 线框图标、呼吸灯脉冲动画**

设计稿位置：`f:\ai\game\death-trench-ui-v2\pages\` 下有 8 个 HTML 文件，直接浏览器打开即可预览。

---

## 二、设计稿页面清单

| 页面 | 文件 | 说明 |
|------|------|------|
| 主菜单 | `pages/main-menu.html` | 纯黑背景，"DEATH TRENCH" 大标题带荧光绿发光，扫描线覆盖，5 个终端风格按钮 |
| 大厅 | `pages/lobby.html` | 顶部窄标题栏（40px），100x100 角色线框（无填充、1px 绿边框），3 条属性条（4px），4x2 功能按钮网格 |
| 仓库 | `pages/inventory.html` | 三栏布局：左=出战武器槽（线框枪图标）、中=3x3 武器卡片网格（锁定=30%透明度）、右=弹药背包 + 底部 6 弹匣槽 |
| 黑市 | `pages/black-market.html` | 改装树布局：6 配件节点围绕中央武器线框，连接线，右侧阵营属性面板（六边形图标 + 属性条），底部 Tab 栏 |
| 改装处 | `pages/modification.html` | 三栏：武器列表（7 把） | 2x3 配件网格 | 3 已装备槽位 |
| 皮肤商店 | `pages/skin-shop.html` | 大号武器线框预览区，8 张皮肤卡片（各有彩色 CSS 武器剪影：默认/碳纤维/金色/迷彩/霓虹/红色/蓝色/紫色） |
| 任务线 | `pages/missions.html` | 金色警告横幅，4 张任务卡片（锁定=暗淡/完成=绿色左边框/进行中=绿色发光+脉冲动画） |
| 游戏内 HUD | `pages/game-hud.html` | 网格背景，受击闪红 + 暗角覆盖层，分数面板，任务进度，150x150 小地图，血条，白色透明武器信息区，物品轮盘（WASD） |

---

## 三、核心设计 Token（颜色/字体/效果）

以下变量定义在 `f:\ai\game\death-trench-ui-v2\colors_and_type.css` 中，**代码中必须全部采用**：

### 颜色

| Token | 值 | 用途 |
|-------|-----|------|
| `--brand-accent` | `#00ff88` | 唯一强调色：按钮边框、发光效果、激活状态、数据高亮 |
| `--brand-accent-dim` | `#00cc66` | 次级绿色：悬停态、降级显示 |
| `--brand-accent-dark` | `#009944` | 暗绿：按下态、禁用文字 |
| `--brand-danger` | `#cc3333` | 唯一危险色：受击闪红、错误提示、低血量 |
| `--bg-deep` | `#000000` | 所有背景基底 |
| `--bg-panel` | `rgba(0,0,0,0.92)` | 面板背景 |
| `--bg-card` | `rgba(0,0,0,0.85)` | 卡片背景 |
| `--bg-hover` | `rgba(0,255,136,0.06)` | 悬停背景 |
| `--border-subtle` | `rgba(255,255,255,0.04)` | 微弱边框（分隔线级别） |
| `--border-default` | `rgba(0,255,136,0.2)` | 默认边框 |
| `--border-strong` | `rgba(0,255,136,0.5)` | 强调边框（激活/选中） |
| `--text-primary` | `#e0e0e0` | 正文主色 |
| `--text-secondary` | `#888888` | 副文/说明 |
| `--text-muted` | `#555555` | 禁用/暗淡文字 |
| `--text-accent` | `#00ff88` | 高亮数字/关键词 |

### 字体

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-display` | `'Orbitron', 'Consolas', monospace` | 标题、品牌名、数据数值 |
| `--font-body` | `'Consolas', 'Courier New', monospace` | 正文、按钮文字、标签 |
| `--font-mono` | `'Orbitron', 'Consolas', monospace` | 等宽数据对齐场景 |

### 效果

| Token | 值 | 用途 |
|-------|-----|------|
| `--glow-accent` | `0 0 12px rgba(0,255,136,0.35)` | 按钮悬停、卡片激活 |
| `--glow-accent-intense` | `0 0 24px rgba(0,255,136,0.5)` | 高亮聚焦元素 |
| `--glow-danger` | `0 0 8px rgba(204,51,51,0.4)` | 危险状态发光 |
| `--shadow-card` | `0 1px 4px rgba(0,0,0,0.6)` | 卡片阴影 |
| `--radius-sm` | `2px` | 按钮、输入框 |
| `--radius-md` | `4px` | 卡片 |
| `--radius-lg` | `6px` | 面板容器（最大值，不超过） |
| `--transition-fast` | `0.1s ease` | 快速交互反馈 |
| `--transition-normal` | `0.2s ease` | 常规过渡 |

---

## 四、你需要改什么（文件清单）

### 必改文件

```
f:\ai\game\web\css\style.css        ← 把 :root 变量全部替换为 V2 token
                                      ← 所有面板样式改为纯黑+荧光绿
                                      ← 删除所有橄榄绿/暗金色/血红色相关色值
f:\ai\game\web\index.html           ← 面板 HTML 结构已按旧版改过，保持不变
                                      ← 如果要做新功能（弹窗/教程/HUD 覆盖层）参考设计稿
f:\ai\game\web\js\game.js           ← 保持不变，之前追加的代码继续用
```

### 特别注意：覆盖文件

```
f:\ai\game\web\css\style-new-ui.css          ← 优先级高于 style.css，必须同步改
f:\ai\game\web\css\style-new-ui-panels.css   ← 优先级高于 style.css，必须同步改
```

如果只改 `style.css` 不改这两个文件，它们会覆盖你的新样式。**这两个文件也必须全部更新为 V2 的纯黑+荧光绿风格。**

---

## 五、逐页改动要点（对照设计稿检查）

### 1. 主菜单 (#menu)

**设计稿**: `death-trench-ui-v2/pages/main-menu.html`

- 背景：纯黑 `#000`，不是深灰、不是深绿
- 标题 "DEATH TRENCH"：72px Orbitron，`#00ff88`，带 `text-shadow` 荧光发光
- 扫描线：`::after` 伪元素，`repeating-linear-gradient` 细横线
- 按钮：无边框/无填充底色，边框 `rgba(0,255,136,0.2)`，文字 `#00ff88`
  - hover 时边框变亮 + `box-shadow: glow-accent`
  - active 时底色变为 `rgba(0,255,136,0.1)`
- 底部版本号：`#555`，Consolas 11px
- **绝对不要**：渐变背景、模糊效果、大圆角、彩色图标

### 2. 大厅 (#lobby)

**设计稿**: `death-trench-ui-v2/pages/lobby.html`

- 整体背景：`#000`
- 顶部栏：40px 高，底边框 `rgba(0,255,136,0.15)`，文字 `#e0e0e0`
- 角色框：100x100，无填充，1px 荧光绿边框，内部十字线（纯 CSS 线条）
- 属性条：4px 高，`#111` 底色，`#00ff88` 填充
- 功能按钮 4x2 网格：
  - 底色透明，边框 `rgba(0,255,136,0.2)`
  - hover 边框变 `rgba(0,255,136,0.5)` + 发光
  - 每个按钮都有 `data-dom-id`（进入游戏/仓库/黑市/改装/皮肤/弹药库/任务/好友）
- **返回主菜单** 按钮必须有（design 链接线依赖它）

### 3. 仓库 (#inventoryPanel)

**设计稿**: `death-trench-ui-v2/pages/inventory.html`

- 三栏布局（CSS Grid 或 Flexbox）：
  - 左栏：出战武器槽，2-3 个武器格子，格子内是 CSS 线框枪图标（1px 绿线，无填充）
  - 中栏：3x3 武器卡片网格，卡片边框 `rgba(0,255,136,0.2)`，锁定卡片 `opacity: 0.3`
  - 右栏：弹药背包（彩色圆点表示弹药类型）+ 底部 6 个弹匣槽位
- 所有文字 Consolas，数据数字 Orbitron
- 卡片 hover：边框变亮 + `glow-accent`

### 4. 黑市 (#blackMarketPanel)

**设计稿**: `death-trench-ui-v2/pages/black-market.html`

- 左侧（70%）：改装树
  - 中央武器显示区：CSS 线框枪剪影（多条 1px 绿线组成）
  - 上排 3 个配件节点 + 下排 3 个配件节点
  - 节点之间有连接线（1px `rgba(0,255,136,0.1)` 垂直线）
  - 已装备节点：边框变亮 + `box-shadow` 发光
  - 每个节点：图标 + 名称 + 属性加成 + 价格 + 购买/已装备 按钮
- 右侧（30%）：阵营属性面板
  - 六边形图标（`clip-path: polygon(...)`）
  - 阵营等级（LV.x）绿色显示
  - 4 条属性条（伤害/射速/精准/稳定），`#00ff88` 填充 + 绿色加成数值
- 底部 Tab 栏：武器/弹药/护甲/消耗品/出售，激活 Tab 有绿色底边框

### 5. 改装处 (#modificationPanel)

**设计稿**: `death-trench-ui-v2/pages/modification.html`

- 三栏：武器列表 | 配件网格 | 已装备槽位
- 武器列表：每行一个武器名，选中项有绿色发光边框
- 配件网格：2x3，每个格子有图标+名称+效果描述
- 已装备区：3 个槽位，空的用虚线框

### 6. 皮肤商店 (#skinPanel)

**设计稿**: `death-trench-ui-v2/pages/skin-shop.html`

- 左侧：大号武器预览区，CSS 线框枪剪影（更大更详细）
- 右侧：8 张皮肤卡片网格
  - 每张卡片内是 **彩色的 CSS 武器剪影**（不是图片！用不同颜色的 CSS 线条）
  - 8 种皮肤色：默认（灰白）、碳纤维（深灰）、金色（#ffd700）、迷彩（绿色系）、霓虹（#00ffff 蓝绿）、红色（#ff4444）、蓝色（#4488ff）、紫色（#aa44ff）
- 稀有度标签颜色：普通=灰、稀有=蓝、史诗=紫、传说=金

### 7. 任务线 (#missionLinePanel)

**设计稿**: `death-trench-ui-v2/pages/missions.html`

- 顶部：金色警告横幅 `⚠` + 文字
- 任务卡片列表：
  - 锁定任务：`opacity: 0.25`，灰暗
  - 已完成任务：左侧绿色边框 `#00ff88` + 绿色对勾
  - 进行中任务：绿色发光边框 + `pulse` 呼吸动画（`animation: pulse 2s infinite`）
- 每张卡片：任务名、描述、奖励、进度条

### 8. 游戏内 HUD

**设计稿**: `death-trench-ui-v2/pages/game-hud.html`

- 背景模拟：网格线（纯 CSS `linear-gradient` 网格图案）
- 受击效果：
  - `damageFlash`：全屏红色闪烁覆盖层（`rgba(204,51,51,0.3)`）
  - `damageVignette`：四边红色暗角渐变（从边缘透明到中心红色）
- 分数面板：左上角，Orbitron 字体
- 任务进度：右上角，进度条 `#00ff88`
- 小地图：150x150，右下角上方
  - 绿色边框 `rgba(0,255,136,0.5)`
  - 内部模拟：灰色建筑方块、红色敌人点、绿色玩家点
- 血条：底部中央
- 武器信息区：右下角，**白色半透明背景** `rgba(255,255,255,0.15)`
  - 武器线框剪影（白线条）
  - 弹药数量 Orbitron
- 物品轮盘：中央偏下，W/E/R/F 四个快捷键位

---

## 六、CSS 变量替换对照表（旧 → 新）

把 `style.css` 和 `style-new-ui.css` 中的旧变量值全部替换：

| 旧值（V1 军事风） | 新值（V2 终端风） |
|-------------------|-------------------|
| `#4a5d23`（橄榄绿主色） | `#00ff88`（荧光绿） |
| `#b8860b`（暗金强调） | 删除，不用 |
| `#cc3333`（血红色） | `#cc3333`（保留，用于危险状态） |
| `#00cc66`（亮绿） | `#00ff88` 或 `#00cc66`（次级绿） |
| `#1a2e0a`（深绿背景） | `#000000`（纯黑） |
| `#0d1f05`（更深背景） | `rgba(0,0,0,0.92)` |
| `border-radius: 12px` | `border-radius: 4px`（卡片）/ `2px`（按钮） |
| `backdrop-filter: blur(10px)` | 删除，不用模糊 |
| `linear-gradient(...)` 背景 | 删除，用纯色 `#000` |
| 字体 `'Inter'`, `'Segoe UI'` | 字体 `'Consolas'`, `'Courier New'`（等宽） |

### 全局替换搜索列表

在 `style.css` 中搜索并替换以下值（每一条都要做）：

```
搜索 #4a5d23 → 替换为 #00ff88
搜索 #b8860b → 删除该属性或替换为 #00ff88
搜索 #1a2e0a → 替换为 #000000
搜索 #0d1f05 → 替换为 rgba(0,0,0,0.92)
搜索 #3d5c1a → 替换为 rgba(0,255,136,0.06)
搜索 1a2e0a → 替换为 000000
搜索 backdrop-filter → 删除整行或注释掉
搜索 border-radius: 12px → 替换为 border-radius: 4px
搜索 border-radius: 8px → 替换为 border-radius: 2px
```

---

## 七、JS 数据不用改

`game.js` 中之前追加的以下代码**全部保留，不需要修改**：

- `SKIN_TEMPLATES` — 20 种皮肤模板（颜色数据与 V2 兼容）
- `SKIN_WEAPON_TYPES` — 13 种武器类型
- `KNIFE_SKINS` — 15 种刀皮
- `RARITY_COLORS` — 稀有度颜色
- `getAllWeaponSkins()` — 皮肤生成函数
- `showConfirm / closeConfirm` — 确认弹窗
- `showWarmTip / closeWarmTip` — 温馨提示
- `showToast` — Toast 通知
- `TUTORIAL_STEPS` + 教程导航函数 — 新手教程
- `LOTTERY_POOL` + `drawLottery()` — 抽奖系统
- `showDamageFlash / updateDamageVignette` — 受击反馈

---

## 八、常见问题速查

| 问题 | 原因 | 解决办法 |
|------|------|----------|
| 新样式没生效 | `style-new-ui.css` 覆盖了 | 同步修改两个覆盖文件 |
| 还有蓝色/紫色元素 | 旧代码没清干净 | 搜索 `#3b82f6`、`#58a6ff`、`#a855f7`、`#8b5cf6` 全部替换 |
| 还有大圆角/模糊 | 旧 `border-radius` / `backdrop-filter` 残留 | 搜索替换，最大圆角 6px |
| 字体不是等宽的 | `font-family` 没更新 | 标题用 Orbitron，正文用 Consolas |
| 黑市/仓库布局错位 | HTML 结构需要微调 | 对照 `death-trench-ui-v2/pages/` 下的设计稿 HTML |
| 发光效果没出来 | `box-shadow` 用了旧色值 | 改为 `0 0 12px rgba(0,255,136,0.35)` |
| JS 报错 | 原有函数没动但 CSS class 名变了 | 只改 CSS，不改 JS 中的 class 引用；如果必须改 class 名，同步改 JS |
| 弹窗/教程样式不对 | 弹窗 CSS 还是旧主题色 | 更新 `.popup-overlay`、`.tutorial-overlay` 等样式 |

---

## 九、绝对不要做的事

- **不要引入新颜色**（V2 只有黑、白灰、绿、红四种色系）
- **不要用渐变背景**（所有背景都是纯黑或半透明黑）
- **不要用模糊效果**（`backdrop-filter: blur()` 全部删除）
- **不要用大于 6px 的圆角**
- **不要创建新文件**（只改现有三个文件 + 两个覆盖文件）
- **不要删除 game.js 中原有的任何函数**
- **不要改变 HTML 面板的 id 或 class 名**（除非你同步改 JS 中所有引用）
- **不要引入新的 CSS 框架或库**

---

## 十、检查清单（逐项打勾）

完成所有改动后，打开游戏逐项检查：

- [ ] 主菜单：纯黑背景，绿色标题发光，扫描线纹理
- [ ] 主菜单：按钮 hover 有荧光绿发光
- [ ] 大厅：纯黑背景，顶部 40px 标题栏
- [ ] 大厅：角色框是线框（无填充）
- [ ] 大厅：功能按钮 4x2 网格全部可点击
- [ ] 仓库：三栏布局正确
- [ ] 仓库：武器卡片锁定状态暗淡
- [ ] 黑市：改装树布局（不是列表）
- [ ] 黑市：右侧阵营面板有属性条
- [ ] 改装处：三栏布局正确
- [ ] 皮肤商店：有大号武器预览
- [ ] 皮肤商店：皮肤卡片有彩色武器剪影
- [ ] 任务线：进行中任务有脉冲动画
- [ ] 任务线：已完成任务有绿色边框
- [ ] HUD：白色半透明武器信息区
- [ ] HUD：小地图 150x150 存在
- [ ] HUD：受击闪红效果正常
- [ ] 全局：没有蓝色/紫色/金色元素残留
- [ ] 全局：没有大圆角（>6px）
- [ ] 全局：没有渐变或模糊效果
- [ ] 全局：字体是等宽的（Consolas/Orbitron）
- [ ] 弹窗/教程：样式是绿色终端风
- [ ] 存档/个人信息/信箱/称号/游戏结束：全部绿色终端风

---

## 附录：文件结构参考

```
设计稿（给你看的，不要改）：
f:\ai\game\death-trench-ui-v2\
├── death-trench-ui-v2.design     ← Canvas 元数据（不用管）
├── colors_and_type.css           ← 设计 Token 定义（参考用）
├── pages/
│   ├── main-menu.html            ← 浏览器打开可预览
│   ├── lobby.html
│   ├── inventory.html
│   ├── black-market.html
│   ├── modification.html
│   ├── skin-shop.html
│   ├── missions.html
│   └── game-hud.html
└── assets/                       ← 空（无图片依赖）

需要你改的代码文件：
f:\ai\game\web\
├── index.html                    ← UI HTML 结构
├── css/
│   ├── style.css                 ← 主样式（重点改这个）
│   ├── style-new-ui.css          ← 覆盖样式（必须同步改）
│   └── style-new-ui-panels.css  ← 覆盖样式（必须同步改）
└── js/
    └── game.js                   ← 游戏逻辑（不用改）
```

**看完这份报告还有问题？对照设计稿 HTML 文件，浏览器打开 `f:\ai\game\death-trench-ui-v2\pages\` 下的文件就能看到实际效果。每个文件都是自包含的（内联了所有 CSS），直接打开就是最终效果。**
