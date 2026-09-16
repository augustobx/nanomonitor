export function getSettingsViewHtml(): string {
  return `
    <div id="viewSettings" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Configuración del Sistema & Políticas</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Ajuste de reglas de monitoreo, umbrales de alerta, canales de notificación y preferencias de la consola.
          </p>
        </div>

        <button class="btn btn-secondary btn-sm" onclick="fetchAndRenderSettingsRules()">
          🔄 Recargar Reglas
        </button>
      </div>

      <!-- Navigation Tabs inside Settings -->
      <div class="subnav-tabs">
        <button class="subnav-tab-btn active" id="setTabReglas" onclick="switchSettingsSubTab('reglas')">
          🛡️ Reglas de Monitoreo & Umbrales
        </button>
        <button class="subnav-tab-btn" id="setTabNotificaciones" onclick="switchSettingsSubTab('notificaciones')">
          🔔 Canales de Notificación
        </button>
        <button class="subnav-tab-btn" id="setTabPreferencias" onclick="switchSettingsSubTab('preferencias')">
          ⚙️ Preferencias de Consola
        </button>
      </div>

      <!-- SUBTAB 1: REGLAS DE MONITOREO Y UMBRALES -->
      <div id="setViewReglas" style="display: flex; flex-direction: column; gap: 16px;">
        
        <div class="filter-bar">
          <div class="filter-group">
            <label style="font-size: 12px; font-weight: 600; color: var(--text-secondary);">Ámbito de las Reglas:</label>
            <select id="settingsRuleCustomerSelect" class="filter-select" onchange="handleSettingsRuleCustomerChange()" style="min-width: 280px;">
              <option value="GENERAL">🌐 Reglas Generales de Flota (Todos los Clientes)</option>
            </select>
          </div>
          <div id="settingsRuleScopeHelp" style="font-size: 12px; color: var(--text-muted);">
            Estas reglas aplican por defecto a todas las estaciones de trabajo de todos tus clientes.
          </div>
        </div>

        <div class="section-card">
          <div class="table-responsive">
            <table class="noc-table">
              <thead>
                <tr>
                  <th>Regla de Monitoreo</th>
                  <th>Categoría</th>
                  <th>Severidad</th>
                  <th>Condición Disparadora</th>
                  <th>Cooldown</th>
                  <th>Estado</th>
                  <th style="text-align: right;">Acciones</th>
                </tr>
              </thead>
              <tbody id="settingsRulesTableBody">
                <tr>
                  <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    Cargando reglas de monitoreo...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- SUBTAB 2: CANALES DE NOTIFICACIÓN -->
      <div id="setViewNotificaciones" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>🔔 Canales de Alerta Externa</span></div>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 16px; max-width: 650px;">
            <div class="form-group">
              <label class="form-label">Webhook Discord / Slack para Alertas Críticas</label>
              <input type="url" id="cfgWebhookUrl" class="form-input" placeholder="https://discord.com/api/webhooks/..." value="">
              <small style="color: var(--text-muted); font-size: 11px;">Notificación inmediata ante fallas de disco SMART, BSOD o caídas de servidor.</small>
            </div>
            <div class="form-group">
              <label class="form-label">Correo de Guardia NOC (Notificaciones de Alertas Altas)</label>
              <input type="email" id="cfgNocEmail" class="form-input" placeholder="guardia@nanolabs.com.ar" value="admin@nanolabs.com.ar">
            </div>
            <div>
              <button class="btn btn-primary btn-sm" onclick="saveNotificationSettings()">
                Guardar Configuración de Notificaciones
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- SUBTAB 3: PREFERENCIAS DE CONSOLA -->
      <div id="setViewPreferencias" style="display: none; flex-direction: column; gap: 16px;">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title"><span>⚙️ Ajustes de Interfaz & Auto-Sincronización</span></div>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 16px; max-width: 650px;">
            <div class="form-group">
              <label class="form-label">Frecuencia de Auto-Sondeo en Vivo (Polling de Telemetría)</label>
              <select id="cfgPollingInterval" class="form-select" onchange="updatePollingInterval(this.value)">
                <option value="5000">Cada 5 segundos (Ultra rápido)</option>
                <option value="8000" selected>Cada 8 segundos (Recomendado)</option>
                <option value="15000">Cada 15 segundos</option>
                <option value="30000">Cada 30 segundos (Bajo ancho de banda)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Umbral de Inactividad para Equipos Offline</label>
              <select class="form-select">
                <option value="5">5 minutos sin latido</option>
                <option value="10" selected>10 minutos sin latido (Por defecto)</option>
                <option value="15">15 minutos sin latido</option>
              </select>
            </div>

            <div>
              <button class="btn btn-secondary btn-sm" onclick="showToast('✅ Preferencias locales guardadas')">
                Guardar Preferencias
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}
