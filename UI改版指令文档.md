# 死亡战壕 UI 改版指令文档（给 Code AI）

> **文档版本**: v4.0（交接版）
> **适用项目**: 死亡战壕 (Death Trench) — 2D Top-Down Military Shooter
> **目标**: 将现有 UI 升级为统一的军事/战术风格主题
> **项目路径**: `f:\ai\game\`

---

# 给代码设计师的交接说明（必读！）

## 你需要做什么？

简单说：**UI 设计师已经把所有改动写进代码里了，你现在要检查这些改动是否正常工作，并修复可能存在的问题。**

## 当前状态

以下改动**已经完成并写入代码**：

1. `css/style.css` — 军事主题 CSS 变量已加、按钮样式已改、所有面板样式已升级
2. `index.html` — 仓库面板已改成三栏布局、黑市已改成改装树、任务线已改成卡片列表、弹窗系统已添加、教程覆盖层已添加
3. `js/game.js` — 260 种皮肤数据 + 15 种刀皮已添加、弹窗/教程/抽奖/受击反馈函数已添加

## 你需要检查什么？

打开游戏（`npm start` 或 Electron 启动），逐页检查：

### 逐页检查清单

**[ ] 主菜单**
- 标题 "DEATH TRENCH" 应该是军绿色（不是亮绿色 #00cc66）
- 有扫描线纹理覆盖（细细的横线）
- 按钮圆角较小（6px），不是大圆角

**[ ] 大厅界面**
- 顶部信息栏和底部栏是半透明的（能看到后面的背景）
- 功能按钮（战备中心/仓库/黑市等）hover 时边框变绿 + 发光
- 角色光环是橄榄绿色（不是荧光绿）

**[ ] 仓库面板**
- 分为左/中/右三栏：左=出战武器槽、中=武器库网格、右=弹药背包
- 底部有 6 个弹格槽位
- 如果看到空白/错位 → 检查 `index.html` 中 `#inventoryPanel` 的结构

**[ ] 黑市面板**
- 左侧是改装树（6 个配件节点围绕中央武器）
- 右侧是阵营属性面板（六边形图标 + 属性条）
- 底部有 Tab 栏（武器/弹药/护甲/消耗品/出售）

**[ ] 任务线面板**
- 黄色提示横幅（⚠️）
- 任务卡片列表（锁定=暗淡、进行中=绿色发光边框、已完成=绿色✓）

**[ ] 皮肤商店**
- 有大预览面板（显示武器剪影）

**[ ] 游戏内 HUD**
- 右下角武器信息区背景是白色半透明的（能看到游戏画面）
- 右上角有小地图（160x160，绿色边框）
- 被打时屏幕边缘闪红

**[ ] 弹窗系统**
- `showConfirm('标题', '内容', callback)` 能弹出确认弹窗
- `showWarmTip('提示内容')` 能弹出温馨提示
- `showToast('消息', 'success')` 能在顶部弹出通知
- 如果弹窗没有 CSS 样式 → 检查 `style.css` 末尾的 `.popup-overlay` 样式

**[ ] 新手教程**
- `startTutorial()` 能弹出 6 步教程覆盖层
- 有"跳过"/"上一步"/"下一步"按钮
- 有步骤指示器（小圆点）

**[ ] 侧边栏（右上角 ☰ 按钮）**
- 从右侧滑入，半透明背景
- 三个 Tab：设置/统计/道具

**[ ] 存档管理**
- 存档槽位 hover 时边框变绿发光
- 颜色是军绿色主题（不是蓝色）

**[ ] 个人信息/信箱/称号/游戏结束**
- 颜色统一为军绿主题（不是蓝色/紫色）
- 数据数值是绿色高亮

## 如果发现问题怎么修？

### 常见问题速查

| 问题 | 原因 | 解决办法 |
|------|------|----------|
| 样式没生效 | 可能有 `style-new-ui.css` 覆盖了 | 检查 `css/style-new-ui.css` 和 `css/style-new-ui-panels.css`，把冲突的样式同步改掉 |
| 某个面板空白 | HTML 结构可能被覆盖或行号偏移 | 在 `index.html` 中搜索对应 id（如 `#inventoryPanel`），确认结构完整 |
| JS 报错 `SyntaxError` | 可能是变量重复声明 | 在 `game.js` 中搜索 `const SKIN_WEAPON_TYPES` 和 `const WEAPON_TYPES`，确保不重复 |
| 弹窗/教程没反应 | HTML 可能被插入到错误位置 | 在 `index.html` 中搜索 `confirmModal` 和 `tutorialOverlay`，确认它们在 `</body>` 之前 |
| 皮肤商店/仓库 JS 不工作 | 渲染函数可能没被调用 | 在 `game.js` 中搜索 `renderWeaponLibrary`、`renderMissionLine` 等函数是否存在 |
| 颜色还是旧的蓝色 | CSS 变量没生效，有硬编码颜色 | 在 `style.css` 和 `style-new-ui.css` 中搜索 `#3b82f6` 和 `#58a6ff`，全部替换为军绿色 |

### 文件对应关系

```
要改的文件只有这 3 个：
├── f:\ai\game\index.html          ← 所有 UI 面板的 HTML 结构
├── f:\ai\game\css\style.css       ← 所有样式（已写入大量新样式）
├── f:\ai\game\js\game.js          ← 游戏逻辑（已追加皮肤数据/弹窗/教程/抽奖/受击反馈）

额外注意：可能存在覆盖文件
├── f:\ai\game\css\style-new-ui.css          ← 优先级高于 style.css
├── f:\ai\game\css\style-new-ui-panels.css   ← 优先级高于 style.css
```

### 不要动这些

- **不要创建新文件**
- **不要改 `js/game.js` 中原有的函数**（只改新增的代码）
- **不要删除任何现有的 onclick 或事件绑定**

---

## 文档详细内容（参考用）

以下是完整的改版规格文档。上述检查清单已经覆盖了所有改动的要点。以下章节提供每个改动的具体代码和设计规格，在需要深入修复某个问题时参考使用。

---

## 一、全局样式改动

### 1.1 CSS 变量

**操作**: 在 `css/style.css` 文件顶部，`existing :root` 块之后，添加以下补充变量。部分变量已存在（如 `--brand-primary`），仅添加缺失的。

**在 `:root { ... }` 块末尾（约第 67 行 `}` 之前）追加**：

```css
    /* === 字体 === */
    --font-display: 'Orbitron', monospace;
    --font-body: 'Microsoft YaHei', 'Noto Sans SC', sans-serif;

    /* === 发光效果 === */
    --glow-accent: 0 0 12px rgba(0, 255, 136, 0.3);
    --glow-primary: 0 0 12px rgba(74, 93, 35, 0.4);
    --glow-danger: 0 0 12px rgba(204, 51, 51, 0.3);
    --glow-secondary: 0 0 12px rgba(184, 134, 11, 0.3);

    /* === 阴影 === */
    --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.4);
    --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.5);
    --shadow-deep: 0 8px 32px rgba(0, 0, 0, 0.6);

    /* === 圆角 === */
    --radius-sm: 2px;
    --radius-md: 6px;
    --radius-lg: 10px;

    /* === 间距 === */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;

    /* === 过渡 === */
    --transition-fast: 0.15s ease;
    --transition-normal: 0.3s ease;
    --transition-slow: 0.5s ease;
```

### 1.2 全局颜色替换规则

**操作**: 在 `style.css` 中搜索以下旧值并替换为新值。这是一个搜索-替换操作，需要逐一处理。

| 原值 | 新值 | 说明 |
|------|------|------|
| `#00cc66` | `var(--brand-accent-dim)` | 边框、次要高亮色 |
| `rgba(0, 204, 102, 0.X)` | `rgba(0, 255, 136, 0.X)` | 荧光绿系列半透明 |
| `rgba(0, 204, 102, 0.2)` | `rgba(0, 255, 136, 0.2)` | 常用分隔线 |
| `rgba(0, 204, 102, 0.3)` | `rgba(0, 255, 136, 0.3)` | 荧光绿边框 |
| `#ffaa00` | `var(--brand-secondary)` | 金色高亮 |
| `rgba(255, 170, 0, 0.X)` | `rgba(184, 134, 11, 0.X)` | 金色半透明 |
| `#3b82f6` | `var(--brand-primary)` 或 `#4a6fa5` | 蓝色按钮 → 军绿 |
| `rgba(59, 130, 246, 0.X)` | `rgba(74, 93, 35, 0.X)` | 蓝色半透明 → 军绿半透明 |
| `#1a1a2e` | `var(--color-bg-panel)` | header 背景 |
| `#16213e` | `var(--color-bg-panel)` | footer 背景 |
| `border-radius: 12px` (按钮上) | `border-radius: var(--radius-md)` | 更硬朗军事风 |
| `border-radius: 10px` (面板上) | `border-radius: var(--radius-md)` | 统一圆角 |
| `font-family: 'Orbitron'` | `font-family: var(--font-display)` | 统一字体变量 |

### 1.3 按钮样式覆盖

**操作**: 在 `style.css` 中添加以下按钮基础样式（如果不存在则追加，如果存在则覆盖）：

```css
/* ========================================
   通用按钮系统 - 军事风格
   ======================================== */

.menu-btn,
.btn-save,
.btn-cancel,
.buy-btn,
.sell-btn,
.mini-btn,
.slot-action-btn {
    font-family: var(--font-body);
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    overflow: hidden;
}

.menu-btn:hover,
.btn-save:hover,
.buy-btn:hover {
    transform: translateY(-1px);
    box-shadow: var(--glow-primary);
}

.menu-btn:active,
.btn-save:active,
.buy-btn:active {
    transform: translateY(0) scale(0.97);
}

/* 主按钮 - 军绿 */
.menu-btn.primary,
.btn-save {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: var(--color-text-primary);
    border-color: var(--brand-primary-light);
    box-shadow: 0 2px 4px rgba(74, 93, 35, 0.3);
}

.menu-btn.primary:hover,
.btn-save:hover {
    background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary));
    box-shadow: var(--glow-primary), 0 4px 8px rgba(74, 93, 35, 0.4);
}

/* 次按钮 - 深灰 */
.menu-btn.secondary {
    background: var(--color-surface);
    color: var(--color-text-primary);
    border-color: var(--color-border);
}

.menu-btn.secondary:hover {
    background: var(--color-surface-elevated);
    box-shadow: var(--shadow-card);
}

/* 三级按钮 - 幽灵 */
.menu-btn.tertiary,
.btn-cancel {
    background: transparent;
    color: var(--color-text-secondary);
    border-color: var(--color-border-subtle);
}

.menu-btn.tertiary:hover,
.btn-cancel:hover {
    color: var(--color-text-primary);
    border-color: var(--color-border);
    background: var(--color-bg-hover);
}

/* 危险按钮 */
.menu-btn.danger,
.slot-action-btn.danger {
    background: rgba(204, 51, 51, 0.15);
    color: var(--brand-danger);
    border-color: rgba(204, 51, 51, 0.3);
}

.menu-btn.danger:hover,
.slot-action-btn.danger:hover {
    background: rgba(204, 51, 51, 0.25);
    box-shadow: var(--glow-danger);
}

/* 购买按钮 */
.buy-btn {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    padding: 6px 16px;
    font-size: 13px;
}

.buy-btn:hover {
    box-shadow: var(--glow-primary);
}

/* 出售按钮 */
.sell-btn {
    background: rgba(184, 134, 11, 0.15);
    color: var(--brand-secondary);
    border-color: rgba(184, 134, 11, 0.3);
    padding: 6px 16px;
    font-size: 13px;
}

.sell-btn:hover {
    background: rgba(184, 134, 11, 0.25);
    box-shadow: var(--glow-secondary);
}
```

---

## 二、主菜单 (#menu)

**HTML 位置**: `index.html` 第 154-214 行

### 2.1 Logo 样式升级

**操作**: 修改 `style.css` 中 `.menu-logo` 样式：

```css
.menu-logo {
    font-family: var(--font-display);
    font-size: 52px;
    font-weight: 900;
    color: var(--brand-primary);
    text-shadow:
        2px 2px 0 rgba(0, 0, 0, 0.8),
        0 0 20px rgba(74, 93, 35, 0.4),
        -1px -1px 0 rgba(255, 255, 255, 0.05);
    letter-spacing: 8px;
    position: relative;
}

.menu-tagline {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--brand-secondary);
    letter-spacing: 6px;
    margin-top: 4px;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.8);
}
```

### 2.2 主菜单按钮

**操作**: 修改 `style.css` 中主菜单按钮系列样式：

```css
.menu-btn-primary,
.menu-btn-secondary,
.menu-btn-tertiary,
.menu-btn-default {
    width: 280px;
    padding: 14px 24px;
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 600;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    letter-spacing: 1px;
    position: relative;
    overflow: hidden;
}

.menu-btn-primary {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: 2px solid var(--brand-primary-light);
    box-shadow: 0 4px 12px rgba(74, 93, 35, 0.4);
    font-size: 18px;
    padding: 16px 32px;
}

.menu-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: var(--glow-primary), 0 6px 20px rgba(74, 93, 35, 0.5);
}

.menu-btn-primary:active {
    transform: translateY(0) scale(0.98);
}

.menu-btn-secondary {
    background: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
}

.menu-btn-secondary:hover {
    background: var(--color-bg-hover);
    border-color: var(--brand-primary-light);
}

.menu-btn-tertiary,
.menu-btn-default {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-subtle);
}

.menu-btn-tertiary:hover,
.menu-btn-default:hover {
    color: var(--color-text-primary);
    border-color: var(--color-border);
    background: var(--color-bg-hover);
}

/* 开发者按钮特殊样式 */
.menu-btn-dev {
    font-size: 12px !important;
    padding: 10px 20px;
    opacity: 0.5;
}

.menu-btn-dev:hover {
    opacity: 1;
}
```

### 2.3 扫描线效果

**操作**: 确保 `style.css` 中有以下扫描线样式（已存在于 `.menu-scanlines`）：

```css
.menu-scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.08) 2px,
        rgba(0, 0, 0, 0.08) 4px
    );
    pointer-events: none;
    z-index: 2;
}

/* 大厅也添加扫描线 */
.lobby-scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 3px,
        rgba(0, 0, 0, 0.05) 3px,
        rgba(0, 0, 0, 0.05) 6px
    );
    pointer-events: none;
    z-index: 1;
}
```

---

## 三、大厅界面 (#lobby)

**HTML 位置**: `index.html` 第 216-1007 行

### 3.1 Header 半透明毛玻璃

**操作**: 修改 `style.css` 中 `.lobby-top-bar`：

```css
.lobby-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 24px;
    background: var(--color-bg-panel);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--color-border);
    position: relative;
    z-index: 10;
}
```

### 3.2 功能按钮网格布局

**操作**: 修改 `style.css` 中 `.lobby-func-grid`：

```css
.lobby-func-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
}
```

**操作**: 修改 `.lobby-func-btn` 样式：

```css
.lobby-func-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px 16px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: var(--font-body);
    font-size: 14px;
}

.lobby-func-btn:hover {
    background: var(--color-bg-hover);
    border-color: var(--brand-primary-light);
    transform: translateY(-2px);
    box-shadow: var(--glow-primary);
}

.lobby-func-btn:active {
    transform: translateY(0) scale(0.97);
}
```

### 3.3 角色光环颜色

**操作**: 修改 `.lobby-char-glow` 和 `.lobby-char-glow-outer`：

```css
.lobby-char-glow-outer {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(74, 93, 35, 0.15) 0%, transparent 70%);
    position: absolute;
    animation: pulseGlow 3s ease-in-out infinite;
}

.lobby-char-glow {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(74, 93, 35, 0.25) 0%, transparent 70%);
    position: absolute;
    animation: pulseGlow 2s ease-in-out infinite reverse;
}

@keyframes pulseGlow {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.1); opacity: 1; }
}
```

### 3.4 底部导航栏

**操作**: 修改 `.lobby-bottom-nav`：

```css
.lobby-bottom-nav {
    background: var(--color-bg-panel);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-top: 1px solid var(--color-border);
    padding: 16px 24px;
    position: relative;
    z-index: 10;
}

.lobby-back-wrap {
    margin-top: 12px;
    text-align: center;
}

.lobby-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 24px;
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all var(--transition-fast);
}

.lobby-back-btn:hover {
    color: var(--color-text-primary);
    border-color: var(--color-border);
}
```

---

## 四、战备中心 (#readyRoom)

**HTML 位置**: `index.html` 第 343-427 行

### 4.1 地图卡片军事边框

**操作**: 修改 `.map-card.small` 样式：

```css
.map-card.small {
    width: 120px;
    height: 80px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    background: var(--color-bg-card);
}

.map-card.small.selected {
    border-color: var(--brand-primary-light);
    box-shadow: var(--glow-primary);
}

.map-card.small:hover {
    border-color: var(--brand-accent-dim);
    transform: translateY(-2px);
}
```

### 4.2 难度按钮

**操作**: 修改 `.diff-btn` 样式：

```css
.diff-buttons.compact .diff-btn {
    padding: 8px 16px;
    font-family: var(--font-body);
    font-size: 13px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
}

.diff-buttons.compact .diff-btn.active {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border-color: var(--brand-primary-light);
    box-shadow: 0 2px 6px rgba(74, 93, 35, 0.4);
}

.diff-buttons.compact .diff-btn:hover:not(.active) {
    border-color: var(--brand-primary-light);
    color: var(--color-text-primary);
}
```

### 4.3 物资补给列表

**操作**: 修改 `.supply-item` 样式：

```css
.supply-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    margin-bottom: 6px;
    transition: all var(--transition-fast);
}

.supply-item:hover {
    border-color: var(--color-border);
    background: var(--color-bg-hover);
}

.supply-icon {
    font-size: 16px;
    width: 24px;
    text-align: center;
}

.supply-name {
    flex: 1;
    font-size: 13px;
    color: var(--color-text-primary);
    font-family: var(--font-body);
}

.supply-count {
    font-size: 13px;
    color: var(--color-text-accent);
    font-weight: 600;
    font-family: var(--font-display);
}
```

### 4.4 开始战斗按钮

**操作**: 修改 `.start-button` 样式：

```css
.start-button {
    width: 100%;
    padding: 16px 32px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: 2px solid var(--brand-primary-light);
    border-radius: var(--radius-md);
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 3px;
    cursor: pointer;
    transition: all var(--transition-fast);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 4px 12px rgba(74, 93, 35, 0.4);
    text-transform: uppercase;
}

.start-button:hover {
    transform: translateY(-2px);
    box-shadow: var(--glow-primary), 0 6px 20px rgba(74, 93, 35, 0.5);
}

.start-button:active {
    transform: translateY(0) scale(0.98);
}
```

---

## 五、仓库面板 (#inventoryPanel) — 重大结构调整

**HTML 位置**: `index.html` 第 429-477 行

### 5.1 说明

当前仓库面板已具备三栏布局基础。需升级为完整的军事风格三栏布局。

### 5.2 HTML 替换（第 429-477 行）

用以下 HTML 替换 `index.html` 第 429 行到第 477 行之间的整个 `#inventoryPanel` 内容：

```html
            <div id="inventoryPanel" class="panel">
                <div class="panel-title-bar">
                    <h2>📦 仓库</h2>
                    <div class="panel-gold">🪙 <span id="invGoldDisplay">1000</span></div>
                    <button class="menu-btn tertiary" style="padding:8px 16px;font-size:14px;" onclick="showLobby()">← 返回</button>
                </div>

                <div class="inventory-three-col">
                    <!-- 左栏：出战武器 (200px) -->
                    <div class="inv-col inv-col-left">
                        <div class="section-label"><i data-lucide="swords" style="width:14px;height:14px;"></i> 出战武器</div>
                        <div class="weapon-loadout-slot active" id="invPrimarySlot" onclick="selectLoadoutSlot('primary')">
                            <div class="slot-type-label">主武器</div>
                            <div class="slot-weapon-icon">🔫</div>
                            <div class="slot-weapon-name" id="invPrimaryName">突击步枪</div>
                            <div class="slot-weapon-ammo" id="invPrimaryAmmo">30/120</div>
                            <div class="slot-check-mark" style="display:none;">✓</div>
                        </div>
                        <div class="weapon-loadout-slot" id="invSecondarySlot" onclick="selectLoadoutSlot('secondary')">
                            <div class="slot-type-label">副武器</div>
                            <div class="slot-weapon-icon">🔫</div>
                            <div class="slot-weapon-name" id="invSecondaryName">手枪</div>
                            <div class="slot-weapon-ammo" id="invSecondaryAmmo">15/60</div>
                            <div class="slot-check-mark" style="display:none;">✓</div>
                        </div>
                    </div>

                    <!-- 中栏：武器库 (flex:1, 3列网格) -->
                    <div class="inv-col inv-col-center">
                        <div class="section-label"><i data-lucide="layout-grid" style="width:14px;height:14px;"></i> 武器库</div>
                        <div class="weapon-library-grid" id="weaponLibraryGrid">
                            <!-- 由 JS 动态生成武器卡片 -->
                        </div>
                    </div>

                    <!-- 右栏：弹药背包 (200px) -->
                    <div class="inv-col inv-col-right">
                        <div class="section-label"><i data-lucide="package" style="width:14px;height:14px;"></i> 弹药背包</div>
                        <div class="ammo-backpack-list" id="ammoBackpackList">
                            <!-- 由 JS 动态生成：
                                4种弹药类型，每项包含：
                                - 彩色圆点指示弹药类型颜色
                                - 弹药名称
                                - 剩余数量
                                格式：
                                <div class="ammo-backpack-item">
                                    <span class="ammo-dot" style="background:#3b82f6;"></span>
                                    <span class="ammo-type-name">普通弹</span>
                                    <span class="ammo-type-count">∞</span>
                                </div>
                            -->
                        </div>
                    </div>
                </div>

                <!-- 底部弹格栏 -->
                <div class="ammo-slots-bar">
                    <div class="section-label">当前武器弹格（6格）</div>
                    <div class="ammo-slot-row" id="ammoSlotRow">
                        <!-- 由 JS 动态生成6个弹格：
                            格式：
                            <div class="ammo-slot">
                                <div class="ammo-slot-fill" style="height:100%;"></div>
                                <div class="ammo-slot-count">5</div>
                            </div>
                        -->
                    </div>
                </div>
            </div>
```

### 5.3 CSS 追加

在 `style.css` 中追加以下仓库专属样式：

```css
/* ========================================
   仓库面板 - 三栏军事布局
   ======================================== */

.inventory-three-col {
    display: flex;
    gap: 16px;
    margin-top: 16px;
    min-height: 400px;
}

.inv-col-left {
    width: 200px;
    flex-shrink: 0;
}

.inv-col-center {
    flex: 1;
    min-width: 0;
}

.inv-col-right {
    width: 200px;
    flex-shrink: 0;
}

.section-label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border-subtle);
}

/* 武器出战槽位 */
.weapon-loadout-slot {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: 12px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
}

.weapon-loadout-slot.active {
    border-color: var(--brand-primary-light);
    background: rgba(74, 93, 35, 0.15);
    box-shadow: var(--glow-primary);
}

.weapon-loadout-slot:hover {
    border-color: var(--color-border);
}

.slot-type-label {
    font-size: 11px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 6px;
    font-family: var(--font-display);
}

.slot-weapon-icon {
    font-size: 28px;
    margin-bottom: 4px;
}

.slot-weapon-name {
    font-size: 14px;
    color: var(--color-text-primary);
    font-weight: 600;
    font-family: var(--font-body);
}

.slot-weapon-ammo {
    font-size: 12px;
    color: var(--color-text-accent);
    font-family: var(--font-display);
    margin-top: 4px;
}

.slot-check-mark {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    background: var(--brand-accent);
    color: #000;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
}

/* 武器库网格 */
.weapon-library-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

/* 弹药背包 */
.ammo-backpack-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ammo-backpack-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
}

.ammo-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
}

/* 4种弹药类型颜色 */
/* 普通弹: #3b82f6, 穿甲弹: #ef4444, 爆破弹: #f59e0b, 燃烧弹: #f97316 */

.ammo-type-name {
    flex: 1;
    font-size: 13px;
    color: var(--color-text-primary);
    font-family: var(--font-body);
}

.ammo-type-count {
    font-size: 13px;
    color: var(--color-text-accent);
    font-weight: 600;
    font-family: var(--font-display);
}

/* 底部弹格栏 */
.ammo-slots-bar {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border-subtle);
}

.ammo-slot-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
}

.ammo-slot {
    flex: 1;
    height: 60px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    position: relative;
    overflow: hidden;
}

.ammo-slot-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, var(--brand-primary-dark), var(--brand-primary));
    transition: height var(--transition-fast);
}

.ammo-slot-count {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 14px;
    font-weight: 700;
    color: var(--color-text-primary);
    font-family: var(--font-display);
    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    z-index: 1;
}
```

---

## 六、黑市面板 (#blackMarketPanel) — 重大结构调整

**HTML 位置**: `index.html` 第 479-756 行

### 6.1 说明

将黑市从纯商品网格改为「武器改装树 + 阵营面板」的战术风格布局。

### 6.2 HTML 替换（第 479-756 行）

用以下 HTML 替换 `index.html` 第 479 行到第 756 行之间的整个 `#blackMarketPanel` 内容：

```html
            <div id="blackMarketPanel" class="panel">
                <div class="panel-title-bar">
                    <h2>🏪 黑市交易</h2>
                    <div class="panel-gold">🪙 <span id="marketGold">1000</span></div>
                    <button class="menu-btn tertiary" style="padding:8px 16px;font-size:14px;" onclick="showLobby()">← 返回</button>
                </div>

                <div class="market-main-layout">
                    <!-- 左侧：武器改装树 (70%) -->
                    <div class="market-left-tree">
                        <div class="section-label">武器改装树</div>
                        <div class="mod-tree-container">
                            <!-- 上方 3 个节点 -->
                            <div class="mod-tree-row mod-tree-top">
                                <div class="mod-tree-node" id="modNodeScope" onclick="selectModNode('scope')">
                                    <div class="mod-node-icon">🔭</div>
                                    <div class="mod-node-name">瞄准镜</div>
                                    <div class="mod-node-status" id="modNodeScopeStatus">未装备</div>
                                </div>
                                <div class="mod-tree-node" id="modNodeSuppressor" onclick="selectModNode('suppressor')">
                                    <div class="mod-node-icon">🔇</div>
                                    <div class="mod-node-name">消音器</div>
                                    <div class="mod-node-status" id="modNodeSuppressorStatus">未装备</div>
                                </div>
                                <div class="mod-tree-node" id="modNodeExtendedMag" onclick="selectModNode('extendedMag')">
                                    <div class="mod-node-icon">📋</div>
                                    <div class="mod-node-name">扩容弹匣</div>
                                    <div class="mod-node-status" id="modNodeExtendedMagStatus">未装备</div>
                                </div>
                            </div>

                            <!-- SVG 连接线 -->
                            <svg class="mod-tree-lines" viewBox="0 0 600 40" preserveAspectRatio="none">
                                <line x1="100" y1="0" x2="300" y2="40" stroke="var(--color-border)" stroke-width="1.5"/>
                                <line x1="300" y1="0" x2="300" y2="40" stroke="var(--color-border)" stroke-width="1.5"/>
                                <line x1="500" y1="0" x2="300" y2="40" stroke="var(--color-border)" stroke-width="1.5"/>
                            </svg>

                            <!-- 中央武器展示 -->
                            <div class="mod-tree-center">
                                <div class="mod-tree-weapon-display" id="modTreeWeaponDisplay">
                                    <div class="mod-tree-weapon-silhouette">
                                        <div class="ws-stock"></div>
                                        <div class="ws-body"></div>
                                        <div class="ws-barrel"></div>
                                        <div class="ws-magazine"></div>
                                        <div class="ws-grip"></div>
                                        <div class="ws-sight"></div>
                                    </div>
                                    <div class="mod-tree-weapon-name" id="modTreeWeaponName">突击步枪</div>
                                </div>
                            </div>

                            <!-- SVG 连接线 -->
                            <svg class="mod-tree-lines" viewBox="0 0 600 40" preserveAspectRatio="none">
                                <line x1="100" y1="0" x2="300" y2="40" stroke="var(--color-border)" stroke-width="1.5"/>
                                <line x1="300" y1="0" x2="300" y2="40" stroke="var(--color-border)" stroke-width="1.5"/>
                                <line x1="500" y1="0" x2="300" y2="40" stroke="var(--color-border)" stroke-width="1.5"/>
                            </svg>

                            <!-- 下方 3 个节点 -->
                            <div class="mod-tree-row mod-tree-bottom">
                                <div class="mod-tree-node" id="modNodeGrip" onclick="selectModNode('grip')">
                                    <div class="mod-node-icon">✋</div>
                                    <div class="mod-node-name">战术握把</div>
                                    <div class="mod-node-status" id="modNodeGripStatus">未装备</div>
                                </div>
                                <div class="mod-tree-node" id="modNodeAPRounds" onclick="selectModNode('apRounds')">
                                    <div class="mod-node-icon">🎯</div>
                                    <div class="mod-node-name">穿甲弹</div>
                                    <div class="mod-node-status" id="modNodeAPRoundsStatus">未装备</div>
                                </div>
                                <div class="mod-tree-node" id="modNodeStock" onclick="selectModNode('stock')">
                                    <div class="mod-node-icon">🪵</div>
                                    <div class="mod-node-name">枪托</div>
                                    <div class="mod-node-status" id="modNodeStockStatus">未装备</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 右侧：阵营面板 (30%) -->
                    <div class="market-right-faction">
                        <div class="section-label">阵营信息</div>
                        <div class="faction-card">
                            <div class="faction-icon">⬡</div>
                            <div class="faction-name" id="factionName">死亡战壕特遣队</div>
                            <div class="faction-level">Lv.<span id="factionLevel">5</span></div>
                            <div class="faction-stats">
                                <div class="faction-stat-row">
                                    <span class="faction-stat-label">攻击力加成</span>
                                    <div class="faction-stat-bar"><div class="faction-stat-fill" style="width:60%;"></div></div>
                                    <span class="faction-stat-value">+12%</span>
                                </div>
                                <div class="faction-stat-row">
                                    <span class="faction-stat-label">防御力加成</span>
                                    <div class="faction-stat-bar"><div class="faction-stat-fill" style="width:45%;"></div></div>
                                    <span class="faction-stat-value">+8%</span>
                                </div>
                                <div class="faction-stat-row">
                                    <span class="faction-stat-label">射速加成</span>
                                    <div class="faction-stat-bar"><div class="faction-stat-fill" style="width:30%;"></div></div>
                                    <span class="faction-stat-value">+5%</span>
                                </div>
                                <div class="faction-stat-row">
                                    <span class="faction-stat-label">移动速度</span>
                                    <div class="faction-stat-bar"><div class="faction-stat-fill" style="width:70%;"></div></div>
                                    <span class="faction-stat-value">+15%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部 Tab 栏 -->
                <div class="market-bottom-tabs">
                    <button class="mkt-tab active" onclick="switchMarketTab('weapon')">🔫 武器</button>
                    <button class="mkt-tab" onclick="switchMarketTab('attachment')">🔩 配件</button>
                    <button class="mkt-tab" onclick="switchMarketTab('ammo')">🔮 弹药</button>
                    <button class="mkt-tab" onclick="switchMarketTab('armor')">🛡️ 护甲</button>
                    <button class="mkt-tab" onclick="switchMarketTab('consumable')">💊 消耗品</button>
                    <button class="mkt-tab" onclick="switchMarketTab('sell')">💰 出售</button>
                </div>

                <!-- Tab 内容区 -->
                <div class="market-tab-contents">
                    <!-- 武器Tab -->
                    <div class="market-tab-content market-weapon-section" id="marketTabWeapon">
                        <!-- 保留原武器Tab内容，由JS动态渲染 -->
                    </div>
                    <!-- 其他Tab保持 display:none 默认 -->
                    <div class="market-tab-content market-attachment-section" id="marketTabAttachment" style="display:none;"></div>
                    <div class="market-tab-content market-ammo-section" id="marketTabAmmo" style="display:none;"></div>
                    <div class="market-tab-content market-armor-section" id="marketTabArmor" style="display:none;"></div>
                    <div class="market-tab-content market-consumable-section" id="marketTabConsumable" style="display:none;"></div>
                    <div class="market-tab-content market-sell-section" id="marketTabSell" style="display:none;"></div>
                </div>
            </div>
```

### 6.3 CSS 追加

在 `style.css` 中追加黑市专属样式：

```css
/* ========================================
   黑市面板 - 改装树 + 阵营布局
   ======================================== */

.market-main-layout {
    display: flex;
    gap: 20px;
    margin-bottom: 16px;
}

.market-left-tree {
    flex: 0 0 70%;
    min-width: 0;
}

.market-right-faction {
    flex: 0 0 calc(30% - 20px);
}

/* 改装树 */
.mod-tree-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
}

.mod-tree-row {
    display: flex;
    justify-content: center;
    gap: 16px;
    width: 100%;
}

.mod-tree-node {
    width: 160px;
    padding: 12px;
    background: var(--color-bg-overlay);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.mod-tree-node:hover {
    border-color: var(--brand-primary-light);
    background: var(--color-bg-hover);
}

.mod-tree-node.equipped {
    border-color: var(--brand-accent);
    background: rgba(0, 255, 136, 0.1);
    box-shadow: var(--glow-accent);
}

.mod-node-icon {
    font-size: 24px;
    margin-bottom: 4px;
}

.mod-node-name {
    font-size: 13px;
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-weight: 600;
}

.mod-node-status {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 4px;
}

.mod-tree-node.equipped .mod-node-status {
    color: var(--brand-accent);
}

.mod-tree-lines {
    width: 100%;
    height: 40px;
    flex-shrink: 0;
}

.mod-tree-center {
    display: flex;
    justify-content: center;
    padding: 16px;
}

.mod-tree-weapon-display {
    width: 240px;
    height: 140px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
}

.mod-tree-weapon-silhouette {
    transform: scale(1.5);
    position: relative;
}

.mod-tree-weapon-name {
    margin-top: 30px;
    font-size: 14px;
    color: var(--color-text-accent);
    font-family: var(--font-body);
    font-weight: 600;
}

/* 阵营面板 */
.faction-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 20px;
    text-align: center;
}

.faction-icon {
    font-size: 48px;
    color: var(--brand-secondary);
    margin-bottom: 8px;
    filter: drop-shadow(0 0 8px rgba(184, 134, 11, 0.3));
}

.faction-name {
    font-size: 16px;
    color: var(--color-text-primary);
    font-weight: 700;
    font-family: var(--font-body);
    margin-bottom: 4px;
}

.faction-level {
    font-size: 13px;
    color: var(--brand-secondary);
    font-family: var(--font-display);
    margin-bottom: 16px;
}

.faction-stats {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
}

.faction-stat-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.faction-stat-label {
    font-size: 12px;
    color: var(--color-text-muted);
    width: 70px;
    flex-shrink: 0;
    text-align: right;
    font-family: var(--font-body);
}

.faction-stat-bar {
    flex: 1;
    height: 6px;
    background: var(--color-surface);
    border-radius: 3px;
    overflow: hidden;
}

.faction-stat-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--brand-primary), var(--brand-accent));
    border-radius: 3px;
    transition: width var(--transition-normal);
}

.faction-stat-value {
    font-size: 12px;
    color: var(--brand-accent);
    width: 40px;
    text-align: right;
    font-family: var(--font-display);
    font-weight: 600;
}

/* 底部 Tab 栏 */
.market-bottom-tabs {
    display: flex;
    gap: 4px;
    padding: 8px;
    background: var(--color-surface);
    border-radius: var(--radius-md);
    margin-bottom: 16px;
}

.mkt-tab {
    flex: 1;
    padding: 10px 12px;
    background: transparent;
    color: var(--color-text-muted);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 13px;
    transition: all var(--transition-fast);
    text-align: center;
}

.mkt-tab.active {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
    border-color: var(--brand-primary-light);
}

.mkt-tab:hover:not(.active) {
    color: var(--color-text-secondary);
    background: rgba(74, 93, 35, 0.1);
}

/* Tab 内容 */
.market-tab-contents {
    min-height: 200px;
}

.market-tab-content .market-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}

.market-tab-content .market-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
}

.market-tab-content .market-item:hover {
    border-color: var(--color-border);
}

.market-item .item-icon {
    font-size: 28px;
    width: 40px;
    text-align: center;
    flex-shrink: 0;
}

.market-item .item-info {
    flex: 1;
    min-width: 0;
}

.market-item .item-name {
    font-size: 14px;
    color: var(--color-text-primary);
    font-weight: 600;
    font-family: var(--font-body);
}

.market-item .item-desc {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: 2px;
    font-family: var(--font-body);
}

.market-item .item-price {
    font-size: 13px;
    color: var(--brand-secondary);
    font-weight: 600;
    flex-shrink: 0;
    font-family: var(--font-display);
}
```

---

## 七、任务线面板 (#missionLinePanel)

**HTML 位置**: `index.html` 第 787-799 行

### 7.1 HTML 替换

将 `#missionLinePanel` 的内容替换为以下结构：

```html
<div id="missionLinePanel" class="panel">
    <div class="panel-title-bar">
        <h2>📋 任务线</h2>
        <button class="menu-btn tertiary" style="padding:8px 16px; font-size:14px;" onclick="showLobby()">← 返回</button>
    </div>

    <!-- 黄色提示横幅 -->
    <div class="mission-banner">
        <span class="mission-banner-icon">⚠️</span>
        <span class="mission-banner-text">标注「任意地图」的任务可点击选择；特定地图任务需切换地图后才能进行</span>
    </div>

    <!-- 任务列表（由 JS 动态渲染，这里定义卡片模板） -->
    <div class="mission-line-list" id="missionLineList">
        <!-- JS 渲染时使用以下卡片结构：
        <div class="mission-card [locked] [completed] [active]" data-mission-id="xxx">
            <div class="mc-left">
                <div class="mc-icon">⚔️</div>
            </div>
            <div class="mc-center">
                <div class="mc-title">沙漠突袭 <span class="mc-subtitle">Desert Assault</span></div>
                <div class="mc-desc">消灭沙漠中所有敌人</div>
                <div class="mc-meta">
                    <span class="mc-map-tag">🏜️ 沙漠</span>
                    <span class="mc-target">目标: 15次击杀</span>
                </div>
                <div class="mc-reward">🪙 500</div>
            </div>
            <div class="mc-right">
                <div class="mc-status [mc-locked / mc-completed / mc-active]">
                    🔒 / ✓ / 进行中
                </div>
            </div>
        </div>
        -->
    </div>
</div>
```

### 7.2 任务卡片状态

| 状态 | class | 图标 | 视觉表现 |
|------|-------|------|----------|
| 锁定 | `.mission-card.locked` | 🔒 | 灰色背景，文字暗淡，无交互 |
| 已完成 | `.mission-card.completed` | ✓ | 灰绿背景，绿色 ✓ 标记 |
| 进行中 | `.mission-card.active` | 进行中 + 绿色脉冲点 | 荧光绿边框发光，绿色"进行中"徽章 |
| 可选但未开始 | `.mission-card` (无额外 class) | — | 默认深色卡片，hover 时边框亮 |

### 7.3 提示横幅 CSS

```css
.mission-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    margin: 0 20px 16px;
    background: rgba(184, 134, 11, 0.1);
    border: 1px solid rgba(184, 134, 11, 0.3);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: var(--brand-secondary-light);
}

.mission-banner-icon {
    font-size: 16px;
    flex-shrink: 0;
}

.mission-banner-text {
    line-height: 1.5;
}
```

### 7.4 任务卡片 CSS

```css
.mission-line-list {
    padding: 0 20px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    flex: 1;
}

.mission-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.2s ease;
}

.mission-card:hover {
    border-color: var(--border-default);
    background: rgba(30, 30, 30, 0.95);
    box-shadow: var(--shadow-card);
}

/* 锁定状态 */
.mission-card.locked {
    opacity: 0.45;
    cursor: not-allowed;
}

.mission-card.locked:hover {
    border-color: var(--border-subtle);
    background: var(--bg-card);
    box-shadow: none;
}

/* 已完成状态 */
.mission-card.completed {
    border-color: rgba(0, 204, 102, 0.2);
}

.mission-card.completed:hover {
    border-color: rgba(0, 204, 102, 0.35);
}

/* 进行中状态 */
.mission-card.active {
    border-color: var(--brand-accent);
    box-shadow: 0 0 15px rgba(0, 255, 136, 0.25), inset 0 0 20px rgba(0, 255, 136, 0.03);
    background: rgba(0, 255, 136, 0.04);
}

/* 左侧图标 */
.mc-left {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-hover);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    font-size: 24px;
}

/* 中间内容 */
.mc-center {
    flex: 1;
    min-width: 0;
}

.mc-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
}

.mc-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 6px;
}

.mc-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 6px;
    line-height: 1.4;
}

.mc-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
}

.mc-map-tag {
    font-size: 11px;
    padding: 2px 8px;
    background: rgba(74, 93, 35, 0.2);
    border: 1px solid rgba(74, 93, 35, 0.3);
    border-radius: var(--radius-sm);
    color: var(--brand-primary-light);
}

.mc-target {
    font-size: 12px;
    color: var(--text-muted);
}

.mc-reward {
    font-size: 13px;
    color: var(--brand-secondary);
    font-weight: 600;
    font-family: var(--font-display);
}

/* 右侧状态 */
.mc-right {
    flex-shrink: 0;
    display: flex;
    align-items: center;
}

.mc-status {
    font-size: 12px;
    padding: 6px 14px;
    border-radius: var(--radius-full);
    font-weight: 600;
    white-space: nowrap;
}

.mc-locked {
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
}

.mc-completed {
    background: rgba(0, 204, 102, 0.15);
    color: var(--brand-accent-dim);
    border: 1px solid rgba(0, 204, 102, 0.3);
}

.mc-active {
    background: rgba(0, 255, 136, 0.12);
    color: var(--brand-accent);
    border: 1px solid rgba(0, 255, 136, 0.4);
    animation: activePulse 2s ease-in-out infinite;
}

@keyframes activePulse {
    0%, 100% { box-shadow: 0 0 4px rgba(0, 255, 136, 0.2); }
    50% { box-shadow: 0 0 12px rgba(0, 255, 136, 0.4); }
}
```

### 7.5 任务卡片渲染 JS

```javascript
function renderMissionLine() {
    const list = document.getElementById('missionLineList');
    if (!list) return;

    const missions = [
        { id: 'desert', name: '沙漠突袭', subtitle: 'Desert Assault', desc: '消灭沙漠中所有敌人', icon: '⚔️', map: '🏜️ 沙漠', mapId: 'desert', target: '目标: 15次击杀', reward: 500, status: 'locked' },
        { id: 'city', name: '城市清剿', subtitle: 'City Cleanup', desc: '在城市废墟中消灭所有敌人', icon: '⚔️', map: '🏙️ 城市', mapId: 'city', target: '目标: 20次击杀', reward: 600, status: 'locked' },
        { id: 'extract', name: '成功撤离', subtitle: 'Successful Extraction', desc: '在限定时间内到达撤离点', icon: '🚁', map: '🚁 任意地图', mapId: 'any', target: '目标: 到达撤离点', reward: 300, status: 'completed' },
        { id: 'highscore', name: '高分挑战', subtitle: 'High Score Challenge', desc: '单局得分达到 1000 分', icon: '🏆', map: '🎯 任意地图', mapId: 'any', target: '目标: 1000分', reward: 800, status: 'active', progress: '650/1000' }
    ];

    list.innerHTML = '';
    missions.forEach(m => {
        const card = document.createElement('div');
        card.className = `mission-card ${m.status}`;
        card.dataset.missionId = m.id;

        let statusHTML = '';
        if (m.status === 'locked') statusHTML = '<div class="mc-status mc-locked">🔒</div>';
        else if (m.status === 'completed') statusHTML = '<div class="mc-status mc-completed">✓</div>';
        else if (m.status === 'active') statusHTML = `<div class="mc-status mc-active">进行中 ${m.progress || ''}</div>`;

        card.innerHTML = `
            <div class="mc-left">
                <div class="mc-icon">${m.icon}</div>
            </div>
            <div class="mc-center">
                <div class="mc-title">${m.name} <span class="mc-subtitle">${m.subtitle}</span></div>
                <div class="mc-desc">${m.desc}</div>
                <div class="mc-meta">
                    <span class="mc-map-tag">${m.map}</span>
                    <span class="mc-target">${m.target}</span>
                </div>
                <div class="mc-reward">🪙 ${m.reward}</div>
            </div>
            <div class="mc-right">
                ${statusHTML}
            </div>
        `;

        if (m.status !== 'locked') {
            card.onclick = () => selectMission(m.id);
        }

        list.appendChild(card);
    });
}
```

---

## 八、改装面板 (#modificationPanel)

**HTML 位置**: `index.html` 第 886-905 行

### 7.1 HTML 保持现有结构，升级 CSS

当前 HTML 结构已经合理（武器选择 + 配件商店 + 已装备），无需大幅改动。

### 7.2 CSS 升级

```css
/* ========================================
   改装面板
   ======================================== */

.mod-content {
    display: flex;
    gap: 20px;
}

.mod-section {
    flex: 1;
    min-width: 0;
}

.mod-section .section-title {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border-subtle);
}

/* 武器选择列表 */
.weapon-select-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.weapon-select-grid .weapon-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: var(--font-body);
}

.weapon-select-grid .weapon-card:hover {
    border-color: var(--color-border);
    background: var(--color-bg-hover);
}

.weapon-select-grid .weapon-card.selected {
    border-color: var(--brand-accent);
    background: rgba(0, 255, 136, 0.08);
    box-shadow: inset 3px 0 0 var(--brand-accent);
}

/* 配件商店网格 */
.mod-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

.mod-grid .mod-item {
    padding: 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.mod-grid .mod-item:hover {
    border-color: var(--brand-primary-light);
}

.mod-grid .mod-item.equipped {
    border-color: var(--brand-accent);
    background: rgba(0, 255, 136, 0.08);
}

/* 已装备槽位 */
.mod-equipped {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mod-equipped .equipped-slot {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
}

.equipped-slot .slot-check {
    width: 20px;
    height: 20px;
    background: var(--brand-accent);
    color: #000;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    flex-shrink: 0;
}

.equipped-slot .slot-name {
    flex: 1;
    font-size: 14px;
    color: var(--color-text-primary);
}

.equipped-slot .slot-bonus {
    font-size: 12px;
    color: var(--brand-accent);
    font-weight: 600;
}
```

---

## 九、皮肤商店 (#skinPanel)

**HTML 位置**: `index.html` 第 958-994 行

### 8.1 HTML 保持现有结构，升级 CSS

当前结构已具备大预览面板和皮肤网格。

### 8.2 CSS 升级

```css
/* ========================================
   皮肤商店
   ======================================== */

.skin-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
}

.skin-tabs .tab-btn {
    padding: 10px 20px;
    background: var(--color-surface);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all var(--transition-fast);
}

.skin-tabs .tab-btn.active {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
    border-color: var(--brand-primary-light);
}

/* 大预览面板 */
.skin-large-preview {
    width: 100%;
    height: 200px;
    background: var(--color-bg-card);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
}

.skin-large-preview::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, rgba(74, 93, 35, 0.1) 0%, transparent 70%);
    pointer-events: none;
}

.skin-preview-weapon {
    position: relative;
    z-index: 1;
}

/* 武器剪影 - 2倍缩放 */
.skin-preview-weapon .weapon-silhouette {
    transform: scale(2);
}

/* 武器剪影 6 部分颜色 */
.weapon-silhouette .ws-body {
    background: var(--skin-body-color, #666);
}
.weapon-silhouette .ws-barrel {
    background: var(--skin-barrel-color, #555);
}
.weapon-silhouette .ws-magazine {
    background: var(--skin-magazine-color, #555);
}
.weapon-silhouette .ws-stock {
    background: var(--skin-stock-color, #555);
}
.weapon-silhouette .ws-grip {
    background: var(--skin-grip-color, #444);
}
.weapon-silhouette .ws-sight {
    background: var(--skin-sight-color, #777);
}

.skin-preview-name {
    margin-top: 50px;
    font-size: 16px;
    color: var(--color-text-primary);
    font-weight: 600;
    font-family: var(--font-body);
    position: relative;
    z-index: 1;
}

.skin-preview-status {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: 4px;
    position: relative;
    z-index: 1;
}

/* 皮肤卡片网格 */
.skin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}

.skin-card {
    background: var(--color-bg-card);
    border: 2px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: 12px;
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    position: relative;
    overflow: hidden;
}

.skin-card:hover {
    transform: scale(1.02);
    border-color: var(--color-border);
    box-shadow: var(--shadow-card);
}

.skin-card.equipped {
    border-color: var(--brand-accent);
    box-shadow: var(--glow-accent);
}

.skin-card.owned::after {
    content: '✓';
    position: absolute;
    top: 6px;
    right: 6px;
    width: 18px;
    height: 18px;
    background: var(--brand-accent);
    color: #000;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
}

/* 皮肤卡片内剪影 */
.skin-card .weapon-silhouette {
    transform: scale(0.8);
    margin: 0 auto 8px;
}

.skin-card .skin-card-name {
    font-size: 13px;
    color: var(--color-text-primary);
    font-weight: 600;
    font-family: var(--font-body);
}

.skin-card .skin-card-rarity {
    font-size: 11px;
    margin-top: 4px;
    font-weight: 600;
    font-family: var(--font-display);
}

.skin-card .skin-card-price {
    font-size: 12px;
    color: var(--brand-secondary);
    margin-top: 6px;
    font-family: var(--font-display);
}

/* 稀有度颜色系统 */
.rarity-common .skin-card-rarity { color: #9ca3af; }
.rarity-rare .skin-card-rarity { color: #60a5fa; }
.rarity-epic .skin-card-rarity { color: #c084fc; }
.rarity-legendary .skin-card-rarity { color: #fbbf24; }

.rarity-common { border-color: rgba(156, 163, 175, 0.3); }
.rarity-rare { border-color: rgba(59, 130, 246, 0.3); }
.rarity-epic { border-color: rgba(168, 85, 247, 0.3); }
.rarity-legendary { border-color: rgba(245, 158, 11, 0.3); }

.rarity-common .skin-card-bg { background: rgba(156, 163, 175, 0.05); }
.rarity-rare .skin-card-bg { background: rgba(59, 130, 246, 0.1); }
.rarity-epic .skin-card-bg { background: rgba(168, 85, 247, 0.1); }
.rarity-legendary .skin-card-bg { background: rgba(245, 158, 11, 0.12); }

.rarity-legendary {
    animation: legendaryCardShimmer 3s ease-in-out infinite;
}

@keyframes legendaryCardShimmer {
    0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.2); }
    50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.4); }
}

/* 皮肤配色方案 */
.skin-default .ws-body { background: #666; }
.skin-default .ws-barrel { background: #555; }
.skin-default .ws-magazine { background: #555; }
.skin-default .ws-stock { background: #555; }
.skin-default .ws-grip { background: #444; }
.skin-default .ws-sight { background: #777; }

/* 碳纤维 - 条纹 */
.skin-carbon .ws-body { background: repeating-linear-gradient(45deg, #333, #333 3px, #444 3px, #444 6px); }
.skin-carbon .ws-barrel { background: #3a3a3a; }
.skin-carbon .ws-magazine { background: #2d2d2d; }
.skin-carbon .ws-stock { background: repeating-linear-gradient(45deg, #333, #333 3px, #444 3px, #444 6px); }
.skin-carbon .ws-grip { background: #2a2a2a; }
.skin-carbon .ws-sight { background: #4a4a4a; }

/* 黄金 - 渐变 */
.skin-gold .ws-body { background: linear-gradient(135deg, #b8860b, #daa520, #ffd700, #daa520, #b8860b); }
.skin-gold .ws-barrel { background: linear-gradient(180deg, #daa520, #ffd700); }
.skin-gold .ws-magazine { background: linear-gradient(180deg, #b8860b, #daa520); }
.skin-gold .ws-stock { background: linear-gradient(135deg, #b8860b, #ffd700); }
.skin-gold .ws-grip { background: #8f6808; }
.skin-gold .ws-sight { background: linear-gradient(180deg, #ffd700, #daa520); }

/* 迷彩 - 多色 */
.skin-camo .ws-body { background: linear-gradient(135deg, #4a5d23 25%, #3a4a1b 25%, #3a4a1b 50%, #5c7230 50%, #5c7230 75%, #4a5d23 75%); }
.skin-camo .ws-barrel { background: #4a5d23; }
.skin-camo .ws-magazine { background: #3a4a1b; }
.skin-camo .ws-stock { background: linear-gradient(90deg, #4a5d23, #5c7230, #3a4a1b); }
.skin-camo .ws-grip { background: #2d3a14; }
.skin-camo .ws-sight { background: #5c7230; }

/* 霓虹 - 青色发光 */
.skin-neon .ws-body { background: #0a2a2a; box-shadow: 0 0 8px rgba(0, 255, 255, 0.5); }
.skin-neon .ws-barrel { background: #0ff; box-shadow: 0 0 8px rgba(0, 255, 255, 0.6); }
.skin-neon .ws-magazine { background: #088; }
.skin-neon .ws-stock { background: #066; }
.skin-neon .ws-grip { background: #044; }
.skin-neon .ws-sight { background: #0ff; box-shadow: 0 0 6px rgba(0, 255, 255, 0.5); }

/* 赤红 - 红色发光 */
.skin-red .ws-body { background: #4a1a1a; box-shadow: 0 0 8px rgba(255, 50, 50, 0.4); }
.skin-red .ws-barrel { background: #cc3333; box-shadow: 0 0 6px rgba(255, 50, 50, 0.5); }
.skin-red .ws-magazine { background: #8b1a1a; }
.skin-red .ws-stock { background: #6b1414; }
.skin-red .ws-grip { background: #4a0e0e; }
.skin-red .ws-sight { background: #cc3333; }

/* 深蓝 - 蓝色发光 */
.skin-blue .ws-body { background: #1a2a4a; box-shadow: 0 0 8px rgba(50, 100, 255, 0.4); }
.skin-blue .ws-barrel { background: #3366cc; box-shadow: 0 0 6px rgba(50, 100, 255, 0.5); }
.skin-blue .ws-magazine { background: #224488; }
.skin-blue .ws-stock { background: #1a3366; }
.skin-blue .ws-grip { background: #112244; }
.skin-blue .ws-sight { background: #3366cc; }

/* 紫晶 - 紫色发光 */
.skin-purple .ws-body { background: #2a1a4a; box-shadow: 0 0 8px rgba(168, 85, 247, 0.4); }
.skin-purple .ws-barrel { background: #a855f7; box-shadow: 0 0 6px rgba(168, 85, 247, 0.5); }
.skin-purple .ws-magazine { background: #6b2fa0; }
.skin-purple .ws-stock { background: #5a2288; }
.skin-purple .ws-grip { background: #3a1555; }
.skin-purple .ws-sight { background: #a855f7; }

.skin-equipped-info {
    padding: 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
}
```

---

## 十、皮肤数据定义（JS）

**此节非常关键！需要在 `js/game.js` 中添加完整的皮肤数据结构。**

**操作**: 在 `game.js` 中搜索 `WEAPONS` 或 `SKINS` 相关定义，在武器数据定义之后添加以下皮肤数据。

### 9.1 武器列表（13 种）

```javascript
const WEAPON_TYPES = [
    '手枪', '冲锋枪', '步枪', '突击步枪', '轻机枪',
    '霰弹枪', '狙击枪', '战术刀', '火箭筒', '激光枪',
    '加特林', '双持手枪', '猎枪'
];
```

### 9.2 皮肤模板定义（20 种）

每种武器都有以下 20 种皮肤，颜色值映射如下：

```javascript
/**
 * 皮肤模板 - 20种通用皮肤
 * 每种皮肤定义6个CSS部件颜色 + glowColor
 * 武器剪影 CSS 类: ws-body, ws-barrel, ws-magazine, ws-stock, ws-grip, ws-sight
 */
const SKIN_TEMPLATES = {
    '默认': {
        rarity: '普通', price: 0,
        body: '#666666', barrel: '#555555', magazine: '#555555',
        stock: '#555555', grip: '#444444', sight: '#777777',
        glowColor: 'none'
    },
    '碳纤维': {
        rarity: '稀有', price: 500,
        body: 'repeating-linear-gradient(45deg,#333,#333 3px,#444 3px,#444 6px)',
        barrel: '#3a3a3a', magazine: '#2d2d2d',
        stock: 'repeating-linear-gradient(45deg,#333,#333 3px,#444 3px,#444 6px)',
        grip: '#2a2a2a', sight: '#4a4a4a',
        glowColor: 'none'
    },
    '黄金': {
        rarity: '史诗', price: 1000,
        body: 'linear-gradient(135deg,#b8860b,#daa520,#ffd700,#daa520,#b8860b)',
        barrel: 'linear-gradient(180deg,#daa520,#ffd700)', magazine: 'linear-gradient(180deg,#b8860b,#daa520)',
        stock: 'linear-gradient(135deg,#b8860b,#ffd700)', grip: '#8f6808',
        sight: 'linear-gradient(180deg,#ffd700,#daa520)',
        glowColor: 'rgba(255,215,0,0.4)'
    },
    '迷彩': {
        rarity: '稀有', price: 800,
        body: 'linear-gradient(135deg,#4a5d23 25%,#3a4a1b 25%,#3a4a1b 50%,#5c7230 50%,#5c7230 75%,#4a5d23 75%)',
        barrel: '#4a5d23', magazine: '#3a4a1b',
        stock: 'linear-gradient(90deg,#4a5d23,#5c7230,#3a4a1b)', grip: '#2d3a14', sight: '#5c7230',
        glowColor: 'none'
    },
    '霓虹': {
        rarity: '传说', price: 1200,
        body: '#0a2a2a', barrel: '#00ffff', magazine: '#008888',
        stock: '#006666', grip: '#004444', sight: '#00ffff',
        glowColor: 'rgba(0,255,255,0.5)'
    },
    '赤红': {
        rarity: '稀有', price: 600,
        body: '#4a1a1a', barrel: '#cc3333', magazine: '#8b1a1a',
        stock: '#6b1414', grip: '#4a0e0e', sight: '#cc3333',
        glowColor: 'rgba(255,50,50,0.4)'
    },
    '深蓝': {
        rarity: '稀有', price: 600,
        body: '#1a2a4a', barrel: '#3366cc', magazine: '#224488',
        stock: '#1a3366', grip: '#112244', sight: '#3366cc',
        glowColor: 'rgba(50,100,255,0.4)'
    },
    '紫晶': {
        rarity: '传说', price: 1500,
        body: '#2a1a4a', barrel: '#a855f7', magazine: '#6b2fa0',
        stock: '#5a2288', grip: '#3a1555', sight: '#a855f7',
        glowColor: 'rgba(168,85,247,0.5)'
    },
    '极地': {
        rarity: '稀有', price: 700,
        body: '#d4e5f7', barrel: '#e8f0fe', magazine: '#b8d4f0',
        stock: '#c0ddf5', grip: '#a0c8e8', sight: '#e8f0fe',
        glowColor: 'rgba(200,220,255,0.3)'
    },
    '炽焰': {
        rarity: '史诗', price: 900,
        body: '#4a2a0a', barrel: '#ff6600', magazine: '#cc4400',
        stock: '#8b3300', grip: '#662200', sight: '#ff8800',
        glowColor: 'rgba(255,100,0,0.5)'
    },
    '毒蛇': {
        rarity: '史诗', price: 1100,
        body: '#1a3a1a', barrel: '#33cc33', magazine: '#228822',
        stock: '#1a661a', grip: '#0d440d', sight: '#33cc33',
        glowColor: 'rgba(50,200,50,0.4)'
    },
    '暗影': {
        rarity: '稀有', price: 800,
        body: '#1a1a2e', barrel: '#333366', magazine: '#222244',
        stock: '#1a1a33', grip: '#111122', sight: '#333366',
        glowColor: 'rgba(50,50,100,0.3)'
    },
    '星辰': {
        rarity: '传说', price: 2000,
        body: 'linear-gradient(135deg,#1a1a4a,#2a1a5a,#3a2a6a)', barrel: '#8888ff',
        magazine: '#6666cc', stock: '#5555aa', grip: '#444488', sight: '#aaaa ff',
        glowColor: 'rgba(130,130,255,0.6)'
    },
    '铁锈': {
        rarity: '普通', price: 400,
        body: '#5a3a2a', barrel: '#6b4430', magazine: '#4a2a1a',
        stock: '#5a3a2a', grip: '#3a1a0a', sight: '#6b4430',
        glowColor: 'none'
    },
    '白金': {
        rarity: '传说', price: 1300,
        body: 'linear-gradient(135deg,#e5e4e2,#d1d0cf,#e5e4e2)',
        barrel: '#e5e4e2', magazine: '#d1d0cf',
        stock: 'linear-gradient(135deg,#d1d0cf,#e5e4e2)', grip: '#b8b7b6', sight: '#e5e4e2',
        glowColor: 'rgba(220,220,220,0.4)'
    },
    '森林': {
        rarity: '普通', price: 500,
        body: '#2d4a1a', barrel: '#3a5c23', magazine: '#264010',
        stock: '#2d4a1a', grip: '#1a300d', sight: '#3a5c23',
        glowColor: 'none'
    },
    '沙漠': {
        rarity: '普通', price: 500,
        body: '#b8976a', barrel: '#c9a87a', magazine: '#a08050',
        stock: '#b8976a', grip: '#8a7040', sight: '#c9a87a',
        glowColor: 'none'
    },
    '海洋': {
        rarity: '稀有', price: 600,
        body: '#1a4a6b', barrel: '#2288bb', magazine: '#1a6688',
        stock: '#1a4a6b', grip: '#0d3355', sight: '#2288bb',
        glowColor: 'rgba(34,136,187,0.4)'
    },
    '雷暴': {
        rarity: '传说', price: 1400,
        body: '#2a2a3a', barrel: '#ffdd00', magazine: '#ccaa00',
        stock: '#4a4a5a', grip: '#333344', sight: '#ffdd00',
        glowColor: 'rgba(255,221,0,0.6)'
    },
    '龙鳞': {
        rarity: '传说', price: 2500,
        body: 'linear-gradient(135deg,#8b0000,#cc0000,#8b0000,#ff3333)',
        barrel: '#ff4444', magazine: '#aa0000',
        stock: 'linear-gradient(135deg,#8b0000,#ff3333)', grip: '#660000', sight: '#ff4444',
        glowColor: 'rgba(255,50,50,0.6)'
    }
};
```

### 9.3 战术刀专属皮肤（15 种）

```javascript
const KNIFE_SKIN_TEMPLATES = {
    '默认': { rarity: '普通', price: 0, body: '#888', blade: '#aaa', handle: '#555', glowColor: 'none' },
    '碳纤维': { rarity: '稀有', price: 400, body: '#333', blade: '#444', handle: '#2a2a2a', glowColor: 'none' },
    '黄金': { rarity: '史诗', price: 800, body: '#b8860b', blade: '#ffd700', handle: '#8f6808', glowColor: 'rgba(255,215,0,0.4)' },
    '迷彩': { rarity: '稀有', price: 600, body: '#4a5d23', blade: '#5c7230', handle: '#3a4a1b', glowColor: 'none' },
    '霓虹': { rarity: '传说', price: 1000, body: '#008888', blade: '#00ffff', handle: '#004444', glowColor: 'rgba(0,255,255,0.5)' },
    '赤红': { rarity: '稀有', price: 500, body: '#8b1a1a', blade: '#cc3333', handle: '#4a0e0e', glowColor: 'rgba(255,50,50,0.4)' },
    '深蓝': { rarity: '稀有', price: 500, body: '#224488', blade: '#3366cc', handle: '#112244', glowColor: 'rgba(50,100,255,0.4)' },
    '紫晶': { rarity: '传说', price: 1200, body: '#6b2fa0', blade: '#a855f7', handle: '#3a1555', glowColor: 'rgba(168,85,247,0.5)' },
    '血月': { rarity: '稀有', price: 700, body: '#4a0a0a', blade: '#cc2222', handle: '#2a0505', glowColor: 'rgba(200,30,30,0.4)' },
    '霜冻': { rarity: '稀有', price: 600, body: '#88aacc', blade: '#cce0ff', handle: '#5577aa', glowColor: 'rgba(180,210,255,0.3)' },
    '雷霆': { rarity: '史诗', price: 1100, body: '#444', blade: '#ffee00', handle: '#333', glowColor: 'rgba(255,238,0,0.5)' },
    '樱花': { rarity: '稀有', price: 800, body: '#cc6688', blade: '#ffaacc', handle: '#994466', glowColor: 'rgba(255,170,204,0.3)' },
    '龙牙': { rarity: '传说', price: 1500, body: '#eee', blade: '#fff', handle: '#888', glowColor: 'rgba(255,255,255,0.5)' },
    '暗夜': { rarity: '稀有', price: 900, body: '#1a1a2e', blade: '#333355', handle: '#0d0d1a', glowColor: 'rgba(50,50,80,0.3)' },
    '凤凰': { rarity: '传说', price: 2000, body: '#ff4400', blade: '#ffaa00', handle: '#cc2200', glowColor: 'rgba(255,150,0,0.6)' }
};
```

### 9.4 稀有度颜色系统（JS 侧）

```javascript
const RARITY_CONFIG = {
    '普通': { borderColor: '#9ca3af', textColor: '#9ca3af', bgGlow: 'none', label: '普通' },
    '稀有': { borderColor: '#3b82f6', textColor: '#60a5fa', bgGlow: 'rgba(59,130,246,0.15)', label: '稀有' },
    '史诗': { borderColor: '#a855f7', textColor: '#c084fc', bgGlow: 'rgba(168,85,247,0.15)', label: '史诗' },
    '传说': { borderColor: '#f59e0b', textColor: '#fbbf24', bgGlow: 'rgba(245,158,11,0.2)', label: '传说' }
};
```

### 9.5 生成完整皮肤数据

以下函数根据模板自动生成每种武器的全部皮肤数据：

```javascript
/**
 * 为每种武器生成完整的皮肤列表
 * weaponType: 武器类型名称
 * templates: 皮肤模板对象（20种或15种）
 * isKnife: 是否为战术刀（战术刀使用不同的颜色字段名）
 */
function generateWeaponSkins(weaponType, templates, isKnife = false) {
    const skins = [];
    let id = 1;
    for (const [name, tmpl] of Object.entries(templates)) {
        skins.push({
            id: `${weaponType}_skin_${id}`,
            weaponType: weaponType,
            name: name,
            rarity: tmpl.rarity,
            price: tmpl.price,
            colors: isKnife ? {
                body: tmpl.body,
                blade: tmpl.blade,
                handle: tmpl.handle
            } : {
                body: tmpl.body,
                barrel: tmpl.barrel,
                magazine: tmpl.magazine,
                stock: tmpl.stock,
                grip: tmpl.grip,
                sight: tmpl.sight
            },
            glowColor: tmpl.glowColor,
            owned: name === '默认', // 默认皮肤免费拥有
            equipped: name === '默认'
        });
        id++;
    }
    return skins;
}

// 生成所有武器皮肤数据
const ALL_WEAPON_SKINS = {};
WEAPON_TYPES.forEach(wtype => {
    if (wtype === '战术刀') {
        ALL_WEAPON_SKINS[wtype] = generateWeaponSkins(wtype, KNIFE_SKIN_TEMPLATES, true);
    } else {
        ALL_WEAPON_SKINS[wtype] = generateWeaponSkins(wtype, SKIN_TEMPLATES, false);
    }
});
```

---

## 十、抽奖池 (#lotteryPanel)

**HTML 位置**: `index.html` 第 908-955 行

### 10.1 说明

抽奖面板已有完整 HTML 结构，需要 CSS 动画升级和完整的 JS 抽奖池数据。

### 10.2 CSS 动画

在 `style.css` 中追加：

```css
/* ========================================
   抽奖面板
   ======================================== */

.lottery-banner {
    background: linear-gradient(135deg, rgba(74, 93, 35, 0.3), rgba(184, 134, 11, 0.2));
    border: 2px solid var(--brand-secondary);
    border-radius: var(--radius-md);
    padding: 20px;
    text-align: center;
    margin-bottom: 16px;
    position: relative;
    overflow: hidden;
}

.lottery-banner::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(184, 134, 11, 0.05) 10px,
        rgba(184, 134, 11, 0.05) 20px
    );
    pointer-events: none;
}

.lottery-banner-title {
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--brand-secondary);
    font-weight: 700;
    margin-bottom: 6px;
}

.lottery-banner-sub {
    font-size: 13px;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
}

.lottery-pity {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: 8px;
    font-family: var(--font-body);
}

/* 保底进度条 */
.lottery-pity-bar {
    width: 200px;
    height: 6px;
    background: var(--color-surface);
    border-radius: 3px;
    overflow: hidden;
    margin: 8px auto 0;
}

.lottery-pity-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--brand-accent-dim), var(--brand-accent));
    border-radius: 3px;
    transition: width var(--transition-fast);
}

/* 抽奖结果区域 */
.lottery-results {
    min-height: 200px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    align-items: center;
    padding: 16px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    margin-bottom: 16px;
}

/* 抽奖结果卡片 */
.lottery-result-card {
    width: 100px;
    padding: 12px;
    background: var(--color-bg-card);
    border: 2px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    text-align: center;
    animation: lotteryCardReveal 0.6s ease-out forwards;
    opacity: 0;
}

.lottery-result-card.legendary {
    border-color: rgba(245, 158, 11, 0.5);
    animation: lotteryCardReveal 0.6s ease-out forwards, legendaryGlow 2s ease-in-out infinite 0.6s;
    background: rgba(245, 158, 11, 0.1);
}

.lottery-result-card.epic {
    border-color: rgba(168, 85, 247, 0.5);
    background: rgba(168, 85, 247, 0.1);
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.3);
}

.lottery-result-card.rare {
    border-color: rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.05);
}

.lottery-result-card.common {
    border-color: rgba(156, 163, 175, 0.3);
}

.lottery-result-icon {
    font-size: 32px;
    margin-bottom: 6px;
}

.lottery-result-name {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-body);
}

.lottery-result-rarity {
    font-size: 10px;
    margin-top: 2px;
    font-weight: 600;
    font-family: var(--font-display);
}

/* 抽奖动画 */
@keyframes lotteryCardReveal {
    0% { transform: rotateY(90deg) scale(0.5); opacity: 0; }
    50% { transform: rotateY(0deg) scale(1.1); opacity: 1; }
    100% { transform: rotateY(0deg) scale(1); opacity: 1; }
}

@keyframes legendaryGlow {
    0%, 100% { box-shadow: 0 0 10px rgba(245,158,11,0.5); }
    50% { box-shadow: 0 0 30px rgba(245,158,11,0.8), 0 0 60px rgba(245,158,11,0.3); }
}

/* 抽奖按钮 */
.lottery-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 16px;
}

.lottery-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 28px;
    font-size: 16px;
    font-weight: 700;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
}

.lottery-btn-icon {
    font-size: 20px;
}

.lottery-btn-text {
    font-size: 15px;
}

.lottery-btn-price {
    font-size: 13px;
    color: var(--brand-secondary);
    font-family: var(--font-display);
}

/* 奖励预览 */
.lottery-preview {
    padding: 16px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
}

.lottery-preview .section-title {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 12px;
}

.lottery-preview-grid {
    display: flex;
    gap: 12px;
    justify-content: center;
}

.preview-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--color-bg-overlay);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: var(--font-body);
}

/* 粒子爆发效果（传说级） */
.lottery-particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
}

.particle {
    position: absolute;
    width: 4px;
    height: 4px;
    background: #fbbf24;
    border-radius: 50%;
    animation: particleBurst 1s ease-out forwards;
}

@keyframes particleBurst {
    0% { transform: translate(0, 0) scale(1); opacity: 1; }
    100% { transform: translate(var(--px), var(--py)) scale(0); opacity: 0; }
}
```

### 10.3 抽奖池数据定义（JS）

在 `game.js` 中添加：

```javascript
/**
 * 抽奖池定义
 * 每个物品有: name, icon, rarity, type, weight(权重), effect
 * 权重越大，概率越高
 * 保底: 每10抽必得稀有及以上
 */
const LOTTERY_POOL = [
    // === 传说 (权重总和约 3%) ===
    { name: '传说级皮肤碎片', icon: '🎨', rarity: '传说', type: 'skinFragment', weight: 1, desc: '随机传说皮肤碎片' },
    { name: '紫晶皮肤宝箱', icon: '📦', rarity: '传说', type: 'skinBox', weight: 1, desc: '开启获得紫晶系列皮肤' },
    { name: '星辰枪械蓝图', icon: '图纸', rarity: '传说', type: 'blueprint', weight: 1, desc: '星辰主题武器皮肤' },
    { name: '龙鳞涂装', icon: '🐉', rarity: '传说', type: 'skinDirect', weight: 1, desc: '直接获得龙鳞皮肤' },

    // === 史诗 (权重总和约 12%) ===
    { name: '黄金皮肤碎片', icon: '🏆', rarity: '史诗', type: 'skinFragment', weight: 3, desc: '黄金系列皮肤碎片' },
    { name: '炽焰皮肤宝箱', icon: '🔥', rarity: '史诗', type: 'skinBox', weight: 3, desc: '炽焰系列皮肤' },
    { name: '毒蛇涂装', icon: '🐍', rarity: '史诗', type: 'skinDirect', weight: 3, desc: '直接获得毒蛇皮肤' },
    { name: '500金币', icon: '💰', rarity: '史诗', type: 'coins', weight: 3, desc: '获得500金币' },
    { name: '稀有配件箱', icon: '🔧', rarity: '史诗', type: 'attachmentBox', weight: 3, desc: '随机史诗配件' },

    // === 稀有 (权重总和约 35%) ===
    { name: '碳纤维皮肤碎片', icon: '🖤', rarity: '稀有', type: 'skinFragment', weight: 8, desc: '碳纤维系列皮肤碎片' },
    { name: '迷彩涂装', icon: '🌿', rarity: '稀有', type: 'skinDirect', weight: 8, desc: '直接获得迷彩皮肤' },
    { name: '赤红涂装', icon: '🔴', rarity: '稀有', type: 'skinDirect', weight: 8, desc: '直接获得赤红皮肤' },
    { name: '200金币', icon: '🪙', rarity: '稀有', type: 'coins', weight: 8, desc: '获得200金币' },
    { name: '医疗包x3', icon: '💊', rarity: '稀有', type: 'item', weight: 7, desc: '获得3个医疗包' },
    { name: '手雷x2', icon: '💣', rarity: '稀有', type: 'item', weight: 7, desc: '获得2个手雷' },
    { name: '弹药箱x2', icon: '📦', rarity: '稀有', type: 'item', weight: 7, desc: '获得2个弹药箱' },

    // === 普通 (权重总和约 50%) ===
    { name: '100金币', icon: '🪙', rarity: '普通', type: 'coins', weight: 15, desc: '获得100金币' },
    { name: '50金币', icon: '🪙', rarity: '普通', type: 'coins', weight: 15, desc: '获得50金币' },
    { name: '医疗包x1', icon: '💊', rarity: '普通', type: 'item', weight: 10, desc: '获得1个医疗包' },
    { name: '加速卡x1', icon: '⚡', rarity: '普通', type: 'item', weight: 10, desc: '获得1个加速卡' },
    { name: '经验值+100', icon: '📈', rarity: '普通', type: 'exp', weight: 10, desc: '获得100经验值' },
    { name: '30金币', icon: '🪙', rarity: '普通', type: 'coins', weight: 10, desc: '获得30金币' }
];

// 计算总权重
const LOTTERY_TOTAL_WEIGHT = LOTTERY_POOL.reduce((sum, item) => sum + item.weight, 0);

// 抽奖逻辑
function drawLotteryItem() {
    let rand = Math.random() * LOTTERY_TOTAL_WEIGHT;
    for (const item of LOTTERY_POOL) {
        rand -= item.weight;
        if (rand <= 0) return item;
    }
    return LOTTERY_POOL[LOTTERY_POOL.length - 1];
}

// 保底逻辑: pityCounter >= 10 时强制稀有+
let lotteryPityCounter = 0;

function doLotteryPull(count) {
    const results = [];
    for (let i = 0; i < count; i++) {
        lotteryPityCounter++;
        let item;
        if (lotteryPityCounter >= 10) {
            // 保底: 从稀有及以上中随机
            const guaranteedPool = LOTTERY_POOL.filter(p => p.rarity !== '普通');
            item = guaranteedPool[Math.floor(Math.random() * guaranteedPool.length)];
            lotteryPityCounter = 0;
        } else {
            item = drawLotteryItem();
        }
        results.push(item);
    }
    return results;
}
```

---

## 十一、通用弹窗组件

**操作**: 在 `index.html` 末尾（第 1552 行 `</div>` 之后，第 1554 行 `<script>` 之前）添加弹窗 HTML。在 `style.css` 中追加弹窗样式。在 `game.js` 中追加弹窗 JS。

### 11.1 确认弹窗 (Confirm)

**HTML**（添加到 index.html）：

```html
    <!-- 通用确认弹窗 -->
    <div id="confirmModal" class="modal-overlay" style="display:none;">
        <div class="modal-box modal-confirm-box">
            <div class="modal-title" id="confirmTitle">确认操作</div>
            <div class="modal-message" id="confirmMessage">确定要执行此操作吗？</div>
            <div class="modal-btn-row">
                <button class="menu-btn tertiary" onclick="closeConfirm(false)">取消</button>
                <button class="menu-btn primary" onclick="closeConfirm(true)">确认</button>
            </div>
        </div>
    </div>
```

### 11.2 提示弹窗 (Toast)

**HTML**：

```html
    <!-- Toast 提示 -->
    <div id="toastContainer" class="toast-container"></div>
```

### 11.3 温馨提示弹窗 (Warm Tip)

**HTML**：

```html
    <!-- 温馨提示弹窗 -->
    <div id="warmTipModal" class="modal-overlay" style="display:none;">
        <div class="modal-box modal-warm-tip-box">
            <div class="modal-title">💡 温馨提示</div>
            <div class="modal-content-area" id="warmTipContent">
                <p>提示内容</p>
            </div>
            <div class="modal-btn-row">
                <button class="menu-btn primary" onclick="closeWarmTip()">知道了</button>
            </div>
        </div>
    </div>
```

### 11.4 错误弹窗 (Error)

**HTML**：

```html
    <!-- 错误弹窗 -->
    <div id="errorModal" class="modal-overlay" style="display:none;">
        <div class="modal-box modal-error-box">
            <div class="modal-title modal-error-title">⚠️ 错误</div>
            <div class="modal-message" id="errorMessage">发生了一个错误。</div>
            <div class="modal-btn-row">
                <button class="menu-btn danger" onclick="closeError()">确定</button>
            </div>
        </div>
    </div>
```

### 11.5 弹窗 CSS

在 `style.css` 中追加：

```css
/* ========================================
   通用弹窗系统
   ======================================== */

/* 遮罩层 */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

/* 弹窗盒子 */
.modal-box {
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 24px;
    min-width: 360px;
    max-width: 90vw;
    box-shadow: var(--shadow-deep);
    animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

.modal-title {
    font-family: var(--font-body);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 12px;
}

.modal-message {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 20px;
    line-height: 1.6;
}

.modal-content-area {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 20px;
    line-height: 1.6;
    padding: 12px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
}

.modal-btn-row {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

/* 温馨提示弹窗 */
.modal-warm-tip-box {
    min-width: 460px;
    border-color: var(--brand-secondary);
}

/* 错误弹窗 */
.modal-error-box {
    border-color: var(--brand-danger);
    border-width: 2px;
}

.modal-error-title {
    color: var(--brand-danger);
}

/* Toast 提示 */
.toast-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
}

.toast-item {
    padding: 12px 20px;
    background: var(--color-bg-panel);
    border-left: 4px solid var(--brand-primary);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-primary);
    box-shadow: var(--shadow-elevated);
    animation: toastSlideIn 0.3s ease-out, toastFadeOut 0.3s ease-in 2.7s forwards;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
}

.toast-item.toast-info { border-left-color: var(--brand-primary); }
.toast-item.toast-success { border-left-color: var(--brand-accent); }
.toast-item.toast-warning { border-left-color: var(--brand-secondary); }
.toast-item.toast-error { border-left-color: var(--brand-danger); }

.toast-icon {
    font-size: 16px;
    flex-shrink: 0;
}

@keyframes toastSlideIn {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

@keyframes toastFadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
}
```

### 11.6 弹窗 JS

在 `game.js` 中追加：

```javascript
/* ========================================
   通用弹窗系统
   ======================================== */

// --- 确认弹窗 ---
let confirmCallback = null;

function showConfirm(title, message) {
    return new Promise((resolve) => {
        confirmCallback = resolve;
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmModal').style.display = 'flex';
    });
}

function closeConfirm(result) {
    document.getElementById('confirmModal').style.display = 'none';
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
}

// --- Toast 提示 ---
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const icons = { info: '⚙️', success: '✅', warning: '⚠️', error: '❌' };
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '⚙️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration);
}

// --- 温馨提示弹窗 ---
function showWarmTip(content) {
    document.getElementById('warmTipContent').innerHTML = `<p>${content}</p>`;
    document.getElementById('warmTipModal').style.display = 'flex';
}

function closeWarmTip() {
    document.getElementById('warmTipModal').style.display = 'none';
}

// 温馨提示触发场景
const WARM_TIP_SCENARIOS = {
    firstEnter: '欢迎来到死亡战壕！在这里你将作为一名精英战士，在各种战场上执行危险任务。祝你好运！',
    firstLobby: '别忘了检查你的装备再上战场！前往仓库确认出战武器和弹药是否充足。',
    emptyInventory: '你的仓库是空的，去黑市看看吧！也许能淘到好装备。',
    noCoins: '金币不足，快去战斗获取更多金币！完成任务也能获得丰厚奖励。',
    noAmmo: '弹药已耗尽！切换武器或前往弹药库补给。战场上击杀敌人也可能掉落弹药。',
    armorBroken: '你的护甲已经损坏，建议尽快更换！前往黑市购买新的护甲。'
};

function triggerWarmTip(scenario) {
    const content = WARM_TIP_SCENARIOS[scenario];
    if (content) showWarmTip(content);
}

// --- 错误弹窗 ---
function showError(message) {
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorModal').style.display = 'flex';
}

function closeError() {
    document.getElementById('errorModal').style.display = 'none';
}
```

---

## 十二、新手教程覆盖层

**操作**: 替换现有 `#tutorialPanel`（`index.html` 第 1159-1190 行）为新的覆盖层教程系统。

### 12.1 HTML 替换（第 1159-1190 行）

用以下 HTML 替换整个 `#tutorialPanel`：

```html
    <div id="tutorialOverlay" style="display:none;">
        <!-- 半透明背景 -->
        <div class="tutorial-backdrop"></div>

        <!-- 教程步骤 -->
        <div class="tutorial-steps-container" id="tutorialStepsContainer">
            <!-- 步骤 1 -->
            <div class="tutorial-step-item" data-step="1">
                <div class="tutorial-tooltip tutorial-tooltip-center">
                    <div class="tooltip-arrow tooltip-arrow-down"></div>
                    <div class="tooltip-content">
                        <h3>欢迎来到死亡战壕！</h3>
                        <p>这是一款2D俯视角军事射击游戏。接下来将为你介绍基本操作。</p>
                    </div>
                </div>
            </div>
            <!-- 步骤 2 -->
            <div class="tutorial-step-item" data-step="2">
                <div class="tutorial-highlight tutorial-highlight-wasd"></div>
                <div class="tutorial-tooltip tutorial-tooltip-left-bottom">
                    <div class="tooltip-arrow tooltip-arrow-up"></div>
                    <div class="tooltip-content">
                        <h3>WASD 控制移动</h3>
                        <p>使用 W/A/S/D 或方向键控制角色移动。支持8方向流畅移动。</p>
                    </div>
                </div>
            </div>
            <!-- 步骤 3 -->
            <div class="tutorial-step-item" data-step="3">
                <div class="tutorial-highlight tutorial-highlight-canvas"></div>
                <div class="tutorial-tooltip tutorial-tooltip-center">
                    <div class="tooltip-arrow tooltip-arrow-down"></div>
                    <div class="tooltip-content">
                        <h3>鼠标右键射击</h3>
                        <p>鼠标瞄准，右键发射子弹。按空格键切换连发模式。</p>
                    </div>
                </div>
            </div>
            <!-- 步骤 4 -->
            <div class="tutorial-step-item" data-step="4">
                <div class="tutorial-highlight tutorial-highlight-weapon"></div>
                <div class="tutorial-tooltip tutorial-tooltip-right-bottom">
                    <div class="tooltip-arrow tooltip-arrow-up"></div>
                    <div class="tooltip-content">
                        <h3>按 1/2 切换武器</h3>
                        <p>按数字键 1、2、3 快速切换武器。手枪适合近距离，步枪是全能选择。</p>
                    </div>
                </div>
            </div>
            <!-- 步骤 5 -->
            <div class="tutorial-step-item" data-step="5">
                <div class="tutorial-highlight tutorial-highlight-center"></div>
                <div class="tutorial-tooltip tutorial-tooltip-center">
                    <div class="tooltip-arrow tooltip-arrow-down"></div>
                    <div class="tooltip-content">
                        <h3>Shift + WASD 使用道具</h3>
                        <p>按住 Shift 显示物资圆盘，再按 W/A/S/D 使用对应道具。</p>
                    </div>
                </div>
            </div>
            <!-- 步骤 6 -->
            <div class="tutorial-step-item" data-step="6">
                <div class="tutorial-highlight tutorial-highlight-settings"></div>
                <div class="tutorial-tooltip tutorial-tooltip-right-top">
                    <div class="tooltip-arrow tooltip-arrow-left"></div>
                    <div class="tooltip-content">
                        <h3>打开快捷面板</h3>
                        <p>点击右上角 ☰ 按钮打开快捷面板，可以暂停游戏、返回大厅等。</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 导航控制 -->
        <div class="tutorial-nav-bar">
            <div class="tutorial-progress-dots" id="tutorialDots">
                <span class="dot active"></span>
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
            </div>
            <div class="tutorial-nav-btns">
                <button class="menu-btn tertiary" onclick="skipTutorial()">跳过</button>
                <button class="menu-btn tertiary" id="tutorialPrevBtn" onclick="prevTutorialStep()" style="display:none;">上一步</button>
                <button class="menu-btn primary" id="tutorialNextBtn" onclick="nextTutorialStep()">下一步</button>
            </div>
        </div>
    </div>
```

### 12.2 教程 CSS

```css
/* ========================================
   新手教程覆盖层
   ======================================== */

.tutorial-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    z-index: 10000;
}

.tutorial-steps-container {
    position: fixed;
    inset: 0;
    z-index: 10001;
    pointer-events: none;
}

.tutorial-step-item {
    position: absolute;
    inset: 0;
    display: none;
    pointer-events: auto;
}

.tutorial-step-item.active {
    display: flex;
}

/* 高亮区域（镂空） */
.tutorial-highlight {
    position: absolute;
    background: rgba(0, 0, 0, 0.75);
    z-index: -1;
}

.tutorial-highlight-wasd {
    bottom: 80px;
    left: 20px;
    width: 200px;
    height: 160px;
    border: 2px solid var(--brand-accent);
    border-radius: var(--radius-md);
    box-shadow: var(--glow-accent);
    animation: highlightPulse 2s ease-in-out infinite;
}

.tutorial-highlight-canvas {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    height: 200px;
    border: 2px solid var(--brand-accent);
    border-radius: var(--radius-md);
    box-shadow: var(--glow-accent);
    animation: highlightPulse 2s ease-in-out infinite;
}

.tutorial-highlight-weapon {
    bottom: 20px;
    right: 20px;
    width: 250px;
    height: 100px;
    border: 2px solid var(--brand-accent);
    border-radius: var(--radius-md);
    box-shadow: var(--glow-accent);
    animation: highlightPulse 2s ease-in-out infinite;
}

.tutorial-highlight-center {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 250px;
    height: 250px;
    border: 2px solid var(--brand-accent);
    border-radius: 50%;
    box-shadow: var(--glow-accent);
    animation: highlightPulse 2s ease-in-out infinite;
}

.tutorial-highlight-settings {
    top: 20px;
    right: 20px;
    width: 60px;
    height: 60px;
    border: 2px solid var(--brand-accent);
    border-radius: var(--radius-md);
    box-shadow: var(--glow-accent);
    animation: highlightPulse 2s ease-in-out infinite;
}

@keyframes highlightPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(0, 255, 136, 0.3); }
    50% { box-shadow: 0 0 20px rgba(0, 255, 136, 0.6); }
}

/* 提示气泡 */
.tutorial-tooltip {
    position: absolute;
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    padding: 20px;
    min-width: 280px;
    max-width: 380px;
    box-shadow: var(--shadow-deep);
    animation: tooltipFadeIn 0.3s ease-out;
}

.tutorial-tooltip h3 {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-accent);
    margin-bottom: 8px;
    font-weight: 700;
}

.tutorial-tooltip p {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
}

/* Tooltip 定位 */
.tutorial-tooltip-center {
    top: 30%;
    left: 50%;
    transform: translateX(-50%);
}

.tutorial-tooltip-left-bottom {
    bottom: 260px;
    left: 240px;
}

.tutorial-tooltip-right-bottom {
    bottom: 140px;
    right: 290px;
}

.tutorial-tooltip-right-top {
    top: 30px;
    right: 100px;
}

/* Tooltip 箭头 */
.tooltip-arrow {
    position: absolute;
    width: 0;
    height: 0;
}

.tooltip-arrow-down {
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-bottom: 10px solid var(--color-border-strong);
}

.tooltip-arrow-up {
    bottom: -10px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 10px solid var(--color-border-strong);
}

.tooltip-arrow-left {
    left: -10px;
    top: 50%;
    transform: translateY(-50%);
    border-top: 10px solid transparent;
    border-bottom: 10px solid transparent;
    border-right: 10px solid var(--color-border-strong);
}

@keyframes tooltipFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* 导航栏 */
.tutorial-nav-bar {
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10002;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.tutorial-progress-dots {
    display: flex;
    gap: 8px;
}

.tutorial-progress-dots .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
}

.tutorial-progress-dots .dot.active {
    background: var(--brand-accent);
    border-color: var(--brand-accent);
    box-shadow: 0 0 6px rgba(0, 255, 136, 0.4);
}

.tutorial-progress-dots .dot.completed {
    background: var(--brand-primary);
    border-color: var(--brand-primary);
}

.tutorial-nav-btns {
    display: flex;
    gap: 10px;
}
```

### 12.3 教程 JS

在 `game.js` 中追加（同时替换现有的 `showTutorial`, `nextTutorial`, `prevTutorial` 函数）：

```javascript
/* ========================================
   新手教程覆盖层系统
   ======================================== */

let currentTutorialStep = 0;
const TOTAL_TUTORIAL_STEPS = 6;

function showTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'block';
    currentTutorialStep = 0;
    updateTutorialStep();
}

function updateTutorialStep() {
    const steps = document.querySelectorAll('.tutorial-step-item');
    const dots = document.querySelectorAll('.tutorial-progress-dots .dot');

    steps.forEach((step, i) => {
        step.classList.toggle('active', i === currentTutorialStep);
    });

    dots.forEach((dot, i) => {
        dot.classList.remove('active', 'completed');
        if (i === currentTutorialStep) dot.classList.add('active');
        else if (i < currentTutorialStep) dot.classList.add('completed');
    });

    document.getElementById('tutorialPrevBtn').style.display =
        currentTutorialStep > 0 ? 'inline-flex' : 'none';

    const nextBtn = document.getElementById('tutorialNextBtn');
    if (currentTutorialStep === TOTAL_TUTORIAL_STEPS - 1) {
        nextBtn.textContent = '完成';
    } else {
        nextBtn.textContent = '下一步';
    }
}

function nextTutorialStep() {
    if (currentTutorialStep < TOTAL_TUTORIAL_STEPS - 1) {
        currentTutorialStep++;
        updateTutorialStep();
    } else {
        completeTutorial();
    }
}

function prevTutorialStep() {
    if (currentTutorialStep > 0) {
        currentTutorialStep--;
        updateTutorialStep();
    }
}

function skipTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'none';
}

function completeTutorial() {
    document.getElementById('tutorialOverlay').style.display = 'none';
    showToast('准备就绪！你可以开始战斗了。', 'success');
    // 标记教程已完成
    localStorage.setItem('deathTrench_tutorial_completed', 'true');
}
```

---

## 十三、存档系统 (#saveManagerPanel)

**HTML 位置**: `index.html` 第 1192-1352 行

### 13.1 说明

存档管理面板已有完整的 HTML 结构（Modal 形式、4个 Tab、5个存档槽、备份列表、导入导出）。仅需 CSS 升级。

### 13.2 CSS 升级

```css
/* ========================================
   存档管理系统
   ======================================== */

#saveManagerPanel.panel-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5000;
}

#saveManagerPanel .panel-modal-content {
    width: min(900px, 92%);
    max-height: 90vh;
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-deep);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.panel-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--color-border);
}

.panel-modal-header h2 {
    font-family: var(--font-body);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-primary);
}

.close-btn {
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
}

.close-btn:hover {
    color: var(--color-text-primary);
    border-color: var(--brand-danger);
    background: rgba(204, 51, 51, 0.15);
}

/* Tab 栏 */
.save-manager-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 24px 0;
    border-bottom: 1px solid var(--color-border-subtle);
}

.save-tab {
    padding: 10px 20px;
    background: transparent;
    color: var(--color-text-muted);
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all var(--transition-fast);
}

.save-tab.active {
    color: var(--color-text-primary);
    border-bottom-color: var(--brand-primary-light);
}

.save-tab:hover:not(.active) {
    color: var(--color-text-secondary);
}

/* Tab 内容 */
.save-tab-content {
    display: none;
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
}

.save-tab-content.active {
    display: block;
}

/* 存档槽位卡片 */
.slot-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}

.slot-card {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px;
    transition: all var(--transition-fast);
}

.slot-card:hover {
    border-color: var(--brand-primary-light);
}

.slot-num {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--brand-accent);
    margin-bottom: 8px;
}

.slot-body {
    min-height: 60px;
}

.slot-content {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-secondary);
    line-height: 1.5;
}

.slot-empty {
    color: var(--color-text-muted);
    font-style: italic;
}

.slot-actions-row {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border-subtle);
}

.slot-action-btn {
    flex: 1;
    padding: 6px;
    background: var(--color-surface);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 14px;
    transition: all var(--transition-fast);
    text-align: center;
}

.slot-action-btn:hover:not(.danger) {
    border-color: var(--color-border);
    color: var(--color-text-primary);
}

/* 备份列表 */
.slot-info {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin-bottom: 12px;
}

.backup-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
}

.slot-item {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: 12px;
}

.slot-header {
    font-family: var(--font-display);
    font-size: 12px;
    color: var(--color-text-accent);
    margin-bottom: 6px;
}

/* 导入导出 */
.import-section,
.export-section {
    padding: 16px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    margin-bottom: 16px;
}

.import-label,
.export-label {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 6px;
}

.import-desc,
.export-desc {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
    margin-bottom: 12px;
}

/* 底部操作栏 */
.panel-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 24px;
    border-top: 1px solid var(--color-border-subtle);
}
```

---

## 十五、个人信息面板 (#personalInfoPanel)

**HTML 位置**: `index.html` 第 801-860 行

### 14.1 CSS 升级

```css
/* ========================================
   个人信息面板
   ======================================== */

.personal-info-content {
    padding: 20px;
}

.pi-avatar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
}

.pi-avatar {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
    background: var(--color-bg-card);
    border: 2px solid var(--brand-primary-light);
    border-radius: 12px; /* 六角效果用 clip-path 或直接用 border-radius */
    clip-path: polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
}

.pi-title-badge {
    font-size: 13px;
    color: var(--brand-secondary);
    font-family: var(--font-display);
    font-weight: 600;
}

.pi-name-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
}

.pi-name {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary);
    font-family: var(--font-body);
}

.pi-edit-btn {
    background: transparent;
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    cursor: pointer;
    font-size: 14px;
    transition: all var(--transition-fast);
}

.pi-edit-btn:hover {
    border-color: var(--brand-primary-light);
}

.pi-name-edit {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-bottom: 16px;
}

.pi-name-input {
    padding: 8px 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: 16px;
    outline: none;
    width: 200px;
}

.pi-name-input:focus {
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.2);
}

.pi-save-btn,
.pi-cancel-btn {
    padding: 8px 16px;
    font-size: 13px;
    font-family: var(--font-body);
}

/* 统计卡片网格 */
.pi-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
}

.pi-stat-card {
    padding: 16px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    text-align: center;
    transition: all var(--transition-fast);
}

.pi-stat-card:hover {
    border-color: var(--color-border);
}

.pi-stat-icon {
    font-size: 24px;
    margin-bottom: 6px;
}

.pi-stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary);
    font-family: var(--font-display);
}

.pi-stat-label {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-top: 4px;
    font-family: var(--font-body);
}

/* 称号信息 */
.pi-title-info {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
}

.pi-title-label {
    color: var(--color-text-muted);
}

.pi-title-value {
    color: var(--brand-secondary);
    font-weight: 600;
}

.pi-title-hint {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-muted);
    margin-bottom: 12px;
}

/* 徽章网格 */
.pi-badge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 10px;
}

.badge-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 8px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
}

.badge-item:hover {
    border-color: var(--color-border);
}

.badge-item.unlocked {
    border-color: var(--brand-accent);
}

.badge-item.locked {
    opacity: 0.4;
    filter: grayscale(1);
}

.badge-icon {
    font-size: 24px;
}

.badge-name {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-align: center;
    font-family: var(--font-body);
}
```

---

## 十六、信箱系统 (#mailPanel)

**HTML 位置**: `index.html` 第 1493-1537 行

### 15.1 CSS 升级

```css
/* ========================================
   信箱系统
   ======================================== */

#mailPanel .panel-modal-content {
    width: min(960px, 92%);
    max-height: 85vh;
}

.mail-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 24px;
    border-bottom: 1px solid var(--color-border-subtle);
}

.mail-tab {
    padding: 12px 24px;
    background: transparent;
    color: var(--color-text-muted);
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 14px;
    transition: all var(--transition-fast);
}

.mail-tab.active {
    color: var(--color-text-primary);
    border-bottom-color: var(--brand-primary-light);
}

.mail-tab:hover:not(.active) {
    color: var(--color-text-secondary);
}

.mail-panel-body {
    flex: 1;
    overflow-y: auto;
}

.mail-list {
    border-right: 1px solid var(--color-border-subtle);
    overflow-y: auto;
    max-height: 480px;
}

.mail-list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid var(--color-border-subtle);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-secondary);
}

.mail-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-border-subtle);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-family: var(--font-body);
}

.mail-item:hover {
    background: var(--color-bg-hover);
}

.mail-item.active {
    background: rgba(74, 93, 35, 0.15);
    border-left: 3px solid var(--brand-primary-light);
}

.mail-item.unread {
    border-left: 3px solid var(--brand-accent);
}

.mail-item .mail-sender {
    font-size: 13px;
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mail-item .mail-subject {
    font-size: 12px;
    color: var(--color-text-secondary);
    flex: 2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mail-item .mail-time {
    font-size: 11px;
    color: var(--color-text-muted);
    flex-shrink: 0;
    font-family: var(--font-display);
}

.mail-reader {
    padding: 20px;
    min-height: 480px;
}

.mail-reader .mail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-muted);
    font-family: var(--font-body);
}

.mail-reader .mail-detail-subject {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 8px;
    font-family: var(--font-body);
}

.mail-reader .mail-detail-sender {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-bottom: 16px;
    font-family: var(--font-body);
}

.mail-reader .mail-detail-body {
    font-size: 14px;
    color: var(--color-text-secondary);
    line-height: 1.8;
    font-family: var(--font-body);
}

/* 编写区域 */
.mail-compose-area label {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--color-text-muted);
}

.mail-compose-area input,
.mail-compose-area textarea {
    width: 100%;
    margin-top: 6px;
    padding: 10px 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: 14px;
    outline: none;
    transition: border-color var(--transition-fast);
}

.mail-compose-area input:focus,
.mail-compose-area textarea:focus {
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.15);
}
```

---

## 十六、称号详情弹窗 (#titleDetailModal)

**HTML 位置**: `index.html` 第 862-883 行

### 16.1 CSS 升级

```css
/* ========================================
   称号详情弹窗
   ======================================== */

#titleDetailModal.modal-panel {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5001;
}

.modal-panel-inner {
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 24px;
    min-width: 380px;
    max-width: 90vw;
    box-shadow: var(--shadow-deep);
    animation: modalSlideIn 0.3s ease-out;
}

.modal-panel-inner h2.modal-title {
    font-family: var(--font-body);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 16px;
}

#titleDetailBadge {
    font-size: 48px;
    text-align: center;
    margin: 16px 0;
}

.modal-section {
    margin-bottom: 12px;
}

.modal-label {
    font-size: 12px;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
    font-family: var(--font-display);
}

.modal-value {
    font-size: 14px;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    line-height: 1.5;
}

.modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border-subtle);
}
```

---

## 十八、开发者工具箱密码弹窗 (#toolsPromptOverlay)

**HTML 位置**: `index.html` 第 1541-1552 行

### 17.1 CSS 升级

```css
/* ========================================
   开发者工具箱密码弹窗
   ======================================== */

.tools-prompt-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.tools-prompt-box {
    background: var(--color-bg-panel);
    border: 2px solid var(--brand-danger);
    border-radius: var(--radius-lg);
    padding: 32px;
    min-width: 360px;
    text-align: center;
    box-shadow: var(--shadow-deep), 0 0 20px rgba(204, 51, 51, 0.2);
    animation: modalSlideIn 0.3s ease-out;
}

.tools-prompt-box h2 {
    font-family: var(--font-body);
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 8px;
}

.tools-prompt-box > p {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-bottom: 16px;
}

.tools-prompt-error {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--brand-danger);
    margin-bottom: 12px;
    min-height: 20px;
}

.tools-prompt-box input[type="password"] {
    width: 100%;
    padding: 12px 16px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: 16px;
    outline: none;
    margin-bottom: 16px;
    text-align: center;
    letter-spacing: 4px;
}

.tools-prompt-box input[type="password"]:focus {
    border-color: var(--brand-accent);
    box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.15);
}

.tools-prompt-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
}
```

---

## 十八、游戏结束面板 (#gameOver)

**HTML 位置**: `index.html` 第 1148-1157 行

### 18.1 CSS 升级

```css
/* ========================================
   游戏结束面板
   ======================================== */

#gameOver {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 8000;
    animation: fadeIn 0.5s ease;
}

#gameOver h2 {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 900;
    color: var(--brand-danger);
    margin-bottom: 24px;
    text-shadow: 0 0 20px rgba(204, 51, 51, 0.3);
    letter-spacing: 4px;
}

.score-display {
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 24px 40px;
    margin-bottom: 24px;
    text-align: center;
}

.score-display div {
    font-family: var(--font-body);
    font-size: 16px;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
}

.score-display div:last-child {
    margin-bottom: 0;
}

.score-display span {
    color: var(--color-text-primary);
    font-weight: 700;
    font-family: var(--font-display);
}

#gameOver .menu-btn {
    padding: 14px 32px;
    font-size: 16px;
    margin: 0 8px;
}
```

---

## 二十、右侧侧边栏 (已完成)

右侧侧边栏（`#rightSidebar`，index.html 第 1010-1102 行）已在之前的版本迭代中完成了样式升级，**无需额外改动**。

如有需要，可检查以下样式是否已应用：
- `backdrop-filter: blur(8px)` 半透明效果
- 军事色调标签页
- 统一的 `var(--color-border)` 边框色
- `var(--font-body)` 字体

---

## 二十一、游戏内 HUD 改动

**HTML 位置**: `index.html` 第 15-140 行（gameContainer 内部）

### 20.1 武器信息区域

```css
/* 武器信息块 */
#weaponBlock {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    padding: 8px 16px;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
}

#ammoBig {
    font-family: var(--font-display);
    color: var(--color-text-primary);
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

.ammo-slash {
    color: var(--color-text-muted);
}

#weaponNameBig {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--color-text-secondary);
}

/* 自动射击按钮 */
.auto-fire-status {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 12px;
    cursor: pointer;
    font-family: var(--font-body);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--color-text-muted);
    transition: all var(--transition-fast);
}

.auto-fire-status.on {
    background: rgba(0, 255, 136, 0.15);
    border-color: var(--brand-accent);
    color: var(--brand-accent);
}
```

### 20.2 受击红色闪烁

```css
/* 受击闪烁 - 由 JS 控制 opacity */
#damageFlash.damage-flash {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 40%, rgba(204, 51, 51, 0.4) 100%);
    pointer-events: none;
    z-index: 50;
    animation: damageFlashAnim 0.3s ease-out;
}

@keyframes damageFlashAnim {
    0% { opacity: 1; }
    100% { opacity: 0; }
}
```

### 20.3 持久红色暗角

```css
/* 暗角随血量变化 - JS 动态调整 opacity */
#damageVignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 30%, rgba(204, 51, 51, 0.15) 100%);
    pointer-events: none;
    z-index: 49;
}
```

### 20.4 小地图

```css
/* 小地图 - 保持现有内联样式，确保一致性 */
#minimap {
    border: 1px solid rgba(74, 93, 35, 0.4);
    border-radius: var(--radius-md);
}
```

### 20.5 血条

```css
/* 血条 - 保持现有渐变，更新发光色 */
.health-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
}

.health-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--brand-danger), #ff6644, var(--brand-accent));
    border-radius: 4px;
    transition: width 0.3s ease;
    box-shadow: 0 0 8px rgba(0, 255, 136, 0.3);
}
```

### 20.6 物资圆盘

```css
/* 物资圆盘 - 保持现有布局，更新边框色 */
#itemWheel {
    /* 确保 border 颜色使用变量 */
    border: 2px solid var(--color-border-strong);
}

.wheel-slot {
    border: 1px solid var(--color-border-subtle);
    transition: all var(--transition-fast);
}

.wheel-slot:hover {
    border-color: var(--brand-accent);
    box-shadow: var(--glow-accent);
}
```

---

## 二十一、通用面板样式

```css
/* ========================================
   通用面板基础样式
   ======================================== */

.panel {
    display: none;
    padding: 20px;
    animation: panelOpen 0.3s ease-out;
}

.panel.active {
    display: block;
}

@keyframes panelOpen {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

.panel-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--color-border);
}

.panel-title-bar h2 {
    font-family: var(--font-body);
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text-primary);
}

.panel-gold {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--brand-secondary);
    font-weight: 600;
}
```

---

## 二十三、全局动效规格

以下是所有面板和组件应遵循的动效规范：

| 组件 | 动效 | 时长 | 缓动函数 |
|------|------|------|----------|
| 面板打开 | `translateY(-20px)` → `translateY(0)` | 0.3s | ease-out |
| 按钮悬停 | `translateY(-1px)` + 发光阴影 | 0.15s | ease |
| 按钮按下 | `scale(0.97)` | 即时 | — |
| Tab 切换 | 内容淡入 | 0.2s | ease |
| Toast 通知 | 从顶部滑入 + 淡出 | 3s 总计 | ease-out / ease-in |
| 弹窗打开 | 从上方滑入 + 淡入 | 0.3s | ease-out |
| 弹窗关闭 | 即时隐藏 | — | — |
| 抽奖卡片翻转 | `rotateY(90deg)` → `rotateY(0deg)` + 缩放 | 0.6s | ease-out |
| 传说光效 | 脉冲发光 | 2s | ease-in-out infinite |
| 角色光环 | 缩放脉冲 | 2-3s | ease-in-out infinite |
| 高亮区域 | 发光脉冲 | 2s | ease-in-out infinite |
| 稀有度闪烁(传说) | 盒阴影脉冲 | 3s | ease-in-out infinite |

---

## 二十四、执行优先级

以下是建议的执行顺序，按优先级从高到低排列：

1. **一、全局样式改动** — CSS 变量补充 + 颜色替换规则 + 按钮系统（基础，影响全局）
2. **二十一、通用面板样式** — `.panel` 基础类
3. **二、主菜单** — Logo + 按钮 + 扫描线（用户第一印象）
4. **三、大厅界面** — Header + 功能网格 + 角色光环 + 底部栏
5. **四、战备中心** — 地图卡片 + 难度按钮 + 物资列表 + 开始按钮
6. **五、仓库面板** — 重大结构调整（三栏布局 + 弹格栏）
7. **六、黑市面板** — 重大结构调整（改装树 + 阵营面板 + Tab）
8. **七、改装面板** — CSS 升级
9. **八、皮肤商店** — CSS 升级（预览面板 + 皮肤卡片 + 稀有度系统）
10. **九、皮肤数据定义** — game.js 中的完整皮肤数据（JS 关键数据）
11. **十、抽奖池** — CSS 动画 + JS 抽奖池数据
12. **十一、通用弹窗组件** — HTML + CSS + JS（确认/Toast/温馨提示/错误弹窗）
13. **十二、新手教程覆盖层** — HTML 替换 + CSS + JS（6步教程）
14. **十三、存档系统** — CSS 升级
15. **十四、个人信息面板** — CSS 升级
16. **十五、信箱系统** — CSS 升级
17. **十六、称号详情弹窗** — CSS 升级
18. **十七、开发者工具箱密码弹窗** — CSS 升级
19. **十八、游戏结束面板** — CSS 升级
20. **二十、游戏内 HUD 改动** — 武器信息 + 受击效果 + 小地图 + 血条
21. **二十二、全局动效规格** — 验证所有动效是否正确应用
22. **十九、右侧侧边栏** — 无需改动，仅验证
23. **最终测试** — 逐一验证每个面板的功能完整性

---

> **文档结束**
> Code AI 在执行时，请严格按照以上 23 个步骤的顺序进行改动。每个步骤完成后，建议在浏览器中预览效果确认无误后再继续下一步。