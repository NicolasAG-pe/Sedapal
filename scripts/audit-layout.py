#!/usr/bin/env python3
"""Inventario de lectura: clasifica archivos y duplicados sin borrar ni mover."""
import argparse
import collections
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def category(relative):
    parts = relative.parts
    name = relative.name.lower()
    if not parts or parts[0] == '.git':
        return 'B. NECESARIO PARA DESARROLLO', 'Metadatos Git; nunca limpiar manualmente'
    if name.endswith(('.keystore', '.jks')):
        return 'B. NECESARIO PARA DESARROLLO', 'Identidad de firma única; no es una caché'
    if '.idea' in parts or name == 'gradle-wrapper.jar' or ('.gradle' in parts and name == 'config.properties'):
        return 'B. NECESARIO PARA DESARROLLO', 'Configuración IDE/JDK o wrapper Gradle'
    if 'node_modules' in parts or name.endswith(('.pyc', '.pyo')) or any(p in ('.gradle', '.cache', 'cache', 'npm-cache', '__pycache__', '.pytest_cache') for p in parts):
        return 'E. CACHE', 'Instalación/caché reconstruible; preservar locks y claves'
    if parts[0] == 'backups':
        return 'G. BACKUP', 'Recuperación privada; verificar contenido/checksum antes de depurar'
    if 'backups' in parts:
        return 'I. HISTÓRICO OBSOLETO', 'Copia inactiva; comprobar referencias y recuperación'
    if 'javadoc' in parts:
        return 'D. GENERADO Y RECONSTRUIBLE', 'Generar desde Java según README académico'
    if parts[0] == 'artifacts':
        if any(p in ('tests', 'integral') for p in parts):
            return 'F. RESULTADO DE PRUEBAS', 'Evidencia de pruebas, no fuente'
        return 'D. GENERADO Y RECONSTRUIBLE', 'Build/runtime/APK/PDF; conservar muestras vigentes'
    if any(p in ('build', 'dist', 'coverage', '.generated') for p in parts) or relative.suffix in ('.apk', '.aab', '.class'):
        return 'D. GENERADO Y RECONSTRUIBLE', 'Salida generada; comprobar comando de generación'
    if parts[0] == 'android' and ('assets' in parts or name == 'config.xml'):
        return 'D. GENERADO Y RECONSTRUIBLE', 'Configuración/runtime nativo generado por Capacitor'
    if name.endswith(('.tmp', '.log', '.bak', '.old', '.swp', '.orig', '~')) or name in ('.ds_store', 'thumbs.db'):
        return 'J. DESCONOCIDO / REQUIERE REVISIÓN', 'Temporal posible; no eliminar sin verificar contenido'
    if parts[0] == 'docs' or 'documentacion' in parts or name == 'readme.md':
        return 'C. DOCUMENTACIÓN ACTUAL', 'Documentación permanente o modelo académico'
    if parts[0] in ('scripts', 'android') or 'test' in parts:
        return 'B. NECESARIO PARA DESARROLLO', 'Herramienta, prueba o fuente Android'
    if parts[0] in ('Frontend', 'Admin', 'Backend', 'Shared', 'Base-de-Datos') or name.startswith(('.env', 'capacitor.config.')) or name in ('.gitignore', '.dockerignore', 'package.json', 'package-lock.json', 'compose.yaml'):
        return 'A. NECESARIO PARA EJECUCIÓN', 'Fuente/configuración; conservar'
    return 'J. DESCONOCIDO / REQUIERE REVISIÓN', 'Revisión manual; no eliminar'


def inventory(output):
    output = output.resolve()
    if not output.is_relative_to(ROOT):
        raise ValueError('La salida debe estar dentro de Sedapal.')
    output.mkdir(parents=True, exist_ok=True)
    records, directories, hashes = [], [], collections.defaultdict(list)
    for folder, dirs, files in os.walk(ROOT, followlinks=False):
        here = Path(folder)
        if here == output:
            dirs[:] = []
            continue
        directories.append(str(here.relative_to(ROOT)))
        for name in sorted(dirs + files):
            item = here / name
            if item.is_symlink():
                records.append({'path': str(item.relative_to(ROOT)), 'category': category(Path(item.relative_to(ROOT)))[0], 'reason': 'Enlace de herramienta o compatibilidad; no seguir automáticamente', 'symlink': os.readlink(item)})
            elif item.is_file():
                relative = item.relative_to(ROOT)
                kind, reason = category(relative)
                sha = None
                if relative.parts[0] != '.git':
                    digest = hashlib.sha256()
                    with item.open('rb') as stream:
                        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                            digest.update(chunk)
                    sha = digest.hexdigest()
                    hashes[(item.stat().st_size, sha)].append(str(relative))
                records.append({'path': str(relative), 'category': kind, 'reason': reason, 'bytes': item.stat().st_size, 'sha256': sha})
    duplicates = [{'bytes': size, 'sha256': sha, 'files': paths} for (size, sha), paths in hashes.items() if len(paths) > 1]
    for item in records:
        item['duplicate'] = bool(item.get('sha256') and len(hashes[(item['bytes'], item['sha256'])]) > 1)
    counts = dict(collections.Counter(item['category'] for item in records))
    directory_classes = [{'path': item, 'category': category(Path(item))[0], 'reason': category(Path(item))[1]} for item in directories]
    (output / 'inventory.json').write_text(json.dumps({'files': records, 'directories': directories, 'directoryClasses': directory_classes, 'counts': counts}, ensure_ascii=False, indent=2) + '\n')
    (output / 'duplicates.json').write_text(json.dumps(duplicates, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(records), 'counts': counts, 'duplicateGroups': len(duplicates)}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    inventory(parser.parse_args().output)
