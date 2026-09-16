export function getDashboardViewHtml(): string {
  return `
    <div id="viewDashboard" class="view-panel" style="display: flex; flex-direction: column; gap: 20px;">
      
      <!-- 8 Executive KPIs Strip -->
      <div class="kpi-grid">
        <div class="kpi-card" id="kpiCardCriticalAlerts">
          <div class="kpi-title">
            <span>Alertas Críticas</span>
            <span>🚨</span>
          </div>
          <div class="kpi-number" id="dashKpiCriticalAlerts" style="color: var(--danger);">0</div>
          <div class="kpi-desc" id="dashKpiCriticalDesc">Requieren atención inmediata</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Alertas Totales</span>
            <span>⚠️</span>
          </div>
          <div class="kpi-number" id="dashKpiTotalAlerts">0</div>
          <div class="kpi-desc" id="dashKpiHighDesc">0 Altas • 0 Advertencias</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Equipos Online</span>
            <span>🟢</span>
          </div>
          <div class="kpi-number" id="dashKpiOnlineDevices" style="color: var(--success);">0</div>
          <div class="kpi-desc" id="dashKpiOnlinePercent">100% de la flota reportando</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Equipos Offline</span>
            <span>🔌</span>
          </div>
          <div class="kpi-number" id="dashKpiOfflineDevices">0</div>
          <div class="kpi-desc">Sin telemetría reciente</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Clientes Afectados</span>
            <span>🏢</span>
          </div>
          <div class="kpi-number" id="dashKpiAffectedCustomers">0</div>
          <div class="kpi-desc" id="dashKpiTotalCustSummary">De 0 clientes totales</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Salud de Flota</span>
            <span>🛡️</span>
          </div>
          <div class="kpi-number" id="dashKpiAvgHealth">--</div>
          <div class="kpi-desc" id="dashKpiHealthLabel">Health Score promedio</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Incidentes Nuevos</span>
            <span>⚡</span>
          </div>
          <div class="kpi-number" id="dashKpiNewIncidents">0</div>
          <div class="kpi-desc">Últimas 24 horas</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-title">
            <span>Resueltos Hoy</span>
            <span>✅</span>
          </div>
          <div class="kpi-number" id="dashKpiResolvedToday" style="color: var(--success);">0</div>
          <div class="kpi-desc">Cerrados por el equipo NOC</div>
        </div>
      </div>

      <!-- Main Operational Split: Left 65%, Right 35% -->
      <div style="display: grid; grid-template-columns: 1.8fr 1fr; gap: 20px;" class="dash-operational-grid">
        
        <!-- Left Column: Critical Alerts & Offline Devices -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Quadrant 1: Alertas Críticas & Altas -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">
                <span>🚨 Alertas que Requieren Atención</span>
                <span class="status-pill status-danger" id="dashAlertsBadge">0 Activas</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="switchNavTab('alerts')">Ir a Alertas →</button>
            </div>
            <div class="table-responsive">
              <table class="noc-table">
                <thead>
                  <tr>
                    <th>Severidad</th>
                    <th>Equipo</th>
                    <th>Cliente</th>
                    <th>Alerta</th>
                    <th>Tiempo</th>
                    <th style="text-align: right;">Acción</th>
                  </tr>
                </thead>
                <tbody id="dashAlertsTableBody">
                  <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                      No hay alertas activas en este momento. Todos los sistemas operan en estado óptimo.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Quadrant 2: Equipos Offline -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">
                <span>🔌 Equipos Desconectados (Offline)</span>
                <span class="status-pill status-offline" id="dashOfflineBadge">0 Equipos</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="switchNavTab('devices')">Ver Todos los Equipos →</button>
            </div>
            <div class="table-responsive">
              <table class="noc-table">
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Cliente</th>
                    <th>Sede</th>
                    <th>Último Reporte</th>
                    <th style="text-align: right;">Acción</th>
                  </tr>
                </thead>
                <tbody id="dashOfflineTableBody">
                  <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
                      No hay equipos desconectados. El 100% de la flota se encuentra en línea.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Right Column: Clientes en Riesgo, Actividad Reciente & Resumen Plataforma -->
        <div style="display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Quadrant 3: Clientes en Riesgo -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">
                <span>🏢 Clientes en Riesgo</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="switchNavTab('customers')">Ver Clientes →</button>
            </div>
            <div class="section-body" style="padding: 12px; display: flex; flex-direction: column; gap: 8px;" id="dashRiskCustomersList">
              <div style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 12px;">
                No se detectan clientes en estado de riesgo operativo.
              </div>
            </div>
          </div>

          <!-- Quadrant 4: Actividad Reciente NOC -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">
                <span>⚡ Actividad Reciente</span>
              </div>
              <span class="code-badge" style="font-size: 10px;">Telemetría en Vivo</span>
            </div>
            <div class="section-body" style="padding: 12px; display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow-y: auto;" id="dashActivityFeed">
              <!-- Rendered dynamically -->
            </div>
          </div>

          <!-- Quadrant 5: Estado de Plataforma -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title">
                <span>⚙️ Estado de la Plataforma</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="switchNavTab('platform')">Detalles →</button>
            </div>
            <div class="section-body" style="padding: 14px; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: var(--text-secondary);">Servidor API Fastify</span>
                <span class="status-pill status-online"><span class="pulse-dot online"></span> Operativo (v0.1.0)</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: var(--text-secondary);">PostgreSQL 17</span>
                <span class="status-pill status-online"><span class="pulse-dot online"></span> Conectado (Pool Activo)</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: var(--text-secondary);">Redis 7 / Telemetría</span>
                <span class="status-pill status-online"><span class="pulse-dot online"></span> Latencia &lt; 2ms</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: var(--text-secondary);">Agente Windows (Go)</span>
                <span class="status-pill status-online">TLS / HMAC SHA256</span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  `;
}
