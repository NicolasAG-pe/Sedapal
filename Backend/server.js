const express = require("express");
const cors = require("cors");
const crypto = require('crypto');
const { Pool } = require("pg");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    host: process.env.DB_HOST || "db",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});


// ==========================================
// PRUEBA DE CONEXIÓN
// ==========================================

app.get("/api/health", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT NOW() AS fecha_servidor"
        );

        res.json({
            estado: "ok",
            mensaje: "API de Hidro Mejora conectada a PostgreSQL",
            fecha: resultado.rows[0].fecha_servidor
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            estado: "error",
            mensaje: "No se pudo conectar con PostgreSQL"
        });
    }
});


// ==========================================
// CONSULTAR RECIBOS POR SUMINISTRO
// ==========================================

app.get("/api/recibos/:suministro", async (req, res) => {

    try {

        const numeroSuministro = req.params.suministro;

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

        console.error(error);

        res.status(500).json({
            mensaje: "Error al consultar los recibos"
        });
    }

});


// ==========================================
// CONSULTAR INCIDENCIAS POR SUMINISTRO
// ==========================================

app.get("/api/incidencias/:suministro", async (req, res) => {

    try {

        const numeroSuministro = req.params.suministro;

        const consulta = `
            SELECT
                i.id_incidencia,
                i.tipo,
                i.descripcion,
                i.referencia,
                i.latitud,
                i.longitud,
                i.fecha_registro
            FROM incidencias i
            JOIN suministros s
              ON s.id_suministro = i.id_suministro
            WHERE s.numero_suministro = $1
            ORDER BY i.fecha_registro DESC;
        `;

        const resultado = await pool.query(
            consulta,
            [numeroSuministro]
        );

        res.json({
            suministro: numeroSuministro,
            cantidad: resultado.rowCount,
            incidencias: resultado.rows
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            mensaje: "Error al consultar las incidencias"
        });
    }

});


function verificarClave(password, almacenado){
  try{
    const partes = String(almacenado || '').split('$');

    if(partes.length !== 3 || partes[0] !== 'scrypt'){
      return false;
    }

    const salt = partes[1];
    const hashOriginal = Buffer.from(partes[2], 'hex');
    const hashCalculado = crypto.scryptSync(password, salt, 64);

    return hashOriginal.length === hashCalculado.length &&
      crypto.timingSafeEqual(hashOriginal, hashCalculado);
  }catch(error){
    return false;
  }
}


// ==========================================
// AUTENTICACIÓN DE USUARIO POR SUMINISTRO
// ==========================================

app.post("/api/auth/login", async (req, res) => {
    try {
        const { numero_suministro, password } = req.body || {};

        if (!/^\d{7,9}$/.test(String(numero_suministro || ''))) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        if (typeof password !== 'string' || password.length < 4) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        const consulta = `
            SELECT
              u.id_usuario,
              u.correo,
              u.clave_hash,
              s.id_suministro,
              s.numero_suministro
            FROM suministros s
            JOIN usuarios u ON u.id_usuario = s.id_usuario
            WHERE s.numero_suministro = $1
            LIMIT 1;
        `;

        const resultado = await pool.query(consulta, [String(numero_suministro)]);

        if (resultado.rowCount === 0) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        const fila = resultado.rows[0];

        if (!verificarClave(password, fila.clave_hash)) {
            return res.status(401).json({
                estado: "error",
                mensaje: "Número de suministro o contraseña incorrectos."
            });
        }

        return res.status(200).json({
            estado: "ok",
            usuario: {
                id_usuario: fila.id_usuario,
                correo: fila.correo
            },
            suministro: {
                id_suministro: fila.id_suministro,
                numero_suministro: fila.numero_suministro
            }
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// REGISTRAR INCIDENCIA
// ==========================================

app.post("/api/incidencias", async (req, res) => {
    try {
        const { numero_suministro, tipo, descripcion, referencia, latitud, longitud } = req.body || {};

        if (!/^\d{7,9}$/.test(String(numero_suministro || '').trim())) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        if (!String(tipo || '').trim()) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El tipo de incidencia es obligatorio."
            });
        }

        if (String(descripcion || '').trim().length < 10) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La descripción debe tener al menos 10 caracteres."
            });
        }

        if (!String(referencia || '').trim()) {
            return res.status(400).json({
                estado: "error",
                mensaje: "La referencia es obligatoria."
            });
        }

        const suministroResultado = await pool.query(
            `SELECT id_suministro
             FROM suministros
             WHERE numero_suministro = $1
             LIMIT 1;`,
            [String(numero_suministro).trim()]
        );

        if (suministroResultado.rowCount === 0) {
            return res.status(404).json({
                estado: "error",
                mensaje: "Suministro no encontrado."
            });
        }

        const idSuministro = suministroResultado.rows[0].id_suministro;

        const latitudValor = (latitud === null || latitud === undefined || latitud === '')
            ? null
            : Number(latitud);
        const longitudValor = (longitud === null || longitud === undefined || longitud === '')
            ? null
            : Number(longitud);

        const insertResultado = await pool.query(
            `INSERT INTO incidencias (
              id_suministro,
              tipo,
              descripcion,
              referencia,
              latitud,
              longitud
            )
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING
              id_incidencia,
              tipo,
              descripcion,
              referencia,
              latitud,
              longitud,
              fecha_registro;`,
            [
                idSuministro,
                String(tipo).trim(),
                String(descripcion).trim(),
                String(referencia).trim(),
                Number.isFinite(latitudValor) ? latitudValor : null,
                Number.isFinite(longitudValor) ? longitudValor : null
            ]
        );

        return res.status(201).json({
            estado: "ok",
            incidencia: insertResultado.rows[0]
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// REGISTRAR PAGO SIMULADO
// ==========================================

app.post("/api/pagos", async (req, res) => {
    let cliente = null;

    try {
        const { numero_suministro, id_recibo, metodo } = req.body || {};

        if (!/^\d{7,9}$/.test(String(numero_suministro || '').trim())) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Número de suministro inválido."
            });
        }

        const idRecibo = Number(id_recibo);

        if (!Number.isInteger(idRecibo) || idRecibo <= 0) {
            return res.status(400).json({
                estado: "error",
                mensaje: "Identificador de recibo inválido."
            });
        }

        if (!String(metodo || '').trim()) {
            return res.status(400).json({
                estado: "error",
                mensaje: "El método de pago es obligatorio."
            });
        }

        cliente = await pool.connect();

        const reciboResultado = await cliente.query(
            `SELECT
               r.id_recibo,
               r.monto,
               r.estado,
               s.numero_suministro
             FROM recibos r
             JOIN suministros s
               ON s.id_suministro = r.id_suministro
             WHERE r.id_recibo = $1
               AND s.numero_suministro = $2
             LIMIT 1;`,
            [idRecibo, String(numero_suministro).trim()]
        );

        if (reciboResultado.rowCount === 0) {
            cliente.release();
            cliente = null;
            return res.status(404).json({
                estado: "error",
                mensaje: "Recibo no encontrado."
            });
        }

        const recibo = reciboResultado.rows[0];

        if (recibo.estado === 'Pagado') {
            cliente.release();
            cliente = null;
            return res.status(409).json({
                estado: "error",
                mensaje: "El recibo ya se encuentra pagado."
            });
        }

        const anioActual = new Date().getFullYear();
        const codigoOperacion = 'HM-PAG-' + anioActual + '-' + String(crypto.randomInt(0, 1000000)).padStart(6, '0');

        await cliente.query('BEGIN');

        const pagoResultado = await cliente.query(
            `INSERT INTO pagos (
               id_recibo,
               monto,
               metodo,
               codigo_operacion
             )
             VALUES ($1,$2,$3,$4)
             RETURNING
               id_pago,
               id_recibo,
               monto,
               metodo,
               codigo_operacion,
               fecha_pago;`,
            [
                idRecibo,
                recibo.monto,
                String(metodo).trim(),
                codigoOperacion
            ]
        );

        await cliente.query(
            `UPDATE recibos
             SET estado = 'Pagado'
             WHERE id_recibo = $1;`,
            [idRecibo]
        );

        await cliente.query('COMMIT');
        cliente.release();
        cliente = null;

        return res.status(201).json({
            estado: "ok",
            pago: pagoResultado.rows[0],
            recibo: {
                id_recibo: idRecibo,
                estado: "Pagado"
            }
        });

    } catch (error) {
        if (cliente) {
            try { await cliente.query('ROLLBACK'); } catch (e) {}
            cliente.release();
        }
        console.error(error);

        return res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// CONSULTAR PAGOS POR SUMINISTRO
// ==========================================

app.get("/api/pagos/:suministro", async (req, res) => {
    try {
        const numeroSuministro = req.params.suministro;

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
        console.error(error);

        res.status(500).json({
            estado: "error",
            mensaje: "Error interno del servidor."
        });
    }
});


// ==========================================
// INICIO DEL SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `API Hidro Mejora ejecutándose en el puerto ${PORT}`
    );
});
