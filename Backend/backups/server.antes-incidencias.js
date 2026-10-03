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
                i.fecha_registro
            FROM incidencias i
            INNER JOIN suministros s
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
// INICIO DEL SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `API Hidro Mejora ejecutándose en el puerto ${PORT}`
    );
});
