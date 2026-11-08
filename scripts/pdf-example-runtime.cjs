'use strict';
// Las fuentes son módulos locales fijos, compartidos con el cliente web.
// El adaptador temporal evita compilar texto y restaura el global del proceso.
let documents;
function loadDocuments() {
    if (documents) return documents;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const browser = { jspdf: require('../Frontend/assets/vendor/jspdf.umd.min.js') };
    Object.defineProperty(globalThis, 'window', { value: browser, configurable: true, writable: true });
    try {
        require('../Shared/ui.js');
        require('../Frontend/assets/js/documents.js');
        if (!browser.HMDocuments?.receipt || !browser.HMDocuments?.payment) throw Error('Generador de documentos no disponible.');
        documents = browser.HMDocuments;
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
        else delete globalThis.window;
    }
    return documents;
}
module.exports = { loadDocuments };
