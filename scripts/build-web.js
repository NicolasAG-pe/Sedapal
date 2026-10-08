'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readApiBase, root } = require('./public-api-config');
const historicalImages = new Set(['LogoSedapal.png', 'logo.png', 'sedapal1.png', 'sedapal.jpg']);
function runtimeText(directory) {
    return fs.readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.name!=='vendor').map(entry=>{
        const file=path.join(directory,entry.name);
        return entry.isDirectory()?runtimeText(file):/\.(html|css|js)$/.test(file)?fs.readFileSync(file,'utf8'):'';
    }).join('\n');
}

function buildWeb(target, env = process.env, outputDirectory) {
    const apiBase = readApiBase(target, env);
    if (target === 'android' && !outputDirectory) {
        const generated = path.join(root, 'artifacts/android/staging');
        fs.mkdirSync(generated, { recursive: true });
        const staging = fs.mkdtempSync(path.join(generated, 'android-client-'));
        buildWeb(target, env, staging);
        require('./verify-client-runtime').verifyClientRuntime(staging);
        const destination = path.join(root, require('../capacitor.config.js').webDir);
        const rollback = fs.mkdtempSync(path.join(generated, 'rollback-'));
        const previous = path.join(rollback, 'runtime');
        try {
            if (fs.existsSync(destination)) fs.renameSync(destination, previous);
            fs.renameSync(staging, destination);
        } catch (error) {
            if (fs.existsSync(previous)) fs.renameSync(previous, destination);
            throw error;
        } finally {
            // Solo copias generadas: conservarlas hasta completar el reemplazo.
            fs.rmSync(rollback, { recursive: true, force: true });
            fs.rmSync(staging, { recursive: true, force: true });
        }
        return destination;
    }
    if (target === 'android' && fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length) {
        throw new Error('La salida Android debe estar vacía; usa un directorio nuevo.');
    }
    const output = outputDirectory || path.join(root, { web: 'artifacts/web/client', admin: 'artifacts/web/admin' }[target]);
    fs.mkdirSync(output, { recursive: true });
    // Copiar solo runtime. Los respaldos, Dockerfiles y .env no se publican.
    // No borrar archivos anteriores ni modificar la fuente Frontend/.
    const source = target === 'admin' ? 'Admin' : 'Frontend';
    fs.copyFileSync(path.join(root, source, 'index.html'), path.join(output, 'index.html'));
    const references=fs.readFileSync(path.join(root,source,'index.html'),'utf8')+'\n'+runtimeText(path.join(root,source,'assets'));
    fs.cpSync(path.join(root, source, 'assets'), path.join(output, 'assets'), {
        recursive:true,
        // Conservar originales; omitir de los paquetes solo imágenes sin referencias.
        filter:file=>!historicalImages.has(path.basename(file))||references.includes(path.basename(file))
    });
    if (target === 'admin') {
        fs.cpSync(path.join(root, 'Shared'), path.join(output, 'shared'), { recursive: true });
        fs.mkdirSync(path.join(output, 'assets/vendor'), { recursive: true });
        fs.copyFileSync(path.join(root, 'Frontend/assets/vendor/socket.io.min.js'), path.join(output, 'assets/vendor/socket.io.min.js'));
    } else {
        fs.mkdirSync(path.join(output, 'shared'), { recursive: true });
        for (const name of ['api.js', 'ui.js', 'styles.css', 'icons.js']) {
            fs.copyFileSync(path.join(root, 'Shared', name), path.join(output, 'shared', name));
        }
        fs.cpSync(path.join(root, 'Shared/assets'), path.join(output, 'shared/assets'), { recursive: true });
    }
    fs.writeFileSync(path.join(output, 'hm-api-config.js'),
        '// Generado desde API_BASE_URL: configuración pública, sin secretos.\n' +
        `window.HM_API_BASE = ${JSON.stringify(apiBase)};\n`);
    return output;
}

if (require.main === module) {
    try {
        const target = process.argv[2] || 'web';
        console.log(`Runtime ${target} generado en ${buildWeb(target)}.`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { buildWeb };
