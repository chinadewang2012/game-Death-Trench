$appendContent = @"

/* ========================================
   === 全局颜色覆盖 - 军事绿主题 ===
   ======================================== */

.weapon-btn:hover,
.weapon-btn.selected,
.weapon-card.selected,
.weapon-card:hover,
.slot-item:hover,
.slot-item.selected,
.map-card.selected,
.map-card:hover,
.diff-btn.active,
.diff-btn:hover,
.tab-btn.active,
.tab-btn:hover,
.mini-btn:hover {
    border-color: var(--brand-accent-dim) !important;
}

.progress-fill,
.health-fill,
.ammo-fill,
.bar-fill {
    background: var(--brand-primary) !important;
}

.btn-primary,
.btn-blue,
.blue-btn,
.primary-btn {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
    border-color: var(--brand-primary-light) !important;
}

.text-blue,
.blue-text,
.link-text {
    color: var(--brand-primary-light) !important;
}

.panel-header,
.panel-footer,
.modal-header,
.modal-footer,
.card-header,
.card-footer,
.top-bar,
.bottom-bar,
.header-bar,
.footer-bar {
    background: var(--color-bg-panel) !important;
}

/* ========================================
   === 通用按钮系统 - 军事风格覆盖 ===
   ======================================== */

.menu-btn,
.btn-save,
.btn-cancel,
.buy-btn,
.sell-btn,
.mini-btn,
.slot-action-btn,
.mod-buy-btn,
.equip-btn,
.unequip-btn,
.use-btn,
.close-btn,
.action-btn {
    font-family: var(--font-body) !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    cursor: pointer !important;
    transition: all var(--transition-fast) !important;
    position: relative !important;
    overflow: hidden !important;
}

.menu-btn:hover,
.btn-save:hover,
.buy-btn:hover,
.mod-buy-btn:hover,
.equip-btn:hover,
.action-btn:hover {
    transform: translateY(-1px) !important;
    box-shadow: var(--glow-primary) !important;
}

.menu-btn:active,
.btn-save:active,
.buy-btn:active {
    transform: translateY(0) scale(0.97) !important;
}

.menu-btn.primary,
.btn-save,
.buy-btn,
.mod-buy-btn,
.equip-btn,
.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
    color: #fff !important;
    border-color: var(--brand-primary-light) !important;
    box-shadow: 0 2px 4px rgba(74, 93, 35, 0.3) !important;
}

.menu-btn.primary:hover,
.btn-save:hover,
.buy-btn:hover,
.mod-buy-btn:hover,
.equip-btn:hover {
    background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary)) !important;
    box-shadow: var(--glow-primary), 0 4px 8px rgba(74, 93, 35, 0.4) !important;
}

.menu-btn.secondary,
.btn-secondary,
.secondary-btn {
    background: var(--color-surface) !important;
    color: var(--color-text-primary) !important;
    border-color: var(--color-border) !important;
}

.menu-btn.secondary:hover,
.btn-secondary:hover {
    background: var(--color-surface-elevated) !important;
    box-shadow: var(--shadow-card) !important;
}

.menu-btn.tertiary,
.btn-cancel,
.close-btn,
.tertiary-btn {
    background: transparent !important;
    color: var(--color-text-secondary) !important;
    border-color: var(--color-border-subtle) !important;
}

.menu-btn.tertiary:hover,
.btn-cancel:hover,
.close-btn:hover {
    color: var(--color-text-primary) !important;
    border-color: var(--color-border) !important;
    background: var(--color-bg-hover) !important;
}

.menu-btn.danger,
.slot-action-btn.danger,
.btn-danger,
.danger-btn {
    background: rgba(204, 51, 51, 0.15) !important;
    color: var(--brand-danger) !important;
    border-color: rgba(204, 51, 51, 0.3) !important;
}

.menu-btn.danger:hover,
.slot-action-btn.danger:hover,
.btn-danger:hover {
    background: rgba(204, 51, 51, 0.25) !important;
    box-shadow: var(--glow-danger) !important;
}

.sell-btn {
    background: rgba(184, 134, 11, 0.15) !important;
    color: var(--brand-secondary) !important;
    border-color: rgba(184, 134, 11, 0.3) !important;
}

.sell-btn:hover {
    background: rgba(184, 134, 11, 0.25) !important;
    box-shadow: var(--glow-secondary) !important;
}

/* ========================================
   === 圆角统一覆盖 ===
   ======================================== */

.panel,
.card,
.modal,
.modal-panel,
.modal-panel-inner,
.popup-overlay .popup-content,
.confirm-modal,
.toast,
.slot,
.weapon-slot,
.ammo-slot,
.map-card,
.weapon-card,
.skin-card,
.mission-card,
.market-item,
.mod-item,
.supply-item,
.stat-card,
.pi-stat-card,
.faction-card,
.faction-panel,
button,
input,
select,
textarea {
    border-radius: var(--radius-md) !important;
}

.badge,
.tag,
.chip,
.mc-map-tag,
.mkt-tab,
.diff-btn,
.mini-btn,
.slot-action-btn,
.mod-buy-btn,
.equipped-slot {
    border-radius: var(--radius-sm) !important;
}
"@

Add-Content -Path "f:\ai\game\css\style-new-ui.css" -Value $appendContent
Write-Host "Part 1 done"
