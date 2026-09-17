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
          <button class="subnav-tab-btn" id="dTabAcciones" onclick="switchDeviceSubTab('acciones')">
            🚀 Acciones Remotas (<span id="dCountAcciones">0</span>)
          </button>
          <button class="subnav-tab-btn" id="dTabParches" onclick="switchDeviceSubTab('parches')">
            🛡️ Parches (<span id="dCountParches">0</span>)
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
      <div id="dViewHardware" style="display: none; flex-direction: column; gap: 16px;">
        <!-- Subnavigation Buttons -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
          <div style="display: flex; gap: 8px;">
            <button id="dBtnHwSpecs" class="filter-pill active" onclick="switchDeviceHwTab('specs')" style="padding: 6px 14px; font-weight: 700;">
              💻 Componentes & Especificaciones
            </button>
            <button id="dBtnHwChanges" class="filter-pill" onclick="switchDeviceHwTab('changes')" style="padding: 6px 14px; font-weight: 700;">
              🔧 Registro de Cambios Físicos (<span id="dCountHwChanges">0</span>)
            </button>
          </div>
          <span style="font-size: 11px; color: var(--text-muted);">Auditoría de integridad de hardware</span>
        </div>

        <!-- Section 1: Hardware Specs Grid -->
        <div id="dContainerHwSpecs" class="section-card">
          <div class="section-header">
            <div class="section-title"><span>⚙️ Especificaciones de Hardware y Sistema Operativo</span></div>
          </div>
          <div class="section-body" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;" id="dHardwareGrid">
            <!-- Hardware properties dynamically rendered -->
          </div>
        </div>

        <!-- Section 2: Hardware Changes Audit Log Table -->
        <div id="dContainerHwChanges" class="section-card" style="display: none;">
          <div class="section-header">
            <div class="section-title"><span>🔧 Historial de Modificaciones Físicas (RAM, CPU, Discos, Red, SO)</span></div>
          </div>
          <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
            <table class="noc-table">
              <thead>
                <tr>
                  <th style="width: 140px;">Fecha / Hora</th>
                  <th>Componente</th>
                  <th style="width: 130px;">Tipo de Cambio</th>
                  <th>Componente / Recurso</th>
                  <th>Valor Anterior</th>
                  <th>Valor Nuevo</th>
                </tr>
              </thead>
              <tbody id="dHwChangesTableBody">
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No se registran cambios de hardware.</td></tr>
              </tbody>
            </table>
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

      <!-- SUBTAB 7: SOFTWARE INSTALADO & CAMBIOS -->
      <div id="dViewSoftware" style="display: none; flex-direction: column; gap: 16px;">
        <!-- Subnavigation & Search Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
          <div style="display: flex; gap: 8px;">
            <button id="dBtnSwInstalled" class="filter-pill active" onclick="switchDeviceSwTab('installed')" style="padding: 6px 14px; font-weight: 700;">
              📦 Software Instalado (<span id="dCountSoftwareInstalled">0</span>)
            </button>
            <button id="dBtnSwChanges" class="filter-pill" onclick="switchDeviceSwTab('changes')" style="padding: 6px 14px; font-weight: 700;">
              📜 Registro de Cambios Delta (<span id="dCountSoftwareChanges">0</span>)
            </button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="input-search-wrapper" id="swSearchWrapper">
              <span class="input-search-icon">🔍</span>
              <input type="text" id="softwareSearchInput" class="input-search" placeholder="Filtrar software..." oninput="filterSoftwareTable(this.value)">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="exportCurrentDeviceSoftwareCsv()" title="Descargar inventario en CSV">
              📥 Exportar CSV
            </button>
          </div>
        </div>

        <!-- Container 1: Currently Installed Software Table -->
        <div id="dContainerSwInstalled" class="section-card">
          <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Aplicación / Paquete</th>
                  <th>Versión</th>
                  <th>Fabricante</th>
                  <th>Fecha de Instalación</th>
                  <th style="width: 100px; text-align: center;">Arquitectura</th>
                </tr>
              </thead>
              <tbody id="dSoftwareTableBody">
                <!-- Dynamically rendered -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Container 2: Software Delta Changes Log Table -->
        <div id="dContainerSwChanges" class="section-card" style="display: none;">
          <div class="table-responsive" style="max-height: 480px; overflow-y: auto;">
            <table class="noc-table">
              <thead>
                <tr>
                  <th style="width: 140px;">Fecha / Detección</th>
                  <th style="width: 130px;">Acción</th>
                  <th>Aplicación</th>
                  <th>Versión Previa</th>
                  <th>Versión Nueva</th>
                  <th>Fabricante</th>
                </tr>
              </thead>
              <tbody id="dSoftwareChangesTableBody">
                <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">No se registran cambios de software en este equipo.</td></tr>
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

        <!-- Tamper Protection & Service Watchdog Card -->
        <div class="section-card" style="border: 1px solid rgba(239, 68, 68, 0.3); background: linear-gradient(180deg, rgba(239, 68, 68, 0.05) 0%, rgba(15, 23, 42, 0.5) 100%);">
          <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="section-title">
              <span style="color: #f87171; display: flex; align-items: center; gap: 8px;">
                🛡️ Protección contra Manipulación (Tamper Protection)
              </span>
            </div>
            <span class="status-pill" id="dTamperProtectionBadge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">
              ● PROTEGIDO
            </span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
              Impide que usuarios con privilegios de Administrador local o malware desinstalen el servicio de Windows o cierren el agente en la bandeja del sistema sin autorización previa del portal NOC. El servicio de Windows cuenta además con política de auto-reinicio inmediato ante terminación forzada (<code style="color: #38bdf8;">sc failure</code>).
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; background: var(--bg-surface-subtle); padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              <div>
                <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Clave de Desbloqueo / Desinstalación</div>
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                  <span style="font-family: monospace; font-size: 16px; font-weight: 800; color: #38bdf8; letter-spacing: 1px;" id="dTamperKeyDisplay">
                    ••••-••••-••••
                  </span>
                  <span id="dTamperKeyUpdatedText" style="font-size: 11px; color: var(--text-muted);"></span>
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" id="btnRevealTamperKey" onclick="toggleDeviceTamperKey()" title="Mostrar u ocultar clave de desbloqueo">
                  👁️ Revelar Clave
                </button>
                <button class="btn btn-secondary btn-sm" onclick="copyDeviceTamperKey()" title="Copiar clave al portapapeles">
                  📋 Copiar
                </button>
                <button class="btn btn-secondary btn-sm" style="color: #f87171;" onclick="confirmRegenerateTamperKey()" title="Generar una nueva clave de protección invalidando la anterior">
                  🔄 Regenerar Clave
                </button>
              </div>
            </div>
            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4; background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.2); padding: 10px 14px; border-radius: var(--radius-sm);">
              💡 <strong>Instrucciones para Técnicos:</strong> Para desinstalar en la PC del cliente, ejecute en PowerShell como Administrador:<br/>
              <code style="color: #93c5fd; font-family: monospace;">NanoMonitor-Setup.exe -uninstall -key="&lt;CLAVE&gt;"</code> o ejecute el desinstalador con doble clic e ingrese la clave cuando Windows la solicite.
            </div>
          </div>
        </div>
      </div>

      <!-- SUBTAB 11: ACCIONES REMOTAS -->
      <div id="dViewAcciones" style="display: none; flex-direction: column; gap: 20px;">
        
        <!-- Action Launchpad Grid -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>🚀 Catálogo de Acciones Remotas Controladas</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary);">
              Canal 100% saliente HMAC • Sin apertura de puertos • Whitelist estricta
            </div>
          </div>

          <div class="section-body" style="display: flex; flex-direction: column; gap: 20px;">
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
              
              <!-- Category 1: Sistema -->
              <div style="background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; font-size: 14px; color: #ef4444; display: flex; align-items: center; gap: 8px;">
                    ⚠️ Control de Sistema
                  </span>
                  <span style="font-size: 10px; background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 2px 6px; border-radius: 4px; font-weight: 700;">CONFIRMACIÓN REQUERIDA</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">Acciones críticas sobre el ciclo de vida del endpoint. Notifican al usuario 10s antes.</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto;">
                  <button class="btn btn-sm" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5;" onclick="confirmAndTriggerAction('REBOOT_DEVICE', 'Reiniciar Dispositivo', true)">
                    🔄 Reiniciar Dispositivo
                  </button>
                  <button class="btn btn-sm" style="background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fff;" onclick="confirmAndTriggerAction('SHUTDOWN_DEVICE', 'Apagar Dispositivo', true)">
                    🛑 Apagar Dispositivo
                  </button>
                </div>
              </div>

              <!-- Category 2: Telemetría NanoMonitor -->
              <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; font-size: 14px; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                    ⚡ Telemetría NanoMonitor
                  </span>
                  <span style="font-size: 10px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 700;">SEGURO</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">Dispara recolección inmediata en el agente y actualización en vivo sin esperar cadencia.</div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 6px; margin-top: auto;">
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FORCE_HEARTBEAT')">
                    💓 Heartbeat
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FORCE_METRICS')">
                    📈 Métricas
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FORCE_SECURITY_SCAN')">
                    🛡️ Seguridad
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FORCE_INVENTORY')">
                    📦 Inventario
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FORCE_SMART_CHECK')">
                    💾 SMART
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FORCE_WINDOWS_UPDATE')">
                    🪟 Windows Update
                  </button>
                </div>
              </div>

              <!-- Category 3: Windows Defender -->
              <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; font-size: 14px; color: #4ade80; display: flex; align-items: center; gap: 8px;">
                    🛡️ Windows Defender
                  </span>
                  <span style="font-size: 10px; background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 2px 6px; border-radius: 4px; font-weight: 700;">SEGURIDAD</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">Operaciones directas sobre el motor antivirus de Windows Defender.</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto;">
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('DEFENDER_UPDATE_SIGNATURES')">
                    📥 Actualizar Firmas
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('DEFENDER_QUICK_SCAN')">
                    ⚡ Quick Scan
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('DEFENDER_FULL_SCAN')">
                    🔍 Full Scan
                  </button>
                </div>
              </div>

              <!-- Category 4: Red & Conectividad -->
              <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; font-size: 14px; color: #a78bfa; display: flex; align-items: center; gap: 8px;">
                    🌐 Red & Conectividad
                  </span>
                  <span style="font-size: 10px; background: rgba(167, 139, 250, 0.15); color: #a78bfa; padding: 2px 6px; border-radius: 4px; font-weight: 700;">RED</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">Resolución de problemas de red y renegociación de adaptadores locales.</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto;">
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('FLUSH_DNS')">
                    🧹 Flush DNS
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('RENEW_DHCP')">
                    🔄 Renew DHCP
                  </button>
                </div>
              </div>

              <!-- Category 5: Integridad Windows -->
              <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; font-size: 14px; color: #f59e0b; display: flex; align-items: center; gap: 8px;">
                    ⚙️ Integridad de Windows
                  </span>
                  <span style="font-size: 10px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 700;">DIAGNÓSTICO</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">Verificación no destructiva del estado de archivos del sistema e imagen de Windows.</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto;">
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('WINDOWS_SFC_SCAN')">
                    📜 SFC /scannow
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('WINDOWS_DISM_CHECK')">
                    🩺 DISM CheckHealth
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="triggerAction('WINDOWS_CHKDSK_SCAN')">
                    🔍 CHKDSK Diagnóstico
                  </button>
                </div>
              </div>

              <!-- Category 6: Servicios de Windows -->
              <div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; font-size: 14px; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                    🔧 Servicios de Windows
                  </span>
                  <span style="font-size: 10px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 700;">WHITELIST</span>
                </div>
                <div style="font-size: 12px; color: var(--text-secondary);">Consulta y reinicio seguro de servicios críticos autorizados.</div>
                <div style="display: flex; gap: 8px; flex-direction: column; margin-top: auto;">
                  <div style="display: flex; gap: 8px;">
                    <select id="actionServiceSelect" class="filter-select" style="flex: 1; font-size: 12px;">
                      <option value="Spooler">Spooler (Cola de Impresión)</option>
                      <option value="wuauserv">wuauserv (Windows Update)</option>
                      <option value="LanmanWorkstation">LanmanWorkstation (Estación de trabajo)</option>
                      <option value="LanmanServer">LanmanServer (Servidor de archivos)</option>
                      <option value="Dnscache">Dnscache (Cliente DNS)</option>
                      <option value="Dhcp">Dhcp (Cliente DHCP)</option>
                      <option value="W32Time">W32Time (Hora de Windows)</option>
                      <option value="Winmgmt">Winmgmt (WMI / Gestión)</option>
                      <option value="TermService">TermService (Escritorio Remoto)</option>
                      <option value="EventLog">EventLog (Registro de Eventos)</option>
                      <option value="NanoLabsAgent">NanoLabsAgent (Servicio Agente)</option>
                    </select>
                    <button class="btn btn-primary btn-sm" onclick="triggerRestartSelectedService()">
                      🔄 Reiniciar
                    </button>
                  </div>
                  <div>
                    <button class="btn btn-secondary btn-sm" style="width: 100%;" onclick="triggerAction('QUERY_SERVICES')">
                      📋 Consultar Estado de Servicios Autorizados
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- Action Execution History Table -->
        <div class="section-card">
          <div class="section-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="section-title">
              <span>📜 Historial y Estado de Acciones en Tiempo Real</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span id="actionLivePulse" style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #4ade80;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite;"></span> En vivo
              </span>
              <button class="btn btn-secondary btn-sm" onclick="loadCurrentDeviceActions()">
                🔄 Actualizar
              </button>
            </div>
          </div>

          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Acción</th>
                  <th>Estado</th>
                  <th>Solicitado Por</th>
                  <th>Solicitado</th>
                  <th>Finalizado / Duración</th>
                  <th>Código</th>
                  <th style="text-align: right;">Operaciones</th>
                </tr>
              </thead>
              <tbody id="dActionsTableBody">
                <tr>
                  <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    Cargando historial de acciones...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- SUBTAB 12: PARCHES & WINDOWS UPDATE -->
      <div id="dViewParches" style="display: none; flex-direction: column; gap: 20px;">
        
        <!-- Reboot Alert Banner (if pending reboot) -->
        <div id="dPatchRebootAlertBanner" style="display: none; background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-md); padding: 14px 20px; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 24px;">🔄</span>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #fff;">Reinicio del Sistema Requerido</div>
              <div style="font-size: 12px; color: var(--text-secondary);" id="dPatchRebootReasonText">
                Se completó la instalación de actualizaciones y se requiere reiniciar el equipo para aplicar los cambios.
              </div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openScheduleRebootModalForCurrentDevice()">
            🔄 Programar Reinicio
          </button>
        </div>

        <!-- 4 KPI cards for device patches -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title"><span>Parches Pendientes</span><span>📦</span></div>
            <div class="kpi-number" id="dPatchKpiPending" style="color: var(--color-warning);">0</div>
            <div class="kpi-desc">Esperando aprobación o instalación</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title"><span>Críticos & Seguridad</span><span>🚨</span></div>
            <div class="kpi-number" id="dPatchKpiCritical" style="color: var(--color-danger);">0</div>
            <div class="kpi-desc">Prioridad máxima</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title"><span>Instalados</span><span>✅</span></div>
            <div class="kpi-number" id="dPatchKpiInstalled" style="color: var(--color-success);">0</div>
            <div class="kpi-desc">Aplicados en este equipo</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title"><span>Estado de Reinicio</span><span>🔄</span></div>
            <div class="kpi-number" id="dPatchKpiRebootState" style="font-size: 18px; line-height: 28px;">AL DÍA</div>
            <div class="kpi-desc" id="dPatchKpiRebootDesc">Sin reinicios pendientes</div>
          </div>
        </div>

        <!-- Actions Toolbar -->
        <div class="section-card">
          <div style="padding: 14px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <input type="text" id="dPatchSearchInput" class="form-input" placeholder="Filtrar por KB o título..." style="width: 220px; font-size: 13px;" oninput="filterDevicePatchesTable()" />
              <select id="dPatchFilterCategory" class="form-select" style="width: 170px; font-size: 13px;" onchange="filterDevicePatchesTable()">
                <option value="ALL">Todas las categorías</option>
                <option value="CRITICAL">Críticos</option>
                <option value="SECURITY">Seguridad</option>
                <option value="IMPORTANT">Importantes</option>
                <option value="DRIVER">Drivers</option>
              </select>
              <select id="dPatchFilterStatus" class="form-select" style="width: 170px; font-size: 13px;" onchange="filterDevicePatchesTable()">
                <option value="ALL">Todos los estados</option>
                <option value="MISSING">Pendientes de instalación</option>
                <option value="INSTALLED">Instalados</option>
                <option value="FAILED">Con error</option>
              </select>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-secondary btn-sm" onclick="triggerDevicePatchScan()" title="Ejecutar escaneo de actualizaciones en el equipo">
                🔍 Escanear Ahora
              </button>
              <button class="btn btn-secondary btn-sm" onclick="triggerDeviceInstallAutoApproved()" title="Instalar todas las actualizaciones críticas y de seguridad aprobadas">
                ⚡ Instalar Aprobados
              </button>
              <button class="btn btn-primary btn-sm" onclick="triggerDeviceInstallSelected()" id="btnInstallSelectedPatches" disabled title="Instalar parches seleccionados con checkbox">
                📦 Instalar Seleccionados (<span id="dSelectedPatchesCount">0</span>)
              </button>
            </div>
          </div>

          <div class="table-container" style="max-height: 550px; overflow-y: auto;">
            <table class="noc-table">
              <thead>
                <tr>
                  <th style="width: 38px; text-align: center;">
                    <input type="checkbox" id="chkSelectAllPatches" onchange="toggleSelectAllDevicePatches(this.checked)" />
                  </th>
                  <th>Artículo KB</th>
                  <th>Título de Actualización</th>
                  <th>Categoría</th>
                  <th>Severidad</th>
                  <th>Tamaño</th>
                  <th>Reinicio</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody id="dPatchesTableBody">
                <tr>
                  <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 32px;">
                    Cargando parches del equipo...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- Action Output Modal -->
      <div id="modalActionOutput" class="modal-backdrop" style="display: none;">
        <div class="modal-dialog" style="max-width: 750px; width: 95%;">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 18px;">📋</span>
              <h3 id="modalActionTitle" style="font-size: 16px; font-weight: 700; color: #fff;">Salida de Acción Remota</h3>
            </div>
            <button class="modal-close" onclick="closeActionOutputModal()">&times;</button>
          </div>
          <div class="modal-body" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary); background: var(--bg-surface-subtle); padding: 8px 12px; border-radius: var(--radius-sm);">
              <span>Estado: <strong id="modalActionStatus" style="color: #fff;">-</strong></span>
              <span>Exit Code: <strong id="modalActionExitCode" style="color: #fff;">-</strong></span>
              <span>Duración: <strong id="modalActionDuration" style="color: #fff;">-</strong></span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Salida de Consola (Stdout / Stderr):</span>
              <pre id="modalActionConsole" style="background: #090d16; border: 1px solid var(--border-subtle); color: #38bdf8; font-family: monospace; font-size: 12px; padding: 12px; border-radius: var(--radius-sm); max-height: 320px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; margin: 0;"></pre>
            </div>
            <div id="modalActionErrorBox" style="display: none; flex-direction: column; gap: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: #ef4444; text-transform: uppercase;">Error:</span>
              <pre id="modalActionError" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-family: monospace; font-size: 12px; padding: 12px; border-radius: var(--radius-sm); margin: 0; white-space: pre-wrap;"></pre>
            </div>
          </div>
          <div class="modal-footer" style="padding: 12px 16px; display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary btn-sm" onclick="closeActionOutputModal()">Cerrar</button>
          </div>
        </div>
      </div>

    </div>
  `;
}
