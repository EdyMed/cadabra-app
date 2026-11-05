import { Pool } from "pg";

// Pool único (solo-lectura) al Postgres de NocoDB donde viven los leads.
// Server-side únicamente: estas credenciales NUNCA llegan al navegador.
declare global {
  // eslint-disable-next-line no-var
  var _nocodbPool: Pool | undefined;
}

function makePool() {
  const ssl =
    (process.env.NOCODB_PG_SSL ?? "disable").toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    host: process.env.NOCODB_PG_HOST,
    port: Number(process.env.NOCODB_PG_PORT ?? 5432),
    database: process.env.NOCODB_PG_DATABASE,
    user: process.env.NOCODB_PG_USER,
    password: process.env.NOCODB_PG_PASSWORD,
    ssl,
    max: 5,
    idleTimeoutMillis: 30000,
  });
}

export const pool: Pool = global._nocodbPool ?? makePool();
if (process.env.NODE_ENV !== "production") global._nocodbPool = pool;

// Pool de ESCRITURA, acotado: el rol dashboard_rw solo tiene GRANT UPDATE(estado_crm)
// sobre crm.crm_leads (nada de INSERT/DELETE ni otras columnas, verificado en Postgres).
declare global {
  // eslint-disable-next-line no-var
  var _crmWritePool: Pool | undefined;
}

function makeWritePool() {
  const ssl =
    (process.env.CRM_RW_PG_SSL ?? "disable").toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    host: process.env.CRM_RW_PG_HOST,
    port: Number(process.env.CRM_RW_PG_PORT ?? 5432),
    database: process.env.CRM_RW_PG_DATABASE,
    user: process.env.CRM_RW_PG_USER,
    password: process.env.CRM_RW_PG_PASSWORD,
    ssl,
    max: 3,
    idleTimeoutMillis: 30000,
  });
}

export const writePool: Pool = global._crmWritePool ?? makeWritePool();
if (process.env.NODE_ENV !== "production") global._crmWritePool = writePool;

// Pool de escritura para el CRUD de Vendedores (rol dashboard_vendedores): CRUD completo
// pero SOLO sobre crm.vendedores, verificado en Postgres que no toca crm_leads.
declare global {
  // eslint-disable-next-line no-var
  var _vendedoresPool: Pool | undefined;
}

function makeVendedoresPool() {
  const ssl =
    (process.env.VEND_PG_SSL ?? "disable").toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    host: process.env.VEND_PG_HOST,
    port: Number(process.env.VEND_PG_PORT ?? 5432),
    database: process.env.VEND_PG_DATABASE,
    user: process.env.VEND_PG_USER,
    password: process.env.VEND_PG_PASSWORD,
    ssl,
    max: 3,
    idleTimeoutMillis: 30000,
  });
}

export const vendedoresPool: Pool = global._vendedoresPool ?? makeVendedoresPool();
if (process.env.NODE_ENV !== "production") global._vendedoresPool = vendedoresPool;

// Pool de escritura para editar los datos de la empresa (rol dashboard_empresa_rw):
// SOLO puede UPDATE(nombre_empresa) sobre public.dashboard_usuarios, verificado en
// Postgres que no puede tocar la columna empresa ni el schema crm.
declare global {
  // eslint-disable-next-line no-var
  var _empresaPool: Pool | undefined;
}

function makeEmpresaPool() {
  const ssl =
    (process.env.EMPRESA_PG_SSL ?? "disable").toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    host: process.env.EMPRESA_PG_HOST,
    port: Number(process.env.EMPRESA_PG_PORT ?? 5432),
    database: process.env.EMPRESA_PG_DATABASE,
    user: process.env.EMPRESA_PG_USER,
    password: process.env.EMPRESA_PG_PASSWORD,
    ssl,
    max: 3,
    idleTimeoutMillis: 30000,
  });
}

export const empresaPool: Pool = global._empresaPool ?? makeEmpresaPool();
if (process.env.NODE_ENV !== "production") global._empresaPool = empresaPool;

// Pool ADMIN (rol dashboard_admin): CROSS-TENANT, único rol así en el proyecto —
// puede leer/escribir dashboard_usuarios (todos los tenants), contador_conversaciones
// (planes) y crear vendedores para cualquier empresa. Verificado en Postgres que NO
// tiene acceso a crm_leads ni conversation_history de ningún cliente (datos privados
// de negocio, fuera del alcance de gestión). Cada API que lo use DEBE validar
// tenant.isAdmin === true antes de ejecutar cualquier query.
declare global {
  // eslint-disable-next-line no-var
  var _adminPool: Pool | undefined;
}

function makeAdminPool() {
  const ssl =
    (process.env.ADMIN_PG_SSL ?? "disable").toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    host: process.env.ADMIN_PG_HOST,
    port: Number(process.env.ADMIN_PG_PORT ?? 5432),
    database: process.env.ADMIN_PG_DATABASE,
    user: process.env.ADMIN_PG_USER,
    password: process.env.ADMIN_PG_PASSWORD,
    ssl,
    max: 3,
    idleTimeoutMillis: 30000,
  });
}

export const adminPool: Pool = global._adminPool ?? makeAdminPool();
if (process.env.NODE_ENV !== "production") global._adminPool = adminPool;

// Schema donde NocoDB guarda las tablas de datos (crm_leads, contador_conversaciones).
export const SCHEMA = process.env.NOCODB_PG_SCHEMA ?? "p14vch8or5d3r3s";

// Nombre calificado y citado del schema (evita problemas por may/min).
export function tbl(name: string) {
  return `"${SCHEMA}"."${name}"`;
}

// Helper de consulta tipada.
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

// Pool del Embedded Signup (rol dashboard_whatsapp): SOLO agente_whatsapp_cuentas y
// agente_lineas_whatsapp (ver sql/03_embedded_signup.sql). Lo usa únicamente
// lib/conexionWhatsapp.ts, siempre filtrando por la empresa del tenant.
declare global {
  // eslint-disable-next-line no-var
  var _whatsappPool: Pool | undefined;
}

function makeWhatsappPool() {
  const ssl =
    (process.env.WA_PG_SSL ?? "disable").toLowerCase() === "require"
      ? { rejectUnauthorized: false }
      : undefined;

  return new Pool({
    host: process.env.WA_PG_HOST,
    port: Number(process.env.WA_PG_PORT ?? 5432),
    database: process.env.WA_PG_DATABASE,
    user: process.env.WA_PG_USER,
    password: process.env.WA_PG_PASSWORD,
    ssl,
    max: 3,
    idleTimeoutMillis: 30000,
  });
}

export const whatsappPool: Pool = global._whatsappPool ?? makeWhatsappPool();
if (process.env.NODE_ENV !== "production") global._whatsappPool = whatsappPool;
