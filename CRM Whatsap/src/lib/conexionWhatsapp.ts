import { whatsappPool } from "@/lib/db";
import { cifrar, descifrar } from "@/lib/cifrado";
import { graph, GRAPH_VERSION, MetaError } from "@/lib/whatsapp";
import { randomInt } from "node:crypto";

// Embedded Signup: el cliente conecta SU cuenta de WhatsApp Business desde el
// panel. Meta devuelve un código (canjeable una sola vez por un token del
// negocio) y los IDs de la WABA y del número que eligió. Aquí se completa la
// conexión y se deja todo listo para que n8n reciba y envíe sus mensajes.

export type CuentaWhatsapp = {
  empresa: number;
  wabaId: string;
  businessId: string | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
  verifiedName: string | null;
  systemUserAsignado: boolean;
  estado: string;
  ultimoError: string | null;
  conectadoEn: string;
  modo: "nuevo" | "coexistencia";
};

export async function getCuentaWhatsapp(empresa: number): Promise<CuentaWhatsapp | null> {
  const res = await whatsappPool.query(
    `SELECT empresa, waba_id, business_id, phone_number_id, display_phone, verified_name,
            system_user_asignado, estado, ultimo_error, conectado_en::text AS conectado_en,
            COALESCE(to_jsonb(c) ->> 'modo', 'nuevo') AS modo
       FROM public.agente_whatsapp_cuentas c WHERE empresa = $1`,
    [empresa]
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    empresa: r.empresa,
    wabaId: r.waba_id,
    businessId: r.business_id,
    phoneNumberId: r.phone_number_id,
    displayPhone: r.display_phone,
    verifiedName: r.verified_name,
    systemUserAsignado: r.system_user_asignado,
    estado: r.estado,
    ultimoError: r.ultimo_error,
    conectadoEn: r.conectado_en,
    modo: r.modo === "coexistencia" ? "coexistencia" : "nuevo",
  };
}

// Token del negocio (descifrado) para llamar a la Graph API sobre SU WABA.
export async function getTokenCuenta(empresa: number): Promise<{ wabaId: string; token: string } | null> {
  const res = await whatsappPool.query(
    `SELECT waba_id, token_cifrado FROM public.agente_whatsapp_cuentas
      WHERE empresa = $1 AND estado = 'conectado' AND token_cifrado IS NOT NULL`,
    [empresa]
  );
  const r = res.rows[0];
  return r ? { wabaId: r.waba_id, token: descifrar(r.token_cifrado) } : null;
}

async function canjearCodigo(code: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) throw new Error("Falta NEXT_PUBLIC_META_APP_ID o META_APP_SECRET en el servidor");
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token` +
    `?client_id=${appId}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.access_token) {
    throw new MetaError(data?.error?.message ?? "Meta no aceptó el código de conexión", res.status);
  }
  return data.access_token as string;
}

// Da acceso a la WABA del cliente al usuario del sistema de Cadabra (el token que
// usa n8n), para que un solo token sirva para enviar por todos los clientes. Si
// Meta lo rechaza no se bloquea la conexión: queda el token propio del cliente.
async function asignarSystemUser(wabaId: string): Promise<boolean> {
  const token = process.env.META_WA_TOKEN;
  if (!token) return false;
  try {
    const yo = await graph<{ id: string }>(`/me?fields=id`, token);
    await graph(
      `/${wabaId}/assigned_users?user=${yo.id}&tasks=${encodeURIComponent('["MANAGE"]')}`,
      token,
      { method: "POST" }
    );
    return true;
  } catch {
    return false;
  }
}

export type ResultadoConexion = { cuenta: CuentaWhatsapp; avisos: string[] };

export async function conectarCuenta(params: {
  empresa: number;
  nombreEmpresa: string;
  authUserId: string;
  code: string;
  wabaId: string;
  phoneNumberId: string | null;
  businessId: string | null;
  // true = el número sigue en la app WhatsApp Business del cliente (coexistencia)
  coexistencia?: boolean;
}): Promise<ResultadoConexion> {
  const { empresa, nombreEmpresa, authUserId, code, wabaId, phoneNumberId, businessId } = params;
  const coexistencia = params.coexistencia === true;
  const avisos: string[] = [];

  // 1) Código → token del negocio (vale una sola vez y caduca en minutos).
  const token = await canjearCodigo(code);

  // 2) Suscribir nuestra app a la WABA: sin esto los mensajes del cliente no
  //    llegan al webhook (n8n).
  await graph(`/${wabaId}/subscribed_apps`, token, { method: "POST" });

  // 3) Datos del número y registro en la Cloud API con un PIN de 2 pasos propio.
  let display: string | null = null;
  let verifiedName: string | null = null;
  let pin: string | null = null;
  if (phoneNumberId) {
    const info = await graph<{ display_phone_number?: string; verified_name?: string }>(
      `/${phoneNumberId}?fields=display_phone_number,verified_name`,
      token
    );
    display = info.display_phone_number ?? null;
    verifiedName = info.verified_name ?? null;

    if (coexistencia) {
      // Coexistencia: Meta indica NO registrar ("the number is already registered").
      // Solo se verifica que quedó en ambos lados (app + Cloud API).
      try {
        const st = await graph<{ is_on_biz_app?: boolean; platform_type?: string }>(
          `/${phoneNumberId}?fields=is_on_biz_app,platform_type`, token);
        if (st.is_on_biz_app !== true) avisos.push("Meta no reporta el número como coexistencia (is_on_biz_app distinto de true).");
      } catch (e) {
        avisos.push(`No se pudo verificar la coexistencia: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      try {
        await graph(`/${phoneNumberId}/register`, token, {
          method: "POST",
          body: JSON.stringify({ messaging_product: "whatsapp", pin }),
        });
      } catch (e) {
        // Un número que ya estaba en la Cloud API puede rechazar el registro o pedir
        // su PIN anterior: la conexión sigue, pero se avisa para revisarlo.
        avisos.push(`No se pudo registrar el número en la Cloud API: ${e instanceof Error ? e.message : e}`);
        pin = null;
      }
    }
  } else {
    avisos.push("Se conectó la cuenta de WhatsApp Business, pero sin un número. Agrégalo desde el WhatsApp Manager.");
  }

  // 4) Acceso para el token de Cadabra (n8n).
  const systemUser = await asignarSystemUser(wabaId);
  if (!systemUser) {
    avisos.push("El usuario del sistema de Cadabra no quedó asignado a la cuenta: el envío desde n8n usará el token propio del cliente.");
  }

  // 4b) Coexistencia: pedir a Meta la sincronización de contactos e historial.
  //     Hay 24 h para hacerlo y cada una se puede pedir UNA sola vez; los datos llegan
  //     después por webhooks (smb_app_state_sync / history) al workflow "Coexistencia".
  let syncContactos = false, syncHistorial = false;
  const syncNotas: string[] = [];
  if (coexistencia && phoneNumberId) {
    for (const tipo of ["smb_app_state_sync", "history"] as const) {
      try {
        await graph(`/${phoneNumberId}/smb_app_data`, token, {
          method: "POST",
          body: JSON.stringify({ messaging_product: "whatsapp", sync_type: tipo }),
        });
        if (tipo === "history") syncHistorial = true; else syncContactos = true;
      } catch (e) {
        syncNotas.push(`${tipo === "history" ? "historial" : "contactos"}: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (syncNotas.length) avisos.push(`No se pudo pedir la sincronización (${syncNotas.join("; ")}).`);
  }

  // 5) Guardar. Cuenta + línea para n8n en una transacción.
  const cliente = await whatsappPool.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query(
      `INSERT INTO public.agente_whatsapp_cuentas
         (empresa, waba_id, business_id, phone_number_id, display_phone, verified_name,
          token_cifrado, pin_cifrado, system_user_asignado, estado, ultimo_error, conectado_por,
          conectado_en, actualizado_en, modo, sync_contactos_en, sync_historial_en, sync_mensaje)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'conectado',$10,$11, now(), now(), $12,
               CASE WHEN $13 THEN now() END, CASE WHEN $14 THEN now() END, $15)
       ON CONFLICT (empresa) DO UPDATE SET
         modo = EXCLUDED.modo, sync_contactos_en = EXCLUDED.sync_contactos_en,
         sync_historial_en = EXCLUDED.sync_historial_en, sync_mensaje = EXCLUDED.sync_mensaje,
         waba_id = EXCLUDED.waba_id, business_id = EXCLUDED.business_id,
         phone_number_id = EXCLUDED.phone_number_id, display_phone = EXCLUDED.display_phone,
         verified_name = EXCLUDED.verified_name, token_cifrado = EXCLUDED.token_cifrado,
         pin_cifrado = COALESCE(EXCLUDED.pin_cifrado, public.agente_whatsapp_cuentas.pin_cifrado),
         system_user_asignado = EXCLUDED.system_user_asignado, estado = 'conectado',
         ultimo_error = EXCLUDED.ultimo_error, conectado_por = EXCLUDED.conectado_por,
         conectado_en = now(), actualizado_en = now()`,
      [
        empresa, wabaId, businessId, phoneNumberId, display, verifiedName,
        cifrar(token), pin ? cifrar(pin) : null, systemUser,
        avisos.length ? avisos.join(" | ") : null, authUserId,
        coexistencia ? "coexistencia" : "nuevo", syncContactos, syncHistorial,
        syncNotas.length ? syncNotas.join(" | ") : null,
      ]
    );

    if (phoneNumberId) {
      const digitos = display ? display.replace(/\D/g, "") : null;
      // El nombre del asistente se definió en el alta (agente_empresas_config, sql/04);
      // n8n lo lee de la línea, así que se copia aquí.
      await cliente.query(
        `INSERT INTO public.agente_lineas_whatsapp
           (phone_number_id, empresa, nombre_empresa, nombre_asistente, whatsapp_display, activo)
         VALUES ($1, $2, $3,
                 COALESCE((SELECT nombre_asistente FROM public.agente_empresas_config WHERE empresa = $2), 'Sofía'),
                 $4, true)
         ON CONFLICT (phone_number_id) DO UPDATE SET
           empresa = $2, nombre_empresa = $3, whatsapp_display = $4, activo = true,
           nombre_asistente = COALESCE(
             (SELECT nombre_asistente FROM public.agente_empresas_config WHERE empresa = $2),
             public.agente_lineas_whatsapp.nombre_asistente, 'Sofía')`,
        [phoneNumberId, empresa, nombreEmpresa, digitos]
      );
      // Una empresa = una línea activa: las anteriores dejan de enrutar.
      await cliente.query(
        `UPDATE public.agente_lineas_whatsapp SET activo = false
          WHERE empresa = $1 AND phone_number_id <> $2 AND activo = true`,
        [empresa, phoneNumberId]
      );
    }
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }

  const cuenta = await getCuentaWhatsapp(empresa);
  return { cuenta: cuenta!, avisos };
}
