# Windows Installer & Tray App — NanoLabs Control Center

## Estado
✅ **Completado y Desplegado en Producción**

## Componentes del Instalador (`NanoMonitor-Setup.exe` y `NanoLabsInstaller.exe`)
- **Ejecutable Standalone Embebido:** Compilado en Go (`CGO_ENABLED=0`) empaquetando internamente `nanoagent.exe` y `nanotray.exe`.
- **Auto-elevación UAC:** Si se ejecuta sin privilegios, solicita elevación de Administrador automáticamente.
- **Ruta de Instalación:** `C:\Program Files\NanoLabs\NanoMonitor\`
- **Ruta de Datos y Buffer:** `C:\ProgramData\NanoLabs\NanoMonitor\`
- **Servicio de Windows:** Registrado como `NanoLabsAgent` con inicio automático (`auto`).
- **Bandeja del Sistema (Tray):** Registrado en `HKLM\Software\Microsoft\Windows\CurrentVersion\Run` como `NanoLabsTray`.

## Métodos de Instalación

### 1. Interactivo (Doble Clic)
Al ejecutar `NanoMonitor-Setup.exe`:
- Busca automáticamente si existe `token.txt` en la misma carpeta.
- Si no existe, muestra un diálogo de Windows solicitando el Token de Enrolamiento del cliente.
- Realiza la instalación, arranca el servicio y la bandeja.

### 2. Silencioso / Desatendido (Recomendado para despliegues)
```powershell
.\NanoMonitor-Setup.exe -token="<TOKEN_DEL_CLIENTE>" -silent
```

### 3. PowerShell One-Liner
Disponible en la consola web en el workspace del cliente:
```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $t='<TOKEN>'; irm https://monitor.nanolabs.com.ar/downloads/install.ps1 | iex
```

### 4. Desinstalación
```powershell
.\NanoMonitor-Setup.exe -uninstall -silent
```
