export const themeCss = `
  :root {
    --bg-canvas: #070a12;
    --bg-surface: #0c1322;
    --bg-surface-elevated: #111a2e;
    --bg-surface-subtle: #090e1a;
    --bg-hover: rgba(255, 255, 255, 0.04);
    --border-subtle: #192338;
    --border-strong: #263654;
    --border-active: #3b82f6;
    
    --primary: #2563eb;
    --primary-hover: #1d4ed8;
    --primary-glow: rgba(37, 99, 235, 0.25);
    
    --text-main: #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    
    --success: #10b981;
    --success-bg: rgba(16, 185, 129, 0.12);
    --success-border: rgba(16, 185, 129, 0.3);
    
    --warning: #f59e0b;
    --warning-bg: rgba(245, 158, 11, 0.12);
    --warning-border: rgba(245, 158, 11, 0.3);
    
    --danger: #ef4444;
    --danger-bg: rgba(239, 68, 68, 0.14);
    --danger-border: rgba(239, 68, 68, 0.35);
    
    --info: #06b6d4;
    --info-bg: rgba(6, 182, 212, 0.12);
    --info-border: rgba(6, 182, 212, 0.3);
    
    --sidebar-width: 240px;
    --sidebar-collapsed-width: 68px;
    --topbar-height: 56px;
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 10px;
    --radius-xl: 14px;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    background-color: var(--bg-canvas);
    color: var(--text-main);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    font-size: 13px;
    line-height: 1.5;
    overflow-x: hidden;
    display: flex;
  }

  /* Custom Scrollbars */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: var(--bg-surface-subtle);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #475569;
  }

  /* Typography Utilities */
  .code-font {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }
  .code-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    background: rgba(37, 99, 235, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(37, 99, 235, 0.3);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    display: inline-block;
  }

  /* Status Pills */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    white-space: nowrap;
  }
  .status-online {
    background: var(--success-bg);
    color: var(--success);
    border: 1px solid var(--success-border);
  }
  .status-offline {
    background: rgba(148, 163, 184, 0.08);
    color: var(--text-secondary);
    border: 1px solid rgba(148, 163, 184, 0.2);
  }
  .status-warning {
    background: var(--warning-bg);
    color: var(--warning);
    border: 1px solid var(--warning-border);
  }
  .status-danger {
    background: var(--danger-bg);
    color: var(--danger);
    border: 1px solid var(--danger-border);
  }
  .status-info {
    background: var(--info-bg);
    color: var(--info);
    border: 1px solid var(--info-border);
  }

  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
  }
  .pulse-dot.online {
    background: var(--success);
    box-shadow: 0 0 6px var(--success);
    animation: pulseOnline 2s infinite ease-in-out;
  }
  .pulse-dot.danger {
    background: var(--danger);
    box-shadow: 0 0 6px var(--danger);
    animation: pulseDanger 1.2s infinite ease-in-out;
  }
  .pulse-dot.warning {
    background: var(--warning);
    box-shadow: 0 0 6px var(--warning);
  }
  .pulse-dot.offline {
    background: var(--text-muted);
  }
  @keyframes pulseOnline {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }
  @keyframes pulseDanger {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    transition: all 0.15s ease;
    font-family: inherit;
    white-space: nowrap;
    user-select: none;
  }
  .btn:focus {
    outline: none;
  }
  .btn-primary {
    background: var(--primary);
    color: #fff;
  }
  .btn-primary:hover {
    background: var(--primary-hover);
    box-shadow: 0 2px 8px var(--primary-glow);
  }
  .btn-secondary {
    background: var(--bg-surface-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
  }
  .btn-secondary:hover {
    border-color: var(--border-strong);
    background: rgba(255, 255, 255, 0.07);
  }
  .btn-danger {
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    color: var(--danger);
  }
  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.25);
  }
  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
  }
  .btn-ghost:hover {
    background: var(--bg-hover);
    color: #fff;
  }
  .btn-sm {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: var(--radius-sm);
  }
  .btn-icon {
    padding: 6px;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* SIDEBAR */
  .app-sidebar {
    width: var(--sidebar-width);
    background: var(--bg-surface-subtle);
    border-right: 1px solid var(--border-subtle);
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 90;
    display: flex;
    flex-direction: column;
    transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .app-sidebar.collapsed {
    width: var(--sidebar-collapsed-width);
  }
  .sidebar-header {
    height: var(--topbar-height);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
  }
  .sidebar-brand-logo {
    width: 32px;
    height: 32px;
    background: var(--primary);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 13px;
    color: #fff;
    flex-shrink: 0;
    letter-spacing: -0.5px;
    box-shadow: 0 2px 10px var(--primary-glow);
  }
  .sidebar-brand-text {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    white-space: nowrap;
  }
  .sidebar-brand-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.2px;
  }
  .sidebar-brand-sub {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .app-sidebar.collapsed .sidebar-brand-text {
    display: none;
  }

  .sidebar-nav {
    flex: 1;
    padding: 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }
  .sidebar-nav-section-title {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 8px 12px 4px 12px;
  }
  .app-sidebar.collapsed .sidebar-nav-section-title {
    display: none;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    border: 1px solid transparent;
  }
  .nav-item:hover {
    color: #fff;
    background: var(--bg-hover);
  }
  .nav-item.active {
    color: #fff;
    background: rgba(37, 99, 235, 0.12);
    border-color: rgba(37, 99, 235, 0.25);
    font-weight: 600;
  }
  .nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    background: var(--primary);
    border-radius: 0 2px 2px 0;
  }
  .nav-item-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
  }
  .nav-item-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .app-sidebar.collapsed .nav-item-label {
    display: none;
  }
  .nav-item-badge {
    background: var(--danger);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
  }
  .app-sidebar.collapsed .nav-item-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 2px 4px;
    font-size: 9px;
  }

  .sidebar-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .sidebar-status-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .app-sidebar.collapsed .sidebar-status-indicator span {
    display: none;
  }

  /* MAIN LAYOUT WRAPPER */
  .app-layout {
    flex: 1;
    margin-left: var(--sidebar-width);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    transition: margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .app-sidebar.collapsed ~ .app-layout {
    margin-left: var(--sidebar-collapsed-width);
  }

  /* TOPBAR */
  .app-topbar {
    height: var(--topbar-height);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    position: sticky;
    top: 0;
    z-index: 80;
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .topbar-search-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-surface-subtle);
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    padding: 6px 14px;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 12px;
    width: 280px;
    transition: all 0.15s ease;
  }
  .topbar-search-btn:hover {
    border-color: var(--border-strong);
    color: var(--text-secondary);
  }
  .kbd-shortcut {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--border-subtle);
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--text-muted);
  }
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  /* BREADCRUMBS BAR */
  .app-breadcrumbs-bar {
    background: var(--bg-surface-subtle);
    border-bottom: 1px solid var(--border-subtle);
    padding: 8px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
  }
  .breadcrumbs-trail {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
  }
  .breadcrumb-link {
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: none;
  }
  .breadcrumb-link:hover {
    color: #fff;
  }
  .breadcrumb-separator {
    color: var(--border-strong);
  }
  .breadcrumb-active {
    color: #fff;
    font-weight: 600;
  }

  /* CONTENT AREA */
  .app-content {
    flex: 1;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
  }

  /* KPI METRICS GRID */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .kpi-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;
    overflow: hidden;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
  .kpi-card:hover {
    border-color: var(--border-strong);
  }
  .kpi-card.critical {
    border-color: rgba(239, 68, 68, 0.4);
    background: linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, var(--bg-surface) 100%);
  }
  .kpi-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .kpi-number {
    font-size: 26px;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.5px;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .kpi-desc {
    font-size: 11px;
    color: var(--text-secondary);
  }

  /* SECTION CARDS & QUADRANTS */
  .section-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .section-header {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    background: rgba(255, 255, 255, 0.01);
  }
  .section-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-body {
    padding: 16px 18px;
  }

  /* TABLES */
  .table-responsive {
    width: 100%;
    overflow-x: auto;
  }
  table.noc-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  table.noc-table th {
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-surface-subtle);
    white-space: nowrap;
  }
  table.noc-table td {
    padding: 10px 14px;
    font-size: 12px;
    border-bottom: 1px solid var(--border-subtle);
    vertical-align: middle;
    color: #e2e8f0;
  }
  table.noc-table tr:last-child td {
    border-bottom: none;
  }
  table.noc-table tbody tr:hover td {
    background: var(--bg-hover);
  }

  /* FILTER TOOLBAR */
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-surface-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filter-pill {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }
  .filter-pill:hover {
    border-color: var(--border-strong);
    color: #fff;
  }
  .filter-pill.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }
  .filter-select {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    padding: 6px 10px;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }
  .filter-select:focus {
    outline: none;
    border-color: var(--primary);
  }

  .input-search {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: #fff;
    padding: 6px 12px 6px 30px;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-family: inherit;
    width: 240px;
  }
  .input-search:focus {
    outline: none;
    border-color: var(--primary);
  }
  .input-search-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .input-search-icon {
    position: absolute;
    left: 10px;
    color: var(--text-muted);
    font-size: 12px;
    pointer-events: none;
  }

  /* SUB-NAVIGATION TABS (NO HORIZONTAL SCROLL OVERFLOW) */
  .subnav-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 0;
    flex-wrap: wrap;
  }
  .subnav-tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    padding: 8px 14px;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s ease;
  }
  .subnav-tab-btn:hover {
    color: #fff;
  }
  .subnav-tab-btn.active {
    color: #60a5fa;
    border-bottom-color: var(--primary);
    background: rgba(37, 99, 235, 0.05);
  }

  /* REQUIERE ATENCION BLOCK */
  .attention-box {
    background: rgba(239, 68, 68, 0.06);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-left: 4px solid var(--danger);
    border-radius: var(--radius-md);
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .attention-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #f87171;
    font-weight: 700;
    font-size: 13px;
  }
  .attention-items {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .attention-badge {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #fca5a5;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  /* HEALTH SCORE GAUGE & BREAKDOWN */
  .health-score-container {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .health-score-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .health-score-dial {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .health-score-value {
    font-size: 36px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -1px;
  }
  .health-score-pill {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    font-weight: 700;
    font-size: 12px;
  }
  .health-categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }
  .health-category-box {
    background: var(--bg-surface-subtle);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .health-cat-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 600;
  }
  .health-cat-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }
  .health-cat-fill {
    height: 100%;
    border-radius: 2px;
  }

  /* WIZARD CONTAINER */
  .wizard-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 800px;
  }
  .wizard-steps {
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: relative;
    margin-bottom: 10px;
  }
  .wizard-step {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    z-index: 1;
  }
  .wizard-step.active {
    color: #fff;
  }
  .wizard-step-circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--bg-surface-elevated);
    border: 2px solid var(--border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .wizard-step.active .wizard-step-circle {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
    box-shadow: 0 0 10px var(--primary-glow);
  }
  .wizard-step.completed .wizard-step-circle {
    background: var(--success);
    border-color: var(--success);
    color: #fff;
  }

  /* MODALS & OVERLAYS */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(4, 7, 13, 0.8);
    backdrop-filter: blur(4px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 20px;
  }
  .modal-backdrop.active {
    display: flex;
  }
  .modal-window {
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    width: 100%;
    max-width: 580px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75);
    overflow: hidden;
    animation: modalIn 0.15s ease-out;
  }
  .modal-window.lg {
    max-width: 800px;
  }
  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.96) translateY(8px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .modal-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
  }
  .modal-body {
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    background: rgba(255, 255, 255, 0.01);
  }

  /* FORMS */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .form-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .form-input, .form-textarea, .form-select {
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
    color: #fff;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-family: inherit;
  }
  .form-input:focus, .form-textarea:focus, .form-select:focus {
    outline: none;
    border-color: var(--primary);
  }

  /* TOAST SYSTEM */
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 300;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    background: var(--bg-surface-elevated);
    border: 1px solid var(--border-strong);
    color: #fff;
    padding: 10px 16px;
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 500;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: toastSlide 0.2s ease-out;
  }
  .toast.success {
    border-color: var(--success-border);
    border-left: 4px solid var(--success);
  }
  .toast.error {
    border-color: var(--danger-border);
    border-left: 4px solid var(--danger);
  }
  @keyframes toastSlide {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* GLOBAL SEARCH DIALOG */
  .search-dialog-window {
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    width: 100%;
    max-width: 600px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
  }
  .search-dialog-input-row {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .search-dialog-input {
    flex: 1;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 15px;
    font-family: inherit;
  }
  .search-dialog-input:focus {
    outline: none;
  }
  .search-results-list {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .search-result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--text-main);
    transition: background 0.1s ease;
  }
  .search-result-item:hover, .search-result-item.selected {
    background: rgba(37, 99, 235, 0.12);
  }
  .search-result-meta {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* FOOTER */
  .app-footer {
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-surface-subtle);
    padding: 12px 24px;
    font-size: 11px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
  }

  /* ROTATING SPINNER */
  .spinning {
    display: inline-block;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* RESPONSIVE BREAKPOINTS */
  @media (max-width: 1024px) {
    .app-sidebar {
      width: var(--sidebar-collapsed-width);
    }
    .app-sidebar .sidebar-brand-text,
    .app-sidebar .sidebar-nav-section-title,
    .app-sidebar .nav-item-label,
    .app-sidebar .sidebar-status-indicator span {
      display: none;
    }
    .app-layout {
      margin-left: var(--sidebar-collapsed-width);
    }
    .topbar-search-btn {
      width: 180px;
    }
  }

  @media (max-width: 768px) {
    .app-sidebar {
      transform: translateX(-100%);
      width: var(--sidebar-width);
    }
    .app-sidebar.mobile-open {
      transform: translateX(0);
    }
    .app-layout {
      margin-left: 0 !important;
    }
    .app-content {
      padding: 14px;
    }
    .topbar-search-btn {
      width: auto;
      padding: 6px 10px;
    }
    .topbar-search-btn span:not(.input-search-icon) {
      display: none;
    }
    .kpi-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;
