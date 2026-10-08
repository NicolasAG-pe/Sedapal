'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { obtenerConfiguracion } = require('../config');

test('Docker conserva sus credenciales, host y puerto sin SSL', () => {
    const config = obtenerConfiguracion({ POSTGRES_DB: 'local', POSTGRES_USER: 'demo', POSTGRES_PASSWORD: 'fixture' });
    assert.equal(config.port, 3000);
    assert.equal(config.database.host, 'db');
    assert.equal(config.database.database, 'local');
    assert.equal(config.database.ssl, false);
});

test('DATABASE_URL tiene prioridad y pg negocia SSL verificado con servidor externo', () => {
    const config = obtenerConfiguracion({ PORT: '10000', DATABASE_URL: 'postgresql://fixture:fixture@db.example.invalid/app?sslmode=require&channel_binding=require', POSTGRES_DB: 'ignorar' });
    const client = new Client(config.database);
    assert.equal(config.port, 10000);
    assert.equal(client.database, 'app');
    assert.equal(client.host, 'db.example.invalid');
    assert.ok(client.ssl);
    assert.notEqual(client.ssl.rejectUnauthorized, false);
    assert.equal(new URL(config.database.connectionString).searchParams.get('sslmode'), 'verify-full');
    assert.equal(new URL(config.database.connectionString).searchParams.get('channel_binding'), 'require');
});

test('DATABASE_URL local puede conectar al PostgreSQL Docker sin SSL', () => {
    const config = obtenerConfiguracion({ DATABASE_URL: 'postgres://fixture:fixture@db:5432/app' });
    assert.equal(new Client(config.database).ssl, false);
});

test('desarrollo permite localhost y WebView aunque haya otro origen configurado', () => {
    const config = obtenerConfiguracion({ CORS_ALLOWED_ORIGINS: 'https://web.example.invalid, https://web.example.invalid' });
    assert.deepEqual(config.origenes, ['https://web.example.invalid', 'http://localhost:8080', 'http://localhost:8081', 'https://localhost', 'http://localhost']);
});

test('producción permite solo los orígenes explícitos', () => {
    assert.deepEqual(obtenerConfiguracion({ NODE_ENV: 'production' }).origenes, []);
    assert.deepEqual(obtenerConfiguracion({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://web.example.invalid,https://localhost' }).origenes, ['https://web.example.invalid', 'https://localhost']);
});

test('configuración inválida falla sin divulgar DATABASE_URL', () => {
    assert.throws(() => obtenerConfiguracion({ PORT: 'abc' }), /PORT/);
    assert.throws(() => obtenerConfiguracion({ DATABASE_URL: 'SECRET_FIXTURE' }), error => !error.message.includes('SECRET_FIXTURE'));
    assert.throws(() => obtenerConfiguracion({ CORS_ALLOWED_ORIGINS: '*' }), /CORS/);
    assert.throws(() => obtenerConfiguracion({ CORS_ALLOWED_ORIGINS: 'https://web.example.invalid/api' }), /sin rutas/);
});
