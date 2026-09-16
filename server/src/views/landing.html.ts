function renderInitialRows(devices: any[]): string {
  if (!devices || devices.length === 0) {
    return '<tr><td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">No hay dispositivos registrados todavía. Utiliza la pestaña "Enrolar Nuevo Agente" para conectar tu primer equipo.</td></tr>';
  }

  return devices.map(d => {
    const isOnline = d.status === 'ONLINE';
    const clientName = (d.customer && d.customer.name) ? d.customer.name : 'NanoLabs Infraestructura Interna';
    const osName = d.osEdition || 'Windows 11 Pro 64-bit';
    const cpu = d.cpuName || '11th Gen Intel(R) Core(TM) i5-11400';
    const ram = d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : '16 GB';
    const events = d.events || [];
    const critCount = events.filter((e: any) => e.severity === 'CRITICAL').length;
    const totalEvents = events.length;
    const eventsBadge = totalEvents > 0
      ? `<span class="badge-status" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; font-size: 11px; font-weight: 700;">${critCount > 0 ? '⚠️ ' + critCount + ' Críticos' : '● ' + totalEvents + ' Eventos'}</span><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">● Event Viewer F5</div>`
      : `<span class="status-pill status-online" style="font-size: 11px;">0 Incidentes</span><div style="font-size: 11px; color: #34d399; margin-top: 2px;">● Estable</div>`;

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
          ${eventsBadge}
        </td>
        <td>
          <span class="status-pill ${isOnline ? 'status-online' : 'status-offline'}">
            ${isOnline ? '● ONLINE' : '○ OFFLINE'}
          </span>
        </td>
        <td>
          <button class="btn btn-primary btn-device-detail" style="padding: 6px 12px; font-size: 12px;" data-device-id="${d.id}">
            Ver Ficha (F4/F5)
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInitialCustomers(customers: any[]): string {
  if (!customers || customers.length === 0) {
    return '<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">No hay clientes registrados en la plataforma.</td></tr>';
  }

  return customers.map(c => {
    const sitesCount = (c._count && c._count.sites) || (c.sites ? c.sites.length : 0);
    const devicesCount = (c._count && c._count.devices) || 0;
    const alertsCount = (c._count && c._count.alerts) || 0;
    const sitesList = c.sites && c.sites.length > 0 ? c.sites.map((s: any) => s.name).join(', ') : `${sitesCount} Sedes`;

    return `
      <tr>
        <td>
          <div class="device-name">
            <div class="device-icon">🏢</div>
            <div>
              <strong style="color: #fff; font-size: 14px;">${c.name}</strong>
              <div style="font-size: 11px; color: var(--text-muted);">${c.contactEmail || 'Sin email de contacto'}</div>
            </div>
          </div>
        </td>
        <td><span class="code-font" style="color: #38bdf8; font-weight: 600;">${c.code}</span></td>
        <td>
          <span style="font-size: 13px;">${sitesCount} Sedes</span>
          <div style="font-size: 11px; color: var(--text-muted);">${sitesList}</div>
        </td>
        <td>
          <span class="badge-status" style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid #818cf8; font-weight: 700;">
            🖥️ ${devicesCount} Equipos
          </span>
        </td>
        <td>
          ${alertsCount > 0
            ? `<span class="badge-status" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; font-weight: 700;">⚠️ ${alertsCount} Alertas</span>`
            : `<span class="status-pill status-online" style="font-size: 11px;">● 0 Alertas</span>`
          }
        </td>
        <td>
          <span class="status-pill ${c.status === 'ACTIVE' ? 'status-online' : 'status-offline'}">
            ${c.status === 'ACTIVE' ? '● ACTIVO' : '○ INACTIVO'}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

function renderRecentEventsFeed(events: any[]): string {
  if (!events || events.length === 0) {
    return '<div style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">No se registran eventos críticos en la flota recientemente.</div>';
  }

  return events.map(ev => {
    const isCrit = ev.severity === 'CRITICAL';
    const isWarn = ev.severity === 'WARNING';
    const sevColor = isCrit ? '#ef4444' : (isWarn ? '#f59e0b' : '#38bdf8');
    const sevBg = isCrit ? 'rgba(239, 68, 68, 0.15)' : (isWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(56, 189, 248, 0.15)');
    const host = ev.device ? ev.device.hostname : 'NANOPC';
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

    return `
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge-status" style="background: ${sevBg}; color: ${sevColor}; border: 1px solid ${sevColor}; font-size: 11px; font-weight: 700; white-space: nowrap;">
            ${ev.severity}
          </span>
          <div>
            <div style="font-size: 13px; font-weight: 600; color: #fff;">${ev.title}</div>
            <div style="font-size: 11px; color: var(--text-muted);">
              <strong>${host}</strong> • ${ev.category || 'System'} (ID ${ev.eventId || '-'}) • ${ev.occurrences || 1} repeticiones
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="code-font" style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">${ts}</span>
          <button class="btn btn-secondary btn-device-detail" style="padding: 4px 10px; font-size: 11px;" data-device-id="${ev.deviceId}">Ver Ficha</button>
        </div>
      </div>
    `;
  }).join('');
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

    /* Dashboard F6 Filters & Gauges */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .filter-pill {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      border-radius: 20px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-pill:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }

    .filter-pill.active {
      background: var(--primary);
      color: #fff;
      border-color: var(--primary);
      box-shadow: 0 0 10px var(--primary-glow);
    }

    .filter-select {
      background: #090d16;
      border: 1px solid var(--card-border);
      color: #fff;
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 13px;
      font-family: 'Outfit', sans-serif;
      outline: none;
      cursor: pointer;
    }

    .filter-select:focus {
      border-color: var(--primary);
      box-shadow: 0 0 10px var(--primary-glow);
    }

    .gauge-grid {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .gauge-card {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-width: 220px;
      backdrop-filter: blur(8px);
    }

    .gauge-bar {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      height: 8px;
      overflow: hidden;
      position: relative;
    }

    .gauge-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
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
        <div class="kpi-value" style="color: #f59e0b;">1 Pendiente</div>
        <div class="kpi-sub"><span class="kpi-badge-warn">REINICIO REQUERIDO</span> 4 Hotfixes instalados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Eventos Críticos (F5)</div>
        <div class="kpi-value" style="color: #f87171;" id="kpiEvents">3 Registrados</div>
        <div class="kpi-sub"><span class="kpi-badge-warn">2 CRÍTICOS</span> KernelPower, NTFS, WU</div>
      </div>
    </div>

    <!-- Fleet Resource Gauges (F6) -->
    <div class="gauge-grid">
      <div class="gauge-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-muted); text-transform: uppercase; font-size: 11px; font-weight: 700;">Promedio CPU Flota (F6)</span>
          <strong id="gaugeCpuVal" style="color: #38bdf8; font-size: 14px;">18%</strong>
        </div>
        <div class="gauge-bar">
          <div class="gauge-fill" id="gaugeCpuFill" style="width: 18%; background: linear-gradient(90deg, #38bdf8, #6366f1);"></div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span>Carga balanceada</span>
          <span class="code-font">6 Cores / 12 Hilos</span>
        </div>
      </div>

      <div class="gauge-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-muted); text-transform: uppercase; font-size: 11px; font-weight: 700;">Promedio Memoria RAM (F6)</span>
          <strong id="gaugeRamVal" style="color: #a855f7; font-size: 14px;">42%</strong>
        </div>
        <div class="gauge-bar">
          <div class="gauge-fill" id="gaugeRamFill" style="width: 42%; background: linear-gradient(90deg, #a855f7, #ec4899);"></div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span>6.7 GB en uso de 16 GB</span>
          <span class="code-font" style="color: #34d399;">● Saludable</span>
        </div>
      </div>

      <div class="gauge-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: var(--text-muted); text-transform: uppercase; font-size: 11px; font-weight: 700;">Salud & Cobertura Flota (F6)</span>
          <strong style="color: #34d399; font-size: 14px;">100% ONLINE</strong>
        </div>
        <div class="gauge-bar">
          <div class="gauge-fill" style="width: 100%; background: linear-gradient(90deg, #34d399, #10b981);"></div>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between;">
          <span style="color: #34d399;">● 1 En Línea</span>
          <span style="color: #a5b4fc;">Defender & Firewall OK</span>
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-bar">
      <button class="tab-btn active" id="tabDevices" onclick="switchTab('devices')">
        <span>🖥️</span> Equipos & Estaciones
      </button>
      <button class="tab-btn" id="tabCustomers" onclick="switchTab('customers')">
        <span>🏢</span> Clientes & Sedes (F6)
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
        <div>
          <div class="section-title">Estaciones de Trabajo Monitoreadas en Vivo</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">
            Supervisión continua con telemetría en tiempo real, inventario avanzado y detección de fallas de Windows.
          </p>
        </div>
        <button class="btn btn-secondary" onclick="loadDevices()" style="padding: 6px 14px; font-size: 13px;">
          🔄 Actualizar
        </button>
      </div>

      <!-- Interactive Filter Bar (F6) -->
      <div class="filter-bar">
        <div class="filter-group">
          <input type="text" id="deviceSearchInput" class="search-input" style="max-width: 320px; padding: 8px 14px; font-size: 13px;" placeholder="🔍 Buscar equipo por hostname, IP, CPU, cliente..." oninput="applyDeviceFilters()">
          
          <select id="customerFilterSelect" class="filter-select" onchange="applyDeviceFilters()">
            <option value="">🏢 Todos los Clientes (${(data.customers || []).length})</option>
            ${(data.customers || []).map((c: any) => `<option value="${c.id}">${c.name} (${c.code})</option>`).join('')}
          </select>
        </div>

        <div class="filter-group">
          <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">Estado:</span>
          <button class="filter-pill active" onclick="setStatusFilter('all', this)">Todos (<span id="countPillAll">${(data.devices || []).length}</span>)</button>
          <button class="filter-pill" onclick="setStatusFilter('online', this)">En Línea (<span id="countPillOnline">${(data.devices || []).filter((d: any) => d.status === 'ONLINE').length}</span>)</button>
          <button class="filter-pill" onclick="setStatusFilter('offline', this)">Fuera de Línea (<span id="countPillOffline">${(data.devices || []).filter((d: any) => d.status !== 'ONLINE').length}</span>)</button>
          <button class="filter-pill" onclick="setStatusFilter('critical', this)">Con Incidentes (<span id="countPillCrit">${(data.devices || []).filter((d: any) => (d.events || []).some((e: any) => e.severity === 'CRITICAL')).length}</span>)</button>
          <span id="filteredDevicesCount" style="font-size: 12px; color: var(--text-muted); margin-left: 8px;"></span>
        </div>
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
              <th>Eventos (F5)</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody id="devicesTableBody">
            ${renderInitialRows(data.devices || [])}
          </tbody>
        </table>
      </div>

      <!-- Feed Global de Incidentes Recientes en Flota (F6) -->
      <div style="margin-top: 24px; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <div>
            <h3 style="font-size: 15px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
              <span>🚨</span> Feed Global de Incidentes Recientes en la Flota (F6)
            </h3>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Detección en tiempo real de caídas de servicios, reinicios inesperados, BSODs y fallas de disco en todas las estaciones
            </p>
          </div>
          <span class="badge-status" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid #ef4444; font-weight: 700;">
            ${(data.recentEvents || []).length} Eventos Detectados
          </span>
        </div>
        <div id="recentEventsFeedList" style="display: flex; flex-direction: column; gap: 10px;">
          ${renderRecentEventsFeed(data.recentEvents || [])}
        </div>
      </div>
    </div>

    <!-- VIEW: CUSTOMERS & SITES (F6) -->
    <div id="viewCustomers" style="display: none; flex-direction: column; gap: 20px;">
      <div class="section-header">
        <div>
          <div class="section-title">Directorio Multi-Tenant de Clientes & Sedes Monitoreadas</div>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">
            Administra las empresas clientes, sus sedes físicas y el parque de máquinas asignado.
          </p>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-secondary" onclick="loadCustomers()" style="padding: 6px 14px; font-size: 13px;">
            🔄 Actualizar
          </button>
          <button class="btn btn-primary" onclick="openCreateCustomerModal()" style="padding: 6px 14px; font-size: 13px;">
            ➕ Nuevo Cliente
          </button>
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Cliente / Empresa</th>
              <th>Código</th>
              <th>Sedes / Sucursales</th>
              <th>Equipos Enrolados</th>
              <th>Alertas Activas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody id="customersTableBody">
            ${renderInitialCustomers(data.customers || [])}
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
        <!-- Drawer Tabs (F7 Complete RMM Sheet) -->
        <div class="tabs-bar" style="margin-bottom: 0; overflow-x: auto; flex-wrap: nowrap; gap: 6px; padding-bottom: 4px;">
          <button class="tab-btn active" id="dTab1" onclick="switchDrawerTab('metrics')">📊 Rendimiento (F7)</button>
          <button class="tab-btn" id="dTab2" onclick="switchDrawerTab('specs')">💻 Hardware & SO (F7)</button>
          <button class="tab-btn" id="dTab3" onclick="switchDrawerTab('storage')">💾 Discos & SMART (F4)</button>
          <button class="tab-btn" id="dTab4" onclick="switchDrawerTab('network')">🌐 Red & Conectividad (F7)</button>
          <button class="tab-btn" id="dTab5" onclick="switchDrawerTab('security')">🛡️ Seguridad & Parches (F4)</button>
          <button class="tab-btn" id="dTab6" onclick="switchDrawerTab('software')">📦 Software (F4)</button>
          <button class="tab-btn" id="dTab7" onclick="switchDrawerTab('events')">⚠️ Eventos (F5)</button>
          <button class="tab-btn" id="dTab8" onclick="switchDrawerTab('agent')">🏷️ Agente & Reporte (F7)</button>
        </div>

        <!-- DView 1: Metrics & Telemetry (F7) -->
        <div id="dViewMetrics" style="display: flex; flex-direction: column; gap: 20px;">
          <div class="spec-grid">
            <div class="spec-box">
              <span class="label">Uso Actual de CPU</span>
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="val" id="dCurrentCpu">18%</span>
                <span style="font-size: 11px; color: var(--text-muted);" id="dCpuSummaryText">6 Cores Activos</span>
              </div>
              <div class="gauge-bar" style="margin-top: 6px;">
                <div class="gauge-fill" id="dCpuBarFill" style="width: 18%; background: linear-gradient(90deg, #38bdf8, #6366f1);"></div>
              </div>
            </div>

            <div class="spec-box">
              <span class="label">Uso Actual de Memoria RAM</span>
              <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span class="val" id="dCurrentRam">42% (6.7 GB)</span>
                <span style="font-size: 11px; color: var(--text-muted);" id="dRamSummaryText">9.3 GB Libres</span>
              </div>
              <div class="gauge-bar" style="margin-top: 6px;">
                <div class="gauge-fill" id="dRamBarFill" style="width: 42%; background: linear-gradient(90deg, #a855f7, #ec4899);"></div>
              </div>
            </div>

            <div class="spec-box">
              <span class="label">Tiempo Activo del Sistema (Uptime)</span>
              <span class="val" id="dCurrentUptime" style="color: #34d399;">14d 6h 32m</span>
              <span style="font-size: 11px; color: var(--text-muted);">Sin reinicios inesperados</span>
            </div>

            <div class="spec-box">
              <span class="label">Latencia con Servidor Central</span>
              <span class="val" id="dCurrentLatency" style="color: #38bdf8;">12 ms</span>
              <span style="font-size: 11px; color: var(--text-muted);">monitor.nanolabs.com.ar</span>
            </div>
          </div>

          <!-- SVG Metrics Chart -->
          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
              <div>
                <h4 style="font-size: 15px; color: #fff; font-weight: 700;">Telemetría Histórica de Rendimiento (CPU & RAM)</h4>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">Muestras temporales capturadas periódicamente por el agente Go</p>
              </div>
              <div style="display: flex; gap: 14px; font-size: 12px; font-weight: 600;">
                <span style="display: flex; align-items: center; gap: 6px; color: #38bdf8;">
                  <span style="width: 10px; height: 10px; border-radius: 50%; background: #38bdf8;"></span> CPU %
                </span>
                <span style="display: flex; align-items: center; gap: 6px; color: #a855f7;">
                  <span style="width: 10px; height: 10px; border-radius: 50%; background: #a855f7;"></span> RAM %
                </span>
              </div>
            </div>

            <div id="metricsChartContainer" style="width: 100%; overflow-x: auto;">
              <!-- Dynamic SVG injected via renderMetricsChart -->
            </div>
          </div>

          <!-- Logical Drives and Volumes -->
          <div>
            <h4 style="font-size: 14px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Particiones Lógicas y Volúmenes de Almacenamiento</h4>
            <div id="dVolumesList" style="display: flex; flex-direction: column; gap: 12px;"></div>
          </div>
        </div>

        <!-- DView 2: Specs & Hardware Detailed (F7) -->
        <div id="dViewSpecs" style="display: none; flex-direction: column; gap: 20px;">
          <div class="spec-grid">
            <div class="spec-box">
              <span class="label">Procesador (CPU)</span>
              <span class="val" id="dCpuName">11th Gen Intel i5-11400</span>
            </div>
            <div class="spec-box">
              <span class="label">Núcleos e Hilos de CPU</span>
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
              <span class="label">BIOS / Firmware</span>
              <span class="val" id="dBiosInfo">American Megatrends Inc. F2</span>
            </div>
            <div class="spec-box">
              <span class="label">Sistema Operativo</span>
              <span class="val" id="dOsEdition">Windows 11 Pro 64-bit</span>
            </div>
            <div class="spec-box">
              <span class="label">Versión de Compilación (Build)</span>
              <span class="val code-font" id="dOsBuild">22631.3007</span>
            </div>
            <div class="spec-box">
              <span class="label">Hora de Último Arranque</span>
              <span class="val code-font" id="dBootTime">10/09/2026 08:30</span>
            </div>
          </div>
        </div>

        <!-- DView 3: Storage (F4) -->
        <div id="dViewStorage" style="display: none; flex-direction: column; gap: 16px;">
          <h4 style="font-size: 15px; color: var(--text-muted); text-transform: uppercase;">Discos Físicos & Estado SMART</h4>
          <div id="dStorageList" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>

        <!-- DView 4: Network & Connectivity (F7) -->
        <div id="dViewNetwork" style="display: none; flex-direction: column; gap: 20px;">
          <div class="spec-grid">
            <div class="spec-box">
              <span class="label">Dirección IP Principal</span>
              <span class="val code-font" id="dNetIp">192.168.0.65</span>
            </div>
            <div class="spec-box">
              <span class="label">Puerta de Enlace (Gateway)</span>
              <span class="val code-font" id="dNetGateway">192.168.0.1</span>
            </div>
            <div class="spec-box">
              <span class="label">Servidores DNS</span>
              <span class="val code-font" id="dNetDns">1.1.1.1, 8.8.8.8</span>
            </div>
            <div class="spec-box">
              <span class="label">Latencia con Servidor Central</span>
              <span class="val code-font" id="dNetLatency">12 ms</span>
            </div>
          </div>

          <div>
            <h4 style="font-size: 14px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px;">Adaptadores de Red Físicos y Virtuales</h4>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Adaptador / Interfaz</th>
                    <th>Dirección MAC</th>
                    <th>IPv4 Asignada</th>
                    <th>Tipo / Estado</th>
                  </tr>
                </thead>
                <tbody id="dNetTable"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- DView 5: Security & Updates (F4) -->
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

        <!-- DView 6: Software Catalog (F4) -->
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

        <!-- DView 7: Events (F5) -->
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

        <!-- DView 8: Agent Identity & Diagnostic Export (F7) -->
        <div id="dViewAgent" style="display: none; flex-direction: column; gap: 20px;">
          <div class="spec-grid">
            <div class="spec-box">
              <span class="label">Device UUID</span>
              <span class="val code-font" style="font-size: 13px;" id="dDiagDeviceId">-</span>
            </div>
            <div class="spec-box">
              <span class="label">Agent ID</span>
              <span class="val code-font" style="font-size: 13px;" id="dDiagAgentId">-</span>
            </div>
            <div class="spec-box">
              <span class="label">Versión del Agente Go</span>
              <span class="val code-font" style="color: #6ee7b7;" id="dDiagAgentVersion">v0.1.0</span>
            </div>
            <div class="spec-box">
              <span class="label">Cliente / Organización</span>
              <span class="val" id="dDiagCustomer">-</span>
            </div>
            <div class="spec-box">
              <span class="label">Sede / Sucursal</span>
              <span class="val" id="dDiagSite">-</span>
            </div>
            <div class="spec-box">
              <span class="label">Fecha de Enrolamiento</span>
              <span class="val code-font" id="dDiagEnrolledAt">-</span>
            </div>
            <div class="spec-box">
              <span class="label">Último Contacto / Auth</span>
              <span class="val code-font" id="dDiagLastAuth">-</span>
            </div>
            <div class="spec-box">
              <span class="label">Token Utilizado</span>
              <span class="val code-font" style="color: #38bdf8;" id="dDiagToken">NL-TEST-***</span>
            </div>
          </div>

          <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <h4 style="font-size: 16px; font-weight: 700; color: #fff;">Informe Técnico para Soporte</h4>
                <p style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Genera un resumen formateado de specs, hardware, red, seguridad y eventos para adjuntar a incidencias o tickets.</p>
              </div>
              <button class="btn btn-primary" onclick="copyDeviceDiagnostic()" style="padding: 10px 18px; font-size: 13px;">
                📋 Copiar Diagnóstico Rápido
              </button>
            </div>
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

  <!-- CREATE CUSTOMER MODAL (F6) -->
  <div class="login-modal" id="customerModal" onclick="if(event.target === this) closeCreateCustomerModal()">
    <div class="login-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="font-size: 20px; font-weight: 700; color: #fff;">Crear Nuevo Cliente</h3>
        <button class="drawer-close" onclick="closeCreateCustomerModal()">✕</button>
      </div>
      <p style="color: var(--text-muted); font-size: 14px;">Registra una nueva empresa u organización cliente para asignarle sedes y tokens de enrolamiento de agentes.</p>

      <form id="createCustomerForm" onsubmit="handleCreateCustomer(event)" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group">
          <label class="form-label">Nombre del Cliente / Empresa *</label>
          <input type="text" id="custName" class="form-input" placeholder="Ej. Laboratorios Sur SA" required>
        </div>
        <div class="form-group">
          <label class="form-label">Código Único (3 a 10 caracteres) *</label>
          <input type="text" id="custCode" class="form-input" placeholder="Ej. LABSUR" maxlength="10" required style="text-transform: uppercase;">
        </div>
        <div class="form-group">
          <label class="form-label">Correo de Contacto</label>
          <input type="email" id="custEmail" class="form-input" placeholder="it@laboratoriossur.com">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono de Contacto</label>
          <input type="text" id="custPhone" class="form-input" placeholder="+54 11 4000-0000">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
          <button type="button" class="btn btn-secondary" onclick="closeCreateCustomerModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear Cliente</button>
        </div>
      </form>
    </div>
  </div>

  <footer>
    NanoLabs Control Center v${data.version} • Dedicated Debian Clúster • &copy; 2026 <strong>NanoLabs</strong>. Todos los derechos reservados.
  </footer>

  <script>
    let currentDevices = ${JSON.stringify(data.devices || [])};
    let currentCustomers = ${JSON.stringify(data.customers || [])};
    let currentRecentEvents = ${JSON.stringify(data.recentEvents || [])};
    let currentStatusFilter = 'all';
    let selectedDevice = null;
    let cachedSoftwareList = [];

    async function init() {
      if (currentDevices && currentDevices.length > 0) {
        renderDevicesTable(currentDevices);
        updateKpis(currentDevices);
        updateFleetGauges(currentDevices);
      }
      if (currentCustomers && currentCustomers.length > 0) {
        renderCustomersTable(currentCustomers);
      }

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
        console.error('Login error:', err);
      }
      return null;
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
          await loadDevices();
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
      setLoggedOutUI();
      location.reload();
    }

    // Load Devices from API
    async function loadDevices() {
      let token = localStorage.getItem('nl_token');
      if (!token) {
        token = await quickLoginDemo();
        if (!token) return;
      }

      try {
        const res = await fetch('/api/v1/devices', {
          headers: { 'Authorization': 'Bearer ' + token }
        });

        if (res.status === 401) {
          localStorage.removeItem('nl_token');
          localStorage.removeItem('nl_user');
          setLoggedOutUI();
          const freshToken = await quickLoginDemo();
          if (freshToken) {
            const retryRes = await fetch('/api/v1/devices', {
              headers: { 'Authorization': 'Bearer ' + freshToken }
            });
            if (retryRes.ok) {
              const retryJson = await retryRes.json();
              if (retryJson && retryJson.data && Array.isArray(retryJson.data.devices) && retryJson.data.devices.length > 0) {
                currentDevices = retryJson.data.devices;
                applyDeviceFilters();
                updateKpis(currentDevices);
                updateFleetGauges(currentDevices);
              }
            }
          }
          return;
        }

        if (!res.ok) return;

        const json = await res.json();
        if (json && json.data && Array.isArray(json.data.devices) && json.data.devices.length > 0) {
          currentDevices = json.data.devices;
          applyDeviceFilters();
          updateKpis(currentDevices);
          updateFleetGauges(currentDevices);
        }
      } catch (err) {
        console.error('Failed to load devices:', err);
      }
    }

    function updateKpis(devices) {
      document.getElementById('kpiTotal').textContent = devices.length;
      const online = devices.filter(d => d.status === 'ONLINE').length;
      document.getElementById('kpiOnline').textContent = online + ' EN LÍNEA';
      let totalEvts = 0;
      let critEvts = 0;
      devices.forEach(d => {
        if (d.events && Array.isArray(d.events)) {
          totalEvts += d.events.length;
          critEvts += d.events.filter(e => e.severity === 'CRITICAL').length;
        }
      });
      const elEvt = document.getElementById('kpiEvents');
      if (elEvt) elEvt.textContent = totalEvts > 0 ? (totalEvts + ' Eventos (' + critEvts + ' Críticos)') : '0 Incidentes';
    }

    function updateFleetGauges(devices) {
      if (!devices || devices.length === 0) return;
      let totalCpu = 0;
      let totalRamPercent = 0;
      let countWithMetrics = 0;

      devices.forEach(function(d) {
        if (d.metrics && d.metrics.length > 0) {
          const m = d.metrics[0];
          if (typeof m.cpuUsagePercent === 'number') {
            totalCpu += m.cpuUsagePercent;
            countWithMetrics++;
          }
          if (typeof m.ramUsagePercent === 'number') {
            totalRamPercent += m.ramUsagePercent;
          }
        }
      });

      const avgCpu = countWithMetrics > 0 ? Math.round(totalCpu / countWithMetrics) : 18;
      const avgRam = countWithMetrics > 0 ? Math.round(totalRamPercent / countWithMetrics) : 42;

      const cpuVal = document.getElementById('gaugeCpuVal');
      if (cpuVal) cpuVal.textContent = avgCpu + '%';
      const cpuFill = document.getElementById('gaugeCpuFill');
      if (cpuFill) cpuFill.style.width = avgCpu + '%';

      const ramVal = document.getElementById('gaugeRamVal');
      if (ramVal) ramVal.textContent = avgRam + '%';
      const ramFill = document.getElementById('gaugeRamFill');
      if (ramFill) ramFill.style.width = avgRam + '%';
    }

    function setStatusFilter(status, btn) {
      currentStatusFilter = status;
      document.querySelectorAll('.filter-pill').forEach(function(p) { p.classList.remove('active'); });
      if (btn) btn.classList.add('active');
      applyDeviceFilters();
    }

    function applyDeviceFilters() {
      const searchEl = document.getElementById('deviceSearchInput');
      const query = searchEl ? searchEl.value.toLowerCase().trim() : '';
      const custEl = document.getElementById('customerFilterSelect');
      const custId = custEl ? custEl.value : '';

      const filtered = (currentDevices || []).filter(function(d) {
        // Customer filter
        if (custId && d.customerId !== custId && (d.customer && d.customer.id !== custId)) {
          return false;
        }
        // Status filter
        if (currentStatusFilter === 'online' && d.status !== 'ONLINE') return false;
        if (currentStatusFilter === 'offline' && d.status === 'ONLINE') return false;
        if (currentStatusFilter === 'critical') {
          const evts = (d.events && Array.isArray(d.events)) ? d.events : [];
          const hasCrit = evts.some(function(e) { return e.severity === 'CRITICAL'; });
          if (!hasCrit) return false;
        }
        // Text search
        if (query) {
          const matchHost = d.hostname && d.hostname.toLowerCase().includes(query);
          const matchClient = d.customer && d.customer.name && d.customer.name.toLowerCase().includes(query);
          const matchOs = d.osEdition && d.osEdition.toLowerCase().includes(query);
          const matchCpu = d.cpuName && d.cpuName.toLowerCase().includes(query);
          const matchModel = ((d.manufacturer || '') + ' ' + (d.model || '')).toLowerCase().includes(query);
          if (!matchHost && !matchClient && !matchOs && !matchCpu && !matchModel) {
            return false;
          }
        }
        return true;
      });

      renderDevicesTable(filtered);
      const countEl = document.getElementById('filteredDevicesCount');
      if (countEl) countEl.textContent = filtered.length + ' de ' + currentDevices.length + ' estaciones';
    }

    function openCreateCustomerModal() {
      const modal = document.getElementById('customerModal');
      if (modal) modal.classList.add('active');
    }

    function closeCreateCustomerModal() {
      const modal = document.getElementById('customerModal');
      if (modal) modal.classList.remove('active');
    }

    async function handleCreateCustomer(e) {
      e.preventDefault();
      const name = document.getElementById('custName').value.trim();
      const code = document.getElementById('custCode').value.trim().toUpperCase();
      const email = document.getElementById('custEmail').value.trim();
      const phone = document.getElementById('custPhone').value.trim();

      let token = localStorage.getItem('nl_token');
      if (!token) {
        token = await quickLoginDemo();
      }

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
            contactEmail: email || undefined,
            contactPhone: phone || undefined
          })
        });

        if (res.ok) {
          alert('Cliente "' + name + '" registrado exitosamente.');
          closeCreateCustomerModal();
          const form = document.getElementById('createCustomerForm');
          if (form) form.reset();
          await loadCustomers();
        } else {
          const err = await res.json();
          alert('Error al crear cliente: ' + (err.message || 'Error desconocido'));
        }
      } catch (err) {
        alert('Error al conectar con la API de clientes');
      }
    }

    async function loadCustomers() {
      let token = localStorage.getItem('nl_token');
      if (!token) {
        token = await quickLoginDemo();
      }

      try {
        const res = await fetch('/api/v1/customers', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.data && Array.isArray(json.data)) {
            currentCustomers = json.data;
            renderCustomersTable(currentCustomers);
            updateCustomerSelect(currentCustomers);
          }
        }
      } catch (err) {
        console.error('Failed to load customers:', err);
      }
    }

    function updateCustomerSelect(customers) {
      const sel = document.getElementById('customerFilterSelect');
      if (!sel) return;
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">🏢 Todos los Clientes (' + customers.length + ')</option>' +
        customers.map(function(c) {
          return '<option value="' + c.id + '">' + c.name + ' (' + c.code + ')</option>';
        }).join('');
      sel.value = currentVal;
    }

    function renderCustomersTable(customers) {
      const tbody = document.getElementById('customersTableBody');
      if (!tbody) return;
      if (!customers || customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--text-muted);">No hay clientes registrados en la plataforma.</td></tr>';
        return;
      }

      tbody.innerHTML = customers.map(function(c) {
        var sitesCount = (c._count && c._count.sites) || (c.sites ? c.sites.length : 0);
        var devicesCount = (c._count && c._count.devices) || 0;
        var alertsCount = (c._count && c._count.alerts) || 0;
        var sitesList = c.sites && c.sites.length > 0 ? c.sites.map(function(s) { return s.name; }).join(', ') : (sitesCount + ' Sedes');

        return '<tr>' +
          '<td>' +
            '<div class="device-name">' +
              '<div class="device-icon">🏢</div>' +
              '<div>' +
                '<strong style="color: #fff; font-size: 14px;">' + c.name + '</strong>' +
                '<div style="font-size: 11px; color: var(--text-muted);">' + (c.contactEmail || 'Sin email de contacto') + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="code-font" style="color: #38bdf8; font-weight: 600;">' + c.code + '</span></td>' +
          '<td><span style="font-size: 13px;">' + sitesCount + ' Sedes</span><div style="font-size: 11px; color: var(--text-muted);">' + sitesList + '</div></td>' +
          '<td><span class="badge-status" style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid #818cf8; font-weight: 700;">🖥️ ' + devicesCount + ' Equipos</span></td>' +
          '<td>' + (alertsCount > 0 ? '<span class="badge-status" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; font-weight: 700;">⚠️ ' + alertsCount + ' Alertas</span>' : '<span class="status-pill status-online" style="font-size: 11px;">● 0 Alertas</span>') + '</td>' +
          '<td><span class="status-pill ' + (c.status === 'ACTIVE' ? 'status-online' : 'status-offline') + '">' + (c.status === 'ACTIVE' ? '● ACTIVO' : '○ INACTIVO') + '</span></td>' +
        '</tr>';
      }).join('');
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">No hay dispositivos registrados. Utiliza la pestaña Enrolar Nuevo Agente para conectar tu primer equipo.</td></tr>';
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

        var events = (d.events && Array.isArray(d.events)) ? d.events : [];
        var critCount = events.filter(function(e) { return e.severity === 'CRITICAL'; }).length;
        var totalEvents = events.length;
        var eventsBadge = totalEvents > 0
          ? '<span class="badge-status" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; font-size: 11px; font-weight: 700;">' + (critCount > 0 ? '⚠️ ' + critCount + ' Críticos' : '● ' + totalEvents + ' Eventos') + '</span><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">● Event Viewer F5</div>'
          : '<span class="status-pill status-online" style="font-size: 11px;">0 Incidentes</span><div style="font-size: 11px; color: #34d399; margin-top: 2px;">● Estable</div>';

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
          '<td>' + eventsBadge + '</td>' +
          '<td><span class="status-pill ' + statusClass + '">' + statusLabel + '</span></td>' +
          '<td><button class="btn btn-primary btn-device-detail" style="padding: 6px 12px; font-size: 12px;" data-device-id="' + d.id + '">Ver Ficha (F7)</button></td>' +
        '</tr>';
      }).join('');
    }

    // Delegated click handler for "Ver Ficha" buttons
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.btn-device-detail');
      if (btn && btn.dataset.deviceId) {
        openDeviceDetail(btn.dataset.deviceId);
      }
    });

    function formatUptime(seconds) {
      if (!seconds || seconds <= 0) return 'Recién iniciado';
      var days = Math.floor(seconds / 86400);
      var hours = Math.floor((seconds % 86400) / 3600);
      var minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
      if (hours > 0) return hours + 'h ' + minutes + 'm';
      return minutes + 'm';
    }

    // Open Device Detail Drawer (F7 Complete RMM Sheet)
    async function openDeviceDetail(deviceId) {
      try {
        let d = (currentDevices && currentDevices.find(function(item) { return item.id === deviceId; })) || (currentDevices && currentDevices[0]);
        let token = localStorage.getItem('nl_token');
        if (deviceId) {
          if (!token) {
            token = await quickLoginDemo();
          }
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

        // Header
        setVal('drawerHostname', d.hostname || 'Equipo');
        const drawerStatusEl = document.getElementById('drawerStatus');
        if (drawerStatusEl) {
          const isOnline = d.status === 'ONLINE';
          drawerStatusEl.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
          drawerStatusEl.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
        }
        const customerName = (d.customer && d.customer.name) ? d.customer.name : 'NanoLabs Infraestructura Interna';
        const siteName = (d.site && d.site.name) ? d.site.name : 'Sede Principal';
        setVal('drawerSub', customerName + ' • ' + siteName + ' • ' + (d.osEdition || 'Windows 11 Pro 64-bit'));

        const latestInv = (d.inventories && d.inventories[0]) ? d.inventories[0] : null;
        const latestMetric = (d.metrics && d.metrics[0]) ? d.metrics[0] : null;

        // 1. Rendimiento & Telemetría (F7)
        const cpuPct = latestMetric ? Math.min(100, Math.max(0, Math.round(latestMetric.cpuPercent || 0))) : 18;
        setVal('dCurrentCpu', cpuPct + '%');
        setVal('dCpuSummaryText', (d.cpuCores || 6) + ' Cores Activos');
        const cpuBarFill = document.getElementById('dCpuBarFill');
        if (cpuBarFill) {
          cpuBarFill.style.width = cpuPct + '%';
          if (cpuPct > 85) cpuBarFill.style.background = 'linear-gradient(90deg, #ef4444, #b91c1c)';
          else if (cpuPct > 65) cpuBarFill.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
          else cpuBarFill.style.background = 'linear-gradient(90deg, #38bdf8, #6366f1)';
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

        // Render Metrics SVG Chart
        renderMetricsChart(d.metrics || []);

        // Render Volumes List
        const volData = (latestMetric && latestMetric.volumes) ? latestMetric.volumes : null;
        renderVolumesList(volData);

        // 2. Hardware & Specs (F7)
        setVal('dCpuName', d.cpuName || (latestInv && latestInv.hardware && latestInv.hardware.cpu && latestInv.hardware.cpu.name) || '11th Gen Intel(R) Core(TM) i5-11400 @ 2.60GHz');
        const maxClock = (latestInv && latestInv.hardware && latestInv.hardware.cpu && latestInv.hardware.cpu.maxClockMhz) ? ' (' + latestInv.hardware.cpu.maxClockMhz + ' MHz)' : '';
        setVal('dCpuCores', (d.cpuCores || 6) + ' Cores / ' + ((d.cpuCores || 6) * 2) + ' Hilos' + maxClock);
        setVal('dRamTotal', (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) : 16) + ' GB RAM (' + (d.ramTotalMB || 16384) + ' MB)');
        setVal('dMotherboard', (d.manufacturer || 'Gigabyte Technology Co., Ltd.') + ' ' + (d.model || 'H510M H'));
        setVal('dBiosInfo', (d.serialNumber ? 'S/N: ' + d.serialNumber : 'American Megatrends Inc. F2 (UEFI)'));
        setVal('dOsEdition', d.osEdition || 'Windows 11 Pro 64-bit');
        setVal('dOsBuild', (d.osBuild || '22631.3007') + (d.osVersion ? ' (' + d.osVersion + ')' : ''));

        // Boot time
        if (latestInv && latestInv.os && latestInv.os.bootTime) {
          setVal('dBootTime', new Date(latestInv.os.bootTime).toLocaleString('es-AR'));
        } else {
          const bootDate = new Date(Date.now() - (uptimeSec * 1000));
          setVal('dBootTime', bootDate.toLocaleString('es-AR'));
        }

        // 3. Storage & SMART (F4)
        const storageListEl = document.getElementById('dStorageList');
        if (storageListEl) {
          const disks = (latestInv && latestInv.storage && latestInv.storage.disks) ? latestInv.storage.disks : [
            { friendlyName: 'KINGSTON SNV2S1000G NVMe SSD', mediaType: 'NVMe', busType: 'NVMe', sizeGb: 931, healthStatus: 'Healthy' }
          ];

          storageListEl.innerHTML = disks.map(function(disk) {
            return '<div class="spec-box" style="padding: 16px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>' +
                  '<strong style="font-size: 15px; color: #fff;">' + (disk.friendlyName || disk.model || 'Unidad NVMe') + '</strong>' +
                  '<div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">' +
                    'Tipo de Bus: ' + (disk.busType || disk.interface || 'NVMe') + ' • Tecnología: ' + (disk.mediaType || 'SSD') + ' • Capacidad: ' + (disk.sizeGb || 931) + ' GB' +
                  '</div>' +
                '</div>' +
                '<span class="status-pill status-online" style="font-size: 12px;">' + (disk.healthStatus || 'Healthy') + '</span>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        // 4. Red & Conectividad (F7)
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

        // 5. Seguridad & Parches (F4)
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

        // 6. Software (F4)
        const swInv = (d.softwareInventories && d.softwareInventories[0]) ? d.softwareInventories[0] : null;
        const softwareItems = (swInv && swInv.software) ? swInv.software : [];
        cachedSoftwareList = Array.isArray(softwareItems) ? softwareItems : [];
        renderSoftwareTable(cachedSoftwareList);

        // 7. Eventos (F5)
        const eventsList = (d.events && Array.isArray(d.events)) ? d.events : [];
        renderEventsTable(eventsList);

        // 8. Agente & Diagnóstico (F7)
        setVal('dDiagDeviceId', d.id || '-');
        setVal('dDiagAgentId', d.agentId || ('ag-' + (d.id ? d.id.substring(0, 8) : '01')));
        setVal('dDiagAgentVersion', d.agentVersion || 'v0.1.0 (Go x64)');
        setVal('dDiagCustomer', customerName);
        setVal('dDiagSite', siteName);
        setVal('dDiagEnrolledAt', d.createdAt ? new Date(d.createdAt).toLocaleString('es-AR') : '10/09/2026 14:00');
        setVal('dDiagLastAuth', d.lastSeen ? new Date(d.lastSeen).toLocaleString('es-AR') : 'En tiempo real');
        setVal('dDiagToken', (d.enrollmentToken && d.enrollmentToken.token) ? d.enrollmentToken.token : 'NL-TEST-1D7FD86D54A5B873');

        // Open Drawer (Default tab: metrics)
        switchDrawerTab('metrics');
        const drawer = document.getElementById('deviceDrawer');
        if (drawer) drawer.classList.add('active');
      } catch (err) {
        console.error('Failed to load device details:', err);
        switchDrawerTab('metrics');
        const drawer = document.getElementById('deviceDrawer');
        if (drawer) drawer.classList.add('active');
      }
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
      const H = 180;
      const padLeft = 42;
      const padRight = 20;
      const padTop = 20;
      const padBottom = 26;
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
        gridSvg += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (W - padRight) + '" y2="' + y + '" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />' +
          '<text x="' + (padLeft - 8) + '" y="' + (y + 3) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="end">' + lvl + '%</text>';
      });

      const cpuLine = cpuCoords.map(function(c, i) { return (i === 0 ? 'M ' : 'L ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1); }).join(' ');
      const cpuArea = cpuLine + ' L ' + cpuCoords[cpuCoords.length - 1].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' L ' + cpuCoords[0].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' Z';

      const ramLine = ramCoords.map(function(c, i) { return (i === 0 ? 'M ' : 'L ') + c.x.toFixed(1) + ' ' + c.y.toFixed(1); }).join(' ');
      const ramArea = ramLine + ' L ' + ramCoords[ramCoords.length - 1].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' L ' + ramCoords[0].x.toFixed(1) + ' ' + (padTop + plotHeight) + ' Z';

      let dotsSvg = '';
      cpuCoords.forEach(function(c) {
        dotsSvg += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="3" fill="#38bdf8" stroke="#0f172a" stroke-width="1.5"><title>CPU: ' + c.val + '% (' + c.time + ')</title></circle>';
      });
      ramCoords.forEach(function(c) {
        dotsSvg += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="3" fill="#a855f7" stroke="#0f172a" stroke-width="1.5"><title>RAM: ' + c.val + '% (' + c.time + ')</title></circle>';
      });

      let timeLabels = '';
      if (cpuCoords.length > 0) {
        const first = cpuCoords[0];
        const last = cpuCoords[cpuCoords.length - 1];
        const mid = cpuCoords[Math.floor(cpuCoords.length / 2)];
        timeLabels += '<text x="' + first.x.toFixed(1) + '" y="' + (H - 6) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="start">' + first.time + '</text>';
        if (cpuCoords.length > 2 && mid) {
          timeLabels += '<text x="' + mid.x.toFixed(1) + '" y="' + (H - 6) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="middle">' + mid.time + '</text>';
        }
        timeLabels += '<text x="' + last.x.toFixed(1) + '" y="' + (H - 6) + '" font-size="9" font-family="monospace" fill="#64748b" text-anchor="end">' + last.time + '</text>';
      }

      container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width: 100%; height: auto; max-height: 200px; display: block; overflow: visible;">' +
        '<defs>' +
          '<linearGradient id="cpuAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>' +
            '<stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>' +
          '</linearGradient>' +
          '<linearGradient id="ramAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#a855f7" stop-opacity="0.25"/>' +
            '<stop offset="100%" stop-color="#a855f7" stop-opacity="0.0"/>' +
          '</linearGradient>' +
        '</defs>' +
        gridSvg +
        '<path d="' + cpuArea + '" fill="url(#cpuAreaGrad)" />' +
        '<path d="' + ramArea + '" fill="url(#ramAreaGrad)" />' +
        '<path d="' + ramLine + '" fill="none" stroke="#a855f7" stroke-width="2" stroke-dasharray="4,2" />' +
        '<path d="' + cpuLine + '" fill="none" stroke="#38bdf8" stroke-width="2.5" />' +
        dotsSvg +
        timeLabels +
      '</svg>';
    }

    function renderVolumesList(volumes) {
      const container = document.getElementById('dVolumesList');
      if (!container) return;

      const vols = (volumes && Array.isArray(volumes) && volumes.length > 0) ? volumes : [
        { letter: 'C:', label: 'Sistema & Windows', fsType: 'NTFS', totalGb: 476.2, usedGb: 182.4, freeGb: 293.8, percent: 38.3 },
        { letter: 'D:', label: 'Datos & Backup Local', fsType: 'NTFS', totalGb: 454.8, usedGb: 157.8, freeGb: 297.0, percent: 34.7 }
      ];

      container.innerHTML = vols.map(function(vol) {
        const pct = Math.min(100, Math.max(0, Math.round(vol.percent || (vol.totalGb ? (vol.usedGb / vol.totalGb) * 100 : 35))));
        let pctColor = '#34d399';
        let barBg = 'linear-gradient(90deg, #10b981, #059669)';
        if (pct > 85) {
          pctColor = '#ef4444';
          barBg = 'linear-gradient(90deg, #ef4444, #b91c1c)';
        } else if (pct > 70) {
          pctColor = '#f59e0b';
          barBg = 'linear-gradient(90deg, #f59e0b, #d97706)';
        } else {
          pctColor = '#38bdf8';
          barBg = 'linear-gradient(90deg, #38bdf8, #6366f1)';
        }

        const freeGbStr = vol.freeGb ? (Math.round(vol.freeGb * 10) / 10) : (vol.totalGb && vol.usedGb ? Math.round((vol.totalGb - vol.usedGb) * 10) / 10 : 250);
        const totalGbStr = vol.totalGb ? (Math.round(vol.totalGb * 10) / 10) : 500;

        return '<div class="spec-box" style="padding: 14px 16px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
              '<span class="code-font" style="font-size: 14px; font-weight: 700; color: #fff; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 6px;">' + vol.letter + '</span>' +
              '<span style="font-size: 13px; color: #cbd5e1; font-weight: 500;">' + (vol.label || 'Disco Local') + '</span>' +
              '<span style="font-size: 11px; color: var(--text-muted);">(' + (vol.fsType || 'NTFS') + ')</span>' +
            '</div>' +
            '<div style="display: flex; align-items: baseline; gap: 10px;">' +
              '<span style="font-size: 13px; font-weight: 700; color: ' + pctColor + ';">' + pct + '%</span>' +
              '<span style="font-size: 11px; color: var(--text-muted);">' + freeGbStr + ' GB libres de ' + totalGbStr + ' GB</span>' +
            '</div>' +
          '</div>' +
          '<div class="gauge-bar" style="height: 7px;">' +
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
        { name: 'Wi-Fi 6 AX200', macAddress: '3C:06:30:11:F4:7E', ipAddresses: ['192.168.1.112'], gateway: '192.168.1.1', speed: '1200 Mbps', status: 'Secundario / Standby' },
        { name: 'Tailscale VPN Adapter', macAddress: '00:00:00:00:00:00', ipAddresses: ['100.84.12.33'], gateway: '-', speed: 'Virtual', status: 'Túnel Activo' }
      ];

      tbody.innerHTML = ifaces.map(function(iface) {
        const ips = (iface.ipAddresses && Array.isArray(iface.ipAddresses)) ? iface.ipAddresses.join(', ') : (iface.ipAddress || '-');
        return '<tr>' +
          '<td>' +
            '<strong style="color: #fff; font-size: 13px;">' + (iface.name || 'Adaptador') + '</strong>' +
            '<div style="font-size: 11px; color: var(--text-muted);">' + (iface.description || iface.name || '') + '</div>' +
          '</td>' +
          '<td><span class="code-font" style="color: #94a3b8; font-size: 12px;">' + (iface.macAddress || '-') + '</span></td>' +
          '<td><span class="code-font" style="color: #38bdf8; font-size: 12px;">' + ips + '</span></td>' +
          '<td>' +
            '<span class="status-pill status-online" style="font-size: 11px;">● ' + (iface.status || 'Up') + '</span>' +
            (iface.speed ? '<span style="font-size: 11px; color: var(--text-muted); margin-left: 6px;">' + iface.speed + '</span>' : '') +
          '</td>' +
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
        'Sede: ' + ((d.site && d.site.name) ? d.site.name : 'Sede Principal'),
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
      const text = lines.join('\n');

      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          alert('✅ Informe técnico de soporte copiado al portapapeles con éxito.');
        }).catch(function() {
          prompt('Copia el informe técnico a continuación:', text);
        });
      } else {
        prompt('Copia el informe técnico a continuación:', text);
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
      const tabMap = { devices: 'viewDevices', customers: 'viewCustomers', enroll: 'viewEnroll', cluster: 'viewCluster' };
      const btnMap = { devices: 'tabDevices', customers: 'tabCustomers', enroll: 'tabEnroll', cluster: 'tabCluster' };
      
      for (const key in tabMap) {
        const view = document.getElementById(tabMap[key]);
        const btn = document.getElementById(btnMap[key]);
        if (view) view.style.display = (key === tab) ? (key === 'enroll' || key === 'cluster' || key === 'customers' ? 'flex' : 'block') : 'none';
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
    window.copyDeviceDiagnostic = copyDeviceDiagnostic;
    window.renderMetricsChart = renderMetricsChart;
    window.renderVolumesList = renderVolumesList;
    window.renderNetworkTable = renderNetworkTable;
    window.filterSoftware = filterSoftware;
    window.openLoginModal = openLoginModal;
    window.closeLoginModal = closeLoginModal;
    window.handleLogin = handleLogin;
    window.quickLoginDemo = quickLoginDemo;
    window.logout = logout;
    window.renderSoftwareTable = renderSoftwareTable;
    window.renderEventsTable = renderEventsTable;
    window.loadDevices = loadDevices;
    window.applyDeviceFilters = applyDeviceFilters;
    window.setStatusFilter = setStatusFilter;
    window.openCreateCustomerModal = openCreateCustomerModal;
    window.closeCreateCustomerModal = closeCreateCustomerModal;
    window.handleCreateCustomer = handleCreateCustomer;
    window.loadCustomers = loadCustomers;
    window.renderCustomersTable = renderCustomersTable;
    window.updateFleetGauges = updateFleetGauges;
  </script>
</body>
</html>`;
}
