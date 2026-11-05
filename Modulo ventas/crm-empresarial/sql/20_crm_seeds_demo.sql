-- ============================================================================
-- 20_crm_seeds_demo.sql
-- Datos demo para el CRM Empresarial (empresa = 1) — PANADERÍA/PASTELERÍA MAYORISTA.
-- Leads = locales de comida que compran al por mayor (restaurantes, sushis,
-- almacenes, cafeterías, casinos) en comunas de Santiago. Poblan las 5 vistas de
-- NocoDB (Calendario / Requiere Vendedor / Visitas de Hoy / Recuperar / Clientes).
--
-- Idempotente: on conflict (empresa, contact_id) actualiza. Reejecutable.
-- Teléfonos/emails ficticios.
-- ============================================================================

insert into crm.crm_leads
  (empresa, nombre, nombre_negocio, contact_id, phone, email, comuna, origen_lead,
   producto_interes, estado_crm, vendedor_asignado, condicion_pago,
   estado_agendamiento, fecha_agendamiento, hora_cita)
values
  (1,'Carla Muñoz','Sushi Nami','56961110001','56961110001','compras@sushinami.cl','Providencia','whatsapp','Empanadas','Nuevo Lead',null,null,null,null,null),
  (1,'Rodrigo Pérez','Rotisería Don Pepe','56961110002','56961110002','donpepe.rot@gmail.com','Ñuñoa','whatsapp','Mixto','En Conversación','Vendedor 1',null,'Pendiente',null,null),
  (1,'Fernanda Silva','Café Aromas','56961110003','56961110003','fernanda@cafearomas.cl','Las Condes','Link Directo','Pasteles','Cotización Enviada','Vendedor 2','Efectivo','Pendiente',null,null),
  (1,'Luis Tapia','Almacén La Esquina','56961110004','56961110004','almacenlaesquina@gmail.com','Maipú','Referido','Empanadas','Cotización Enviada','Vendedor 1','Efectivo',null,null,null),
  (1,'María Rojas','Casino Empresa TX','56961110005','56961110005','maria.rojas@casinotx.cl','Santiago','whatsapp','Mixto','Primer Pedido','Vendedor 2','Crédito 7d','Confirmado','2026-08-18','10:00'),
  (1,'Jorge Vidal','Sushi Kai','56961110006','56961110006','jvidal@sushikai.cl','Providencia','whatsapp','Empanadas','Primer Pedido','Vendedor 1','Cheque','Confirmado','2026-08-19','12:00'),
  (1,'Paula Herrera','Restaurant El Parrón','56961110007','56961110007','ventas@elparron.cl','La Reina','Feria','Empanadas','Cliente Activo','Vendedor 2','Crédito 7d',null,null,null),
  (1,'Andrés Castro','Cafetería Central','56961110008','56961110008','andres@cafecentral.cl','Santiago','whatsapp','Pasteles','Cliente Activo','Vendedor 1','Efectivo','Confirmado','2026-08-15','09:00'),
  (1,'Camila Fuentes','Minimarket Vega','56961110009','56961110009','cfuentes.vega@gmail.com','Recoleta','whatsapp','Sopaipillas','Cliente Activo','Vendedor 2','Efectivo',null,null,null),
  (1,'Sebastián Núñez','Restaurant Marisol','56961110010','56961110010','smarisol@rest.cl','Vitacura','Referido','Mixto','Cliente Recurrente','Vendedor 1','Crédito 7d',null,null,null),
  (1,'Valentina Díaz','Sushi Express','56961110011','56961110011','valentina@sushiexpress.cl','Providencia','whatsapp','Empanadas','Cliente Recurrente','Vendedor 2','Cheque',null,null,null),
  (1,'Cristián Soto','Almacén Don Lucho','56961110012','56961110012','donlucho.alm@gmail.com','Puente Alto','whatsapp','Pan','Cliente Recurrente','Vendedor 1','Efectivo',null,null,null),
  (1,'Daniela Ortiz','Food Truck La Once','56961110013','56961110013','laonce.food@gmail.com','Ñuñoa','Link Directo','Empanadas','Sin Respuesta','Vendedor 2',null,null,null,null),
  (1,'Matías Reyes','Kiosko El Sol','56961110014','56961110014','elsolkiosko@gmail.com','Maipú','whatsapp','Sopaipillas','Sin Respuesta',null,null,null,null,null),
  (1,'Francisca León','Bistró Verde','56961110015','56961110015','fran@bistroverde.cl','Providencia','whatsapp','Pasteles','Requiere Vendedor','Vendedor 1',null,'Pendiente',null,null),
  (1,'Ignacio Vargas','Restaurant Costa Azul','56961110016','56961110016','ivargas@costaazul.cl','Las Condes','Feria','Mixto','Requiere Vendedor','Vendedor 2','Crédito 7d','Pendiente',null,null),
  (1,'Antonia Morales','Cafetería Uni','56961110017','56961110017','antonia.uni@gmail.com','Santiago','whatsapp','Pasteles','Inactivo','Vendedor 1','Efectivo',null,null,null)
on conflict (empresa, contact_id) do update
  set nombre              = excluded.nombre,
      nombre_negocio      = excluded.nombre_negocio,
      phone               = excluded.phone,
      email               = excluded.email,
      comuna              = excluded.comuna,
      origen_lead         = excluded.origen_lead,
      producto_interes    = excluded.producto_interes,
      estado_crm          = excluded.estado_crm,
      vendedor_asignado   = excluded.vendedor_asignado,
      condicion_pago      = excluded.condicion_pago,
      estado_agendamiento = excluded.estado_agendamiento,
      fecha_agendamiento  = excluded.fecha_agendamiento,
      hora_cita           = excluded.hora_cita;

-- Verificación:
--   select estado_crm, count(*) from crm.crm_leads where empresa=1 group by 1 order by 2 desc;
