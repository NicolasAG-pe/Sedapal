'use strict';
const fs = require('node:fs');
const path = require('node:path');
function verifyClientRuntime(directory) {
    const prohibited = /\/api\/admin\/|sec-admin|nav-admin|cargarAdmin|sincronizarAdmin|admin\.js|admin\.css/;
    let count = 0;
    function walk(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) {
                if (/^admin$/i.test(entry.name)) throw new Error('Directorio administrativo en runtime cliente.');
                walk(file);
            } else {
                if (/^admin(?:[.-]|$)/i.test(entry.name)) throw new Error('Recurso administrativo en runtime cliente: ' + entry.name);
                count++;
                if (/\.(html|js|css)$/i.test(file) && prohibited.test(fs.readFileSync(file, 'utf8'))) {
                    throw new Error('Código administrativo en runtime cliente: ' + path.relative(directory, file));
                }
            }
        }
    }
    walk(directory);
    for (const required of ['index.html', 'hm-api-config.js', 'shared/api.js', 'shared/ui.js', 'shared/styles.css', 'assets/css/client.css',
        'shared/icons.js','shared/assets/hm-symbol.svg','assets/css/app-layout.css','assets/js/client-home.js',
        'assets/js/client-session.js', 'assets/js/documents.js', 'assets/vendor/socket.io.min.js', 'assets/vendor/jspdf.umd.min.js']) {
        if (!fs.existsSync(path.join(directory, required))) throw new Error('Falta recurso cliente: ' + required);
    }
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    for (const id of ['sec-inicio', 'sec-historial', 'sec-pagos', 'sec-incidencias', 'sec-cortes',
        'sec-perfil', 'sec-ayuda', 'sec-notificaciones', 'hidrobot-root', 'spotlight-overlay']) {
        if (!html.includes('id="' + id + '"')) throw new Error('Falta funcionalidad cliente: ' + id);
    }
    return { files: count, administrativeCode: false };
}
if (require.main === module) console.log(JSON.stringify(verifyClientRuntime(process.argv[2]), null, 2));
module.exports = { verifyClientRuntime };
