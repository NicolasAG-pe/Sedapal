"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { nuevaBase, sql } = require("./email-schema.cjs");
test("012 requiere 011, preserva datos/lecturas y secuencias, no encola históricos y es repetible", async () => {
  const { pool } = await nuevaBase("push_preservation");
  try {
    await pool.query(sql("init.sql"));
    const c = await pool.connect();
    try {
      await assert.rejects(
        c.query(sql("migrations/012_notificaciones_push.sql")),
      );
      await c.query("ROLLBACK");
    } finally {
      c.release();
    }
    await pool.query(sql("migrations/011_recuperacion_clave.sql"));
    await pool.query(
      "INSERT INTO usuarios(correo,clave_hash) VALUES('push-schema@example.invalid','fixture');INSERT INTO suministros(numero_suministro,id_usuario) VALUES('900990001',1);INSERT INTO notificaciones(id_suministro,titulo,mensaje,tipo) VALUES(1,'Histórico','Conservar','recibo');INSERT INTO notificaciones_lecturas VALUES(1,1,clock_timestamp());INSERT INTO incidencias(id_suministro,tipo,descripcion,foto) VALUES(1,'Fixture','Conservar',decode('89504e47','hex'));",
    );
    const snapshot = async () => {
      const data = {};
      for (const table of [
        "usuarios",
        "suministros",
        "incidencias",
        "notificaciones_lecturas",
      ])
        data[table] = (await pool.query("SELECT * FROM " + table)).rows;
      data.n = (
        await pool.query(
          "SELECT id_notificacion,id_suministro,titulo,mensaje,tipo,alcance,fecha_registro FROM notificaciones",
        )
      ).rows;
      data.seq = (
        await pool.query(
          "SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY 1",
        )
      ).rows;
      return data;
    };
    const before = await snapshot();
    await pool.query(sql("migrations/012_notificaciones_push.sql"));
    await pool.query(sql("migrations/012_notificaciones_push.sql"));
    assert.deepEqual(await snapshot(), before);
    assert.equal(
      (await pool.query("SELECT count(*)::int n FROM push_entregas")).rows[0].n,
      0,
    );
  } finally {
    await pool.end();
  }
});
