'use strict';
const { crearServicioRecibos, responderErrorRecibo } = require('../../receipt-transactions');
const { crearOperacionesPago, responderErrorPago } = require('../../payment-operations');
const { validarReciboAdmin } = require('../../admin-date-validation');

function registerRoutes(app, { pool, requiereAuth, requiereAdmin, limiteOperacionesSensibles, puedeVerSuministro, emitirASuministro, emitirAAdmins, crearNotificacion, sharedStorage = false }) {
    const servicioRecibos = crearServicioRecibos({ pool, validarRecibo: validarReciboAdmin, sharedStorage });

    app.get("/api/recibos/:suministro", requiereAuth, async (req, res) => {

        try {

            const numeroSuministro = req.params.suministro;

            if (!puedeVerSuministro(req, numeroSuministro)) {
                return res.status(403).json({ estado: "error", mensaje: "Acceso denegado." });
            }

            const consulta = `
                SELECT
                    r.id_recibo,
                    r.periodo,
                    r.fecha_emision,
                    r.fecha_vencimiento,
                    r.monto,
                    r.consumo_m3,
                    r.estado
                FROM recibos r
                INNER JOIN suministros s
                    ON s.id_suministro = r.id_suministro
                WHERE s.numero_suministro = $1
                ORDER BY r.fecha_emision DESC;
            `;

            const resultado = await pool.query(
                consulta,
                [numeroSuministro]
            );

            res.json({
                suministro: numeroSuministro,
                cantidad: resultado.rowCount,
                recibos: resultado.rows
            });

        } catch (error) {

            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            res.status(500).json({
                mensaje: "Error al consultar los recibos"
            });
        }

    });

    const operacionesPago = crearOperacionesPago({ pool, sharedStorage });

    function emitirOperacion(req, op) {
        emitirASuministro(req.user.id_suministro, 'pago:registrado', {id_operacion:op.id,id_recibo:op.id_recibo});
        emitirAAdmins('pago:nuevo', {id_operacion:op.id,id_recibo:op.id_recibo});
    }

    app.get('/api/pagos/config', requiereAuth, async(req,res)=>{try{res.set('Cache-Control','no-store').json(await operacionesPago.overview(req.user));}catch(e){responderErrorPago(res,e);}});

    app.get('/api/pagos/yape/qr', requiereAuth, async(req,res)=>{try{const image=await operacionesPago.qr(req.user);res.set({'Cache-Control':'no-store','Content-Type':'image/png'}).send(image);}catch(e){responderErrorPago(res,e);}});

    app.post('/api/pagos', limiteOperacionesSensibles, requiereAuth, async(req,res)=>{try{
        if(!req.body?.solicitud_id)return res.status(409).json({estado:'error',mensaje:'Actualiza la aplicación. Este método demostrativo no acredita pagos; el recibo permanece pendiente.'});
        const result=await operacionesPago.create({...req.body,solicitud_id:req.body?.solicitud_id||crypto.randomUUID()},req.user,true);
        emitirOperacion(req,result.operacion);
        res.status(result.repetida?200:201).json({estado:'ok',pago:result.operacion,recibo:{id_recibo:result.operacion.id_recibo,estado:'Pendiente'},mensaje:'Operación demostrativa. No acredita un pago ni cancela la deuda.'});
    }catch(e){responderErrorPago(res,e);}});

    app.post('/api/me/operaciones-pago', limiteOperacionesSensibles, requiereAuth, async(req,res)=>{try{
        const result=await operacionesPago.create(req.body||{},req.user);emitirOperacion(req,result.operacion);
        res.status(result.repetida?200:201).json(result);
    }catch(e){responderErrorPago(res,e);}});

    app.get('/api/me/operaciones-pago', requiereAuth, async(req,res)=>{try{res.set('Cache-Control','no-store').json({operaciones:await operacionesPago.list(req.user)});}catch(e){responderErrorPago(res,e);}});

    app.get('/api/admin/operaciones-pago', requiereAdmin, async(req,res)=>{try{res.set('Cache-Control','no-store').json(req.query.page?await operacionesPago.page(req.user,req.query):{operaciones:await operacionesPago.list(req.user,true)});}catch(e){responderErrorPago(res,e);}});

    for (const [prefix,auth,admin] of [['/api/me',requiereAuth,false],['/api/admin',requiereAdmin,true]]) {
        app.get(prefix+'/operaciones-pago/:id',auth,async(req,res)=>{try{res.set('Cache-Control','no-store').json(await operacionesPago.detail(req.params.id,req.user,admin));}catch(e){responderErrorPago(res,e);}});
        app.get(prefix+'/operaciones-pago/:id/comprobante',auth,async(req,res)=>{try{const image=await operacionesPago.proof(req.params.id,req.user,admin);res.set({'Cache-Control':'no-store','Content-Type':'image/png'}).send(image);}catch(e){responderErrorPago(res,e);}});
    }

    app.post('/api/me/operaciones-pago/:id/cancelar',limiteOperacionesSensibles,requiereAuth,async(req,res)=>{try{const op=await operacionesPago.cancel(req.params.id,req.user);emitirOperacion(req,op);res.json({operacion:op});}catch(e){responderErrorPago(res,e);}});

    app.post('/api/admin/operaciones-pago/:id/revisar',limiteOperacionesSensibles,requiereAdmin,async(req,res)=>{try{
        const op=await operacionesPago.review(req.params.id,req.body||{},req.user);
        emitirAAdmins('pago:nuevo',{id_operacion:op.id,id_recibo:op.id_recibo});
        const own=await pool.query('SELECT id_suministro FROM suministros WHERE numero_suministro=$1',[op.numero_suministro]);
        if(own.rows[0])emitirASuministro(own.rows[0].id_suministro,'pago:registrado',{id_operacion:op.id,id_recibo:op.id_recibo});
        res.json({operacion:op});
    }catch(e){responderErrorPago(res,e);}});

    app.get("/api/pagos/:suministro", requiereAuth, async (req, res) => {
        try {
            const numeroSuministro = req.params.suministro;

            if (!puedeVerSuministro(req, numeroSuministro)) {
                return res.status(403).json({ estado: "error", mensaje: "Acceso denegado." });
            }

            const consulta = `
                SELECT
                  p.id_pago,
                  p.id_recibo,
                  p.monto,
                  p.metodo,
                  p.codigo_operacion,
                  p.fecha_pago,
                  r.periodo
                FROM pagos p
                JOIN recibos r
                  ON r.id_recibo = p.id_recibo
                JOIN suministros s
                  ON s.id_suministro = r.id_suministro
                WHERE s.numero_suministro = $1
                ORDER BY p.fecha_pago DESC;
            `;

            const resultado = await pool.query(
                consulta,
                [numeroSuministro]
            );

            res.json({
                suministro: numeroSuministro,
                cantidad: resultado.rowCount,
                pagos: resultado.rows
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    function filaReciboAdmin(fila){
        return {
            id_recibo: fila.id_recibo,
            numero_suministro: fila.numero_suministro,
            periodo: fila.periodo,
            fecha_emision: fila.fecha_emision,
            fecha_vencimiento: fila.fecha_vencimiento,
            monto: fila.monto,
            consumo_m3: fila.consumo_m3,
            estado: fila.estado,
            tiene_pago: !!fila.tiene_pago
        };
    }

    app.get("/api/admin/recibos", requiereAdmin, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT
                   r.id_recibo,
                   s.numero_suministro,
                   r.periodo,
                   r.fecha_emision,
                   r.fecha_vencimiento,
                   r.monto,
                   r.consumo_m3,
                   r.estado,
                   EXISTS(SELECT 1 FROM pagos p WHERE p.id_recibo = r.id_recibo) AS tiene_pago
                 FROM recibos r
                 JOIN suministros s ON s.id_suministro = r.id_suministro
                 ORDER BY r.fecha_emision DESC, r.id_recibo DESC;`
            );

            res.json({
                cantidad: resultado.rowCount,
                recibos: resultado.rows.map(filaReciboAdmin)
            });

        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });

            return res.status(500).json({
                estado: "error",
                mensaje: "Error interno del servidor."
            });
        }
    });

    app.post("/api/admin/recibos", requiereAdmin, async (req, res) => {
        try {
            const { recibo } = await servicioRecibos.crear(req.body);
            // Notificación opcional después del COMMIT; un conflicto no notifica.
            try {
                await crearNotificacion({ id_suministro: recibo.id_suministro, alcance: 'Usuario',
                    titulo: 'Nuevo recibo disponible: ' + recibo.periodo,
                    mensaje: 'Se publicó tu recibo ' + recibo.periodo + ' por S/ ' + Number(recibo.monto).toFixed(2) + '.', tipo: 'recibo' });
            } catch (_) {}
            emitirASuministro(recibo.id_suministro, 'recibo:nuevo', { id: recibo.id_recibo, periodo: recibo.periodo });
            return res.status(201).json({ estado: 'ok', recibo: filaReciboAdmin(recibo) });
        } catch (error) { return responderErrorRecibo(res, error); }
    });

    app.patch("/api/admin/recibos/:id", requiereAdmin, async (req, res) => {
        try {
            const { recibo } = await servicioRecibos.editar(Number(req.params.id), req.body);
            emitirASuministro(recibo.id_suministro, 'recibo:actualizado', { id: recibo.id_recibo });
            return res.json({ estado: 'ok', recibo: filaReciboAdmin(recibo) });
        } catch (error) { return responderErrorRecibo(res, error); }
    });

    app.patch("/api/admin/recibos/:id/anular", requiereAdmin, async (req, res) => {
        try {
            const { recibo } = await servicioRecibos.anular(Number(req.params.id));
            emitirASuministro(recibo.id_suministro, 'recibo:actualizado', { id: recibo.id_recibo, estado: recibo.estado });
            return res.json({ estado: 'ok', recibo: filaReciboAdmin(recibo) });
        } catch (error) { return responderErrorRecibo(res, error); }
    });

    app.get("/api/admin/pagos", requiereAdmin, async (req, res) => {
        try {
            const { suministro, periodo, metodo } = req.query || {};
            const condiciones = [];
            const valores = [];
            // Filtros acotados: suministro admite búsqueda parcial numérica (1-9
            // dígitos; el valor almacenado siempre tiene 9), periodo parcial
            // (máx. 60) y método exacto de la lista (máx. 30).
            if (suministro && String(suministro).trim() !== '') {
                const fSum = String(suministro).trim();
                if (!/^\d{1,9}$/.test(fSum)) {
                    return res.status(400).json({ estado: "error", mensaje: "El filtro de suministro debe contener entre 1 y 9 dígitos." });
                }
                valores.push('%' + fSum + '%');
                condiciones.push('s.numero_suministro ILIKE $' + valores.length);
            }
            if (periodo && String(periodo).trim() !== '') {
                const fPer = String(periodo).trim().slice(0, 60);
                valores.push('%' + fPer + '%');
                condiciones.push('r.periodo ILIKE $' + valores.length);
            }
            if (metodo && String(metodo).trim() !== '' && String(metodo).trim() !== 'Todos') {
                const fMet = String(metodo).trim().slice(0, 30);
                valores.push(fMet);
                condiciones.push('p.metodo ILIKE $' + valores.length);
            }
            const filtro = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
            const resultado = await pool.query(
                `SELECT
                    p.id_pago,
                    s.numero_suministro,
                    p.id_recibo,
                    r.periodo,
                    p.monto,
                    p.metodo,
                    p.codigo_operacion,
                    p.fecha_pago
                  FROM pagos p
                  JOIN recibos r ON r.id_recibo = p.id_recibo
                  JOIN suministros s ON s.id_suministro = r.id_suministro
                  ${filtro}
                  ORDER BY p.fecha_pago DESC, p.id_pago DESC
                  LIMIT 500;`,
                valores
            );
            return res.json({ cantidad: resultado.rowCount, pagos: resultado.rows });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });

    app.get("/api/me/recibos", requiereAuth, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT r.id_recibo, r.periodo, r.fecha_emision, r.fecha_vencimiento,
                        r.monto, r.consumo_m3, r.estado
                 FROM recibos r
                 WHERE r.id_suministro = $1
                 ORDER BY r.fecha_emision DESC;`,
                [req.user.id_suministro]
            );
            return res.json({ suministro: req.user.numero_suministro, cantidad: resultado.rowCount, recibos: resultado.rows });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ mensaje: "Error al consultar los recibos" });
        }
    });

    app.get("/api/me/pagos", requiereAuth, async (req, res) => {
        try {
            const resultado = await pool.query(
                `SELECT p.id_pago, p.id_recibo, p.monto, p.metodo, p.codigo_operacion, p.fecha_pago, r.periodo
                 FROM pagos p
                 JOIN recibos r ON r.id_recibo = p.id_recibo
                 WHERE r.id_suministro = $1
                 ORDER BY p.fecha_pago DESC;`,
                [req.user.id_suministro]
            );
            return res.json({ suministro: req.user.numero_suministro, cantidad: resultado.rowCount, pagos: resultado.rows });
        } catch (error) {
            console.error('Error ejecutando la ruta.', { codigo: error.code || 'desconocido' });
            return res.status(500).json({ estado: "error", mensaje: "Error interno del servidor." });
        }
    });
}

module.exports = { registerRoutes };
