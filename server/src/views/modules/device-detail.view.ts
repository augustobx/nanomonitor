export function getDeviceDetailViewHtml(): string {
  return `
    <div id="viewDeviceDetail" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Compact Top Header Banner -->
      <div class="section-card">
        <div style="padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
          
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; font-size: 20px;">
              💻
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;" id="dHostname">HOSTNAME</h2>
                <span class="status-pill status-online" id="dStatusPill">ONLINE</span>
                <span class="code-badge" id="dCustomerBadge">CLIENTE</span>
                <span class="code-badge" id="dSiteBadge">SEDE</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                <span>🌐 IP: <strong id="dIpText" style="color: #fff;">-</strong></span>
                <span>🪟 SO: <span id="dOsText">-</span></span>
                <span>⚡ CPU: <span id="dCpuSummary">-</span></span>
                <span>🧠 RAM: <span id="dRamSummary">-</span></span>
                <span>📡 Agente: <span id="dAgentVersion">-</span></span>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btnBackFromDevice" onclick="backFromDeviceWorkspace()">
              ← Volver
            </button>
            <button class="btn btn-secondary btn-sm" onclick="triggerDeviceAlertEvaluation()" title="Evaluar reglas de alertas en este equipo">
              ⚡ Evaluar Reglas
            </button>
            <button class="btn btn-primary btn-sm" onclick="recalculateCurrentDeviceHealth()" title="Recalcular Health Score en tiempo real">
              🛡️ Recalcular Salud
            </button>
          </div>
        </div>

        <!-- Clean Secondary Navigation (Wrap without horizontal scroll) -->
        <div class="subnav-tabs" style="padding: 0 24px; background: var(--bg-surface-subtle); border-top: 1px solid var(--border-subtle);">
          <button class="subnav-tab-btn active" id="dTabResumen" onclick="switchDeviceSubTab('resumen')">
            📊 Resumen
          </button>
          <button class="subnav-tab-btn" id="dTabRendimiento" onclick="switchDeviceSubTab('rendimiento')">
            📈 Rendimiento
          </button>
          <button class="subnav-tab-btn" id="dTabHardware" onclick="switchDeviceSubTab('hardware')">
            ⚙️ Hardware & SO
          </button>
          <button class="subnav-tab-btn" id="dTabDiscos" onclick="switchDeviceSubTab('discos')">
            💾 Discos & SMART
          </button>
          <button class="subnav-tab-btn" id="dTabRed" onclick="switchDeviceSubTab('red')">
            🌐 Red
          </button>
          <button class="subnav-tab-btn" id="dTabSeguridad" onclick="switchDeviceSubTab('seguridad')">
            🛡️ Seguridad
          </button>
          <button class="subnav-tab-btn" id="dTabSoftware" onclick="switchDeviceSubTab('software')">
            📦 Software (<span id="dCountSoftware">0</span>)
          </button>
          <button class="subnav-tab-btn" id="dTabEventos" onclick="switchDeviceSubTab('eventos')">
            📜 Eventos
          </button>
          <button class="subnav-tab-btn" id="dTabAlertas" onclick="switchDeviceSubTab('alertas')">
            🚨 Alertas (<span id="dCountAlertas">0</span>)
          </button>
          <button class="subnav-tab-btn" id="dTabAgente" onclick="switchDeviceSubTab('agente')">
            ⚡ Agente
          </button>
        </div>
      </div>

      <!-- SUBTAB 1: RESUMEN OPERATIVO -->
      <div id="dViewResumen" style="display: flex; flex-direction: column; gap: 20px;">
        
        <!-- Prioritary Attention Block (Rendered if issues exist) -->
        <div class="attention-box" id="dAttentionBox" style="display: none;">
          <div class="attention-header">
            <span>⚠️ REQUIERE ATENCIÓN TÉCNICA</span>
          </div>
          <div class="attention-items" id="dAttentionItems">
            <!-- Badges injected dynamically -->
          </div>
        </div>

        <!-- 4 Core Operational Metric Cards -->
        <div class="kpi-grid">
          <div class="kpi-card" id="dCardRendimiento">
            <div class="kpi-title"><span>Rendimiento</span><span>📈</span></div>
            <div class="kpi-number" id="dKpiCpuUsage">0%</div>
            <div class="kpi-desc" id="dKpiRamUsage">RAM: 0% en uso</div>
          </div>
          <div class="kpi-card" id="dCardAlmacenamiento">
            <div class="kpi-title"><span>Almacenamiento</span><span>💾</span></div>
            <div class="kpi-number" id="dKpiDiskFree">--</div>
            <div class="kpi-desc" id="dKpiSmartStatus">SMART: Verificando</div>
          </div>
          <div class="kpi-card" id="dCardSeguridad">
            <div class="kpi-title"><span>Seguridad</span><span>🛡️</span></div>
            <div class="kpi-number" id="dKpiSecurityStatus" style="font-size: 20px;">Protegido</div>
            <div class="kpi-desc" id="dKpiRebootStatus">Sin reinicio pendiente</div>
          </div>
          <div class="kpi-card" id="dCardAlertas">
            <div class="kpi-title"><span>Alertas Activas</span><span>🚨</span></div>
            <div class="kpi-number" id="dKpiAlertsActive">0</div>
            <div class="kpi-desc" id="dKpiAlertsDetail">0 Críticas</div>
          </div>
        </div>

        <!-- Health Score Interactive Summary -->
        <div class="health-score-container">
          <div class="health-score-top">
            <div class="health-score-dial">
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Health Score General</div>
                <div style="display: flex; align-items: baseline; gap: 10px; margin-top: 4px;">
                  <span class="health-score-value" id="hsScoreDisplay">--</span>
                  <span style="font-size: 16px; color: var(--text-muted);">/ 100</span>
                  <span class="health-score-pill status-online" id="hsStatusPill">OPTIMO</span>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <button class="btn btn-secondary btn-sm" onclick="togglePenaltiesDetails()" id="btnTogglePenalties">
                🔍 Ver Auditoría de Penalizaciones (<span id="hsPenaltiesCount">0</span>)
              </button>
            </div>
          </div>

          <!-- 6 Dimensions Breakdown -->
          <div class="health-categories-grid" id="hsCategoriesGrid">
            <!-- Categories injected dynamically -->
          </div>

          <!-- Collapsible Penalties List -->
          <div id="hsPenaltiesPanel" style="display: none; border-top: 1px solid var(--border-subtle); padding-top: 14px;">
            <div style="font-size: 12px; font-weight: 700; color: #fff; margin-bottom: 8px;">
              Auditoría Detallada de Deducciones:
            </div>
            <div id="hsPenaltiesList" style="display: flex; flex-direction: column; gap: 8px;">
              <!-- Injected dynamically -->
            </div>
          </div>
        </div>

      </div>

      <!-- SUBTAB 2: RENDIMIENTO (Metrics Chart & Live Gauges) -->
      <div id="dViewRendimiento" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>📈 Telemetría de Rendimiento Reciente</span></div>
            <span style="font-size: 11px; color: var(--text-muted);">Muestras de CPU y Memoria RAM</span>
          </div>
          <div class="section-body">
            <div id="metricsChartContainer" style="width: 100%; overflow-x: auto; min-height: 200px;">
              <!-- SVG chart rendered dynamically -->
            </div>
          </div>
        </div>
      </div>

      <!-- SUBTAB 3: HARDWARE & SO -->
      <div id="dViewHardware" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>⚙️ Especificaciones de Hardware y Sistema Operativo</span></div>
          </div>
          <div class="section-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;" id="dHardwareGrid">
            <!-- Hardware properties dynamically rendered -->
          </div>
        </div>
      </div>

      <!-- SUBTAB 4: DISCOS & SMART -->
      <div id="dViewDiscos" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>💾 Unidades Lógicas y Diagnóstico Físico SMART</span></div>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 12px;" id="dVolumesList">
            <!-- Volumes dynamically rendered -->
          </div>
        </div>
      </div>

      <!-- SUBTAB 5: RED & INTERFACES -->
      <div id="dViewRed" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>🌐 Adaptadores de Red e Interfaces Físicas / Virtuales</span></div>
          </div>
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Interfaz</th>
                  <th>Dirección IPv4</th>
                  <th>Máscara / Subnet</th>
                  <th>Dirección MAC</th>
                  <th>DHCP</th>
                  <th>Puerta de Enlace (Gateway)</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody id="dNetworkTableBody">
                <!-- Dynamically rendered -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 6: SEGURIDAD & ESTADO DE PROTECCIÓN -->
      <div id="dViewSeguridad" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>🛡️ Estado de Seguridad y Políticas de Protección</span></div>
          </div>
          <div class="section-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;" id="dSecurityGrid">
            <!-- Security cards dynamically rendered -->
          </div>
        </div>
      </div>

      <!-- SUBTAB 7: SOFTWARE INSTALADO -->
      <div id="dViewSoftware" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>📦 Inventario de Software Instalado</span></div>
            <div class="input-search-wrapper">
              <span class="input-search-icon">🔍</span>
              <input type="text" id="softwareSearchInput" class="input-search" placeholder="Filtrar software..." oninput="filterSoftwareTable(this.value)">
            </div>
          </div>
          <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Aplicación / Paquete</th>
                  <th>Versión</th>
                  <th>Fabricante</th>
                  <th>Fecha de Instalación</th>
                </tr>
              </thead>
              <tbody id="dSoftwareTableBody">
                <!-- Dynamically rendered -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 8: EVENTOS DEL SISTEMA -->
      <div id="dViewEventos" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>📜 Registro de Eventos NT / Windows</span></div>
          </div>
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Nivel</th>
                  <th>Origen / Proveedor</th>
                  <th>Event ID</th>
                  <th>Timestamp</th>
                  <th>Mensaje del Evento</th>
                </tr>
              </thead>
              <tbody id="dEventsTableBody">
                <!-- Dynamically rendered -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 9: ALERTAS DE ESTE EQUIPO -->
      <div id="dViewAlertas" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>🚨 Historial de Alertas de este Equipo</span></div>
          </div>
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Severidad</th>
                  <th>Alerta</th>
                  <th>Ocurrencias</th>
                  <th>Primera Vez</th>
                  <th>Última Vez</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acción</th>
                </tr>
              </thead>
              <tbody id="dAlertsTableBody">
                <!-- Dynamically rendered -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 10: AGENTE & REASIGNACIÓN -->
      <div id="dViewAgente" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>⚡ Control y Diagnóstico del Agente</span></div>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;" id="dAgentMetaGrid">
              <!-- Agent properties dynamically rendered -->
            </div>

            <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px; display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 13px; font-weight: 700; color: #fff;">Reasignar a otra Organización / Cliente:</div>
              <div style="display: flex; align-items: center; gap: 10px; max-width: 500px;">
                <select id="moveCustomerSelect" class="filter-select" style="flex: 1;">
                  <!-- Options injected dynamically -->
                </select>
                <button class="btn btn-primary btn-sm" onclick="handleMoveDevice()">
                  Reasignar
                </button>
              </div>
            </div>

            <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px;">
              <button class="btn btn-secondary btn-sm" onclick="copyDeviceDiagnostic()">
                📋 Copiar Reporte Diagnóstico Completo (JSON)
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}
