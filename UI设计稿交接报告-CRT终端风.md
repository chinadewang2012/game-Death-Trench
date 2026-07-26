# 死亡战壕 UI — 代码交接报告 v2.0

> **版本**: v2.0 正常配色版
> **设计稿**: death-trench-ui-v2-draft
> **风格**: 黑底 CRT 终端风（黑底 + 绿色主文 + 灰色副文）
> **设计稿路径**: `f:\ai\game\death-trench-ui-v2-draft\`
> **目标代码**: `f:\ai\game\web\`
> **日期**: 2026-07-24

---

## 一、风格说明

CRT 复古军事终端风格，但文字可读性做了优化 — 主文字是荧光绿，副文字用灰色而不是更深的绿色。

**核心特征**:
- 纯黑背景 `#000000`
- **荧光绿主文字** `#33ff00`（标题、按钮、正文、标签）
- **灰色副文** `#888888`（说明文字、状态信息 — 比绿色副文更易读）
- **深灰暗文** `#555555`（锁定/暗淡元素）
- 白色点缀 `#ffffff`（分数、数值等关键数字）
- VT323 像素终端字体
- 零圆角，全方块化
- CRT 扫描线 + 屏幕暗角 + 磷光发光
- steps() 像素化过渡动画
- ASCII art + box-drawing 字符装饰

**与 v1.0 的区别**: v1.0 副文用的是深绿 `#1a9900`/`#0d6600`，v2.0 改为灰色 `#888888`/`#555555`，可读性更好。

---

## 二、设计稿在哪

```
f:\ai\game\death-trench-ui-v2-draft\
├── death-trench-ui-v2-draft.design   ← Canvas 元数据（不用管）
├── colors_and_type-draft.css          ← 设计 Token
├── pages/
│   ├── main-menu.html                ← 浏览器打开可预览
│   ├── lobby.html
│   ├── inventory.html
│   ├── black-market.html
│   ├── modification.html
│   ├── skin-shop.html
│   ├── missions.html
│   └── game-hud.html
└── assets/                            ← 空（无图片依赖）
```

每个 HTML 文件都是自包含的，内联了所有 CSS，浏览器直接打开就是最终效果。

---

## 三、页面清单

| 页面 | 文件 | 对应代码中的 ID | 关键视觉 |
|------|------|------|------|
| 主菜单 | `main-menu.html` | `#menu` | "DEATH TRENCH" 大标题磷光发光、ASCII 终端边框、5 个方块按钮、闪烁指示灯、[REC] 红点 |
| 大厅 | `lobby.html` | `#lobby` | box-drawing 标题栏、ASCII 人物轮廓、属性条、4x2 按钮网格（编号 1-8） |
| 仓库 | `inventory.html` | `#inventoryPanel` | 三栏：出战槽 / 武器库 3x3 / 弹药补给 + 弹匣格 |
| 黑市 | `black-market.html` | `#blackMarketPanel` | 改装树 + 右侧阵营面板 |
| 改装处 | `modification.html` | `#modificationPanel` | 三栏：武器列表 / 配件网格 / 已装备槽位 |
| 皮肤商店 | `skin-shop.html` | `#skinPanel` | 大号 ASCII 武器预览 + 8 款皮肤 |
| 任务线 | `missions.html` | `#missionLinePanel` | 4 任务卡片（ACTIVE/COMPLETE/LOCKED） |
| 游戏 HUD | `game-hud.html` | `#gameContainer` 内 | 战斗数据、小地图、血条、武器信息、受击闪红 |

---

## 四、颜色 Token（必须全部采用）

### 颜色

| Token | 值 | 用途 |
|-------|-----|------|
| `--brand-accent` | `#33ff00` | 荧光绿：边框、填充条、活跃状态、**主文字** |
| `--brand-accent-dim` | `#22cc00` | 次级绿：hover 态、降级 |
| `--brand-accent-dark` | `#118800` | 暗绿：按下态 |
| `--brand-danger` | `#cc3333` | 红色：受击、低血量、危险操作 |
| `--bg-deep` | `#000000` | 所有背景 — **纯黑** |
| `--bg-panel` | `rgba(0, 0, 0, 0.95)` | 面板背景 |
| `--bg-card` | `rgba(0, 0, 0, 0.9)` | 卡片背景 |
| `--bg-hover` | `rgba(51, 255, 0, 0.06)` | 悬停背景 |
| `--border-subtle` | `rgba(51, 255, 0, 0.1)` | 微弱分隔线 |
| `--border-default` | `rgba(51, 255, 0, 0.25)` | 默认边框 |
| `--border-strong` | `rgba(51, 255, 0, 0.5)` | 激活/选中边框 |
| `--text-primary` | `#33ff00` | **主文字 — 荧光绿** |
| `--text-secondary` | `#888888` | **副文 — 灰色** |
| `--text-muted` | `#555555` | **暗文 — 深灰** |
| `--text-accent` | `#ffffff` | **白色点缀 — 分数/数值** |

### 字体

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-display` | `'VT323', 'Courier New', monospace` | 标题、品牌名 |
| `--font-body` | `'VT323', 'Courier New', monospace` | 正文、按钮、标签 |

> **必须加载 VT323 字体**: `<link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet">`

### 效果

| Token | 值 | 用途 |
|-------|-----|------|
| `--glow-accent` | `0 0 4px rgba(51,255,0,0.4), 0 0 8px rgba(51,255,0,0.15)` | 文字发光 |
| `--glow-accent-intense` | `0 0 6px rgba(51,255,0,0.6), 0 0 15px rgba(51,255,0,0.25), 0 0 30px rgba(51,255,0,0.1)` | 标题强发光 |
| `--glow-danger` | `0 0 6px rgba(204,51,51,0.5)` | 危险状态发光 |
| `--glow-danger-intense` | `0 0 12px rgba(204,51,51,0.8), 0 0 30px rgba(204,51,51,0.3)` | 低血量红光 |
| `--radius-sm/md/lg` | `0px` | **全部零圆角** |
| `--transition-fast` | `0.05s steps(2)` | 像素化快速过渡 |
| `--transition-normal` | `0.1s steps(3)` | 像素化常规过渡 |

---

## 五、CRT 特效（必须实现）

### 1. CRT 扫描线
```css
body::after {
    content: '';
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: repeating-linear-gradient(
        0deg, transparent, transparent 1px,
        rgba(51, 255, 0, 0.03) 1px, rgba(51, 255, 0, 0.03) 2px
    );
    pointer-events: none; z-index: 9999;
}
```

### 2. 磷光发光（文字）
```css
/* 标题 */
text-shadow: 0 0 6px rgba(51,255,0,0.6), 0 0 15px rgba(51,255,0,0.25), 0 0 30px rgba(51,255,0,0.1);
/* 普通 */
text-shadow: 0 0 4px rgba(51,255,0,0.4), 0 0 8px rgba(51,255,0,0.15);
```

### 3. 低血量红色闪屏
```css
#damageFlash {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(204, 51, 51, 0.3); opacity: 0;
    pointer-events: none; z-index: 100;
    animation: damage-flash 0.3s steps(2);
}
@keyframes damage-flash {
    0% { opacity: 0; } 25% { opacity: 0.4; }
    50% { opacity: 0.1; } 75% { opacity: 0.3; } 100% { opacity: 0; }
}
#damageVignette {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(204,51,51,0.5) 100%);
    opacity: 0; pointer-events: none; z-index: 99;
}
.hp-low { color: #cc3333 !important; }
.hp-low .hp-fill { background: #cc3333 !important; }
```

### 4. CRT 闪烁
```css
@keyframes flicker {
    0%, 100% { opacity: 1; }
    92% { opacity: 1; } 93% { opacity: 0.8; } 94% { opacity: 1; }
}
```

### 5. 像素化过渡
```css
transition: all 0.1s steps(3);
```

---

## 六、你需要改什么

### 必改文件

| 文件 | 改什么 |
|------|--------|
| `web/css/style.css` | `:root` 变量替换为新 token；面板样式改为 CRT 终端风；**字体 VT323**；圆角全部 0；扫描线/发光；steps() 过渡 |
| `web/css/style-new-ui.css` | **必须同步改**（优先级高于 style.css） |
| `web/css/style-new-ui-panels.css` | **必须同步改**（同上） |
| `web/index.html` | `<head>` 加 VT323 字体 |
| `web/js/game.js` | **不用改** |

### 全局搜索替换清单

```
#4a5d23 → #33ff00
#b8860b → #33ff00
#1a2e0a → #000000
#0d1f05 → rgba(0,0,0,0.95)
#00ff88 → #33ff00
#00cc66 → #22cc00
border-radius: 任何值 → 0
transition: ... ease → ... steps(3)
font-family 中非等宽 → 'VT323', 'Courier New', monospace
backdrop-filter → 删除
linear-gradient 背景 → #000000
```

---

## 七、JS 代码不用改

全部保留：
- `SKIN_TEMPLATES` / `SKIN_WEAPON_TYPES` / `KNIFE_SKINS` / `RARITY_COLORS`
- `getAllWeaponSkins()`
- `showConfirm / closeConfirm / showWarmTip / closeWarmTip / showToast`
- `TUTORIAL_STEPS` + 教程导航
- `LOTTERY_POOL` + `drawLottery()`
- `showDamageFlash / updateDamageVignette`
- `toggleSidebar()`

---

## 八、逐页检查清单

### 主菜单 (#menu)
- [ ] 纯黑背景
- [ ] "DEATH TRENCH" 荧光绿 + 三层发光
- [ ] VT323 字体
- [ ] 5 个按钮，方块边框，hover 绿色发光
- [ ] CRT 扫描线
- [ ] 左上闪烁指示灯（绿色）

### 大厅 (#lobby)
- [ ] box-drawing 标题栏
- [ ] ASCII 人物轮廓
- [ ] 属性条绿色填充
- [ ] 4x2 按钮网格
- [ ] 数值白色点缀

### 仓库 (#inventoryPanel)
- [ ] 三栏布局
- [ ] 武器卡片锁定态暗淡
- [ ] 弹药条绿色填充

### 黑市 (#blackMarketPanel)
- [ ] 改装树布局
- [ ] ASCII 枪械 + 连线
- [ ] 右侧阵营面板 + 属性条

### 改装处 (#modificationPanel)
- [ ] 三栏
- [ ] 选中项绿色发光边框

### 皮肤商店 (#skinPanel)
- [ ] 大号武器预览
- [ ] 8 款皮肤 + 稀有度指示
- [ ] 选中行绿色发光

### 任务线 (#missionLinePanel)
- [ ] ACTIVE：绿色发光边框 + 脉冲
- [ ] COMPLETE：绿色边框 + 暗淡
- [ ] LOCKED：opacity 0.25

### 游戏 HUD
- [ ] 战斗数据面板
- [ ] 150x150 小地图
- [ ] 血条绿色填充，低于 30% 变红
- [ ] 武器信息区
- [ ] 低血量红色闪屏
- [ ] 受击变红

---

## 九、颜色速查

| 用途 | 颜色 | 色系 |
|------|------|------|
| 背景 | `#000000` | 黑 |
| 主文字/标题/按钮 | `#33ff00` | 荧光绿 |
| 副文/说明 | `#888888` | 灰 |
| 暗文/锁定 | `#555555` | 深灰 |
| 数值/分数 | `#ffffff` | 白 |
| 边框 | `rgba(51,255,0,0.25)` | 绿半透明 |
| hover 边框 | `rgba(51,255,0,0.5)` | 绿半透明 |
| 进度条填充 | `#33ff00` | 荧光绿 |
| 受击/低血量 | `#cc3333` | 红 |
| 危险按钮 | `#cc3333` | 红 |

---

## 十、禁止事项

- 不要用非纯黑背景
- 不要用非绿色主文字（`#33ff00` 唯一主文字色）
- 不要用圆角
- 不要用渐变背景
- 不要用模糊效果（backdrop-filter）
- 不要用平滑过渡（用 steps()）
- 不要用非等宽字体
- 不要引入新颜色（黑、绿、灰、白、红五种）
- 不要删除 game.js 中任何现有函数
- 不要改变面板 ID 或 class 名（除非同步改 JS）
