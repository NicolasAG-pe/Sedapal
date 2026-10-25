'use strict';

class ErrorRecibo extends Error {
    constructor(status, mensaje) { super(mensaje); this.status = status; }
}
const conflicto = mensaje => new ErrorRecibo(409, mensaje);
const inexistente = () => new ErrorRecibo(404, 'Recibo no encontrado.');
const duplicado = () => conflicto('Ya existe un recibo para este suministro y periodo.');

function errorPublico(error) {
    if (error instanceof ErrorRecibo) return error;
    if (error.code === '23505' && error.constraint === 'uq_recibos_suministro_periodo') return duplicado();
    if (error.code === '23505' && error.constraint === 'uq_pagos_recibo') {
        return conflicto('El recibo ya tiene un pago registrado.');
    }
    if (error.code === '23505') return conflicto('Conflicto de integridad. Actualiza los datos o solicita revisión administrativa.');
    if (['55P03', '40P01', '40001'].includes(error.code)) {
        return conflicto('El recibo está siendo procesado. Actualiza los datos e intenta nuevamente.');
    }
    if (error.code === '23503') return conflicto('La información asociada cambió. Actualiza los datos e intenta nuevamente.');
    if (error.code === '57014') return new ErrorRecibo(503, 'La operación no está disponible temporalmente. Intenta más tarde.');
    return error;
}

function crearServicioRecibos({ pool, validarRecibo }) {
    async function transaccion(operacion) {
        const client = await pool.connect();
        let descartar;
        try {
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            await client.query("SET LOCAL lock_timeout = '2s'");
            await client.query("SET LOCAL statement_timeout = '5s'");
            await client.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
            const result = await operacion(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (_) { descartar = new Error('Conexión de operación descartada.'); }
            throw errorPublico(error);
        } finally { client.release(descartar); }
    }
    function validar(body) {
        const datos = validarRecibo(body);
        if (datos.error) throw new ErrorRecibo(400, datos.error);
        return datos;
    }
    function validarId(id) {
        if (!Number.isSafeInteger(id) || id <= 0) throw inexistente();
    }
    async function bloquearSuministro(client, campo, valor) {
        // campo solo proviene de las dos llamadas internas, nunca del cliente HTTP.
        const { rows: [s] } = await client.query(`SELECT id_suministro,numero_suministro,id_usuario
            FROM public.suministros WHERE ${campo}=$1 FOR NO KEY UPDATE`, [valor]);
        return s;
    }
    async function bloquearRecibo(client, id, idSuministro) {
        // Lectura inicial sin lock: obtener el padre. Se revalida tras bloquearlo.
        const { rows: [ref] } = await client.query(`SELECT id_suministro FROM public.recibos
            WHERE id_recibo=$1`, [id]);
        if (!ref || (idSuministro !== undefined && String(ref.id_suministro) !== String(idSuministro))) throw inexistente();
        const suministro = await bloquearSuministro(client, 'id_suministro', ref.id_suministro);
        if (!suministro) throw inexistente();
        const { rows: [recibo] } = await client.query(`SELECT r.* FROM public.recibos r
            WHERE r.id_recibo=$1 AND r.id_suministro=$2 FOR UPDATE OF r`, [id, suministro.id_suministro]);
        if (!recibo) throw inexistente();
        return { recibo, suministro };
    }
    async function tienePago(client, id) {
        // Sentencia nueva DESPUÉS del lock: ve pagos confirmados mientras esperaba.
        const { rows: [r] } = await client.query(`SELECT EXISTS(
            SELECT 1 FROM public.pagos WHERE id_recibo=$1) AS tiene_pago`, [id]);
        if (r.tiene_pago) return true;
        const {rowCount} = await client.query(`SELECT 1 FROM public.operaciones_pago WHERE id_recibo=$1
            AND estado IN ('declarada','pendiente_verificacion','verificada_manual','acreditada_proveedor') LIMIT 1`, [id]);
        return rowCount > 0;
    }
    async function comprobarDuplicado(client, suministro, periodo, id = null) {
        const { rowCount } = await client.query(`SELECT r.id_recibo FROM public.recibos r
            WHERE r.id_suministro=$1 AND r.periodo=$2 AND ($3::bigint IS NULL OR r.id_recibo<>$3)
            LIMIT 1`, [suministro, periodo, id]);
        if (rowCount) throw duplicado();
    }
    return {
        async crear(body) {
            const v = validar(body);
            return transaccion(async client => {
                const s = await bloquearSuministro(client, 'numero_suministro', v.numero);
                if (!s) throw new ErrorRecibo(404, 'Suministro no encontrado.');
                await comprobarDuplicado(client, s.id_suministro, v.periodo);
                const { rows: [recibo] } = await client.query(`INSERT INTO public.recibos
                    (id_suministro,periodo,fecha_emision,fecha_vencimiento,monto,consumo_m3,estado)
                    VALUES ($1,$2,$3,$4,$5,$6,'Emitido') RETURNING *`,
                [s.id_suministro, v.periodo, v.emision, v.vencimiento, v.monto, v.consumo]);
                return { recibo: { ...recibo, numero_suministro: s.numero_suministro, tiene_pago: false } };
            });
        },
        async editar(id, body) {
            validarId(id);
            return transaccion(async client => {
                const { recibo: r, suministro: s } = await bloquearRecibo(client, id);
                if (await tienePago(client, id) || r.estado === 'Pagado') {
                    throw conflicto('No se puede modificar un recibo pagado o con un pago registrado.');
                }
                const v = validar({ ...body, numero_suministro: s.numero_suministro });
                await comprobarDuplicado(client, s.id_suministro, v.periodo, id);
                const { rows: [recibo] } = await client.query(`UPDATE public.recibos
                    SET periodo=$1,fecha_emision=$2,fecha_vencimiento=$3,monto=$4,consumo_m3=$5
                    WHERE id_recibo=$6 RETURNING *`, [v.periodo, v.emision, v.vencimiento, v.monto, v.consumo, id]);
                return { recibo: { ...recibo, numero_suministro: s.numero_suministro, tiene_pago: false } };
            });
        },
        async anular(id) {
            validarId(id);
            return transaccion(async client => {
                const { recibo: r, suministro: s } = await bloquearRecibo(client, id);
                if (await tienePago(client, id) || r.estado === 'Pagado') {
                    throw conflicto('No se puede anular un recibo pagado o con un pago registrado.');
                }
                const { rows: [recibo] } = await client.query(`UPDATE public.recibos SET estado='Anulado'
                    WHERE id_recibo=$1 RETURNING *`, [id]);
                return { recibo: { ...recibo, numero_suministro: s.numero_suministro, tiene_pago: false } };
            });
        },
        async pagar() {
            throw new ErrorRecibo(410, 'Utiliza operaciones de pago; una demostración no acredita la deuda.');
        }
    };
}

function responderErrorRecibo(res, error) {
    const publico = errorPublico(error);
    if (!(publico instanceof ErrorRecibo)) console.error('Fallo interno en operación de recibos.');
    return res.status(publico instanceof ErrorRecibo ? publico.status : 500).json({ estado: 'error',
        mensaje: publico instanceof ErrorRecibo ? publico.message : 'Error interno del servidor.' });
}

module.exports = { crearServicioRecibos, responderErrorRecibo };
