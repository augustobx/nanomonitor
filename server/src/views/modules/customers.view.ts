export function getCustomersViewHtml(): string {
  return `
    <!-- VIEW: CUSTOMERS LIST (Global Directory & Management) -->
    <div id="viewCustomers" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Gestión Integral de Clientes & Sedes</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Organizaciones corporativas, sedes distribuidas y control de telemetría multi-tenant.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="input-search-wrapper">
            <span class="input-search-icon">🔍</span>
            <input type="text" id="custDirectorySearch" class="input-search" placeholder="Buscar cliente por nombre o código..." oninput="renderCustomersTableFiltered(this.value)">
          </div>
          <button class="btn btn-primary" onclick="openCreateCustomerModal()">
            + Registrar Cliente
          </button>
        </div>
      </div>

      <!-- Customers Table Card -->
      <div class="section-card">
        <div class="table-responsive">
          <table class="noc-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Código RMM</th>
                <th>Sedes</th>
                <th>Equipos (Online / Offline)</th>
                <th>Alertas Activas</th>
                <th>Health Score</th>
                <th>Estado Operativo</th>
                <th style="text-align: right;">Acción</th>
              </tr>
            </thead>
            <tbody id="customersTableBody">
              <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">
                  Cargando directorio de clientes...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- VIEW: CUSTOMER DETAIL (Dedicated Customer Workspace) -->
    <div id="viewCustomerDetail" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Customer Workspace Header Banner -->
      <div class="section-card">
        <div style="padding: 20px 24px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="width: 48px; height: 48px; border-radius: var(--radius-lg); background: rgba(37, 99, 235, 0.15); border: 1px solid rgba(37, 99, 235, 0.3); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; color: #60a5fa;" id="cdAvatar">
              CL
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <h2 style="font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.4px;" id="cdName">Nombre del Cliente</h2>
                <span class="code-badge" id="cdCode">CODIGO</span>
                <span class="status-pill status-online" id="cdStatusPill">Operativo</span>
              </div>
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;" id="cdContactRow">
                <span>📧 <span id="cdContactEmail">it@cliente.com</span></span>
                <span>📞 <span id="cdContactPhone">+54 11 0000-0000</span></span>
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="switchNavTab('customers')">
              ← Volver a Clientes
            </button>
            <button class="btn btn-primary btn-sm" onclick="copyCurrentCustomerEnrollCmd()" title="Copiar comando PowerShell para enrolar equipos en este cliente">
              ⚡ Copiar Token Enrolamiento
            </button>
          </div>
        </div>

        <!-- Subnavigation Tabs for Customer Workspace -->
        <div class="subnav-tabs" style="padding: 0 24px; background: var(--bg-surface-subtle); border-top: 1px solid var(--border-subtle);">
          <button class="subnav-tab-btn active" id="cdTabResumen" onclick="switchCustomerSubTab('resumen')">
            📊 Resumen
          </button>
          <button class="subnav-tab-btn" id="cdTabEquipos" onclick="switchCustomerSubTab('equipos')">
            💻 Equipos (<span id="cdCountEquipos">0</span>)
          </button>
          <button class="subnav-tab-btn" id="cdTabSedes" onclick="switchCustomerSubTab('sedes')">
            📍 Sedes (<span id="cdCountSedes">0</span>)
          </button>
          <button class="subnav-tab-btn" id="cdTabAlertas" onclick="switchCustomerSubTab('alertas')">
            🚨 Alertas (<span id="cdCountAlertas">0</span>)
          </button>
          <button class="subnav-tab-btn" id="cdTabAgentes" onclick="switchCustomerSubTab('agentes')">
            ⚡ Agentes & Enrolamiento
          </button>
          <button class="subnav-tab-btn" id="cdTabConfiguracion" onclick="switchCustomerSubTab('configuracion')">
            🛠️ Reglas de Monitoreo
          </button>
        </div>
      </div>

      <!-- SUBTAB 1: RESUMEN DEL CLIENTE -->
      <div id="cdViewResumen" style="display: flex; flex-direction: column; gap: 20px;">
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title"><span>Equipos Totales</span><span>💻</span></div>
            <div class="kpi-number" id="cdKpiTotalDev">0</div>
            <div class="kpi-desc" id="cdKpiOnlineDev">0 Online • 0 Offline</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title"><span>Sedes Activas</span><span>📍</span></div>
            <div class="kpi-number" id="cdKpiTotalSites">0</div>
            <div class="kpi-desc">Ubicaciones físicas</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title"><span>Alertas Activas</span><span>🚨</span></div>
            <div class="kpi-number" id="cdKpiActiveAlerts">0</div>
            <div class="kpi-desc" id="cdKpiCritAlerts">0 Críticas</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title"><span>Health Score Promedio</span><span>🛡️</span></div>
            <div class="kpi-number" id="cdKpiAvgHealth">--</div>
            <div class="kpi-desc" id="cdKpiHealthCategory">Calificación general</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px;" class="customer-summary-grid">
          <!-- Equipos con problemas -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title"><span>⚠️ Equipos que Requieren Atención</span></div>
            </div>
            <div class="table-responsive">
              <table class="noc-table">
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Sede</th>
                    <th>Estado</th>
                    <th>Health</th>
                    <th style="text-align: right;">Acción</th>
                  </tr>
                </thead>
                <tbody id="cdTableProblemDevices">
                  <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
                      Todos los equipos de este cliente operan con normalidad.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Alertas recientes del cliente -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title"><span>🚨 Alertas Recientes</span></div>
            </div>
            <div class="section-body" style="padding: 12px; display: flex; flex-direction: column; gap: 8px;" id="cdRecentAlertsList">
              <div style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 12px;">
                No hay alertas activas para este cliente.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SUBTAB 2: EQUIPOS DEL CLIENTE -->
      <div id="cdViewEquipos" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th>Health Score</th>
                  <th>CPU / RAM</th>
                  <th>Disco</th>
                  <th>Seguridad</th>
                  <th>Último Reporte</th>
                  <th style="text-align: right;">Acción</th>
                </tr>
              </thead>
              <tbody id="cdTableDevices">
                <!-- Rendered dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 3: SEDES DEL CLIENTE -->
      <div id="cdViewSedes" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Nombre de Sede</th>
                  <th>Equipos Asignados</th>
                  <th>Online</th>
                  <th>Offline</th>
                  <th>Alertas Activas</th>
                </tr>
              </thead>
              <tbody id="cdTableSedes">
                <!-- Rendered dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 4: ALERTAS DEL CLIENTE -->
      <div id="cdViewAlertas" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Severidad</th>
                  <th>Equipo</th>
                  <th>Alerta</th>
                  <th>Ocurrencias</th>
                  <th>Última Detección</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acción</th>
                </tr>
              </thead>
              <tbody id="cdTableAlerts">
                <!-- Rendered dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 5: AGENTES Y ENROLAMIENTO -->
      <div id="cdViewAgentes" style="display: none; flex-direction: column; gap: 20px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>⚡ Enrolamiento de Agentes para este Cliente</span></div>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 16px;">
            <p style="color: var(--text-secondary); font-size: 13px;">
              Ejecutá el siguiente comando en PowerShell con privilegios de Administrador en cualquier estación de trabajo o servidor Windows de este cliente. El agente se conectará automáticamente y reportará telemetría en tiempo real:
            </p>

            <div style="background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <code class="code-font" style="color: #60a5fa; font-size: 12px; word-break: break-all;" id="cdEnrollCmdSnippet">
                irm https://monitor.nanolabs.com.ar/install.ps1 | iex
              </code>
              <button class="btn btn-primary btn-sm" onclick="copyCurrentCustomerEnrollCmd()">
                📋 Copiar Comando
              </button>
            </div>

            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px;">
              <a href="/downloads/NanoMonitor-Setup.exe" class="btn btn-secondary btn-sm" download>
                ⬇️ Descargar Instalador Gráfico (.exe)
              </a>
              <button class="btn btn-ghost btn-sm" onclick="togglePs1ScriptPreview()">
                👁️ Ver Código del Script install.ps1
              </button>
            </div>

            <div id="wsPs1PreviewBox" style="display: none; width: 100%; margin-top: 10px; background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px;">
              <pre class="code-font" style="font-size: 11px; color: var(--text-secondary); max-height: 250px; overflow-y: auto; white-space: pre-wrap;">
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ApiUrl = "https://monitor.nanolabs.com.ar"
$Token = "..."
# Descarga e instala NanoMonitor como Servicio de Windows (LocalSystem)
              </pre>
            </div>
          </div>
        </div>
      </div>

      <!-- SUBTAB 6: CONFIGURACIÓN DE REGLAS ESPECÍFICAS -->
      <div id="cdViewConfiguracion" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>🛠️ Reglas y Umbrales Personalizados para este Cliente</span></div>
            <span style="font-size: 12px; color: var(--text-muted);">Hereda por defecto las reglas generales de la flota</span>
          </div>
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Regla de Monitoreo</th>
                  <th>Categoría</th>
                  <th>Severidad</th>
                  <th>Condición / Umbral</th>
                  <th>Cooldown</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acción</th>
                </tr>
              </thead>
              <tbody id="cdTableRules">
                <!-- Rendered dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;
}
