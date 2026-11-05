# ESTADO — Agente IA WhatsApp (Ventas / E-commerce)

Bitácora de avance del proyecto. La **fuente de verdad del diseño** es
[`CLAUDE.md`](./CLAUDE.md); este archivo registra qué se hizo, decisiones y
próximos pasos.

Última actualización: **2026-08-04**

---

## Resumen del proyecto

Agente conversacional por **WhatsApp** que responde preguntas del negocio y del
e-commerce consultando **Supabase (PostgreSQL)**, orquestado con **n8n self-hosted**
y razonado con **OpenAI GPT-4o** (Anthropic dejado como opción futura, ver §5.1 del
CLAUDE.md). Producto pensado para **vender a pymes** — multi-cliente desde el día uno.

---

## Decisiones tomadas (no re-discutir)

| Tema | Decisión |
|---|---|
| Acceso a datos | **Híbrido**: tools predefinidas seguras + 1 tool `sql_readonly` acotado (solo owner) |
| Audiencia / roles | **owner** (acceso total), **customer** (registrado: precios/stock + sus pedidos), **anon** (número nuevo: solo catálogo público) |
| Multi-tenant | La columna **`empresa`** (integer) separa clientes, igual que el ERP. Un mismo Supabase aloja varias empresas. Toda consulta filtra `WHERE empresa = :empresa` |
| Identificación | Empresa por `phone_number_id` (línea que recibe) → tabla `agente_lineas_whatsapp`; rol por `from` (quien escribe) → `agente_contactos` |
| Número desconocido | Se trata como `anon` (atiende leads 24/7 sin registro) |
| Alta de customer | Pre-carga manual por la pyme (teléfono + RUT). Auto-verificación por RUT = fase 2 |
| Datos a cargar | Solo **2025-2026** (años completos), no todo el histórico |
| LLM | OpenAI GPT-4o ahora; cambiar a Claude = solo cambiar el nodo Chat Model |

---

## Infraestructura

- **Supabase (proyecto activo):** `cexowmypklxngbjsxryf`
  → https://cexowmypklxngbjsxryf.supabase.co
- **n8n self-hosted:** https://proyecto-prueba-n8n.jmyxxj.easypanel.host (EasyPanel)
- **Referencia de arquitectura:** https://inprofit.eu/automatizacion/agente-ia-n8n-whatsapp-empresas/

---

## ✅ Hecho

### Diseño
- [x] Prompt maestro `CLAUDE.md` completo (arquitectura, roles, system prompt, 9 tools con SQL, seguridad).

### Base de datos (Supabase `cexowmypklxngbjsxryf`) — CARGADA Y VERIFICADA
- [x] 144 tablas del ERP creadas (`output/01_schema.sql`).
- [x] Datos 2025-2026 cargados (backup filtrado, 209.396 filas).
      Verificado: **movimientos_ventas=81.313, clientes=360, productos=169**.
- [x] Índices, funciones y RLS del ERP aplicados (`05_indexes`, `03_functions`, `02_rls`).
- [x] **5 tablas del agente** creadas con RLS + índices + triggers (`sql/10_agente_schema.sql`):
      `agente_lineas_whatsapp`, `agente_contactos`, `conversation_history`,
      `agente_tool_log`, `agente_escalamientos`.
- [x] Total: **149 tablas** en `public`.

### Configuración del agente (Paso A) — HECHO
- [x] Rol Postgres `agente_readonly` (solo SELECT, `statement_timeout=5s`) para la tool `sql_readonly`.
      ⚠️ Contraseña temporal `123456` — **cambiar antes de producción**.
- [x] Seed `agente_lineas_whatsapp`: `phone_number_id=1168256669712210` → empresa 1
      (mismo número que las alertas ChileCompra; asistente "Sofía").
- [x] Seed `agente_contactos`: número `56995649108` como `owner` (empresa 1).
- [x] Tenant confirmado: **empresa = 1** (81.313 movimientos).

### Artefactos generados (en `sql/`)
- `10_agente_schema.sql` — 5 tablas del agente (idempotente, RLS deny-by-default).
- `20_seeds_y_readonly.sql` — rol read-only + seeds (línea WhatsApp + owner).
- `00_limpiar_datos_erp.sql` — TRUNCATE del ERP para recargas limpias.
- `filtrar_backup_por_fecha.py` — genera el backup filtrado por fecha (parám. `FECHA_CORTE`).
- `RUNBOOK_carga_supabase.md` — guía de carga paso a paso con psql.

### Hallazgo importante: columna de tenant inconsistente
- `movimientos_ventas`, `productos`, `facturas_venta` → columna `empresa`.
- `productos_bodega` → columna `codigo_empresa` (mismo concepto, otro nombre).
- **`clientes` NO tiene columna `empresa`** (es compartida; clave `rut_cl, dv_cl`).
  Las tools que tocan `clientes` filtran por `rut_cl`, no por empresa.

---

## ✅ Workflow n8n desplegado (2026-08-04)

- **Instancia n8n:** NUEVA, versión **2.33.3**, en
  `https://appcadabra-cadabra-project.jmyxxj.easypanel.host` (proyecto EasyPanel "Cadabra").
  La instancia vieja 2.7.4 sigue aparte con los workflows de ChileCompra/facturas.
- **Workflow:** `Cadabra · Agente WhatsApp Ventas` — **ID `s3rtqAowJhIXvBUU`**, **INACTIVO**.
  19 nodos, desplegado vía API. JSON versionado en `n8n/workflow_agente_min.json`.
- **Tools incluidas:** `stock_producto` (consulta Postgres, rol read-only) +
  `verificar_disponibilidad` y `crear_reunion` (Google Calendar — agenda reuniones
  validando disponibilidad, horario laboral L-V 9-18 America/Santiago).
- Desplegado SIN credenciales (placeholders `REEMPLAZAR_*`); se crean en la UI y se enlazan.
- **Verificación de Meta:** el webhook acepta GET+POST; hay un IF que responde el
  `hub.challenge` en el GET de verificación de Meta (no valida el verify_token aún — mejora
  pendiente). 21 nodos en total.
- **TIPOS DE NODO corregidos para n8n 2.33.3** (lección): la tool de Postgres es
  `n8n-nodes-base.postgresTool` **v2.6** (NO `@n8n/n8n-nodes-langchain.toolPostgres`, que
  no existe en esta versión); `postgres` normal **v2.6**; `googleCalendarTool` debe ir en
  **v1.3** (con v2.6 la API acepta el nodo pero VACÍA sus parámetros → ícono "imagen rota"
  en el canvas). Regla: tras cambiar typeVersion, verificar por API que `parameters` no
  quede `[]`.
- **n8n 2.33.3 NO permite activar el workflow sin credenciales configuradas** (es estricto).
  Por eso el orden obligado es: crear credenciales → enlazar → activar → recién ahí
  verificar webhook en Meta (no se puede "activar solo para verificar").

## ✅ Credenciales y activación (2026-08-04)

- **Las 5 credenciales creadas y enlazadas** en n8n:
  - Supabase RW (4 nodos): host `aws-1-us-west-2.pooler.supabase.com`, user `postgres.cexowmypklxngbjsxryf`, port 5432, SSL require.
  - Supabase RO (`stock_producto`): user `agente_readonly.cexowmypklxngbjsxryf` / `123456` (OJO cambiar), mismo host.
  - OpenAI (gpt-4o).
  - Google Calendar OAuth2 → calendario `consultoria.cadabra@gmail.com`. Se creó un OAuth client
    tipo **Web** en el proyecto Google Cloud `326286714823` (el mismo de ChileCompra; el de
    ChileCompra era tipo Desktop y no servía para n8n). Calendar API habilitada.
  - Meta WhatsApp: Header Auth `Authorization: Bearer <token>`.
- **WORKFLOW ACTIVO** ✅ (activado por API 2026-08-04). El webhook está escuchando.
- **PRIMERA PRUEBA END-TO-END EXITOSA** (2026-08-04): mensaje simulado "tienen empanadas de
  pino?" → el flujo corrió completo (webhook → identificación empresa/rol → memoria →
  GPT-4o → **stock_producto con empresa=1 inyectado OK** → guardar turno). El agente
  respondió con tono de panadería, emoji 🥟, y pidió aclarar horno/frita. **El riesgo del
  `empresa` en la Postgres Tool quedó RESUELTO.** Solo falló "Enviar WhatsApp" por
  credencial Meta mal configurada (ver abajo).
- **Fix arquitectura webhook:** `multipleMethods` (GET+POST en un webhook) crea 2 salidas
  y el POST sale por índice [1], no [0] → el flujo se cortaba. Solución: DOS webhooks
  separados con el mismo path `whatsapp-agent` — uno POST (mensajes) y uno GET
  ("Webhook Verificación (GET)" → responde hub.challenge). Ahora 21 nodos.
- **Fix credencial Meta:** el campo `Name` del Header Auth debe ser `Authorization` (se puso
  el nombre de la credencial por error). Value = `Bearer <token>`. CORREGIDO.
- **Fix RLS:** las 5 tablas tenían `force row level security` con 0 políticas = deny-all
  para todos. El usuario `postgres` (n8n) hace bypass igual, pero para depurar/leer con
  otros roles había que quitar el force. Script `sql/30_fix_rls_agente.sql` aplicado
  (rls=t, forced=f). El rol `agente_readonly` sigue sin poder leer las tablas del agente
  (RLS + 0 políticas), pero eso está OK: solo debe leer el ERP.
- **Fix guardado (bug de coma):** `Guardar turno` usaba `queryReplacement` que separa
  parámetros por coma → si el texto tenía comas, se desalineaban los valores (guardaba el
  message_id como content). CORREGIDO: query con valores embebidos y escape SQL
  (`.replace(/'/g,"''")`) vía expresión n8n, sin queryReplacement.
- ✅✅ **BOT COMPLETO Y FUNCIONANDO END-TO-END** (2026-08-04). Probado con mensajes reales
  simulados (incluido texto con comas): recibe → identifica empresa/rol → memoria (guarda y
  lee bien) → GPT-4o (responde como "Sofía" de panadería, con bienvenida y 🥟) → envía por
  WhatsApp (Meta acepta con wamid) → guarda turno con texto correcto. Los 3 escenarios
  técnicos delicados resueltos: `empresa` en la tool, memoria, respuesta rápida a Meta.
- Scripts SQL nuevos: `30_fix_rls_agente.sql`, `99_limpiar_pruebas.sql`.
- **Detalle menor a pulir:** cuando NO hay historial previo, `Recuperar historial` devuelve
  una fila vacía `{}` → el Code de Consolidar genera `history_text: "undefined: undefined"`.
  No rompe nada (el agente igual responde), pero conviene filtrar filas vacías.

## ✅ WhatsApp REAL conectado y funcionando (2026-08-05)

- **Meta conectado:** app "Alerta Licitaciones" (id 2127735941511300, modo Desarrollo).
  Webhook verificado (Callback `https://appcadabra-cadabra-project.jmyxxj.easypanel.host/webhook/whatsapp-agent`),
  campo `messages` **suscrito**. Número del usuario agregado como test recipient.
- **CONVERSACIÓN REAL EXITOSA:** el usuario conversó con "Sofía" desde su WhatsApp
  ("De mariscos", "Frita", "Si porfavor") → los 3 mensajes de texto procesados con `success`.
- **Fix statuses:** Meta envía eventos `statuses` (read/delivered) además de mensajes.
  Caían en la rama no-texto e intentaban responder → error. Corregido: la rama no-texto
  (IF ¿es texto? = false) solo responde 200 y termina (`"Responder 200 (no-texto)": [[]]`),
  ignorando statuses y no-texto. El IF usa optional chaining `?.` para no romper con statuses.

## 🔴→✅ Fix crítico: la tool no encontraba productos (2026-08-05)

Síntoma: Sofía respondía "no encontré información" a TODA consulta de producto (se quedaba
"pegada"). Causa raíz: la política RLS del ERP sobre `usuarios` es **RECURSIVA**
(`empresa = (select empresa from usuarios where auth_user_id=auth.uid())` dentro de la
propia política de `usuarios`), y `productos`/`productos_bodega` la referencian. El rol
`agente_readonly` (que usa `stock_producto`) NO hace bypass → Postgres lanza "infinite
recursion detected in policy for relation usuarios" y la consulta devuelve 0 filas
silenciosamente. **Fix:** `alter role agente_readonly bypassrls` (script
`sql/40_fix_readonly_bypassrls.sql`). Seguro porque el rol solo hace SELECT. Verificado:
tras el fix, `nombre ilike '%marisco%'` devuelve "EMPANADAS DE MARISCOS" (cod 10, 310, 110)
y "KILOS PINO DE MARISCO" (85). Los nombres del catálogo son MAYÚSCULAS y plural.

## 🔴→✅ Fix búsqueda de productos (2026-08-05)

Síntoma: Sofía encontraba "empanadas de mariscos" pero al pedir "de horno" se quedaba
pegada ("no encontré"). Causa: (1) la query usaba `ilike '%busqueda%'` con la FRASE
completa → "mariscos horno" no matchea nada; (2) el catálogo NO distingue horno/frita
para mariscos (solo "EMPANADAS DE MARISCOS"), aunque SÍ para pino ("EMPANADAS DE PINO
HORNO", "...SALON", "...COCTEL"). **Fix:** query reescrita a búsqueda por PALABRAS
(cada palabra debe estar en el nombre, en cualquier orden; ignora relleno:
empanada/de/al/horno/frita/hoja/etc.) usando `string_to_array` + `not exists unnest`.
Probada OK: "empanadas de mariscos al horno" → 3 resultados; "pino"/"queso" → variantes.
Prompt ajustado: buscar solo palabras clave del sabor, no asumir horno/frita si no aparece.

## ✅ Búsqueda semántica ligera (2026-08-05)

Implementado el **nivel 1: el LLM traduce la intención** (elección del usuario). Sin
infraestructura nueva. Se le dio al prompt el MAPA del catálogo real: 10 familias
(EMPANADAS 58 productos, PASTELES 30, PAN 24, SRA CARMEN, OTROS, REVELLO, CAMER, FIESTAS
PATRIAS, SOPAIPILLAS, levadura) + sabores reales (pino, queso, camarón, mariscos, champiñón,
napolitana, vegetariana, jamón queso, pollo, mechada) + formatos (horno, frita, hoja,
coctel, salón). El agente traduce "algo de mar"→mariscos, "gambas"→camarón, "hongos"→
champiñón, "dulce/postre"→PASTELES, y pasa solo la palabra clave a la tool. Nota: la base
tiene typos propios ("PÌNO", "CHAMPÌÑON") — la búsqueda por palabras los tolera parcialmente.

**Niveles superiores documentados (NO implementados, probablemente innecesarios para 169
productos):** (2) pg_trgm = búsqueda fuzzy que tolera typos del cliente ("mariskos");
activar extensión + `similarity()`. (3) pgvector = embeddings semánticos reales por
significado; generar embeddings de productos con OpenAI, guardar en columna vector, buscar
por distancia coseno. Solo si el catálogo crece mucho o las consultas son muy abiertas.

## 🔴→✅ Fixes 2026-08-05 (sesión 2)

- **Bucle "no encontré" era la credencial RO, NO la query ni temperatura.** La credencial
  `Supabase Ventas (Read-Only)` fallaba: primero por SSL (`self-signed certificate in chain`)
  → activar **"Ignore SSL Issues"**; luego `Host not found` por un CARÁCTER INVISIBLE en el
  campo Host → borrar y REESCRIBIR el host a mano `aws-1-us-west-2.pooler.supabase.com`.
  La RW funcionaba con el mismo host (tenía SSL ignore y host limpio). Tras el fix:
  "Connection tested successfully" y la tool devuelve productos.
- **Stock no confiable → Sofía decía "sin disponibilidad".** El ERP tiene `productos.stock=0`
  y `productos_bodega.stock_disponible` en NEGATIVOS grandes (no se lleva stock real; panadería
  fabrica al pedido). Fix: quité la columna de stock de la query (solo nombre + precio) y el
  prompt indica que los productos vigentes se consideran DISPONIBLES (nunca decir "sin stock"
  si la tool devolvió productos). Verificado: "empanadas de mariscos" → "Sí, tenemos
  disponibles... $972, $1.849, $798".
- Nota: el resumen dice "stock_producto: 0 filas" por cómo n8n reporta la tool, pero SÍ
  devuelve productos al agente (confirmado en la respuesta de Sofía).

## ✅ Agendamiento Google Calendar FUNCIONA (2026-08-05)

Probado end-to-end: "quiero agendar reunión jueves a las 11, soy Pedro, precios mayoristas,
pedro@test.cl" → Sofía **verificó disponibilidad**, detectó y corrigió incoherencia de fecha
(jueves=6 no 7), pidió confirmación, y al confirmar **llamó a crear_reunion → EVENTO CREADO**
en Google Calendar con invitado. Fix aplicado antes: el LLM ALUCINABA "ya está agendada" sin
llamar a crear_reunion → prompt reforzado ("cuando confirmen DEBES llamar crear_reunion;
nunca digas agendada sin haberlo hecho"). También el historial contaminado de pruebas
confundía → limpiado con 99_limpiar_pruebas.sql.

## 🔴→✅ Fix invitación por email (2026-08-05)

El evento se creaba pero SIN invitado (no llegaba correo). Fue en 3 capas:
1. `attendeesUi.values[].email` → el LLM IGNORABA ese formato (no pasaba email_invitado).
2. `attendees: ["{{ $fromAI(...) }}"]` (array LITERAL con $fromAI dentro) → el LLM sí pasaba
   el email pero n8n NO lo mapeaba al evento (attendee no se guardaba). 
3. Faltaba `sendUpdates: all` → sin eso Google crea el evento pero NO envía el correo.
**Fix final:** `attendees: "={{ [$fromAI('email_invitado', ...)] }}"` (EXPRESIÓN que construye
el array, no array literal) + `sendUpdates: "all"`. + prompt: email OBLIGATORIO. Verificado
que el LLM pasa email_invitado. ## 🔴→✅ Fix razonamiento de fechas (2026-08-05)

Sofía RECHAZABA fechas VÁLIDAS con explicaciones absurdas ("el viernes 7 no es válido porque
cae en viernes"). Causa: los LLM calculan MAL los días de la semana; mi prompt le pedía
"validar fechas" y entraba en ese cálculo erróneo. Fix: regla explícita en el prompt —
"NUNCA cuestiones ni valides el día de la semana; toma la fecha TAL COMO la dice el cliente,
conviértela a ISO, confía en el cliente; solo rechaza fechas claramente pasadas". Lección
general: NO pedir a un LLM aritmética de calendario/días de la semana.

## 🔴→✅ Fix zona horaria del evento (2026-08-05)

El evento se creaba 1 HORA ANTES (pediste 10:00, quedó 09:00). Causa: el LLM ponía offset
`-03:00` en el ISO, pero Chile en AGOSTO (invierno) usa `-04:00`. Ese offset errado desfasaba
1h. Fix: el LLM ahora pasa la hora LOCAL SIN offset (`2026-08-07T10:00:00`) y el nodo
crear_reunion tiene `additionalFields.timezone = America/Santiago` (objeto __rl) que aplica
la zona correcta automáticamente. También verificar_disponibilidad pide hora sin offset.
Lección: NO dejar que el LLM ponga el offset de zona horaria (se equivoca -03/-04); pasar
hora local + timezone en el nodo.

## ✅✅ AGENDAMIENTO 100% FUNCIONAL (2026-08-05, verificado por el usuario)

Probado end-to-end desde WhatsApp: evento creado con hora CORRECTA (10-11), invitado listado,
correo de invitación recibido, sin rechazar fechas válidas. Las dos funciones estrella del bot
(consultas de productos + agendamiento con invitación) están completas y confiables.

## Nuevas herramientas (una a la vez)

- ✅ **`ventas_periodo`** (2026-08-05): "cuánto se vendió en enero 2026?" → Sofía traduce a
  fechas y devuelve total CLP + documentos. Probado: enero 2026 = $58.978.837 / 1.027 docs.
  Query filtra por `fecha_documento` en rango (hasta exclusivo). Solo para owner (nota en prompt).
  22 nodos ahora.
- 🆕 **`mostrar_menu`** (2026-08-05): MENÚ INTERACTIVO de WhatsApp (lista con botones nativos).
  Tool HTTP Request (`httpRequestTool` v4.2) que envía un mensaje `type:interactive/list` a la
  Graph API. Menú DISTINTO por rol (owner: ventas/top/deuda/buscar/agendar; cliente:
  productos/precios/agendar) — el LLM elige tipo_menu. Cuando el usuario TOCA una opción,
  Meta manda `interactive.list_reply.id` → `Extraer campos` lo convierte a texto (el id) → el
  agente lo interpreta (ver prompt). El `IF ¿es texto?` ahora acepta `text|interactive` (regex).
  OJO: al agregar tools NUEVAS con credencial, hay que aplicarles el ID real de la credencial
  (el generador pone REEMPLAZAR_*); se hizo para mostrar_menu (Meta cred AkIBFXVUDXwvv1ta).
  ✅ PROBADO en vivo. **Cambio: de `list` (popup/modal) a `button` (3 botones INLINE sin popup)**
  a pedido del usuario. Límite: 3 botones (no 10 como list) y título máx 20 chars. Owner:
  [Ventas][Buscar producto][Agendar reunión]. Cliente: [Ver productos][Precios][Agendar]. El
  texto del menú además invita a escribir directo las opciones que no caben en botones (top
  productos, deuda). Funciona bien.
- ✅ **`top_productos`** (2026-08-05): ranking de más vendidos por período. Probado: enero 2026
  top1 = Empanadas de Pino Horno $24.2M/13.105u. Params: desde/hasta, limite (default 5), orden
  (monto/unidades). Solo owner. 24 nodos.
- ✅ **`saldo_cliente`** (2026-08-06): deuda de un cliente buscándolo por nombre/apellido/razón
  social. Cruza `saldos_clientes` + `clientes` por rut. Probado: "cuánto me debe Guerrero" →
  "Guerrero Acevedo Nelly del Carmen: $368.935.750". Solo owner. NO muestra línea de crédito
  (el ERP la tiene en 0, no confiable). saldos_clientes: 370 clientes, 358 con deuda,
  deuda total $5.341M. 25 nodos, 7 herramientas.

Las 3 herramientas de gestión del menú owner están COMPLETAS: ventas_periodo, top_productos,
saldo_cliente.

Nota: ROLES no se prueban más (será para 1 solo cliente). El sistema de roles queda como está
(funciona: owner ve todo, anon solo catálogo — verificado que anon rechaza dar costos).

## ✅ Fix consulta de catálogo abierta + insumos (2026-08-12)

Verificado en vivo desde WhatsApp. Dos problemas detectados en una captura del usuario y corregidos
(deploy por API con `n8n/deploy_prompt.js`; systemMessage 10.431 → 12.464 chars):

1. **"qué productos tienes?" caía en la bienvenida** (el LLM lo clasificaba como saludo genérico) y,
   al insistir, **recitaba las familias/sabores DE MEMORIA** (los que están en el prompt), sin llamar
   a `stock_producto` → sin nombres ni precios reales. Fix en el system prompt:
   - Regla nueva: "qué productos/qué venden/qué hay" NO es saludo → es consulta de catálogo.
   - Sección nueva **"Consulta de catálogo abierta"**: menciona las FAMILIAS y ofrece profundizar
     ("¿de cuál te muestro los productos con precio?"); solo al elegir una familia/sabor llama a
     `stock_producto` con esa palabra. Aclarado que la lista de familias del prompt es SOLO para
     interpretar intención, NO para responder de memoria.

2. **"qué insumos?" → Sofía inventó "leche y azúcar"** (productos que NO existen en la BD). Dos causas:
   - La familia de insumos se llama **`OTROS`**, no "INSUMOS" → buscar "insumos" no matcheaba nada.
     Fix: el prompt traduce "insumos/ingredientes/materias primas" → buscar "OTROS"; y "OTROS/insumo/
     insumos/producto/productos" se añadieron a las palabras de relleno ignoradas por la query.
   - La familia OTROS mezcla insumos reales (levadura, pino en kilos, aceitunas, orégano, quesos) con
     **basura contable** ("GUIAS EMITIDAS $830.336", "FLETE", "SEGUN GUIAS DE DESPACHO", totales). Fix
     en la query de `stock_producto`: `and lower(p.nombre) !~ '(guia|flete|emitidas|segun guias)'`
     (verificado: excluye las 5 filas basura, conserva las 9 reales; no afecta otras búsquedas).
   - Regla dura reforzada: PROHIBIDO nombrar productos concretos de memoria; si `stock_producto` da
     vacío, decirlo honestamente y ofrecer otra familia o un vendedor — nunca rellenar con supuestos.

   Verificado en vivo (2026-08-12): "qué insumos?" lista KILO DE PINO $7.143, ACEITUNAS $4.034, JAMON
   ABUELO $9.916, LEVADURA $2.000, ORÉGANO $134... (reales, sin guías/fletes). "qué otros productos?"
   ofrece las categorías con buen manejo de contexto.

   **Datos del ERP descubiertos (empresa 1, productos vigentes por familia):** EMPANADAS 58, PASTELES
   30, PAN 24, SRA CARMEN 15, OTROS 12 (de los cuales ~8 insumos reales), REVELLO 10, CAMER 9,
   "FIETAS PATRIAS" 5 (typo de origen: falta la S de FIESTAS), SOPAIPILLAS 4, levadura 2.

   **Nota de acceso:** la REST API de Supabase (PostgREST) devolvía 503 PGRST002 (schema cache) por
   inactividad; se consultó por psql 15 vía pooler (`aws-1-us-west-2.pooler.supabase.com:5432`,
   user `postgres.cexowmypklxngbjsxryf`). El regex en psql debe ir en ASCII (las tildes daban
   "invalid byte sequence for encoding UTF8"). La `N8N_API_KEY` del `.env` es un JWT de n8n sin `exp`
   (no expira); estaba entre comillas y el usuario se las quitó.

## ✅ Tono chileno + fix menú (2026-08-12, verificado en vivo)

Tras el fix de catálogo/insumos, el usuario pidió que Sofía hable **español chileno** de verdad
(las respuestas sonaban neutras). Cambios (deploy por API):

1. **Tono chileno cálido-profesional** (elección del usuario: cálido pero prolijo, para clientes
   mayoristas B2B). Sección "Tono y estilo" del prompt reescrita con guía concreta: trato de USTED
   amable ("¿qué anda buscando?", "le muestro", "cualquier cosa me dice"), muletillas suaves
   permitidas (dale, ya, listo, acá, al tiro, harto, porfa) y EVITAR jerga fuerte (cachái, po,
   bacán, la raja, weá) por ser demasiado informal para B2B; también evitar neutro/España
   ("¿desea?", "no dude en"). Bienvenidas reescritas ("¿Qué necesitas?" → "¿Qué anda buscando?").

2. **Menú estaba en ARGENTINO, no chileno.** El texto de los botones NO viene del prompt: está
   HARDCODEADO en el `jsonBody` del nodo `mostrar_menu` (httpRequestTool). Decía "¿Qué querés
   hacer? Elegí una opción o escribime" (rioplatense). Corregido a "¿Qué anda buscando? Elija una
   opción o escríbame directo" (owner) y "¿En qué le ayudo? Elija una opción o escríbame su
   consulta" (cliente). Deploy quirúrgico que sincroniza SOLO `parameters.jsonBody` de mostrar_menu
   (`scratchpad/deploy_menu.js`), preservando el resto del nodo.

3. **BUG del mensaje fantasma tras el menú (resuelto a nivel de FLUJO).** Al escribir "menú",
   Sofía enviaba el menú y ADEMÁS un segundo mensaje suelto (primero "¿Qué cliente le interesa
   consultar para ver su deuda?", luego un "👇"). Causa raíz: el **AI Agent de n8n está obligado a
   emitir un texto final después de usar una tool**; como `mostrar_menu` ya envía el menú por su
   cuenta (HTTP a Graph API), ese texto final del agente se enviaba de más por "Enviar WhatsApp".
   El prompt solo (reglas "no agregues texto", "el turno termina") NO basta — es estructural del
   AI Agent. **Fix definitivo:** nodo nuevo **"IF ¿enviar texto?"** interpuesto entre "Guardar
   turno" y "Enviar WhatsApp". Condición: `{{ (($('AI Agent').first().json.output || '').split('👇').join('').trim().length) > 0 }}`
   → rama true = enviar; rama false (texto vacío o solo "👇"/espacios) = no enviar nada. "Guardar
   turno" sigue registrando el turno siempre (no se pierde historial). El workflow pasó de 25 a
   **26 nodos**. Verificado en vivo: "menú" ahora sale LIMPIO (solo botones), y al tocar un botón
   (ej. "Buscar producto") el flujo responde bien.
   - LECCIÓN: al escribir expresiones n8n vía script, `\s` en un regex se rompe al escapar por
     bash/JSON (queda `/s/` = borra las "s"). Usar `.split(x).join('')` + `.trim()` en vez de regex
     con clases de escape. Scripts de esta sesión en scratchpad: `deploy_menu.js`, `add_menu_guard.js`,
     `fix_if_cond.js`, `sync_local_json.js`. El nodo IF y sus conexiones ya están sincronizados al
     JSON local `n8n/workflow_agente_min.json` (26 nodos).
   - PENDIENTE MENOR: al suprimir el envío, "Guardar turno" igual registra "👇" como turno del
     asistente (cosmético, inofensivo; el prompt pide responder espacio/👇 y el IF lo filtra).

## ✅ "Ver productos" ahora muestra CATÁLOGO navegable (2026-08-12, verificado en vivo)

El usuario notó que al tocar "Buscar producto" el bot pedía el nombre a ciegas — poco útil para un
consumidor que no sabe qué pedir. Decisión: **familias primero, luego productos con precio** (sin
nodos nuevos, solo prompt). Cambios:
- En la sección "Menú interactivo", el ID 'buscar_producto'/'ver_productos'/'precios' ahora NO pide
  nombre a ciegas: MUESTRA las categorías (Empanadas 🥟, Pasteles, Pan, Sopaipillas, Insumos) y al
  elegir una, usa stock_producto y lista con precio.
- Sección nueva **"Categorías para mostrar al cliente"**: mapea nombre amigable → término de búsqueda
  real. Verificado contra la BD (query real) que cada término devuelve productos:
  empanada→121 (Sofía pregunta el sabor primero, no lista todas), PASTELES→30, PAN→22,
  **sopaipillas→3** (OJO: en PLURAL; "sopaipilla" singular daba 0 por el match de palabra completa),
  OTROS(insumos)→8, SRA CARMEN→15, REVELLO→8, CAMER→8, "FIETAS PATRIAS"→4 (typo del sistema).
- Corregido dato viejo del prompt: los insumos NO son "leche y azúcar" (no existen) → son levadura,
  pino/masas en kilos, aceitunas, orégano, quesos.
- Verificado en vivo: [Buscar producto] → ofrece categorías → "insumos" lista los 8 reales con precio,
  numerados, nombres legibles (no MAYÚSCULAS), sin basura contable, cierre en tono chileno.
- OPCIONAL futuro (no hecho): presentar las familias como LISTA interactiva tocable de WhatsApp
  (más "appy") en vez de texto — requiere un nodo/tool nuevo.

## ✅✅ VALIDACIÓN FUNCIONAL COMPLETA — las 7 tools (2026-08-06)

Tanda de validación guiada desde WhatsApp (rol owner). Checklist en `CHECKLIST_VALIDACION.md`.
Todas las herramientas OK. Fixes aplicados esta sesión (deploy por API con `n8n/deploy_prompt.js`):

1. **Saludo sin menú duplicado.** Antes "hola" mandaba menú de botones + texto "Hola soy Sofía"
   (2 mensajes). Ahora responde UN solo texto de bienvenida (distinto por rol owner/customer);
   el menú de botones solo aparece si el usuario escribe "menú". Fix en el system prompt
   (secciones Bienvenida + Menú + regla dura "SALUDO SIN MENÚ"). Texto: "escribe menú para ver
   las opciones".
   - LECCIÓN CLAVE: editar el nodo AI Agent en la UI de n8n NO estaba guardando (el prompt
     seguía en la versión vieja, 10.075 chars). Se resolvió con **deploy por API**
     (`deploy_prompt.js`): baja el workflow real, parchea systemMessage + parameters de nodos
     concretos, y hace PUT. Preserva credenciales por ID. El JSON local NO se sincroniza solo.
2. **Búsqueda de productos por FAMILIA + palabra completa.** "tienen pan?" devolvía
   "no encontré" porque (a) buscaba solo en `productos.nombre`, no en la familia, y (b) usaba
   `like '%pan%'` → "pan" matcheaba dentro de "emPANada" (falsos positivos). Fix: LEFT JOIN a
   `familias` (productos.cod_familia = familias.codigo) + match por PALABRA COMPLETA con regex
   `!~ '\y'||w||'\y'` en nombre Y familia. Verificado en SQL (`sql/62_verificar_fix.sql`) antes
   de deployar: "pan"→24 panes reales, "pino"→pinos, "sopaipillas"→familia SOPAIPILLAS. Scripts
   de diagnóstico: `sql/60_diag_familias.sql`, `61_diag_pan_query.sql`, `62_verificar_fix.sql`.
   - Dato del ERP: "EMPANADAS DE POLLO" está mal clasificada en familia PAN (dato de origen).
3. **Historial: límite 20→10 turnos** (menos contexto viejo que confunde al LLM).
4. **Fila vacía de historial** ("undefined: undefined"): `Consolidar contexto` ahora filtra
   filas sin role/content antes de armar history_text.

Resultados verificados (coinciden con datos reales): ventas enero 2026 = $58.978.837 / 1.027
docs; top1 = Pino Horno $24.244.236 (13.105u); deuda Guerrero Acevedo Nelly = $368.935.750.
Agendamiento end-to-end OK (verifica disponibilidad → confirma → crea evento con invitado).

PENDIENTE de esta línea: probar roles customer/anon desde un SEGUNDO número (requiere agregarlo
como test recipient en Meta, app en modo Desarrollo). El saludo de customer/anon ya está en el
prompt (reducido: solo productos/precios/agendar), pero no probado en vivo.

## 🔒 Seguridad — rotación de credenciales (2026-08-06)

- [x] **API Key de n8n ROTADA** (2026-08-06). Se creó una key nueva y se revocó la que
      expiraba el 2026-08-13. Guardada en el gestor del usuario. Hueco preparado en
      `Modulo ventas/.env` → `N8N_API_KEY=` (vacío; se pega solo al hacer un deploy por API,
      cabecera `X-N8N-API-KEY`). No la usa el bot en runtime. Guía: `ROTACION_CREDENCIALES.md`.
- [ ] Cambiar pass rol `agente_readonly` (`123456` → fuerte). SQL listo en
      `sql/50_rotar_credenciales.sql` (conserva BYPASSRLS). Pendiente de ejecutar.
- [ ] Rotar pass DB `postgres` (`Motoco.2026`, pasó por chat). Reset en Supabase +
      actualizar credencial RW de n8n (~4 nodos). Pendiente.

## ⏳ Pendiente

1. Pulir: filtrar fila vacía cuando no hay historial ("undefined: undefined", inofensivo).
2. Pulir: filtrar fila vacía cuando no hay historial ("undefined: undefined", inofensivo).
3. Agregar más tools (ventas_periodo, saldo_cliente, etc.).
4. Considerar: bajar el límite de historial de 20 a ~10 turnos (evita traer contexto viejo).
5. Camino a PRODUCCIÓN Meta (verificación negocio + token permanente + app "En vivo").
6. SEGURIDAD: rotar API key n8n (expira 2026-08-13) + cambiar pass rol readonly (123456) +
   la pass de la DB `Motoco.2026` pasó por el chat → rotarla en Supabase.
4. Agregar demás tools (ventas_periodo, precio_producto, saldo_cliente, etc.).
5. Para PRODUCCIÓN: verificación de negocio en Meta + token permanente + pasar app a "En vivo".
6. Seguridad: cambiar pass rol `agente_readonly` + rotar API key n8n (expira 2026-08-13).
4. **Agregar las demás tools** (ventas_periodo, precio_producto, etc.).
5. **Antes de producción:** cambiar contraseña de `agente_readonly` y **rotar la API Key
   de n8n** (expira 2026-08-13, pasó por el chat).

## Sobre el negocio (contexto para el prompt)

El ERP es de una **panadería/pastelería mayorista** chilena. Giro: fabricación de pan y
lácteos. Producto estrella: **EMPANADAS** (decenas de variantes: pino, queso, mariscos,
camarón queso, napolitana, vegetariana, champiñón queso; horno/fritas/hoja). 10 familias:
EMPANADAS, PASTELES, PAN, SOPAIPILLAS, levadura/OTROS (insumos como leche, azúcar), líneas
propias (SRA CARMEN, REVELLO, CAMER), FIESTAS PATRIAS (estacional). Vende **al por mayor**
a restaurantes, sushis y almacenes (listas de precios segmentadas: Restaurant, Sushi,
Almacenes, CARYMAR, ofertas). 360 clientes (mayoría negocios por apellido), 32 sucursales/
puntos en Santiago, reparto en ruta, 2 vendedores (OFICINA, COMERCIAL). Condiciones:
efectivo, cheque (día/5/7/15), crédito 7 días, cobra vendedor, solo firma. Maneja
cuenta corriente/crédito y cobranza. Volumen: 455.962 movimientos de venta desde ~2017.
El módulo de compras nunca se usó (tablas vacías).

**El system prompt YA está personalizado a este negocio** (empanadas mayoristas, tono de
panadería de barrio, unidades por docena, escalar a vendedor para pedidos/crédito/despacho,
mensaje de bienvenida). Desplegado 2026-08-04.

---

## Notas técnicas / lecciones aprendidas (carga de datos)

Contexto útil por si hay que recargar o replicar en otro cliente:

- **psql:** el equipo tiene psql **15** en `C:\Program Files\PostgreSQL\15\bin\psql.exe`
  (NO en PATH; `winget` no está instalado). Se conecta bien al servidor 17 de Supabase.
- **Sintaxis PowerShell que funciona:**
  `& $psql --dbname=$DB --file="..."` y `--command="..."`.
  El `-c "..."` simple fallaba (PowerShell partía los argumentos).
- **Connection string:** botón verde **Connect** del dashboard → **Session pooler** (puerto 5432).
- **Errores inofensivos que se ignoran:**
  - `\restrict` / `\unrestrict` → directivas de pg_dump 17 que psql 15 no reconoce.
  - `keyword_sinonimos_id_seq does not exist` → secuencia de una tabla que no está en las 144.
- **Fix aplicado a `10_agente_schema.sql`:** los triggers usaban `extensions.moddatetime`
  (esquema explícito) → causaba ROLLBACK de toda la transacción. Corregido a
  `create extension if not exists moddatetime;` + `execute function moddatetime(updated_at)`
  SIN prefijo de esquema, igual que hace `01_schema.sql` del ERP.
- **`filtrar_backup_por_fecha.py`:** el backup usa INSERT multi-fila y algunos valores de
  texto tienen **saltos de línea internos** (ej. `texto_boleta`). La primera versión partía
  esas filas; se corrigió acumulando líneas hasta completar la fila (balance de comillas).
  El script tarda ~5 min sobre los 249 MB.
- **Rango del histórico del ERP:** ~2017-2026, grueso en 2022-2025. Boletas y notas de
  crédito/débito no se usan desde ~2016 (por eso quedan en 0 al filtrar a 2025+).

---

## 🆕 MULTIMODAL — audio, foto y PDF (2026-08-13, construido, PENDIENTE probar en vivo)

Se añadió al agente la capacidad de procesar **notas de voz, fotos y documentos PDF**
(antes descartaba todo lo que no fuera texto). Inspirado en el producto de referencia
de Innovarketing (workflow n8n multimodal), sobre la base técnica ya validada. Modelo:
**GPT-4o** (Vision) + **Whisper** (audio). Detalle completo en [`MULTIMODAL.md`](./MULTIMODAL.md).

**Dos workflows nuevos (versionados en `n8n/`):**
- `workflow_agente_multimodal.json` — Sofía (panadería) multimodal: copia del de
  producción (26 nodos) + ramas multimodales = **38 nodos**. Conserva intacto roles,
  memoria y las 7 tools; sólo cambia la ENTRADA.
- `workflow_multimodal_base.json` — **plantilla genérica** (23 nodos), sin ERP, memoria
  en RAM (Window Buffer). Producto reutilizable para nuevas pymes. Placeholders
  `{{NOMBRE_ASISTENTE}}` / `{{NOMBRE_NEGOCIO}}`.

**Patrón:** el viejo `IF ¿es texto?` se reemplazó por un **Switch por tipo** (texto/
audio/image/document/otros). Cada media: `GET /{media_id}` → descargar binario →
transformar a texto (Whisper / GPT-4o Vision por HTTP / Extract from File PDF) →
normalizar al shape de `Extraer campos` → **converge en el pipeline existente**
(`Resolver empresa` → … → AI Agent → enviar). Cada rama responde HTTP 200 ANTES de
procesar (regla anti-duplicados Meta, Whisper/Vision tardan >5s).

**System prompt:** sección nueva "Mensajes multimodales" en `system_prompt_nuevo.txt`
(sincronizada al JSON) — explica a Sofía las envolturas `[El cliente envió una IMAGEN...]`,
que identifique productos por foto (→ `stock_producto`) y que no mencione tecnicismos.
El txt creció a ~17.7k chars.

**Deploy:** `deploy_multimodal.js` (NUEVO) hace PUT/POST del grafo completo heredando
credenciales del workflow de producción (por nombre de nodo; nodos nuevos por tipo de
cred). Modo `--new` (crea workflow inactivo, seguro para probar) o `--replace` (reemplaza
producción, sólo tras validar). `deploy_prompt.js` sigue sirviendo para cambios de sólo prompt.

**✅✅ VALIDADO END-TO-END POR WHATSAPP REAL (2026-08-13).** Se desplegó como workflow
NUEVO (id `nI1fEpupB3WKHgZ2`, "Cadabra · Agente WhatsApp Multimodal") con
`deploy_multimodal.js --new`, y se probó en vivo desactivando producción y activando el
multimodal en el mismo número (`activar_multimodal.js`, tiene `--revert`). Las 4 pruebas OK:
- 🎤 **Audio (Whisper):** nota de voz "¿tienen empanadas de mariscos, a cuánto salen?" →
  transcribe → llama stock_producto → responde con precios reales ($972/$1.849/$798). ✅
- 📷 **Imagen (GPT-4o Vision):** foto de empanadas → "parece empanadas de pino 🥟" →
  stock_producto → precios reales de pino. ✅
- 📄 **Documento (PDF):** "Lista de precios.pdf" → Extract from File extrae texto →
  interpreta (3 empanadas horno + 3 mariscos) → ofrece derivar a vendedor. ✅
- ✍️ **Regresión texto/menú/botones:** "hola", "menú" (3 botones sin fantasma), tocar
  "Buscar producto" → categorías. Todo intacto. ✅

**Bugs corregidos durante la validación (2026-08-13):**
1. **Credencial OpenAI rota → "Authorization failed" en Whisper.** El campo *Organization ID*
   de la credencial OpenAI tenía el texto libre `cadabra` (inválido; debe ser un `org-...` o
   vacío). Afectaba audio, Vision y chat. Fix: vaciar Organization ID → "Connection successful".
2. **Vision → "Bad request / Invalid base64 image_url".** El `jsonBody` del HTTP leía el base64
   con `$binary.data.data` → daba `undefined` (URL terminaba en `base64,undefined`). Fix: nodo
   nuevo **"Preparar Vision"** (Code) entre "Switch media descargada" (image) y "GPT-4o Vision":
   lee el binario con `this.helpers.getBinaryDataBuffer(0,'data')` → base64 fiable → arma el body
   OpenAI en `$json.openai_body`; el HTTP node envía ese string. Workflow 38→**39 nodos**.
   LECCIÓN: para pasar binarios a un HTTP Request en n8n, construir el base64 en un nodo Code
   (getBinaryDataBuffer), NO con `$binary.*` dentro de la expresión del jsonBody.
3. **Saludo con nombre equivocado ("Jorge").** No venía de Meta ni de la base: una nota de voz
   de prueba transcribió mal el nombre, quedó en `conversation_history` y el LLM lo tomó del
   historial. `agente_contactos.nombre_contacto` = "Edgardo" (correcto) NO se pasaba al prompt.
   Fix (decisión del usuario "usar nombre solo si está en la base"): (a) `Consolidar contexto`
   ahora incluye `nombre_contacto`; (b) prompt: sección "Cómo tratar al cliente por su nombre"
   → usar el nombre SOLO si "Nombre del contacto" tiene valor real, NUNCA inventarlo ni sacarlo
   del historial (una transcripción puede errar el nombre). (c) limpiado el historial de pruebas
   con `sql/99_limpiar_pruebas.sql` (132 filas). Verificado en vivo: ahora saluda "¡Hola Edgardo!".

**Scripts nuevos (en `n8n/`):** `deploy_multimodal.js` (--new/--replace), `activar_multimodal.js`
(--revert), `push_multimodal.js` (sube JSON local al multimodal preservando credenciales),
`diag_ejecuciones.js` / `diag_transcripcion.js` / `diag_switch.js` / `diag_vision.js` /
`diag_cred_whisper.js` / `diag_nombre.js` (diagnóstico por API de ejecuciones/credenciales).

**Nota:** los eventos `statuses` de Meta (entregado/leído) caen correctamente en la rama
"otros" del Switch (sin `messages`) y no generan respuesta — es el comportamiento esperado.

**PENDIENTE:** (1) volver el número a producción cuando se termine de probar (`activar_multimodal.js
--revert`) o decidir dejar el multimodal como el activo. (2) Sincronizar los fixes al workflow de
producción `s3rtqAowJhIXvBUU` si se quiere el multimodal en producción (hoy prod sigue solo-texto).
(3) Personalizar la plantilla base `workflow_multimodal_base.json` para el primer cliente nuevo.

---

## 🔜 Funcionalidades diferidas (decididas, aún NO se implementan)

### `tomar_pedido` — toma de pedidos mayoristas por WhatsApp
- **Estado:** DIFERIDA a propósito (decisión del usuario, 2026-08-04). Por ahora el agente
  solo capta la intención de pedido y **escala a un vendedor**; no registra pedidos.
- **Qué implicaría:** una tool nueva que registre pedidos del cliente mayorista (productos,
  cantidades por docena/unidad, condición de pago, despacho por ruta), probablemente
  escribiendo en tablas del ERP (`nota_venta_cab/det` o `pedidos_clientes`, hoy vacías) o
  en una tabla nueva `agente_pedidos`. Requiere manejar crédito/cuenta corriente y validar
  el cliente. Es delicado porque escribe transacciones reales.
- **CONDICIÓN PARA RETOMAR / notificar al usuario cuando:** el MVP esté funcionando
  end-to-end en producción (credenciales creadas, webhook Meta conectado, pruebas de stock
  + agenda + roles OK, y las tools de consulta ya en uso real). En ese punto avisar a Edy
  que "estamos en condiciones de implementar `tomar_pedido`" y confirmar el alcance
  (¿solo registra para que el vendedor confirme, o cierra el pedido?).
