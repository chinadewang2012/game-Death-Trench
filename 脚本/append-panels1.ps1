$appendContent = @"

/* ========================================
   === 仓库面板 - 三栏军事布局 ===
   ======================================== */

.inventory-three-col {
    display: flex !important;
    gap: 16px !important;
    padding: 0 20px !important;
    margin-top: 16px !important;
    flex: 1 !important;
    overflow-y: auto !important;
}

.inv-col-left { width: 200px !important; flex-shrink: 0 !important; }
.inv-col-center { flex: 1 !important; min-width: 0 !important; }
.inv-col-right { width: 200px !important; flex-shrink: 0 !important; }

.section-label {
    font-size: 12px !important;
    color: var(--color-text-muted) !important;
    text-transform: uppercase !important;
    letter-spacing: 2px !important;
    margin-bottom: 12px !important;
    font-family: var(--font-display) !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding-bottom: 8px !important;
    border-bottom: 1px solid var(--color-border-subtle) !important;
}

/* 武器出战槽位 */
.weapon-loadout-slot {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    padding: 12px !important;
    margin-bottom: 10px !important;
    cursor: pointer !important;
    transition: all var(--transition-fast) !important;
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 6px !important;
}

.weapon-loadout-slot.active {
    border-color: var(--brand-primary-light) !important;
    background: rgba(74, 93, 35, 0.15) !important;
    box-shadow: var(--glow-primary) !important;
}

.weapon-loadout-slot:hover {
    border-color: var(--color-border) !important;
}

.slot-type-label {
    font-size: 11px !important;
    color: var(--color-text-muted) !important;
    text-transform: uppercase !important;
    letter-spacing: 1px !important;
    font-family: var(--font-display) !important;
}

.slot-weapon-icon { font-size: 28px !important; }

.slot-weapon-name {
    font-size: 14px !important;
    color: var(--color-text-primary) !important;
    font-weight: 600 !important;
    font-family: var(--font-body) !important;
}

.slot-weapon-ammo {
    font-size: 12px !important;
    color: var(--color-text-accent) !important;
    font-family: var(--font-display) !important;
}

/* 武器库网格 */
.weapon-library-grid {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 10px !important;
}

/* 弹药背包 */
.ammo-backpack-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
}

.ammo-backpack-item {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 10px 12px !important;
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-sm) !important;
}

.ammo-dot {
    width: 10px !important;
    height: 10px !important;
    border-radius: 50% !important;
    flex-shrink: 0 !important;
}

.ammo-type-name {
    flex: 1 !important;
    font-size: 13px !important;
    color: var(--color-text-primary) !important;
    font-family: var(--font-body) !important;
}

.ammo-type-count {
    font-size: 13px !important;
    color: var(--color-text-accent) !important;
    font-weight: 600 !important;
    font-family: var(--font-display) !important;
}

/* 底部弹格栏 */
.ammo-slots-bar {
    margin-top: 16px !important;
    padding: 0 20px 16px !important;
    border-top: 1px solid var(--color-border-subtle) !important;
    padding-top: 12px !important;
}

.ammo-slot-row {
    display: flex !important;
    gap: 8px !important;
    margin-top: 8px !important;
}

.ammo-slot {
    flex: 1 !important;
    height: 60px !important;
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-sm) !important;
    position: relative !important;
    overflow: hidden !important;
}

.ammo-slot-fill {
    position: absolute !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    background: linear-gradient(to top, var(--brand-primary-dark), var(--brand-primary)) !important;
    transition: height var(--transition-fast) !important;
}

.ammo-slot-count {
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    font-size: 14px !important;
    font-weight: 700 !important;
    color: var(--color-text-primary) !important;
    font-family: var(--font-display) !important;
    text-shadow: 0 1px 3px rgba(0,0,0,0.8) !important;
    z-index: 1 !important;
}
"@

Add-Content -Path "f:\ai\game\css\style-new-ui-panels.css" -Value $appendContent
Write-Host "Panels part 1 done"
