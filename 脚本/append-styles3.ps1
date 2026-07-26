$appendContent = @"

/* ========================================
   === 改装面板覆盖 ===
   ======================================== */

.weapon-select-grid .weapon-card {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-sm) !important;
    transition: all var(--transition-fast) !important;
}

.weapon-select-grid .weapon-card:hover {
    border-color: var(--color-border) !important;
    background: var(--color-bg-hover) !important;
}

.weapon-select-grid .weapon-card.selected {
    border-color: var(--brand-accent) !important;
    background: rgba(0, 255, 136, 0.08) !important;
    box-shadow: inset 3px 0 0 var(--brand-accent) !important;
}

.mod-grid .mod-item {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    transition: all var(--transition-fast) !important;
}

.mod-grid .mod-item:hover {
    border-color: var(--brand-primary-light) !important;
}

.mod-grid .mod-item.equipped {
    border-color: var(--brand-accent) !important;
    background: rgba(0, 255, 136, 0.08) !important;
}

.mod-equipped .equipped-slot {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
}

/* ========================================
   === 个人信息/游戏结束覆盖 ===
   ======================================== */

.pi-stat-card,
.stat-card {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
}

.pi-stat-value,
.stat-value {
    color: var(--brand-accent) !important;
    font-family: var(--font-display) !important;
    font-weight: 700 !important;
}

.pi-title-badge,
.title-badge {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
    color: #fff !important;
    border: 1px solid var(--brand-primary-light) !important;
}

.game-over-panel,
.game-over-content,
.result-panel {
    background: var(--color-bg-panel) !important;
    border: 1px solid var(--color-border) !important;
}

.game-over-title,
.result-title {
    color: var(--brand-primary) !important;
    font-family: var(--font-display) !important;
}

/* ========================================
   === 弹窗/Modal 覆盖 ===
   ======================================== */

.popup-overlay .popup-content,
.confirm-modal,
.modal-panel-inner,
.modal-content {
    background: var(--color-bg-panel) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    box-shadow: var(--shadow-deep) !important;
}

.popup-header h2,
.modal-title,
.panel-modal-header h2 {
    color: var(--brand-accent) !important;
    font-family: var(--font-display) !important;
}

.toast,
.toast-notification {
    background: var(--color-bg-panel) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    color: var(--color-text-primary) !important;
    box-shadow: var(--shadow-elevated) !important;
}

.toast.success,
.toast-notification.success {
    border-color: var(--brand-accent) !important;
}

.toast.error,
.toast-notification.error {
    border-color: var(--brand-danger) !important;
}

.toast.warning,
.toast-notification.warning {
    border-color: var(--brand-secondary) !important;
}

/* ========================================
   === 进度条覆盖 ===
   ======================================== */

.progress-bar,
.health-bar,
.ammo-bar,
.stamina-bar,
.exp-bar,
.faction-stat-bar,
.fs-bar {
    border-radius: 3px !important;
    overflow: hidden !important;
}

.progress-fill,
.health-fill,
.ammo-fill,
.stamina-fill,
.exp-fill,
.faction-stat-fill,
.fs-fill {
    background: linear-gradient(90deg, var(--brand-primary), var(--brand-accent)) !important;
    border-radius: 3px !important;
}

/* ========================================
   === 武器剪影通用样式 ===
   ======================================== */

.weapon-silhouette {
    position: relative;
    width: 80px;
    height: 30px;
}

.weapon-silhouette .ws-stock {
    position: absolute;
    left: 0;
    top: 8px;
    width: 18px;
    height: 14px;
    background: #555;
    border-radius: 2px 0 0 2px;
}

.weapon-silhouette .ws-body {
    position: absolute;
    left: 16px;
    top: 6px;
    width: 32px;
    height: 18px;
    background: #666;
    border-radius: 2px;
}

.weapon-silhouette .ws-barrel {
    position: absolute;
    left: 46px;
    top: 10px;
    width: 28px;
    height: 8px;
    background: #555;
    border-radius: 0 2px 2px 0;
}

.weapon-silhouette .ws-magazine {
    position: absolute;
    left: 24px;
    top: 22px;
    width: 12px;
    height: 14px;
    background: #555;
    border-radius: 0 0 2px 2px;
}

.weapon-silhouette .ws-grip {
    position: absolute;
    left: 36px;
    top: 22px;
    width: 8px;
    height: 12px;
    background: #444;
    border-radius: 0 0 2px 2px;
}

.weapon-silhouette .ws-sight {
    position: absolute;
    left: 28px;
    top: 0;
    width: 10px;
    height: 6px;
    background: #777;
    border-radius: 2px 2px 0 0;
}
"@

Add-Content -Path "f:\ai\game\css\style-new-ui.css" -Value $appendContent
Write-Host "Part 3 done"
