export function getAlertsViewHtml(): string {
  return `
    <div id="viewAlerts" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header with Quick KPI Summary & Action Buttons -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Centro de Alertas & Auto-Remediación</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Motor proactivo de detección de anomalías y resolución automatizada de incidentes técnicos.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="triggerAlertEvaluation()" title="Ejecutar motor de evaluación de reglas inmediatamente">
            <span id="acEvalSpinner">⚡</span> Evaluar Reglas
          </button>
          <button class="btn btn-secondary btn-sm" onclick="refreshAlertsAndRemediations()" title="Recargar cola de alertas y remediaciones">
            <span id="acRefreshIcon">🔄</span> Actualizar
          </button>
        </div>
      </div>

      <!-- Auto-Remediation KPI Cards Row -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
        <div class="stat-card" style="border-left: 4px solid #10b981;">
          <div class="stat-card-title">⚡ Intervenciones Ahorradas</div>
          <div class="stat-card-value" id="remedSavedInterventions" style="color: #10b981;">0</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Incidentes auto-resueltos sin técnico</div>
        </div>

        <div class="stat-card" style="border-left: 4px solid #06b6d4;">
          <div class="stat-card-title">🎯 Tasa de Éxito de Remediación</div>
          <div class="stat-card-value" id="remedSuccessRate" style="color: #06b6d4;">100%</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Efectividad en ejecuciones</div>
        </div>

        <div class="stat-card" style="border-left: 4px solid #f59e0b;">
          <div class="stat-card-title">🛡️ Pendientes de Aprobación</div>
          <div class="stat-card-value" id="remedPendingApproval" style="color: #f59e0b;">0</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Requieren 1-clic del operador</div>
        </div>

        <div class="stat-card" style="border-left: 4px solid #ef4444;">
          <div class="stat-card-title">🛑 Circuit Breakers</div>
          <div class="stat-card-value" id="remedCircuitBroken" style="color: #ef4444;">0</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Bloqueos por fallos reiterados</div>
        </div>

        <div class="stat-card" style="border-left: 4px solid #6366f1;">
          <div class="stat-card-title">⚙️ Remediaciones Ejecutadas</div>
          <div class="stat-card-value" id="remedTotalAttempted" style="color: #6366f1;">0</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Total ciclos de corrección</div>
        </div>
      </div>

      <!-- Navigation Tabs between Alerts Queue and Remediation Engine -->
      <div style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 2px;">
        <button id="tabBtnAlertsQueue" class="filter-pill active" onclick="switchAlertViewTab('queue')" style="border-radius: 6px 6px 0 0; padding: 8px 16px; font-weight: 700;">
          🚨 Cola de Alertas
        </button>
        <button id="tabBtnRemediations" class="filter-pill" onclick="switchAlertViewTab('remediations')" style="border-radius: 6px 6px 0 0; padding: 8px 16px; font-weight: 700;">
          ⚡ Historial & Aprobaciones de Remediación (<span id="remedPendingBadge">0</span>)
        </button>
      </div>

      <!-- TAB 1: OPERATIONAL ALERTS QUEUE -->
      <div id="subviewAlertsQueue" style="display: flex; flex-direction: column; gap: 16px;">
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

      <!-- TAB 2: REMEDIATION EXECUTIONS & APPROVALS -->
      <div id="subviewRemediations" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: #fff;">Historial Operativo de Auto-Remediaciones</h3>
              <p style="font-size: 12px; color: var(--text-secondary);">
                Registro de acciones de contención y auto-remediación automáticas o pendientes de autorización.
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="loadRemediationData()">
              🔄 Refrescar Historial
            </button>
          </div>

          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th style="width: 150px;">Fecha / Hora</th>
                  <th>Equipo</th>
                  <th>Alerta Asociada</th>
                  <th>Acción Disparada</th>
                  <th>Modo</th>
                  <th>Estado</th>
                  <th style="text-align: center;">Ahorro</th>
                  <th style="text-align: right; width: 180px;">Acción Operador</th>
                </tr>
              </thead>
              <tbody id="remediationsTableBody">
                <tr>
                  <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
                    Cargando historial de remediaciones...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;
}
