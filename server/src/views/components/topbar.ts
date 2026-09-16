export function getTopbarHtml(): string {
  return `
    <header class="app-topbar">
      <div class="topbar-left">
        <button class="btn btn-ghost btn-sm" id="btnMobileMenu" style="display: none;" onclick="toggleMobileSidebar()" title="Abrir menú">
          ☰
        </button>

        <button class="topbar-search-btn" onclick="openGlobalSearch()" title="Buscar clientes, equipos o alertas (Ctrl+K)">
          <span class="input-search-icon">🔍</span>
          <span>Buscar clientes, equipos...</span>
          <span class="kbd-shortcut">Ctrl K</span>
        </button>
      </div>

      <div class="topbar-right">
        <span class="status-pill status-online" id="topbarClusterStatus">
          <span class="pulse-dot online"></span>
          <span>CONSOLA EN LÍNEA • Clúster Debian Activo</span>
        </span>

        <button class="status-pill status-danger" id="topbarAlertsPill" style="display: none; cursor: pointer; border: none;" onclick="switchNavTab('alerts')" title="Ver alertas que requieren atención">
          <span class="pulse-dot danger"></span>
          <span id="topbarAlertsCount">0 Críticas</span>
        </button>

        <button class="btn btn-ghost btn-sm" id="btnGlobalRefresh" onclick="handleGlobalRefresh()" title="Sincronizar telemetría ahora">
          <span id="globalRefreshSpinner">🔄</span>
        </button>

        <div id="userBadge" style="display: none; align-items: center; gap: 8px;">
          <span class="code-badge" id="userEmailBadge" style="font-size: 11px;">admin@nanolabs.com.ar</span>
          <button class="btn btn-secondary btn-sm" onclick="logout()" title="Cerrar sesión activa">Salir</button>
        </div>

        <button class="btn btn-primary btn-sm" id="loginNavBtn" onclick="openLoginModal()">
          Iniciar Sesión
        </button>
      </div>
    </header>
  `;
}
