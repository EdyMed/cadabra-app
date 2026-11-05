#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
filtrar_backup_por_fecha.py

Genera un backup REDUCIDO a partir de backup_ventas_2026-07-09.sql, conservando:
  - TODAS las tablas maestras / catálogo completas (clientes, productos, etc.)
  - Solo las filas >= FECHA_CORTE en las tablas TRANSACCIONALES (por su fecha de negocio)

El backup original es un pg_dump --data-only con INSERT MULTI-FILA:
    INSERT INTO public.<tabla> (cols...) VALUES
        ('...', ...),        <- una fila por línea, empieza con '(' , termina en '),'
        ('...', ...),
        ('...', ...);        <- última fila del bloque, termina en ');'
La lista de columnas y "VALUES" están en la línea de cabecera 'INSERT INTO ...';
las FILAS reales son las líneas siguientes que empiezan con '('.
Filtramos cada FILA por la fecha que corresponde a su tabla.

Uso (PowerShell / cmd):
    python filtrar_backup_por_fecha.py

Salida: backup_ventas_desde_2025.sql (junto al original)
"""

import re
from pathlib import Path

# --------------------------------------------------------------------------
# Configuración
# --------------------------------------------------------------------------
BASE = Path(r"D:\Cadabra - Power BI\Integracion y Automatizacion-2026\app\Modulo ventas\backups")
ENTRADA = BASE / "backup_ventas_2026-07-09.sql"
SALIDA  = BASE / "backup_ventas_desde_2025.sql"

FECHA_CORTE = "2025-01-01"   # se conservan las filas con fecha_negocio >= esta fecha

# Tablas transaccionales -> ÍNDICE (0-based) de la columna de fecha de NEGOCIO
# por la que se filtra. El índice cuenta las columnas del INSERT en orden.
# Filtramos parseando la fila por columnas (respetando comillas), NO por
# "primera fecha de la fila" (frágil: los UUID y las fechas nulas '1899-12-30'
# de Access, más created_at/updated_at, contaminan ese enfoque).
#
# Índices verificados contra las cabeceras INSERT del backup:
TABLAS_TRANSACCIONALES = {
    "movimientos_ventas":   6,   # fecha_documento
    "facturas_venta":       8,   # fecha_factura
    "facturas_venta_guias": 4,   # fecha_guia
    "guias_despacho":       7,   # fecha_guia
    "boletas_venta_cab":    8,   # fecha_emision
    "boletas_venta_det":    6,   # fecha_emision
    "notacredito_cab":      2,   # fecha_nota_credito
    "notacredito_det":      2,   # fecha_nota_credito
    "nota_debito_cab":      2,   # fecha_nota_debito (verificar si difiere)
    "nota_debito_det":      2,   # fecha_nota_debito
}

# Regex: cabecera de INSERT (línea 'INSERT INTO public.<tabla> (...) VALUES')
RE_INSERT = re.compile(r"^INSERT INTO public\.(\w+) ")
RE_FECHA_VAL = re.compile(r"^'(\d{4})-(\d{2})-(\d{2})")

corte_tuple = tuple(int(x) for x in FECHA_CORTE.split("-"))  # (2025, 1, 1)


def split_valores(fila: str) -> list:
    """Divide una fila '(v1, v2, ...)' en sus valores de columna, respetando
    comillas simples SQL (incluido el escape '' dentro de cadenas). Devuelve la
    lista de valores como texto (con sus comillas)."""
    s = fila.strip()
    if s.startswith("("):
        s = s[1:]
    if s.endswith(")"):
        s = s[:-1]
    valores = []
    actual = []
    en_cadena = False
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if en_cadena:
            if ch == "'":
                # ¿comilla escapada ''?
                if i + 1 < n and s[i + 1] == "'":
                    actual.append("''")
                    i += 2
                    continue
                en_cadena = False
                actual.append(ch)
            else:
                actual.append(ch)
        else:
            if ch == "'":
                en_cadena = True
                actual.append(ch)
            elif ch == ",":
                valores.append("".join(actual).strip())
                actual = []
            else:
                actual.append(ch)
        i += 1
    if actual:
        valores.append("".join(actual).strip())
    return valores


def fecha_ok(fila: str, idx_fecha: int) -> bool:
    """True si el valor de la columna idx_fecha (fecha de negocio) es >= corte.
    Si es NULL, vacío o fecha nula de Access (1899-12-30), se DESCARTA por defecto
    salvo que no se pueda parsear la fila, en cuyo caso se conserva (seguridad)."""
    vals = split_valores(fila)
    if idx_fecha >= len(vals):
        return True  # no se pudo ubicar la columna: conservar para no perder datos
    val = vals[idx_fecha]
    if val == "NULL" or val == "":
        return False  # sin fecha de negocio -> fuera del rango reciente
    m = RE_FECHA_VAL.match(val)
    if not m:
        return True  # formato inesperado: conservar
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return (y, mo, d) >= corte_tuple


def limpiar_fin(fila: str) -> str:
    """Quita el terminador de la fila ('),' o ');') y espacios, dejando '(...)'."""
    s = fila.rstrip()
    if s.endswith("),"):
        return s[:-1]           # -> '(...)'
    if s.endswith(");"):
        return s[:-1]           # -> '(...)'
    return s


def fila_completa(buffer: str) -> bool:
    """True si el buffer acumulado contiene una fila '(...)' COMPLETA:
    número par de comillas simples no escapadas Y termina en '),' o ');'.
    Maneja valores de texto con saltos de línea internos (multilínea)."""
    s = buffer.rstrip()
    if not (s.endswith("),") or s.endswith(");")):
        return False
    # Contar comillas simples reales (no las escapadas '')
    comillas = 0
    i = 0
    n = len(s)
    while i < n:
        if s[i] == "'":
            if i + 1 < n and s[i + 1] == "'":
                i += 2   # comilla escapada, no cuenta
                continue
            comillas += 1
        i += 1
    return comillas % 2 == 0


def main() -> None:
    if not ENTRADA.exists():
        raise SystemExit(f"No existe el backup de entrada: {ENTRADA}")

    tabla_actual = None
    total_in = total_out = 0
    por_tabla = {}  # tabla -> [conservadas, descartadas]

    # Buffer del bloque INSERT en curso:
    cabecera = None          # texto 'INSERT INTO ... VALUES\n'
    filas_conservadas = []   # lista de '(...)' (sin terminador)
    tabla_bloque = None
    idx_fecha = None         # índice de columna de fecha si la tabla es transaccional, si no None

    # Acumulador de fila multilínea en curso:
    fila_buf = None          # texto acumulado de la fila actual, o None

    def flush_bloque(fout):
        """Escribe el bloque INSERT acumulado con la puntuación correcta."""
        nonlocal cabecera, filas_conservadas, tabla_bloque
        if cabecera is None:
            return
        if filas_conservadas:
            fout.write(cabecera)
            n = len(filas_conservadas)
            for i, f in enumerate(filas_conservadas):
                fout.write(f + (";\n" if i == n - 1 else ",\n"))
        # si no quedó ninguna fila, no se escribe el INSERT (bloque vacío)
        cabecera = None
        filas_conservadas = []
        tabla_bloque = None

    def procesar_fila(fila_texto):
        """Decide si conservar la fila completa y la agrega al bloque."""
        nonlocal total_in, total_out
        total_in += 1
        fila = limpiar_fin(fila_texto)
        if idx_fecha is None or fecha_ok(fila, idx_fecha):
            filas_conservadas.append(fila)
            total_out += 1
            por_tabla[tabla_bloque][0] += 1
        else:
            por_tabla[tabla_bloque][1] += 1

    with ENTRADA.open("r", encoding="utf-8", errors="replace") as fin, \
         SALIDA.open("w", encoding="utf-8", newline="\n") as fout:

        for linea in fin:
            # Si estamos acumulando una fila multilínea, seguir hasta completarla.
            if fila_buf is not None:
                fila_buf += linea
                if fila_completa(fila_buf):
                    procesar_fila(fila_buf)
                    fila_buf = None
                continue

            # Cabecera de un INSERT nuevo -> cerrar el bloque anterior y abrir uno
            m = RE_INSERT.match(linea)
            if m:
                flush_bloque(fout)
                tabla_bloque = m.group(1)
                idx_fecha = TABLAS_TRANSACCIONALES.get(tabla_bloque)  # int o None
                por_tabla.setdefault(tabla_bloque, [0, 0])
                cabecera = linea if linea.endswith("\n") else linea + "\n"
                filas_conservadas = []
                continue

            # Línea de FILA de datos (empieza con '(' tras posibles tabs/espacios)
            stripped = linea.lstrip()
            if cabecera is not None and stripped.startswith("("):
                if fila_completa(linea):
                    procesar_fila(linea)          # fila de una sola línea
                else:
                    fila_buf = linea              # inicio de fila multilínea
                continue

            # Cualquier otra línea: cerrar bloque en curso y copiar tal cual
            flush_bloque(fout)
            fout.write(linea)

        # Cerrar cualquier fila/bloque pendiente al final
        if fila_buf is not None:
            procesar_fila(fila_buf)
            fila_buf = None
        flush_bloque(fout)

    # ---- Reporte ----
    print(f"Backup filtrado generado: {SALIDA}")
    print(f"Fecha de corte: {FECHA_CORTE} (se conservan filas >= corte en tablas transaccionales)")
    print(f"Filas de datos totales leídas : {total_in:,}")
    print(f"Filas escritas                : {total_out:,}")
    print(f"Filas descartadas             : {total_in - total_out:,}")
    print()
    print("Detalle por tabla transaccional (conservadas / descartadas):")
    for t in sorted(TABLAS_TRANSACCIONALES):
        c, d = por_tabla.get(t, [0, 0])
        if c or d:
            print(f"  {t:24s}  conservadas={c:>9,}  descartadas={d:>9,}")


if __name__ == "__main__":
    main()
