'use strict';
// Fusiona cobertura Node con capturas V8 de navegador de un entorno sintético.
// Nunca atribuye cobertura a un archivo cuyo contenido no coincide con la captura.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const [nodeJson, clientJson, adminJson, outputDir, toolPackage] = process.argv.slice(2);
if (!nodeJson || !clientJson || !adminJson || !outputDir || !toolPackage) {
    throw Error('Uso: node scripts/merge-browser-coverage.cjs node.json cliente.json admin.json salida ruta/c8/package.json');
}
const fromTool = createRequire(path.resolve(toolPackage));
const v8ToIstanbul = fromTool('v8-to-istanbul');
const coverage = fromTool('istanbul-lib-coverage');
const report = fromTool('istanbul-lib-report');
const reports = fromTool('istanbul-reports');
const map = coverage.createCoverageMap(JSON.parse(fs.readFileSync(nodeJson, 'utf8')));
async function add(file, scope) {
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    let added = 0, inline = 0, unmatched = 0;
    for (const item of entries) {
        const url = new URL(item.url);
        if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw Error('Cobertura de origen no local rechazada.');
        if (url.pathname === '/' || url.pathname.endsWith('.html')) { inline++; continue; }
        let candidates;
        if (url.pathname.startsWith('/shared/')) candidates = [path.join(root, 'Shared', url.pathname.slice(8))];
        else if (url.pathname.startsWith('/assets/')) candidates = [path.join(root, scope, url.pathname.slice(1)), path.join(root, 'Frontend', url.pathname.slice(1))];
        else if (url.pathname === '/hm-api-config.js') candidates = [path.join(root, scope, 'hm-api-config.js')];
        else { unmatched++; continue; }
        const target = candidates.find(candidate => candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.readFileSync(candidate, 'utf8') === item.source);
        if (!target) { unmatched++; continue; }
        // Mantener offsets: algunos vendors no incluyen su archivo .map en el repositorio.
        const source = item.source.replace(/\/\/[#@] sourceMappingURL=[^\r\n]*/g, match => ' '.repeat(match.length));
        const converter = v8ToIstanbul(target, 0, { source });
        await converter.load();
        converter.applyCoverage(item.functions);
        map.merge(converter.toIstanbul());
        added++;
    }
    console.log(`${scope}: ${added} scripts con fuente verificada; ${inline} inline sin mapear; ${unmatched} sin coincidencia.`);
}
(async () => {
    await add(clientJson, 'Frontend');
    await add(adminJson, 'Admin');
    const context = report.createContext({ dir: path.resolve(outputDir), coverageMap: map });
    reports.create('lcovonly').execute(context);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
