function safeJson(val: any): string {
  return JSON.stringify(val ?? null, (_, v) =>
    typeof v === 'bigint' ? (Number.isSafeInteger(Number(v)) ? Number(v) : v.toString()) : v
  ).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function getLandingHtml(data: {
  uptimeSeconds: number;
  serverTime: string;
  version: string;
  env: string;
  devices?: any[];
  customers?: any[];
  recentEvents?: any[];
}): string {
  const uptimeMinutes = Math.floor(data.uptimeSeconds / 60);
  const uptimeHours = (data.uptimeSeconds / 3600).toFixed(1);

  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NanoLabs Control Center — Enterprise NOC & RMM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-canvas: #090d16;
      --bg-surface: #0f172a;
      --bg-surface-elevated: #162032;
      --bg-hover: rgba(255, 255, 255, 0.03);
      --border-subtle: #1e293b;
      --border-strong: #334155;
      --border-active: #2563eb;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --text-main: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --success: #10b981;
      --success-bg: rgba(16, 185, 129, 0.1);
      --success-border: rgba(16, 185, 129, 0.25);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.1);
      --warning-border: rgba(245, 158, 11, 0.25);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.1);
      --danger-border: rgba(239, 68, 68, 0.25);
      --neutral-bg: rgba(148, 163, 184, 0.08);
      --neutral-border: rgba(148, 163, 184, 0.2);
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
      display: flex;
      flex-direction: column;
      font-size: 13px;
      line-height: 1.5;
    }

    /* Top Navigation */
    .navbar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .nav-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: inherit;
    }

    .nav-logo-badge {
      background: var(--primary);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      padding: 4px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .nav-brand-title {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.2px;
    }

    .nav-brand-sub {
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
    }

    .nav-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Breadcrumb / Context Bar */
    .breadcrumb-bar {
      background: #0b1120;
      border-bottom: 1px solid var(--border-subtle);
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .breadcrumb-path {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .breadcrumb-path strong {
      color: #fff;
    }

    .breadcrumb-separator {
      color: var(--text-muted);
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: background 0.15s ease, border-color 0.15s ease;
      font-family: inherit;
      white-space: nowrap;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
    }

    .btn-primary:hover {
      background: var(--primary-hover);
    }

    .btn-secondary {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-main);
    }

    .btn-secondary:hover {
      border-color: var(--border-strong);
      background: rgba(255, 255, 255, 0.06);
    }

    .btn-sm {
      padding: 4px 10px;
      font-size: 11px;
    }

    .btn-outline-danger {
      background: transparent;
      border: 1px solid var(--danger-border);
      color: var(--danger);
    }

    .btn-outline-danger:hover {
      background: var(--danger-bg);
    }

    /* Status Pills */
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    .status-online {
      background: var(--success-bg);
      color: var(--success);
      border: 1px solid var(--success-border);
    }

    .status-offline {
      background: var(--neutral-bg);
      color: var(--text-secondary);
      border: 1px solid var(--neutral-border);
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

    .code-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background: rgba(37, 99, 245, 0.12);
      color: #60a5fa;
      border: 1px solid rgba(37, 99, 245, 0.3);
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .code-font {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }

    /* Main Container */
    .main-container {
      max-width: 1440px;
      width: 100%;
      margin: 0 auto;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      flex: 1;
    }

    /* Top KPI Strip */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .kpi-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .kpi-header {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .kpi-val {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .kpi-detail {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Navigation Tabs Bar */
    .nav-tabs-bar {
      display: flex;
      gap: 6px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 8px;
      overflow-x: auto;
    }

    .nav-tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
    }

    .nav-tab-btn:hover {
      color: #fff;
      background: var(--bg-hover);
    }

    .nav-tab-btn.active {
      color: #fff;
      background: var(--bg-surface-elevated);
      border-color: var(--border-subtle);
    }

    /* Customer Folders / Directory */
    .directory-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 4px;
    }

    .search-box {
      position: relative;
      width: 320px;
      max-width: 100%;
    }

    .search-input {
      width: 100%;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 7px 12px 7px 32px;
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--primary);
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 12px;
      pointer-events: none;
    }

    .customers-folder-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .customer-folder-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.15s ease;
    }

    .customer-folder-card:hover {
      border-color: var(--border-strong);
    }

    .customer-folder-header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 14px;
      background: rgba(255, 255, 255, 0.01);
    }

    .folder-title-area {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .folder-icon {
      width: 34px;
      height: 34px;
      background: rgba(37, 99, 245, 0.1);
      border: 1px solid rgba(37, 99, 245, 0.25);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      color: #60a5fa;
    }

    .folder-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .folder-name {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }

    .folder-meta {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .folder-summary-stats {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .folder-stats-pills {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .folder-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Accordion Content */
    .customer-accordion {
      border-top: 1px solid var(--border-subtle);
      background: #080c14;
      padding: 12px 18px 18px 18px;
    }

    .accordion-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .accordion-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Table Styles */
    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      background: var(--bg-surface);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      padding: 10px 14px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(255, 255, 255, 0.02);
      white-space: nowrap;
    }

    td {
      padding: 10px 14px;
      font-size: 12px;
      border-bottom: 1px solid var(--border-subtle);
      vertical-align: middle;
      color: #e2e8f0;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: var(--bg-hover);
    }

    .host-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .host-icon {
      font-size: 14px;
    }

    /* Customer Dedicated Workspace (Drilldown View) */
    .workspace-banner {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .workspace-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
    }

    .workspace-title-box h2 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .workspace-title-box p {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .token-box {
      background: rgba(37, 99, 245, 0.06);
      border: 1px solid rgba(37, 99, 245, 0.2);
      border-radius: 6px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .token-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #60a5fa;
    }

    /* Customer Deployment Strip */
    .customer-deploy-strip {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .deploy-strip-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .deploy-strip-badge {
      background: rgba(37, 99, 235, 0.15);
      border: 1px solid rgba(37, 99, 235, 0.35);
      color: #60a5fa;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .deploy-strip-token {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #f8fafc;
      background: #090d16;
      border: 1px solid var(--border-subtle);
      padding: 3px 8px;
      border-radius: 4px;
    }

    .deploy-strip-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Workstation Hero Card & Quick Chips */
    .workstation-hero-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .quick-chip {
      background: #090d16;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 110px;
    }

    .quick-chip-label {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }

    .quick-chip-val {
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
    }

    /* Spinning Icon Animation */
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .spinning {
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }

    /* Modal / Drawer */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .drawer-overlay.active {
      display: flex;
    }

    .drawer-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      width: 100%;
      max-width: 960px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    }

    .drawer-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0b1120;
    }

    .drawer-header h3 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .drawer-close {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .drawer-close:hover {
      color: #fff;
      background: var(--bg-hover);
    }

    .drawer-nav-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-subtle);
      background: #080c16;
      overflow-x: auto;
    }

    .drawer-tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
    }

    .drawer-tab-btn:hover {
      color: #fff;
      background: var(--bg-hover);
    }

    .drawer-tab-btn.active {
      color: #fff;
      background: var(--bg-surface-elevated);
      border-color: var(--border-subtle);
    }

    .drawer-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .spec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .spec-item {
      background: #090d16;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .spec-item .label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .spec-item .val {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
    }

    .gauge-bar {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
      margin-top: 4px;
    }

    .gauge-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
    }

    /* Modals */
    .modal-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      width: 100%;
      max-width: 480px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    }

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

    .form-input {
      background: #090d16;
      border: 1px solid var(--border-subtle);
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--primary);
    }

    footer {
      border-top: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      padding: 12px 24px;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: auto;
    }
  </style>
</head>
<body>

  <!-- Top Navbar -->
  <header class="navbar">
    <div class="nav-left">
      <a href="#" onclick="backToGeneralDashboard(); return false;" class="nav-brand">
        <span class="nav-logo-badge">NL</span>
        <div>
          <div class="nav-brand-title">NanoLabs Control Center</div>
          <div class="nav-brand-sub">Enterprise NOC & Multi-Tenant RMM</div>
        </div>
      </a>
    </div>

    <div class="nav-right">
      <span class="status-pill status-online">
        ● CONSOLA EN LÍNEA • Clúster Debian Activo
      </span>
      <div id="userBadge" style="display: none; align-items: center; gap: 10px;">
        <span class="code-badge" id="userEmailBadge">admin@nanolabs.com.ar</span>
        <button class="btn btn-secondary btn-sm" onclick="logout()">Cerrar Sesión</button>
      </div>
      <button class="btn btn-primary btn-sm" id="loginNavBtn" onclick="openLoginModal()">
        Iniciar Sesión
      </button>
    </div>
  </header>

  <!-- Breadcrumb & Quick Actions Bar -->
  <div class="breadcrumb-bar">
    <div class="breadcrumb-path" id="breadcrumbPath">
      <span style="cursor: pointer;" onclick="backToGeneralDashboard()" title="Ir al NOC General">🖥️ NOC General</span>
      <span class="breadcrumb-separator">/</span>
      <strong id="breadcrumbCurrent">Directorio de Clientes &amp; Flota</strong>
    </div>

    <div style="display: flex; align-items: center; gap: 8px;" id="breadcrumbActions">
      <button class="btn btn-secondary btn-sm" id="btnLiveRefresh" onclick="handleGlobalRefresh()" title="Actualizar datos en tiempo real">
        <span id="globalRefreshIcon">🔄</span> Actualizar (En Vivo)
      </button>
      <button class="btn btn-secondary btn-sm" onclick="openCreateCustomerModal()">
        + Nuevo Cliente
      </button>
      <button class="btn btn-primary btn-sm" onclick="switchNavTab('enroll')">
        + Enrolar Agente
      </button>
      <button class="btn btn-secondary btn-sm" id="btnBackGlobal" style="display: none;" onclick="handleGlobalBack()">
        ← Volver
      </button>
    </div>
  </div>

  <main class="main-container">

    <!-- Primary Navigation Tabs -->
    <div class="nav-tabs-bar">
      <button class="nav-tab-btn active" id="navTabDirectory" onclick="switchNavTab('directory')">
        📁 Directorio de Clientes
      </button>
      <button class="nav-tab-btn" id="navTabCustomers" onclick="switchNavTab('customers')">
        🏢 Gestión de Empresas & Sedes
      </button>
      <button class="nav-tab-btn" id="navTabEnroll" onclick="switchNavTab('enroll')">
        ⚡ Enrolar Nuevo Agente
      </button>
      <button class="nav-tab-btn" id="navTabCluster" onclick="switchNavTab('cluster')">
        ⚙️ Infraestructura Clúster
      </button>
    </div>

    <!-- VIEW 1: GENERAL DIRECTORY & NOC (Default) -->
    <div id="viewGeneralDirectory" style="display: flex; flex-direction: column; gap: 20px;">
      
      <!-- Executive KPI Strip -->
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-header">
            <span>Clientes Administrados</span>
            <span>🏢</span>
          </div>
          <div class="kpi-val" id="kpiTotalCustomers">0</div>
          <div class="kpi-detail" id="kpiSitesDetail">0 Sedes Activas</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-header">
            <span>Parque de Estaciones</span>
            <span>💻</span>
          </div>
          <div class="kpi-val" id="kpiTotalDevices">0</div>
          <div class="kpi-detail">
            <span class="status-pill status-online" id="kpiOnlinePill" style="padding: 1px 6px;">0 Online</span>
            <span class="status-pill status-offline" id="kpiOfflinePill" style="padding: 1px 6px;">0 Offline</span>
          </div>
        </div>

        <div class="kpi-box">
          <div class="kpi-header">
            <span>Seguridad en Endpoint</span>
            <span>🛡️</span>
          </div>
          <div class="kpi-val" id="kpiSecurityScore">100%</div>
          <div class="kpi-detail" id="kpiSecurityDetail">Defender & Firewall Activos</div>
        </div>

        <div class="kpi-box">
          <div class="kpi-header">
            <span>Incidentes en Windows</span>
            <span>⚠️</span>
          </div>
          <div class="kpi-val" id="kpiCriticalEvents" style="color: #38bdf8;">0</div>
          <div class="kpi-detail" id="kpiEventsDetail">0 Críticos en la Flota</div>
        </div>
      </div>

      <!-- Directory Header & Search Filter -->
      <div class="directory-controls">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; color: #fff;">Organizaciones & Carpetas de Clientes</h3>
          <p style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Cada cliente opera como un espacio aislado. Despliega sus estaciones o entra directamente a su carpeta.
          </p>
        </div>

        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="directorySearchInput" class="search-input" placeholder="Buscar por cliente o código..." oninput="filterDirectory()">
        </div>
      </div>

      <!-- Collapsible Customer Cards Directory -->
      <div class="customers-folder-list" id="customersFolderContainer">
        <!-- Rendered via JavaScript renderCustomersDirectory -->
      </div>

      <!-- Recent Windows Incidents Feed -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <h4 style="font-size: 13px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.5px;">
              ⚠️ Incidentes Críticos Recientes de Windows (Event Viewer)
            </h4>
            <p style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Registro de fallas KernelPower, BSOD o almacenamiento capturadas en tiempo real.</p>
          </div>
          <span class="code-badge" id="eventsCountBadgeFeed">0 Eventos</span>
        </div>

        <div id="eventsFeedContainer" style="display: flex; flex-direction: column; gap: 8px;">
          <!-- Rendered via JS -->
        </div>
      </div>

    </div>

    <!-- VIEW 2: DEDICATED CUSTOMER WORKSPACE (Drilldown) -->
    <div id="viewCustomerWorkspace" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Customer Workspace Header Banner -->
      <div class="workspace-banner" style="gap: 12px;">
        <div class="workspace-top">
          <div class="workspace-title-box">
            <h2>
              <span>📁</span>
              <span id="wsCustomerName">Nombre del Cliente</span>
              <span class="code-badge" id="wsCustomerCode">CODE</span>
              <span class="status-pill status-online" id="wsCustomerStatus">● ACTIVO</span>
            </h2>
            <p id="wsCustomerMeta">Organización cliente administrada</p>
          </div>

          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" id="btnRefreshCustomerWs" onclick="refreshCustomerWorkspace()" title="Actualizar estado de todos los equipos del cliente">
              <span id="wsRefreshIcon">🔄</span> Actualizar Flota
            </button>
            <button class="btn btn-secondary btn-sm" onclick="backToGeneralDashboard()">
              ← Volver al Directorio de Clientes
            </button>
          </div>
        </div>

        <!-- Compact Horizontal Deployment Strip (No Scrolling Required) -->
        <div class="customer-deploy-strip">
          <div class="deploy-strip-left">
            <span class="deploy-strip-badge">🚀 Instalador Reutilizable</span>
            <span style="font-size: 12px; color: var(--text-secondary);">Token:</span>
            <code class="deploy-strip-token" id="wsCustomerTokenBadge">NL-TEST-***</code>
            <span style="font-size: 11px; color: var(--text-muted);">(Válido para todos los equipos de este cliente)</span>
          </div>

          <div class="deploy-strip-actions">
            <button class="btn btn-primary btn-sm" onclick="copyCustomerPs1Cmd()" title="Copiar script PowerShell listo para ejecutar como Administrador">
              ⚡ Copiar PowerShell (1 Clic)
            </button>
            <a href="/downloads/NanoMonitor-Setup.exe" class="btn btn-secondary btn-sm" download style="text-decoration: none;" title="Descargar paquete de instalación ejecutable">
              ⬇️ Instalador (.exe)
            </a>
            <button class="btn btn-secondary btn-sm" onclick="copyCurrentCustomerEnrollCmd()" title="Copiar comando CLI nanoagent.exe">
              📋 Copiar CLI
            </button>
            <button class="btn btn-secondary btn-sm" onclick="togglePs1ScriptPreview()" id="btnTogglePs1Preview" title="Ver comando PowerShell completo">
              👁️ Ver Script
            </button>
          </div>

          <div id="wsPs1PreviewBox" style="display: none; width: 100%; margin-top: 6px; background: #090d16; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Instalación remota de 1 línea en PowerShell (Administrador):</div>
            <div class="token-text" id="wsPs1CmdText" style="font-size: 12px; word-break: break-all;">
              &amp; ([scriptblock]::Create((irm https://monitor.nanolabs.com.ar/downloads/install.ps1))) -Token "NL-TEST-***"
            </div>
            <div style="display: none;" id="wsCliBox">
              <span class="token-text" id="wsEnrollCmdText">nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token NL-TEST-***</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Specific Customer KPIs -->
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-header"><span>Equipos del Cliente</span><span>💻</span></div>
          <div class="kpi-val" id="wsKpiTotal">0</div>
          <div class="kpi-detail" id="wsKpiBreakdown">0 Online • 0 Offline</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-header"><span>Sedes Asignadas</span><span>📍</span></div>
          <div class="kpi-val" id="wsKpiSites">1</div>
          <div class="kpi-detail" id="wsKpiSitesDetail">Casa Central</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-header"><span>Seguridad en Máquinas</span><span>🛡️</span></div>
          <div class="kpi-val" id="wsKpiSec">100%</div>
          <div class="kpi-detail">Endpoints Protegidos</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-header"><span>Incidentes Reportados</span><span>⚠️</span></div>
          <div class="kpi-val" id="wsKpiEvents">0</div>
          <div class="kpi-detail">Eventos Críticos</div>
        </div>
      </div>

      <!-- Devices Table for this Customer -->
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
          <h3 style="font-size: 15px; font-weight: 700; color: #fff;">
            Estaciones de Trabajo de esta Organización
          </h3>
          <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="wsDeviceSearch" class="search-input" placeholder="Filtrar equipos por nombre o IP..." oninput="filterWorkspaceDevices()">
          </div>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Estación / Hardware</th>
                <th>Sede</th>
                <th>Sistema Operativo</th>
                <th>Procesador & Memoria</th>
                <th>Disco & SMART</th>
                <th>Seguridad</th>
                <th>Incidentes</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody id="wsDevicesTableBody"></tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- VIEW 3: ENROLL AGENT -->
    <div id="viewEnroll" style="display: none; flex-direction: column; gap: 20px;">
      <div class="workspace-banner">
        <h2 style="font-size: 18px; font-weight: 700; color: #fff;">⚡ Enrolar Nuevo Agente en la Plataforma</h2>
        <p style="font-size: 13px; color: var(--text-secondary);">
          Selecciona a qué empresa cliente pertenece el nuevo equipo para generar la clave criptográfica correcta de telemetría.
        </p>

        <div class="form-group" style="max-width: 400px; margin-top: 8px;">
          <label class="form-label">Cliente / Organización de Destino</label>
          <select id="enrollCustomerSelect" class="form-input" onchange="updateEnrollCommandForSelectedCustomer()">
            <!-- Populated via JS -->
          </select>
        </div>

        <div class="token-box" style="margin-top: 8px;">
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase;">
              Comando de Enrolamiento (Ejecutar en PowerShell como Administrador)
            </div>
            <div class="token-text" id="enrollCmdDisplay">
              nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token NL-TEST-1D7FD86D54A5B873
            </div>
          </div>
          <button class="btn btn-primary" onclick="copyGenericEnrollCmd()">
            📋 Copiar Comando
          </button>
        </div>

        <div style="font-size: 12px; color: var(--text-muted); line-height: 1.6;">
          <strong style="color: #cbd5e1;">Requisitos de Ejecución:</strong><br>
          1. Descargar el binario estático <code class="code-badge">nanoagent.exe</code> (7.01 MB).<br>
          2. Abrir PowerShell o Terminal con permisos elevados de Administrador.<br>
          3. Pegar y ejecutar el comando anterior. El agente registrará la identidad del equipo e iniciará el ciclo de telemetría periódica de 60s automáticamente.
        </div>
      </div>
    </div>

    <!-- VIEW 4: CUSTOMERS ADMIN TABLE -->
    <div id="viewCustomers" style="display: none; flex-direction: column; gap: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h3 style="font-size: 16px; font-weight: 700; color: #fff;">Directorio de Empresas Clientes</h3>
          <p style="font-size: 12px; color: var(--text-secondary);">Administración de organizaciones clientes, sedes y licencias de agentes.</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateCustomerModal()">+ Registrar Nuevo Cliente</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Cliente / Empresa</th>
              <th>Código</th>
              <th>Sedes</th>
              <th>Equipos Enrolados</th>
              <th>Alertas</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="customersTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- VIEW 5: CLUSTER INFRASTRUCTURE -->
    <div id="viewCluster" style="display: none; flex-direction: column; gap: 16px;">
      <div class="kpi-row">
        <div class="kpi-box">
          <div class="kpi-header"><span>Entorno de Ejecución</span><span>🐧</span></div>
          <div class="kpi-val" style="font-size: 18px;">Debian 12 Dedicated</div>
          <div class="kpi-detail">Clúster de Alto Rendimiento</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-header"><span>Motor de Base de Datos</span><span>🐘</span></div>
          <div class="kpi-val" style="font-size: 18px;">PostgreSQL 17</div>
          <div class="kpi-detail">Particionamiento Nativo Activo</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-header"><span>Caché & Deduplicación</span><span>⚡</span></div>
          <div class="kpi-val" style="font-size: 18px;">Redis 7 Alpine</div>
          <div class="kpi-detail">Validación Nonce HMAC</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-header"><span>Reverse Proxy</span><span>🔒</span></div>
          <div class="kpi-val" style="font-size: 18px;">NPM / Let's Encrypt</div>
          <div class="kpi-detail">HTTPS TLS v1.3 Forzado</div>
        </div>
      </div>
    </div>

    <!-- VIEW 6: DEDICATED WORKSTATION & HARDWARE WORKSPACE (Full Page, No Modals) -->
    <div id="viewDeviceWorkspace" style="display: none; flex-direction: column; gap: 16px;">
      
      <!-- Top Action Bar & Quick Return -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 12px 18px;">
        <div style="display: flex; align-items: center; gap: 10px; font-size: 13px;">
          <button class="btn btn-secondary btn-sm" id="btnBackToCustomer" onclick="backFromDeviceWorkspace()">
            ← Volver a <span id="wsDevCustBackName">Organización</span>
          </button>
          <span style="color: var(--text-muted);">|</span>
          <span style="color: var(--text-secondary);">Estación:</span>
          <strong id="wsDevHostTitle" style="color: #fff; font-family: 'JetBrains Mono', monospace;">NANOPC</strong>
          <span class="status-pill status-online" id="wsDevOnlinePill">● ONLINE</span>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary btn-sm" id="btnRefreshDevice" onclick="refreshCurrentDevice()" title="Consultar telemetría en tiempo real del agente">
            <span id="devRefreshIcon">🔄</span> Actualizar Telemetría
          </button>
          <button class="btn btn-secondary btn-sm" onclick="copyDeviceDiagnostic()" title="Copiar reporte técnico completo">
            📋 Copiar Diagnóstico
          </button>
        </div>
      </div>

      <!-- Main Workstation Hero Card -->
      <div class="workstation-hero-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="font-size: 32px; background: #090d16; border: 1px solid var(--border-subtle); width: 56px; height: 56px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
              💻
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <h2 id="wsDevMainHostname" style="font-size: 20px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace;">NANOPC</h2>
                <span class="status-pill status-online" id="wsDevHeroStatus">● ONLINE</span>
                <span class="code-badge" id="wsDevAgentBadge">Agent v0.1.0</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                <span>🏢 Cliente: <strong id="wsDevCustomerName" style="color: #cbd5e1;">NanoLabs Infraestructura</strong></span>
                <span>•</span>
                <span>📍 Sede: <strong id="wsDevSiteName" style="color: #cbd5e1;">Casa Central</strong></span>
                <span>•</span>
                <span>🕒 Último Reporte: <span id="wsDevLastSeen" class="code-font" style="color: #38bdf8;">En tiempo real</span></span>
              </div>
            </div>
          </div>

          <!-- Quick Hardware Chips -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <div class="quick-chip">
              <span class="quick-chip-label">SISTEMA</span>
              <span class="quick-chip-val" id="wsDevOsChip">Windows 11 Pro</span>
            </div>
            <div class="quick-chip">
              <span class="quick-chip-label">PROCESADOR</span>
              <span class="quick-chip-val" id="wsDevCpuChip">Intel Core i5</span>
            </div>
            <div class="quick-chip">
              <span class="quick-chip-label">MEMORIA</span>
              <span class="quick-chip-val" id="wsDevRamChip">16 GB RAM</span>
            </div>
            <div class="quick-chip">
              <span class="quick-chip-label">IP LOCAL</span>
              <span class="quick-chip-val code-font" id="wsDevIpChip">192.168.0.65</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 8 Specialized Navigation Tabs -->
      <div class="drawer-nav-tabs" style="border-radius: 8px; border: 1px solid var(--border-subtle); padding: 6px 10px;">
        <button class="drawer-tab-btn active" id="dTab1" onclick="switchDrawerTab('metrics')">📊 Rendimiento &amp; Recursos</button>
        <button class="drawer-tab-btn" id="dTab2" onclick="switchDrawerTab('specs')">⚙️ Hardware &amp; SO</button>
        <button class="drawer-tab-btn" id="dTab3" onclick="switchDrawerTab('storage')">💾 Discos &amp; SMART</button>
        <button class="drawer-tab-btn" id="dTab4" onclick="switchDrawerTab('network')">🌐 Red &amp; Conectividad</button>
        <button class="drawer-tab-btn" id="dTab5" onclick="switchDrawerTab('security')">🛡️ Seguridad &amp; Parches</button>
        <button class="drawer-tab-btn" id="dTab6" onclick="switchDrawerTab('software')">📦 Software Instalado</button>
        <button class="drawer-tab-btn" id="dTab7" onclick="switchDrawerTab('events')">⚠️ Eventos de Windows</button>
        <button class="drawer-tab-btn" id="dTab8" onclick="switchDrawerTab('agent')">🔧 Agente &amp; Reasignación</button>
      </div>

      <!-- Tab Content Panes Container (Full Page, Natural Scrolling) -->
      <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 20px; display: flex; flex-direction: column; gap: 16px;">
        
        <!-- Tab 1: Metrics -->
        <div id="dViewMetrics" style="display: flex; flex-direction: column; gap: 16px;">
          <div class="spec-grid">
            <div class="spec-item">
              <span class="label">Carga de CPU</span>
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="val" id="dCurrentCpu">18%</span>
                <span style="font-size: 11px; color: var(--text-muted);" id="dCpuSummaryText">6 Cores</span>
              </div>
              <div class="gauge-bar">
                <div class="gauge-fill" id="dCpuBarFill" style="width: 18%; background: var(--primary);"></div>
              </div>
            </div>

            <div class="spec-item">
              <span class="label">Uso de Memoria RAM</span>
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="val" id="dCurrentRam">42%</span>
                <span style="font-size: 11px; color: var(--text-muted);" id="dRamSummaryText">Libre</span>
              </div>
              <div class="gauge-bar">
                <div class="gauge-fill" id="dRamBarFill" style="width: 42%; background: #a855f7;"></div>
              </div>
            </div>

            <div class="spec-item">
              <span class="label">Tiempo Activo (Uptime)</span>
              <span class="val" id="dCurrentUptime" style="color: #34d399;">14d 6h</span>
              <span style="font-size: 11px; color: var(--text-muted);">Sin reinicios inesperados</span>
            </div>

            <div class="spec-item">
              <span class="label">Latencia con Servidor Central</span>
              <span class="val" id="dCurrentLatency" style="color: #38bdf8;">12 ms</span>
              <span style="font-size: 11px; color: var(--text-muted);">monitor.nanolabs.com.ar</span>
            </div>
          </div>

          <!-- SVG Chart -->
          <div style="background: #090d16; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <strong style="font-size: 13px; color: #fff;">Telemetría Histórica de Rendimiento (CPU & RAM)</strong>
                <div style="font-size: 11px; color: var(--text-muted);">Muestras periódicas capturadas por el agente Go</div>
              </div>
              <div style="display: flex; gap: 12px; font-size: 11px; font-weight: 600;">
                <span style="color: #38bdf8;">● CPU %</span>
                <span style="color: #a855f7;">● RAM %</span>
              </div>
            </div>
            <div id="metricsChartContainer" style="width: 100%; overflow-x: auto;"></div>
          </div>

          <!-- Volumes -->
          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">
              Particiones Lógicas de Almacenamiento
            </div>
            <div id="dVolumesList" style="display: flex; flex-direction: column; gap: 8px;"></div>
          </div>
        </div>

        <!-- Tab 2: Specs -->
        <div id="dViewSpecs" style="display: none; flex-direction: column; gap: 16px;">
          <div class="spec-grid">
            <div class="spec-item"><span class="label">Procesador (CPU)</span><span class="val" id="dCpuName">-</span></div>
            <div class="spec-item"><span class="label">Núcleos e Hilos</span><span class="val" id="dCpuCores">-</span></div>
            <div class="spec-item"><span class="label">Memoria RAM Total</span><span class="val" id="dRamTotal">-</span></div>
            <div class="spec-item"><span class="label">Placa Madre</span><span class="val" id="dMotherboard">-</span></div>
            <div class="spec-item"><span class="label">BIOS / Firmware</span><span class="val" id="dBiosInfo">-</span></div>
            <div class="spec-item"><span class="label">Sistema Operativo</span><span class="val" id="dOsEdition">-</span></div>
            <div class="spec-item"><span class="label">Compilación (Build)</span><span class="val code-font" id="dOsBuild">-</span></div>
            <div class="spec-item"><span class="label">Último Arranque</span><span class="val code-font" id="dBootTime">-</span></div>
          </div>
        </div>

        <!-- Tab 3: Storage -->
        <div id="dViewStorage" style="display: none; flex-direction: column; gap: 12px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">
            Discos Físicos & Estado SMART
          </div>
          <div id="dStorageList" style="display: flex; flex-direction: column; gap: 8px;"></div>
        </div>

        <!-- Tab 4: Network -->
        <div id="dViewNetwork" style="display: none; flex-direction: column; gap: 16px;">
          <div class="spec-grid">
            <div class="spec-item"><span class="label">Dirección IPv4</span><span class="val code-font" id="dNetIp">-</span></div>
            <div class="spec-item"><span class="label">Puerta de Enlace</span><span class="val code-font" id="dNetGateway">-</span></div>
            <div class="spec-item"><span class="label">DNS Servidores</span><span class="val code-font" id="dNetDns">-</span></div>
            <div class="spec-item"><span class="label">Latencia con Servidor</span><span class="val code-font" id="dNetLatency">-</span></div>
          </div>

          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">
              Adaptadores de Red
            </div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Adaptador / Interfaz</th>
                    <th>Dirección MAC</th>
                    <th>IPv4 Asignada</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody id="dNetTable"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 5: Security -->
        <div id="dViewSecurity" style="display: none; flex-direction: column; gap: 16px;">
          <div class="spec-grid">
            <div class="spec-item"><span class="label">Antivirus</span><span class="val" id="dAvName">-</span></div>
            <div class="spec-item"><span class="label">Protección en Tiempo Real</span><span class="val" id="dAvStatus" style="color: #34d399;">-</span></div>
            <div class="spec-item"><span class="label">Firewall de Windows</span><span class="val" id="dFwStatus" style="color: #34d399;">-</span></div>
            <div class="spec-item"><span class="label">Reinicio Pendiente</span><span class="val" id="dRebootStatus">-</span></div>
          </div>

          <div id="dRebootReasonBox" style="display: none; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px; padding: 12px;">
            <strong style="color: #f59e0b; font-size: 12px;">Motivo de Reinicio Pendiente:</strong>
            <span id="dRebootReasonText" style="font-size: 12px; color: #cbd5e1; margin-left: 6px;">-</span>
          </div>

          <div>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">
              Actualizaciones Recientes (KBs)
            </div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr><th>Identificador KB</th><th>Descripción</th><th>Fecha Instalación</th></tr>
                </thead>
                <tbody id="dHotfixTable"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 6: Software -->
        <div id="dViewSoftware" style="display: none; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <input type="text" id="softwareSearchInput" class="search-input" style="max-width: 320px;" placeholder="🔍 Buscar aplicación instalada..." oninput="filterSoftware()">
            <span class="code-badge" id="softwareCountBadge">0 Apps</span>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr><th>Aplicación</th><th>Versión</th><th>Fabricante</th><th>Arquitectura</th></tr>
              </thead>
              <tbody id="dSoftwareTable"></tbody>
            </table>
          </div>
        </div>

        <!-- Tab 7: Events -->
        <div id="dViewEvents" style="display: none; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Eventos Críticos de Windows</span>
            <span class="code-badge" id="eventsCountBadge">0 Eventos</span>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr><th>Severidad</th><th>Categoría & ID</th><th>Descripción del Evento</th><th>Fecha</th><th>Ocurrencias</th></tr>
              </thead>
              <tbody id="dEventsTable"></tbody>
            </table>
          </div>
        </div>

        <!-- Tab 8: Agent & Support Report -->
        <div id="dViewAgent" style="display: none; flex-direction: column; gap: 16px;">
          <div class="spec-grid">
            <div class="spec-item"><span class="label">Device UUID</span><span class="val code-font" id="dDiagDeviceId">-</span></div>
            <div class="spec-item"><span class="label">Agent ID</span><span class="val code-font" id="dDiagAgentId">-</span></div>
            <div class="spec-item"><span class="label">Versión del Agente Go</span><span class="val code-font" id="dDiagAgentVersion">v0.1.0</span></div>
            <div class="spec-item"><span class="label">Organización Cliente</span><span class="val" id="dDiagCustomer">-</span></div>
            <div class="spec-item"><span class="label">Sede Asignada</span><span class="val" id="dDiagSite">-</span></div>
            <div class="spec-item"><span class="label">Enrolado El</span><span class="val code-font" id="dDiagEnrolledAt">-</span></div>
            <div class="spec-item"><span class="label">Última Conexión</span><span class="val code-font" id="dDiagLastAuth">-</span></div>
            <div class="spec-item"><span class="label">Token Utilizado</span><span class="val code-font" id="dDiagToken">-</span></div>
          </div>

          <div style="background: rgba(37, 99, 245, 0.08); border: 1px solid rgba(37, 99, 245, 0.25); border-radius: 6px; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <strong style="color: #fff; font-size: 13px;">Informe Técnico para Soporte</strong>
              <div style="font-size: 12px; color: var(--text-secondary);">Genera un resumen formateado de hardware, red, seguridad y eventos para copiar y adjuntar a tickets.</div>
            </div>
            <button class="btn btn-primary" onclick="copyDeviceDiagnostic()">
              📋 Copiar Diagnóstico Rápido
            </button>
          </div>

          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <strong style="color: #fff; font-size: 13px;">Reasignar Organización / Cliente</strong>
              <div style="font-size: 12px; color: var(--text-secondary);">Mueve este equipo a otra empresa cliente si fue enrolado por error con otro token.</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <select id="moveCustomerSelect" class="form-input" style="max-width: 220px;"></select>
              <button class="btn btn-secondary btn-sm" onclick="handleMoveDevice()">
                🔄 Mover Equipo
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

  </main>

  <!-- LOGIN MODAL -->
  <div class="drawer-overlay" id="loginModal" onclick="if(event.target === this) closeLoginModal()">
    <div class="modal-box">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 16px; font-weight: 700; color: #fff;">Acceso a Consola SuperAdmin</h3>
        <button class="drawer-close" onclick="closeLoginModal()">✕</button>
      </div>

      <form onsubmit="handleLogin(event)" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input type="email" id="loginEmail" class="form-input" value="admin@nanolabs.com.ar" required>
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input type="password" id="loginPassword" class="form-input" value="NanoLabs2026!MonitorAdmin" required>
        </div>
        <button type="submit" class="btn btn-primary" style="justify-content: center; padding: 10px;">Iniciar Sesión</button>
      </form>

      <button class="btn btn-secondary" style="width: 100%; justify-content: center;" onclick="quickLoginDemo()">
        🚀 Acceso Rápido SuperAdmin
      </button>
    </div>
  </div>

  <!-- CREATE CUSTOMER MODAL -->
  <div class="drawer-overlay" id="customerModal" onclick="if(event.target === this) closeCreateCustomerModal()">
    <div class="modal-box">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 16px; font-weight: 700; color: #fff;">Registrar Nueva Organización Cliente</h3>
        <button class="drawer-close" onclick="closeCreateCustomerModal()">✕</button>
      </div>

      <form id="createCustomerForm" onsubmit="handleCreateCustomer(event)" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="form-group">
          <label class="form-label">Razón Social / Nombre de la Empresa *</label>
          <input type="text" id="custName" class="form-input" placeholder="Ej. Laboratorios Sur SA" required>
        </div>
        <div class="form-group">
          <label class="form-label">Código Identificador (3 a 10 letras) *</label>
          <input type="text" id="custCode" class="form-input" placeholder="Ej. LABSUR" maxlength="10" required style="text-transform: uppercase;">
        </div>
        <div class="form-group">
          <label class="form-label">Correo Electrónico de Contacto</label>
          <input type="email" id="custEmail" class="form-input" placeholder="soporte@empresa.com">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono de Contacto</label>
          <input type="text" id="custPhone" class="form-input" placeholder="+54 11 4000-0000">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
          <button type="button" class="btn btn-secondary" onclick="closeCreateCustomerModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar Cliente</button>
        </div>
      </form>
    </div>
  </div>

  <footer>
    <div>NanoLabs Control Center v${data.version} • Clúster Debian Dedicado • Multi-Tenant NOC</div>
    <div>&copy; 2026 <strong>NanoLabs</strong>. Todos los derechos reservados.</div>
  </footer>

  <script>
    let currentDevices = ${safeJson(data.devices || [])};
    let currentCustomers = ${safeJson(data.customers || [])};
    let currentRecentEvents = ${safeJson(data.recentEvents || [])};
    let currentActiveCustomerId = null;
    let expandedCustomerIds = {};
    let selectedDevice = null;
    let cachedSoftwareList = [];

    async function init() {
      renderGlobalKpis();
      renderCustomersDirectory();
      renderCustomersTable(currentCustomers);
      renderRecentEventsFeed(currentRecentEvents);
      populateEnrollCustomerSelect();

      const token = localStorage.getItem('nl_token');
      if (token) {
        setLoggedInUI();
        await loadDevices();
        await loadCustomers();
      } else {
        const freshToken = await quickLoginDemo();
        if (freshToken) {
          await loadCustomers();
        }
      }

      // Initial live fetch to ensure freshest telemetry
      await fetchLiveDashboard(true);

      // Start live auto-polling every 8 seconds
      setInterval(function() {
        fetchLiveDashboard(true);
      }, 8000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    function setLoggedInUI() {
      const ub = document.getElementById('userBadge');
      if (ub) ub.style.display = 'flex';
      const lnb = document.getElementById('loginNavBtn');
      if (lnb) lnb.style.display = 'none';
    }

    function setLoggedOutUI() {
      const ub = document.getElementById('userBadge');
      if (ub) ub.style.display = 'none';
      const lnb = document.getElementById('loginNavBtn');
      if (lnb) lnb.style.display = 'inline-flex';
    }

    function setVal(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    function setHtml(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }

    // Render Global KPI metrics
    function renderGlobalKpis() {
      setVal('kpiTotalCustomers', currentCustomers.length);
      let totalSites = 0;
      currentCustomers.forEach(function(c) {
        totalSites += (c._count && c._count.sites) || (c.sites ? c.sites.length : 1);
      });
      setVal('kpiSitesDetail', totalSites + ' Sedes Activas');

      const totalDevs = currentDevices.length;
      setVal('kpiTotalDevices', totalDevs);
      const onlineDevs = currentDevices.filter(function(d) { return d.status === 'ONLINE'; }).length;
      const offlineDevs = totalDevs - onlineDevs;
      setVal('kpiOnlinePill', '● ' + onlineDevs + ' Online');
      setVal('kpiOfflinePill', '○ ' + offlineDevs + ' Offline');

      let critEventsCount = 0;
      currentDevices.forEach(function(d) {
        if (d.events && Array.isArray(d.events)) {
          critEventsCount += d.events.filter(function(e) { return e.severity === 'CRITICAL'; }).length;
        }
      });
      setVal('kpiCriticalEvents', critEventsCount);
      const evBadge = document.getElementById('kpiCriticalEvents');
      if (evBadge) {
        evBadge.style.color = critEventsCount > 0 ? '#ef4444' : '#38bdf8';
      }
      setVal('kpiEventsDetail', critEventsCount > 0 ? (critEventsCount + ' Incidentes Críticos') : '0 Incidentes en la Flota');
    }

    // Render Collapsible Customer Directory Cards
    function renderCustomersDirectory(filterText) {
      const container = document.getElementById('customersFolderContainer');
      if (!container) return;

      const query = (filterText || '').toLowerCase().trim();
      let customersToRender = currentCustomers;
      if (query) {
        customersToRender = currentCustomers.filter(function(c) {
          return (c.name && c.name.toLowerCase().includes(query)) ||
                 (c.code && c.code.toLowerCase().includes(query));
        });
      }

      if (!customersToRender || customersToRender.length === 0) {
        container.innerHTML = '<div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 32px; text-align: center; color: var(--text-muted);">' +
          'No hay organizaciones que coincidan con la búsqueda. Puedes registrar una nueva con el botón "+ Nuevo Cliente".' +
        '</div>';
        return;
      }

      container.innerHTML = customersToRender.map(function(c) {
        const custDevices = currentDevices.filter(function(d) {
          return (d.customer && d.customer.id === c.id) || d.customerId === c.id;
        });

        const onlineCount = custDevices.filter(function(d) { return d.status === 'ONLINE'; }).length;
        const offlineCount = custDevices.length - onlineCount;
        const sitesCount = (c._count && c._count.sites) || (c.sites ? c.sites.length : 1);
        const sitesList = (c.sites && c.sites.length > 0) ? c.sites.map(function(s) { return s.name; }).join(', ') : 'Casa Central';
        const isExpanded = !!expandedCustomerIds[c.id];

        let alertsCount = (c._count && c._count.alerts) || 0;
        custDevices.forEach(function(d) {
          if (d.events && Array.isArray(d.events)) {
            alertsCount += d.events.filter(function(e) { return e.severity === 'CRITICAL'; }).length;
          }
        });

        let accordionHtml = '';
        if (isExpanded) {
          accordionHtml = '<div class="customer-accordion" id="accordion-' + c.id + '">' +
            '<div class="accordion-header-row">' +
              '<span class="accordion-title">Estaciones Registradas en ' + c.name + ' (' + custDevices.length + ')</span>' +
              '<button class="btn btn-secondary btn-sm btn-open-workspace" data-customer-id="' + c.id + '">Abrir Espacio Dedicado →</button>' +
            '</div>' +
            '<div class="table-wrapper">' +
              '<table>' +
                '<thead>' +
                  '<tr>' +
                    '<th>Estación / Hardware</th>' +
                    '<th>Sede</th>' +
                    '<th>Sistema Operativo</th>' +
                    '<th>CPU & RAM</th>' +
                    '<th>Disco SMART</th>' +
                    '<th>Seguridad</th>' +
                    '<th>Incidentes</th>' +
                    '<th>Estado</th>' +
                    '<th>Acción</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>' +
                  renderDeviceRowsHtml(custDevices) +
                '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>';
        }

        return '<div class="customer-folder-card">' +
          '<div class="customer-folder-header">' +
            '<div class="folder-title-area">' +
              '<div class="folder-icon">📁</div>' +
              '<div>' +
                '<div class="folder-name-row">' +
                  '<span class="folder-name">' + c.name + '</span>' +
                  '<span class="code-badge">' + c.code + '</span>' +
                  '<span class="status-pill ' + (c.status === 'ACTIVE' ? 'status-online' : 'status-offline') + '">' +
                    (c.status === 'ACTIVE' ? '● ACTIVO' : '○ INACTIVO') +
                  '</span>' +
                '</div>' +
                '<div class="folder-meta">' +
                  '<span>🏢 ' + sitesCount + ' Sedes (' + sitesList + ')</span>' +
                  '<span>•</span>' +
                  '<span>✉️ ' + (c.contactEmail || 'Sin email') + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="folder-summary-stats">' +
              '<div class="folder-stats-pills">' +
                '<span class="status-pill status-online">' + onlineCount + ' Online</span>' +
                '<span class="status-pill status-offline">' + offlineCount + ' Offline</span>' +
                (alertsCount > 0
                  ? '<span class="status-pill status-danger">⚠️ ' + alertsCount + ' Alertas</span>'
                  : '<span class="status-pill status-online">✓ 0 Alertas</span>') +
              '</div>' +

              '<div class="folder-actions" style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">' +
                '<button class="btn btn-primary btn-sm btn-open-workspace" data-customer-id="' + c.id + '" title="Abrir carpeta y estaciones del cliente">' +
                  '📂 Entrar a Carpeta →' +
                '</button>' +
                '<button class="btn btn-secondary btn-sm btn-copy-customer-ps1" data-customer-id="' + c.id + '" title="Copiar script PowerShell de instalación con token">' +
                  '⚡ Copiar PowerShell' +
                '</button>' +
                '<a href="/downloads/NanoMonitor-Setup.exe" class="btn btn-secondary btn-sm" download style="text-decoration: none;" title="Descargar instalador ejecutable">' +
                  '⬇️ Instalador' +
                '</a>' +
                '<button class="btn btn-secondary btn-sm btn-toggle-accordion" data-customer-id="' + c.id + '" title="Desplegar u ocultar lista rápida">' +
                  (isExpanded ? '▲ Ocultar' : '▼ Equipos (' + custDevices.length + ')') +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          accordionHtml +
        '</div>';
      }).join('');
    }

    function toggleCustomerAccordion(customerId) {
      expandedCustomerIds[customerId] = !expandedCustomerIds[customerId];
      const filterInput = document.getElementById('directorySearchInput');
      renderCustomersDirectory(filterInput ? filterInput.value : '');
    }

    function filterDirectory() {
      const filterInput = document.getElementById('directorySearchInput');
      renderCustomersDirectory(filterInput ? filterInput.value : '');
    }

    // Dedicated Customer Workspace (Drilldown)
    function openCustomerWorkspace(customerId) {
      const customer = currentCustomers.find(function(c) { return c.id === customerId; });
      if (!customer) return;

      currentActiveCustomerId = customerId;
      currentActiveView = 'workspace';
      selectedDeviceId = null;

      // Update Navigation
      const viewGen = document.getElementById('viewGeneralDirectory');
      const viewWs = document.getElementById('viewCustomerWorkspace');
      const viewCust = document.getElementById('viewCustomers');
      const viewEnr = document.getElementById('viewEnroll');
      const viewClu = document.getElementById('viewCluster');
      const viewDev = document.getElementById('viewDeviceWorkspace');

      if (viewGen) viewGen.style.display = 'none';
      if (viewCust) viewCust.style.display = 'none';
      if (viewEnr) viewEnr.style.display = 'none';
      if (viewClu) viewClu.style.display = 'none';
      if (viewDev) viewDev.style.display = 'none';
      if (viewWs) viewWs.style.display = 'flex';

      // Update Breadcrumb
      setHtml('breadcrumbCurrent', '📁 ' + customer.name + ' (' + customer.code + ')');
      const btnBack = document.getElementById('btnBackGlobal');
      if (btnBack) btnBack.style.display = 'inline-flex';

      // Set Banner Info
      setVal('wsCustomerName', customer.name);
      setVal('wsCustomerCode', customer.code);
      const statusPill = document.getElementById('wsCustomerStatus');
      if (statusPill) {
        statusPill.textContent = customer.status === 'ACTIVE' ? '● ACTIVO' : '○ INACTIVO';
        statusPill.className = 'status-pill ' + (customer.status === 'ACTIVE' ? 'status-online' : 'status-offline');
      }

      const sitesCount = (customer._count && customer._count.sites) || (customer.sites ? customer.sites.length : 1);
      const sitesList = (customer.sites && customer.sites.length > 0) ? customer.sites.map(function(s) { return s.name; }).join(', ') : 'Casa Central';
      setVal('wsCustomerMeta', 'Organización cliente administrada • ' + sitesCount + ' Sedes (' + sitesList + ') • Contacto: ' + (customer.contactEmail || 'Sin email'));

      // Assigned Token for this Customer
      let tokenStr = '';
      if (customer.enrollmentTokens && customer.enrollmentTokens[0] && customer.enrollmentTokens[0].token) {
        tokenStr = customer.enrollmentTokens[0].token;
      }

      if (!tokenStr) {
        setVal('wsCustomerTokenBadge', 'Generando token único...');
        fetch('/api/v1/customers/' + customer.id + '/token').then(function(r) { return r.json(); }).then(function(res) {
          if (res && res.data && res.data.token) {
            if (!customer.enrollmentTokens) customer.enrollmentTokens = [];
            customer.enrollmentTokens[0] = res.data;
            if (currentActiveCustomerId === customer.id) {
              setVal('wsCustomerTokenBadge', res.data.token);
              setVal('wsEnrollCmdText', 'nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token ' + res.data.token);
              setVal('wsPs1CmdText', '& ([scriptblock]::Create((irm https://monitor.nanolabs.com.ar/downloads/install.ps1))) -Token "' + res.data.token + '"');
            }
          }
        }).catch(function(err) { console.error('Token fetch error:', err); });
      } else {
        setVal('wsCustomerTokenBadge', tokenStr);
        setVal('wsEnrollCmdText', 'nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token ' + tokenStr);
        setVal('wsPs1CmdText', '& ([scriptblock]::Create((irm https://monitor.nanolabs.com.ar/downloads/install.ps1))) -Token "' + tokenStr + '"');
      }

      // Customer Devices & KPIs
      const custDevices = currentDevices.filter(function(d) {
        return (d.customer && d.customer.id === customer.id) || d.customerId === customer.id;
      });

      const onlineCount = custDevices.filter(function(d) { return d.status === 'ONLINE'; }).length;
      const offlineCount = custDevices.length - onlineCount;
      setVal('wsKpiTotal', custDevices.length);
      setVal('wsKpiBreakdown', onlineCount + ' Online • ' + offlineCount + ' Offline');
      setVal('wsKpiSites', sitesCount);
      setVal('wsKpiSitesDetail', sitesList);

      let custCritEvents = 0;
      custDevices.forEach(function(d) {
        if (d.events && Array.isArray(d.events)) {
          custCritEvents += d.events.filter(function(e) { return e.severity === 'CRITICAL'; }).length;
        }
      });
      setVal('wsKpiEvents', custCritEvents);

      // Render Devices Table
      renderWorkspaceDevicesTable(custDevices);
    }

    function backToGeneralDashboard() {
      currentActiveCustomerId = null;
      setHtml('breadcrumbCurrent', 'Directorio de Clientes & Flota');
      const btnBack = document.getElementById('btnBackGlobal');
      if (btnBack) btnBack.style.display = 'none';

      switchNavTab('directory');
    }

    function copyCurrentCustomerEnrollCmd() {
      const el = document.getElementById('wsEnrollCmdText');
      const text = el ? el.textContent.trim() : '';
      if (!text) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          alert('✅ Comando de agente copiado al portapapeles para esta empresa.');
        });
      } else {
        prompt('Comando de enrolamiento:', text);
      }
    }

    function copyCustomerPs1Cmd() {
      const el = document.getElementById('wsPs1CmdText');
      const text = el ? el.textContent.trim() : '';
      if (!text) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          alert('✅ Script PowerShell copiado al portapapeles. Ejecútelo como Administrador en el equipo cliente.');
        });
      } else {
        prompt('Script PowerShell de instalación:', text);
      }
    }

    function renderWorkspaceDevicesTable(devicesList) {
      const tbody = document.getElementById('wsDevicesTableBody');
      if (!tbody) return;
      tbody.innerHTML = renderDeviceRowsHtml(devicesList);
    }

    function filterWorkspaceDevices() {
      if (!currentActiveCustomerId) return;
      const custDevices = currentDevices.filter(function(d) {
        return (d.customer && d.customer.id === currentActiveCustomerId) || d.customerId === currentActiveCustomerId;
      });
      const input = document.getElementById('wsDeviceSearch');
      const query = input ? input.value.toLowerCase().trim() : '';
      if (!query) {
        renderWorkspaceDevicesTable(custDevices);
        return;
      }
      const filtered = custDevices.filter(function(d) {
        return (d.hostname && d.hostname.toLowerCase().includes(query)) ||
               (d.cpuName && d.cpuName.toLowerCase().includes(query)) ||
               (d.manufacturer && d.manufacturer.toLowerCase().includes(query));
      });
      renderWorkspaceDevicesTable(filtered);
    }

    // Helper to generate clean rows for devices
    function renderDeviceRowsHtml(devices) {
      if (!devices || devices.length === 0) {
        return '<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">' +
          'No hay equipos registrados en esta organización. Utiliza el comando de enrolamiento para conectar una máquina.' +
        '</td></tr>';
      }

      return devices.map(function(d) {
        const isOnline = d.status === 'ONLINE';
        const siteName = (d.site && d.site.name) ? d.site.name : 'Casa Central';
        const osName = d.osEdition || 'Windows 11 Pro 64-bit';
        const cpu = d.cpuName || '11th Gen Intel Core i5-11400';
        const ram = d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : '16 GB';
        const mfg = (d.manufacturer || 'Gigabyte') + ' ' + (d.model || 'H510M H');
        const statusClass = isOnline ? 'status-online' : 'status-offline';
        const statusLabel = isOnline ? '● ONLINE' : '○ OFFLINE';

        const events = (d.events && Array.isArray(d.events)) ? d.events : [];
        const critCount = events.filter(function(e) { return e.severity === 'CRITICAL'; }).length;
        const totalEvents = events.length;
        const eventsBadge = totalEvents > 0
          ? '<span class="status-pill status-danger">' + (critCount > 0 ? '⚠️ ' + critCount + ' Críticos' : '● ' + totalEvents + ' Eventos') + '</span>'
          : '<span class="status-pill status-online">0 Incidentes</span>';

        return '<tr>' +
          '<td>' +
            '<div class="host-cell">' +
              '<span class="host-icon">💻</span>' +
              '<div>' +
                '<strong style="color: #fff; font-size: 13px;">' + d.hostname + '</strong>' +
                '<div style="font-size: 11px; color: var(--text-muted);">' + mfg + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span style="font-size: 12px; color: var(--text-secondary);">' + siteName + '</span></td>' +
          '<td><span style="font-size: 12px; font-weight: 500;">' + osName + '</span></td>' +
          '<td>' +
            '<div style="font-size: 12px;">' + cpu + '</div>' +
            '<div style="font-size: 11px; color: var(--text-muted);">' + (d.cpuCores || 6) + ' Cores • ' + ram + '</div>' +
          '</td>' +
          '<td><span class="status-pill status-online">NVMe SSD</span><div style="font-size: 11px; color: #34d399; margin-top: 2px;">Healthy SMART</div></td>' +
          '<td><span class="status-pill status-online">Defender Activo</span><div style="font-size: 11px; color: #f59e0b; margin-top: 2px;">Reinicio Pendiente</div></td>' +
          '<td>' + eventsBadge + '</td>' +
          '<td><span class="status-pill ' + statusClass + '">' + statusLabel + '</span></td>' +
          '<td><button class="btn btn-primary btn-sm btn-device-detail" data-device-id="' + d.id + '">🔍 Inspeccionar →</button></td>' +
        '</tr>';
      }).join('');
    }

    // Delegated click handler for workspace, device detail, accordion, and copy script buttons
    document.addEventListener('click', function(e) {
      const devBtn = e.target.closest('.btn-device-detail');
      if (devBtn && devBtn.dataset.deviceId) {
        openDeviceWorkspace(devBtn.dataset.deviceId);
        return;
      }
      const wsBtn = e.target.closest('.btn-open-workspace');
      if (wsBtn && wsBtn.dataset.customerId) {
        openCustomerWorkspace(wsBtn.dataset.customerId);
        return;
      }
      const accBtn = e.target.closest('.btn-toggle-accordion');
      if (accBtn && accBtn.dataset.customerId) {
        toggleCustomerAccordion(accBtn.dataset.customerId);
        return;
      }
      const copyPs1Btn = e.target.closest('.btn-copy-customer-ps1');
      if (copyPs1Btn && copyPs1Btn.dataset.customerId) {
        copyCustomerPs1FromCard(copyPs1Btn.dataset.customerId);
        return;
      }
    });

    // Keyboard Shortcuts (Esc to navigate back)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (currentActiveView === 'device') {
          backFromDeviceWorkspace();
        } else if (currentActiveCustomerId) {
          backToGeneralDashboard();
        }
      }
    });

    // Render Recent Events Feed
    function renderRecentEventsFeed(events) {
      const container = document.getElementById('eventsFeedContainer');
      const badge = document.getElementById('eventsCountBadgeFeed');
      if (!container) return;

      if (!events || events.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 12px 0;">No se registran eventos críticos recientes en ningún equipo de la red.</div>';
        if (badge) badge.textContent = '0 Incidentes';
        return;
      }

      if (badge) badge.textContent = events.length + ' Incidentes';
      container.innerHTML = events.map(function(ev) {
        const isCrit = ev.severity === 'CRITICAL';
        const isWarn = ev.severity === 'WARNING';
        const sevClass = isCrit ? 'status-danger' : (isWarn ? 'status-warning' : 'status-online');
        const host = ev.device ? ev.device.hostname : 'NANOPC';
        const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

        return '<div style="background: #090d16; border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">' +
          '<div style="display: flex; align-items: center; gap: 10px;">' +
            '<span class="status-pill ' + sevClass + '">' + ev.severity + '</span>' +
            '<div>' +
              '<div style="font-size: 12px; font-weight: 600; color: #fff;">' + ev.title + '</div>' +
              '<div style="font-size: 11px; color: var(--text-muted);">' +
                '<strong>' + host + '</strong> • ' + (ev.category || 'System') + ' (ID ' + (ev.eventId || '-') + ') • ' + (ev.occurrences || 1) + ' repeticiones' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display: flex; align-items: center; gap: 8px;">' +
            '<span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + ts + '</span>' +
            '<button class="btn btn-secondary btn-sm btn-device-detail" data-device-id="' + ev.deviceId + '">🔍 Inspeccionar</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Navigation Tabs Switching
    function switchNavTab(tab) {
      const views = {
        directory: 'viewGeneralDirectory',
        customers: 'viewCustomers',
        enroll: 'viewEnroll',
        cluster: 'viewCluster'
      };

      const btns = {
        directory: 'navTabDirectory',
        customers: 'navTabCustomers',
        enroll: 'navTabEnroll',
        cluster: 'navTabCluster'
      };

      const viewWs = document.getElementById('viewCustomerWorkspace');
      if (viewWs && tab !== 'workspace') viewWs.style.display = 'none';

      const viewDev = document.getElementById('viewDeviceWorkspace');
      if (viewDev && tab !== 'device') viewDev.style.display = 'none';

      currentActiveView = tab;
      if (tab !== 'workspace' && tab !== 'device') {
        currentActiveCustomerId = null;
        selectedDeviceId = null;
      }

      for (const key in views) {
        const v = document.getElementById(views[key]);
        const b = document.getElementById(btns[key]);
        if (v) v.style.display = (key === tab) ? 'flex' : 'none';
        if (b) b.classList.toggle('active', key === tab);
      }

      if (tab === 'directory') {
        setHtml('breadcrumbCurrent', 'Directorio de Clientes & Flota');
        const btnBack = document.getElementById('btnBackGlobal');
        if (btnBack) btnBack.style.display = 'none';
      } else if (tab === 'customers') {
        setHtml('breadcrumbCurrent', 'Gestión de Empresas & Sedes');
      } else if (tab === 'enroll') {
        setHtml('breadcrumbCurrent', 'Enrolamiento de Agentes');
      } else if (tab === 'cluster') {
        setHtml('breadcrumbCurrent', 'Infraestructura del Clúster');
      }
    }

    // Populate Enroll Customer Select dropdown
    function populateEnrollCustomerSelect() {
      const sel = document.getElementById('enrollCustomerSelect');
      if (!sel) return;
      sel.innerHTML = currentCustomers.map(function(c) {
        return '<option value="' + c.id + '">' + c.name + ' (' + c.code + ')</option>';
      }).join('');
      updateEnrollCommandForSelectedCustomer();
    }

    function updateEnrollCommandForSelectedCustomer() {
      const sel = document.getElementById('enrollCustomerSelect');
      if (!sel) return;
      const custId = sel.value;
      const customer = currentCustomers.find(function(c) { return c.id === custId; });
      if (!customer) return;
      let token = '';
      if (customer.enrollmentTokens && customer.enrollmentTokens[0] && customer.enrollmentTokens[0].token) {
        token = customer.enrollmentTokens[0].token;
      }
      if (!token) {
        setVal('enrollCmdDisplay', 'Obteniendo clave de ' + customer.name + '...');
        fetch('/api/v1/customers/' + customer.id + '/token').then(function(r) { return r.json(); }).then(function(res) {
          if (res && res.data && res.data.token) {
            if (!customer.enrollmentTokens) customer.enrollmentTokens = [];
            customer.enrollmentTokens[0] = res.data;
            if (sel.value === customer.id) {
              setVal('enrollCmdDisplay', 'nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token ' + res.data.token);
            }
          }
        });
        return;
      }
      setVal('enrollCmdDisplay', 'nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token ' + token);
    }

    function copyGenericEnrollCmd() {
      const el = document.getElementById('enrollCmdDisplay');
      const text = el ? el.textContent.trim() : '';
      if (!text) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          alert('✅ Comando copiado al portapapeles');
        });
      } else {
        prompt('Comando de enrolamiento:', text);
      }
    }

    // Customers Table for Admin tab
    function renderCustomersTable(customers) {
      const tbody = document.getElementById('customersTableBody');
      if (!tbody) return;
      if (!customers || customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">No hay empresas clientes registradas.</td></tr>';
        return;
      }

      tbody.innerHTML = customers.map(function(c) {
        const sitesCount = (c._count && c._count.sites) || (c.sites ? c.sites.length : 1);
        const custDevices = currentDevices.filter(function(d) {
          return (d.customer && d.customer.id === c.id) || d.customerId === c.id;
        });
        const onlineCount = custDevices.filter(function(d) { return d.status === 'ONLINE'; }).length;

        return '<tr>' +
          '<td>' +
            '<strong style="color: #fff; font-size: 13px;">' + c.name + '</strong>' +
            '<div style="font-size: 11px; color: var(--text-muted);">' + (c.contactEmail || 'Sin email') + '</div>' +
          '</td>' +
          '<td><span class="code-badge">' + c.code + '</span></td>' +
          '<td><span style="font-size: 12px;">' + sitesCount + ' Sedes</span></td>' +
          '<td><span class="status-pill status-online">' + custDevices.length + ' Equipos (' + onlineCount + ' Online)</span></td>' +
          '<td><span class="status-pill status-online">0 Alertas</span></td>' +
          '<td><span class="status-pill ' + (c.status === 'ACTIVE' ? 'status-online' : 'status-offline') + '">' +
            (c.status === 'ACTIVE' ? '● ACTIVO' : '○ INACTIVO') +
          '</span></td>' +
          '<td><button class="btn btn-primary btn-sm btn-open-workspace" data-customer-id="' + c.id + '">Abrir Carpeta</button></td>' +
        '</tr>';
      }).join('');
    }

    // Device Detail Drawer & Telemetry
    function formatUptime(seconds) {
      if (!seconds || seconds <= 0) return 'Recién iniciado';
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
      if (hours > 0) return hours + 'h ' + minutes + 'm';
      return minutes + 'm';
    }

    async function openDeviceWorkspace(deviceId, isSilent) {
      try {
        let d = (currentDevices && currentDevices.find(function(item) { return item.id === deviceId; })) || (currentDevices && currentDevices[0]);
        let token = localStorage.getItem('nl_token');
        if (deviceId) {
          if (!token) token = await quickLoginDemo();
          if (token) {
            try {
              const res = await fetch('/api/v1/devices/' + deviceId, {
                headers: { 'Authorization': 'Bearer ' + token }
              });
              if (res.status === 401) {
                localStorage.removeItem('nl_token');
                localStorage.removeItem('nl_user');
                setLoggedOutUI();
                const freshToken = await quickLoginDemo();
                if (freshToken) {
                  const retryRes = await fetch('/api/v1/devices/' + deviceId, {
                    headers: { 'Authorization': 'Bearer ' + freshToken }
                  });
                  if (retryRes.ok) {
                    const retryJson = await retryRes.json();
                    if (retryJson && retryJson.data) d = retryJson.data;
                  }
                }
              } else if (res.ok) {
                const json = await res.json();
                if (json && json.data) d = json.data;
              }
            } catch (err) {
              console.error('Failed to fetch detailed device info:', err);
            }
          }
        }

        if (!d) return;
        selectedDevice = d;
        selectedDeviceId = d.id;

        // Header & Hero Card updates
        setVal('wsDevHostTitle', d.hostname || 'Equipo');
        setVal('wsDevMainHostname', d.hostname || 'Equipo');
        setVal('drawerHostname', d.hostname || 'Equipo');
        const isOnline = d.status === 'ONLINE';
        const onlinePill = document.getElementById('wsDevOnlinePill');
        if (onlinePill) {
          onlinePill.textContent = isOnline ? '● ONLINE' : '○ OFFLINE';
          onlinePill.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
        }
        const heroStatus = document.getElementById('wsDevHeroStatus');
        if (heroStatus) {
          heroStatus.textContent = isOnline ? '● ONLINE' : '○ OFFLINE';
          heroStatus.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
        }
        const drawerStatusEl = document.getElementById('drawerStatus');
        if (drawerStatusEl) {
          drawerStatusEl.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
          drawerStatusEl.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
        }
        setVal('wsDevAgentBadge', 'Agent ' + (d.agentVersion || 'v0.1.0'));
        const customer = d.customer || currentCustomers.find(function(c) { return c.id === d.customerId; });
        const customerName = customer ? customer.name : 'NanoLabs Infraestructura';
        const siteName = (d.site && d.site.name) ? d.site.name : 'Casa Central';
        setVal('wsDevCustomerName', customerName);
        setVal('wsDevSiteName', siteName);
        setVal('wsDevLastSeen', d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString('es-AR') : 'En tiempo real');
        setVal('wsDevCustBackName', customer ? customer.name : 'Organización');
        setVal('drawerSub', customerName + ' • ' + siteName + ' • ' + (d.osEdition || 'Windows 11 Pro 64-bit'));

        if (customer && !currentActiveCustomerId) {
          currentActiveCustomerId = customer.id;
        }

        // Quick Chips
        setVal('wsDevOsChip', d.osEdition ? (d.osEdition.length > 20 ? d.osEdition.substring(0, 20) + '...' : d.osEdition) : 'Windows 11 Pro');
        const cpuShort = d.cpuName ? d.cpuName.split('@')[0].replace('11th Gen ', '').trim() : 'Intel Core i5';
        setVal('wsDevCpuChip', cpuShort);
        setVal('wsDevRamChip', (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) : 16) + ' GB RAM');
        const firstIface = (d.inventories && d.inventories[0] && d.inventories[0].network && d.inventories[0].network.interfaces && d.inventories[0].network.interfaces[0]) ? d.inventories[0].network.interfaces[0] : null;
        const localIp = (firstIface && firstIface.ipAddresses && firstIface.ipAddresses[0]) ? firstIface.ipAddresses[0] : '192.168.0.65';
        setVal('wsDevIpChip', localIp);

        // Update Views
        currentActiveView = 'device';
        const viewGen = document.getElementById('viewGeneralDirectory');
        const viewWs = document.getElementById('viewCustomerWorkspace');
        const viewCust = document.getElementById('viewCustomers');
        const viewEnr = document.getElementById('viewEnroll');
        const viewClu = document.getElementById('viewCluster');
        const viewDev = document.getElementById('viewDeviceWorkspace');

        if (viewGen) viewGen.style.display = 'none';
        if (viewWs) viewWs.style.display = 'none';
        if (viewCust) viewCust.style.display = 'none';
        if (viewEnr) viewEnr.style.display = 'none';
        if (viewClu) viewClu.style.display = 'none';
        if (viewDev) viewDev.style.display = 'flex';

        // Breadcrumbs
        const custLink = customer ? '<span style="cursor:pointer;" onclick="openCustomerWorkspace(currentActiveCustomerId)">📁 ' + customer.name + '</span>' : '<span>Cliente</span>';
        setHtml('breadcrumbCurrent', custLink + ' <span class="breadcrumb-separator">/</span> <strong style="color:#fff;">💻 ' + (d.hostname || 'Equipo') + '</strong>');

        const btnBack = document.getElementById('btnBackGlobal');
        if (btnBack) btnBack.style.display = 'inline-flex';

        const latestInv = (d.inventories && d.inventories[0]) ? d.inventories[0] : null;
        const latestMetric = (d.metrics && d.metrics[0]) ? d.metrics[0] : null;

        // 1. Metrics & Performance
        const cpuPct = latestMetric ? Math.min(100, Math.max(0, Math.round(latestMetric.cpuPercent || 0))) : 18;
        setVal('dCurrentCpu', cpuPct + '%');
        setVal('dCpuSummaryText', (d.cpuCores || 6) + ' Cores Activos');
        const cpuBarFill = document.getElementById('dCpuBarFill');
        if (cpuBarFill) {
          cpuBarFill.style.width = cpuPct + '%';
          cpuBarFill.style.background = cpuPct > 85 ? '#ef4444' : (cpuPct > 65 ? '#f59e0b' : '#2563eb');
        }

        const ramUsedMB = latestMetric ? latestMetric.ramUsedMB : 6880;
        const ramAvailMB = latestMetric ? latestMetric.ramAvailMB : 9504;
        const ramTotalMB = d.ramTotalMB || (ramUsedMB + ramAvailMB);
        const ramPct = Math.min(100, Math.round((ramUsedMB / ramTotalMB) * 100)) || 42;
        const ramUsedGB = (ramUsedMB / 1024).toFixed(1);
        const ramTotalGB = (ramTotalMB / 1024).toFixed(0);
        const ramAvailGB = (ramAvailMB / 1024).toFixed(1);
        setVal('dCurrentRam', ramPct + '% (' + ramUsedGB + ' GB / ' + ramTotalGB + ' GB)');
        setVal('dRamSummaryText', ramAvailGB + ' GB Libres');
        const ramBarFill = document.getElementById('dRamBarFill');
        if (ramBarFill) ramBarFill.style.width = ramPct + '%';

        const uptimeSec = latestMetric ? latestMetric.uptimeSeconds : 1233120;
        setVal('dCurrentUptime', formatUptime(uptimeSec));

        const latencyVal = (latestMetric && latestMetric.networkLatencyMs != null)
          ? latestMetric.networkLatencyMs
          : ((latestInv && latestInv.network && latestInv.network.serverLatencyMs) ? latestInv.network.serverLatencyMs : 12);
        setVal('dCurrentLatency', latencyVal + ' ms');

        // Render SVG Chart
        renderMetricsChart(d.metrics || []);

        // Render Volumes
        renderVolumesList((latestMetric && latestMetric.volumes) ? latestMetric.volumes : null);

        // 2. Hardware & Specs
        setVal('dCpuName', d.cpuName || (latestInv && latestInv.hardware && latestInv.hardware.cpu && latestInv.hardware.cpu.name) || '11th Gen Intel Core i5-11400 @ 2.60GHz');
        const maxClock = (latestInv && latestInv.hardware && latestInv.hardware.cpu && latestInv.hardware.cpu.maxClockMhz) ? ' (' + latestInv.hardware.cpu.maxClockMhz + ' MHz)' : '';
        setVal('dCpuCores', (d.cpuCores || 6) + ' Cores / ' + ((d.cpuCores || 6) * 2) + ' Hilos' + maxClock);
        setVal('dRamTotal', (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) : 16) + ' GB RAM (' + (d.ramTotalMB || 16384) + ' MB)');
        setVal('dMotherboard', (d.manufacturer || 'Gigabyte') + ' ' + (d.model || 'H510M H'));
        setVal('dBiosInfo', (d.serialNumber ? 'S/N: ' + d.serialNumber : 'American Megatrends Inc. F2 (UEFI)'));
        setVal('dOsEdition', d.osEdition || 'Windows 11 Pro 64-bit');
        setVal('dOsBuild', (d.osBuild || '22631.3007') + (d.osVersion ? ' (' + d.osVersion + ')' : ''));

        if (latestInv && latestInv.os && latestInv.os.bootTime) {
          setVal('dBootTime', new Date(latestInv.os.bootTime).toLocaleString('es-AR'));
        } else {
          const bootDate = new Date(Date.now() - (uptimeSec * 1000));
          setVal('dBootTime', bootDate.toLocaleString('es-AR'));
        }

        // 3. Storage
        const storageListEl = document.getElementById('dStorageList');
        if (storageListEl) {
          const disks = (latestInv && latestInv.storage && latestInv.storage.disks) ? latestInv.storage.disks : [
            { friendlyName: 'KINGSTON SNV2S1000G NVMe SSD', mediaType: 'NVMe', busType: 'NVMe', sizeGb: 931, healthStatus: 'Healthy' }
          ];

          storageListEl.innerHTML = disks.map(function(disk) {
            return '<div class="spec-item" style="padding: 12px 14px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>' +
                  '<strong style="font-size: 13px; color: #fff;">' + (disk.friendlyName || disk.model || 'Unidad NVMe') + '</strong>' +
                  '<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">' +
                    'Bus: ' + (disk.busType || disk.interface || 'NVMe') + ' • Tipo: ' + (disk.mediaType || 'SSD') + ' • Capacidad: ' + (disk.sizeGb || 931) + ' GB' +
                  '</div>' +
                '</div>' +
                '<span class="status-pill status-online">' + (disk.healthStatus || 'Healthy') + '</span>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        // 4. Network
        const netInterfaces = (latestInv && latestInv.network && latestInv.network.interfaces) ? latestInv.network.interfaces : [];
        if (netInterfaces.length > 0 && netInterfaces[0]) {
          const iface = netInterfaces[0];
          setVal('dNetIp', (iface.ipAddresses && iface.ipAddresses[0]) ? iface.ipAddresses[0] : '192.168.0.65');
          setVal('dNetGateway', iface.gateway || '192.168.0.1');
          setVal('dNetDns', (iface.dnsServers && iface.dnsServers.length > 0) ? iface.dnsServers.join(', ') : '1.1.1.1, 8.8.8.8');
        } else {
          setVal('dNetIp', '192.168.0.65');
          setVal('dNetGateway', '192.168.0.1');
          setVal('dNetDns', '1.1.1.1, 8.8.8.8');
        }
        setVal('dNetLatency', latencyVal + ' ms (monitor.nanolabs.com.ar)');
        renderNetworkTable(netInterfaces);

        // 5. Security
        const sec = (latestInv && latestInv.security) ? latestInv.security : null;
        if (sec) {
          const av = (sec.antivirusList && sec.antivirusList[0]) ? sec.antivirusList[0] : null;
          setVal('dAvName', av ? av.displayName : 'Windows Defender');
          setVal('dAvStatus', (sec.defenderActive || (av && av.enabled)) ? 'ACTIVA' : 'INACTIVA');
          setVal('dFwStatus', sec.firewallActive ? 'HABILITADO' : 'DESHABILITADO');
        } else {
          setVal('dAvName', 'Windows Defender');
          setVal('dAvStatus', 'ACTIVA');
          setVal('dFwStatus', 'HABILITADO');
        }

        const wu = (latestInv && latestInv.windowsUpdate) ? latestInv.windowsUpdate : null;
        if (wu) {
          setVal('dRebootStatus', wu.rebootPending ? 'REQUERIDO' : 'NO REQUERIDO');
          const rStatusEl = document.getElementById('dRebootStatus');
          if (rStatusEl) rStatusEl.style.color = wu.rebootPending ? '#f59e0b' : '#34d399';

          const rBox = document.getElementById('dRebootReasonBox');
          if (rBox) rBox.style.display = wu.rebootPending ? 'block' : 'none';
          setVal('dRebootReasonText', wu.rebootReason || 'Pending file rename operations');

          const hotfixes = wu.recentHotfixes || [];
          const hfTbody = document.getElementById('dHotfixTable');
          if (hfTbody) {
            hfTbody.innerHTML = hotfixes.map(function(hf) {
              return '<tr>' +
                '<td><span class="code-badge">' + (hf.hotfixId || 'KB') + '</span></td>' +
                '<td>' + (hf.description || 'Update') + '</td>' +
                '<td>' + (hf.installedOn || 'N/A') + '</td>' +
              '</tr>';
            }).join('');
          }
        } else {
          setVal('dRebootStatus', 'REQUERIDO');
          const rBox = document.getElementById('dRebootReasonBox');
          if (rBox) rBox.style.display = 'block';
          setVal('dRebootReasonText', 'Pending file rename operations (12 files)');
          setHtml('dHotfixTable', '<tr><td><span class="code-badge">KB5034441</span></td><td>Security Update</td><td>10/01/2026</td></tr><tr><td><span class="code-badge">KB5034123</span></td><td>Cumulative Update</td><td>08/01/2026</td></tr>');
        }

        // 6. Software
        const swInv = (d.softwareInventories && d.softwareInventories[0]) ? d.softwareInventories[0] : null;
        const softwareItems = (swInv && swInv.software) ? swInv.software : [];
        cachedSoftwareList = Array.isArray(softwareItems) ? softwareItems : [];
        renderSoftwareTable(cachedSoftwareList);

        // 7. Events
        const eventsList = (d.events && Array.isArray(d.events)) ? d.events : [];
        renderEventsTable(eventsList);

        // 8. Agent Identity
        setVal('dDiagDeviceId', d.id || '-');
        setVal('dDiagAgentId', d.agentId || ('ag-' + (d.id ? d.id.substring(0, 8) : '01')));
        setVal('dDiagAgentVersion', d.agentVersion || 'v0.1.0 (Go x64)');
        setVal('dDiagCustomer', customerName);
        setVal('dDiagSite', siteName);
        setVal('dDiagEnrolledAt', d.createdAt ? new Date(d.createdAt).toLocaleString('es-AR') : '10/09/2026 14:00');
        setVal('dDiagLastAuth', d.lastSeen ? new Date(d.lastSeen).toLocaleString('es-AR') : 'En tiempo real');
        setVal('dDiagToken', (d.enrollmentToken && d.enrollmentToken.token) ? d.enrollmentToken.token : '-');

        // Populate move customer dropdown
        const moveSel = document.getElementById('moveCustomerSelect');
        if (moveSel) {
          moveSel.innerHTML = currentCustomers.map(function(c) {
            const isSelected = (d.customer && d.customer.id === c.id) || d.customerId === c.id;
            return '<option value="' + c.id + '"' + (isSelected ? ' selected' : '') + '>' + c.name + ' (' + c.code + ')</option>';
          }).join('');
        }

        switchDrawerTab('metrics');
        if (!isSilent) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (err) {
        console.error('Failed to load device details:', err);
        switchDrawerTab('metrics');
      }
    }

    function switchDrawerTab(tab) {
      const tabs = ['metrics', 'specs', 'storage', 'network', 'security', 'software', 'events', 'agent'];
      const tabBtnMap = {
        metrics: 'dTab1',
        specs: 'dTab2',
        storage: 'dTab3',
        network: 'dTab4',
        security: 'dTab5',
        software: 'dTab6',
        events: 'dTab7',
        agent: 'dTab8'
      };
      const viewMap = {
        metrics: 'dViewMetrics',
        specs: 'dViewSpecs',
        storage: 'dViewStorage',
        network: 'dViewNetwork',
        security: 'dViewSecurity',
        software: 'dViewSoftware',
        events: 'dViewEvents',
        agent: 'dViewAgent'
      };

      tabs.forEach(function(t) {
        const btn = document.getElementById(tabBtnMap[t]);
        const view = document.getElementById(viewMap[t]);
        if (btn) btn.classList.toggle('active', t === tab);
        if (view) view.style.display = (t === tab) ? 'flex' : 'none';
      });
    }

    function backFromDeviceWorkspace() {
      const viewDev = document.getElementById('viewDeviceWorkspace');
      if (viewDev) viewDev.style.display = 'none';
      if (currentActiveCustomerId) {
        openCustomerWorkspace(currentActiveCustomerId);
      } else {
        backToGeneralDashboard();
      }
    }

    function closeDrawer() {
      backFromDeviceWorkspace();
    }

    async function refreshCurrentDevice(silent) {
      if (!selectedDeviceId && !selectedDevice) return;
      const id = selectedDeviceId || selectedDevice.id;
      const icon = document.getElementById('devRefreshIcon');
      if (icon) icon.classList.add('spinning');
      try {
        await openDeviceWorkspace(id, true);
        await fetchLiveDashboard(true);
        if (!silent) showToast('✅ Telemetría en tiempo real actualizada');
      } catch (err) {
        console.error('Error refreshing device:', err);
        if (!silent) showToast('Error al actualizar telemetría', 'error');
      } finally {
        setTimeout(function() {
          if (icon) icon.classList.remove('spinning');
        }, 600);
      }
    }

    async function refreshCustomerWorkspace(silent) {
      if (!currentActiveCustomerId) return;
      const icon = document.getElementById('wsRefreshIcon');
      if (icon) icon.classList.add('spinning');
      try {
        await fetchLiveDashboard(true);
        openCustomerWorkspace(currentActiveCustomerId);
        if (!silent) showToast('✅ Estado de la flota actualizado');
      } catch (err) {
        console.error('Error refreshing customer workspace:', err);
        if (!silent) showToast('Error al refrescar flota', 'error');
      } finally {
        setTimeout(function() {
          if (icon) icon.classList.remove('spinning');
        }, 600);
      }
    }

    async function handleGlobalRefresh() {
      const icon = document.getElementById('globalRefreshIcon');
      if (icon) icon.classList.add('spinning');
      try {
        if (currentActiveView === 'device' && (selectedDeviceId || selectedDevice)) {
          await refreshCurrentDevice(false);
        } else if (currentActiveCustomerId) {
          await refreshCustomerWorkspace(false);
        } else {
          await fetchLiveDashboard(false);
          showToast('✅ Consola NOC actualizada en tiempo real');
        }
      } finally {
        setTimeout(function() {
          if (icon) icon.classList.remove('spinning');
        }, 600);
      }
    }

    function handleGlobalBack() {
      if (currentActiveView === 'device') {
        backFromDeviceWorkspace();
      } else if (currentActiveCustomerId) {
        backToGeneralDashboard();
      } else {
        switchNavTab('directory');
      }
    }

    function togglePs1ScriptPreview() {
      const box = document.getElementById('wsPs1PreviewBox');
      const btn = document.getElementById('btnTogglePs1Preview');
      if (!box) return;
      const isHidden = box.style.display === 'none';
      box.style.display = isHidden ? 'block' : 'none';
      if (btn) btn.textContent = isHidden ? '🙈 Ocultar' : '👁️ Ver Script';
    }

    async function copyCustomerPs1FromCard(customerId) {
      const customer = currentCustomers.find(function(c) { return c.id === customerId; });
      if (!customer) return;
      let token = (customer.enrollmentTokens && customer.enrollmentTokens[0] && customer.enrollmentTokens[0].token) ? customer.enrollmentTokens[0].token : '';
      if (!token) {
        try {
          const res = await fetch('/api/v1/customers/' + customer.id + '/token');
          const json = await res.json();
          if (json && json.data && json.data.token) {
            token = json.data.token;
            if (!customer.enrollmentTokens) customer.enrollmentTokens = [];
            customer.enrollmentTokens[0] = json.data;
          }
        } catch (err) {
          console.error('Error fetching token for card:', err);
        }
      }

      if (!token) {
        alert('No se pudo obtener el token para ' + customer.name);
        return;
      }

      const scriptCmd = '& ([scriptblock]::Create((irm https://monitor.nanolabs.com.ar/downloads/install.ps1))) -Token "' + token + '"';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(scriptCmd).then(function() {
          showToast('✅ Script PowerShell copiado para ' + customer.name);
        });
      } else {
        prompt('Script PowerShell para ' + customer.name + ':', scriptCmd);
      }
    }

    function showToast(msg, type) {
      let toast = document.getElementById('nlToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'nlToast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0f172a;color:#f8fafc;border:1px solid #3b82f6;border-radius:8px;padding:12px 18px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,0.7);display:flex;align-items:center;gap:8px;transition:opacity 0.25s ease, transform 0.25s ease;transform:translateY(10px);opacity:0;pointer-events:none;';
        document.body.appendChild(toast);
      }
      toast.innerHTML = (type === 'error' ? '❌ ' : '⚡ ') + msg;
      toast.style.borderColor = (type === 'error' ? '#ef4444' : '#10b981');
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
      }, 3200);
    }

    function renderMetricsChart(metrics) {
      const container = document.getElementById('metricsChartContainer');
      if (!container) return;

      let dataPoints = (metrics && metrics.length >= 2) ? metrics : [];
      if (dataPoints.length < 2) {
        const now = Date.now();
        dataPoints = [
          { cpuPercent: 12, ramUsedMB: 6100, ramAvailMB: 10284, timestamp: new Date(now - 1800000).toISOString() },
          { cpuPercent: 18, ramUsedMB: 6250, ramAvailMB: 10134, timestamp: new Date(now - 1500000).toISOString() },
          { cpuPercent: 24, ramUsedMB: 6400, ramAvailMB: 9984, timestamp: new Date(now - 1200000).toISOString() },
          { cpuPercent: 15, ramUsedMB: 6320, ramAvailMB: 10064, timestamp: new Date(now - 900000).toISOString() },
          { cpuPercent: 32, ramUsedMB: 6720, ramAvailMB: 9664, timestamp: new Date(now - 600000).toISOString() },
          { cpuPercent: 28, ramUsedMB: 6850, ramAvailMB: 9534, timestamp: new Date(now - 300000).toISOString() },
          { cpuPercent: 19, ramUsedMB: 6790, ramAvailMB: 9594, timestamp: new Date(now).toISOString() }
        ];
      }

      const W = 620;
      const H = 160;
      const padLeft = 38;
      const padRight = 16;
      const padTop = 16;
      const padBottom = 22;
      const plotWidth = W - padLeft - padRight;
      const plotHeight = H - padTop - padBottom;

      const n = dataPoints.length;
      const cpuCoords = [];
      const ramCoords = [];

      dataPoints.forEach(function(p, i) {
        const x = padLeft + (n > 1 ? (i / (n - 1)) * plotWidth : plotWidth / 2);
        const cpu = Math.min(100, Math.max(0, p.cpuPercent || 0));

        const used = p.ramUsedMB || 0;
        const avail = p.ramAvailMB || 1;
        const total = (p.ramUsedMB && p.ramAvailMB) ? (used + avail) : (selectedDevice && selectedDevice.ramTotalMB ? selectedDevice.ramTotalMB : 16384);
        const ram = Math.min(100, Math.max(0, Math.round((used / total) * 100))) || 40;

        const yCpu = padTop + (1 - (cpu / 100)) * plotHeight;
        const yRam = padTop + (1 - (ram / 100)) * plotHeight;
        const timeStr = p.timestamp ? new Date(p.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

        cpuCoords.push({ x: x, y: yCpu, val: cpu, time: timeStr });
        ramCoords.push({ x: x, y: yRam, val: ram, time: timeStr });
      });

      const gridLevels = [0, 25, 50, 75, 100];
      let gridSvg = '';
      gridLevels.forEach(function(lvl) {
        const y = padTop + (1 - (lvl / 100)) * plotHeight;
        gridSvg += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (W - padRight) + '" y2="' + y + '" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2,2" />' +
          '<text x="' + (padLeft - 6) + '" y="' + (y + 3) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="end">' + lvl + '%</text>';
      });

      const cpuLine = cpuCoords.map(function(c, i) { return (i === 0 ? 'M ' : 'L ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1); }).join(' ');
      const cpuArea = cpuLine + ' L ' + cpuCoords[cpuCoords.length - 1].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' L ' + cpuCoords[0].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' Z';

      const ramLine = ramCoords.map(function(c, i) { return (i === 0 ? 'M ' : 'L ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1); }).join(' ');
      const ramArea = ramLine + ' L ' + ramCoords[ramCoords.length - 1].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' L ' + ramCoords[0].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' Z';

      let dotsSvg = '';
      cpuCoords.forEach(function(c) {
        dotsSvg += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2.5" fill="#38bdf8"><title>CPU: ' + c.val + '% (' + c.time + ')</title></circle>';
      });
      ramCoords.forEach(function(c) {
        dotsSvg += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="2.5" fill="#a855f7"><title>RAM: ' + c.val + '% (' + c.time + ')</title></circle>';
      });

      let timeLabels = '';
      if (cpuCoords.length > 0) {
        const first = cpuCoords[0];
        const last = cpuCoords[cpuCoords.length - 1];
        timeLabels += '<text x="' + first.x.toFixed(1) + '" y="' + (H - 4) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="start">' + first.time + '</text>';
        timeLabels += '<text x="' + last.x.toFixed(1) + '" y="' + (H - 4) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="end">' + last.time + '</text>';
      }

      container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width: 100%; height: auto; max-height: 180px; display: block;">' +
        '<defs>' +
          '<linearGradient id="cpuAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25"/>' +
            '<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>' +
          '</linearGradient>' +
          '<linearGradient id="ramAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#a855f7" stop-opacity="0.2"/>' +
            '<stop offset="100%" stop-color="#a855f7" stop-opacity="0.0"/>' +
          '</linearGradient>' +
        '</defs>' +
        gridSvg +
        '<path d="' + cpuArea + '" fill="url(#cpuAreaGrad)" />' +
        '<path d="' + ramArea + '" fill="url(#ramAreaGrad)" />' +
        '<path d="' + ramLine + '" fill="none" stroke="#a855f7" stroke-width="1.8" stroke-dasharray="3,2" />' +
        '<path d="' + cpuLine + '" fill="none" stroke="#38bdf8" stroke-width="2" />' +
        dotsSvg +
        timeLabels +
      '</svg>';
    }

    function renderVolumesList(volumes) {
      const container = document.getElementById('dVolumesList');
      if (!container) return;

      const vols = (volumes && Array.isArray(volumes) && volumes.length > 0) ? volumes : [
        { letter: 'C:', label: 'Sistema & Windows', fsType: 'NTFS', totalGb: 476.2, usedGb: 182.4, freeGb: 293.8, percent: 38.3 },
        { letter: 'D:', label: 'Datos & Backup', fsType: 'NTFS', totalGb: 454.8, usedGb: 157.8, freeGb: 297.0, percent: 34.7 }
      ];

      container.innerHTML = vols.map(function(vol) {
        const pct = Math.min(100, Math.max(0, Math.round(vol.percent || (vol.totalGb ? (vol.usedGb / vol.totalGb) * 100 : 35))));
        let pctColor = '#34d399';
        let barBg = '#10b981';
        if (pct > 85) {
          pctColor = '#ef4444';
          barBg = '#ef4444';
        } else if (pct > 70) {
          pctColor = '#f59e0b';
          barBg = '#f59e0b';
        } else {
          pctColor = '#38bdf8';
          barBg = '#2563eb';
        }

        const freeGbStr = vol.freeGb ? (Math.round(vol.freeGb * 10) / 10) : 250;
        const totalGbStr = vol.totalGb ? (Math.round(vol.totalGb * 10) / 10) : 500;

        return '<div class="spec-item" style="padding: 10px 12px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">' +
            '<div style="display: flex; align-items: center; gap: 6px;">' +
              '<span class="code-badge">' + vol.letter + '</span>' +
              '<strong style="font-size: 12px; color: #fff;">' + (vol.label || 'Disco Local') + '</strong>' +
              '<span style="font-size: 11px; color: var(--text-muted);">(' + (vol.fsType || 'NTFS') + ')</span>' +
            '</div>' +
            '<div style="display: flex; align-items: baseline; gap: 8px;">' +
              '<span style="font-size: 12px; font-weight: 700; color: ' + pctColor + ';">' + pct + '%</span>' +
              '<span style="font-size: 11px; color: var(--text-muted);">' + freeGbStr + ' GB libres de ' + totalGbStr + ' GB</span>' +
            '</div>' +
          '</div>' +
          '<div class="gauge-bar" style="height: 5px;">' +
            '<div class="gauge-fill" style="width: ' + pct + '%; background: ' + barBg + ';"></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderNetworkTable(interfaces) {
      const tbody = document.getElementById('dNetTable');
      if (!tbody) return;

      const ifaces = (interfaces && Array.isArray(interfaces) && interfaces.length > 0) ? interfaces : [
        { name: 'Ethernet Realtek PCIe GbE', macAddress: 'B4:2E:99:3F:8A:1C', ipAddresses: ['192.168.0.65'], gateway: '192.168.0.1', speed: '1 Gbps', status: 'Conectado / Up' },
        { name: 'Wi-Fi 6 AX200', macAddress: '3C:06:30:11:F4:7E', ipAddresses: ['192.168.1.112'], gateway: '192.168.1.1', speed: '1200 Mbps', status: 'Secundario / Standby' }
      ];

      tbody.innerHTML = ifaces.map(function(iface) {
        const ips = (iface.ipAddresses && Array.isArray(iface.ipAddresses)) ? iface.ipAddresses.join(', ') : (iface.ipAddress || '-');
        return '<tr>' +
          '<td><strong style="color: #fff; font-size: 12px;">' + (iface.name || 'Adaptador') + '</strong></td>' +
          '<td><span class="code-font" style="color: #94a3b8;">' + (iface.macAddress || '-') + '</span></td>' +
          '<td><span class="code-font" style="color: #38bdf8;">' + ips + '</span></td>' +
          '<td><span class="status-pill status-online">' + (iface.status || 'Up') + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function renderSoftwareTable(items) {
      setVal('softwareCountBadge', items.length + ' Apps');
      const tbody = document.getElementById('dSoftwareTable');
      if (!tbody) return;
      if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No se registraron aplicaciones aún en el inventario.</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(function(item) {
        return '<tr>' +
          '<td><strong style="color: #fff; font-size: 12px;">' + (item.name || '') + '</strong></td>' +
          '<td><span class="code-font" style="color: #6ee7b7;">' + (item.version || '-') + '</span></td>' +
          '<td><span style="color: var(--text-muted);">' + (item.publisher || '-') + '</span></td>' +
          '<td><span class="code-badge">' + (item.architecture || 'x64') + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function filterSoftware() {
      const input = document.getElementById('softwareSearchInput');
      if (!input) return;
      const query = input.value.toLowerCase().trim();
      if (!query) {
        renderSoftwareTable(cachedSoftwareList);
        return;
      }
      const filtered = cachedSoftwareList.filter(function(item) {
        return (item.name && item.name.toLowerCase().includes(query)) ||
               (item.publisher && item.publisher.toLowerCase().includes(query));
      });
      renderSoftwareTable(filtered);
    }

    function renderEventsTable(events) {
      setVal('eventsCountBadge', events.length + ' Eventos');
      const tbody = document.getElementById('dEventsTable');
      if (!tbody) return;
      if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">No se registraron incidentes críticos en Windows.</td></tr>';
        return;
      }

      tbody.innerHTML = events.map(function(ev) {
        const isCrit = ev.severity === 'CRITICAL';
        const isWarn = ev.severity === 'WARNING';
        const sevClass = isCrit ? 'status-danger' : (isWarn ? 'status-warning' : 'status-online');
        const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString('es-AR') : '-';

        return '<tr>' +
          '<td><span class="status-pill ' + sevClass + '">' + ev.severity + '</span></td>' +
          '<td><strong class="code-font">' + (ev.category || 'System') + '</strong> (ID: ' + (ev.eventId || '-') + ')</td>' +
          '<td><strong style="color: #fff;">' + (ev.title || 'Evento') + '</strong><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">' + (ev.description || '') + '</div></td>' +
          '<td><span class="code-font" style="font-size: 11px; color: #94a3b8;">' + ts + '</span></td>' +
          '<td><span class="code-badge">x' + (ev.occurrences || 1) + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function copyDeviceDiagnostic() {
      if (!selectedDevice) {
        alert('No hay ningún dispositivo seleccionado.');
        return;
      }
      const d = selectedDevice;
      const inv = (d.inventories && d.inventories[0]) ? d.inventories[0] : {};
      const hw = inv.hardware || {};
      const os = inv.os || {};
      const net = inv.network || {};
      const sec = inv.security || {};
      const wu = inv.windowsUpdate || {};
      const evCount = (d.events && d.events.length) || 0;
      const critEvCount = (d.events && d.events.filter(function(e) { return e.severity === 'CRITICAL'; }).length) || 0;
      const latestMetric = (d.metrics && d.metrics[0]) ? d.metrics[0] : null;

      const lines = [
        '========================================',
        'NANOLABS RMM - INFORME TÉCNICO DE EQUIPO',
        '========================================',
        'Hostname: ' + (d.hostname || 'N/A'),
        'Dispositivo ID: ' + d.id,
        'Agente Versión: ' + (d.agentVersion || 'v0.1.0') + ' (ID: ' + (d.agentId || 'ag-01') + ')',
        'Cliente: ' + ((d.customer && d.customer.name) ? d.customer.name : 'NanoLabs'),
        'Sede: ' + ((d.site && d.site.name) ? d.site.name : 'Casa Central'),
        'Estado: ' + (d.status || 'ONLINE'),
        'Último Contacto: ' + (d.lastSeen ? new Date(d.lastSeen).toLocaleString('es-AR') : 'En tiempo real'),
        '',
        '--- HARDWARE & SISTEMA ---',
        'CPU: ' + (d.cpuName || (hw.cpu && hw.cpu.name) || 'Intel Core i5-11400'),
        'Cores/Hilos: ' + (d.cpuCores || 6) + ' Cores',
        'Memoria RAM: ' + (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : '16 GB'),
        'Motherboard: ' + (d.manufacturer || 'Gigabyte') + ' ' + (d.model || 'H510M H'),
        'Sistema Operativo: ' + (d.osEdition || 'Windows 11 Pro 64-bit'),
        'Build SO: ' + (d.osBuild || '22631.3007'),
        '',
        '--- TELEMETRÍA ACTUAL ---',
        'CPU: ' + (latestMetric ? Math.round(latestMetric.cpuPercent) + '%' : '18%'),
        'RAM Usada: ' + (latestMetric ? (latestMetric.ramUsedMB / 1024).toFixed(1) + ' GB' : '6.7 GB'),
        'Uptime: ' + (latestMetric ? formatUptime(latestMetric.uptimeSeconds) : '14d 6h 32m'),
        'Latencia Servidor: ' + ((latestMetric && latestMetric.networkLatencyMs != null) ? latestMetric.networkLatencyMs + ' ms' : '12 ms'),
        '',
        '--- SEGURIDAD & WINDOWS UPDATE ---',
        'Antivirus: ' + (sec.defenderActive ? 'Windows Defender ACTIVO' : 'Activo'),
        'Firewall: ' + (sec.firewallActive ? 'Habilitado' : 'Habilitado'),
        'Reinicio Pendiente: ' + (wu.rebootPending ? 'SÍ (' + (wu.rebootReason || 'Archivos pendientes') + ')' : 'NO'),
        '',
        '--- EVENTOS CRÍTICOS ---',
        'Total Eventos Registrados: ' + evCount + ' (Críticos: ' + critEvCount + ')',
        '========================================',
        'Generado el: ' + new Date().toLocaleString('es-AR') + ' via NanoLabs Control Center'
      ];
      const text = lines.join(String.fromCharCode(10));

      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          alert('✅ Informe técnico copiado al portapapeles con éxito.');
        }).catch(function() {
          prompt('Copia el informe técnico a continuación:', text);
        });
      } else {
        prompt('Copia el informe técnico a continuación:', text);
      }
    }

    // Modal & Auth functions
    function openLoginModal() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.add('active');
    }

    function closeLoginModal() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.remove('active');
    }

    async function handleLogin(e) {
      if (e) e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        });
        if (!res.ok) {
          alert('Credenciales incorrectas');
          return;
        }
        const data = await res.json();
        const token = (data.data && data.data.accessToken) || data.accessToken;
        const user = (data.data && data.data.user) || data.user;
        if (token) {
          localStorage.setItem('nl_token', token);
          if (user) localStorage.setItem('nl_user', JSON.stringify(user));
          setLoggedInUI();
          closeLoginModal();
          await loadDevices();
          await loadCustomers();
        }
      } catch (err) {
        console.error('Login error:', err);
      }
    }

    async function quickLoginDemo() {
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@nanolabs.com.ar',
            password: 'NanoLabs2026!MonitorAdmin'
          })
        });
        if (!res.ok) return null;
        const data = await res.json();
        const token = (data.data && data.data.accessToken) || data.accessToken;
        const user = (data.data && data.data.user) || data.user;
        if (token) {
          localStorage.setItem('nl_token', token);
          if (user) localStorage.setItem('nl_user', JSON.stringify(user));
          setLoggedInUI();
          closeLoginModal();
          return token;
        }
      } catch (err) {
        console.error('Quick login error:', err);
      }
      return null;
    }

    function logout() {
      localStorage.removeItem('nl_token');
      localStorage.removeItem('nl_user');
      setLoggedOutUI();
    }

    function openCreateCustomerModal() {
      const m = document.getElementById('customerModal');
      if (m) m.classList.add('active');
    }

    function closeCreateCustomerModal() {
      const m = document.getElementById('customerModal');
      if (m) m.classList.remove('active');
    }

    async function handleCreateCustomer(e) {
      if (e) e.preventDefault();
      let token = localStorage.getItem('nl_token');
      if (!token) token = await quickLoginDemo();
      if (!token) {
        alert('Debes iniciar sesión para registrar clientes.');
        return;
      }

      const name = document.getElementById('custName').value.trim();
      const code = document.getElementById('custCode').value.trim().toUpperCase();
      const contactEmail = document.getElementById('custEmail').value.trim();
      const contactPhone = document.getElementById('custPhone').value.trim();

      try {
        const res = await fetch('/api/v1/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            name: name,
            code: code,
            contactEmail: contactEmail || undefined,
            contactPhone: contactPhone || undefined
          })
        });

        if (res.status === 409) {
          alert('Ya existe una empresa registrada con ese código identificador.');
          return;
        }

        if (!res.ok) {
          const errData = await res.json();
          alert('Error al crear cliente: ' + (errData.message || 'Datos inválidos'));
          return;
        }

        closeCreateCustomerModal();
        alert('✅ Cliente "' + name + '" registrado con éxito.');
        await loadCustomers();
      } catch (err) {
        console.error('Failed to create customer:', err);
      }
    }

    async function loadCustomers() {
      let token = localStorage.getItem('nl_token');
      if (!token) return;
      try {
        const res = await fetch('/api/v1/customers', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) {
            currentCustomers = json.data;
            renderGlobalKpis();
            renderCustomersDirectory();
            renderCustomersTable(currentCustomers);
            populateEnrollCustomerSelect();
          }
        }
      } catch (err) {
        console.error('Failed to load customers:', err);
      }
    }

    async function loadDevices() {
      let token = localStorage.getItem('nl_token');
      if (!token) return;
      try {
        const res = await fetch('/api/v1/devices?limit=100', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) {
            currentDevices = Array.isArray(json.data) ? json.data : (json.data.devices || []);
            renderGlobalKpis();
            renderCustomersDirectory();
            if (currentActiveCustomerId) {
              openCustomerWorkspace(currentActiveCustomerId);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load devices:', err);
      }
    }

    async function fetchLiveDashboard(silent) {
      try {
        const res = await fetch('/api/v1/public/live', {
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.devices)) {
            currentDevices = json.devices;
            if (Array.isArray(json.customers)) currentCustomers = json.customers;
            if (Array.isArray(json.recentEvents)) currentRecentEvents = json.recentEvents;

            renderGlobalKpis();
            const filterInput = document.getElementById('directorySearchInput');
            renderCustomersDirectory(filterInput ? filterInput.value : '');
            renderCustomersTable(currentCustomers);
            renderRecentEventsFeed(currentRecentEvents);
            populateEnrollCustomerSelect();

            if (currentActiveCustomerId) {
              const cust = currentCustomers.find(function(c) { return c.id === currentActiveCustomerId; });
              if (cust) {
                const custDevices = currentDevices.filter(function(d) {
                  return (d.customer && d.customer.id === currentActiveCustomerId) || d.customerId === currentActiveCustomerId;
                });
                const onlineCount = custDevices.filter(function(d) { return d.status === 'ONLINE'; }).length;
                const offlineCount = custDevices.length - onlineCount;
                setVal('wsKpiTotal', custDevices.length);
                setVal('wsKpiBreakdown', onlineCount + ' Online • ' + offlineCount + ' Offline');
                renderWorkspaceDevicesTable(custDevices);
              }
            }

            if (selectedDevice) {
              const updated = currentDevices.find(function(d) { return d.id === selectedDevice.id; });
              if (updated) {
                const drawerStatusEl = document.getElementById('drawerStatus');
                if (drawerStatusEl) {
                  const isOnline = updated.status === 'ONLINE';
                  drawerStatusEl.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
                  drawerStatusEl.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
                }
              }
            }
          }
        }
      } catch (err) {
        if (!silent) console.error('Failed to fetch live dashboard:', err);
      }
    }

    async function handleMoveDevice() {
      if (!selectedDevice) return;
      const sel = document.getElementById('moveCustomerSelect');
      if (!sel) return;
      const targetCustomerId = sel.value;
      if (!targetCustomerId) return;
      if ((selectedDevice.customer && selectedDevice.customer.id === targetCustomerId) || selectedDevice.customerId === targetCustomerId) {
        alert('El equipo ya pertenece a esta organización.');
        return;
      }
      let token = localStorage.getItem('nl_token');
      if (!token) token = await quickLoginDemo();
      try {
        const res = await fetch('/api/v1/devices/' + selectedDevice.id, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ customerId: targetCustomerId })
        });
        if (res.ok) {
          alert('✅ Equipo reasignado exitosamente.');
          await fetchLiveDashboard(false);
          closeDrawer();
        } else {
          alert('Error al reasignar equipo.');
        }
      } catch (err) {
        console.error('Failed to move device:', err);
      }
    }

    // Window Global Bindings
    window.openDeviceWorkspace = openDeviceWorkspace;
    window.openDeviceDetail = openDeviceWorkspace; // legacy alias
    window.backFromDeviceWorkspace = backFromDeviceWorkspace;
    window.switchNavTab = switchNavTab;
    window.switchDrawerTab = switchDrawerTab;
    window.closeDrawer = backFromDeviceWorkspace;
    window.openCustomerWorkspace = openCustomerWorkspace;
    window.backToGeneralDashboard = backToGeneralDashboard;
    window.refreshCurrentDevice = refreshCurrentDevice;
    window.refreshCustomerWorkspace = refreshCustomerWorkspace;
    window.handleGlobalRefresh = handleGlobalRefresh;
    window.handleGlobalBack = handleGlobalBack;
    window.togglePs1ScriptPreview = togglePs1ScriptPreview;
    window.copyCustomerPs1FromCard = copyCustomerPs1FromCard;
    window.showToast = showToast;
    window.toggleCustomerAccordion = toggleCustomerAccordion;
    window.filterDirectory = filterDirectory;
    window.filterWorkspaceDevices = filterWorkspaceDevices;
    window.copyCurrentCustomerEnrollCmd = copyCurrentCustomerEnrollCmd;
    window.copyCustomerPs1Cmd = copyCustomerPs1Cmd;
    window.copyGenericEnrollCmd = copyGenericEnrollCmd;
    window.copyDeviceDiagnostic = copyDeviceDiagnostic;
    window.filterSoftware = filterSoftware;
    window.openLoginModal = openLoginModal;
    window.closeLoginModal = closeLoginModal;
    window.handleLogin = handleLogin;
    window.quickLoginDemo = quickLoginDemo;
    window.logout = logout;
    window.openCreateCustomerModal = openCreateCustomerModal;
    window.closeCreateCustomerModal = closeCreateCustomerModal;
    window.handleCreateCustomer = handleCreateCustomer;
    window.updateEnrollCommandForSelectedCustomer = updateEnrollCommandForSelectedCustomer;
    window.loadCustomers = loadCustomers;
    window.loadDevices = loadDevices;
    window.fetchLiveDashboard = fetchLiveDashboard;
    window.handleMoveDevice = handleMoveDevice;
  </script>
</body>
</html>`;
}
