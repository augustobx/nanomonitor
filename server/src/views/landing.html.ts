import { themeCss } from './styles/theme.css.js';
import { getSidebarHtml } from './components/sidebar.js';
import { getTopbarHtml } from './components/topbar.js';
import { getBreadcrumbsHtml } from './components/breadcrumbs.js';
import { getGlobalSearchHtml } from './components/global-search.js';
import { getModalsHtml } from './components/modals.js';
import { getDashboardViewHtml } from './modules/dashboard.view.js';
import { getAlertsViewHtml } from './modules/alerts.view.js';
import { getCustomersViewHtml } from './modules/customers.view.js';
import { getDevicesViewHtml } from './modules/devices.view.js';
import { getDeviceDetailViewHtml } from './modules/device-detail.view.js';
import { getAgentsViewHtml } from './modules/agents.view.js';
import { getPlatformViewHtml } from './modules/platform.view.js';
import { getSettingsViewHtml } from './modules/settings.view.js';
import { getClientRuntimeScript } from './scripts/client-runtime.js';

function safeJson(val: any): string {
  return JSON.stringify(val ?? null, (_, v) =>
    typeof v === 'bigint' ? (Number.isSafeInteger(Number(v)) ? Number(v) : v.toString()) : v
  ).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function getLandingHtml(data: {
  uptimeSeconds: number;
  serverTime: string;
  version: string;
  env: string;
  devices?: any[];
  customers?: any[];
  recentEvents?: any[];
  alerts?: any[];
}): string {
  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NanoLabs Control Center — Enterprise NOC & RMM</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
${themeCss}
  </style>
</head>
<body>

  <!-- Sidebar -->
  ${getSidebarHtml()}

  <!-- App Main Layout Wrapper -->
  <div class="app-layout">
    <!-- Clean Topbar -->
    ${getTopbarHtml()}

    <!-- Dynamic Hierarchical Breadcrumbs -->
    ${getBreadcrumbsHtml()}

    <!-- Main Content Container -->
    <main class="app-content">
      <!-- 1. Dashboard NOC View -->
      ${getDashboardViewHtml()}

      <!-- 2. Alertas View -->
      ${getAlertsViewHtml()}

      <!-- 3. Clientes & Sedes View -->
      ${getCustomersViewHtml()}

      <!-- 4. Equipos Global Fleet View -->
      ${getDevicesViewHtml()}

      <!-- 5. Ficha del Equipo (Device Workspace) View -->
      ${getDeviceDetailViewHtml()}

      <!-- 6. Agentes & Enrolamiento View -->
      ${getAgentsViewHtml()}

      <!-- 7. Plataforma View -->
      ${getPlatformViewHtml()}

      <!-- 8. Configuración View -->
      ${getSettingsViewHtml()}
    </main>

    <!-- Professional Footer -->
    <footer class="app-footer">
      <div>
        <strong>NanoLabs Control Center</strong> v${data.version} • Enterprise Multi-Tenant RMM & NOC
      </div>
      <div>
        Clúster Debian Dedicado • &copy; 2026 <strong>NanoLabs</strong>. Todos los derechos reservados.
      </div>
    </footer>
  </div>

  <!-- Global Search Dialog (Ctrl+K) -->
  ${getGlobalSearchHtml()}

  <!-- System Modals -->
  ${getModalsHtml()}

  <!-- Initial State Injection & Client Runtime -->
  <script>
    let currentDevices = ${safeJson(data.devices || [])};
    let currentCustomers = ${safeJson(data.customers || [])};
    let currentRecentEvents = ${safeJson(data.recentEvents || [])};
    let currentAlerts = ${safeJson(data.alerts || [])};

${getClientRuntimeScript()}
  </script>
</body>
</html>`;
}
