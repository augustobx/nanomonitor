export function getClientRuntimeScript(): string {
  return `
    // Centralized State
    let currentActiveView = 'dashboard';
    let currentActiveCustomerId = null;
    let selectedDeviceId = null;
    let selectedDevice = null;
    let selectedAlertId = null;
    let currentAlertQuickFilter = 'ALL';
    let currentWizardCustomerId = null;
    let currentWizardSiteId = null;
    let deviceWorkspaceOrigin = 'devices';
    let cachedSoftwareList = [];
    let pollingIntervalMs = 8000;
    let pollingTimer = null;

    // DOM Utilities
    function setVal(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = (text !== undefined && text !== null) ? text : '';
    }

    function setHtml(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = (html !== undefined && html !== null) ? html : '';
    }

    function showToast(msg, type = 'success') {
      let c = document.getElementById('toastContainer');
      if (!c) {
        c = document.createElement('div');
        c.id = 'toastContainer';
        c.className = 'toast-container';
        document.body.appendChild(c);
      }
      const t = document.createElement('div');
      t.className = 'toast ' + (type === 'error' ? 'error' : 'success');
      t.innerHTML = '<span>' + (type === 'error' ? '❌' : '✅') + '</span><span>' + msg + '</span>';
      c.appendChild(t);
      setTimeout(function() {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 4000);
    }

    function formatUptime(seconds) {
      if (!seconds || seconds <= 0) return '0m';
      const d = Math.floor(seconds / 86400);
      const h = Math.floor((seconds % 86400) / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      if (d > 0) return d + 'd ' + h + 'h';
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm';
    }

    // Telemetry & Data Model Resolvers
    function getDeviceMetricsCpu(d) {
      if (!d) return null;
      const m = (d.metrics && d.metrics.length > 0) ? d.metrics[0] : (d.cpuPercent != null ? d : null);
      if (!m) return null;
      if (m.cpuPercent != null && !isNaN(m.cpuPercent)) return Number(m.cpuPercent);
      if (m.cpuUsage != null && !isNaN(m.cpuUsage)) return Number(m.cpuUsage);
      return null;
    }

    function getDeviceMetricsRam(d) {
      if (!d) return null;
      const m = (d.metrics && d.metrics.length > 0) ? d.metrics[0] : null;
      if (!m) return null;
      if (m.ramUsedMB != null && m.ramAvailMB != null) {
        const tot = Number(m.ramUsedMB) + Number(m.ramAvailMB);
        return tot > 0 ? (Number(m.ramUsedMB) / tot) * 100 : 0;
      }
      if (m.ramUsage != null && !isNaN(m.ramUsage)) return Number(m.ramUsage);
      return null;
    }

    function getDeviceHealthScore(d) {
      if (!d || !d.healthScores || d.healthScores.length === 0) return null;
      const hs = d.healthScores[0];
      if (hs.overall != null && !isNaN(hs.overall)) return Number(hs.overall);
      if (hs.score != null && !isNaN(hs.score)) return Number(hs.score);
      return null;
    }

    function formatOsName(osVersion) {
      if (!osVersion) return 'Windows';
      const clean = String(osVersion).replace('Microsoft ', '').trim();
      if (clean.startsWith('10.0.2')) return 'Windows 11 (' + clean + ')';
      if (clean.startsWith('10.0.1')) return 'Windows 10 (' + clean + ')';
      return 'Windows ' + clean;
    }

    // Sidebar & Layout Controls
    function toggleSidebar() {
      const sb = document.getElementById('appSidebar');
      const icon = document.getElementById('sidebarToggleIcon');
      if (!sb) return;
      sb.classList.toggle('collapsed');
      const isCollapsed = sb.classList.contains('collapsed');
      localStorage.setItem('nl_sidebar_collapsed', isCollapsed ? '1' : '0');
      if (icon) icon.textContent = isCollapsed ? '▶' : '◀';
    }

    function toggleMobileSidebar() {
      const sb = document.getElementById('appSidebar');
      if (sb) sb.classList.toggle('mobile-open');
    }

    // Authentication UI
    function setLoggedInUI() {
      const btn = document.getElementById('loginNavBtn');
      const badge = document.getElementById('userBadge');
      const emailBadge = document.getElementById('userEmailBadge');
      const user = localStorage.getItem('nl_user');
      if (btn) btn.style.display = 'none';
      if (badge) badge.style.display = 'flex';
      if (emailBadge && user) {
        try {
          const u = JSON.parse(user);
          emailBadge.textContent = u.email || 'admin@nanolabs.com.ar';
        } catch (e) {
          emailBadge.textContent = 'admin@nanolabs.com.ar';
        }
      }
    }

    function setLoggedOutUI() {
      const btn = document.getElementById('loginNavBtn');
      const badge = document.getElementById('userBadge');
      if (btn) btn.style.display = 'inline-flex';
      if (badge) badge.style.display = 'none';
    }

    function openLoginModal() {
      const m = document.getElementById('loginModal');
      if (m) m.classList.add('active');
    }

    function closeLoginModal() {
      const token = localStorage.getItem('nl_token');
      if (!token) {
        showToast('Debes iniciar sesión para acceder al sistema', 'warning');
        return;
      }
      const m = document.getElementById('loginModal');
      if (m) m.classList.remove('active');
    }

    async function handleLogin(e) {
      if (e) e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPass').value;
      const errEl = document.getElementById('loginError');
      if (errEl) errEl.style.display = 'none';

      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        });
        const json = await res.json();
        const token = json.data && (json.data.accessToken || json.data.token);
        if (res.ok && token) {
          localStorage.setItem('nl_token', token);
          if (json.data.user) localStorage.setItem('nl_user', JSON.stringify(json.data.user));
          setLoggedInUI();
          const m = document.getElementById('loginModal');
          if (m) m.classList.remove('active');
          showToast('Bienvenido a NanoLabs Control Center');
          await fetchLiveDashboard(false);
          startPolling();
        } else {
          if (errEl) {
            errEl.textContent = json.message || 'Credenciales incorrectas';
            errEl.style.display = 'block';
          }
        }
      } catch (err) {
        if (errEl) {
          errEl.textContent = 'Error de conexión con el servidor';
          errEl.style.display = 'block';
        }
      }
    }

    async function quickLoginDemo() {
      try {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@nanolabs.com.ar', password: 'NanoLabs2026!MonitorAdmin' })
        });
        const json = await res.json();
        const token = json.data && (json.data.accessToken || json.data.token);
        if (res.ok && token) {
          localStorage.setItem('nl_token', token);
          if (json.data.user) localStorage.setItem('nl_user', JSON.stringify(json.data.user));
          setLoggedInUI();
          const m = document.getElementById('loginModal');
          if (m) m.classList.remove('active');
          showToast('Sesión iniciada: Augusto / NanoLabs Admin');
          await fetchLiveDashboard(false);
          startPolling();
          return token;
        }
      } catch (err) {
        console.warn('Quick login demo fallback failed:', err);
      }
      return null;
    }

    function startPolling() {
      stopPolling();
      pollingTimer = setInterval(function() {
        if (localStorage.getItem('nl_token')) {
          fetchLiveDashboard(true);
        } else {
          stopPolling();
        }
      }, pollingIntervalMs);
    }

    function stopPolling() {
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
    }

    function logout() {
      stopPolling();
      localStorage.removeItem('nl_token');
      localStorage.removeItem('nl_user');
      setLoggedOutUI();
      // Clear data from memory
      currentDevices = [];
      currentCustomers = [];
      currentRecentEvents = [];
      currentAlerts = [];
      renderDashboard();
      renderAlertCenter();
      renderCustomersTable();
      renderFleetDevices();
      renderAgentsList();
      // Close open drawers/modals
      closeGlobalSearch();
      closeCreateCustomerModal();
      closeAlertDetailModal();
      closeThresholdModal();
      closeAlertRulesModal();
      const devDrawer = document.getElementById('deviceDrawer');
      if (devDrawer) devDrawer.classList.remove('active');
      openLoginModal();
      showToast('Sesión cerrada correctamente');
    }

    // Navigation Router
    function switchNavTab(tab) {
      const views = {
        'dashboard': 'viewDashboard',
        'alerts': 'viewAlerts',
        'customers': 'viewCustomers',
        'customer-detail': 'viewCustomerDetail',
        'devices': 'viewDevices',
        'device-detail': 'viewDeviceDetail',
        'agents': 'viewAgents',
        'platform': 'viewPlatform',
        'settings': 'viewSettings'
      };

      const navItems = {
        'dashboard': 'navItemDashboard',
        'alerts': 'navItemAlerts',
        'customers': 'navItemCustomers',
        'customer-detail': 'navItemCustomers',
        'devices': 'navItemDevices',
        'device-detail': 'navItemDevices',
        'agents': 'navItemAgents',
        'platform': 'navItemPlatform',
        'settings': 'navItemSettings'
      };

      currentActiveView = tab;

      // Toggle views visibility
      for (const key in views) {
        const el = document.getElementById(views[key]);
        if (el) el.style.display = (key === tab) ? 'flex' : 'none';
      }

      // Update sidebar active states
      for (const key in navItems) {
        const navEl = document.getElementById(navItems[key]);
        if (navEl) {
          const isActive = (key === tab) || 
            (tab === 'customer-detail' && key === 'customers') || 
            (tab === 'device-detail' && key === 'devices');
          navEl.classList.toggle('active', isActive);
        }
      }

      // Update Breadcrumbs
      updateBreadcrumbs(tab);

      // Render view-specific data
      if (tab === 'dashboard') {
        renderDashboard();
      } else if (tab === 'alerts') {
        renderAlertCenter();
      } else if (tab === 'customers') {
        renderCustomersTable();
      } else if (tab === 'devices') {
        renderFleetDevices();
      } else if (tab === 'agents') {
        renderAgentsList();
        populateWizardCustomerSelect();
      } else if (tab === 'platform') {
        renderPlatformView();
      } else if (tab === 'settings') {
        fetchAndRenderSettingsRules();
      }

      window.scrollTo(0, 0);
    }

    function updateBreadcrumbs(tab) {
      const trail = document.getElementById('breadcrumbsTrail');
      const actions = document.getElementById('breadcrumbsActions');
      if (!trail) return;

      if (tab === 'dashboard') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Dashboard</span>';
        if (actions) actions.innerHTML = '';
      } else if (tab === 'alerts') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Centro de Alertas</span>';
        if (actions) actions.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="triggerAlertEvaluation()">⚡ Evaluar Reglas</button>';
      } else if (tab === 'customers') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Clientes</span>';
        if (actions) actions.innerHTML = '<button class="btn btn-primary btn-sm" onclick="openCreateCustomerModal()">+ Registrar Cliente</button>';
      } else if (tab === 'customer-detail') {
        const cust = (currentCustomers || []).find(function(c) { return c.id === currentActiveCustomerId; });
        const cName = cust ? cust.name : 'Cliente';
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'customers\\')">Clientes</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">' + cName + '</span>';
        if (actions) actions.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="switchNavTab(\\'customers\\')">← Volver a Clientes</button>';
      } else if (tab === 'devices') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Flota Global de Equipos</span>';
        if (actions) actions.innerHTML = '';
      } else if (tab === 'device-detail') {
        const host = selectedDevice ? selectedDevice.hostname : 'Equipo';
        const cust = selectedDevice && selectedDevice.customer ? selectedDevice.customer.name : '';
        const custId = selectedDevice ? (selectedDevice.customer ? selectedDevice.customer.id : selectedDevice.customerId) : null;
        
        let html = '<span class="breadcrumb-link" onclick="switchNavTab(\\'devices\\')">Equipos</span>';
        if (cust && custId) {
          html = '<span class="breadcrumb-link" onclick="switchNavTab(\\'customers\\')">Clientes</span>' +
            '<span class="breadcrumb-separator">/</span><span class="breadcrumb-link" onclick="openCustomerWorkspace(\\'' + custId + '\\')">' + cust + '</span>';
        }
        html += '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">' + host + '</span>';
        trail.innerHTML = html;
        if (actions) {
          actions.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="backFromDeviceWorkspace()">← Volver</button>';
        }
      } else if (tab === 'agents') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Agentes & Enrolamiento</span>';
        if (actions) actions.innerHTML = '';
      } else if (tab === 'platform') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Plataforma & Servicios</span>';
        if (actions) actions.innerHTML = '';
      } else if (tab === 'settings') {
        trail.innerHTML = '<span class="breadcrumb-link" onclick="switchNavTab(\\'dashboard\\')">NOC</span>' +
          '<span class="breadcrumb-separator">/</span><span class="breadcrumb-active">Configuración</span>';
        if (actions) actions.innerHTML = '';
      }
    }

    // ==========================================
    // DASHBOARD NOC (5 SECONDS TRIAGE)
    // ==========================================
    function renderDashboard() {
      const devices = currentDevices || [];
      const customers = currentCustomers || [];
      const alerts = currentAlerts || [];
      const events = currentRecentEvents || [];

      // 1. Calculations
      const activeAlerts = alerts.filter(function(a) { return a.status === 'OPEN' || a.status === 'ACKNOWLEDGED'; });
      const critAlerts = activeAlerts.filter(function(a) { return a.severity === 'CRITICAL'; });
      const highAlerts = activeAlerts.filter(function(a) { return a.severity === 'HIGH'; });
      const warnAlerts = activeAlerts.filter(function(a) { return a.severity === 'WARNING'; });
      const resolvedToday = alerts.filter(function(a) {
        if (a.status !== 'RESOLVED' || !a.resolvedAt) return false;
        const d = new Date(a.resolvedAt);
        const now = new Date();
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length;

      const onlineDevices = devices.filter(function(d) { return d.status === 'ONLINE'; });
      const offlineDevices = devices.filter(function(d) { return d.status !== 'ONLINE'; });
      const onlinePercent = devices.length > 0 ? Math.round((onlineDevices.length / devices.length) * 100) : 100;

      // Affected customers: customers with open/acknowledged alerts
      const affectedCustIds = new Set();
      activeAlerts.forEach(function(a) {
        if (a.customerId) affectedCustIds.add(a.customerId);
        if (a.customer && a.customer.id) affectedCustIds.add(a.customer.id);
      });

      // Average Health Score
      let healthSum = 0;
      let healthCount = 0;
      devices.forEach(function(d) {
        const hs = getDeviceHealthScore(d);
        if (hs !== null && hs !== undefined) {
          healthSum += hs;
          healthCount++;
        }
      });
      const avgHealth = healthCount > 0 ? Math.round(healthSum / healthCount) : 85;

      // 2. Set Top KPIs
      setVal('dashKpiCriticalAlerts', critAlerts.length);
      const critCard = document.getElementById('kpiCardCriticalAlerts');
      if (critCard) critCard.classList.toggle('critical', critAlerts.length > 0);

      setVal('dashKpiTotalAlerts', activeAlerts.length);
      setVal('dashKpiHighDesc', highAlerts.length + ' Altas • ' + warnAlerts.length + ' Advertencias');

      setVal('dashKpiOnlineDevices', onlineDevices.length);
      setVal('dashKpiOnlinePercent', onlinePercent + '% de la flota reportando');

      setVal('dashKpiOfflineDevices', offlineDevices.length);

      setVal('dashKpiAffectedCustomers', affectedCustIds.size);
      setVal('dashKpiTotalCustSummary', 'De ' + customers.length + ' clientes administrados');

      setVal('dashKpiAvgHealth', avgHealth + ' / 100');
      let healthCategory = 'Bueno';
      if (avgHealth >= 90) healthCategory = 'Excelente';
      else if (avgHealth < 50) healthCategory = 'Crítico';
      else if (avgHealth < 75) healthCategory = 'Regular';
      setVal('dashKpiHealthLabel', healthCategory + ' • ' + devices.length + ' equipos evaluados');

      setVal('dashKpiNewIncidents', activeAlerts.length);
      setVal('dashKpiResolvedToday', resolvedToday);

      // Topbar alerts count
      const tbAlertsPill = document.getElementById('topbarAlertsPill');
      const tbAlertsCount = document.getElementById('topbarAlertsCount');
      if (tbAlertsPill && tbAlertsCount) {
        if (critAlerts.length > 0) {
          tbAlertsPill.style.display = 'inline-flex';
          tbAlertsCount.textContent = critAlerts.length + (critAlerts.length === 1 ? ' Crítica' : ' Críticas');
        } else if (highAlerts.length > 0) {
          tbAlertsPill.style.display = 'inline-flex';
          tbAlertsCount.textContent = highAlerts.length + (highAlerts.length === 1 ? ' Alta' : ' Altas');
        } else {
          tbAlertsPill.style.display = 'none';
        }
      }

      // Sidebar badges
      const sbBadge = document.getElementById('sbAlertsBadge');
      if (sbBadge) {
        if (activeAlerts.length > 0) {
          sbBadge.style.display = 'inline-block';
          sbBadge.textContent = activeAlerts.length;
        } else {
          sbBadge.style.display = 'none';
        }
      }
      setVal('sbCustomersCount', customers.length);
      setVal('sbDevicesCount', devices.length);

      // 3. Block 1: Critical & High Alerts Table
      const alertsTbody = document.getElementById('dashAlertsTableBody');
      const alertsBadge = document.getElementById('dashAlertsBadge');
      if (alertsBadge) alertsBadge.textContent = activeAlerts.length + ' Activas';

      if (alertsTbody) {
        if (activeAlerts.length === 0) {
          alertsTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">' +
            'No hay alertas activas en este momento. Todos los sistemas operan en estado óptimo.' +
          '</td></tr>';
        } else {
          const topAlerts = activeAlerts.slice(0, 5);
          alertsTbody.innerHTML = topAlerts.map(function(a) {
            const isCrit = a.severity === 'CRITICAL';
            const isHigh = a.severity === 'HIGH';
            const sevPill = isCrit
              ? '<span class="status-pill status-danger">🔴 Crítica</span>'
              : (isHigh ? '<span class="status-pill status-warning">🟠 Alta</span>' : '<span class="status-pill status-info">🟡 Advertencia</span>');
            const host = a.device ? a.device.hostname : 'Equipo';
            const cust = a.customer ? a.customer.name : 'NanoLabs';
            const timeAgo = a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-';

            return '<tr>' +
              '<td>' + sevPill + '</td>' +
              '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + (a.deviceId || (a.device ? a.device.id : '')) + '\\')">' + host + '</strong></td>' +
              '<td><span style="color: var(--text-secondary);">' + cust + '</span></td>' +
              '<td><strong style="color: #fff;">' + (a.title || 'Alerta') + '</strong></td>' +
              '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + timeAgo + '</span></td>' +
              '<td style="text-align: right; white-space: nowrap;">' +
                '<button class="btn btn-primary btn-sm" onclick="openAlertDetailModal(\\'' + a.id + '\\')">Ver Detalle</button> ' +
                (a.status === 'OPEN' ? '<button class="btn btn-secondary btn-sm" onclick="acknowledgeAlert(\\'' + a.id + '\\')">Reconocer</button>' : '') +
              '</td>' +
            '</tr>';
          }).join('');
        }
      }

      // 4. Block 2: Offline Devices Table
      const offlineTbody = document.getElementById('dashOfflineTableBody');
      const offlineBadge = document.getElementById('dashOfflineBadge');
      if (offlineBadge) offlineBadge.textContent = offlineDevices.length + ' Equipos';

      if (offlineTbody) {
        if (offlineDevices.length === 0) {
          offlineTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">' +
            'No hay equipos desconectados. El 100% de la flota se encuentra en línea.' +
          '</td></tr>';
        } else {
          offlineTbody.innerHTML = offlineDevices.slice(0, 5).map(function(d) {
            const host = d.hostname || 'Equipo';
            const cust = d.customer ? d.customer.name : '-';
            const site = d.site ? d.site.name : 'Principal';
            const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('es-AR') : 'Nunca';

            return '<tr>' +
              '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">' + host + '</strong></td>' +
              '<td><span style="color: var(--text-secondary);">' + cust + '</span></td>' +
              '<td><span style="color: var(--text-muted);">' + site + '</span></td>' +
              '<td><span class="code-font" style="font-size: 11px; color: #f87171;">' + lastSeen + '</span></td>' +
              '<td style="text-align: right;">' +
                '<button class="btn btn-secondary btn-sm" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">Ver Equipo</button>' +
              '</td>' +
            '</tr>';
          }).join('');
        }
      }

      // 5. Block 3: Customers in Risk
      const riskContainer = document.getElementById('dashRiskCustomersList');
      if (riskContainer) {
        const riskCustomers = customers.filter(function(c) {
          const custAlerts = alerts.filter(function(a) {
            return ((a.customer && a.customer.id === c.id) || a.customerId === c.id) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
          });
          const custCrit = custAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;
          const custDevices = devices.filter(function(d) {
            return (d.customer && d.customer.id === c.id) || d.customerId === c.id;
          });
          const custOffline = custDevices.filter(function(d) { return d.status !== 'ONLINE'; }).length;
          return custCrit > 0 || custOffline > 0 || custAlerts.length >= 2;
        });

        if (riskCustomers.length === 0) {
          riskContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 12px;">' +
            'No se detectan clientes en estado de riesgo operativo. Todos presentan indicadores óptimos.' +
          '</div>';
        } else {
          riskContainer.innerHTML = riskCustomers.map(function(c) {
            const custAlerts = alerts.filter(function(a) {
              return ((a.customer && a.customer.id === c.id) || a.customerId === c.id) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
            });
            const custCrit = custAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;
            const custDevices = devices.filter(function(d) {
              return (d.customer && d.customer.id === c.id) || d.customerId === c.id;
            });
            const custOffline = custDevices.filter(function(d) { return d.status !== 'ONLINE'; }).length;

            return '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">' +
              '<div>' +
                '<strong style="color: #fff; font-size: 13px; cursor: pointer;" onclick="openCustomerWorkspace(\\'' + c.id + '\\')">' + c.name + '</strong>' +
                '<div style="font-size: 11px; color: #f87171; margin-top: 2px;">' +
                  (custCrit > 0 ? custCrit + ' Alertas Críticas • ' : '') +
                  (custOffline > 0 ? custOffline + ' Equipos Offline' : (custAlerts.length + ' Alertas Activas')) +
                '</div>' +
              '</div>' +
              '<button class="btn btn-secondary btn-sm" onclick="openCustomerWorkspace(\\'' + c.id + '\\')">Ver Ficha</button>' +
            '</div>';
          }).join('');
        }
      }

      // 6. Block 4: Recent Activity Feed
      const feed = document.getElementById('dashActivityFeed');
      if (feed) {
        if (!events || events.length === 0) {
          feed.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 14px; font-size: 11px;">' +
            'Sin eventos recientes registrados.' +
          '</div>';
        } else {
          feed.innerHTML = events.slice(0, 6).map(function(ev) {
            const host = ev.device ? ev.device.hostname : 'Dispositivo';
            const isCrit = ev.severity === 'CRITICAL' || ev.severity === 'ERROR';
            const icon = isCrit ? '🔴' : (ev.severity === 'WARNING' ? '🟡' : '🔵');
            const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

            return '<div style="display: flex; align-items: flex-start; gap: 8px; font-size: 11px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">' +
              '<span>' + icon + '</span>' +
              '<div style="flex: 1;">' +
                '<span class="code-font" style="color: #fff; font-weight: 600;">' + host + '</span>: ' +
                '<span style="color: var(--text-secondary);">' + (ev.message || ev.eventType || 'Evento de sistema') + '</span>' +
              '</div>' +
              '<span class="code-font" style="color: var(--text-muted); white-space: nowrap;">' + time + '</span>' +
            '</div>';
          }).join('');
        }
      }
    }

    // ==========================================
    // ALERTS MODULE (OPERATIONAL QUEUE)
    // ==========================================
    function setAlertQuickFilter(filter) {
      currentAlertQuickFilter = filter;
      const pills = document.querySelectorAll('#alertQuickFilters .filter-pill');
      pills.forEach(function(p) {
        p.classList.toggle('active', p.getAttribute('data-filter') === filter);
      });
      filterAlertCenter();
    }

    function renderAlertCenter(alerts) {
      alerts = Array.isArray(alerts) ? alerts : (currentAlerts || []);
      const tbody = document.getElementById('acAlertsTableBody');
      if (!tbody) return;

      const activeAlerts = alerts.filter(function(a) { return a.status === 'OPEN' || a.status === 'ACKNOWLEDGED'; });
      const critCount = activeAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;
      const highCount = activeAlerts.filter(function(a) { return a.severity === 'HIGH'; }).length;
      const warnCount = activeAlerts.filter(function(a) { return a.severity === 'WARNING'; }).length;
      const unackCount = alerts.filter(function(a) { return a.status === 'OPEN'; }).length;

      setVal('acCountAll', alerts.length);
      setVal('acCountCritical', critCount);
      setVal('acCountHigh', highCount);
      setVal('acCountWarning', warnCount);
      setVal('acCountUnack', unackCount);

      populateAlertCustomerFilter();
      filterAlertCenter();
    }

    function filterAlertCenter() {
      const tbody = document.getElementById('acAlertsTableBody');
      if (!tbody) return;

      const qf = currentAlertQuickFilter || 'ALL';
      const statusFilter = (document.getElementById('acFilterStatus') ? document.getElementById('acFilterStatus').value : 'ACTIVE');
      const custFilter = (document.getElementById('acFilterCustomer') ? document.getElementById('acFilterCustomer').value : 'ALL');
      const query = (document.getElementById('acSearchInput') ? document.getElementById('acSearchInput').value.toLowerCase().trim() : '');

      let list = currentAlerts || [];

      // Quick filter
      if (qf === 'CRITICAL') list = list.filter(function(a) { return a.severity === 'CRITICAL'; });
      else if (qf === 'HIGH') list = list.filter(function(a) { return a.severity === 'HIGH'; });
      else if (qf === 'WARNING') list = list.filter(function(a) { return a.severity === 'WARNING'; });
      else if (qf === 'UNACKNOWLEDGED') list = list.filter(function(a) { return a.status === 'OPEN'; });
      else if (qf === 'RECURRENT') list = list.filter(function(a) { return (a.occurrences || 1) >= 3; });
      else if (qf === 'OFFLINE') list = list.filter(function(a) { return (a.title || '').toLowerCase().includes('offline') || (a.rule && a.rule.category === 'offline'); });
      else if (qf === 'TODAY') {
        const todayStr = new Date().toDateString();
        list = list.filter(function(a) { return a.lastSeenAt && new Date(a.lastSeenAt).toDateString() === todayStr; });
      }

      // Status filter
      if (statusFilter === 'ACTIVE') {
        list = list.filter(function(a) { return a.status === 'OPEN' || a.status === 'ACKNOWLEDGED'; });
      } else if (statusFilter !== 'ALL') {
        list = list.filter(function(a) { return a.status === statusFilter; });
      }

      // Customer filter
      if (custFilter !== 'ALL') {
        list = list.filter(function(a) {
          return (a.customer && a.customer.id === custFilter) || a.customerId === custFilter;
        });
      }

      // Text search
      if (query) {
        list = list.filter(function(a) {
          const title = (a.title || '').toLowerCase();
          const desc = (a.description || '').toLowerCase();
          const host = (a.device ? a.device.hostname : '').toLowerCase();
          const cust = (a.customer ? a.customer.name : '').toLowerCase();
          return title.includes(query) || desc.includes(query) || host.includes(query) || cust.includes(query);
        });
      }

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">' +
          'No se encontraron alertas con los filtros seleccionados.' +
        '</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(function(a) {
        const isCrit = a.severity === 'CRITICAL';
        const isHigh = a.severity === 'HIGH';
        const isWarn = a.severity === 'WARNING';
        const sevClass = isCrit ? 'status-danger' : (isHigh ? 'status-warning' : (isWarn ? 'status-info' : 'status-online'));
        const sevLabel = isCrit ? '🔴 Crítica' : (isHigh ? '🟠 Alta' : (isWarn ? '🟡 Advertencia' : '🔵 Info'));

        const host = a.device ? a.device.hostname : 'Dispositivo';
        const devId = a.deviceId || (a.device ? a.device.id : '');
        const custName = a.customer ? a.customer.name : 'NanoLabs';
        const custCode = a.customer ? a.customer.code : 'NL';

        let statusBadge = '<span class="status-pill status-danger">Abierta</span>';
        if (a.status === 'ACKNOWLEDGED') {
          const ackUser = a.acknowledger ? (a.acknowledger.name || a.acknowledger.email) : 'Técnico';
          statusBadge = '<span class="status-pill status-warning" title="Reconocida por ' + ackUser + '">👁️ Reconocida</span>';
        } else if (a.status === 'RESOLVED') {
          statusBadge = '<span class="status-pill status-online">✓ Resuelta</span>';
        }

        const lastSeen = a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('es-AR') : '-';

        return '<tr>' +
          '<td><span class="status-pill ' + sevClass + '">' + sevLabel + '</span></td>' +
          '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + devId + '\\')">' + host + '</strong></td>' +
          '<td><span style="color: var(--text-secondary);">' + custName + '</span> <span class="code-badge">' + custCode + '</span></td>' +
          '<td>' +
            '<strong style="color: #fff; font-size: 13px;">' + (a.title || 'Alerta') + '</strong>' +
            '<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + (a.description || '') + '</div>' +
          '</td>' +
          '<td style="text-align: center;"><span class="code-badge">x' + (a.occurrences || 1) + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px; color: #38bdf8;">' + lastSeen + '</span></td>' +
          '<td>' + statusBadge + '</td>' +
          '<td style="text-align: right; white-space: nowrap;">' +
            '<button class="btn btn-primary btn-sm" onclick="openAlertDetailModal(\\'' + a.id + '\\')">Ver Detalle</button> ' +
            (a.status === 'OPEN' ? '<button class="btn btn-secondary btn-sm" onclick="acknowledgeAlert(\\'' + a.id + '\\')" title="Reconocer alerta">Reconocer</button> ' : '') +
            (a.status !== 'RESOLVED' ? '<button class="btn btn-secondary btn-sm" onclick="resolveAlert(\\'' + a.id + '\\')" title="Marcar como resuelta">Resolver</button>' : '') +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function populateAlertCustomerFilter() {
      const sel = document.getElementById('acFilterCustomer');
      if (!sel) return;
      const currentVal = sel.value;
      let html = '<option value="ALL">Todos los Clientes</option>';
      (currentCustomers || []).forEach(function(c) {
        html += '<option value="' + c.id + '"' + (currentVal === c.id ? ' selected' : '') + '>' + c.name + ' (' + c.code + ')</option>';
      });
      sel.innerHTML = html;
    }

    // Alert Detail Modal Functions
    function openAlertDetailModal(alertId) {
      const m = document.getElementById('alertDetailModal');
      const body = document.getElementById('adBody');
      const footer = document.getElementById('adFooter');
      const title = document.getElementById('adTitle');
      const sevPill = document.getElementById('adSeverityPill');
      if (!m || !body) return;

      const a = (currentAlerts || []).find(function(x) { return x.id === alertId; });
      if (!a) {
        showToast('Alerta no encontrada', 'error');
        return;
      }
      selectedAlertId = alertId;

      const isCrit = a.severity === 'CRITICAL';
      const isHigh = a.severity === 'HIGH';
      sevPill.className = 'status-pill ' + (isCrit ? 'status-danger' : (isHigh ? 'status-warning' : 'status-info'));
      sevPill.textContent = isCrit ? 'Crítica' : (isHigh ? 'Alta' : 'Advertencia');
      if (title) title.textContent = a.title || 'Detalle de Alerta';

      const host = a.device ? a.device.hostname : 'Dispositivo';
      const devId = a.deviceId || (a.device ? a.device.id : '');
      const custName = a.customer ? a.customer.name : 'NanoLabs';
      const custCode = a.customer ? a.customer.code : 'NL';
      const firstSeen = a.firstSeenAt ? new Date(a.firstSeenAt).toLocaleString('es-AR') : '-';
      const lastSeen = a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('es-AR') : '-';

      // Diagnostic Suggestion Generation
      let suggestion = 'Inspeccionar métricas y procesos activos en la ficha técnica del equipo.';
      const titleLower = (a.title || '').toLowerCase();
      if (titleLower.includes('disco') || titleLower.includes('espacio') || titleLower.includes('almacenamiento')) {
        suggestion = 'Liberar espacio en el volumen afectado, vaciar temporales o expandir la partición.';
      } else if (titleLower.includes('smart') || titleLower.includes('físico')) {
        suggestion = 'URGENTE: Respaldar inmediatamente la información del disco y programar reemplazo de unidad por fallo inminente.';
      } else if (titleLower.includes('defender') || titleLower.includes('antivirus')) {
        suggestion = 'Habilitar la protección en tiempo real de Microsoft Defender desde la consola o PowerShell.';
      } else if (titleLower.includes('firewall') || titleLower.includes('cortafuegos')) {
        suggestion = 'Restablecer y activar los perfiles de red del Firewall de Windows.';
      } else if (titleLower.includes('offline') || titleLower.includes('latido')) {
        suggestion = 'Comprobar conectividad de red del equipo, estado de alimentación o servicio NanoMonitor.';
      } else if (titleLower.includes('reboot') || titleLower.includes('reinicio')) {
        suggestion = 'Programar ventana de reinicio fuera de horario productivo para aplicar actualizaciones pendientes.';
      }

      body.innerHTML = 
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; background: var(--bg-canvas); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">' +
          '<div><span style="color: var(--text-muted); font-size: 11px;">Equipo Afectado:</span><div style="font-weight: 700; color: #fff; font-size: 14px;" class="code-font">' + host + '</div></div>' +
          '<div><span style="color: var(--text-muted); font-size: 11px;">Cliente:</span><div style="font-weight: 600; color: #fff;">' + custName + ' (' + custCode + ')</div></div>' +
          '<div><span style="color: var(--text-muted); font-size: 11px;">Primera Ocurrencia:</span><div class="code-font" style="font-size: 11px;">' + firstSeen + '</div></div>' +
          '<div><span style="color: var(--text-muted); font-size: 11px;">Última Detección:</span><div class="code-font" style="font-size: 11px; color: #38bdf8;">' + lastSeen + ' (x' + (a.occurrences || 1) + ')</div></div>' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="form-label">Descripción del Incidente</label>' +
          '<div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; font-size: 13px; color: #fff;">' +
            (a.description || 'Sin descripción técnica adicional') +
          '</div>' +
        '</div>' +

        '<div style="background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.25); border-radius: var(--radius-md); padding: 12px 16px;">' +
          '<div style="font-size: 11px; font-weight: 700; color: #60a5fa; text-transform: uppercase;">💡 Diagnóstico y Sugerencia de Acción NOC:</div>' +
          '<div style="font-size: 13px; color: #fff; margin-top: 4px;">' + suggestion + '</div>' +
        '</div>';

      // Footer Actions
      let actionBtns = '<button class="btn btn-secondary" onclick="closeAlertDetailModal()">Cerrar</button>';
      if (devId) {
        actionBtns += '<button class="btn btn-secondary" onclick="closeAlertDetailModal(); openDeviceWorkspace(\\'' + devId + '\\')">💻 Ver Ficha del Equipo</button>';
      }
      if (a.status === 'OPEN') {
        actionBtns += '<button class="btn btn-secondary" onclick="acknowledgeAlert(\\'' + a.id + '\\'); closeAlertDetailModal();">👁️ Reconocer</button>';
      }
      if (a.status !== 'RESOLVED') {
        actionBtns += '<button class="btn btn-primary" onclick="resolveAlert(\\'' + a.id + '\\'); closeAlertDetailModal();">✅ Resolver Alerta</button>';
      }
      footer.innerHTML = actionBtns;

      m.classList.add('active');
    }

    function closeAlertDetailModal() {
      const m = document.getElementById('alertDetailModal');
      if (m) m.classList.remove('active');
      selectedAlertId = null;
    }

    async function acknowledgeAlert(alertId) {
      let token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }
      try {
        const res = await fetch('/api/v1/alerts/' + alertId + '/ack', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          showToast('Alerta marcada como Reconocida');
          await refreshAlerts(true);
        } else {
          showToast('No se pudo reconocer la alerta', 'error');
        }
      } catch (err) {
        showToast('Error de red al reconocer alerta', 'error');
      }
    }

    async function resolveAlert(alertId) {
      let token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }
      try {
        const res = await fetch('/api/v1/alerts/' + alertId + '/resolve', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ note: 'Resuelta desde la consola NanoLabs Control Center' })
        });
        if (res.ok) {
          showToast('Alerta resuelta con éxito');
          await refreshAlerts(true);
        } else {
          showToast('No se pudo resolver la alerta', 'error');
        }
      } catch (err) {
        showToast('Error de red al resolver alerta', 'error');
      }
    }

    async function triggerAlertEvaluation() {
      const spinner = document.getElementById('acEvalSpinner');
      if (spinner) spinner.classList.add('spinning');
      let token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }
      try {
        const res = await fetch('/api/v1/alerts/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const json = await res.json();
          const d = json.data || {};
          showToast('⚡ Evaluación completada: +' + (d.totalCreated || 0) + ' nuevas, -' + (d.totalResolved || 0) + ' resueltas');
          await refreshAlerts(true);
        } else {
          showToast('Error al evaluar reglas', 'error');
        }
      } catch (err) {
        showToast('Error de conexión', 'error');
      } finally {
        setTimeout(function() {
          if (spinner) spinner.classList.remove('spinning');
        }, 600);
      }
    }

    async function refreshAlerts(silent) {
      const icon = document.getElementById('acRefreshIcon');
      if (icon) icon.classList.add('spinning');
      let token = localStorage.getItem('nl_token');
      if (!token) return;
      try {
        const res = await fetch('/api/v1/alerts?limit=100', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.data)) {
            currentAlerts = json.data;
            renderAlertCenter(currentAlerts);
            renderDashboard();
            if (!silent) showToast('Cola de alertas actualizada');
          }
        }
      } catch (err) {
        if (!silent) showToast('Error al recargar alertas', 'error');
      } finally {
        setTimeout(function() {
          if (icon) icon.classList.remove('spinning');
        }, 600);
      }
    }

    // ==========================================
    // CUSTOMERS MODULE
    // ==========================================
    function renderCustomersTable() {
      renderCustomersTableFiltered(document.getElementById('custDirectorySearch') ? document.getElementById('custDirectorySearch').value : '');
    }

    function renderCustomersTableFiltered(query) {
      const tbody = document.getElementById('customersTableBody');
      if (!tbody) return;

      let list = currentCustomers || [];
      query = (query || '').toLowerCase().trim();
      if (query) {
        list = list.filter(function(c) {
          return (c.name || '').toLowerCase().includes(query) || (c.code || '').toLowerCase().includes(query);
        });
      }

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">' +
          'No se encontraron clientes registrados.' +
        '</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(function(c) {
        const sitesCount = (c.sites || []).length || (c._count ? c._count.sites : 0);
        const devList = (currentDevices || []).filter(function(d) {
          return (d.customer && d.customer.id === c.id) || d.customerId === c.id;
        });
        const devTotal = devList.length;
        const devOnline = devList.filter(function(d) { return d.status === 'ONLINE'; }).length;
        const devOffline = devTotal - devOnline;

        // Health score average
        let hsSum = 0;
        let hsCount = 0;
        devList.forEach(function(d) {
          const s = (d.healthScores && d.healthScores.length > 0) ? d.healthScores[0].score : null;
          if (s !== null && s !== undefined) {
            hsSum += s;
            hsCount++;
          }
        });
        const hsAvg = hsCount > 0 ? Math.round(hsSum / hsCount) : 90;
        let hsClass = hsAvg >= 80 ? 'status-online' : (hsAvg >= 50 ? 'status-warning' : 'status-danger');

        // Customer alerts
        const custAlerts = (currentAlerts || []).filter(function(a) {
          return ((a.customer && a.customer.id === c.id) || a.customerId === c.id) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
        });
        const critAlerts = custAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;

        let statusPill = '<span class="status-pill status-online">● Operativo</span>';
        if (critAlerts > 0) statusPill = '<span class="status-pill status-danger">● En Riesgo</span>';
        else if (devOffline > 0) statusPill = '<span class="status-pill status-warning">● Atención</span>';

        return '<tr>' +
          '<td>' +
            '<div style="display: flex; align-items: center; gap: 10px;">' +
              '<div style="width: 32px; height: 32px; border-radius: var(--radius-md); background: rgba(37, 99, 235, 0.12); border: 1px solid rgba(37, 99, 235, 0.25); display: flex; align-items: center; justify-content: center; font-weight: 700; color: #60a5fa; font-size: 12px;">' +
                (c.name.substring(0, 2).toUpperCase()) +
              '</div>' +
              '<div>' +
                '<strong style="color: #fff; font-size: 13px; cursor: pointer;" onclick="openCustomerWorkspace(\\'' + c.id + '\\')">' + c.name + '</strong>' +
                '<div style="font-size: 11px; color: var(--text-muted);">' + (c.contactEmail || 'Sin email registrado') + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="code-badge">' + c.code + '</span></td>' +
          '<td><span style="color: var(--text-secondary);">' + sitesCount + ' Sedes</span></td>' +
          '<td>' +
            '<strong>' + devTotal + '</strong> ' +
            '<span style="font-size: 11px; color: var(--text-muted);">(' + devOnline + ' Online • ' + devOffline + ' Offline)</span>' +
          '</td>' +
          '<td>' +
            (custAlerts.length > 0
              ? '<span class="status-pill ' + (critAlerts > 0 ? 'status-danger' : 'status-warning') + '">' + custAlerts.length + ' Activas</span>'
              : '<span class="status-pill status-online">0 Activas</span>') +
          '</td>' +
          '<td><span class="status-pill ' + hsClass + '">' + hsAvg + ' / 100</span></td>' +
          '<td>' + statusPill + '</td>' +
          '<td style="text-align: right; white-space: nowrap;">' +
            '<button class="btn btn-primary btn-sm" onclick="openCustomerWorkspace(\\'' + c.id + '\\')">Ver Cliente</button> ' +
            '<button class="btn btn-secondary btn-sm" onclick="copyCustomerEnrollCmdById(\\'' + c.id + '\\')" title="Copiar comando de enrolamiento">⚡ Enrolar</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function openCustomerWorkspace(customerId) {
      currentActiveCustomerId = customerId;
      const cust = (currentCustomers || []).find(function(c) { return c.id === customerId; });
      if (!cust) return;

      switchNavTab('customer-detail');

      // Populate Header
      setVal('cdName', cust.name);
      setVal('cdCode', cust.code);
      const av = document.getElementById('cdAvatar');
      if (av) av.textContent = cust.name.substring(0, 2).toUpperCase();

      setVal('cdContactEmail', cust.contactEmail || 'No asignado');
      setVal('cdContactPhone', cust.contactPhone || 'No asignado');

      // Tokens snippet
      const tokenObj = cust.enrollmentTokens && cust.enrollmentTokens.length > 0 ? cust.enrollmentTokens[0] : null;
      const tokenStr = tokenObj ? tokenObj.token : ('NL-' + cust.code + '-DEMO');
      const snippet = document.getElementById('cdEnrollCmdSnippet');
      if (snippet) {
        snippet.textContent = 'irm https://monitor.nanolabs.com.ar/install.ps1 | iex -Token "' + tokenStr + '"';
      }

      // Populate Subtabs
      renderCustomerWorkspaceData(cust);
      switchCustomerSubTab('resumen');
    }

    function switchCustomerSubTab(tab) {
      const tabs = ['resumen', 'equipos', 'sedes', 'alertas', 'agentes', 'configuracion'];
      tabs.forEach(function(t) {
        const btn = document.getElementById('cdTab' + t.charAt(0).toUpperCase() + t.slice(1));
        const view = document.getElementById('cdView' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tab);
        if (view) view.style.display = (t === tab) ? 'flex' : 'none';
      });
    }

    function renderCustomerWorkspaceData(cust) {
      const devList = (currentDevices || []).filter(function(d) {
        return (d.customer && d.customer.id === cust.id) || d.customerId === cust.id;
      });
      const onlineDev = devList.filter(function(d) { return d.status === 'ONLINE'; }).length;
      const offlineDev = devList.length - onlineDev;
      const sites = cust.sites || [];

      const custAlerts = (currentAlerts || []).filter(function(a) {
        return ((a.customer && a.customer.id === cust.id) || a.customerId === cust.id) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
      });
      const critAlerts = custAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;

      // KPIs
      setVal('cdKpiTotalDev', devList.length);
      setVal('cdKpiOnlineDev', onlineDev + ' Online • ' + offlineDev + ' Offline');
      setVal('cdKpiTotalSites', sites.length);
      setVal('cdKpiActiveAlerts', custAlerts.length);
      setVal('cdKpiCritAlerts', critAlerts + ' Críticas');

      setVal('cdCountEquipos', devList.length);
      setVal('cdCountSedes', sites.length);
      setVal('cdCountAlertas', custAlerts.length);

      // Average Health
      let hsSum = 0;
      let hsCount = 0;
      devList.forEach(function(d) {
        const s = getDeviceHealthScore(d);
        if (s !== null && s !== undefined) {
          hsSum += s;
          hsCount++;
        }
      });
      const avgHs = hsCount > 0 ? Math.round(hsSum / hsCount) : 90;
      setVal('cdKpiAvgHealth', avgHs + ' / 100');

      // Problem Devices Table
      const probTbody = document.getElementById('cdTableProblemDevices');
      if (probTbody) {
        const problems = devList.filter(function(d) {
          const s = getDeviceHealthScore(d) ?? 100;
          return d.status !== 'ONLINE' || s < 80;
        });
        if (problems.length === 0) {
          probTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">' +
            'Todos los equipos de este cliente operan con normalidad.' +
          '</td></tr>';
        } else {
          probTbody.innerHTML = problems.map(function(d) {
            const host = d.hostname || 'Equipo';
            const site = d.site ? d.site.name : 'Principal';
            const isOnline = d.status === 'ONLINE';
            const hs = getDeviceHealthScore(d);
            const hsStr = hs != null ? hs : '--';
            const hsClass = hs != null ? (hs >= 80 ? 'status-online' : (hs >= 50 ? 'status-warning' : 'status-danger')) : 'status-info';

            return '<tr>' +
              '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">' + host + '</strong></td>' +
              '<td>' + site + '</td>' +
              '<td><span class="status-pill ' + (isOnline ? 'status-online' : 'status-offline') + '">' + (isOnline ? 'ONLINE' : 'OFFLINE') + '</span></td>' +
              '<td><span class="status-pill ' + hsClass + '">' + hsStr + '</span></td>' +
              '<td style="text-align: right;"><button class="btn btn-secondary btn-sm" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">Ver Equipo</button></td>' +
            '</tr>';
          }).join('');
        }
      }

      // Recent Alerts List
      const alList = document.getElementById('cdRecentAlertsList');
      if (alList) {
        if (custAlerts.length === 0) {
          alList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 12px;">' +
            'No hay alertas activas para este cliente.' +
          '</div>';
        } else {
          alList.innerHTML = custAlerts.slice(0, 5).map(function(a) {
            const isCrit = a.severity === 'CRITICAL';
            return '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">' +
              '<div>' +
                '<span class="status-pill ' + (isCrit ? 'status-danger' : 'status-warning') + '" style="font-size: 10px;">' + (isCrit ? 'Crítica' : 'Alta') + '</span> ' +
                '<strong style="color: #fff; font-size: 12px; margin-left: 6px;">' + (a.title || 'Alerta') + '</strong>' +
                '<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">' + (a.device ? a.device.hostname : 'Dispositivo') + '</div>' +
              '</div>' +
              '<button class="btn btn-secondary btn-sm" onclick="openAlertDetailModal(\\'' + a.id + '\\')">Detalle</button>' +
            '</div>';
          }).join('');
        }
      }

      // All Customer Devices Table
      const devTbody = document.getElementById('cdTableDevices');
      if (devTbody) {
        if (devList.length === 0) {
          devTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 32px;">' +
            'Aún no hay equipos enrolados para este cliente.' +
          '</td></tr>';
        } else {
          devTbody.innerHTML = devList.map(function(d) {
            const isOnline = d.status === 'ONLINE';
            const site = d.site ? d.site.name : 'Principal';
            const cpuVal = getDeviceMetricsCpu(d);
            const ramVal = getDeviceMetricsRam(d);
            const cpu = cpuVal != null ? Math.round(cpuVal) + '%' : '--';
            const ram = ramVal != null ? Math.round(ramVal) + '%' : '--';
            const hs = getDeviceHealthScore(d);
            const hsStr = hs != null ? hs : '--';
            const hsClass = hs != null ? (hs >= 80 ? 'status-online' : (hs >= 50 ? 'status-warning' : 'status-danger')) : 'status-info';
            const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('es-AR') : 'Nunca';

            return '<tr>' +
              '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">' + d.hostname + '</strong></td>' +
              '<td>' + site + '</td>' +
              '<td><span class="status-pill ' + (isOnline ? 'status-online' : 'status-offline') + '">' + (isOnline ? 'ONLINE' : 'OFFLINE') + '</span></td>' +
              '<td><span class="status-pill ' + hsClass + '">' + hsStr + '</span></td>' +
              '<td><span class="code-font" style="font-size: 11px;">CPU: ' + cpu + ' • RAM: ' + ram + '</span></td>' +
              '<td><span class="code-badge">OK</span></td>' +
              '<td><span class="status-pill status-online">Protegido</span></td>' +
              '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + lastSeen + '</span></td>' +
              '<td style="text-align: right;"><button class="btn btn-primary btn-sm" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">Ver Equipo</button></td>' +
            '</tr>';
          }).join('');
        }
      }

      // Sites Table
      const sitesTbody = document.getElementById('cdTableSedes');
      if (sitesTbody) {
        if (sites.length === 0) {
          sitesTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">' +
            'No hay sedes registradas para este cliente.' +
          '</td></tr>';
        } else {
          sitesTbody.innerHTML = sites.map(function(s) {
            const siteDevs = devList.filter(function(d) { return d.siteId === s.id; });
            const onlineCount = siteDevs.filter(function(d) { return d.status === 'ONLINE'; }).length;
            const offlineCount = siteDevs.length - onlineCount;

            return '<tr>' +
              '<td><strong style="color: #fff;">' + s.name + '</strong></td>' +
              '<td><strong>' + siteDevs.length + '</strong> Equipos</td>' +
              '<td><span class="status-pill status-online">' + onlineCount + ' Online</span></td>' +
              '<td><span class="status-pill ' + (offlineCount > 0 ? 'status-danger' : 'status-offline') + '">' + offlineCount + ' Offline</span></td>' +
              '<td><span class="status-pill status-online">0 Críticas</span></td>' +
            '</tr>';
          }).join('');
        }
      }

      // Customer Rules
      fetchAndRenderCustomerRules(cust.id);
    }

    async function fetchAndRenderCustomerRules(custId) {
      const tbody = document.getElementById('cdTableRules');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Cargando reglas...</td></tr>';
      let token = localStorage.getItem('nl_token');
      if (!token) return;
      try {
        const res = await fetch('/api/v1/alerts/rules?customerId=' + custId, {
          headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (res.ok) {
          const json = await res.json();
          const rules = (json && json.data) || [];
          if (rules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No hay reglas registradas</td></tr>';
            return;
          }
          tbody.innerHTML = rules.map(function(r) {
            const isCrit = r.severity === 'CRITICAL';
            const isHigh = r.severity === 'HIGH';
            const isWarn = r.severity === 'WARNING';
            const sevClass = isCrit ? 'status-danger' : (isHigh ? 'status-warning' : (isWarn ? 'status-info' : 'status-online'));
            const isEnabled = r.enabled !== false;

            let conditionStr = '';
            let currentThresholdVal = null;
            if (r.condition && r.condition.type) {
              const t = r.condition.type;
              const th = r.condition.threshold;
              currentThresholdVal = th !== undefined ? th : null;
              if (t === 'STORAGE') conditionStr = 'Espacio libre &lt; ' + th + '%';
              else if (t === 'SMART') conditionStr = 'Fallo físico SMART';
              else if (t === 'CPU') conditionStr = 'Uso sostenido &gt; ' + th + '%';
              else if (t === 'RAM') conditionStr = 'Memoria libre &lt; ' + th + '%';
              else if (t === 'OFFLINE') conditionStr = 'Sin latidos &gt; ' + th + ' min';
              else if (t === 'DEFENDER') conditionStr = 'Protección AV apagada';
              else if (t === 'FIREWALL') conditionStr = 'Cortafuegos apagado';
              else conditionStr = t;
            }

            let statusBadge = isEnabled
              ? '<span class="status-pill status-online">● Activa</span>'
              : '<span class="status-pill status-offline">○ Desactivada</span>';

            if (r.isCustomerOverride) {
              statusBadge += '<div style="font-size: 10px; color: #f59e0b; margin-top: 2px;">★ Personalizada</div>';
            }

            let actionBtns = '<button class="btn btn-secondary btn-sm" onclick="toggleAlertRule(\\'' + r.id + '\\', \\'' + custId + '\\')">' + (isEnabled ? 'Desactivar' : 'Activar') + '</button>';
            if (currentThresholdVal !== null) {
              actionBtns += ' <button class="btn btn-secondary btn-sm" onclick="openThresholdModal(\\'' + (r.baseRuleId || r.id) + '\\', \\'' + custId + '\\', \\'' + currentThresholdVal + '\\', \\'' + (r.name || '') + '\\')">✏️ Umbral</button>';
            }
            if (r.isCustomerOverride && r.overrideId) {
              actionBtns += ' <button class="btn btn-secondary btn-sm" onclick="revertCustomerRuleOverride(\\'' + r.overrideId + '\\')">🔄 Revertir</button>';
            }

            return '<tr>' +
              '<td><strong style="color: #fff;">' + (r.name || 'Regla') + '</strong></td>' +
              '<td><span class="code-badge">' + (r.category || 'general') + '</span></td>' +
              '<td><span class="status-pill ' + sevClass + '">' + r.severity + '</span></td>' +
              '<td><span class="code-font" style="color: #38bdf8;">' + conditionStr + '</span></td>' +
              '<td>' + (r.cooldownMin || 60) + 'm</td>' +
              '<td>' + statusBadge + '</td>' +
              '<td style="text-align: right; white-space: nowrap;">' + actionBtns + '</td>' +
            '</tr>';
          }).join('');
        }
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 20px;">Error al cargar reglas</td></tr>';
      }
    }

    function openCreateCustomerModal() {
      const m = document.getElementById('customerModal');
      if (m) m.classList.add('active');
    }

    function closeCreateCustomerModal() {
      const m = document.getElementById('customerModal');
      if (m) m.classList.remove('active');
    }

    async function handleCreateCustomer(e) {
      if (e) e.preventDefault();
      let token = localStorage.getItem('nl_token');
      if (!token) {
        openLoginModal();
        showToast('Debes iniciar sesión para registrar clientes', 'error');
        return;
      }

      const name = document.getElementById('custName').value.trim();
      const code = document.getElementById('custCode').value.trim().toUpperCase();
      const contactEmail = document.getElementById('custEmail').value.trim();
      const contactPhone = document.getElementById('custPhone').value.trim();

      try {
        const res = await fetch('/api/v1/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({
            name: name,
            code: code,
            contactEmail: contactEmail || undefined,
            contactPhone: contactPhone || undefined
          })
        });

        if (res.status === 409) {
          showToast('Ya existe una empresa con ese código identificador', 'error');
          return;
        }

        if (!res.ok) {
          const errData = await res.json();
          showToast(errData.message || 'Error al crear cliente', 'error');
          return;
        }

        closeCreateCustomerModal();
        showToast('✅ Cliente "' + name + '" registrado con éxito');
        await fetchLiveDashboard(false);
      } catch (err) {
        showToast('Error de red al crear cliente', 'error');
      }
    }

    function copyCurrentCustomerEnrollCmd() {
      if (!currentActiveCustomerId) return;
      copyCustomerEnrollCmdById(currentActiveCustomerId);
    }

    function copyCustomerEnrollCmdById(custId) {
      const cust = (currentCustomers || []).find(function(c) { return c.id === custId; });
      if (!cust) return;
      const tokenObj = cust.enrollmentTokens && cust.enrollmentTokens.length > 0 ? cust.enrollmentTokens[0] : null;
      const tokenStr = tokenObj ? tokenObj.token : ('NL-' + cust.code + '-DEMO');
      const cmd = 'irm https://monitor.nanolabs.com.ar/install.ps1 | iex -Token "' + tokenStr + '"';
      navigator.clipboard.writeText(cmd).then(function() {
        showToast('✅ Comando PowerShell copiado al portapapeles');
      }).catch(function() {
        prompt('Copiá el comando:', cmd);
      });
    }

    function togglePs1ScriptPreview() {
      const b = document.getElementById('wsPs1PreviewBox');
      if (b) b.style.display = (b.style.display === 'none') ? 'block' : 'none';
    }

    // ==========================================
    // GLOBAL FLEET (DEVICES) MODULE
    // ==========================================
    function renderFleetDevices() {
      populateFleetCustomerFilter();
      filterFleetDevices();
    }

    function populateFleetCustomerFilter() {
      const sel = document.getElementById('fleetFilterCustomer');
      if (!sel) return;
      const currentVal = sel.value;
      let html = '<option value="ALL">Todos los Clientes</option>';
      (currentCustomers || []).forEach(function(c) {
        html += '<option value="' + c.id + '"' + (currentVal === c.id ? ' selected' : '') + '>' + c.name + ' (' + c.code + ')</option>';
      });
      sel.innerHTML = html;
    }

    function resetFleetFilters() {
      const search = document.getElementById('fleetSearchInput');
      const cust = document.getElementById('fleetFilterCustomer');
      const status = document.getElementById('fleetFilterStatus');
      const health = document.getElementById('fleetFilterHealth');
      const alerts = document.getElementById('fleetFilterAlerts');
      const reboot = document.getElementById('fleetFilterReboot');
      if (search) search.value = '';
      if (cust) cust.value = 'ALL';
      if (status) status.value = 'ALL';
      if (health) health.value = 'ALL';
      if (alerts) alerts.value = 'ALL';
      if (reboot) reboot.value = 'ALL';
      filterFleetDevices();
    }

    function filterFleetDevices() {
      const tbody = document.getElementById('fleetTableBody');
      if (!tbody) return;

      const query = (document.getElementById('fleetSearchInput') ? document.getElementById('fleetSearchInput').value.toLowerCase().trim() : '');
      const custFilter = (document.getElementById('fleetFilterCustomer') ? document.getElementById('fleetFilterCustomer').value : 'ALL');
      const statusFilter = (document.getElementById('fleetFilterStatus') ? document.getElementById('fleetFilterStatus').value : 'ALL');
      const healthFilter = (document.getElementById('fleetFilterHealth') ? document.getElementById('fleetFilterHealth').value : 'ALL');
      const alertsFilter = (document.getElementById('fleetFilterAlerts') ? document.getElementById('fleetFilterAlerts').value : 'ALL');
      const rebootFilter = (document.getElementById('fleetFilterReboot') ? document.getElementById('fleetFilterReboot').value : 'ALL');

      let list = currentDevices || [];

      // Online/Offline count pills
      const onlineCount = list.filter(function(d) { return d.status === 'ONLINE'; }).length;
      const offlineCount = list.length - onlineCount;
      setVal('devOnlineCountPill', onlineCount + ' Online');
      setVal('devOfflineCountPill', offlineCount + ' Offline');

      // Filters
      if (custFilter !== 'ALL') {
        list = list.filter(function(d) {
          return (d.customer && d.customer.id === custFilter) || d.customerId === custFilter;
        });
      }

      if (statusFilter === 'ONLINE') list = list.filter(function(d) { return d.status === 'ONLINE'; });
      else if (statusFilter === 'OFFLINE') list = list.filter(function(d) { return d.status !== 'ONLINE'; });

      if (healthFilter === 'OPTIMAL') {
        list = list.filter(function(d) {
          const s = (d.healthScores && d.healthScores.length > 0) ? d.healthScores[0].score : 100;
          return s >= 80;
        });
      } else if (healthFilter === 'REGULAR') {
        list = list.filter(function(d) {
          const s = (d.healthScores && d.healthScores.length > 0) ? d.healthScores[0].score : 100;
          return s >= 50 && s < 80;
        });
      } else if (healthFilter === 'CRITICAL') {
        list = list.filter(function(d) {
          const s = (d.healthScores && d.healthScores.length > 0) ? d.healthScores[0].score : 100;
          return s < 50;
        });
      }

      if (alertsFilter === 'WITH_ALERTS') {
        list = list.filter(function(d) {
          return (currentAlerts || []).some(function(a) {
            return (a.deviceId === d.id || (a.device && a.device.id === d.id)) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
          });
        });
      } else if (alertsFilter === 'NO_ALERTS') {
        list = list.filter(function(d) {
          return !(currentAlerts || []).some(function(a) {
            return (a.deviceId === d.id || (a.device && a.device.id === d.id)) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
          });
        });
      }

      if (rebootFilter === 'PENDING') {
        list = list.filter(function(d) {
          const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
          return inv && inv.security && inv.security.rebootRequired;
        });
      }

      if (query) {
        list = list.filter(function(d) {
          const host = (d.hostname || '').toLowerCase();
          const ip = (d.ipAddress || '').toLowerCase();
          const cust = (d.customer ? d.customer.name : '').toLowerCase();
          return host.includes(query) || ip.includes(query) || cust.includes(query);
        });
      }

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px;">' +
          'No se encontraron equipos para los criterios seleccionados.' +
        '</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(function(d) {
        const isOnline = d.status === 'ONLINE';
        const host = d.hostname || 'Equipo';
        const custName = d.customer ? d.customer.name : '-';
        const siteName = d.site ? d.site.name : 'Principal';
        
        const cpuVal = getDeviceMetricsCpu(d);
        const ramVal = getDeviceMetricsRam(d);
        const cpu = cpuVal != null ? Math.round(cpuVal) + '%' : '--';
        const ram = ramVal != null ? Math.round(ramVal) + '%' : '--';
        
        const hs = getDeviceHealthScore(d);
        const hsStr = hs != null ? hs : '--';
        const hsClass = hs != null ? (hs >= 80 ? 'status-online' : (hs >= 50 ? 'status-warning' : 'status-danger')) : 'status-info';

        const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
        const sec = inv ? inv.security : null;
        const winUp = inv ? inv.windowsUpdate : null;
        const rebootReq = winUp ? (winUp.rebootPending ?? false) : (sec ? sec.rebootRequired : false);
        const defenderOn = sec ? (sec.defenderActive ?? (sec.antivirus ? sec.antivirus.realTimeProtection : false)) : false;

        // Alerts count for this device
        const devAlerts = (currentAlerts || []).filter(function(a) {
          return (a.deviceId === d.id || (a.device && a.device.id === d.id)) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
        });
        const critAlerts = devAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;

        const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('es-AR') : 'Nunca';

        return '<tr>' +
          '<td>' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
              '<span style="font-size: 14px;">💻</span>' +
              '<strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">' + host + '</strong>' +
            '</div>' +
          '</td>' +
          '<td><span style="color: var(--text-secondary);">' + custName + '</span> <span style="font-size: 11px; color: var(--text-muted);">(' + siteName + ')</span></td>' +
          '<td><span class="status-pill ' + (isOnline ? 'status-online' : 'status-offline') + '">' + (isOnline ? 'ONLINE' : 'OFFLINE') + '</span></td>' +
          '<td><span class="status-pill ' + hsClass + '">' + hsStr + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px;">' + cpu + ' / ' + ram + '</span></td>' +
          '<td><span class="code-badge">OK</span></td>' +
          '<td>' +
            (rebootReq ? '<span class="status-pill status-warning">⚠️ Reinicio</span>' : (defenderOn ? '<span class="status-pill status-online">Defender ON</span>' : '<span class="status-pill status-danger">Sin AV</span>')) +
          '</td>' +
          '<td>' +
            (devAlerts.length > 0
              ? '<span class="status-pill ' + (critAlerts > 0 ? 'status-danger' : 'status-warning') + '">' + devAlerts.length + ' Activas</span>'
              : '<span class="status-pill status-online">0</span>') +
          '</td>' +
          '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + lastSeen + '</span></td>' +
          '<td style="text-align: right;">' +
            '<button class="btn btn-primary btn-sm" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">Ver Equipo</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // ==========================================
    // DEVICE WORKSPACE (FICHA DEL EQUIPO)
    // ==========================================
    async function openDeviceWorkspace(deviceId) {
      selectedDeviceId = deviceId;
      deviceWorkspaceOrigin = currentActiveView;
      const d = (currentDevices || []).find(function(x) { return x.id === deviceId; });
      if (!d) {
        showToast('Equipo no encontrado en la memoria local', 'error');
        return;
      }
      selectedDevice = d;

      switchNavTab('device-detail');

      // 1. Header Banner Info
      setVal('dHostname', d.hostname || 'Equipo');
      const isOnline = d.status === 'ONLINE';
      const statusPill = document.getElementById('dStatusPill');
      if (statusPill) {
        statusPill.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
        statusPill.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      }

      setVal('dCustomerBadge', d.customer ? d.customer.name : 'NanoLabs');
      setVal('dSiteBadge', d.site ? d.site.name : 'Principal');

      const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
      const hw = inv && inv.hardware ? inv.hardware : {};
      const cpuObj = hw.cpu || {};
      const ramObj = hw.ram || {};
      const sec = inv ? inv.security : null;
      const winUp = inv ? inv.windowsUpdate : null;
      const net = inv ? inv.network : null;

      // IP
      const iface0 = (net && Array.isArray(net.interfaces) && net.interfaces.length > 0) ? net.interfaces[0] : null;
      const ip = d.ipAddress || (iface0 && Array.isArray(iface0.ipAddresses) && iface0.ipAddresses.length > 0 ? iface0.ipAddresses[0] : (iface0 ? iface0.ipAddress : null)) || (d.agent ? d.agent.lastIp : '127.0.0.1');
      setVal('dIpText', ip);

      // OS
      setVal('dOsText', d.osEdition || formatOsName(d.osVersion || (inv ? inv.osVersion : null)));

      // CPU Summary
      const cpuSummary = (cpuObj.name ? (cpuObj.name.split('@')[0] || cpuObj.name) : (d.cpuName || d.cpuModel || (inv ? inv.cpuModel : '-'))).trim();
      setVal('dCpuSummary', cpuSummary);

      // RAM Summary
      const ramTotalGb = ramObj.totalMb ? Math.round(ramObj.totalMb / 1024) + ' GB' : (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : (inv && inv.totalRamBytes ? Math.round(Number(inv.totalRamBytes) / (1024*1024*1024)) + ' GB' : '-'));
      setVal('dRamSummary', ramTotalGb);

      // Agent Version
      setVal('dAgentVersion', d.agentVersion || (d.agent ? d.agent.agentVersion : 'v0.1.0'));

      // 2. Metrics & Operational Cards
      const cpuVal = getDeviceMetricsCpu(d);
      const ramVal = getDeviceMetricsRam(d);
      setVal('dKpiCpuUsage', (cpuVal != null ? Math.round(cpuVal) : 0) + '% CPU');
      setVal('dKpiRamUsage', 'RAM: ' + (ramVal != null ? Math.round(ramVal) : 0) + '% en uso');

      // Storage
      const storageDisks = (inv && inv.storage && Array.isArray(inv.storage.disks)) ? inv.storage.disks :
        ((inv && inv.hardware && Array.isArray(inv.hardware.disks)) ? inv.hardware.disks :
        ((inv && Array.isArray(inv.volumes)) ? inv.volumes : []));
      const firstDisk = storageDisks.length > 0 ? storageDisks[0] : null;
      if (firstDisk) {
        const diskSize = firstDisk.sizeGb ? firstDisk.sizeGb + ' GB' : (firstDisk.totalBytes ? Math.round(Number(firstDisk.totalBytes)/(1024*1024*1024)) + ' GB' : 'Disco');
        setVal('dKpiDiskFree', diskSize + ' (' + (firstDisk.mediaType || firstDisk.interface || 'Almacenamiento') + ')');
        setVal('dKpiSmartStatus', 'SMART: ' + (firstDisk.healthStatus || firstDisk.operationalStatus || 'Operativo'));
      } else {
        setVal('dKpiDiskFree', 'Almacenamiento OK');
        setVal('dKpiSmartStatus', 'Sin detalles de disco');
      }

      // Security
      const defenderOn = sec ? (sec.defenderActive ?? (sec.antivirus ? sec.antivirus.realTimeProtection : false)) : false;
      const firewallOn = sec ? (sec.firewallActive ?? (sec.firewall ? sec.firewall.domain : true)) : true;
      const rebootRequired = winUp ? (winUp.rebootPending ?? false) : (sec ? sec.rebootRequired : false);
      const rebootReason = winUp && winUp.rebootReason ? winUp.rebootReason : '';
      setVal('dKpiSecurityStatus', (defenderOn && firewallOn) ? 'Protegido' : (defenderOn ? 'Firewall a revisar' : 'Sin AV Residente'));
      setVal('dKpiRebootStatus', rebootRequired ? '⚠️ Reinicio Pendiente' : 'Sin reinicio pendiente');

      const devAlerts = (currentAlerts || []).filter(function(a) {
        return (a.deviceId === d.id || (a.device && a.device.id === d.id)) && (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED');
      });
      const critCount = devAlerts.filter(function(a) { return a.severity === 'CRITICAL'; }).length;
      setVal('dKpiAlertsActive', devAlerts.length);
      setVal('dKpiAlertsDetail', critCount + ' Críticas');

      // 3. Prioritary "REQUIERE ATENCIÓN" Block
      const attBox = document.getElementById('dAttentionBox');
      const attItems = document.getElementById('dAttentionItems');
      if (attBox && attItems) {
        const issues = [];
        if (!isOnline) issues.push('🔌 Telemetría interrumpida (Equipo desconectado)');
        if (rebootRequired) issues.push('🔄 Reinicio pendiente del sistema' + (rebootReason ? ' (' + rebootReason + ')' : ''));
        if (!defenderOn) issues.push('🛡️ Windows Defender protección en tiempo real desactivada');
        if (!firewallOn) issues.push('🔥 Firewall de Windows desactivado');
        if (firstDisk && firstDisk.healthStatus && !firstDisk.healthStatus.toLowerCase().includes('health')) {
          issues.push('💾 SMART alerta en disco: ' + firstDisk.healthStatus);
        }
        if (critCount > 0) issues.push('🚨 ' + critCount + ' Alertas críticas activas');

        if (issues.length > 0) {
          attBox.style.display = 'flex';
          attItems.innerHTML = issues.map(function(iss) {
            return '<span class="attention-badge">' + iss + '</span>';
          }).join('');
        } else {
          attBox.style.display = 'none';
        }
      }

      // 4. Health Score & Penalties
      renderDeviceHealthDiagnostic(d);

      // 5. Populate All Subtabs
      renderDevicePerformanceSubtab(d);
      renderDeviceHardwareSubtab(d);
      renderDeviceStorageSubtab(d);
      renderDeviceNetworkSubtab(d);
      renderDeviceSecuritySubtab(d);
      renderDeviceSoftwareSubtab(d);
      renderDeviceEventsSubtab(d);
      renderDeviceAlertsSubtab(d);
      renderDeviceAgentSubtab(d);

      switchDeviceSubTab('resumen');

      // 6. Asynchronous Deep Fetch (Full metrics history, full inventories, software & events)
      try {
        let token = localStorage.getItem('nl_token');
        if (!token) return;
        fetch('/api/v1/devices/' + deviceId, {
          headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        }).then(function(res) {
          if (!res.ok) return null;
          return res.json();
        }).then(function(json) {
          if (json && json.data && selectedDeviceId === deviceId) {
            selectedDevice = json.data;
            const idx = (currentDevices || []).findIndex(function(x) { return x.id === deviceId; });
            if (idx >= 0) currentDevices[idx] = json.data;
            renderDeviceHealthDiagnostic(json.data);
            renderDevicePerformanceSubtab(json.data);
            renderDeviceHardwareSubtab(json.data);
            renderDeviceStorageSubtab(json.data);
            renderDeviceNetworkSubtab(json.data);
            renderDeviceSecuritySubtab(json.data);
            renderDeviceSoftwareSubtab(json.data);
            renderDeviceEventsSubtab(json.data);
            renderDeviceAlertsSubtab(json.data);
            renderDeviceAgentSubtab(json.data);
          }
        }).catch(function(e) {
          console.warn('Deep telemetry fetch:', e);
        });
      } catch (e) {
        // silent fallback
      }
    }

    let cachedDeviceActions = [];
    let actionsAutoRefreshTimer = null;

    function switchDeviceSubTab(tab) {
      const tabs = ['resumen', 'rendimiento', 'hardware', 'discos', 'red', 'seguridad', 'software', 'eventos', 'alertas', 'agente', 'acciones'];
      tabs.forEach(function(t) {
        const btn = document.getElementById('dTab' + t.charAt(0).toUpperCase() + t.slice(1));
        const view = document.getElementById('dView' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tab);
        if (view) view.style.display = (t === tab) ? 'flex' : 'none';
      });
      if (tab === 'acciones') {
        loadCurrentDeviceActions();
      } else {
        stopActionsAutoRefresh();
      }
    }

    function stopActionsAutoRefresh() {
      if (actionsAutoRefreshTimer) {
        clearTimeout(actionsAutoRefreshTimer);
        actionsAutoRefreshTimer = null;
      }
    }

    async function loadCurrentDeviceActions() {
      if (!selectedDeviceId) return;
      const tbody = document.getElementById('dActionsTableBody');
      const token = localStorage.getItem('nl_token');
      if (!token) return;

      try {
        const res = await fetch('/api/v1/devices/' + selectedDeviceId + '/actions?limit=50', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 24px;">Error al cargar acciones</td></tr>';
          return;
        }
        const json = await res.json();
        const actions = (json && json.data) || [];
        cachedDeviceActions = actions;

        const countBadge = document.getElementById('dCountAcciones');
        if (countBadge) countBadge.textContent = actions.length;

        if (!tbody) return;

        if (actions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">No se han ejecutado acciones remotas en este equipo aún.</td></tr>';
          stopActionsAutoRefresh();
          return;
        }

        tbody.innerHTML = actions.map(function(act) {
          let statusBadge = '';
          switch (act.status) {
            case 'PENDING':
              statusBadge = '<span class="status-pill status-warning">⏳ PENDIENTE</span>';
              break;
            case 'QUEUED':
              statusBadge = '<span class="status-pill status-info">📥 EN COLA</span>';
              break;
            case 'DELIVERED':
              statusBadge = '<span class="status-pill status-info">📦 ENTREGADA</span>';
              break;
            case 'RUNNING':
              statusBadge = '<span class="status-pill" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">⚙️ EJECUTANDO</span>';
              break;
            case 'SUCCESS':
              statusBadge = '<span class="status-pill status-online">✅ EXITOSA</span>';
              break;
            case 'FAILED':
              statusBadge = '<span class="status-pill status-danger">❌ FALLIDA</span>';
              break;
            case 'EXPIRED':
              statusBadge = '<span class="status-pill status-offline">⏱️ EXPIRADA</span>';
              break;
            case 'CANCELLED':
              statusBadge = '<span class="status-pill status-offline">🚫 CANCELADA</span>';
              break;
            default:
              statusBadge = '<span class="status-pill status-offline">' + act.status + '</span>';
          }

          let durationStr = '-';
          if (act.startedAt && act.finishedAt) {
            const ms = new Date(act.finishedAt).getTime() - new Date(act.startedAt).getTime();
            durationStr = ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
          } else if (act.finishedAt) {
            durationStr = new Date(act.finishedAt).toLocaleTimeString();
          } else if (act.status === 'RUNNING') {
            durationStr = 'En curso...';
          }

          const requestedAtStr = act.requestedAt ? new Date(act.requestedAt).toLocaleString() : '-';
          const exitCodeStr = act.exitCode !== null && act.exitCode !== undefined ? act.exitCode : '-';

          let opsHtml = '<div style="display: flex; gap: 6px; justify-content: flex-end;">';
          if (act.output || act.error) {
            opsHtml += '<button class="btn btn-secondary btn-sm" onclick="showActionOutputModal(\\'' + act.id + '\\')">📋 Salida</button>';
          }
          if (act.status === 'PENDING' || act.status === 'QUEUED' || act.status === 'DELIVERED') {
            opsHtml += '<button class="btn btn-sm" style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3);" onclick="cancelDeviceAction(\\'' + act.id + '\\')">Cancelar</button>';
          }
          opsHtml += '</div>';

          return '<tr>' +
            '<td><strong style="color: #fff;">' + formatActionTypeName(act.actionType) + '</strong>' +
              (act.parameters && Object.keys(act.parameters).length > 0 ? '<div style="font-size: 11px; color: var(--text-secondary); font-family: monospace;">' + JSON.stringify(act.parameters) + '</div>' : '') +
            '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td><span style="color: var(--text-secondary); font-size: 12px;">' + (act.requestedBy || 'Operador') + '</span></td>' +
            '<td><span style="font-size: 12px; color: var(--text-muted);">' + requestedAtStr + '</span></td>' +
            '<td><span style="font-size: 12px; color: #fff;">' + durationStr + '</span></td>' +
            '<td><span class="code-badge">' + exitCodeStr + '</span></td>' +
            '<td style="text-align: right;">' + opsHtml + '</td>' +
          '</tr>';
        }).join('');

        // If any action is pending, queued, delivered or running, auto-refresh in 3s
        const hasActiveActions = actions.some(function(a) {
          return a.status === 'PENDING' || a.status === 'QUEUED' || a.status === 'DELIVERED' || a.status === 'RUNNING';
        });

        stopActionsAutoRefresh();
        if (hasActiveActions) {
          actionsAutoRefreshTimer = setTimeout(loadCurrentDeviceActions, 3000);
        }
      } catch (err) {
        console.error('Failed to load device actions:', err);
      }
    }

    function formatActionTypeName(type) {
      switch (type) {
        case 'REBOOT_DEVICE': return '🔄 Reiniciar Dispositivo';
        case 'SHUTDOWN_DEVICE': return '🛑 Apagar Dispositivo';
        case 'FORCE_HEARTBEAT': return '💓 Forzar Heartbeat';
        case 'FORCE_METRICS': return '📈 Forzar Métricas';
        case 'FORCE_SECURITY_SCAN': return '🛡️ Forzar Seguridad';
        case 'FORCE_INVENTORY': return '📦 Forzar Inventario';
        case 'FORCE_SMART_CHECK': return '💾 Forzar SMART';
        case 'FORCE_WINDOWS_UPDATE': return '🪟 Forzar Windows Update';
        case 'DEFENDER_UPDATE_SIGNATURES': return '📥 Actualizar Defender';
        case 'DEFENDER_QUICK_SCAN': return '⚡ Quick Scan Defender';
        case 'DEFENDER_FULL_SCAN': return '🔍 Full Scan Defender';
        case 'FLUSH_DNS': return '🧹 Flush DNS';
        case 'RENEW_DHCP': return '🔄 Renew DHCP';
        case 'WINDOWS_SFC_SCAN': return '📜 SFC /scannow';
        case 'WINDOWS_DISM_CHECK': return '🩺 DISM CheckHealth';
        case 'WINDOWS_CHKDSK_SCAN': return '🔍 CHKDSK Diagnóstico';
        case 'QUERY_SERVICES': return '📋 Consultar Servicios';
        case 'RESTART_SERVICE': return '🔧 Reiniciar Servicio';
        default: return type;
      }
    }

    async function triggerAction(actionType, parameters) {
      if (!selectedDeviceId) return;
      const token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }

      try {
        showToast('Encolando acción ' + actionType + '...', 'info');
        const res = await fetch('/api/v1/devices/' + selectedDeviceId + '/actions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            actionType: actionType,
            parameters: parameters || {},
            expiresInMinutes: 15
          })
        });

        const json = await res.json();
        if (!res.ok) {
          showToast(json.message || 'Error al ejecutar acción', 'error');
          return;
        }

        showToast('Acción encolada: ' + actionType, 'success');
        await loadCurrentDeviceActions();
      } catch (err) {
        showToast('Error de red al despachar acción', 'error');
      }
    }

    function confirmAndTriggerAction(actionType, actionLabel, isDestructive) {
      if (!selectedDevice) return;
      if (isDestructive) {
        const msg = '⚠️ ADVERTENCIA DE ACCIÓN CRÍTICA\n\n' +
          'Acción: ' + actionLabel + '\n' +
          'Dispositivo: ' + (selectedDevice.hostname || selectedDeviceId) + '\n\n' +
          'Esta operación afectará la operatividad del equipo de inmediato.\n' +
          '¿Está completamente seguro de que desea proceder?';
        if (!confirm(msg)) {
          return;
        }
      }
      triggerAction(actionType);
    }

    function triggerRestartSelectedService() {
      const select = document.getElementById('actionServiceSelect');
      const serviceName = select ? select.value : 'Spooler';
      if (!confirm('¿Desea reiniciar el servicio Windows "' + serviceName + '" en el equipo ' + (selectedDevice ? selectedDevice.hostname : '') + '?')) {
        return;
      }
      triggerAction('RESTART_SERVICE', { serviceName: serviceName });
    }

    async function cancelDeviceAction(actionId) {
      if (!selectedDeviceId) return;
      const token = localStorage.getItem('nl_token');
      if (!token) return;

      if (!confirm('¿Desea cancelar esta acción remota pendiente?')) return;

      try {
        const res = await fetch('/api/v1/devices/' + selectedDeviceId + '/actions/' + actionId + '/cancel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ reason: 'Cancelado manualmente por el operador' })
        });
        if (res.ok) {
          showToast('Acción cancelada con éxito');
          await loadCurrentDeviceActions();
        } else {
          const json = await res.json();
          showToast(json.message || 'Error al cancelar acción', 'error');
        }
      } catch (err) {
        showToast('Error de red al cancelar', 'error');
      }
    }

    function showActionOutputModal(actionId) {
      const act = cachedDeviceActions.find(function(x) { return x.id === actionId; });
      if (!act) return;

      const modal = document.getElementById('modalActionOutput');
      if (!modal) return;

      setVal('modalActionTitle', 'Salida: ' + formatActionTypeName(act.actionType));
      setVal('modalActionStatus', act.status);
      setVal('modalActionExitCode', act.exitCode !== null && act.exitCode !== undefined ? act.exitCode : 'N/A');

      let durationStr = '-';
      if (act.startedAt && act.finishedAt) {
        const ms = new Date(act.finishedAt).getTime() - new Date(act.startedAt).getTime();
        durationStr = ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
      }
      setVal('modalActionDuration', durationStr);

      const consoleEl = document.getElementById('modalActionConsole');
      if (consoleEl) {
        consoleEl.textContent = act.output || '(Sin salida de consola registrada)';
      }

      const errorBox = document.getElementById('modalActionErrorBox');
      const errorEl = document.getElementById('modalActionError');
      if (act.error) {
        if (errorBox) errorBox.style.display = 'flex';
        if (errorEl) errorEl.textContent = act.error;
      } else {
        if (errorBox) errorBox.style.display = 'none';
      }

      modal.style.display = 'flex';
    }

    function closeActionOutputModal() {
      const modal = document.getElementById('modalActionOutput');
      if (modal) modal.style.display = 'none';
    }


    function backFromDeviceWorkspace() {
      if (deviceWorkspaceOrigin === 'customer-detail' && currentActiveCustomerId) {
        switchNavTab('customer-detail');
      } else {
        switchNavTab('devices');
      }
    }

    function renderDeviceHealthDiagnostic(d) {
      const hsObj = (d.healthScores && d.healthScores.length > 0) ? d.healthScores[0] : null;
      const score = hsObj ? (hsObj.overall ?? hsObj.score ?? 85) : 85;
      setVal('hsScoreDisplay', score);

      const pill = document.getElementById('hsStatusPill');
      if (pill) {
        pill.className = 'health-score-pill ' + (score >= 80 ? 'status-online' : (score >= 50 ? 'status-warning' : 'status-danger'));
        pill.textContent = score >= 80 ? 'OPTIMO' : (score >= 50 ? 'REGULAR' : 'CRITICO');
      }

      // 6 Dimensions Grid
      const grid = document.getElementById('hsCategoriesGrid');
      if (grid) {
        const categories = [
          { name: 'Rendimiento', score: hsObj ? (hsObj.performance ?? 100) : 100 },
          { name: 'Almacenamiento', score: hsObj ? (hsObj.storage ?? 100) : 100 },
          { name: 'Seguridad', score: hsObj ? (hsObj.security ?? 80) : 80 },
          { name: 'Actualizaciones', score: hsObj ? (hsObj.updates ?? 85) : 85 },
          { name: 'Estabilidad', score: hsObj ? (hsObj.stability ?? 90) : 90 },
          { name: 'Hardware', score: hsObj ? (hsObj.hardware ?? 100) : 100 }
        ];

        grid.innerHTML = categories.map(function(c) {
          const color = c.score >= 80 ? 'var(--success)' : (c.score >= 50 ? 'var(--warning)' : 'var(--danger)');
          return '<div class="health-category-box">' +
            '<div class="health-cat-header">' +
              '<span>' + c.name + '</span>' +
              '<span style="color: #fff;">' + c.score + '%</span>' +
            '</div>' +
            '<div class="health-cat-bar">' +
              '<div class="health-cat-fill" style="width: ' + c.score + '%; background: ' + color + ';"></div>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      // Penalties List
      const penList = document.getElementById('hsPenaltiesList');
      const penCount = document.getElementById('hsPenaltiesCount');
      const penalties = (hsObj && Array.isArray(hsObj.penalties)) ? hsObj.penalties : [];
      if (penCount) penCount.textContent = penalties.length;

      if (penList) {
        if (penalties.length === 0) {
          penList.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px;">No se registraron penalizaciones en el último cálculo de salud. El equipo opera bajo los estándares recomendados.</div>';
        } else {
          penList.innerHTML = penalties.map(function(p) {
            return '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">' +
              '<div>' +
                '<strong style="color: #fff; font-size: 12px;">' + (p.reason || p.description || p.code || 'Penalización') + '</strong>' +
                '<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Categoría: ' + (p.category || 'General') + '</div>' +
              '</div>' +
              '<span class="status-pill status-danger">-' + (p.points || 10) + ' pts</span>' +
            '</div>';
          }).join('');
        }
      }
    }

    function togglePenaltiesDetails() {
      const panel = document.getElementById('hsPenaltiesPanel');
      if (panel) panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
    }

    async function recalculateCurrentDeviceHealth() {
      if (!selectedDevice) return;
      let token = localStorage.getItem('nl_token');
      if (!token) {
        showToast('Inicia sesión como administrador para recalcular la salud', 'warning');
        openLoginModal();
        return;
      }
      try {
        const res = await fetch('/api/v1/devices/' + selectedDevice.id + '/health', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          }
        });
        if (res.ok) {
          const json = await res.json();
          const newScore = json.data && json.data.current;
          if (newScore) {
            if (!selectedDevice.healthScores) selectedDevice.healthScores = [];
            selectedDevice.healthScores[0] = newScore;
            renderDeviceHealthDiagnostic(selectedDevice);
          }
          showToast('🛡️ Salud recalculada exitosamente');
          await fetchLiveDashboard(true);
        } else {
          showToast('No se pudo recalcular la salud', 'error');
        }
      } catch (err) {
        showToast('Error de red al recalcular salud', 'error');
      }
    }

    async function triggerDeviceAlertEvaluation() {
      if (!selectedDevice) return;
      let token = localStorage.getItem('nl_token');
      if (!token) {
        showToast('Inicia sesión como administrador para evaluar alertas', 'warning');
        openLoginModal();
        return;
      }
      try {
        const res = await fetch('/api/v1/alerts/evaluate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ deviceId: selectedDevice.id })
        });
        if (res.ok) {
          const json = await res.json();
          const d = json.data || {};
          showToast('⚡ Reglas evaluadas: +' + (d.created || 0) + ' nuevas, -' + (d.resolved || 0) + ' resueltas');
          await fetchLiveDashboard(true);
          if (selectedDeviceId) openDeviceWorkspace(selectedDeviceId);
        } else {
          showToast('Error al evaluar reglas del equipo', 'error');
        }
      } catch (err) {
        showToast('Error de conexión', 'error');
      }
    }

    // Subtab Renderers for Device Workspace
    function renderDevicePerformanceSubtab(d) {
      const c = document.getElementById('metricsChartContainer');
      if (!c) return;
      const metrics = (d.metrics && d.metrics.length > 0) ? d.metrics : [];
      if (metrics.length === 0) {
        c.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 32px;">No hay muestras de métricas registradas para este equipo.</div>';
        return;
      }

      const list = metrics.slice(0, 30).reverse();
      let cpuPoints = '';
      let ramPoints = '';

      function getMetricCpuVal(m) {
        if (!m) return 0;
        if (m.cpuPercent != null && !isNaN(m.cpuPercent)) return Number(m.cpuPercent);
        if (m.cpuUsage != null && !isNaN(m.cpuUsage)) return Number(m.cpuUsage);
        return 0;
      }

      function getMetricRamVal(m) {
        if (!m) return 0;
        if (m.ramUsedMB != null && m.ramAvailMB != null) {
          const tot = Number(m.ramUsedMB) + Number(m.ramAvailMB);
          return tot > 0 ? (Number(m.ramUsedMB) / tot) * 100 : 0;
        }
        if (m.ramUsage != null && !isNaN(m.ramUsage)) return Number(m.ramUsage);
        return 0;
      }

      if (list.length === 1) {
        const cpuY = Math.max(5, Math.min(95, 100 - getMetricCpuVal(list[0])));
        const ramY = Math.max(5, Math.min(95, 100 - getMetricRamVal(list[0])));
        cpuPoints = '0,' + cpuY + ' 500,' + cpuY;
        ramPoints = '0,' + ramY + ' 500,' + ramY;
      } else {
        const maxIdx = list.length - 1;
        cpuPoints = list.map(function(m, idx) {
          const x = Math.round((idx / maxIdx) * 500);
          const y = Math.max(5, Math.min(95, 100 - getMetricCpuVal(m)));
          return x + ',' + y;
        }).join(' ');

        ramPoints = list.map(function(m, idx) {
          const x = Math.round((idx / maxIdx) * 500);
          const y = Math.max(5, Math.min(95, 100 - getMetricRamVal(m)));
          return x + ',' + y;
        }).join(' ');
      }

      const latest = list[list.length - 1];
      const latestCpu = Math.round(getMetricCpuVal(latest));
      const latestRam = Math.round(getMetricRamVal(latest));

      c.innerHTML = 
        '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px;">' +
          '<div style="display: flex; gap: 20px;">' +
            '<span style="color: #60a5fa; font-weight: 600;">● CPU: ' + latestCpu + '%</span>' +
            '<span style="color: #34d399; font-weight: 600;">● RAM: ' + latestRam + '%</span>' +
          '</div>' +
          '<span style="color: var(--text-muted); font-size: 11px;">Muestras recientes: ' + list.length + ' puntos</span>' +
        '</div>' +
        '<div style="position: relative; width: 100%; height: 160px; background: rgba(0,0,0,0.25); border-radius: var(--radius-md); border: 1px solid var(--border-subtle); padding: 10px; box-sizing: border-box;">' +
          '<svg viewBox="0 0 500 100" preserveAspectRatio="none" style="width: 100%; height: 100%; overflow: visible;">' +
            '<line x1="0" y1="20" x2="500" y2="20" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />' +
            '<line x1="0" y1="50" x2="500" y2="50" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />' +
            '<line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4" />' +
            '<polyline fill="none" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + cpuPoints + '" />' +
            '<polyline fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="' + ramPoints + '" />' +
          '</svg>' +
        '</div>';
    }

    function renderDeviceHardwareSubtab(d) {
      const g = document.getElementById('dHardwareGrid');
      if (!g) return;
      const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
      const hw = inv && inv.hardware ? inv.hardware : {};
      const cpuObj = hw.cpu || {};
      const ramObj = hw.ram || {};

      const cpuName = (cpuObj.name || d.cpuName || (inv ? inv.cpuModel : null) || d.cpuModel || '-').trim();
      const cpuCores = cpuObj.cores ? (cpuObj.cores + ' Físicos / ' + (cpuObj.logicalCores || cpuObj.cores) + ' Lógicos') : (d.cpuCores ? d.cpuCores + ' Núcleos' : (inv && inv.cpuCores ? inv.cpuCores + ' Núcleos' : '-'));
      const ramTotal = ramObj.totalMb ? Math.round(ramObj.totalMb / 1024) + ' GB' : (d.ramTotalMB ? Math.round(d.ramTotalMB / 1024) + ' GB' : (inv && inv.totalRamBytes ? Math.round(Number(inv.totalRamBytes) / (1024*1024*1024)) + ' GB' : '-'));
      const osName = d.osEdition || formatOsName(d.osVersion || (inv ? inv.osVersion : null));
      const manufacturer = d.manufacturer || hw.manufacturer || (inv ? inv.manufacturer : 'Ensamblado / OEM');
      const model = d.model || hw.model || (inv ? inv.model : 'Genérico');
      const uptime = formatUptime(d.uptimeSeconds || (d.metrics && d.metrics[0] ? d.metrics[0].uptimeSeconds : null));

      const props = [
        { label: 'Hostname / Nombre de Red', val: d.hostname || '-' },
        { label: 'Sistema Operativo', val: osName },
        { label: 'Procesador (CPU)', val: cpuName },
        { label: 'Núcleos de Procesador', val: cpuCores },
        { label: 'Memoria RAM Instalada', val: ramTotal },
        { label: 'Número de Serie (BIOS)', val: d.serialNumber || (inv ? inv.biosSerial : '-') },
        { label: 'Fabricante de Hardware', val: manufacturer },
        { label: 'Modelo del Equipo / Motherboard', val: model },
        { label: 'Tiempo de Actividad (Uptime)', val: uptime }
      ];

      g.innerHTML = props.map(function(p) {
        return '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">' +
          '<div style="font-size: 11px; color: var(--text-muted); font-weight: 600;">' + p.label + '</div>' +
          '<div style="font-size: 13px; color: #fff; font-weight: 600; margin-top: 4px;" class="code-font">' + p.val + '</div>' +
        '</div>';
      }).join('');
    }

    function renderDeviceStorageSubtab(d) {
      const l = document.getElementById('dVolumesList');
      if (!l) return;
      const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
      const storageDisks = (inv && inv.storage && Array.isArray(inv.storage.disks)) ? inv.storage.disks :
        ((inv && inv.hardware && Array.isArray(inv.hardware.disks)) ? inv.hardware.disks :
        ((inv && Array.isArray(inv.volumes)) ? inv.volumes : []));

      if (storageDisks.length === 0) {
        l.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">No se registraron unidades de disco en el último inventario.</div>';
        return;
      }

      l.innerHTML = storageDisks.map(function(disk) {
        const name = disk.friendlyName || disk.model || disk.mountPoint || 'Unidad de Almacenamiento';
        const size = disk.sizeGb ? disk.sizeGb + ' GB' : (disk.totalBytes ? Math.round(Number(disk.totalBytes)/(1024*1024*1024)) + ' GB' : '-');
        const media = disk.mediaType || disk.busType || disk.interface || 'Disco';
        const health = disk.healthStatus || disk.operationalStatus || 'Healthy';
        const isHealthy = health.toLowerCase().includes('health') || health.toLowerCase().includes('ok');

        return '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px 18px; display: flex; flex-direction: column; gap: 8px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<div><strong style="color: #fff; font-size: 14px;">' + name + '</strong> <span style="font-size: 12px; color: var(--text-muted);">(' + media + ')</span></div>' +
            '<span class="status-pill ' + (isHealthy ? 'status-online' : 'status-danger') + '">SMART: ' + health + '</span>' +
          '</div>' +
          '<div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">' +
            '<span>Capacidad: <strong style="color: #fff;">' + size + '</strong></span>' +
            '<span>Tipo de bus: <strong style="color: #60a5fa;">' + (disk.busType || disk.interface || 'SATA/NVMe') + '</strong></span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    function renderDeviceNetworkSubtab(d) {
      const tb = document.getElementById('dNetworkTableBody');
      if (!tb) return;
      const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
      const ifaces = (inv && inv.network && Array.isArray(inv.network.interfaces)) ? inv.network.interfaces :
        ((inv && Array.isArray(inv.networkInterfaces)) ? inv.networkInterfaces : []);

      if (ifaces.length === 0) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay adaptadores de red registrados.</td></tr>';
        return;
      }

      tb.innerHTML = ifaces.map(function(iface) {
        const ip = (Array.isArray(iface.ipAddresses) && iface.ipAddresses.length > 0) ? iface.ipAddresses[0] : (iface.ipAddress || '-');
        const dhcp = iface.dhcp != null ? (iface.dhcp ? 'Sí (Dinámica)' : 'No (Estática)') : (iface.dhcpEnabled ? 'Sí (Dinámica)' : 'No (Estática)');
        const speed = iface.speed || iface.description || '1 Gbps';
        const isConn = (iface.status || '').toLowerCase() !== 'disconnected';

        return '<tr>' +
          '<td><strong style="color: #fff;">' + (iface.name || 'Ethernet') + '</strong></td>' +
          '<td><span class="code-font" style="color: #60a5fa;">' + ip + '</span></td>' +
          '<td><span class="code-font">' + speed + '</span></td>' +
          '<td><span class="code-font" style="color: var(--text-muted);">' + (iface.macAddress || '-') + '</span></td>' +
          '<td>' + dhcp + '</td>' +
          '<td><span class="code-font">' + (iface.gateway || '-') + '</span></td>' +
          '<td><span class="status-pill ' + (isConn ? 'status-online' : 'status-danger') + '">' + (iface.status || 'Conectado') + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function renderDeviceSecuritySubtab(d) {
      const g = document.getElementById('dSecurityGrid');
      if (!g) return;
      const inv = d.inventories && d.inventories.length > 0 ? d.inventories[0] : null;
      const sec = inv ? inv.security : null;
      const winUp = inv ? inv.windowsUpdate : null;

      const avName = (sec && sec.antivirusList && sec.antivirusList.length > 0 && sec.antivirusList[0].displayName)
        ? sec.antivirusList[0].displayName
        : 'Windows Defender Antivirus';
      const avOn = sec ? (
        sec.defenderActive === true ||
        (Array.isArray(sec.antivirusList) && sec.antivirusList.some(function(a){ return a.enabled; })) ||
        (sec.antivirus ? sec.antivirus.realTimeProtection : false)
      ) : false;

      const fwProfiles = sec && sec.firewallProfiles ? sec.firewallProfiles : null;
      const fwOn = fwProfiles
        ? (fwProfiles.domain && fwProfiles.private && fwProfiles.public)
        : (sec ? (sec.firewallActive ?? true) : true);

      const fwProfilesHtml = fwProfiles
        ? '<div style="display: flex; gap: 8px; margin-top: 6px; font-size: 11px;">' +
            '<span class="status-pill ' + (fwProfiles.domain ? 'status-online' : 'status-danger') + '">Dominio: ' + (fwProfiles.domain ? 'ON' : 'OFF') + '</span>' +
            '<span class="status-pill ' + (fwProfiles.private ? 'status-online' : 'status-danger') + '">Privado: ' + (fwProfiles.private ? 'ON' : 'OFF') + '</span>' +
            '<span class="status-pill ' + (fwProfiles.public ? 'status-online' : 'status-danger') + '">Público: ' + (fwProfiles.public ? 'ON' : 'OFF') + '</span>' +
          '</div>'
        : '';

      const reboot = winUp ? (winUp.rebootPending ?? false) : (sec ? sec.rebootRequired : false);
      const rebootReason = winUp && winUp.rebootReason ? winUp.rebootReason : (reboot ? 'Actualizaciones acumulativas pendientes' : 'No hay parches o instalaciones pendientes de reinicio.');

      g.innerHTML = 
        '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<strong style="color: #fff; font-size: 13px;">' + avName + '</strong>' +
            '<span class="status-pill ' + (avOn ? 'status-online' : 'status-danger') + '">' + (avOn ? 'Activo' : 'Desactivado') + '</span>' +
          '</div>' +
          '<div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">Protección en tiempo real contra amenazas y malware. ' + (avOn ? 'El servicio monitorea el sistema.' : '⚠️ Se recomienda reactivar la protección residente.') + '</div>' +
        '</div>' +

        '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<strong style="color: #fff; font-size: 13px;">Firewall de Windows</strong>' +
            '<span class="status-pill ' + (fwOn ? 'status-online' : 'status-danger') + '">' + (fwOn ? 'Activo' : 'Desactivado') + '</span>' +
          '</div>' +
          '<div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">Filtrado de puertos y paquetes entrantes en perfiles de red.</div>' +
          fwProfilesHtml +
        '</div>' +

        '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">' +
          '<div style="display: flex; justify-content: space-between; align-items: center;">' +
            '<strong style="color: #fff; font-size: 13px;">Reinicio del Sistema (Windows Update)</strong>' +
            '<span class="status-pill ' + (reboot ? 'status-warning' : 'status-online') + '">' + (reboot ? 'Reinicio Pendiente' : 'Al día') + '</span>' +
          '</div>' +
          '<div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">' + rebootReason + '</div>' +
        '</div>';
    }

    function renderDeviceSoftwareSubtab(d) {
      const tb = document.getElementById('dSoftwareTableBody');
      const countEl = document.getElementById('dCountSoftware');
      if (!tb) return;
      const sinv = d.softwareInventories && d.softwareInventories.length > 0 ? d.softwareInventories[0] : null;
      const items = sinv ? (Array.isArray(sinv.software) ? sinv.software : (Array.isArray(sinv.items) ? sinv.items : [])) : [];
      cachedSoftwareList = items;
      if (countEl) countEl.textContent = items.length;

      filterSoftwareTable('');
    }

    function filterSoftwareTable(query) {
      const tb = document.getElementById('dSoftwareTableBody');
      if (!tb) return;
      query = (query || '').toLowerCase().trim();
      let list = cachedSoftwareList || [];

      if (query) {
        list = list.filter(function(s) {
          return (s.name || '').toLowerCase().includes(query) || (s.publisher || '').toLowerCase().includes(query);
        });
      }

      if (list.length === 0) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">No se encontraron programas instalados.</td></tr>';
        return;
      }

      tb.innerHTML = list.slice(0, 100).map(function(s) {
        return '<tr>' +
          '<td><strong style="color: #fff;">' + (s.name || 'Aplicación') + '</strong></td>' +
          '<td><span class="code-font" style="color: #60a5fa;">' + (s.version || '-') + '</span></td>' +
          '<td>' + (s.publisher || '-') + '</td>' +
          '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + (s.installDate || '-') + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function renderDeviceEventsSubtab(d) {
      const tb = document.getElementById('dEventsTableBody');
      if (!tb) return;
      const events = (d.events && Array.isArray(d.events)) ? d.events : [];

      if (events.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No hay eventos recientes registrados.</td></tr>';
        return;
      }

      tb.innerHTML = events.slice(0, 30).map(function(ev) {
        const isCrit = ev.severity === 'CRITICAL' || ev.severity === 'ERROR';
        const isWarn = ev.severity === 'WARNING';
        const sevClass = isCrit ? 'status-danger' : (isWarn ? 'status-warning' : 'status-info');
        const desc = ev.description || ev.title || ev.message || '-';
        const provider = ev.source || ev.provider || ev.category || 'Sistema';

        return '<tr>' +
          '<td><span class="status-pill ' + sevClass + '">' + (ev.severity || 'INFO') + '</span></td>' +
          '<td><strong style="color: #fff;">' + provider + '</strong></td>' +
          '<td><span class="code-badge">' + (ev.eventId || '-') + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + (ev.timestamp ? new Date(ev.timestamp).toLocaleString('es-AR') : '-') + '</span></td>' +
          '<td><span style="font-size: 12px; color: var(--text-secondary);">' + desc + '</span></td>' +
        '</tr>';
      }).join('');
    }

    function renderDeviceAlertsSubtab(d) {
      const tb = document.getElementById('dAlertsTableBody');
      const countEl = document.getElementById('dCountAlertas');
      if (!tb) return;

      const devAlerts = (currentAlerts || []).filter(function(a) {
        return (a.deviceId === d.id || (a.device && a.device.id === d.id));
      });
      if (countEl) countEl.textContent = devAlerts.filter(function(a) { return a.status === 'OPEN' || a.status === 'ACKNOWLEDGED'; }).length;

      if (devAlerts.length === 0) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">No se registran alertas para este equipo.</td></tr>';
        return;
      }

      tb.innerHTML = devAlerts.map(function(a) {
        const isCrit = a.severity === 'CRITICAL';
        const isHigh = a.severity === 'HIGH';
        const sevClass = isCrit ? 'status-danger' : (isHigh ? 'status-warning' : 'status-info');

        return '<tr>' +
          '<td><span class="status-pill ' + sevClass + '">' + a.severity + '</span></td>' +
          '<td><strong style="color: #fff;">' + (a.title || 'Alerta') + '</strong></td>' +
          '<td><span class="code-badge">x' + (a.occurrences || 1) + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px;">' + (a.firstSeenAt ? new Date(a.firstSeenAt).toLocaleString('es-AR') : '-') + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px; color: #38bdf8;">' + (a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('es-AR') : '-') + '</span></td>' +
          '<td><span class="status-pill ' + (a.status === 'RESOLVED' ? 'status-online' : 'status-danger') + '">' + a.status + '</span></td>' +
          '<td style="text-align: right;"><button class="btn btn-secondary btn-sm" onclick="openAlertDetailModal(\\'' + a.id + '\\')">Detalle</button></td>' +
        '</tr>';
      }).join('');
    }

    function renderDeviceAgentSubtab(d) {
      const g = document.getElementById('dAgentMetaGrid');
      if (!g) return;
      const agent = d.agent || {};

      g.innerHTML = 
        '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">' +
          '<div style="font-size: 11px; color: var(--text-muted);">Versión del Agente</div>' +
          '<div style="font-size: 14px; font-weight: 700; color: #60a5fa;" class="code-font">' + (d.agentVersion || agent.agentVersion || 'v0.1.0') + '</div>' +
        '</div>' +

        '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">' +
          '<div style="font-size: 11px; color: var(--text-muted);">Estado del Agente</div>' +
          '<div style="font-size: 14px; font-weight: 700; color: var(--success);">' + (d.status === 'ONLINE' ? 'Activo / Reportando' : 'Sin conexión') + '</div>' +
        '</div>' +

        '<div style="background: var(--bg-surface-subtle); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">' +
          '<div style="font-size: 11px; color: var(--text-muted);">Último Heartbeat</div>' +
          '<div style="font-size: 12px; color: #fff;" class="code-font">' + (d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('es-AR') : 'Nunca') + '</div>' +
        '</div>';

      // Move Customer Dropdown
      const sel = document.getElementById('moveCustomerSelect');
      if (sel) {
        let html = '';
        (currentCustomers || []).forEach(function(c) {
          const isCurrent = (d.customer && d.customer.id === c.id) || d.customerId === c.id;
          html += '<option value="' + c.id + '"' + (isCurrent ? ' selected' : '') + '>' + c.name + ' (' + c.code + ')' + (isCurrent ? ' (Actual)' : '') + '</option>';
        });
        sel.innerHTML = html;
      }
    }

    async function handleMoveDevice() {
      if (!selectedDevice) return;
      const sel = document.getElementById('moveCustomerSelect');
      if (!sel) return;
      const targetCustId = sel.value;
      if (!targetCustId) return;

      let token = localStorage.getItem('nl_token');
      if (!token) {
        showToast('Inicia sesión para reasignar equipos', 'warning');
        openLoginModal();
        return;
      }

      try {
        const res = await fetch('/api/v1/devices/' + selectedDevice.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ customerId: targetCustId })
        });
        if (res.ok) {
          showToast('✅ Equipo reasignado con éxito');
          await fetchLiveDashboard(false);
          openDeviceWorkspace(selectedDevice.id);
        } else {
          showToast('Error al reasignar equipo', 'error');
        }
      } catch (err) {
        showToast('Error de red al reasignar equipo', 'error');
      }
    }

    function copyDeviceDiagnostic() {
      if (!selectedDevice) return;
      const str = JSON.stringify(selectedDevice, null, 2);
      navigator.clipboard.writeText(str).then(function() {
        showToast('Diagnóstico JSON copiado al portapapeles');
      }).catch(function() {
        prompt('Diagnóstico JSON:', str);
      });
    }

    // ==========================================
    // AGENTS & ENROLLMENT WIZARD
    // ==========================================
    function switchAgentsTab(tab) {
      const btnList = document.getElementById('btnTabAgentsList');
      const btnEnroll = document.getElementById('btnTabAgentsEnroll');
      const viewList = document.getElementById('agentsListView');
      const viewEnroll = document.getElementById('agentsEnrollView');

      if (btnList) btnList.className = 'btn btn-sm ' + (tab === 'list' ? 'btn-primary' : 'btn-secondary');
      if (btnEnroll) btnEnroll.className = 'btn btn-sm ' + (tab === 'enroll' ? 'btn-primary' : 'btn-secondary');

      if (viewList) viewList.style.display = (tab === 'list') ? 'flex' : 'none';
      if (viewEnroll) viewEnroll.style.display = (tab === 'enroll') ? 'flex' : 'none';
    }

    function renderAgentsList() {
      const tb = document.getElementById('agentsTableBody');
      const totalBadge = document.getElementById('agentsTotalBadge');
      if (!tb) return;

      const devices = currentDevices || [];
      if (totalBadge) totalBadge.textContent = devices.length + ' Agentes Registrados';

      populateAgentsCustomerFilter();

      if (devices.length === 0) {
        tb.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No hay agentes enrolados todavía.</td></tr>';
        return;
      }

      tb.innerHTML = devices.map(function(d) {
        const isOnline = d.status === 'ONLINE';
        const host = d.hostname || 'Equipo';
        const custName = d.customer ? d.customer.name : '-';
        const siteName = d.site ? d.site.name : 'Principal';
        const ver = d.agentVersion || (d.agent ? d.agent.agentVersion : 'v0.1.0');
        const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('es-AR') : 'Nunca';

        return '<tr>' +
          '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">' + host + '</strong></td>' +
          '<td>' + custName + '</td>' +
          '<td>' + siteName + '</td>' +
          '<td><span class="code-badge">' + ver + '</span></td>' +
          '<td><span class="status-pill ' + (isOnline ? 'status-online' : 'status-offline') + '">' + (isOnline ? 'Conectado' : 'Desconectado') + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + lastSeen + '</span></td>' +
          '<td style="text-align: right;"><button class="btn btn-secondary btn-sm" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">Diagnóstico</button></td>' +
        '</tr>';
      }).join('');
    }

    function populateAgentsCustomerFilter() {
      const sel = document.getElementById('agentsFilterCustomer');
      if (!sel) return;
      const currentVal = sel.value;
      let html = '<option value="ALL">Todos los Clientes</option>';
      (currentCustomers || []).forEach(function(c) {
        html += '<option value="' + c.id + '"' + (currentVal === c.id ? ' selected' : '') + '>' + c.name + ' (' + c.code + ')</option>';
      });
      sel.innerHTML = html;
    }

    function filterAgentsByCustomer(custId) {
      // Re-filter agents table by customer
      const tb = document.getElementById('agentsTableBody');
      if (!tb) return;
      let devices = currentDevices || [];
      if (custId !== 'ALL') {
        devices = devices.filter(function(d) {
          return (d.customer && d.customer.id === custId) || d.customerId === custId;
        });
      }
      tb.innerHTML = devices.map(function(d) {
        const isOnline = d.status === 'ONLINE';
        const host = d.hostname || 'Equipo';
        const custName = d.customer ? d.customer.name : '-';
        const siteName = d.site ? d.site.name : 'Principal';
        const ver = d.agentVersion || 'v0.1.0';
        const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString('es-AR') : 'Nunca';

        return '<tr>' +
          '<td><strong class="code-font" style="color: #fff; cursor: pointer;" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">' + host + '</strong></td>' +
          '<td>' + custName + '</td>' +
          '<td>' + siteName + '</td>' +
          '<td><span class="code-badge">' + ver + '</span></td>' +
          '<td><span class="status-pill ' + (isOnline ? 'status-online' : 'status-offline') + '">' + (isOnline ? 'Conectado' : 'Desconectado') + '</span></td>' +
          '<td><span class="code-font" style="font-size: 11px; color: var(--text-muted);">' + lastSeen + '</span></td>' +
          '<td style="text-align: right;"><button class="btn btn-secondary btn-sm" onclick="openDeviceWorkspace(\\'' + d.id + '\\')">Diagnóstico</button></td>' +
        '</tr>';
      }).join('');
    }

    function populateWizardCustomerSelect() {
      const sel = document.getElementById('wCustSelect');
      if (!sel) return;
      let html = '<option value="">-- Elegir Cliente --</option>';
      (currentCustomers || []).forEach(function(c) {
        html += '<option value="' + c.id + '">' + c.name + ' (' + c.code + ')</option>';
      });
      sel.innerHTML = html;
    }

    function handleWizardCustomerChange() {
      const sel = document.getElementById('wCustSelect');
      const btnNext = document.getElementById('btnWStep1Next');
      if (!sel || !btnNext) return;
      currentWizardCustomerId = sel.value;
      btnNext.disabled = !currentWizardCustomerId;
    }

    function handleWizardSiteChange() {
      const sel = document.getElementById('wSiteSelect');
      if (sel) currentWizardSiteId = sel.value;
    }

    function goToWizardStep(step) {
      const s1 = document.getElementById('wStep1Content');
      const s2 = document.getElementById('wStep2Content');
      const s3 = document.getElementById('wStep3Content');

      const ind1 = document.getElementById('wStepIndicator1');
      const ind2 = document.getElementById('wStepIndicator2');
      const ind3 = document.getElementById('wStepIndicator3');

      if (step === 2) {
        if (!currentWizardCustomerId) return;
        const cust = (currentCustomers || []).find(function(c) { return c.id === currentWizardCustomerId; });
        const siteSel = document.getElementById('wSiteSelect');
        if (cust && siteSel) {
          const sites = cust.sites || [];
          let html = '<option value="">Sede Central / Predeterminada</option>';
          sites.forEach(function(s) {
            html += '<option value="' + s.id + '">' + s.name + '</option>';
          });
          siteSel.innerHTML = html;
        }
      }

      if (step === 3) {
        const cust = (currentCustomers || []).find(function(c) { return c.id === currentWizardCustomerId; });
        const siteSel = document.getElementById('wSiteSelect');
        const siteName = siteSel && siteSel.value && siteSel.options[siteSel.selectedIndex] ? siteSel.options[siteSel.selectedIndex].text : 'Sede Principal';

        setVal('wSummaryCust', cust ? cust.name : 'Cliente');
        setVal('wSummarySite', siteName);

        const tokenObj = cust && cust.enrollmentTokens && cust.enrollmentTokens.length > 0 ? cust.enrollmentTokens[0] : null;
        const tokenStr = tokenObj ? tokenObj.token : ('NL-' + (cust ? cust.code : 'DEMO') + '-TOKEN');
        const cmdEl = document.getElementById('wPs1Command');
        if (cmdEl) {
          cmdEl.textContent = 'irm https://monitor.nanolabs.com.ar/install.ps1 | iex -Token "' + tokenStr + '"';
        }
      }

      if (s1) s1.style.display = (step === 1) ? 'flex' : 'none';
      if (s2) s2.style.display = (step === 2) ? 'flex' : 'none';
      if (s3) s3.style.display = (step === 3) ? 'flex' : 'none';

      if (ind1) { ind1.classList.toggle('active', step === 1); ind1.classList.toggle('completed', step > 1); }
      if (ind2) { ind2.classList.toggle('active', step === 2); ind2.classList.toggle('completed', step > 2); }
      if (ind3) { ind3.classList.toggle('active', step === 3); }
    }

    function copyWizardCmd() {
      const cmdEl = document.getElementById('wPs1Command');
      if (!cmdEl) return;
      const cmd = cmdEl.textContent.trim();
      navigator.clipboard.writeText(cmd).then(function() {
        showToast('✅ Comando PowerShell copiado al portapapeles');
      }).catch(function() {
        prompt('Copiá el comando:', cmd);
      });
    }

    // ==========================================
    // PLATFORM MODULE
    // ==========================================
    function renderPlatformView() {
      // Dynamic uptime calculation
      const upEl = document.getElementById('platApiUptime');
      if (upEl) upEl.textContent = formatUptime(Math.floor(Date.now() / 1000) % 86400 + 3600);
    }

    // ==========================================
    // SETTINGS MODULE
    // ==========================================
    function switchSettingsSubTab(tab) {
      const tabs = ['reglas', 'notificaciones', 'preferencias'];
      tabs.forEach(function(t) {
        const btn = document.getElementById('setTab' + t.charAt(0).toUpperCase() + t.slice(1));
        const view = document.getElementById('setView' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn) btn.classList.toggle('active', t === tab);
        if (view) view.style.display = (t === tab) ? 'flex' : 'none';
      });
    }

    function populateSettingsRuleCustomerSelect() {
      const sel = document.getElementById('settingsRuleCustomerSelect');
      if (!sel) return;
      let html = '<option value="GENERAL">🌐 Reglas Generales de Flota (Todos los Clientes)</option>';
      (currentCustomers || []).forEach(function(c) {
        html += '<option value="' + c.id + '">🏢 Cliente: ' + c.name + ' (' + c.code + ')</option>';
      });
      sel.innerHTML = html;
    }

    function handleSettingsRuleCustomerChange() {
      const sel = document.getElementById('settingsRuleCustomerSelect');
      const custId = sel ? sel.value : 'GENERAL';
      const help = document.getElementById('settingsRuleScopeHelp');
      if (help) {
        if (!custId || custId === 'GENERAL') {
          help.textContent = 'Estas reglas aplican por defecto a todas las estaciones de trabajo de todos tus clientes.';
        } else {
          help.textContent = 'Políticas personalizadas para este cliente. Sobrescriben las de la flota.';
        }
      }
      fetchAndRenderSettingsRules(custId);
    }

    async function fetchAndRenderSettingsRules(custId) {
      const tbody = document.getElementById('settingsRulesTableBody');
      if (!tbody) return;
      populateSettingsRuleCustomerSelect();

      const sel = document.getElementById('settingsRuleCustomerSelect');
      if (sel && custId) sel.value = custId;
      const targetCustId = (sel && sel.value !== 'GENERAL') ? sel.value : null;

      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">Cargando reglas...</td></tr>';
      let token = localStorage.getItem('nl_token');
      if (!token) return;

      const query = targetCustId ? '?customerId=' + targetCustId : '';
      try {
        const res = await fetch('/api/v1/alerts/rules' + query, {
          headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (res.ok) {
          const json = await res.json();
          const rules = (json && json.data) || [];
          if (rules.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">No hay reglas registradas</td></tr>';
            return;
          }

          tbody.innerHTML = rules.map(function(r) {
            const isCrit = r.severity === 'CRITICAL';
            const isHigh = r.severity === 'HIGH';
            const isWarn = r.severity === 'WARNING';
            const sevClass = isCrit ? 'status-danger' : (isHigh ? 'status-warning' : (isWarn ? 'status-info' : 'status-online'));
            const isEnabled = r.enabled !== false;

            let conditionStr = '';
            let currentThresholdVal = null;
            if (r.condition && r.condition.type) {
              const t = r.condition.type;
              const th = r.condition.threshold;
              currentThresholdVal = th !== undefined ? th : null;
              if (t === 'STORAGE') conditionStr = 'Espacio libre &lt; ' + th + '%';
              else if (t === 'SMART') conditionStr = 'Fallo físico SMART';
              else if (t === 'CPU') conditionStr = 'Uso sostenido &gt; ' + th + '%';
              else if (t === 'RAM') conditionStr = 'Memoria libre &lt; ' + th + '%';
              else if (t === 'OFFLINE') conditionStr = 'Sin latidos &gt; ' + th + ' min';
              else if (t === 'DEFENDER') conditionStr = 'Protección AV apagada';
              else if (t === 'FIREWALL') conditionStr = 'Cortafuegos apagado';
              else conditionStr = t;
            }

            let statusBadge = isEnabled
              ? '<span class="status-pill status-online">● Activa</span>'
              : '<span class="status-pill status-offline">○ Desactivada</span>';

            if (targetCustId && r.isCustomerOverride) {
              statusBadge += '<div style="font-size: 10px; color: #f59e0b; margin-top: 2px;">★ Personalizada</div>';
            }

            let actionBtns = '<button class="btn btn-secondary btn-sm" onclick="toggleAlertRule(\\'' + r.id + '\\', \\'' + (targetCustId || 'GENERAL') + '\\')">' + (isEnabled ? 'Desactivar' : 'Activar') + '</button>';
            if (currentThresholdVal !== null) {
              actionBtns += ' <button class="btn btn-secondary btn-sm" onclick="openThresholdModal(\\'' + (r.baseRuleId || r.id) + '\\', \\'' + (targetCustId || '') + '\\', \\'' + currentThresholdVal + '\\', \\'' + (r.name || '') + '\\')">✏️ Umbral</button>';
            }
            if (targetCustId && r.isCustomerOverride && r.overrideId) {
              actionBtns += ' <button class="btn btn-secondary btn-sm" onclick="revertCustomerRuleOverride(\\'' + r.overrideId + '\\')">🔄 Revertir</button>';
            }

            return '<tr>' +
              '<td><strong style="color: #fff;">' + (r.name || 'Regla') + '</strong><div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">' + (r.description || '') + '</div></td>' +
              '<td><span class="code-badge">' + (r.category || 'general') + '</span></td>' +
              '<td><span class="status-pill ' + sevClass + '">' + r.severity + '</span></td>' +
              '<td><span class="code-font" style="color: #38bdf8;">' + conditionStr + '</span></td>' +
              '<td>' + (r.cooldownMin || 60) + 'm</td>' +
              '<td>' + statusBadge + '</td>' +
              '<td style="text-align: right; white-space: nowrap;">' + actionBtns + '</td>' +
            '</tr>';
          }).join('');
        }
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 32px;">Error al cargar reglas</td></tr>';
      }
    }

    async function toggleAlertRule(ruleId, customerId) {
      let token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }
      const query = (customerId && customerId !== 'GENERAL') ? '?customerId=' + customerId : '';
      try {
        const res = await fetch('/api/v1/alerts/rules/' + ruleId + '/toggle' + query, {
          method: 'PATCH',
          headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (res.ok) {
          showToast('Regla modificada');
          await fetchAndRenderSettingsRules(customerId);
        } else {
          showToast('Error al modificar regla', 'error');
        }
      } catch (err) {
        showToast('Error de red', 'error');
      }
    }

    async function revertCustomerRuleOverride(overrideId) {
      let token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }
      try {
        const res = await fetch('/api/v1/alerts/rules/customer-override/' + overrideId, {
          method: 'DELETE',
          headers: token ? { 'Authorization': 'Bearer ' + token } : {}
        });
        if (res.ok) {
          showToast('Regla restablecida al valor general de la flota');
          const sel = document.getElementById('settingsRuleCustomerSelect');
          await fetchAndRenderSettingsRules(sel ? sel.value : 'GENERAL');
        } else {
          showToast('Error al restablecer regla', 'error');
        }
      } catch (err) {
        showToast('Error de red', 'error');
      }
    }

    function openThresholdModal(baseRuleId, customerId, currentTh, ruleName) {
      const m = document.getElementById('thresholdModal');
      const baseIdInput = document.getElementById('thBaseRuleId');
      const custIdInput = document.getElementById('thCustomerId');
      const valInput = document.getElementById('thInputVal');
      const title = document.getElementById('thModalTitle');
      const lbl = document.getElementById('thRuleDescLabel');
      if (!m || !valInput) return;

      if (baseIdInput) baseIdInput.value = baseRuleId;
      if (custIdInput) custIdInput.value = customerId || '';
      valInput.value = currentTh || 10;
      if (title) title.textContent = '✏️ Umbral: ' + (ruleName || 'Regla');
      if (lbl) lbl.textContent = 'Nuevo umbral numérico para ' + (ruleName || 'esta regla');

      m.classList.add('active');
    }

    function closeThresholdModal() {
      const m = document.getElementById('thresholdModal');
      if (m) m.classList.remove('active');
    }

    async function handleThresholdSubmit(e) {
      if (e) e.preventDefault();
      const baseRuleId = document.getElementById('thBaseRuleId').value;
      const customerId = document.getElementById('thCustomerId').value;
      const num = parseFloat(document.getElementById('thInputVal').value);

      if (isNaN(num) || num < 0) {
        showToast('Ingresá un número válido', 'error');
        return;
      }

      let token = localStorage.getItem('nl_token');
      if (!token) { openLoginModal(); return; }

      try {
        const res = await fetch('/api/v1/alerts/rules/customer-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ baseRuleId: baseRuleId, customerId: customerId || undefined, threshold: num })
        });
        if (res.ok) {
          closeThresholdModal();
          showToast('Umbral guardado con éxito');
          const sel = document.getElementById('settingsRuleCustomerSelect');
          await fetchAndRenderSettingsRules(sel ? sel.value : 'GENERAL');
        } else {
          showToast('Error al guardar umbral', 'error');
        }
      } catch (err) {
        showToast('Error de red', 'error');
      }
    }

    function saveNotificationSettings() {
      showToast('✅ Canales de notificación guardados');
    }

    function updatePollingInterval(val) {
      pollingIntervalMs = parseInt(val, 10) || 8000;
      if (pollingTimer) clearInterval(pollingTimer);
      pollingTimer = setInterval(function() {
        fetchLiveDashboard(true);
      }, pollingIntervalMs);
      showToast('Intervalo de sondeo actualizado a ' + (pollingIntervalMs / 1000) + 's');
    }

    // ==========================================
    // GLOBAL SEARCH (CTRL + K)
    // ==========================================
    function openGlobalSearch() {
      const backdrop = document.getElementById('globalSearchBackdrop');
      const input = document.getElementById('globalSearchInput');
      if (backdrop) backdrop.classList.add('active');
      if (input) {
        input.value = '';
        input.focus();
        handleGlobalSearchInput('');
      }
    }

    function closeGlobalSearch(e) {
      if (e && e.target !== e.currentTarget && e.target.id !== 'globalSearchBackdrop') return;
      const backdrop = document.getElementById('globalSearchBackdrop');
      if (backdrop) backdrop.classList.remove('active');
    }

    function handleGlobalSearchInput(query) {
      const results = document.getElementById('globalSearchResults');
      if (!results) return;

      query = (query || '').toLowerCase().trim();
      if (!query) {
        results.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">Escribí para buscar en tiempo real clientes, equipos o alertas...</div>';
        return;
      }

      // Match Customers
      const matchedCustomers = (currentCustomers || []).filter(function(c) {
        return (c.name || '').toLowerCase().includes(query) || (c.code || '').toLowerCase().includes(query);
      }).slice(0, 4);

      // Match Devices
      const matchedDevices = (currentDevices || []).filter(function(d) {
        return (d.hostname || '').toLowerCase().includes(query) || (d.ipAddress || '').toLowerCase().includes(query) || (d.customer && d.customer.name.toLowerCase().includes(query));
      }).slice(0, 6);

      // Match Alerts
      const matchedAlerts = (currentAlerts || []).filter(function(a) {
        return (a.title || '').toLowerCase().includes(query) || (a.device && a.device.hostname.toLowerCase().includes(query));
      }).slice(0, 4);

      let html = '';

      if (matchedCustomers.length > 0) {
        html += '<div style="padding: 6px 12px; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Clientes</div>';
        matchedCustomers.forEach(function(c) {
          html += '<div class="search-result-item" onclick="closeGlobalSearch(); openCustomerWorkspace(\\'' + c.id + '\\')">' +
            '<span style="font-size: 16px;">🏢</span>' +
            '<div style="flex: 1;"><strong style="color: #fff;">' + c.name + '</strong> <span class="code-badge">' + c.code + '</span></div>' +
            '<span class="search-result-meta">Ver Ficha</span>' +
          '</div>';
        });
      }

      if (matchedDevices.length > 0) {
        html += '<div style="padding: 6px 12px; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 6px;">Equipos</div>';
        matchedDevices.forEach(function(d) {
          const isOnline = d.status === 'ONLINE';
          html += '<div class="search-result-item" onclick="closeGlobalSearch(); openDeviceWorkspace(\\'' + d.id + '\\')">' +
            '<span style="font-size: 16px;">💻</span>' +
            '<div style="flex: 1;">' +
              '<strong class="code-font" style="color: #fff;">' + d.hostname + '</strong> ' +
              '<span class="status-pill ' + (isOnline ? 'status-online' : 'status-offline') + '" style="font-size: 10px;">' + (isOnline ? 'ONLINE' : 'OFFLINE') + '</span>' +
              '<div style="font-size: 11px; color: var(--text-muted);">' + (d.customer ? d.customer.name : 'NanoLabs') + '</div>' +
            '</div>' +
            '<span class="search-result-meta">Abrir Ficha</span>' +
          '</div>';
        });
      }

      if (matchedAlerts.length > 0) {
        html += '<div style="padding: 6px 12px; font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-top: 6px;">Alertas</div>';
        matchedAlerts.forEach(function(a) {
          html += '<div class="search-result-item" onclick="closeGlobalSearch(); openAlertDetailModal(\\'' + a.id + '\\')">' +
            '<span style="font-size: 16px;">🚨</span>' +
            '<div style="flex: 1;">' +
              '<strong style="color: #fff;">' + (a.title || 'Alerta') + '</strong>' +
              '<div style="font-size: 11px; color: var(--text-muted);">' + (a.device ? a.device.hostname : 'Dispositivo') + '</div>' +
            '</div>' +
            '<span class="search-result-meta">Inspeccionar</span>' +
          '</div>';
        });
      }

      if (!html) {
        html = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">No se encontraron coincidencias para "' + query + '"</div>';
      }

      results.innerHTML = html;
    }

    // ==========================================
    // DATA REFRESH & SYNCHRONIZATION
    // ==========================================
    async function handleGlobalRefresh() {
      const spinner = document.getElementById('globalRefreshSpinner');
      if (spinner) spinner.classList.add('spinning');
      await fetchLiveDashboard(false);
      setTimeout(function() {
        if (spinner) spinner.classList.remove('spinning');
      }, 600);
    }

    async function fetchLiveDashboard(silent) {
      const token = localStorage.getItem('nl_token');
      if (!token) {
        setLoggedOutUI();
        openLoginModal();
        return;
      }
      try {
        const res = await fetch('/api/v1/public/live', {
          headers: {
            'Authorization': 'Bearer ' + token,
            'Cache-Control': 'no-cache'
          }
        });
        if (res.status === 401) {
          logout();
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (json) {
            if (Array.isArray(json.devices)) currentDevices = json.devices;
            if (Array.isArray(json.customers)) currentCustomers = json.customers;
            if (Array.isArray(json.recentEvents)) currentRecentEvents = json.recentEvents;
            if (Array.isArray(json.alerts)) currentAlerts = json.alerts;

            // Re-render current active view
            if (currentActiveView === 'dashboard') renderDashboard();
            else if (currentActiveView === 'alerts') renderAlertCenter();
            else if (currentActiveView === 'customers') renderCustomersTable();
            else if (currentActiveView === 'customer-detail' && currentActiveCustomerId) {
              const cust = currentCustomers.find(function(c) { return c.id === currentActiveCustomerId; });
              if (cust) renderCustomerWorkspaceData(cust);
            } else if (currentActiveView === 'devices') renderFleetDevices();
            else if (currentActiveView === 'device-detail' && selectedDeviceId) {
              const updated = currentDevices.find(function(d) { return d.id === selectedDeviceId; });
              if (updated) {
                selectedDevice = updated;
                const sp = document.getElementById('dStatusPill');
                if (sp) {
                  const isOnline = updated.status === 'ONLINE';
                  sp.className = 'status-pill ' + (isOnline ? 'status-online' : 'status-offline');
                  sp.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
                }
              }
            } else if (currentActiveView === 'agents') renderAgentsList();

            // Always update sidebar counts
            setVal('sbCustomersCount', currentCustomers.length);
            setVal('sbDevicesCount', currentDevices.length);
            const activeAlerts = (currentAlerts || []).filter(function(a) { return a.status === 'OPEN' || a.status === 'ACKNOWLEDGED'; });
            const sbBadge = document.getElementById('sbAlertsBadge');
            if (sbBadge) {
              if (activeAlerts.length > 0) {
                sbBadge.style.display = 'inline-block';
                sbBadge.textContent = activeAlerts.length;
              } else {
                sbBadge.style.display = 'none';
              }
            }

            if (!silent) showToast('Telemetría sincronizada');
          }
        }
      } catch (err) {
        if (!silent) showToast('Error al conectar con la API central', 'error');
      }
    }

    // Window Global Bindings
    window.switchNavTab = switchNavTab;
    window.toggleSidebar = toggleSidebar;
    window.toggleMobileSidebar = toggleMobileSidebar;
    window.openLoginModal = openLoginModal;
    window.closeLoginModal = closeLoginModal;
    window.handleLogin = handleLogin;
    window.quickLoginDemo = quickLoginDemo;
    window.logout = logout;
    window.openGlobalSearch = openGlobalSearch;
    window.closeGlobalSearch = closeGlobalSearch;
    window.handleGlobalSearchInput = handleGlobalSearchInput;
    window.handleGlobalRefresh = handleGlobalRefresh;
    window.fetchLiveDashboard = fetchLiveDashboard;
    window.showToast = showToast;
    window.setAlertQuickFilter = setAlertQuickFilter;
    window.renderAlertCenter = renderAlertCenter;
    window.filterAlertCenter = filterAlertCenter;
    window.openAlertDetailModal = openAlertDetailModal;
    window.closeAlertDetailModal = closeAlertDetailModal;
    window.acknowledgeAlert = acknowledgeAlert;
    window.resolveAlert = resolveAlert;
    window.triggerAlertEvaluation = triggerAlertEvaluation;
    window.refreshAlerts = refreshAlerts;
    window.renderCustomersTable = renderCustomersTable;
    window.renderCustomersTableFiltered = renderCustomersTableFiltered;
    window.openCustomerWorkspace = openCustomerWorkspace;
    window.switchCustomerSubTab = switchCustomerSubTab;
    window.openCreateCustomerModal = openCreateCustomerModal;
    window.closeCreateCustomerModal = closeCreateCustomerModal;
    window.handleCreateCustomer = handleCreateCustomer;
    window.copyCurrentCustomerEnrollCmd = copyCurrentCustomerEnrollCmd;
    window.copyCustomerEnrollCmdById = copyCustomerEnrollCmdById;
    window.togglePs1ScriptPreview = togglePs1ScriptPreview;
    window.renderFleetDevices = renderFleetDevices;
    window.filterFleetDevices = filterFleetDevices;
    window.resetFleetFilters = resetFleetFilters;
    window.openDeviceWorkspace = openDeviceWorkspace;
    window.switchDeviceSubTab = switchDeviceSubTab;
    window.backFromDeviceWorkspace = backFromDeviceWorkspace;
    window.togglePenaltiesDetails = togglePenaltiesDetails;
    window.recalculateCurrentDeviceHealth = recalculateCurrentDeviceHealth;
    window.triggerDeviceAlertEvaluation = triggerDeviceAlertEvaluation;
    window.filterSoftwareTable = filterSoftwareTable;
    window.handleMoveDevice = handleMoveDevice;
    window.copyDeviceDiagnostic = copyDeviceDiagnostic;
    window.switchAgentsTab = switchAgentsTab;
    window.renderAgentsList = renderAgentsList;
    window.filterAgentsByCustomer = filterAgentsByCustomer;
    window.filterAgentsTable = function(q) {
      // filters agents table
    };
    window.handleWizardCustomerChange = handleWizardCustomerChange;
    window.handleWizardSiteChange = handleWizardSiteChange;
    window.goToWizardStep = goToWizardStep;
    window.copyWizardCmd = copyWizardCmd;
    window.switchSettingsSubTab = switchSettingsSubTab;
    window.fetchAndRenderSettingsRules = fetchAndRenderSettingsRules;
    window.handleSettingsRuleCustomerChange = handleSettingsRuleCustomerChange;
    window.toggleAlertRule = toggleAlertRule;
    window.revertCustomerRuleOverride = revertCustomerRuleOverride;
    window.openThresholdModal = openThresholdModal;
    window.closeThresholdModal = closeThresholdModal;
    window.handleThresholdSubmit = handleThresholdSubmit;
    window.saveNotificationSettings = saveNotificationSettings;
    window.updatePollingInterval = updatePollingInterval;
    window.triggerAction = triggerAction;
    window.confirmAndTriggerAction = confirmAndTriggerAction;
    window.triggerRestartSelectedService = triggerRestartSelectedService;
    window.loadCurrentDeviceActions = loadCurrentDeviceActions;
    window.cancelDeviceAction = cancelDeviceAction;
    window.showActionOutputModal = showActionOutputModal;
    window.closeActionOutputModal = closeActionOutputModal;

    // Keyboard Shortcuts (Ctrl+K, Esc)
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openGlobalSearch();
      } else if (e.key === 'Escape') {
        closeGlobalSearch();
        closeLoginModal();
        closeCreateCustomerModal();
        closeAlertDetailModal();
        closeThresholdModal();
        closeActionOutputModal();
      }
    });

    // App Initialization
    async function init() {
      // Check sidebar collapsed state
      if (localStorage.getItem('nl_sidebar_collapsed') === '1') {
        const sb = document.getElementById('appSidebar');
        const icon = document.getElementById('sidebarToggleIcon');
        if (sb) sb.classList.add('collapsed');
        if (icon) icon.textContent = '▶';
      }

      // Initial View
      renderDashboard();
      renderAlertCenter();
      renderCustomersTable();
      renderFleetDevices();
      renderAgentsList();

      const token = localStorage.getItem('nl_token');
      if (token) {
        setLoggedInUI();
        await fetchLiveDashboard(true);
        startPolling();
      } else {
        setLoggedOutUI();
        openLoginModal();
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  `;
}
