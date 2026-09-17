export function getPatchesViewHtml(): string {
  return `
    <div id="viewPatches" class="view-panel" style="display: none; flex-direction: column; gap: 24px;">
      
      <!-- Top Title & Action Bar -->
      <div class="section-card">
        <div style="padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: var(--radius-md); background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                🛡️
              </div>
              <h1 style="font-size: 22px; font-weight: 800; color: #fff; margin: 0; letter-spacing: -0.4px;">
                Gestión de Parches & Windows Update
              </h1>
            </div>
            <p style="margin: 4px 0 0 46px; font-size: 13px; color: var(--text-secondary);">
              Auditoría de parches faltantes, políticas de aprobación automática, ventanas de mantenimiento y control de reinicios en toda la flota.
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="loadPatchesCompliance(true)" title="Refrescar datos de cumplimiento">
              🔄 Refrescar
            </button>
            <button class="btn btn-secondary btn-sm" onclick="triggerGlobalFleetPatchScan()" title="Encolar escaneo de Windows Update en todos los equipos online">
              🔍 Escanear Flota
            </button>
            <button class="btn btn-primary btn-sm" onclick="openPatchPolicyModal()" title="Crear o editar política de parcheo">
              ⚙️ Configurar Política
            </button>
          </div>
        </div>

        <!-- Secondary Subnav for Patches -->
        <div class="subnav-tabs" style="padding: 0 24px; background: var(--bg-surface-subtle); border-top: 1px solid var(--border-subtle);">
          <button class="subnav-tab-btn active" id="pTabFlota" onclick="switchPatchesSubTab('flota')">
            💻 Flota de Parches (<span id="pCountDevices">0</span>)
          </button>
          <button class="subnav-tab-btn" id="pTabPoliticas" onclick="switchPatchesSubTab('politicas')">
            📋 Políticas de Parcheo (<span id="pCountPolicies">0</span>)
          </button>
          <button class="subnav-tab-btn" id="pTabHistorial" onclick="switchPatchesSubTab('historial')">
            📜 Historial de Instalación
          </button>
        </div>
      </div>

      <!-- KPI Fleet Compliance Grid -->
      <div class="kpi-grid">
        <div class="kpi-card" id="cardPatchCompliance">
          <div class="kpi-title"><span>Cumplimiento Flota</span><span>🎯</span></div>
          <div class="kpi-number" id="kpiPatchCompliancePct" style="color: var(--color-success);">100%</div>
          <div class="kpi-desc" id="kpiPatchComplianceDesc">Dispositivos protegidos y al día</div>
        </div>

        <div class="kpi-card" id="cardPatchUpToDate">
          <div class="kpi-title"><span>Equipos al Día</span><span>✅</span></div>
          <div class="kpi-number" id="kpiPatchDevicesUpToDate">0 / 0</div>
          <div class="kpi-desc">Sin parches faltantes pendientes</div>
        </div>

        <div class="kpi-card" id="cardPatchPending">
          <div class="kpi-title"><span>Parches Faltantes</span><span>📦</span></div>
          <div class="kpi-number" id="kpiPatchTotalMissing" style="color: var(--color-warning);">0</div>
          <div class="kpi-desc">Parches acumulados en la flota</div>
        </div>

        <div class="kpi-card" id="cardPatchCritical">
          <div class="kpi-title"><span>Críticos & Seguridad</span><span>🚨</span></div>
          <div class="kpi-number" id="kpiPatchTotalCritical" style="color: var(--color-danger);">0</div>
          <div class="kpi-desc">Requieren atención técnica prioritaria</div>
        </div>

        <div class="kpi-card" id="cardPatchReboot">
          <div class="kpi-title"><span>Reinicio Requerido</span><span>🔄</span></div>
          <div class="kpi-number" id="kpiPatchRebootPending" style="color: #60a5fa;">0</div>
          <div class="kpi-desc">Equipos esperando reinicio controlado</div>
        </div>
      </div>

      <!-- SUBTAB 1: FLOTA DE PARCHES -->
      <div id="pViewFlota" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-weight: 700; color: #fff; font-size: 15px;">Estado de Parcheo por Equipo</span>
              <span class="badge badge-info" id="pBadgeFleetFilter">Todos</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="text" id="pSearchFleetInput" class="form-input" placeholder="Buscar equipo, cliente, IP..." style="width: 240px; font-size: 13px;" oninput="filterPatchesFleetTable()" />
              <select id="pFilterComplianceSelect" class="form-select" style="width: 170px; font-size: 13px;" onchange="filterPatchesFleetTable()">
                <option value="ALL">Todos los estados</option>
                <option value="NEEDS_PATCHES">Con parches pendientes</option>
                <option value="CRITICAL">Con críticos / seguridad</option>
                <option value="REBOOT_REQUIRED">Reinicio requerido</option>
                <option value="UP_TO_DATE">Al día</option>
              </select>
            </div>
          </div>

          <div class="table-responsive" style="max-height: 600px; overflow-y: auto; width: 100%;">
            <table class="noc-table patch-fleet-table" style="width: 100% !important; table-layout: fixed; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="width: 22%; min-width: 210px; padding: 12px 16px;">Equipo / Hostname</th>
                  <th style="width: 15%; min-width: 140px; padding: 12px 16px;">Cliente & Sede</th>
                  <th style="width: 11%; min-width: 110px; padding: 12px 16px;">Estado Agente</th>
                  <th style="width: 12%; min-width: 120px; padding: 12px 16px;">Parches Faltantes</th>
                  <th style="width: 11%; min-width: 110px; padding: 12px 16px;">Críticos / Seg.</th>
                  <th style="width: 10%; min-width: 100px; padding: 12px 16px;">Reinicio</th>
                  <th style="width: 10%; min-width: 110px; padding: 12px 16px;">Último Escaneo</th>
                  <th style="width: 9%; min-width: 180px; padding: 12px 16px; text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody id="pFleetTableBody">
                <tr>
                  <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-secondary);">
                    Cargando estado de parches de la flota...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUBTAB 2: POLÍTICAS DE PARCHEO -->
      <div id="pViewPoliticas" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: #fff; margin: 0;">Políticas de Aprobación y Ventanas de Mantenimiento</h3>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 3px 0 0 0;">
                Define cómo el motor RMM aprueba e instala parches automáticamente y cuándo puede reiniciar equipos sin interrumpir al usuario.
              </p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openPatchPolicyModal()">
              + Nueva Política por Cliente
            </button>
          </div>

          <div style="padding: 20px;" id="pPoliciesContainer">
            <div style="text-align: center; color: var(--text-secondary); padding: 24px;">
              Cargando políticas configuradas...
            </div>
          </div>
        </div>
      </div>

      <!-- SUBTAB 3: HISTORIAL DE INSTALACIÓN -->
      <div id="pViewHistorial" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <h3 style="font-size: 15px; font-weight: 700; color: #fff; margin: 0;">Registro Histórico de Instalaciones</h3>
              <p style="font-size: 12px; color: var(--text-secondary); margin: 3px 0 0 0;">
                Auditoría detallada de actualizaciones aplicadas por la plataforma o técnicos de soporte.
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="loadPatchHistory()">
              🔄 Actualizar Log
            </button>
          </div>

          <div class="table-container" style="max-height: 600px; overflow-y: auto;">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Fecha & Hora</th>
                  <th>Equipo</th>
                  <th>Artículo KB</th>
                  <th>Título de Actualización</th>
                  <th>Resultado</th>
                  <th>Reinicio</th>
                  <th>Iniciado Por</th>
                  <th>Detalle / Código</th>
                </tr>
              </thead>
              <tbody id="pHistoryTableBody">
                <tr>
                  <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-secondary);">
                    Cargando historial de parches...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>

    <!-- MODAL: Configurar Política de Parches -->
    <div id="patchPolicyModal" class="modal-backdrop">
      <div class="modal-card" style="max-width: 680px; width: 95%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">🛡️</span>
            <h3 class="modal-title" id="patchPolicyModalTitle">Configurar Política de Parcheo</h3>
          </div>
          <button class="modal-close-btn" onclick="closePatchPolicyModal()">&times;</button>
        </div>

        <form id="patchPolicyForm" onsubmit="savePatchPolicy(event)">
          <div class="modal-body" style="display: flex; flex-direction: column; gap: 18px;">
            
            <div class="form-group">
              <label class="form-label" for="policyCustomerSelect">Alcance de la Política</label>
              <select id="policyCustomerSelect" class="form-select">
                <option value="">🌐 Política Global Predeterminada (Toda la Empresa)</option>
                <!-- Opciones dinámicas de clientes -->
              </select>
              <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">
                Las políticas por cliente tienen precedencia sobre la política global predeterminada.
              </small>
            </div>

            <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px;">
              <h4 style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 12px;">Reglas de Aprobación por Categoría</h4>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label class="form-label" for="ruleCritical">Actualizaciones Críticas</label>
                  <select id="ruleCritical" class="form-select">
                    <option value="AUTO_APPROVE">🟢 Aprobación Automática (Recomendado)</option>
                    <option value="MANUAL_APPROVE">🟡 Aprobación Manual</option>
                    <option value="IGNORE">⚪ Ignorar</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="ruleSecurity">Actualizaciones de Seguridad</label>
                  <select id="ruleSecurity" class="form-select">
                    <option value="AUTO_APPROVE">🟢 Aprobación Automática (Recomendado)</option>
                    <option value="MANUAL_APPROVE">🟡 Aprobación Manual</option>
                    <option value="IGNORE">⚪ Ignorar</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="ruleImportant">Actualizaciones Importantes</label>
                  <select id="ruleImportant" class="form-select">
                    <option value="AUTO_APPROVE">🟢 Aprobación Automática</option>
                    <option value="MANUAL_APPROVE" selected>🟡 Aprobación Manual (Recomendado)</option>
                    <option value="IGNORE">⚪ Ignorar</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="ruleDrivers">Controladores / Drivers</label>
                  <select id="ruleDrivers" class="form-select">
                    <option value="AUTO_APPROVE">🟢 Aprobación Automática</option>
                    <option value="MANUAL_APPROVE" selected>🟡 Aprobación Manual</option>
                    <option value="IGNORE">⚪ Ignorar</option>
                  </select>
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label class="form-label" for="ruleFeature">Actualizaciones de Características (Feature Updates)</label>
                  <select id="ruleFeature" class="form-select">
                    <option value="MANUAL_APPROVE" selected>🟡 Aprobación Manual (Recomendado)</option>
                    <option value="AUTO_APPROVE">🟢 Aprobación Automática</option>
                    <option value="IGNORE">⚪ Ignorar</option>
                  </select>
                </div>
              </div>
            </div>

            <div style="border-top: 1px solid var(--border-subtle); padding-top: 14px;">
              <h4 style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 12px;">Ventana de Mantenimiento & Reinicio</h4>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group">
                  <label class="form-label" for="policyCron">Expresión Cron (Horario)</label>
                  <input type="text" id="policyCron" class="form-input" placeholder="0 3 * * 0" value="0 3 * * 0" />
                  <small style="color: var(--text-secondary); font-size: 11px; margin-top: 4px; display: block;">
                    Ej: <code>0 3 * * 0</code> (Domingos 03:00 AM)
                  </small>
                </div>

                <div class="form-group">
                  <label class="form-label" for="policyDuration">Duración Máxima (minutos)</label>
                  <input type="number" id="policyDuration" class="form-input" min="30" max="480" value="120" />
                </div>

                <div class="form-group">
                  <label class="form-label" for="policyAutoReboot">Reinicio Automático</label>
                  <select id="policyAutoReboot" class="form-select">
                    <option value="false">❌ No reiniciar automáticamente (Recomendado)</option>
                    <option value="true">✅ Reiniciar dentro de la ventana de mantenimiento</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="policyGracePeriod">Aviso de Gracia al Usuario (minutos)</label>
                  <input type="number" id="policyGracePeriod" class="form-input" min="0" max="120" value="15" />
                </div>
              </div>
            </div>

            <div id="patchPolicyModalError" style="display: none; padding: 10px 14px; border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 12px;">
            </div>

          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closePatchPolicyModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary" id="btnSavePatchPolicy">Guardar Política</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: Programar Reinicio Controlado -->
    <div id="scheduleRebootModal" class="modal-backdrop">
      <div class="modal-card" style="max-width: 480px; width: 95%;">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">🔄</span>
            <h3 class="modal-title">Programar Reinicio de Equipo</h3>
          </div>
          <button class="modal-close-btn" onclick="closeScheduleRebootModal()">&times;</button>
        </div>

        <form id="scheduleRebootForm" onsubmit="submitScheduleReboot(event)">
          <div class="modal-body" style="display: flex; flex-direction: column; gap: 16px;">
            <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
              Se programará un reinicio ordenado en el equipo <strong id="rebootModalHostname" style="color: #fff;">-</strong> informando al usuario en pantalla.
            </p>

            <div class="form-group">
              <label class="form-label" for="rebootDelayMinutes">Tiempo de Espera / Gracia (minutos)</label>
              <select id="rebootDelayMinutes" class="form-select">
                <option value="1">1 minuto (Inmediato)</option>
                <option value="5" selected>5 minutos (Aviso previo estándar)</option>
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="rebootMessage">Mensaje para el Usuario</label>
              <textarea id="rebootMessage" class="form-input" rows="3" style="resize: vertical; font-size: 13px;">NanoMonitor RMM: El equipo se reiniciará para aplicar actualizaciones críticas del sistema. Guarde sus trabajos pendientes.</textarea>
            </div>

            <div id="rebootModalError" style="display: none; padding: 10px 14px; border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-size: 12px;">
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeScheduleRebootModal()">Cancelar</button>
            <button type="submit" class="btn btn-danger" id="btnSubmitReboot">Confirmar Reinicio</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
