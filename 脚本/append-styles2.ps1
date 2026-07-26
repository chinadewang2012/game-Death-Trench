$appendContent = @"

/* ========================================
   === 大厅界面覆盖 ===
   ======================================== */

.lobby-top-bar {
    background: var(--color-bg-panel) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border-bottom: 1px solid var(--color-border) !important;
}

.lobby-bottom-nav,
.lobby-bottom {
    background: var(--color-bg-panel) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border-top: 1px solid var(--color-border) !important;
}

.lobby-func-btn {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    font-family: var(--font-body) !important;
    font-size: 14px !important;
    color: var(--color-text-primary) !important;
    transition: all var(--transition-fast) !important;
}

.lobby-func-btn:hover {
    background: var(--color-bg-hover) !important;
    border-color: var(--brand-primary-light) !important;
    transform: translateY(-2px) !important;
    box-shadow: var(--glow-primary) !important;
}

.lobby-func-btn:active {
    transform: translateY(0) scale(0.97) !important;
}

.lobby-char-glow-outer {
    background: radial-gradient(circle, rgba(74, 93, 35, 0.15) 0%, transparent 70%) !important;
}

.lobby-char-glow {
    background: radial-gradient(circle, rgba(74, 93, 35, 0.25) 0%, transparent 70%) !important;
}

/* ========================================
   === 战备中心覆盖 ===
   ======================================== */

.map-card.small {
    border: 2px solid var(--color-border) !important;
    border-radius: var(--radius-sm) !important;
    background: var(--color-bg-card) !important;
}

.map-card.small.selected {
    border-color: var(--brand-primary-light) !important;
    box-shadow: var(--glow-primary) !important;
}

.map-card.small:hover {
    border-color: var(--brand-accent-dim) !important;
    transform: translateY(-2px) !important;
}

.diff-buttons.compact .diff-btn {
    padding: 8px 16px !important;
    font-family: var(--font-body) !important;
    font-size: 13px !important;
    border-radius: var(--radius-sm) !important;
    border: 1px solid var(--color-border) !important;
    background: var(--color-bg-card) !important;
    color: var(--color-text-secondary) !important;
}

.diff-buttons.compact .diff-btn.active {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
    color: #fff !important;
    border-color: var(--brand-primary-light) !important;
    box-shadow: 0 2px 6px rgba(74, 93, 35, 0.4) !important;
}

.diff-buttons.compact .diff-btn:hover:not(.active) {
    border-color: var(--brand-primary-light) !important;
    color: var(--color-text-primary) !important;
}

.supply-item {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-sm) !important;
    transition: all var(--transition-fast) !important;
}

.supply-item:hover {
    border-color: var(--color-border) !important;
    background: var(--color-bg-hover) !important;
}

.start-button {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark)) !important;
    color: #fff !important;
    border: 2px solid var(--brand-primary-light) !important;
    border-radius: var(--radius-md) !important;
    font-family: var(--font-display) !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    letter-spacing: 3px !important;
    box-shadow: 0 4px 12px rgba(74, 93, 35, 0.4) !important;
    transition: all var(--transition-fast) !important;
}

.start-button:hover {
    transform: translateY(-2px) !important;
    box-shadow: var(--glow-primary), 0 6px 20px rgba(74, 93, 35, 0.5) !important;
}

.start-button:active {
    transform: translateY(0) scale(0.98) !important;
}

/* ========================================
   === 存档管理覆盖 ===
   ======================================== */

.save-slot,
.slot-item {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    transition: all var(--transition-fast) !important;
}

.save-slot:hover,
.slot-item:hover {
    border-color: var(--brand-primary-light) !important;
    box-shadow: var(--glow-primary) !important;
}

/* ========================================
   === 任务线卡片覆盖 ===
   ======================================== */

.mission-card {
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    transition: all var(--transition-fast) !important;
}

.mission-card:hover {
    border-color: var(--color-border) !important;
    background: rgba(30, 30, 30, 0.95) !important;
    box-shadow: var(--shadow-card) !important;
}

.mission-card.locked {
    opacity: 0.45 !important;
    cursor: not-allowed !important;
}

.mission-card.completed {
    border-color: rgba(0, 255, 136, 0.2) !important;
}

.mission-card.active {
    border-color: var(--brand-accent) !important;
    box-shadow: 0 0 15px rgba(0, 255, 136, 0.25), inset 0 0 20px rgba(0, 255, 136, 0.03) !important;
    background: rgba(0, 255, 136, 0.04) !important;
}

.mission-banner {
    background: rgba(184, 134, 11, 0.1) !important;
    border: 1px solid rgba(184, 134, 11, 0.3) !important;
    border-radius: var(--radius-md) !important;
    color: var(--brand-secondary-light) !important;
}
"@

Add-Content -Path "f:\ai\game\css\style-new-ui.css" -Value $appendContent
Write-Host "Part 2 done"
