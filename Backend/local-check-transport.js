'use strict';

// Los scripts de comprobación pueden manejar JWT reales: no aceptar HTTP,
// credenciales en la URL, nombres ajenos ni desactivar la validación TLS.
function secureCheckEndpoint(value, kind, env = process.env) {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('La verificación TLS debe permanecer activa.');
    if (!['web', 'admin'].includes(kind)) throw Error('Servicio de comprobación inválido.');
    let url;
    try { url = new URL(value); } catch (_) { throw Error(`Configura TEST_${kind.toUpperCase()}_BASE como origen HTTPS verificado.`); }
    const permitted = [kind, `${kind}-tls`, 'localhost', '127.0.0.1'];
    if (url.protocol !== 'https:' || !permitted.includes(url.hostname) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
        throw Error(`TEST_${kind.toUpperCase()}_BASE debe ser HTTPS, sin ruta ni credenciales, hacia un servicio local autorizado.`);
    }
    return url.origin;
}
// Un chequeo no debe emitir credenciales válidas para una instalación real.
// Identidad y secreto son deliberadamente exclusivos de la base de pruebas.
function requireSyntheticFixture(env = process.env) {
    const fixtureSecret = 'hidro-local-check-synthetic-only-2026';
    if (env.NODE_ENV !== 'development' || env.POSTGRES_DB !== 'hm_rootless_test' || env.POSTGRES_USER !== 'hm_fixture' ||
        !['db', 'hm-rootless-sonar-db'].includes(env.DB_HOST) || env.DATABASE_URL || env.AUTH_TOKEN_SECRET !== fixtureSecret)
        throw Error('Los chequeos autenticados requieren exclusivamente el fixture PostgreSQL y secreto sintéticos.');
}
async function verifyFixtureDatabase(pool) {
    const result = await pool.query('SELECT current_database() AS db, current_user AS role');
    if (result.rows[0]?.db !== 'hm_rootless_test' || result.rows[0]?.role !== 'hm_fixture')
        throw Error('Base o rol ajeno al fixture sintético.');
}
module.exports = { secureCheckEndpoint, requireSyntheticFixture, verifyFixtureDatabase };
