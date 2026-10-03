const express = require("express");
const cors = require("cors");
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


// ==========================================
// INICIO DEL SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `API Hidro Mejora ejecutándose en el puerto ${PORT}`
    );
});
