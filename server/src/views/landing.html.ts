export function getLandingHtml(data: {
  uptimeSeconds: number;
  serverTime: string;
  version: string;
  env: string;
}): string {
  const uptimeMinutes = Math.floor(data.uptimeSeconds / 60);
  const uptimeHours = (data.uptimeSeconds / 3600).toFixed(1);

  return `<!DOCTYPE html>
<html lang="es" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NanoLabs Control Center | RMM & Telemetría Preventiva</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.65);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-border-glow: rgba(99, 102, 241, 0.3);
      --primary: #6366f1;
      --primary-glow: rgba(99, 102, 241, 0.25);
      --accent: #06b6d4;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --success-glow: rgba(16, 185, 129, 0.2);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
      position: relative;
      padding: 24px;
    }

    /* Ambient background lighting */
    .glow-orb-1 {
      position: absolute;
      width: 550px;
      height: 550px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, rgba(0, 0, 0, 0) 70%);
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      border-radius: 50%;
      filter: blur(80px);
      z-index: 0;
      pointer-events: none;
    }

    .glow-orb-2 {
      position: absolute;
      width: 450px;
      height: 450px;
      background: radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, rgba(0, 0, 0, 0) 70%);
      bottom: -100px;
      right: 15%;
      border-radius: 50%;
      filter: blur(90px);
      z-index: 0;
      pointer-events: none;
    }

    /* Grid pattern */
    .grid-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      z-index: 0;
      pointer-events: none;
    }

    .container {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 32px;
    }

    /* Header brand */
    .brand-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 16px;
    }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 9999px;
      background: var(--success-glow);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      box-shadow: 0 0 20px var(--success-glow);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      background-color: var(--success);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--success);
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.6; }
    }

    .title {
      font-size: clamp(32px, 5vw, 48px);
      font-weight: 800;
      letter-spacing: -1px;
      background: linear-gradient(135deg, #ffffff 40%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.15;
    }

    .title span {
      background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 16px;
      max-width: 600px;
      line-height: 1.6;
    }

    /* Glass card */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 32px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 24px;
      transition: all 0.3s ease;
    }

    .card:hover {
      border-color: var(--card-border-glow);
      box-shadow: 0 20px 50px rgba(99, 102, 241, 0.15);
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .metric-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .metric-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .metric-value {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      font-family: 'JetBrains Mono', monospace;
    }

    .metric-tag {
      font-size: 11px;
      color: var(--accent);
      font-weight: 500;
    }

    /* Endpoints section */
    .endpoints-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .endpoint-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 14px 18px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      transition: background 0.2s;
    }

    .endpoint-item:hover {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(99, 102, 241, 0.4);
    }

    .endpoint-route {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .method {
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }

    .method.get { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .method.post { background: rgba(99, 102, 241, 0.2); color: #818cf8; }

    .path {
      color: #e2e8f0;
    }

    .endpoint-desc {
      color: var(--text-muted);
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
    }

    /* Footer */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #64748b;
      font-size: 13px;
      padding: 0 8px;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
      transition: color 0.2s;
    }

    .footer a:hover {
      color: #fff;
    }

    @media (max-width: 640px) {
      .card { padding: 20px; }
      .endpoint-item { flex-direction: column; align-items: flex-start; gap: 8px; }
      .footer { flex-direction: column; gap: 8px; text-align: center; }
    }
  </style>
</head>
<body>
  <div class="glow-orb-1"></div>
  <div class="glow-orb-2"></div>
  <div class="grid-overlay"></div>

  <div class="container">
    <!-- Header -->
    <header class="brand-header">
      <div class="badge-status">
        <span class="pulse-dot"></span>
        Servicios Operativos
      </div>
      <h1 class="title">NanoLabs <span>Control Center</span></h1>
      <p class="subtitle">
        Plataforma central de telemetría de alto rendimiento, supervisión preventiva y administración multi-tenant de estaciones Windows.
      </p>
    </header>

    <!-- Main Card -->
    <main class="card">
      <div class="metrics-grid">
        <div class="metric-box">
          <span class="metric-label">Estado de Plataforma</span>
          <span class="metric-value" style="color: #34d399;">ONLINE</span>
          <span class="metric-tag">HTTP/2 • SSL Activo</span>
        </div>
        <div class="metric-box">
          <span class="metric-label">Tiempo de Actividad</span>
          <span class="metric-value">${uptimeHours}h</span>
          <span class="metric-tag">${uptimeMinutes} minutos</span>
        </div>
        <div class="metric-box">
          <span class="metric-label">Base de Datos</span>
          <span class="metric-value">Postgres 17</span>
          <span class="metric-tag">Particionado Semanal</span>
        </div>
        <div class="metric-box">
          <span class="metric-label">Seguridad Agente</span>
          <span class="metric-value">HMAC-SHA256</span>
          <span class="metric-tag">Anti-Replay Nonce</span>
        </div>
      </div>

      <div class="endpoints-section">
        <span class="section-title">Endpoints Centrales de Producción</span>
        
        <a href="/health" style="text-decoration: none;">
          <div class="endpoint-item">
            <div class="endpoint-route">
              <span class="method get">GET</span>
              <span class="path">/health</span>
            </div>
            <span class="endpoint-desc">Healthcheck global del clúster</span>
          </div>
        </a>

        <div class="endpoint-item">
          <div class="endpoint-route">
            <span class="method post">POST</span>
            <span class="path">/enrollment/register</span>
          </div>
          <span class="endpoint-desc">Enrolamiento de agentes Windows</span>
        </div>

        <div class="endpoint-item">
          <div class="endpoint-route">
            <span class="method post">POST</span>
            <span class="path">/agent/heartbeat</span>
          </div>
          <span class="endpoint-desc">Ingesta de pulsos (cada 3 min)</span>
        </div>

        <div class="endpoint-item">
          <div class="endpoint-route">
            <span class="method post">POST</span>
            <span class="path">/agent/metrics</span>
          </div>
          <span class="endpoint-desc">Ingesta de telemetría de rendimiento</span>
        </div>

        <div class="endpoint-item">
          <div class="endpoint-route">
            <span class="method post">POST</span>
            <span class="path">/api/v1/auth/login</span>
          </div>
          <span class="endpoint-desc">Autenticación de operadores y técnicos</span>
        </div>
      </div>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <span>NanoLabs Control Center v${data.version} • Dedicated Debian Cluster</span>
      <span>© 2026 <a href="https://nanolabs.com.ar" target="_blank" rel="noopener">NanoLabs</a>. Todos los derechos reservados.</span>
    </footer>
  </div>
</body>
</html>
`;
}
