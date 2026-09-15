# Enrollment — NanoLabs Control Center

> Se actualizará durante F2. Documento inicial.

## Flujo

1. Técnico crea token desde el panel web
2. Token tiene expiración (24h) y uso limitado (1 uso por defecto)
3. Token se vincula a un customer y opcionalmente a un site
4. Se instala el agente con el token como parámetro
5. El agente envía: token + hostname + hardware ID + OS info
6. El servidor valida token, crea Device + Agent, genera credenciales
7. El agente recibe agentId + agentSecret + deviceId
8. El agente almacena credenciales con DPAPI
9. El token queda invalidado
10. El equipo comienza a reportar normalmente

## Formato del token

```
NL-ENRL-<random_32_chars>
```

## Seguridad

- Token de uso único (configurable a N usos para batch)
- Expiración configurable (default 24h)
- Vinculado a tenant+customer (obligatorio)
- AuditLog de cada enrollment
- Imposible re-enrollar un dispositivo ya registrado sin revocación previa
