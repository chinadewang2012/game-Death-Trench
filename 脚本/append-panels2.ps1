$appendContent = @"

/* ========================================
   === 黑市面板 - 改装树 + 阵营布局 ===
   ======================================== */

.market-main-layout {
    display: flex !important;
    gap: 20px !important;
    padding: 0 20px !important;
    margin-bottom: 16px !important;
}

.market-left-tree {
    flex: 0 0 70% !important;
    min-width: 0 !important;
}

.market-right-faction {
    flex: 0 0 calc(30% - 20px) !important;
}

/* 改装树 */
.mod-tree-container {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    padding: 16px !important;
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
}

.mod-tree-row {
    display: flex !important;
    justify-content: center !important;
    gap: 16px !important;
    width: 100% !important;
}

.mod-tree-node {
    width: 160px !important;
    padding: 12px !important;
    background: var(--color-bg-overlay) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-sm) !important;
    text-align: center !important;
    cursor: pointer !important;
    transition: all var(--transition-fast) !important;
}

.mod-tree-node:hover {
    border-color: var(--brand-primary-light) !important;
    background: var(--color-bg-hover) !important;
}

.mod-tree-node.equipped {
    border-color: var(--brand-accent) !important;
    background: rgba(0, 255, 136, 0.1) !important;
    box-shadow: var(--glow-accent) !important;
}

.mod-node-icon {
    font-size: 24px !important;
    margin-bottom: 4px !important;
}

.mod-node-name {
    font-size: 13px !important;
    color: var(--color-text-primary) !important;
    font-family: var(--font-body) !important;
    font-weight: 600 !important;
}

.mod-node-status {
    font-size: 11px !important;
    color: var(--color-text-muted) !important;
    margin-top: 4px !important;
}

.mod-tree-node.equipped .mod-node-status {
    color: var(--brand-accent) !important;
}

.mod-tree-lines {
    width: 100% !important;
    height: 40px !important;
    flex-shrink: 0 !important;
}

.mod-tree-center {
    display: flex !important;
    justify-content: center !important;
    padding: 16px !important;
}

.mod-tree-weapon-display {
    width: 240px !important;
    height: 140px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    position: relative !important;
}

.mod-tree-weapon-silhouette {
    transform: scale(1.5) !important;
    position: relative !important;
}

.mod-tree-weapon-name {
    margin-top: 30px !important;
    font-size: 14px !important;
    color: var(--color-text-accent) !important;
    font-family: var(--font-body) !important;
    font-weight: 600 !important;
}

/* 阵营面板 */
.faction-card {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    padding: 20px !important;
    text-align: center !important;
}

.faction-icon {
    font-size: 48px !important;
    color: var(--brand-secondary) !important;
    margin-bottom: 8px !important;
    filter: drop-shadow(0 0 8px rgba(184, 134, 11, 0.3)) !important;
}

.faction-name {
    font-size: 16px !important;
    color: var(--color-text-primary) !important;
    font-weight: 700 !important;
    font-family: var(--font-body) !important;
    margin-bottom: 4px !important;
}

.faction-level {
    font-size: 13px !important;
    color: var(--brand-secondary) !important;
    font-family: var(--font-display) !important;
    margin-bottom: 16px !important;
}

.faction-stats {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    margin-top: 12px !important;
}

.faction-stat-row {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
}

.faction-stat-label {
    font-size: 12px !important;
    color: var(--color-text-muted) !important;
    width: 70px !important;
    flex-shrink: 0 !important;
    text-align: right !important;
    font-family: var(--font-body) !important;
}

.faction-stat-bar {
    flex: 1 !important;
    height: 6px !important;
    background: var(--color-surface) !important;
    border-radius: 3px !important;
    overflow: hidden !important;
}

.faction-stat-fill {
    height: 100% !important;
    background: linear-gradient(90deg, var(--brand-primary), var(--brand-accent)) !important;
    border-radius: 3px !important;
    transition: width var(--transition-normal) !important;
}

.faction-stat-value {
    font-size: 12px !important;
    color: var(--brand-accent) !important;
    width: 40px !important;
    text-align: right !important;
    font-family: var(--font-display) !important;
    font-weight: 600 !important;
}

/* 底部 Tab 栏 */
.market-bottom-tabs {
    display: flex !important;
    gap: 4px !important;
    padding: 8px 20px !important;
    background: var(--color-surface) !important;
    border-radius: var(--radius-md) !important;
    margin: 0 20px 16px !important;
}

.mkt-tab {
    flex: 1 !important;
    padding: 10px 12px !important;
    background: transparent !important;
    color: var(--color-text-muted) !important;
    border: 1px solid transparent !important;
    border-radius: var(--radius-sm) !important;
    cursor: pointer !important;
    font-family: var(--font-body) !important;
    font-size: 13px !important;
    transition: all var(--transition-fast) !important;
    text-align: center !important;
}

.mkt-tab.active {
    background: var(--color-bg-hover) !important;
    color: var(--color-text-primary) !important;
    border-color: var(--brand-primary-light) !important;
}

.mkt-tab:hover:not(.active) {
    color: var(--color-text-secondary) !important;
    background: rgba(74, 93, 35, 0.1) !important;
}

/* Tab 内容 */
.market-tab-contents {
    min-height: 200px !important;
    padding: 0 20px 20px !important;
}

.market-tab-content .market-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important;
    gap: 12px !important;
}

.market-tab-content .market-item {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 12px !important;
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    transition: all var(--transition-fast) !important;
}

.market-tab-content .market-item:hover {
    border-color: var(--color-border) !important;
}

.market-item .item-icon {
    font-size: 28px !important;
    width: 40px !important;
    text-align: center !important;
    flex-shrink: 0 !important;
}

.market-item .item-info {
    flex: 1 !important;
    min-width: 0 !important;
}

.market-item .item-name {
    font-size: 14px !important;
    color: var(--color-text-primary) !important;
    font-weight: 600 !important;
    font-family: var(--font-body) !important;
}

.market-item .item-desc {
    font-size: 12px !important;
    color: var(--color-text-muted) !important;
    margin-top: 2px !important;
    font-family: var(--font-body) !important;
}

.market-item .item-price {
    font-size: 13px !important;
    color: var(--brand-secondary) !important;
    font-weight: 600 !important;
    flex-shrink: 0 !important;
    font-family: var(--font-display) !important;
}
"@

Add-Content -Path "f:\ai\game\css\style-new-ui-panels.css" -Value $appendContent
Write-Host "Panels part 2 done"
