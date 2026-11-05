# MULTIMODAL — Agente WhatsApp con audio, foto y PDF

> Añade a "Sofía" (y a una plantilla genérica reutilizable) la capacidad de
> entender **notas de voz, fotos y documentos PDF**, no sólo texto. Inspirado en
> el producto de referencia de Innovarketing (workflow n8n multimodal), pero
> construido sobre la base técnica ya validada de Cadabra.
>
> Modelo: **OpenAI GPT-4o** (Vision nativo) + **Whisper** (audio). Fuente de verdad
> del diseño: [`CLAUDE.md`](./CLAUDE.md); bitácora: [`ESTADO.md`](./ESTADO.md).

---

## Qué se construyó

Dos workflows n8n nuevos (versionados en `n8n/`):

1. **`workflow_agente_multimodal.json`** — el agente de la **panadería** (Sofía),
   ahora multimodal. Es una **copia** de `workflow_agente_min.json` (producción,
   26 nodos) con las ramas multimodales añadidas → **38 nodos**. Conserva intacto
   TODO lo que ya funciona: roles, memoria, las 7 tools (stock/ventas/top/deuda/
   menú/agenda) y el envío. Sólo cambia la ENTRADA: en vez de descartar lo que no
   es texto, ahora lo procesa.

2. **`workflow_multimodal_base.json`** — **plantilla genérica** (23 nodos), SIN
   ERP ni tools de negocio, con memoria en RAM (Window Buffer). Es el producto
   reutilizable para desplegar rápido a nuevas pymes. Placeholders a editar por
   cliente: `{{NOMBRE_ASISTENTE}}`, `{{NOMBRE_NEGOCIO}}`, el system prompt y las
   credenciales.

---

## Cómo funciona (el patrón multimodal)

Cuando llega un mensaje, Meta manda `...messages[0].type`. El workflow lo separa
con un **Switch por tipo** (reemplaza al viejo `IF ¿es texto?`):

```
Webhook POST
  └─ Switch tipo mensaje
       ├─ texto/interactive → Responder 200 (texto) → Extraer campos → [flujo existente]
       ├─ audio    → Responder 200 (media) → Extraer media → Obtener URL → Descargar
       ├─ image    →      "        "        →      "        →     "      →    "
       ├─ document →      "        "        →      "        →     "      →    "
       │             └─ Switch media descargada:
       │                  ├─ audio    → Whisper transcribir  → Normalizar audio  ─┐
       │                  ├─ image    → GPT-4o Vision (HTTP)  → Normalizar imagen ─┤
       │                  └─ document → Extraer texto PDF     → Normalizar doc    ─┤
       │                                                                          │
       │                          (todas producen user_message + from + ...)      │
       │                                        ▼                                  │
       │                                  Resolver empresa  ◄──────────────────────┘
       │                                  [resto del pipeline: rol, memoria,
       │                                   AI Agent GPT-4o + tools, guardar, enviar]
       └─ otros (video/sticker/ubicación/statuses) → Responder 200 (otros) →
              ¿es mensaje? → aviso amable "puedo leer texto, voz, fotos y PDF"
```

Cada tipo de media sigue 3 pasos comunes: **obtener URL** (`GET /{media_id}`) →
**descargar binario** (con el token Meta) → **transformar a texto**:
- **audio** → nodo OpenAI (resource `audio` / `transcribe`, Whisper, idioma es).
- **image** → HTTP a `api.openai.com/v1/chat/completions` con GPT-4o Vision
  (imagen en base64 data-URI). El prompt le pide identificar producto o transcribir
  documento, en contexto de panadería (en la plantilla base, genérico).
- **document** → nodo `Extract from File` (PDF → texto). Si viene vacío (PDF
  escaneado), el mensaje se lo dice al agente para que pida una foto.

El texto resultante se **normaliza al mismo shape** que produce `Extraer campos`
(`from`, `phone_number_id`, `user_message`, `message_id`) y **converge** en el
pipeline existente. Por eso roles, memoria y tools funcionan sin cambios.

### Regla de oro anti-duplicados de Meta
Cada rama responde **HTTP 200 ANTES** de descargar/procesar (Whisper y Vision
tardan >5s). Nodos `Responder 200 (texto/media/otros)`. Igual que ya hacía el bot.

---

## System prompt

Se añadió una sección **"Mensajes multimodales"** a
`n8n/system_prompt_nuevo.txt` (y ya sincronizada en el JSON multimodal): explica
a Sofía que el "mensaje" puede venir de una transcripción o de la lectura de una
foto/PDF, cómo reconocer cada envoltura (`[El cliente envió una IMAGEN...]`), que
identifique productos por foto y los busque con `stock_producto`, y que NUNCA
mencione al cliente frases técnicas como "lectura automática". Las reglas de
seguridad por rol siguen aplicando igual (una foto no cambia qué puede revelar).

---

## Deploy

### Opción segura (recomendada): probar SIN tocar producción
El workflow de producción `s3rtqAowJhIXvBUU` está **ACTIVO con clientes reales**.
No lo reemplaces hasta validar. Dos caminos:

- **A) Crear un workflow nuevo** con el JSON multimodal (queda inactivo):
  ```powershell
  cd n8n
  $env:N8N_API_KEY = "<key>"    # está el hueco en Modulo ventas/.env
  node deploy_multimodal.js --new
  ```
  `deploy_multimodal.js` **hereda las credenciales** del workflow de producción
  (por nombre de nodo; los nodos nuevos, por tipo de credencial). OJO: el nuevo
  usa el mismo webhook path `whatsapp-agent`; para probarlo en vivo, desactiva
  temporalmente el de producción o cambia el path del webhook nuevo.

- **B) Importar el JSON a mano** en la UI de n8n (Import from File) y enlazar
  credenciales manualmente.

### Reemplazar producción (sólo cuando esté validado)
```powershell
node deploy_multimodal.js --replace   # PUT sobre s3rtqAowJhIXvBUU
```
Luego, para futuros cambios de SÓLO prompt, sigue sirviendo `deploy_prompt.js`
(el `system_prompt_nuevo.txt` es la fuente).

---

## Verificación end-to-end (probar cada rama por WhatsApp real)

1. **Audio:** manda una nota de voz ("¿tienen empanadas de mariscos?") → Whisper
   transcribe → Sofía responde usando `stock_producto`. Revisa `conversation_history`.
2. **Imagen:** manda una foto de un producto → Vision la describe → Sofía la
   relaciona con el catálogo y da nombre/precio reales. No debe decir "lectura
   automática".
3. **Documento:** manda un PDF (ej. lista de pedido) → texto extraído → Sofía lo
   interpreta y ofrece derivar a vendedor. Prueba también un PDF escaneado
   (debe pedir una foto).
4. **Texto/interactive (regresión):** confirma que NO se rompió nada — saludo sin
   menú, "menú", tools de ventas/top/deuda, agendamiento Calendar.
5. **Anti-duplicados:** en Executions de n8n, verifica 200 <5s en todas las ramas
   (que Meta no reintente el mensaje).
6. **Roles:** que un customer/anon siga sin ver costos aunque mande una foto.

---

## Estado: VALIDADO end-to-end (2026-08-13)

Las 3 ramas + regresión de texto se probaron por WhatsApp real y funcionan. Detalle
y bugs corregidos en [`ESTADO.md`](./ESTADO.md) (sección "VALIDADO END-TO-END").
Workflow de prueba: id `nI1fEpupB3WKHgZ2`. Para operarlo:
`node activar_multimodal.js` (multimodal en vivo) / `--revert` (volver a producción);
`node push_multimodal.js` (subir cambios del JSON local preservando credenciales).

## Lecciones aprendidas (ya resueltas en pruebas)

- **Credencial OpenAI — Organization ID:** debe ir VACÍO o un `org-...` válido. Un
  texto libre (ej. "cadabra") hace fallar TODO con "Authorization failed" (Whisper,
  Vision y chat).
- **Base64 para Vision:** NO leer el binario con `$binary.data.data` dentro del
  jsonBody del HTTP node (da `undefined`). Usar un nodo Code previo ("Preparar Vision")
  con `this.helpers.getBinaryDataBuffer(0,'data')` → base64 fiable → armar el body ahí.
- **Nombre del cliente:** usar SOLO `agente_contactos.nombre_contacto` (base). NUNCA
  del historial: una transcripción de nota de voz puede errar el nombre y contaminarlo.
- **statuses de Meta** (entregado/leído) caen bien en la rama "otros" del Switch.

## Notas que siguen vigentes

- **typeVersions (n8n 2.33.3):** Whisper `@n8n/n8n-nodes-langchain.openAi` **v1.8**,
  `switch` **v3.2**, `extractFromFile` **v1** — verificados OK en esta instancia.
- **`system_prompt_nuevo.txt`** (~18.5k chars) incluye la sección multimodal + la regla
  del nombre. Si haces `deploy_prompt.js` sobre el workflow de SÓLO texto de producción,
  también le aplicará esas secciones (inofensivo, pero tenlo en cuenta).
- **Costo API:** Whisper y Vision consumen más que sólo texto → reflejar en la
  mensualidad del cliente (ver encaje comercial en el plan).
