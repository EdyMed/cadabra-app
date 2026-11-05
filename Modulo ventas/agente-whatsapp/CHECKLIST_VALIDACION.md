# ✅ Checklist de validación funcional — Agente WhatsApp (Sofía)

Pruebas guiadas para verificar las 7 herramientas antes de producción.
Ejecutar desde el número **owner** (56995649108). Marcar cada casilla.

> Contexto: panadería/pastelería mayorista, tenant empresa=1. Fuente de verdad: `CLAUDE.md`.
> Fecha de referencia actual del bot: usa `{{ $now }}` (hoy). Datos reales: 2025-2026.

---

## 0. Saludo (ya validado 2026-08-06)
- [x] "hola" → un solo texto, sin menú, redacción de owner. ✅
- [x] "menú" → 3 botones (Ventas / Buscar producto / Agendar reunión). ✅

## 1. stock_producto — búsqueda de productos y precios  ✅ (2026-08-06)
- [x] **"¿tienen empanadas de pino?"** → 7 variantes con precios. OK.
- [x] **"algo de mar"** (búsqueda semántica) → tradujo a mariscos, mostró "EMPANADAS DE MARISCOS". OK.
- [x] **"queso"** → variantes de queso con precios. OK.
- [x] **"tienen pan?"** → familia PAN. ERA UN BUG (subcadena "pan" dentro de "emPANada");
      arreglado con match por palabra completa (regex `\y`) + JOIN a `familias`. OK tras fix.

## 2. ventas_periodo — total vendido (solo owner)  ✅ (2026-08-06)
- [x] **"¿cuánto se vendió en enero 2026?"** → $58.978.837 / 1.027 documentos. OK (coincide con referencia).

## 3. top_productos — ranking de más vendidos (solo owner)  ✅ (2026-08-06)
- [x] **"productos más vendidos en enero 2026"** → top1 Pino Horno $24.244.236 (13.105u). OK.

## 4. saldo_cliente — deuda de un cliente (solo owner)  ✅ (2026-08-06)
- [x] **"¿cuánto me debe Guerrero?"** → Guerrero Acevedo Nelly del Carmen $368.935.750. OK.

## 5. mostrar_menu — navegación por botones  ✅ (2026-08-06)
- [x] Escribir **"menú"** → aparecen los 3 botones. OK.
- [x] Saludo ("hola") ya NO dispara el menú (solo texto de bienvenida). OK tras fix.

## 6. verificar_disponibilidad + 7. crear_reunion — agendamiento  ✅ (2026-08-06)
- [x] Flujo completo de agendar reunión probado end-to-end: verifica disponibilidad,
      confirma, crea el evento con invitado. Funciona OK.

## Seguridad de roles (requiere segundo número = anon) — PENDIENTE
- [ ] Desde un número NO registrado (anon): "hola" → saludo reducido (solo productos/precios/agendar).
- [ ] Desde anon: "¿cuánto vendieron en enero?" → debe NEGARSE (info solo-owner).
      (Requiere agregar ese número como test recipient en Meta — app en modo Desarrollo.)

---

## Notas al validar
- Si una consulta de producto da "no encontré", reintentar con el sabor base (ej. solo "pino").
- Los nombres del catálogo están en MAYÚSCULAS y con algún typo propio ("PÌNO"); es normal.
- `movimientos_ventas` tiene fechas basura (2109, 2029) filtradas por rango en las queries.
- Al agendar: la hora se pasa SIN offset y el nodo aplica America/Santiago (invierno = -04:00).
