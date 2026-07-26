$appendContent = @"

/* ========================================
   === 皮肤商店样式 ===
   ======================================== */

.skin-tabs {
    display: flex !important;
    gap: 8px !important;
    margin-bottom: 16px !important;
    padding: 0 20px !important;
}

.skin-tabs .tab-btn {
    padding: 10px 20px !important;
    background: var(--color-surface) !important;
    color: var(--color-text-muted) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    cursor: pointer !important;
    font-family: var(--font-body) !important;
    font-size: 14px !important;
    transition: all var(--transition-fast) !important;
}

.skin-tabs .tab-btn.active {
    background: var(--color-bg-hover) !important;
    color: var(--color-text-primary) !important;
    border-color: var(--brand-primary-light) !important;
}

/* 大预览面板 */
.skin-large-preview {
    width: calc(100% - 40px) !important;
    height: 200px !important;
    background: var(--color-bg-card) !important;
    border: 2px solid var(--color-border) !important;
    border-radius: var(--radius-md) !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 0 20px 16px !important;
    position: relative !important;
    overflow: hidden !important;
}

.skin-large-preview::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    background: radial-gradient(ellipse at center, rgba(74, 93, 35, 0.1) 0%, transparent 70%) !important;
    pointer-events: none !important;
}

.skin-preview-weapon {
    position: relative !important;
    z-index: 1 !important;
}

.skin-preview-weapon .weapon-silhouette {
    transform: scale(2) !important;
}

.skin-preview-name {
    margin-top: 50px !important;
    font-size: 16px !important;
    color: var(--color-text-primary) !important;
    font-weight: 600 !important;
    font-family: var(--font-body) !important;
    position: relative !important;
    z-index: 1 !important;
}

.skin-preview-status {
    font-size: 12px !important;
    color: var(--color-text-muted) !important;
    margin-top: 4px !important;
    position: relative !important;
    z-index: 1 !important;
}

/* 皮肤卡片网格 */
.skin-grid {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) !important;
    gap: 12px !important;
    margin-bottom: 16px !important;
    padding: 0 20px !important;
}

.skin-card {
    background: var(--color-bg-card) !important;
    border: 2px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    padding: 12px !important;
    text-align: center !important;
    cursor: pointer !important;
    transition: all var(--transition-fast) !important;
    position: relative !important;
    overflow: hidden !important;
}

.skin-card:hover {
    transform: scale(1.02) !important;
    border-color: var(--color-border) !important;
    box-shadow: var(--shadow-card) !important;
}

.skin-card.equipped {
    border-color: var(--brand-accent) !important;
    box-shadow: var(--glow-accent) !important;
}

.skin-card.owned::after {
    content: '✓' !important;
    position: absolute !important;
    top: 6px !important;
    right: 6px !important;
    width: 18px !important;
    height: 18px !important;
    background: var(--brand-accent) !important;
    color: #000 !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-size: 10px !important;
    font-weight: bold !important;
}

.skin-card .weapon-silhouette {
    transform: scale(0.8) !important;
    margin: 0 auto 8px !important;
}

.skin-card .skin-card-name {
    font-size: 13px !important;
    color: var(--color-text-primary) !important;
    font-weight: 600 !important;
    font-family: var(--font-body) !important;
}

.skin-card .skin-card-rarity {
    font-size: 11px !important;
    margin-top: 4px !important;
    font-weight: 600 !important;
    font-family: var(--font-display) !important;
}

.skin-card .skin-card-price {
    font-size: 12px !important;
    color: var(--brand-secondary) !important;
    margin-top: 6px !important;
    font-family: var(--font-display) !important;
}

/* 稀有度颜色 */
.rarity-common .skin-card-rarity { color: #9ca3af !important; }
.rarity-rare .skin-card-rarity { color: #60a5fa !important; }
.rarity-epic .skin-card-rarity { color: #c084fc !important; }
.rarity-legendary .skin-card-rarity { color: #fbbf24 !important; }

.rarity-common { border-color: rgba(156, 163, 175, 0.3) !important; }
.rarity-rare { border-color: rgba(96, 165, 250, 0.3) !important; }
.rarity-epic { border-color: rgba(192, 132, 252, 0.3) !important; }
.rarity-legendary { border-color: rgba(251, 191, 36, 0.3) !important; }

.rarity-legendary {
    animation: legendaryCardShimmer 3s ease-in-out infinite !important;
}

@keyframes legendaryCardShimmer {
    0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.2) !important; }
    50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.4) !important; }
}

/* 皮肤配色方案 */
.skin-default .ws-body { background: #666 !important; }
.skin-default .ws-barrel { background: #555 !important; }
.skin-default .ws-magazine { background: #555 !important; }
.skin-default .ws-stock { background: #555 !important; }
.skin-default .ws-grip { background: #444 !important; }
.skin-default .ws-sight { background: #777 !important; }

.skin-carbon .ws-body { background: repeating-linear-gradient(45deg, #333, #333 3px, #444 3px, #444 6px) !important; }
.skin-carbon .ws-barrel { background: #3a3a3a !important; }
.skin-carbon .ws-magazine { background: #2d2d2d !important; }
.skin-carbon .ws-stock { background: repeating-linear-gradient(45deg, #333, #333 3px, #444 3px, #444 6px) !important; }
.skin-carbon .ws-grip { background: #2a2a2a !important; }
.skin-carbon .ws-sight { background: #4a4a4a !important; }

.skin-gold .ws-body { background: linear-gradient(135deg, #b8860b, #daa520, #ffd700, #daa520, #b8860b) !important; }
.skin-gold .ws-barrel { background: linear-gradient(180deg, #daa520, #ffd700) !important; }
.skin-gold .ws-magazine { background: linear-gradient(180deg, #b8860b, #daa520) !important; }
.skin-gold .ws-stock { background: linear-gradient(135deg, #b8860b, #ffd700) !important; }
.skin-gold .ws-grip { background: #8f6808 !important; }
.skin-gold .ws-sight { background: linear-gradient(180deg, #ffd700, #daa520) !important; }

.skin-camo .ws-body { background: linear-gradient(135deg, #4a5d23 25%, #3a4a1b 25%, #3a4a1b 50%, #5c7230 50%, #5c7230 75%, #4a5d23 75%) !important; }
.skin-camo .ws-barrel { background: #4a5d23 !important; }
.skin-camo .ws-magazine { background: #3a4a1b !important; }
.skin-camo .ws-stock { background: linear-gradient(90deg, #4a5d23, #5c7230, #3a4a1b) !important; }
.skin-camo .ws-grip { background: #2d3a14 !important; }
.skin-camo .ws-sight { background: #5c7230 !important; }

.skin-neon .ws-body { background: #0a2a2a !important; box-shadow: 0 0 8px rgba(0, 255, 255, 0.5) !important; }
.skin-neon .ws-barrel { background: #0ff !important; box-shadow: 0 0 8px rgba(0, 255, 255, 0.6) !important; }
.skin-neon .ws-magazine { background: #088 !important; }
.skin-neon .ws-stock { background: #066 !important; }
.skin-neon .ws-grip { background: #044 !important; }
.skin-neon .ws-sight { background: #0ff !important; box-shadow: 0 0 6px rgba(0, 255, 255, 0.5) !important; }

.skin-red .ws-body { background: #4a1a1a !important; box-shadow: 0 0 8px rgba(255, 50, 50, 0.4) !important; }
.skin-red .ws-barrel { background: #cc3333 !important; box-shadow: 0 0 6px rgba(255, 50, 50, 0.5) !important; }
.skin-red .ws-magazine { background: #8b1a1a !important; }
.skin-red .ws-stock { background: #6b1414 !important; }
.skin-red .ws-grip { background: #4a0e0e !important; }
.skin-red .ws-sight { background: #cc3333 !important; }

.skin-blue .ws-body { background: #1a2a4a !important; box-shadow: 0 0 8px rgba(50, 100, 255, 0.4) !important; }
.skin-blue .ws-barrel { background: #3366cc !important; box-shadow: 0 0 6px rgba(50, 100, 255, 0.5) !important; }
.skin-blue .ws-magazine { background: #224488 !important; }
.skin-blue .ws-stock { background: #1a3366 !important; }
.skin-blue .ws-grip { background: #112244 !important; }
.skin-blue .ws-sight { background: #3366cc !important; }

.skin-purple .ws-body { background: #2a1a4a !important; box-shadow: 0 0 8px rgba(168, 85, 247, 0.4) !important; }
.skin-purple .ws-barrel { background: #a855f7 !important; box-shadow: 0 0 6px rgba(168, 85, 247, 0.5) !important; }
.skin-purple .ws-magazine { background: #6b2fa0 !important; }
.skin-purple .ws-stock { background: #5a2288 !important; }
.skin-purple .ws-grip { background: #3a1555 !important; }
.skin-purple .ws-sight { background: #a855f7 !important; }

.skin-equipped-info {
    padding: 12px !important;
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-sm) !important;
    font-size: 13px !important;
    color: var(--color-text-secondary) !important;
    font-family: var(--font-body) !important;
    margin: 0 20px 20px !important;
}

/* ========================================
   === 任务线卡片样式 ===
   ======================================== */

.mission-line-list {
    padding: 0 20px 20px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    overflow-y: auto !important;
    flex: 1 !important;
}

.mission-card {
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    padding: 16px !important;
    background: var(--color-bg-card) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
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

.mission-card.locked:hover {
    border-color: var(--color-border-subtle) !important;
    background: var(--color-bg-card) !important;
    box-shadow: none !important;
}

.mission-card.completed {
    border-color: rgba(0, 255, 136, 0.2) !important;
}

.mission-card.completed:hover {
    border-color: rgba(0, 255, 136, 0.35) !important;
}

.mission-card.active {
    border-color: var(--brand-accent) !important;
    box-shadow: 0 0 15px rgba(0, 255, 136, 0.25), inset 0 0 20px rgba(0, 255, 136, 0.03) !important;
    background: rgba(0, 255, 136, 0.04) !important;
}

.mc-left {
    flex-shrink: 0 !important;
    width: 48px !important;
    height: 48px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: var(--color-bg-hover) !important;
    border: 1px solid var(--color-border-subtle) !important;
    border-radius: var(--radius-md) !important;
    font-size: 24px !important;
}

.mc-center {
    flex: 1 !important;
    min-width: 0 !important;
}

.mc-title {
    font-size: 15px !important;
    font-weight: 700 !important;
    color: var(--color-text-primary) !important;
    margin-bottom: 4px !important;
}

.mc-subtitle {
    font-size: 12px !important;
    color: var(--color-text-muted) !important;
    font-weight: 400 !important;
    margin-left: 6px !important;
}

.mc-desc {
    font-size: 13px !important;
    color: var(--color-text-secondary) !important;
    margin-bottom: 6px !important;
    line-height: 1.4 !important;
}

.mc-meta {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin-bottom: 4px !important;
}

.mc-map-tag {
    font-size: 11px !important;
    padding: 2px 8px !important;
    background: rgba(74, 93, 35, 0.2) !important;
    border: 1px solid rgba(74, 93, 35, 0.3) !important;
    border-radius: var(--radius-sm) !important;
    color: var(--brand-primary-light) !important;
}

.mc-target {
    font-size: 12px !important;
    color: var(--color-text-muted) !important;
}

.mc-reward {
    font-size: 13px !important;
    color: var(--brand-secondary) !important;
    font-weight: 600 !important;
    font-family: var(--font-display) !important;
}

.mc-right {
    flex-shrink: 0 !important;
    display: flex !important;
    align-items: center !important;
}

.mc-status {
    font-size: 12px !important;
    padding: 6px 14px !important;
    border-radius: 999px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
}

.mc-locked {
    background: rgba(255, 255, 255, 0.04) !important;
    color: var(--color-text-muted) !important;
    border: 1px solid var(--color-border-subtle) !important;
}

.mc-completed {
    background: rgba(0, 204, 102, 0.15) !important;
    color: var(--brand-accent-dim) !important;
    border: 1px solid rgba(0, 204, 102, 0.3) !important;
}

.mc-active {
    background: rgba(0, 255, 136, 0.12) !important;
    color: var(--brand-accent) !important;
    border: 1px solid rgba(0, 255, 136, 0.4) !important;
    animation: activePulse 2s ease-in-out infinite !important;
}

@keyframes activePulse {
    0%, 100% { box-shadow: 0 0 4px rgba(0, 255, 136, 0.2) !important; }
    50% { box-shadow: 0 0 12px rgba(0, 255, 136, 0.4) !important; }
}
"@

Add-Content -Path "f:\ai\game\css\style-new-ui-panels.css" -Value $appendContent
Write-Host "Panels part 3 done"
