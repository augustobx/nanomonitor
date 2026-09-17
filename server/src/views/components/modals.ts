export function getModalsHtml(): string {
  return `
    <!-- Login Modal -->
    <div class="modal-backdrop" id="loginModal">
      <div class="modal-window">
        <div class="modal-header">
          <h3 class="modal-title">🔐 Iniciar Sesión en NanoLabs Control Center</h3>
          <button class="btn btn-ghost btn-sm" onclick="closeLoginModal()">✕</button>
        </div>
        <form onsubmit="handleLogin(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Correo Electrónico</label>
              <input type="email" id="loginEmail" class="form-input" placeholder="admin@nanolabs.com.ar" required value="admin@nanolabs.com.ar">
            </div>
            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label class="form-label" style="margin-bottom: 0;">Contraseña</label>
                <button type="button" class="btn btn-ghost btn-xs" style="font-size: 11px; padding: 2px 6px;" onclick="const p=document.getElementById('loginPass'); p.type = p.type==='password'?'text':'password'; this.textContent = p.type==='password'?'👁️ Ver':'🔒 Ocultar';">👁️ Ver</button>
              </div>
              <input type="password" id="loginPass" class="form-input" placeholder="••••••••" required value="NanoLabs2026!MonitorAdmin">
            </div>
            <div id="loginError" style="color: var(--danger); font-size: 12px; display: none;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="quickLoginDemo()">⚡ Acceso Rápido Admin</button>
            <button type="submit" class="btn btn-primary" id="btnLoginSubmit">Ingresar</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Create Customer Modal -->
    <div class="modal-backdrop" id="customerModal">
      <div class="modal-window">
        <div class="modal-header">
          <h3 class="modal-title">🏢 Registrar Nuevo Cliente</h3>
          <button class="btn btn-ghost btn-sm" onclick="closeCreateCustomerModal()">✕</button>
        </div>
        <form onsubmit="handleCreateCustomer(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Razón Social / Nombre Comercial *</label>
              <input type="text" id="custName" class="form-input" placeholder="Ej: Sanatorio Central S.A." required>
            </div>
            <div class="form-group">
              <label class="form-label">Código Único (Identificador RMM) *</label>
              <input type="text" id="custCode" class="form-input" placeholder="Ej: SANATORIO" maxlength="15" style="text-transform: uppercase;" required>
              <small style="color: var(--text-muted); font-size: 11px;">Este código se usará en los tokens de enrolamiento (ej: NL-SANATORIO-XXXX).</small>
            </div>
            <div class="form-group">
              <label class="form-label">Correo de Contacto Técnico</label>
              <input type="email" id="custEmail" class="form-input" placeholder="it@cliente.com">
            </div>
            <div class="form-group">
              <label class="form-label">Teléfono de Guardia</label>
              <input type="tel" id="custPhone" class="form-input" placeholder="+54 11 4000-0000">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeCreateCustomerModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Registrar Cliente</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Alert Detail Modal -->
    <div class="modal-backdrop" id="alertDetailModal">
      <div class="modal-window lg" onclick="event.stopPropagation()">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span id="adSeverityPill" class="status-pill status-danger">Crítica</span>
            <h3 class="modal-title" id="adTitle">Detalle de la Alerta</h3>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="closeAlertDetailModal()">✕</button>
        </div>

        <div class="modal-body" id="adBody">
          <!-- Populated dynamically via renderAlertDetail() -->
        </div>

        <div class="modal-footer" id="adFooter">
          <!-- Actions populated dynamically -->
        </div>
      </div>
    </div>

    <!-- Threshold Edit Modal -->
    <div class="modal-backdrop" id="thresholdModal">
      <div class="modal-window">
        <div class="modal-header">
          <h3 class="modal-title" id="thModalTitle">✏️ Personalizar Umbral</h3>
          <button class="btn btn-ghost btn-sm" onclick="closeThresholdModal()">✕</button>
        </div>
        <form onsubmit="handleThresholdSubmit(event)">
          <div class="modal-body">
            <input type="hidden" id="thBaseRuleId">
            <input type="hidden" id="thCustomerId">
            <div class="form-group">
              <label class="form-label" id="thRuleDescLabel">Nuevo Umbral Numérico</label>
              <input type="number" step="any" id="thInputVal" class="form-input" required min="0">
              <small style="color: var(--text-muted); font-size: 11px;" id="thHelpText">
                Valor porcentual o absoluto que disparará la alerta para este cliente.
              </small>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeThresholdModal()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Guardar Umbral</button>
          </div>
        </form>
      </div>
    </div>
  `;
}
