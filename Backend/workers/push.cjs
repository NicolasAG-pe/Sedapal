"use strict";
const { Pool } = require("pg"),
  { obtenerConfiguracion } = require("../config"),
  { createPushWorker, reminders, retire } = require("../push-worker"),
  { configuredSender } = require("../push-provider");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function validationConfiguration(env) {
  const id = env.PUSH_VALIDATION_DELIVERY_ID || '', enabled = env.PUSH_VALIDATION_SINGLE_ATTEMPT;
  if (!id && (!enabled || enabled === '0')) return null;
  if (enabled !== '1' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    throw Error('Validación push dirigida inválida.');
  return { deliveryId: id, singleAttempt: true };
}
async function main(args = process.argv.slice(2), env = process.env) {
  if (args[0] === "--help") {
    console.log(
      "Push desactivado. --once/--run/--reminders requiere PUSH_ENABLED=1, PUSH_WORKER_ENABLED=1, PUSH_DATABASE_URL y PUSH_EXPECTED_DATABASE; mock solo en laboratorio local, FCM además requiere autorización explícita y archivo privado de identidad o token temporal. Piloto: solo --once tras aprobar destino y cola.",
    );
    return 0;
  }
  let pool,
    stop = false;
  const halt = () => {
    stop = true;
  };
  try {
    const validation = validationConfiguration(env);
    if (validation && args[0] !== '--run') throw Error();
    if (
      args.length !== 1 ||
      !["--once", "--run", "--reminders"].includes(args[0]) ||
      env.PUSH_ENABLED !== "1" ||
      env.PUSH_WORKER_ENABLED !== "1"
    )
      throw Error();
    const url = new URL(env.PUSH_DATABASE_URL || "");
    if (
      !env.PUSH_EXPECTED_DATABASE ||
      decodeURIComponent(url.pathname.slice(1)) !== env.PUSH_EXPECTED_DATABASE
    )
      throw Error();
    if (
      env.PUSH_PROVIDER === "mock" &&
      (!["127.0.0.1", "localhost"].includes(url.hostname) ||
        env.NODE_ENV !== "test")
    )
      throw Error();
    pool = new Pool({
      ...obtenerConfiguracion({ DATABASE_URL: url.toString() }).database,
      max: 2,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      idle_in_transaction_session_timeout: 10000,
    });
    pool.on("error", halt);
    if (
      (await pool.query("SELECT current_database() db")).rows[0].db !==
      env.PUSH_EXPECTED_DATABASE
    )
      throw Error();
    if (args[0] === "--reminders") {
      console.log(JSON.stringify({ creadas: await reminders(pool, env) }));
      return 0;
    }
    const worker = createPushWorker({ pool, env, send: configuredSender(env), ...validation });
    const schema = await pool.query("SELECT to_regclass('public.push_dispositivos') IS NOT NULL AND to_regclass('public.push_entregas') IS NOT NULL AS ready");
    if (!schema.rows[0].ready) throw Error();
    process.once("SIGTERM", halt);
    process.once("SIGINT", halt);
    if (process.send) process.send({ event: 'push_worker_ready' });
    let validationFinished = false;
    do {
      if (validationFinished) { await delay(1000); continue; }
      if (!validation) await retire(pool);
      const r = await worker.processOne();
      if (r.estado === "configuracion_incompatible") throw Error();
      if (validation) {
        validationFinished = true;
        console.log(JSON.stringify({ event: 'push_validation_result', estado: r.estado, attemptLimit: 1 }));
        continue;
      }
      if (args[0] === "--once") {
        console.log(JSON.stringify(r));
        break;
      }
      if (r.estado === "vacio") await delay(1000);
    } while (!stop);
    return 0;
  } catch (_) {
    console.error(
      "Worker push detenido: revisar destino, esquema y configuración privada.",
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
      process.exitCode = 1;
    });
module.exports = { main, validationConfiguration };
