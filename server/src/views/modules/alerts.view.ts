export function getAlertsViewHtml(): string {
  return `
    <div id="viewAlerts" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header with Quick KPI Summary & Action Buttons -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Centro de Alertas & Monitoreo Proactivo</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Cola operativa de incidentes técnicos detectados por las sondas de telemetría.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="triggerAlertEvaluation()" title="Ejecutar motor de evaluación de reglas inmediatamente">
            <span id="acEvalSpinner">⚡</span> Evaluar Reglas
          </button>
          <button class="btn btn-secondary btn-sm" onclick="refreshAlerts()" title="Recargar cola de alertas">
            <span id="acRefreshIcon">🔄</span> Actualizar
          </button>
        </div>
      </div>

      <!-- Quick Filter Pills Bar -->
      <div class="filter-bar">
        <div class="filter-group" id="alertQuickFilters">
          <button class="filter-pill active" data-filter="ALL" onclick="setAlertQuickFilter('ALL')">
            Todas (<span id="acCountAll">0</span>)
          </button>
          <button class="filter-pill" data-filter="CRITICAL" onclick="setAlertQuickFilter('CRITICAL')" style="color: #f87171;">
            🔴 Críticas (<span id="acCountCritical">0</span>)
          </button>
          <button class="filter-pill" data-filter="HIGH" onclick="setAlertQuickFilter('HIGH')" style="color: #fb923c;">
            🟠 Altas (<span id="acCountHigh">0</span>)
          </button>
          <button class="filter-pill" data-filter="WARNING" onclick="setAlertQuickFilter('WARNING')" style="color: #facc15;">
            🟡 Advertencias (<span id="acCountWarning">0</span>)
          </button>
          <button class="filter-pill" data-filter="UNACKNOWLEDGED" onclick="setAlertQuickFilter('UNACKNOWLEDGED')">
            👁️ Sin Reconocer (<span id="acCountUnack">0</span>)
          </button>
          <button class="filter-pill" data-filter="RECURRENT" onclick="setAlertQuickFilter('RECURRENT')">
            🔁 Recurrentes (&ge;3)
          </button>
          <button class="filter-pill" data-filter="OFFLINE" onclick="setAlertQuickFilter('OFFLINE')">
            🔌 Equipos Offline
          </button>
          <button class="filter-pill" data-filter="TODAY" onclick="setAlertQuickFilter('TODAY')">
            📅 Hoy
          </button>
        </div>

        <!-- Advanced Filter Controls -->
        <div class="filter-group">
          <div class="input-search-wrapper">
            <span class="input-search-icon">🔍</span>
            <input type="text" id="acSearchInput" class="input-search" placeholder="Buscar equipo, cliente..." oninput="filterAlertCenter()">
          </div>

          <select id="acFilterCustomer" class="filter-select" onchange="filterAlertCenter()">
            <option value="ALL">Todos los Clientes</option>
          </select>

          <select id="acFilterStatus" class="filter-select" onchange="filterAlertCenter()">
            <option value="ACTIVE" selected>Abiertas y Reconocidas</option>
            <option value="OPEN">Sólo Abiertas</option>
            <option value="ACKNOWLEDGED">Sólo Reconocidas</option>
            <option value="RESOLVED">Resueltas</option>
            <option value="ALL">Histórico Completo</option>
          </select>
        </div>
      </div>

      <!-- Main Operational Alerts Table -->
      <div class="section-card">
        <div class="table-responsive">
          <table class="noc-table">
            <thead>
              <tr>
                <th style="width: 120px;">Severidad</th>
                <th>Equipo</th>
                <th>Cliente / Sede</th>
                <th>Alerta & Diagnóstico</th>
                <th style="text-align: center; width: 90px;">Ocurr.</th>
                <th>Última Detección</th>
                <th>Estado</th>
                <th style="text-align: right; width: 220px;">Acción</th>
              </tr>
            </thead>
            <tbody id="acAlertsTableBody">
              <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
                  Cargando cola operativa de alertas...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}
