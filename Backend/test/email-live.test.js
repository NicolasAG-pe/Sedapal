'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { leerOculto, comprobar } = require('./email-live.cjs');

function terminal() {
    const input = new PassThrough();
    const output = new PassThrough();
    const modes = [];
    let text = '';
    input.isTTY = output.isTTY = true;
    input.setRawMode = mode => { input.isRaw = mode; modes.push(mode); };
    output.on('data', chunk => { text += chunk.toString(); });
    return { input, output, modes, text: () => text };
}

test('entrada privada no imprime el valor y restaura terminal/listeners', async () => {
    const t = terminal();
    const pending = leerOculto('Entrada privada: ', t.input, t.output);
    t.input.write('dato-sintetico');
    t.input.write('\u007fX\r');
    assert.equal(await pending, 'dato-sinteticX');
    assert.equal(t.text(), 'Entrada privada: \n');
    assert.deepEqual(t.modes, [true, false]);
    assert.equal(t.input.isPaused(), true, 'La entrada no mantiene abierto el proceso después del prompt');
    assert.equal(t.input.listenerCount('data'), 0);
    assert.equal(t.input.listenerCount('end'), 0);
    assert.equal(t.input.listenerCount('error'), 0);
});

test('Ctrl-C y EOF cancelan sin revelar entrada y restauran modo anterior', async () => {
    for (const end of ['interrupt', 'eof']) {
        const t = terminal();
        t.input.isRaw = true;
        const pending = leerOculto('Entrada privada: ', t.input, t.output);
        t.input.write('dato-sintetico');
        if (end === 'interrupt') t.input.write('\u0003');
        else t.input.end();
        await assert.rejects(pending, { message: 'Entrada cancelada.' });
        assert.equal(t.text(), 'Entrada privada: \n');
        assert.deepEqual(t.modes, [true, true]);
        assert.equal(t.input.listenerCount('data'), 0);
    }
});

test('rechaza entrada sin TTY y errores de comprobación no exponen valores', () => {
    assert.throws(() => leerOculto('Entrada privada: ', new PassThrough(), new PassThrough()),
        { message: 'Comprobación no superada.' });
    assert.throws(() => comprobar(false), { message: 'Comprobación no superada.' });
});
