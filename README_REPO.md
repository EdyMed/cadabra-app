# Repo: Agente WhatsApp Empresarial (Cadabra)

Versiona el producto completo. Lo que no está en `.gitignore` como lista blanca queda fuera.

| Carpeta | Qué es |
|---|---|
| `CRM Whatsap/` | Panel Next.js (panel.cadabra.cl / agente.appcadabra.cl/crm) + `sql/` del panel |
| `Modulo ventas/agente-whatsapp/` | Documentación base del bot (CLAUDE.md, ESTADO.md) + SQL del agente |
| `Modulo ventas/crm-empresarial/n8n/prod/` | **Export automático de los workflows de n8n en producción** |
| `Modulo ventas/crm-empresarial/n8n/respaldos/*.py` | Scripts de patch que se subieron por API (los JSON de respaldo quedan solo en disco) |

## Rutina al cambiar algo en n8n
```
python -I "Modulo ventas/crm-empresarial/n8n/exportar_n8n.py"                   # antes del cambio (punto de partida)
# ... cambio por API o en la UI ...
python -I "Modulo ventas/crm-empresarial/n8n/exportar_n8n.py" --commit "n8n: <qué cambió>"
```
Volver atrás = tomar el JSON de `n8n/prod/` de un commit anterior y hacer PUT por la API.

## ⚠️ No subir a un remoto (GitHub) todavía
Algunos SQL, notas y nodos de n8n tienen claves en texto plano (password del rol postgres, rol readonly,
token "Validar token" de Enviar desde CRM, tokens de Chatwoot en workflows inactivos). Primero hay que
rotarlas (Fase 0, punto 4 del plan de mejoras); recién ahí se crea el repo privado remoto.
