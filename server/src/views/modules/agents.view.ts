export function getAgentsViewHtml(): string {
  return `
    <div id="viewAgents" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header with Tabs: Inventario vs Enrolamiento -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Gestión de Sondas & Agentes RMM</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Monitoreo de versiones instaladas, conectividad de telemetría y despliegue asistido.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-secondary btn-sm" id="btnTabAgentsList" onclick="switchAgentsTab('list')">
            📋 Agentes Enrolados
          </button>
          <button class="btn btn-primary btn-sm" id="btnTabAgentsEnroll" onclick="switchAgentsTab('enroll')">
            ⚡ Enrolar Nuevo Agente
          </button>
        </div>
      </div>

      <!-- TAB 1: AGENTES ENROLADOS -->
      <div id="agentsListView" style="display: flex; flex-direction: column; gap: 16px;">
        
        <div class="filter-bar">
          <div class="filter-group">
            <div class="input-search-wrapper">
              <span class="input-search-icon">🔍</span>
              <input type="text" id="agentsSearchInput" class="input-search" placeholder="Buscar agente o equipo..." oninput="filterAgentsTable(this.value)">
            </div>
            <select id="agentsFilterCustomer" class="filter-select" onchange="filterAgentsByCustomer(this.value)">
              <option value="ALL">Todos los Clientes</option>
            </select>
          </div>
          <div>
            <span class="code-badge" id="agentsTotalBadge">0 Agentes Activos</span>
          </div>
        </div>

        <div class="section-card">
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Cliente</th>
                  <th>Sede</th>
                  <th>Versión Instalada</th>
                  <th>Estado del Agente</th>
                  <th>Última Comunicación (Heartbeat)</th>
                  <th style="text-align: right;">Acción</th>
                </tr>
              </thead>
              <tbody id="agentsTableBody">
                <!-- Injected dynamically -->
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: ENROLAMIENTO ASISTIDO (WIZARD 3 PASOS) -->
      <div id="agentsEnrollView" style="display: none; justify-content: center;">
        
        <div class="wizard-card" style="width: 100%;">
          <div style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 14px;">
            <h3 style="font-size: 16px; font-weight: 700; color: #fff;">⚡ Asistente de Enrolamiento de Agentes</h3>
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Configurá la organización de destino para generar los comandos de instalación listos para usar.
            </p>
          </div>

          <!-- 3 Steps Bar -->
          <div class="wizard-steps">
            <div class="wizard-step active" id="wStepIndicator1">
              <div class="wizard-step-circle">1</div>
              <span>Seleccionar Cliente</span>
            </div>
            <div style="flex: 1; height: 1px; background: var(--border-subtle); margin: 0 12px;"></div>
            <div class="wizard-step" id="wStepIndicator2">
              <div class="wizard-step-circle">2</div>
              <span>Seleccionar Sede</span>
            </div>
            <div style="flex: 1; height: 1px; background: var(--border-subtle); margin: 0 12px;"></div>
            <div class="wizard-step" id="wStepIndicator3">
              <div class="wizard-step-circle">3</div>
              <span>Método de Instalación</span>
            </div>
          </div>

          <!-- Step 1 Content: Select Customer -->
          <div id="wStep1Content" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="form-group">
              <label class="form-label">¿Para qué cliente vas a enrolar el equipo?</label>
              <select id="wCustSelect" class="form-select" onchange="handleWizardCustomerChange()">
                <option value="">-- Elegir Cliente --</option>
              </select>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <button class="btn btn-primary" id="btnWStep1Next" onclick="goToWizardStep(2)" disabled>
                Continuar a Sede →
              </button>
            </div>
          </div>

          <!-- Step 2 Content: Select Site -->
          <div id="wStep2Content" style="display: none; flex-direction: column; gap: 16px;">
            <div class="form-group">
              <label class="form-label">Seleccionar Sede del Cliente</label>
              <select id="wSiteSelect" class="form-select" onchange="handleWizardSiteChange()">
                <!-- Populated dynamically -->
              </select>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <button class="btn btn-secondary" onclick="goToWizardStep(1)">
                ← Volver a Cliente
              </button>
              <button class="btn btn-primary" onclick="goToWizardStep(3)">
                Continuar a Método →
              </button>
            </div>
          </div>

          <!-- Step 3 Content: Installation Methods -->
          <div id="wStep3Content" style="display: none; flex-direction: column; gap: 20px;">
            
            <!-- Summary Banner -->
            <div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: var(--radius-md); padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
              <div style="font-size: 13px;">
                Asignación de Enrolamiento: <strong id="wSummaryCust" style="color: #60a5fa;">Cliente</strong> • <strong id="wSummarySite" style="color: #fff;">Sede</strong>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="goToWizardStep(1)">Cambiar</button>
            </div>

            <!-- Method 1: PowerShell (Recommended) -->
            <div class="section-card" style="border-color: var(--primary);">
              <div class="section-header" style="background: rgba(37, 99, 235, 0.05);">
                <div class="section-title">
                  <span>⚡ Opción 1: Comando One-Liner de PowerShell (Recomendada)</span>
                  <span class="status-pill status-online">Automático</span>
                </div>
              </div>
              <div class="section-body" style="display: flex; flex-direction: column; gap: 12px;">
                <p style="font-size: 12px; color: var(--text-secondary);">
                  Abrí PowerShell como Administrador en el equipo de destino y pegá este comando:
                </p>
                <div style="background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                  <code class="code-font" style="color: #60a5fa; font-size: 12px; word-break: break-all;" id="wPs1Command">
                    irm https://monitor.nanolabs.com.ar/install.ps1 | iex
                  </code>
                  <button class="btn btn-primary btn-sm" onclick="copyWizardCmd()">
                    📋 Copiar
                  </button>
                </div>
              </div>
            </div>

            <!-- Method 2: Installer .EXE -->
            <div class="section-card">
              <div class="section-header">
                <div class="section-title">
                  <span>⬇️ Opción 2: Instalador Gráfico Windows (.exe)</span>
                </div>
              </div>
              <div class="section-body" style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: #fff;">NanoMonitor-Setup.exe</div>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    Instalador tradicional que solicita el token al iniciar.
                  </div>
                </div>
                <a href="/downloads/NanoMonitor-Setup.exe" class="btn btn-secondary btn-sm" download>
                  Descargar Setup.exe
                </a>
              </div>
            </div>

            <!-- Method 3: Standalone Script -->
            <div class="section-card">
              <div class="section-header">
                <div class="section-title">
                  <span>📜 Opción 3: Script Standalone (install.ps1 para GPO / RMM)</span>
                </div>
              </div>
              <div class="section-body" style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: #fff;">install.ps1</div>
                  <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                    Script descargable para despliegue automatizado por Active Directory GPO.
                  </div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="copyCustomerPs1FromCard(currentWizardCustomerId)">
                  📋 Copiar Script Completo
                </button>
              </div>
            </div>

            <div style="display: flex; justify-content: flex-start; margin-top: 10px;">
              <button class="btn btn-secondary" onclick="goToWizardStep(2)">
                ← Volver a Sede
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>
  `;
}
