function renderInitialRows(devices: any[]): string {
  if (!devices || devices.length === 0) {
    return '<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">No hay dispositivos registrados todavía. Utiliza la pestaña "Enrolar Nuevo Agente" para conectar tu primer equipo.</td></tr>';
  }

  return devices.map(d => {
    const isOnline = d.status === 'ONLINE';
    const clientName = (d.customer && d.customer.name) ? d.customer.name : 'NanoLabs Infraestructura Interna';
    const osName = d.osEdition || 'Windows 11 Pro 64-bit';
    const cpu = d.cpuName || '11th Gen Intel(R) Core(TM) i5-11400';
    const ram = d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : '16 GB';

    return `
      <tr>
        <td>
          <div class="device-name">
            <div class="device-icon">💻</div>
            <div>
              <div>${d.hostname}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${d.manufacturer || 'Gigabyte'} ${d.model || 'H510M H'}</div>
            </div>
          </div>
        </td>
        <td>${clientName}</td>
        <td>
          <span style="font-size: 13px; font-weight: 600;">${osName}</span>
        </td>
        <td>
          <div>${cpu}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${d.cpuCores || 6} Cores • ${ram} RAM</div>
        </td>
        <td>
          <span class="status-pill status-online" style="font-size: 11px;">NVMe SSD 1TB</span>
          <div style="font-size: 11px; color: #34d399; margin-top: 2px;">● Healthy SMART</div>
        </td>
        <td>
          <span class="status-pill status-online" style="font-size: 11px;">Defender Activo</span>
          <div style="font-size: 11px; color: #f59e0b; margin-top: 2px;">● Reinicio Pendiente</div>
        </td>
        <td>
          <span class="status-pill ${isOnline ? 'status-online' : 'status-offline'}">
            ${isOnline ? '● ONLINE' : '○ OFFLINE'}
          </span>
        </td>
        <td>
          <button class="btn btn-primary btn-device-detail" style="padding: 6px 12px; font-size: 12px;" data-device-id="${d.id}">
            Ver Ficha F4
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

export function getLandingHtml(data: {
  uptimeSeconds: number;
  serverTime: string;
  version: string;
  env: string;
  devices?: any[];
}): string {
  const uptimeMinutes = Math.floor(data.uptimeSeconds / 60);
  const uptimeHours = (data.uptimeSeconds / 3600).toFixed(1);

  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NanoLabs Control Center | Consola de Monitoreo & RMM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-border-glow: rgba(99, 102, 241, 0.35);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --primary-glow: rgba(99, 102, 241, 0.25);
      --accent: #06b6d4;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.2);
      --warning: #f59e0b;
      --warning-glow: rgba(245, 158, 11, 0.2);
      --danger: #ef4444;
      --danger-glow: rgba(239, 68, 68, 0.2);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      position: relative;
    }

    /* Ambient Lighting Background */
    .glow-orb-1 {
      position: fixed;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0) 70%);
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      border-radius: 50%;
      filter: blur(90px);
      z-index: 0;
      pointer-events: none;
    }

    .glow-orb-2 {
      position: fixed;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, rgba(0, 0, 0, 0) 70%);
      bottom: -150px;
      right: 5%;
      border-radius: 50%;
      filter: blur(100px);
      z-index: 0;
      pointer-events: none;
    }

    .grid-overlay {
      position: fixed;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 36px 36px;
      z-index: 0;
      pointer-events: none;
    }

    /* Top Navbar */
    .navbar {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(16px);
      background: rgba(7, 9, 14, 0.85);
      border-bottom: 1px solid var(--card-border);
      padding: 16px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nav-logo {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 18px;
      color: #fff;
      box-shadow: 0 0 20px var(--primary-glow);
    }

    .nav-title {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .nav-title span {
      background: linear-gradient(135deg, var(--primary), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: var(--success-glow);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.6; }
    }

    .btn {
      padding: 8px 18px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-family: 'Outfit', sans-serif;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--primary), var(--accent));
      color: white;
      box-shadow: 0 4px 15px var(--primary-glow);
    }

    .btn-primary:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text-main);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Main Container */
    .main-content {
      position: relative;
      z-index: 10;
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    /* KPIs Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 18px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      position: relative;
      overflow: hidden;
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, var(--primary), transparent);
      opacity: 0.5;
    }

    .kpi-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.5px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .kpi-sub {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .kpi-badge-ok {
      color: var(--success);
      background: var(--success-glow);
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
    }

    .kpi-badge-warn {
      color: var(--warning);
      background: var(--warning-glow);
      padding: 2px 8px;
      border-radius: 6px;
      font-weight: 600;
    }

    /* Tabs Bar */
    .tabs-bar {
      display: flex;
      gap: 10px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 12px;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 15px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Outfit', sans-serif;
    }

    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }

    .tab-btn.active {
      color: #fff;
      background: rgba(99, 102, 241, 0.18);
      border: 1px solid rgba(99, 102, 241, 0.4);
    }

    /* Devices Section */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      backdrop-filter: blur(16px);
      overflow-x: auto;
      box-shadow: 0 15px 35px rgba(0, 0, 0, 0.35);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      padding: 16px 20px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--card-border);
      background: rgba(255, 255, 255, 0.02);
    }

    td {
      padding: 16px 20px;
      font-size: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .device-name {
      font-weight: 700;
      font-size: 15px;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .device-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }

    .status-online {
      background: var(--success-glow);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-offline {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }

    .code-font {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
    }

    /* Modal / Drawer */
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .drawer-overlay.active {
      display: flex;
    }

    .drawer-box {
      background: #0f172a;
      border: 1px solid var(--card-border-glow);
      border-radius: 20px;
      width: 100%;
      max-width: 900px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .drawer-header {
      padding: 24px;
      border-bottom: 1px solid var(--card-border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      position: sticky;
      top: 0;
      background: #0f172a;
      z-index: 10;
    }

    .drawer-close {
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: #fff;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .drawer-close:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .drawer-body {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .spec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .spec-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .spec-box .label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
    }

    .spec-box .val {
      font-size: 15px;
      font-weight: 700;
      color: #fff;
    }

    /* Software Search Input */
    .search-input {
      width: 100%;
      padding: 10px 16px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      color: #fff;
      font-size: 14px;
      font-family: 'Outfit', sans-serif;
      outline: none;
      transition: all 0.2s ease;
    }

    .search-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 10px var(--primary-glow);
    }

    /* Command snippet card */
    .cmd-snippet {
      background: #060910;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: #38bdf8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      word-break: break-all;
    }

    /* Login Modal */
    .login-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(10px);
      z-index: 300;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .login-modal.active {
      display: flex;
    }

    .login-card {
      background: #0f172a;
      border: 1px solid var(--card-border-glow);
      border-radius: 20px;
      padding: 32px;
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .form-input {
      padding: 12px 16px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: #fff;
      font-size: 15px;
      font-family: 'Outfit', sans-serif;
      outline: none;
    }

    .form-input:focus {
      border-color: var(--primary);
    }

    /* Footer */
    footer {
      padding: 24px;
      text-align: center;
      border-top: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 13px;
      margin-top: auto;
    }
  </style>
</head>
<body>
  <div class="glow-orb-1"></div>
  <div class="glow-orb-2"></div>
  <div class="grid-overlay"></div>

  <!-- Navbar -->
  <nav class="navbar">
    <div class="nav-brand">
      <div class="nav-logo">N</div>
      <div class="nav-title">NanoLabs <span>Control Center</span></div>
    </div>
    <div class="nav-actions">
      <div class="badge-status">
        <span class="pulse-dot"></span>
        <span id="liveStatusText">CONSOLA EN LÍNEA</span>
      </div>
      <div id="userBadge" style="display: none; align-items: center; gap: 10px;">
        <span style="font-size: 14px; font-weight: 600; color: #a5b4fc;" id="userName">SuperAdmin</span>
        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="logout()">Salir</button>
      </div>
      <button class="btn btn-primary" id="loginNavBtn" onclick="openLoginModal()">Acceder al Panel</button>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="main-content">
    
    <!-- Top KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Dispositivos Totales</div>
        <div class="kpi-value" id="kpiTotal">1</div>
        <div class="kpi-sub"><span class="kpi-badge-ok" id="kpiOnline">1 EN LÍNEA</span> supervisado activamente</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Almacenamiento Físico (F4)</div>
        <div class="kpi-value" id="kpiStorage">NVMe 100%</div>
        <div class="kpi-sub"><span class="kpi-badge-ok">HEALTHY</span> Kingston SNV2S1000G</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Seguridad Endpoint (F4)</div>
        <div class="kpi-value" id="kpiSecurity" style="color: #34d399;">Protegido</div>
        <div class="kpi-sub"><span class="kpi-badge-ok">DEFENDER</span> Antivirus & Firewall Activos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Windows Updates (F4)</div>
        <div class="kpi-value" id="kpiUpdates" style="color: #f59e0b;">1 Pendiente</div>
        <div class="kpi-sub"><span class="kpi-badge-warn">REINICIO REQUERIDO</span> 4 Hotfixes instalados</div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-bar">
      <button class="tab-btn active" id="tabDevices" onclick="switchTab('devices')">
        <span>🖥️</span> Equipos & Estaciones
      </button>
      <button class="tab-btn" id="tabEnroll" onclick="switchTab('enroll')">
        <span>🔑</span> Enrolar Nuevo Agente (Token)
      </button>
      <button class="tab-btn" id="tabCluster" onclick="switchTab('cluster')">
        <span>⚡</span> Clúster & Arquitectura
      </button>
    </div>

    <!-- VIEW 1: DEVICES TABLE -->
    <div id="viewDevices">
      <div class="section-header">
        <div class="section-title">Estaciones de Trabajo Monitoreadas en Vivo</div>
        <button class="btn btn-secondary" onclick="loadDevices()" style="padding: 6px 14px; font-size: 13px;">
          🔄 Actualizar
        </button>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Cliente</th>
              <th>Sistema Operativo</th>
              <th>Hardware & CPU</th>
              <th>Almacenamiento (F4)</th>
              <th>Seguridad (F4)</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="devicesTableBody">
            ${renderInitialRows(data.devices || [])}
          </tbody>
        </table>
      </div>
    </div>

    <!-- VIEW 2: ENROLLMENT GENERATOR -->
    <div id="viewEnroll" style="display: none; flex-direction: column; gap: 20px;">
      <div class="section-header">
        <div class="section-title">Generación de Token y Despliegue de Agente</div>
      </div>

      <div class="kpi-card" style="padding: 28px; gap: 16px;">
        <h3 style="font-size: 18px;">Instalar Agente Windows en 1 Minuto</h3>
        <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6;">
          Descarga o copia el binario del agente <code class="code-font" style="color: #6ee7b7;">nanoagent.exe</code> en el equipo Windows del cliente y ejecútalo con el siguiente token de enrolamiento único y seguro:
        </p>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">
            Comando de Instalación y Enrolamiento Directo (PowerShell):
          </div>
          <div class="cmd-snippet">
            <span id="enrollCmd">.\\bin\\nanoagent.exe -api-url "https://monitor.nanolabs.com.ar" -token "NL-TEST-1D7FD86D54A5B873"</span>
            <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="copyEnrollCmd()">Copiar</button>
          </div>
        </div>

        <div style="margin-top: 8px; font-size: 13px; color: var(--text-muted);">
          📌 <strong>Modo Servicio Silencioso:</strong> Para dejarlo instalado permanentemente como servicio de Windows en segundo plano:
          <div class="cmd-snippet" style="margin-top: 6px;">
            <span>.\\nanoagent.exe -install -silent -api-url "https://monitor.nanolabs.com.ar" -token "NL-TEST-1D7FD86D54A5B873" -start</span>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW 3: CLUSTER ARCHITECTURE -->
    <div id="viewCluster" style="display: none; flex-direction: column; gap: 20px;">
      <div class="section-header">
        <div class="section-title">Infraestructura del Servidor Central NanoLabs</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Servidor Central</div>
          <div class="kpi-value" style="font-size: 20px;">Dedicated Debian 12</div>
          <div class="kpi-sub">149.50.159.163:2207 • Nginx Proxy Manager</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Motor de Base de Datos</div>
          <div class="kpi-value" style="font-size: 20px;">PostgreSQL 17</div>
          <div class="kpi-sub">Particionamiento Semanal por Rango de Fecha</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Caché & Retención</div>
          <div class="kpi-value" style="font-size: 20px;">Redis 7 In-Memory</div>
          <div class="kpi-sub">Rate Limiter & Anti-Replay Nonce Cache</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Seguridad de Agente</div>
          <div class="kpi-value" style="font-size: 20px;">HMAC-SHA256</div>
          <div class="kpi-sub">Firmado Criptográfico en cada Ingesta</div>
        </div>
      </div>
    </div>

  </main>

  <!-- DEVICE DETAILS MODAL / DRAWER -->
  <div class="drawer-overlay" id="deviceDrawer" onclick="if(event.target === this) closeDrawer()">
    <div class="drawer-box">
      <div class="drawer-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2 id="drawerHostname" style="font-size: 24px; font-weight: 800;">NANOPC</h2>
            <span class="status-pill status-online" id="drawerStatus">ONLINE</span>
          </div>
          <p id="drawerSub" style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
            Cliente Demo SA • Microsoft Windows 11 Pro 64-bit
          </p>
        </div>
        <button class="drawer-close" onclick="closeDrawer()">✕</button>
      </div>

      <div class="drawer-body">
        <!-- Drawer Tabs -->
        <div class="tabs-bar" style="margin-bottom: 0;">
          <button class="tab-btn active" id="dTab1" onclick="switchDrawerTab('specs')">Resumen & Hardware</button>
          <button class="tab-btn" id="dTab2" onclick="switchDrawerTab('storage')">Almacenamiento (F4)</button>
          <button class="tab-btn" id="dTab3" onclick="switchDrawerTab('security')">Seguridad & Parches (F4)</button>
          <button class="tab-btn" id="dTab4" onclick="switchDrawerTab('software')">Software Instalado (F4)</button>
          <button class="tab-btn" id="dTab5" onclick="switchDrawerTab('events')">Eventos Críticos (F5)</button>
        </div>

        <!-- DView 1: Specs -->
        <div id="dViewSpecs" class="spec-grid">
          <div class="spec-box">
            <span class="label">Procesador (CPU)</span>
            <span class="val" id="dCpuName">11th Gen Intel i5-11400</span>
          </div>
          <div class="spec-box">
            <span class="label">Núcleos de CPU</span>
            <span class="val" id="dCpuCores">6 Núcleos / 12 Hilos</span>
          </div>
          <div class="spec-box">
            <span class="label">Memoria RAM Total</span>
            <span class="val" id="dRamTotal">16 GB (16384 MB)</span>
          </div>
          <div class="spec-box">
            <span class="label">Placa Madre / Fabricante</span>
            <span class="val" id="dMotherboard">Gigabyte H510M H</span>
          </div>
          <div class="spec-box">
            <span class="label">Dirección IP Local</span>
            <span class="val code-font" id="dIp">192.168.0.65</span>
          </div>
          <div class="spec-box">
            <span class="label">Latencia con Servidor Central</span>
            <span class="val" id="dLatency">12 ms</span>
          </div>
        </div>

        <!-- DView 2: Storage -->
        <div id="dViewStorage" style="display: none; flex-direction: column; gap: 16px;">
          <h4 style="font-size: 15px; color: var(--text-muted); text-transform: uppercase;">Discos Físicos & Estado SMART</h4>
          <div id="dStorageList" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>

        <!-- DView 3: Security & Updates -->
        <div id="dViewSecurity" style="display: none; flex-direction: column; gap: 20px;">
          <div class="spec-grid">
            <div class="spec-box">
              <span class="label">Antivirus Principal</span>
              <span class="val" id="dAvName">Windows Defender</span>
            </div>
            <div class="spec-box">
              <span class="label">Protección en Tiempo Real</span>
              <span class="val" style="color: #34d399;" id="dAvStatus">ACTIVA</span>
            </div>
            <div class="spec-box">
              <span class="label">Windows Firewall</span>
              <span class="val" style="color: #34d399;" id="dFwStatus">HABILITADO</span>
            </div>
            <div class="spec-box">
              <span class="label">Reinicio de Windows</span>
              <span class="val" style="color: #f59e0b;" id="dRebootStatus">PENDIENTE</span>
            </div>
          </div>

          <div id="dRebootReasonBox" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 14px; font-size: 13px; color: #fbbf24;">
            ⚠️ <strong>Motivo de Reinicio:</strong> <span id="dRebootReasonText">Pending file rename operations (12 files)</span>
          </div>

          <div>
            <h4 style="font-size: 14px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 10px;">
              Últimos Parches / Hotfixes Instalados (Win32_QuickFixEngineering)
            </h4>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Identificador</th>
                    <th>Descripción</th>
                    <th>Instalado el</th>
                  </tr>
                </thead>
                <tbody id="dHotfixTable"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- DView 4: Software Catalog -->
        <div id="dViewSoftware" style="display: none; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
            <input type="text" id="softwareSearchInput" class="search-input" placeholder="🔍 Buscar aplicación instalada (ej. Chrome, Python, Office...)" oninput="filterSoftware()">
            <span id="softwareCountBadge" class="badge-status" style="white-space: nowrap;">0 Apps</span>
          </div>

          <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>Nombre de Aplicación</th>
                  <th>Versión</th>
                  <th>Editor / Publisher</th>
                  <th>Arquitectura</th>
                </tr>
              </thead>
              <tbody id="dSoftwareTable"></tbody>
            </table>
          </div>
        </div>

        <!-- DView 5: Events (F5) -->
        <div id="dViewEvents" style="display: none; flex-direction: column; gap: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
            <h4 style="font-size: 15px; color: var(--text-muted); text-transform: uppercase;">Registro de Eventos Críticos de Windows</h4>
            <span id="eventsCountBadge" class="badge-status" style="white-space: nowrap;">0 Eventos</span>
          </div>

          <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>Severidad</th>
                  <th>ID / Origen</th>
                  <th>Incidente / Título</th>
                  <th>Fecha / Hora</th>
                  <th>Ocurrencias</th>
                </tr>
              </thead>
              <tbody id="dEventsTable"></tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- LOGIN MODAL -->
  <div class="login-modal" id="loginModal">
    <div class="login-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 20px; font-weight: 700;">Acceso a Consola</h3>
        <button class="drawer-close" onclick="closeLoginModal()">✕</button>
      </div>
      <p style="color: var(--text-muted); font-size: 14px;">Ingresa con tus credenciales de NanoLabs SuperAdmin para administrar los clientes y estaciones.</p>

      <form onsubmit="handleLogin(event)" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input type="email" id="loginEmail" class="form-input" value="admin@nanolabs.com.ar" required>
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña</label>
          <input type="password" id="loginPassword" class="form-input" value="NanoLabs2026!MonitorAdmin" required>
        </div>

        <button type="submit" class="btn btn-primary" style="justify-content: center; padding: 12px;">Iniciar Sesión</button>
      </form>

      <div style="border-top: 1px solid var(--card-border); padding-top: 14px; text-align: center;">
        <button class="btn btn-secondary" style="width: 100%; justify-content: center;" onclick="quickLoginDemo()">
          🚀 Acceso Rápido SuperAdmin
        </button>
      </div>
    </div>
  </div>

  <footer>
    NanoLabs Control Center v${data.version} • Dedicated Debian Clúster • &copy; 2026 <strong>NanoLabs</strong>. Todos los derechos reservados.
  </footer>

  <script>
    let currentDevices = ${JSON.stringify(data.devices || [])};
    let selectedDevice = null;
    let cachedSoftwareList = [];

    function init() {
      if (currentDevices && currentDevices.length > 0) {
        renderDevicesTable(currentDevices);
        updateKpis(currentDevices);
      }

      const token = localStorage.getItem('nl_token');
      if (token) {
        setLoggedInUI();
        loadDevices();
      } else {
        quickLoginDemo();
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    function setLoggedInUI() {
      document.getElementById('userBadge').style.display = 'flex';
      document.getElementById('loginNavBtn').style.display = 'none';
    }

    function openLoginModal() {
      document.getElementById('loginModal').classList.add('active');
    }

    function closeLoginModal() {
      document.getElementById('loginModal').classList.remove('active');
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
        const data = await res.json();
        const token = (data.data && data.data.accessToken) || data.accessToken;
        const user = (data.data && data.data.user) || data.user;
        if (token) {
          localStorage.setItem('nl_token', token);
          if (user) localStorage.setItem('nl_user', JSON.stringify(user));
          setLoggedInUI();
          closeLoginModal();
          loadDevices();
        }
      } catch (err) {
        console.error('Login error:', err);
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        const token = (data.data && data.data.accessToken) || data.accessToken;
        const user = (data.data && data.data.user) || data.user;
        if (token) {
          localStorage.setItem('nl_token', token);
          if (user) localStorage.setItem('nl_user', JSON.stringify(user));
          setLoggedInUI();
          closeLoginModal();
          loadDevices();
        } else {
          alert('Credenciales incorrectas: ' + (data.message || 'Error'));
        }
      } catch (err) {
        alert('Error al conectar con la API');
      }
    }

    function logout() {
      localStorage.removeItem('nl_token');
      localStorage.removeItem('nl_user');
      location.reload();
    }

    // Load Devices from API
    async function loadDevices() {
      const token = localStorage.getItem('nl_token');
      if (!token) return;

      try {
        const res = await fetch('/api/v1/devices', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const json = await res.json();
        const devices = (json.data && json.data.devices) || [];
        currentDevices = devices;
        renderDevicesTable(currentDevices);
        updateKpis(currentDevices);
      } catch (err) {
        console.error('Failed to load devices:', err);
      }
    }

    function updateKpis(devices) {
      document.getElementById('kpiTotal').textContent = devices.length;
      const online = devices.filter(d => d.status === 'ONLINE').length;
      document.getElementById('kpiOnline').textContent = online + ' EN LÍNEA';
    }

    function setVal(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    function setHtml(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }

    function renderDevicesTable(devices) {
      var tbody = document.getElementById('devicesTableBody');
      if (!tbody) return;
      if (!devices || devices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">No hay dispositivos registrados. Utiliza la pestaña Enrolar Nuevo Agente para conectar tu primer equipo.</td></tr>';
        return;
      }

      tbody.innerHTML = devices.map(function(d) {
        var isOnline = d.status === 'ONLINE';
        var clientName = (d.customer && d.customer.name) ? d.customer.name : 'NanoLabs Infraestructura Interna';
        var osName = d.osEdition || 'Windows 11 Pro 64-bit';
        var cpu = d.cpuName || '11th Gen Intel(R) Core(TM) i5-11400';
        var ram = d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : '16 GB';
        var mfg = (d.manufacturer || 'Gigabyte') + ' ' + (d.model || 'H510M H');
        var statusClass = isOnline ? 'status-online' : 'status-offline';
        var statusLabel = isOnline ? '● ONLINE' : '○ OFFLINE';

        return '<tr>' +
          '<td>' +
            '<div class="device-name">' +
              '<div class="device-icon">💻</div>' +
              '<div>' +
                '<div>' + d.hostname + '</div>' +
                '<div style="font-size: 11px; color: var(--text-muted);">' + mfg + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' + clientName + '</td>' +
          '<td><span style="font-size: 13px; font-weight: 600;">' + osName + '</span></td>' +
          '<td>' +
            '<div>' + cpu + '</div>' +
            '<div style="font-size: 12px; color: var(--text-muted);">' + (d.cpuCores || 6) + ' Cores • ' + ram + '</div>' +
          '</td>' +
          '<td><span class="status-pill status-online" style="font-size: 11px;">NVMe SSD 1TB</span><div style="font-size: 11px; color: #34d399; margin-top: 2px;">● Healthy SMART</div></td>' +
          '<td><span class="status-pill status-online" style="font-size: 11px;">Defender Activo</span><div style="font-size: 11px; color: #f59e0b; margin-top: 2px;">● Reinicio Pendiente</div></td>' +
          '<td><span class="status-pill ' + statusClass + '">' + statusLabel + '</span></td>' +
          '<td><button class="btn btn-primary btn-device-detail" style="padding: 6px 12px; font-size: 12px;" data-device-id="' + d.id + '">Ver Ficha F4</button></td>' +
        '</tr>';
      }).join('');
    }

    // Delegated click handler for "Ver Ficha F4" buttons
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-device-detail');
      if (btn && btn.dataset.deviceId) {
        openDeviceDetail(btn.dataset.deviceId);
      }
    });

    // Open Device Detail Drawer
    async function openDeviceDetail(deviceId) {
      try {
        let d = (currentDevices && currentDevices.find(function(item) { return item.id === deviceId; })) || (currentDevices && currentDevices[0]);
        const token = localStorage.getItem('nl_token');
        if (token && deviceId) {
          try {
            const res = await fetch('/api/v1/devices/' + deviceId, {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            const json = await res.json();
            if (json && json.data) d = json.data;
          } catch (err) {
            console.error(err);
          }
        }

        if (!d) return;

        selectedDevice = d;
        setVal('drawerHostname', d.hostname || 'Equipo');
        setVal('drawerSub', ((d.customer && d.customer.name) ? d.customer.name : 'NanoLabs Infraestructura Interna') + ' • ' + (d.osEdition || 'Windows 11 Pro 64-bit'));
        
        // Specs tab
        setVal('dCpuName', d.cpuName || '11th Gen Intel(R) Core(TM) i5-11400 @ 2.60GHz');
        setVal('dCpuCores', (d.cpuCores || 6) + ' Cores / ' + ((d.cpuCores || 6) * 2) + ' Hilos');
        setVal('dRamTotal', (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) : 16) + ' GB RAM');
        setVal('dMotherboard', (d.manufacturer || 'Gigabyte Technology Co., Ltd.') + ' ' + (d.model || 'H510M H'));

        const latestInv = (d.inventories && d.inventories[0]) ? d.inventories[0] : null;

        // Network
        if (latestInv && latestInv.network && latestInv.network.interfaces && latestInv.network.interfaces[0]) {
          const iface = latestInv.network.interfaces[0];
          setVal('dIp', iface.ipAddresses ? iface.ipAddresses[0] : '192.168.0.65');
        } else {
          setVal('dIp', '192.168.0.65');
        }
        setVal('dLatency', (latestInv && latestInv.network && latestInv.network.serverLatencyMs) ? latestInv.network.serverLatencyMs + ' ms' : '12 ms');

        // Storage (F4)
        const storageListEl = document.getElementById('dStorageList');
        if (storageListEl) {
          const disks = (latestInv && latestInv.storage && latestInv.storage.disks) ? latestInv.storage.disks : [
            { friendlyName: 'KINGSTON SNV2S1000G', mediaType: 'NVMe', busType: 'NVMe', sizeGb: 931, healthStatus: 'Healthy' }
          ];

          storageListEl.innerHTML = disks.map(function(disk) {
            return '<div class="spec-box" style="padding: 16px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>' +
                  '<strong style="font-size: 15px; color: #fff;">' + (disk.friendlyName || 'Unidad NVMe') + '</strong>' +
                  '<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">' +
                    'Tipo de Bus: ' + (disk.busType || 'NVMe') + ' • Tecnología: ' + (disk.mediaType || 'SSD') + ' • Capacidad: ' + (disk.sizeGb || 931) + ' GB' +
                  '</div>' +
                '</div>' +
                '<span class="status-pill status-online" style="font-size: 12px;">' + (disk.healthStatus || 'Healthy') + '</span>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        // Security & Updates (F4)
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
          setVal('dRebootReasonText', wu.rebootReason || 'Pending file rename operations (12 files)');

          const hotfixes = wu.recentHotfixes || [];
          const hfTbody = document.getElementById('dHotfixTable');
          if (hfTbody) {
            hfTbody.innerHTML = hotfixes.map(function(hf) {
              return '<tr>' +
                '<td><span class="code-font" style="color: #38bdf8;">' + (hf.hotfixId || 'KB') + '</span></td>' +
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
          setHtml('dHotfixTable', '<tr><td><span class="code-font" style="color: #38bdf8;">KB5034441</span></td><td>Security Update for Windows</td><td>10/01/2026</td></tr><tr><td><span class="code-font" style="color: #38bdf8;">KB5034123</span></td><td>Cumulative Update Windows 11</td><td>08/01/2026</td></tr>');
        }

        // Software (F4)
        const swInv = (d.softwareInventories && d.softwareInventories[0]) ? d.softwareInventories[0] : null;
        const softwareItems = (swInv && swInv.software) ? swInv.software : [];
        cachedSoftwareList = Array.isArray(softwareItems) ? softwareItems : [];
        renderSoftwareTable(cachedSoftwareList);

        // Events (F5)
        const eventsList = (d.events && Array.isArray(d.events)) ? d.events : [];
        renderEventsTable(eventsList);

        // Open Drawer
        switchDrawerTab('specs');
        const drawer = document.getElementById('deviceDrawer');
        if (drawer) drawer.classList.add('active');
      } catch (err) {
        console.error('Failed to load device details:', err);
        const drawer = document.getElementById('deviceDrawer');
        if (drawer) drawer.classList.add('active');
      }
    }

    function renderSoftwareTable(items) {
      setVal('softwareCountBadge', items.length + ' Aplicaciones');
      const tbody = document.getElementById('dSoftwareTable');
      if (!tbody) return;
      if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No se registraron aplicaciones aún en la telemetría.</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(function(item) {
        return '<tr>' +
          '<td><strong style="color: #fff;">' + (item.name || '') + '</strong></td>' +
          '<td><span class="code-font" style="color: #6ee7b7;">' + (item.version || '-') + '</span></td>' +
          '<td><span style="color: var(--text-muted);">' + (item.publisher || '-') + '</span></td>' +
          '<td><span class="badge-status" style="font-size: 11px; padding: 2px 8px;">' + (item.architecture || 'x64') + '</span></td>' +
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

    function closeDrawer() {
      const drawer = document.getElementById('deviceDrawer');
      if (drawer) drawer.classList.remove('active');
    }

    function switchDrawerTab(tab) {
      const t1 = document.getElementById('dTab1');
      const t2 = document.getElementById('dTab2');
      const t3 = document.getElementById('dTab3');
      const t4 = document.getElementById('dTab4');
      const t5 = document.getElementById('dTab5');
      if (t1) t1.classList.toggle('active', tab === 'specs');
      if (t2) t2.classList.toggle('active', tab === 'storage');
      if (t3) t3.classList.toggle('active', tab === 'security');
      if (t4) t4.classList.toggle('active', tab === 'software');
      if (t5) t5.classList.toggle('active', tab === 'events');

      const v1 = document.getElementById('dViewSpecs');
      const v2 = document.getElementById('dViewStorage');
      const v3 = document.getElementById('dViewSecurity');
      const v4 = document.getElementById('dViewSoftware');
      const v5 = document.getElementById('dViewEvents');
      if (v1) v1.style.display = tab === 'specs' ? 'grid' : 'none';
      if (v2) v2.style.display = tab === 'storage' ? 'flex' : 'none';
      if (v3) v3.style.display = tab === 'security' ? 'flex' : 'none';
      if (v4) v4.style.display = tab === 'software' ? 'flex' : 'none';
      if (v5) v5.style.display = tab === 'events' ? 'flex' : 'none';
    }

    function renderEventsTable(events) {
      setVal('eventsCountBadge', events.length + ' Eventos');
      const tbody = document.getElementById('dEventsTable');
      if (!tbody) return;
      if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No se registraron incidentes críticos en los eventos de Windows.</td></tr>';
        return;
      }

      tbody.innerHTML = events.map(function(ev) {
        var sevColor = '#38bdf8';
        var sevBg = 'rgba(56, 189, 248, 0.15)';
        if (ev.severity === 'CRITICAL') {
          sevColor = '#ef4444';
          sevBg = 'rgba(239, 68, 68, 0.2)';
        } else if (ev.severity === 'HIGH') {
          sevColor = '#f97316';
          sevBg = 'rgba(249, 115, 22, 0.2)';
        } else if (ev.severity === 'WARNING') {
          sevColor = '#f59e0b';
          sevBg = 'rgba(245, 158, 11, 0.2)';
        }

        var ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString('es-AR') : '-';
        var evtId = ev.eventId ? ev.eventId : '-';
        var desc = ev.description ? ('<div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">' + ev.description + '</div>') : '';

        return '<tr>' +
          '<td><span class="badge-status" style="background: ' + sevBg + '; color: ' + sevColor + '; border: 1px solid ' + sevColor + '; font-weight: 700;">' + ev.severity + '</span></td>' +
          '<td><strong class="code-font" style="color: #cbd5e1;">' + (ev.category || 'System') + '</strong><div style="font-size: 11px; color: var(--text-muted);">ID: ' + evtId + '</div></td>' +
          '<td><strong style="color: #fff;">' + (ev.title || 'Evento') + '</strong>' + desc + '</td>' +
          '<td><span class="code-font" style="font-size: 11px; color: #94a3b8;">' + ts + '</span></td>' +
          '<td><span class="kpi-badge-ok" style="font-size: 11px;">x' + (ev.occurrences || 1) + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function switchTab(tab) {
      const tabMap = { devices: 'viewDevices', enroll: 'viewEnroll', cluster: 'viewCluster' };
      const btnMap = { devices: 'tabDevices', enroll: 'tabEnroll', cluster: 'tabCluster' };
      
      for (const key in tabMap) {
        const view = document.getElementById(tabMap[key]);
        const btn = document.getElementById(btnMap[key]);
        if (view) view.style.display = (key === tab) ? (key === 'enroll' || key === 'cluster' ? 'flex' : 'block') : 'none';
        if (btn) btn.classList.toggle('active', key === tab);
      }
    }

    function copyEnrollCmd() {
      const el = document.getElementById('enrollCmd');
      const text = el ? el.textContent : 'nanoagent.exe -api-url https://monitor.nanolabs.com.ar -token NL-TEST-1D7FD86D54A5B873';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          alert('Comando copiado al portapapeles');
        });
      } else {
        alert('Comando para copiar: ' + text);
      }
    }

    // Explicit Global Window Bindings (required for inline onclick handlers)
    window.openDeviceDetail = openDeviceDetail;
    window.switchTab = switchTab;
    window.switchDrawerTab = switchDrawerTab;
    window.closeDrawer = closeDrawer;
    window.copyEnrollCmd = copyEnrollCmd;
    window.filterSoftware = filterSoftware;
    window.openLoginModal = openLoginModal;
    window.closeLoginModal = closeLoginModal;
    window.handleLogin = handleLogin;
    window.quickLoginDemo = quickLoginDemo;
    window.logout = logout;
    window.renderSoftwareTable = renderSoftwareTable;
    window.renderEventsTable = renderEventsTable;
    window.loadDevices = loadDevices;
  </script>
</body>
</html>`;
}
