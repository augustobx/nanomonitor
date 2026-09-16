export function getPlatformViewHtml(): string {
  return `
    <div id="viewPlatform" class="view-panel" style="display: none; flex-direction: column; gap: 20px;">
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h2 style="font-size: 20px; font-weight: 800; color: #fff; letter-spacing: -0.3px;">Estado de la Plataforma & Servicios Centrales</h2>
          <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            Arquitectura de backend, bases de datos, almacenamiento de series de tiempo y tareas programadas.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="status-pill status-online">
            <span class="pulse-dot online"></span> Clúster Debian en Producción
          </span>
          <button class="btn btn-secondary btn-sm" onclick="fetchLiveDashboard(false)">
            🔄 Verificar Servicios
          </button>
        </div>
      </div>

      <!-- Service Health Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        
        <!-- Service 1: API Central Fastify -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>🚀 Servidor API Fastify</span>
            </div>
            <span class="status-pill status-online"><span class="pulse-dot online"></span> ONLINE</span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Framework & Runtime:</span>
              <strong style="color: #fff;">Fastify v5.2 • Node.js v22</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Tiempo de Actividad (Uptime):</span>
              <span class="code-font" style="color: #60a5fa;" id="platApiUptime">Calculando...</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Cifrado de Telemetría:</span>
              <span style="color: var(--success); font-weight: 600;">HMAC-SHA256 Activo</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Rate Limiting:</span>
              <span>300 req / min por IP</span>
            </div>
          </div>
        </div>

        <!-- Service 2: PostgreSQL 17 -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>🐘 Base de Datos PostgreSQL 17</span>
            </div>
            <span class="status-pill status-online"><span class="pulse-dot online"></span> ONLINE</span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Motor & ORM:</span>
              <strong style="color: #fff;">PostgreSQL 17 • Prisma 6.4</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Particionado de Métricas:</span>
              <span style="color: #38bdf8;">Mensual (12 particiones activas)</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Aislamiento Tenancy:</span>
              <span>Tenant ID / RLS Validado</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Estado del Pool:</span>
              <span style="color: var(--success);">Conexiones Saludables</span>
            </div>
          </div>
        </div>

        <!-- Service 3: Redis 7 -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>⚡ Redis 7 Telemetría & Cache</span>
            </div>
            <span class="status-pill status-online"><span class="pulse-dot online"></span> ACTIVO</span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Uso Primario:</span>
              <strong style="color: #fff;">Cache de Tokens & Latidos</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Estrategia de Fallback:</span>
              <span>In-Memory Safe Cache</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">TTL de Latidos:</span>
              <span class="code-font">180s por Agente</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Latencia de Acceso:</span>
              <span style="color: var(--success); font-weight: 600;">&lt; 2 ms</span>
            </div>
          </div>
        </div>

        <!-- Service 4: Reverse Proxy Nginx -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>🛡️ Nginx Proxy Manager & SSL</span>
            </div>
            <span class="status-pill status-online"><span class="pulse-dot online"></span> PROTEGIDO</span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Dominio Público:</span>
              <strong class="code-font" style="color: #60a5fa;">monitor.nanolabs.com.ar</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Certificado SSL:</span>
              <span>Let's Encrypt TLS v1.3</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Seguridad HTTP:</span>
              <span>HSTS / CSP / Anti-Clickjacking</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">WebSocket Proxy:</span>
              <span style="color: var(--success);">Habilitado para telemetría</span>
            </div>
          </div>
        </div>

        <!-- Service 5: Retention & Maintenance Jobs -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>⏱️ Tareas Programadas (Jobs)</span>
            </div>
            <span class="status-pill status-online"><span class="pulse-dot online"></span> OPERATIVAS</span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Agregación Horaria:</span>
              <span>Cada hora (minuto 05)</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Agregación Diaria:</span>
              <span>Cada medianoche (01:00 UTC)</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Purga de Telemetría Cruda:</span>
              <span>Retención 30 días (02:00 UTC)</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Rotación de Particiones:</span>
              <span>Día 1 de cada mes</span>
            </div>
          </div>
        </div>

        <!-- Service 6: Dedicated Server Host -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title">
              <span>🖥️ Servidor Host Dedicado</span>
            </div>
            <span class="status-pill status-online"><span class="pulse-dot online"></span> DEDICADO</span>
          </div>
          <div class="section-body" style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Sistema Operativo:</span>
              <strong style="color: #fff;">Debian GNU/Linux 12 (Bookworm)</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Entorno de Contenedores:</span>
              <span>Docker Compose Enterprise</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Seguridad Perimetral:</span>
              <span>UFW Firewall + Fail2Ban</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span style="color: var(--text-muted);">Almacenamiento NVMe:</span>
              <span style="color: var(--success); font-weight: 600;">RAID 1 Espejado</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  `;
}
