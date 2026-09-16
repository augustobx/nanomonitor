export function getDevicesViewHtml(): string {
  return `
    <div id="viewDevices" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Flota Global de Equipos</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Monitoreo en tiempo real de todas las estaciones de trabajo y servidores Windows administrados.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="status-pill status-online" id="devOnlineCountPill">0 Online</span>
          <span class="status-pill status-offline" id="devOfflineCountPill">0 Offline</span>
        </div>
      </div>

      <!-- Filters Bar -->
      <div class="filter-bar">
        <div class="filter-group">
          <div class="input-search-wrapper">
            <span class="input-search-icon">🔍</span>
            <input type="text" id="fleetSearchInput" class="input-search" placeholder="Buscar por hostname, IP..." oninput="filterFleetDevices()">
          </div>

          <select id="fleetFilterCustomer" class="filter-select" onchange="filterFleetDevices()">
            <option value="ALL">Todos los Clientes</option>
          </select>

          <select id="fleetFilterStatus" class="filter-select" onchange="filterFleetDevices()">
            <option value="ALL">Todos los Estados</option>
            <option value="ONLINE">En Línea (Online)</option>
            <option value="OFFLINE">Desconectados (Offline)</option>
          </select>

          <select id="fleetFilterHealth" class="filter-select" onchange="filterFleetDevices()">
            <option value="ALL">Cualquier Health Score</option>
            <option value="OPTIMAL">Óptimo (&ge; 80)</option>
            <option value="REGULAR">Regular (50 - 79)</option>
            <option value="CRITICAL">Crítico (&lt; 50)</option>
          </select>

          <select id="fleetFilterAlerts" class="filter-select" onchange="filterFleetDevices()">
            <option value="ALL">Alertas: Todas</option>
            <option value="WITH_ALERTS">Con Alertas Activas</option>
            <option value="NO_ALERTS">Sin Alertas</option>
          </select>

          <select id="fleetFilterReboot" class="filter-select" onchange="filterFleetDevices()">
            <option value="ALL">Reinicio: Todos</option>
            <option value="PENDING">Reinicio Pendiente</option>
          </select>
        </div>

        <div>
          <button class="btn btn-ghost btn-sm" onclick="resetFleetFilters()" title="Restablecer todos los filtros">
            Limpiar Filtros
          </button>
        </div>
      </div>

      <!-- Global Fleet Table -->
      <div class="section-card">
        <div class="table-responsive">
          <table class="noc-table">
            <thead>
              <tr>
                <th>Equipo</th>
                <th>Cliente & Sede</th>
                <th>Estado</th>
                <th>Health Score</th>
                <th>CPU / RAM</th>
                <th>Disco</th>
                <th>Seguridad</th>
                <th>Alertas</th>
                <th>Último Reporte</th>
                <th style="text-align: right;">Acción</th>
              </tr>
            </thead>
            <tbody id="fleetTableBody">
              <tr>
                <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px;">
                  Cargando flota de equipos...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}
