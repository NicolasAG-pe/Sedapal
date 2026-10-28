"use strict";
const { Pool } = require("pg");
const { setTimeout: delay } = require("node:timers/promises");
const { obtenerConfiguracion } = require("../config");
const {
  configurarProveedorWorker,
  crearRemitenteProveedor,
} = require("../email-provider");
const { createRecoveryWorker } = require("../password-recovery-worker");
async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Recuperación desactivada por defecto. --once/--run requiere PASSWORD_RECOVERY_ENABLED=1, PASSWORD_RECOVERY_WORKER_ENABLED=1, PASSWORD_RECOVERY_DATABASE_URL, PASSWORD_RECOVERY_EXPECTED_DATABASE, claves privadas de recuperación y proveedor existente.",
    );
    return 0;
  }
  let pool,
    stop = false;
  const halt = () => {
    stop = true;
  };
  try {
    if (
      args.length !== 1 ||
      !["--once", "--run"].includes(args[0]) ||
      env.PASSWORD_RECOVERY_WORKER_ENABLED !== "1" ||
      env.PASSWORD_RECOVERY_ENABLED !== "1"
    )
      throw Error();
    const url = new URL(env.PASSWORD_RECOVERY_DATABASE_URL || ""),
      expected = env.PASSWORD_RECOVERY_EXPECTED_DATABASE;
    if (!expected || decodeURIComponent(url.pathname.slice(1)) !== expected)
      throw Error();
    const config = obtenerConfiguracion({ DATABASE_URL: url.toString() });
    pool = new Pool({
      ...config.database,
      max: 2,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      idle_in_transaction_session_timeout: 10000,
      application_name: "hidro-password-recovery",
    });
    pool.on("error", () => {
      stop = true;
      process.exitCode = 1;
    });
    if (
      (await pool.query("SELECT current_database() AS db")).rows[0].db !==
      expected
    )
      throw Error();
    const transport = configurarProveedorWorker({
      ...env,
      EMAIL_REGISTRATION_ALLOWED_EMAIL:
        env.PASSWORD_RECOVERY_ALLOWED_EMAIL || null,
    });
    const worker = createRecoveryWorker({
      pool,
      env,
      enviarCodigo: crearRemitenteProveedor(transport),
    });
    process.once("SIGTERM", halt);
    process.once("SIGINT", halt);
    do {
      const r = await worker.procesarUno();
      if (r.estado === "configuracion_incompatible") throw Error();
      if (args[0] === "--once") {
        console.log(JSON.stringify(r));
        break;
      }
      if (r.estado === "vacio") await delay(1000);
    } while (!stop);
    return process.exitCode ? 1 : 0;
  } catch (_) {
    console.error(
      "Trabajador de recuperación detenido: revisa configuración, destino y esquema privadamente.",
    );
    return 1;
  } finally {
    process.removeListener("SIGTERM", halt);
    process.removeListener("SIGINT", halt);
    if (pool) await pool.end();
  }
}
if (require.main === module)
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error("No se completó el cierre del trabajador de recuperación.");
      process.exitCode = 1;
    });
module.exports = { main };
