export function getSidebarHtml(): string {
  return `
    <aside class="app-sidebar" id="appSidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand-logo">NL</div>
        <div class="sidebar-brand-text">
          <span class="sidebar-brand-title">NanoLabs</span>
          <span class="sidebar-brand-sub">Control Center</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-nav-section-title">Operaciones NOC</div>
        
        <a class="nav-item active" id="navItemDashboard" onclick="switchNavTab('dashboard')" title="Dashboard NOC">
          <span class="nav-item-icon">📊</span>
          <span class="nav-item-label">Dashboard</span>
        </a>

        <a class="nav-item" id="navItemAlerts" onclick="switchNavTab('alerts')" title="Centro de Alertas">
          <span class="nav-item-icon">🚨</span>
          <span class="nav-item-label">Alertas</span>
          <span class="nav-item-badge" id="sbAlertsBadge" style="display: none;">0</span>
        </a>

        <div class="sidebar-nav-section-title" style="margin-top: 12px;">Gestión de Flota</div>

        <a class="nav-item" id="navItemCustomers" onclick="switchNavTab('customers')" title="Clientes & Sedes">
          <span class="nav-item-icon">🏢</span>
          <span class="nav-item-label">Clientes</span>
          <span class="code-badge" id="sbCustomersCount" style="margin-left: auto; font-size: 10px; padding: 1px 5px;">0</span>
        </a>

        <a class="nav-item" id="navItemDevices" onclick="switchNavTab('devices')" title="Flota Global de Equipos">
          <span class="nav-item-icon">💻</span>
          <span class="nav-item-label">Equipos</span>
          <span class="code-badge" id="sbDevicesCount" style="margin-left: auto; font-size: 10px; padding: 1px 5px;">0</span>
        </a>

        <a class="nav-item" id="navItemAgents" onclick="switchNavTab('agents')" title="Agentes & Enrolamiento">
          <span class="nav-item-icon">⚡</span>
          <span class="nav-item-label">Agentes</span>
        </a>

        <a class="nav-item" id="navItemActions" onclick="openRemoteActionsFromNav()" title="Acciones Remotas RMM">
          <span class="nav-item-icon">🚀</span>
          <span class="nav-item-label">Acciones Remotas</span>
        </a>

        <div class="sidebar-nav-section-title" style="margin-top: 12px;">Sistema</div>

        <a class="nav-item" id="navItemPlatform" onclick="switchNavTab('platform')" title="Infraestructura y Servicios">
          <span class="nav-item-icon">⚙️</span>
          <span class="nav-item-label">Plataforma</span>
        </a>

        <a class="nav-item" id="navItemSettings" onclick="switchNavTab('settings')" title="Reglas y Configuración">
          <span class="nav-item-icon">🛠️</span>
          <span class="nav-item-label">Configuración</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-status-indicator">
          <span class="pulse-dot online"></span>
          <span>Clúster Activo</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="btnToggleSidebar" onclick="toggleSidebar()" title="Colapsar / Expandir barra lateral">
          <span id="sidebarToggleIcon">◀</span>
        </button>
      </div>
    </aside>
  `;
}
