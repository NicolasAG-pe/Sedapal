'use strict';

// El proveedor solo decide la variante de un artículo público. No recibe mensajes, cuentas ni el token.
const simulatedProvider = Object.freeze({
    async select({ continuation, variants }) {
        return continuation && variants.includes('detail') ? 'detail' : 'base';
    }
});

module.exports = { simulatedProvider };
