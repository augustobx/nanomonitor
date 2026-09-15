# Despliegue en Producción — NanoLabs Control Center

## 1. Datos del Servidor y Dominio

- **Dominio Público**: `https://monitor.nanolabs.com.ar`
- **Servidor**: Servidor Dedicado Debian 13 (`149.50.159.163:2207`)
- **Directorio de la Aplicación**: `/opt/apps/nanomonitor/`
- **Directorio de Backups**: `/opt/backups/nanomonitor/`
- **Red Externa de Proxy**: `proxy` (bridge)
- **Nginx Proxy Manager**: `https://proxy.nanoapps.site`

---

## 2. Topología Docker del Stack

El stack está compuesto por 3 contenedores:

| Contenedor | Imagen / Build | Redes | Puertos Públicos | Estado |
|---|---|---|---|---|
| **`nanomonitor-server`** | Multi-stage Node 22 Alpine (`./server`) | `nanomonitor-internal`, `proxy` | Ninguno (acceso vía NPM a puerto 4000) | `healthy` |
| **`nanomonitor-postgres`** | `postgres:17-alpine` | `nanomonitor-internal` | Ninguno (aislado) | `healthy` |
| **`nanomonitor-redis`** | `redis:7-alpine` | `nanomonitor-internal` | Ninguno (aislado) | `healthy` |

---

## 3. Seguridad y Proxy Inverso (NPM)

- **Proxy Host ID**: 5 en Nginx Proxy Manager.
- **Certificado SSL**: Let's Encrypt vigente con HTTP/2, Force SSL y HSTS activados.
- **Header Forwarding**: Preserva `X-Forwarded-For`, `X-Forwarded-Proto`, WebSocket upgrades.
- **Aislamiento**: Ninguna base de datos ni caché expone puertos al host ni a Internet.

---

## 4. Comandos Operativos en el Servidor

```bash
# 1. Acceder al servidor por SSH
ssh nanolabs-prod

# 2. Ir al directorio de la aplicación
cd /opt/apps/nanomonitor

# 3. Ver estado de contenedores
docker compose ps

# 4. Ver logs en tiempo real
docker compose logs -f nanomonitor-server

# 5. Reiniciar o reconstruir
docker compose up -d --build

# 6. Ejecutar backup manual de la base de datos
bash scripts/backup.sh
```
