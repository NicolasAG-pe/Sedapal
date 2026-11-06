#!/usr/bin/env python3
"""DD-01: extractor estático del DDL versionado; nunca conecta ni ejecuta SQL."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/base-de-datos'
MARKER = '-- Manual, aditiva e idempotente. No activa 2FA ni modifica cuentas existentes.'
NAME = r'(?:public\.)?[a-z_][a-z_0-9]*'
DESCRIPTIONS = {
 'usuarios':'Cuentas, rol y habilitación; clave_hash contiene un derivado, nunca una contraseña en claro.',
 'suministros':'Suministros asociados a cuentas; distrito/zona opcionales del prototipo.',
 'registros_correo_pendientes':'Solicitudes de registro con verificación pendiente y caducidad.',
 'registros_correo_envios':'Historial de envíos de códigos por solicitud de registro.',
 'correo_outbox':'Cola cifrada de correo de registro y control de leases/reintentos.',
 'recibos':'Recibos de suministro, importe, consumo, periodo y estado.',
 'pagos':'Registro histórico de pagos del prototipo; no certifica un cargo bancario.',
 'incidencias':'Reporte, ubicación/foto opcionales y estado actual.',
 'cortes_servicio':'Avisos por General/Zona; fecha/hora/estado legacy conservados.',
 'cortes_suministros':'Asociación N:M legacy de cortes y suministros.',
 'solicitudes_atencion':'Solicitudes y respuesta administrativa persistente.',
 'notificaciones':'Avisos internos; leida global es legacy, lecturas individuales en tabla aparte.',
 'notificaciones_lecturas':'Lectura por notificación y suministro; fila existente significa leída.',
 'usuario_2fa':'Estado MFA y versión de seguridad por usuario; secretos cifrados por aplicación.',
 'usuario_2fa_recuperacion':'Hashes de códigos MFA de recuperación y consumo.',
 'desafios_2fa':'Desafíos MFA temporales con versión y límite de intentos.',
 'operaciones_pago':'Operaciones demostrativas/verificación; no confundir con pagos acreditados.',
 'operaciones_pago_historial':'Auditoría inmutable de estados de operación.',
 'eventos_pago_proveedor':'Idempotencia de eventos del proveedor simulado.',
 'control_piloto_yape':'Control singleton exclusivo de laboratorio con ensayo sintético.',
 'incidencia_eventos':'Historial de eventos protegido por triggers; orden identity.',
 'incidencia_cambios':'Resultados de decisiones administrativas por solicitud idempotente.',
 'recuperacion_clave_limites':'Límites por identidad hash; activa_id es vínculo lógico sin FK.',
 'recuperaciones_clave':'Solicitudes temporales de recuperación de contraseña.',
 'recuperacion_clave_outbox':'Cola cifrada de códigos/avisos de recuperación.',
 'push_dispositivos':'Dispositivos, consentimiento, preferencias y token cifrado.',
 'push_entregas':'Cola de entregas push y revisiones de dispositivo.'
}

def compact(s):
    return re.sub(r'\s+', ' ', s).strip()

def clean(s):
    # Sustituir comentarios solo fuera de literales; conservar offsets y líneas.
    return re.sub(r"'(?:''|[^'])*'|--[^\n]*", lambda m: ' ' * len(m[0]) if m[0].startswith('--') else m[0], s)

def closing(s, start):
    depth, quote, i = 0, False, start
    while i < len(s):
        c = s[i]
        if c == "'":
            if quote and i+1 < len(s) and s[i+1] == "'":
                i += 2
                continue
            quote = not quote
        elif not quote:
            if c == '(': depth += 1
            if c == ')':
                depth -= 1
                if depth == 0: return i
        i += 1
    raise ValueError('Paréntesis sin cierre: '+s[start:])

def split_items(s):
    items, start, i = [], 0, 0
    while i < len(s):
        if s[i] == "'":
            i += 1
            while i < len(s):
                if s[i] == "'":
                    if i+1 < len(s) and s[i+1] == "'": i += 2; continue
                    break
                i += 1
        elif s[i] == '(':
            i = closing(s, i)
        elif s[i] == ',':
            items.append(s[start:i].strip()); start = i+1
        i += 1
    items.append(s[start:].strip())
    return [x for x in items if x]

def columns_in(expr):
    return [x.strip() for x in expr.split(',')]

def parse(sources):
    tables, indexes, functions, triggers = {}, {}, {}, {}
    def constraint(table, text, source, column=None):
        explicit = re.match(r'CONSTRAINT\s+(\w+)\s+', text, re.I)
        name = explicit[1] if explicit else None
        body = text[explicit.end():] if explicit else text
        for kind, pattern in [('PRIMARY KEY',r'PRIMARY\s+KEY'), ('UNIQUE',r'\bUNIQUE\b'), ('FOREIGN KEY',r'\bREFERENCES\b'), ('CHECK',r'\bCHECK\s*\(')]:
            match = re.search(pattern, body, re.I)
            if not match: continue
            if kind == 'CHECK':
                start = body.index('(', match.start()); end = closing(body, start)
                expression, cols = body[start+1:end], [column] if column else []
            elif kind == 'FOREIGN KEY':
                fk = re.search(r'FOREIGN\s+KEY\s*\(([^)]+)\)', body, re.I)
                cols = columns_in(fk[1]) if fk else [column]
                expression = body[match.start():]
            else:
                after = body[match.end():].lstrip()
                cols = columns_in(after[1:after.index(')')]) if after.startswith('(') else [column]
                expression = ', '.join(cols)
            # Nombres PG de checks inline: necesarios para aplicar DROP de 009.
            inferred = f'{table["name"]}_{column}_check' if kind == 'CHECK' and column else None
            key = name or inferred or f'implícita_{len(table["constraints"])+1}'
            row = dict(name=key, explicit=bool(name), kind=kind, columns=cols, expression=compact(expression), source=source)
            if kind == 'FOREIGN KEY':
                ref = re.search(r'REFERENCES\s+('+NAME+r')\s*\(([^)]+)\)', body, re.I)
                assert ref, body
                row.update(target=ref[1].split('.')[-1], target_columns=columns_in(ref[2]), on_delete='CASCADE' if re.search(r'ON DELETE\s+CASCADE', body, re.I) else 'NO ACTION', on_update='NO ACTION')
            table['constraints'][key] = row
    def column(table, definition, source):
        # La frontera tras ')' no es frontera de palabra: separar tipo explícitamente.
        m = re.match(r'(\w+)\s+([A-Z]+(?:\(\d+(?:\s*,\s*\d+)?\))?)(.*)', definition, re.I | re.S)
        assert m, definition
        name, datatype, rest = m.groups()
        datatype = datatype.upper().replace(' ', '')
        assert datatype.split('(')[0] in {'BIGSERIAL','BIGINT','VARCHAR','TIMESTAMP','TIMESTAMPTZ','BOOLEAN','UUID','CHAR','SMALLINT','BYTEA','DATE','NUMERIC','TEXT','INTEGER','JSONB'}, definition
        pk = bool(re.search(r'\bPRIMARY KEY\b',rest,re.I))
        identity = 'GENERATED ALWAYS AS IDENTITY' in rest.upper()
        default = re.search(r'\bDEFAULT\s+(.+?)(?=\s+(?:CHECK|UNIQUE|REFERENCES|NOT NULL|PRIMARY KEY)\b|$)',rest,re.I|re.S)
        seq = datatype == 'BIGSERIAL' or identity
        default_value = compact(default[1]) if default else (f"nextval('public.{table['name']}_{name}_seq'::regclass) [derivado SERIAL]" if datatype=='BIGSERIAL' else 'IDENTITY ALWAYS [generación, no DEFAULT explícito]' if identity else '')
        table['columns'][name] = dict(name=name, type='BIGINT' if datatype=='BIGSERIAL' else datatype, declaration=datatype, not_null=pk or seq or bool(re.search(r'\bNOT NULL\b',rest,re.I)), default=default_value, sequence=f'{table["name"]}_{name}_seq' if seq else '', identity=identity, definition=compact(definition), source=source)
        constraint(table, rest, source, name)
    for filename, raw in sources:
        sql = clean(raw)
        events = []
        patterns = {
            'table': r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?('+NAME+r')\s*\(',
            'alter': r'ALTER TABLE\s+('+NAME+r')\s+(ADD COLUMN(?: IF NOT EXISTS)?|ADD CONSTRAINT|DROP CONSTRAINT(?: IF EXISTS)?)\s+',
            'index': r'CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)\s+ON\s+('+NAME+r')\s*\(',
            'function': r'CREATE OR REPLACE FUNCTION\s+('+NAME+r')\s*\(',
            'trigger': r'CREATE OR REPLACE TRIGGER\s+(\w+)\s+'
        }
        for kind, pattern in patterns.items():
            events.extend((m.start(),kind,m) for m in re.finditer(pattern,sql,re.I))
        for offset, kind, m in sorted(events):
            source = filename+':'+str(raw[:offset].count('\n')+1)
            if kind=='table':
                name = m[1].split('.')[-1]
                if name in tables: continue
                table = tables[name] = dict(name=name, columns={}, constraints={}, source=source)
                start=m.end()-1; end=closing(sql,start)
                cursor = start+1
                for item in split_items(sql[start+1:end]):
                    item_offset = sql.index(item, cursor, end)
                    item_source = filename+':'+str(raw[:item_offset].count('\n')+1)
                    cursor = item_offset+len(item)
                    if re.match(r'(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b', item,re.I): constraint(table,item,item_source)
                    else: column(table,item,item_source)
            elif kind=='alter':
                name=m[1].split('.')[-1]; action=m[2].upper(); end=sql.index(';',m.end()); body=sql[m.end():end].strip()
                assert name in tables, (source,name)
                table=tables[name]
                if action.startswith('ADD COLUMN'):
                    if body.split()[0] not in table['columns']: column(table,body,source)
                elif action.startswith('DROP'): table['constraints'].pop(body.split()[0],None)
                else: constraint(table,'CONSTRAINT '+body,source)
            elif kind=='index':
                end=sql.index(';',m.end())
                indexes[m[2]]=dict(name=m[2],table=m[3].split('.')[-1],unique=bool(m[1]),definition=compact(sql[m.start():end]),source=source,origin='CREATE INDEX')
            elif kind=='function':
                end=sql.index('$$;',sql.index('$$',m.end())+2)+3
                functions[m[1].split('.')[-1]]=dict(name=m[1].split('.')[-1],definition=raw[m.start():end].strip(),source=source)
            else:
                end=sql.index(';',m.end()); body=compact(sql[m.start():end]); table=re.search(r'\bON\s+('+NAME+r')',body,re.I)
                function=re.search(r'EXECUTE FUNCTION\s+('+NAME+r')',body,re.I)
                assert table and function, source
                triggers[m[1]]=dict(name=m[1],table=table[1].split('.')[-1],function=function[1].split('.')[-1],definition=body,source=source)
    # No crear índices para FK: PostgreSQL no lo hace automáticamente.
    for table in tables.values():
        for c in table['constraints'].values():
            if c['kind'] not in ('PRIMARY KEY','UNIQUE'): continue
            name=c['name'] if c['explicit'] else table['name']+('_pkey' if c['kind']=='PRIMARY KEY' else '_'+ '_'.join(c['columns'])+'_key')
            indexes[name]=dict(name=name,table=table['name'],unique=True,definition='UNIQUE btree ('+', '.join(c['columns'])+')',source=c['source'],origin='derivado '+c['kind']+' (nombre esperado, no pg_catalog)')
    relations=[]
    sequences=[]
    for table in tables.values():
        for c in table['constraints'].values():
            if c['kind']!='FOREIGN KEY': continue
            target=tables[c['target']]
            assert all(k in table['columns'] for k in c['columns'])
            assert all(k in target['columns'] for k in c['target_columns'])
            unique=any(x['kind'] in ('PRIMARY KEY','UNIQUE') and set(x['columns'])==set(c['columns']) for x in table['constraints'].values())
            required=all(table['columns'][k]['not_null'] for k in c['columns'])
            relations.append(dict(table=table['name'],columns=', '.join(c['columns']),target=c['target'],target_columns=', '.join(c['target_columns']),parent_per_child='1' if required else '0..1',children_per_parent='0..1' if unique else '0..N',on_delete=c['on_delete'],on_update=c['on_update'],source=c['source']))
        for col in table['columns'].values():
            if col['sequence']: sequences.append(dict(name=col['sequence'],table=table['name'],column=col['name'],kind='IDENTITY ALWAYS' if col['identity'] else 'BIGSERIAL',parameters='BIGINT; inicio1; incremento1; mínimo1; máximo9223372036854775807; cache1; NO CYCLE; OWNED BY '+table['name']+'.'+col['name'],source=col['source']))
    return dict(tables=tables,indexes=indexes,relations=relations,sequences=sequences,functions=functions,triggers=triggers)


def model():
    files = [ROOT/'Base-de-Datos/init.sql',*sorted((ROOT/'Base-de-Datos/migrations').glob('*.sql'))]
    manifest={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    init=files[0].read_text(); assert init.count(MARKER)==1
    def migration(number):
        p=next(p for p in files[1:] if p.name.startswith(f'{number:03}_'))
        return str(p.relative_to(ROOT)),p.read_text()
    base=('Base-de-Datos/init.sql',init.split(MARKER)[0])
    profiles={
        'laboratorio-init':[('Base-de-Datos/init.sql',init)],
        'laboratorio-ampliado':[('Base-de-Datos/init.sql',init),migration(11),migration(12)],
        'produccion-minima':[base,migration(7),migration(8),migration(14)],
        'produccion-extendida':[base,migration(7),migration(8),migration(11),migration(12),migration(13),migration(14)]
    }
    return dict(schemaVersion=1,method='Extracción estática; no ejecutado en PostgreSQL. Nombres implícitos derivados pendientes de catálogo.',sources=manifest,profiles={name:parse(sources) for name,sources in profiles.items()})


def md_table(headers, rows):
    def cell(v): return str(v).replace('|','\\|').replace('\n','<br>')
    return '| '+' | '.join(headers)+' |\n|'+'|'.join('---' for _ in headers)+'|\n'+''.join('| '+' | '.join(cell(v) for v in row)+' |\n' for row in rows)+'\n'

def xlsx(sheets):
    # Inline strings: ningún valor del diccionario se interpreta como fórmula.
    parts={}
    ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    content=['<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>']
    workbook=[]; rels=[]
    def letter(n):
        result=''
        while n: n,k=divmod(n-1,26); result=chr(65+k)+result
        return result
    for i,(title,rows) in enumerate(sheets.items(),1):
        sheet=[]
        for j,row in enumerate(rows,1):
            cells=''.join(f'<c r="{letter(k)}{j}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>' for k,v in enumerate(row,1))
            sheet.append(f'<row r="{j}">{cells}</row>')
        parts[f'xl/worksheets/sheet{i}.xml']=f'<worksheet xmlns="{ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>'+''.join(sheet)+'</sheetData></worksheet>'
        workbook.append(f'<sheet name="{escape(title)}" sheetId="{i}" r:id="rId{i}"/>')
        rels.append(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>')
        content.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    parts['xl/workbook.xml']=f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(workbook)+'</sheets></workbook>'
    parts['xl/_rels/workbook.xml.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(rels)+'</Relationships>'
    parts['_rels/.rels']='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    parts['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+''.join(content)+'</Types>'
    import io
    buffer=io.BytesIO()
    with ZipFile(buffer,'w',ZIP_DEFLATED) as z:
        for name,value in sorted(parts.items()):
            ET.fromstring(value)
            info=ZipInfo(name,(2026,11,5,0,0,0)); info.compress_type=ZIP_DEFLATED
            z.writestr(info,'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+value)
    return buffer.getvalue()


def artifacts(data):
    sheets={
      'Tablas':[['Perfil','Tabla','Descripción','Columnas','Fuente']],
      'Columnas':[['Perfil','Tabla','Columna','Tipo PostgreSQL','Declaración','NOT NULL','Default','Definición SQL','Fuente']],
      'Relaciones':[['Perfil','Hija','Columnas','Padre','Referencias','Padres por hija','Hijas por padre','ON DELETE','ON UPDATE','Fuente']],
      'Restricciones':[['Perfil','Tabla','Nombre o ID documental','Nombre explícito','Tipo','Columnas','Expresión','Fuente']],
      'Indices':[['Perfil','Tabla','Índice','Único','Definición','Origen','Fuente']],
      'Secuencias':[['Perfil','Nombre esperado','Tabla','Columna','Generación','Parámetros derivados','Fuente']],
      'Funciones':[['Perfil','Función','Definición SQL','Fuente']],
      'Triggers':[['Perfil','Trigger','Tabla','Función','Definición SQL','Fuente']],
      'Fuentes':[['Archivo','SHA256']]+[[k,v] for k,v in data['sources'].items()]
    }
    doc=['# Diccionario de datos — DD-01\n\nMetadatos estáticos del repositorio; sin filas ni consulta a Neon. Regenerar con `python3 scripts/data-dictionary.py`; verificar con `--check`. [Perfiles y límites](perfiles-esquema.md), [DER](diagrama-entidad-relacion.md), [Excel](diccionario-de-datos.xlsx) y [modelo verificable](modelo-esquema.json).\n\nCada perfil es independiente. `BIGSERIAL` se muestra como BIGINT con secuencia derivada; PK/identity implican NOT NULL. Sin DEFAULT significa ausencia de default explícito. Las FK usan MATCH SIMPLE, NO ACTION al actualizar y son inmediatas/no diferibles salvo cláusula SQL contraria (ninguna aquí). CHECK admite NULL salvo NOT NULL; UNIQUE nullable admite varios NULL. Nombres sin declaración explícita y secuencias son inferencias estáticas, no resultados de pg_catalog. Identificadores implícita_N son IDs documentales, no nombres reales de constraints.\n']
    der=['# Diagrama entidad-relación — DD-01\n\nUna arista por FK física, incluidas varias hacia el mismo padre. Padre obligatorio según NOT NULL; máximo de hijos según PK/UNIQUE global, sin convertir índices parciales en unicidad global. Línea discontinua: relación física no identificadora; cardinalidades no implican existencia de hijos. Solo metadatos estáticos.\n']
    summary=[]
    for profile,m in data['profiles'].items():
        nt=len(m['tables']); nc=sum(len(t['columns']) for t in m['tables'].values()); nr=len(m['relations']); ni=len(m['indexes'])
        summary.append([profile,nt,nc,nr,ni,len(m['sequences']),len(m['functions']),len(m['triggers'])])
        doc.append(f'\n## {profile}\n\n{nt} tablas, {nc} columnas, {nr} FK y {ni} índices (incluidos PK/UNIQUE derivados).\n')
        der.append(f'\n## {profile}\n\n```mermaid\nerDiagram\n')
        for name,t in sorted(m['tables'].items()):
            assert name in DESCRIPTIONS,name
            sheets['Tablas'].append([profile,name,DESCRIPTIONS[name],len(t['columns']),t['source']])
            doc.append(f'\n### {name}\n\n{DESCRIPTIONS[name]} Fuente: `{t["source"]}`.\n\n')
            rows=[]
            der.append(f'    {name} {{\n')
            for col in t['columns'].values():
                keys=[]
                for c in t['constraints'].values():
                    if col['name'] in c['columns'] and c['kind'] in ('PRIMARY KEY','FOREIGN KEY','UNIQUE'): keys.append({'PRIMARY KEY':'PK','FOREIGN KEY':'FK','UNIQUE':'UK'}[c['kind']])
                rows.append([col['name'],col['type'], 'sí' if col['not_null'] else 'no',col['default'] or '—',', '.join(keys),col['source']])
                sheets['Columnas'].append([profile,name,col['name'],col['type'],col['declaration'],col['not_null'],col['default'],col['definition'],col['source']])
                diagram_type = col['type'].split('(')[0] if ',' in col['type'] else col['type']
                diagram_note = ' \"'+col['type']+'\"' if ',' in col['type'] else ''
                der.append('        '+diagram_type+' '+col['name']+(' '+', '.join(dict.fromkeys(keys)) if keys else '')+diagram_note+'\n')
            der.append('    }\n')
            doc.append(md_table(['Columna','Tipo PostgreSQL','NOT NULL','Default / generación','Claves','Fuente'],rows))
            constraints=[]
            for c in t['constraints'].values():
                constraints.append([c['name'],c['kind'],c['expression'],c['source']])
                sheets['Restricciones'].append([profile,name,c['name'],c['explicit'],c['kind'],', '.join(c['columns']),c['expression'],c['source']])
            for col in t['columns'].values():
                if col['not_null']: sheets['Restricciones'].append([profile,name,'(sin nombre explícito)',False,'NOT NULL',col['name'],'NOT NULL explícito o implícito por PK/serial/identity',col['source']])
            doc.append(md_table(['Restricción / ID documental','Tipo','Expresión SQL','Fuente'],constraints))
        for r in m['relations']:
            sheets['Relaciones'].append([profile,r['table'],r['columns'],r['target'],r['target_columns'],r['parent_per_child'],r['children_per_parent'],r['on_delete'],r['on_update'],r['source']])
            left='||' if r['parent_per_child']=='1' else '|o'
            right='o|' if r['children_per_parent']=='0..1' else 'o{'
            der.append(f'    {r["target"]} {left}..{right} {r["table"]} : "{r["columns"]}"\n')
        der.append('```\n')
        doc.append('\n### Relaciones y cardinalidades\n\n'+md_table(['Hija.columnas','Padre.columnas','Padres/hija','Hijas/padre','DELETE / UPDATE'],[[r['table']+'.'+r['columns'],r['target']+'.'+r['target_columns'],r['parent_per_child'],r['children_per_parent'],r['on_delete']+' / '+r['on_update']] for r in m['relations']]))
        doc.append('\n### Índices\n\n'+md_table(['Nombre','Tabla','Único','Definición','Origen','Fuente'],[[i['name'],i['table'],i['unique'],i['definition'],i['origin'],i['source']] for i in m['indexes'].values()]))
        for i in m['indexes'].values(): sheets['Indices'].append([profile,i['table'],i['name'],i['unique'],i['definition'],i['origin'],i['source']])
        doc.append('\n### Secuencias (nombres y parámetros derivados)\n\n'+md_table(['Nombre esperado','Propietario','Generación','Parámetros','Fuente'],[[s['name'],s['table']+'.'+s['column'],s['kind'],s['parameters'],s['source']] for s in m['sequences']]))
        for s in m['sequences']: sheets['Secuencias'].append([profile,s['name'],s['table'],s['column'],s['kind'],s['parameters'],s['source']])
        doc.append('\n### Funciones y triggers\n\n')
        for f in m['functions'].values():
            sheets['Funciones'].append([profile,f['name'],f['definition'],f['source']])
            doc.append(f'\n#### {f["name"]}\n\nFuente `{f["source"]}`; cuerpo SQL íntegro para verificar condiciones, revocaciones y efectos.\n\n```sql\n{f["definition"]}\n```\n')
        doc.append(md_table(['Trigger','Tabla','Función','Definición','Fuente'],[[t['name'],t['table'],t['function'],t['definition'],t['source']] for t in m['triggers'].values()]))
        for t in m['triggers'].values(): sheets['Triggers'].append([profile,t['name'],t['table'],t['function'],t['definition'],t['source']])
    profiles='# Perfiles del esquema — DD-01\n\nNo describe el catálogo desplegado de Neon. No ejecutar init en una base existente. Todas las cantidades provienen de extracción estática, no de un servidor SQL.\n\n'+md_table(['Perfil','Tablas','Columnas','FK','Índices totales','Secuencias','Funciones','Triggers'],summary)
    profiles+='''
- **laboratorio-init**: init.sql completo. Incluye correo003/004/006, integridad005, 2FA007, operaciones008, piloto009/010 y seguimiento013. No incluye011/012/014.
- **laboratorio-ampliado**: init +011 +012. 013 ya está en init. Incluye piloto, recuperación y push. No aplicar014.
- **produccion-minima**: prefijo de init anterior al marcador de007 +007 +008 +014, igual al fixture DB-01. Conserva seis columnas de compatibilidad piloto, todas deben ser NULL, sin tabla/FK piloto.
- **produccion-extendida**: ese prefijo +007 +008 +011 +012 +013 +014. Es una composición sintética del contrato de pruebas, no prueba de autorización ni aplicación productiva de011/012.

001 añade lecturas y migra solo lecturas Usuario legacy; 002 agrega CHECK de nueve dígitos; 003 añade verificación/registro; 004 índice de retención; 005 valida relaciones/datos y agrega UNIQUE de recibos/pagos mediante DDL dinámico; 006 outbox; 007 MFA/revocación por rol/activo; 008 operaciones/auditoría y transiciones; 009 piloto aislado y ampliación entorno; 010 revisión sintética; 011 recuperación/revocación por credenciales; 012 push y notificaciones de cortes; 013 seguimiento e idempotencia de incidencias; 014 compatibilidad sin piloto. Las definiciones001–006 ya están en el prefijo usado, no forman una instalación desde cero independiente.

**Diferencias importantes**: 009 agrega FK operaciones_pago.piloto_id → control_piloto_yape.piloto_id y CHECK de nombre de base temporal; 010 reemplaza chk_piloto_local. 014 rechaza tabla piloto, no agrega FK y exige entorno simulado/metadatos NULL. Los índices parciales de operaciones activas y referencias verificadas no convierten esas relaciones en1:1 global. SQL admite varios suministros por usuario; pagos es0..1 por recibo; usuario_2fa es0..1 por usuario; correo_outbox es0..1 por envío. cortes_suministros es N:M legacy; la selección General/Zona es lógica de aplicación, no FK. activa_id de límites de recuperación y solicitud_id de eventos no son FK. El singleton del piloto permite a lo sumo una fila TRUE, no obliga a que exista.

**Backend**: receipt-transactions.js requiere pagos/operaciones y detecta piloto con to_regclass; email-cleanup.js verifica esquema de retención y FK outbox. Módulos email, two-factor, password-recovery, push, incident-tracking y payment-operations usan sus estructuras directamente; no se crean tablas en el arranque para ocultar ausencias. Las columnas fecha/hora/estado de cortes y notificaciones.leida son legacy. DATE no equivale a timestamp; TIMESTAMP antiguo no tiene zona; TIMESTAMPTZ guarda instantes. UUID sin default se proporciona desde aplicación.

**Rutinas y permisos**: se conservan cuerpos completos en el diccionario; 013 usa SECURITY DEFINER con search_path fijo y REVOKE sobre función registrar_evento_incidencia/tablas de historial. Son permisos declarados, no inventario de roles/ACL de producción. Las guardas DO, lock_timeout y statement_timeout son controles de migración, no triggers persistentes. No se ejecuta DDL dinámico en el extractor; las dos unicidades de005 están corroboradas explícitamente en init. No hay vistas ni CREATE SEQUENCE explícitos: se documentan secuencias implícitas serial/identity.

**Validación pendiente**: aplicar cada perfil solo en una base PG18 nueva aislada, comparar pg_attribute/pg_constraint/pg_index/pg_sequence/pg_trigger/pg_proc (definiciones, índices parciales, nulabilidad, defaults, permisos y nombres implícitos). PG18/Docker no disponibles en esta sesión; no se afirma comparación con pg_catalog ni apertura en Excel de escritorio. XLSX validado estructuralmente por ZIP/XML y conteos.

## Fuentes y reproducibilidad

El modelo JSON incluye hashes SHA256 de init y las14 migraciones. Ejecutar `python3 scripts/data-dictionary.py --check` y `python3 scripts/test-data-dictionary.py`. El extractor solo admite la sintaxis del DDL actual; no es un motor SQL general. Cambios de sintaxis requieren ampliar y revisar extractor y pruebas. No incluir fixtures, filas, claves, correos ni parámetros privados.

'''+md_table(['Fuente versionada','SHA256'],list(data['sources'].items()))
    return {'modelo-esquema.json':(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode(), 'diccionario-de-datos.md':(''.join(doc).rstrip()+'\n').encode(), 'diagrama-entidad-relacion.md':''.join(der).encode(), 'perfiles-esquema.md':(profiles.rstrip()+'\n').encode(), 'diccionario-de-datos.xlsx':xlsx(sheets)}

if __name__=='__main__':
    args=argparse.ArgumentParser(); args.add_argument('--check',action='store_true'); config=args.parse_args()
    data=model(); generated=artifacts(data)
    if config.check:
        for name,content in generated.items():
            assert (OUT/name).read_bytes()==content, 'Artefacto desactualizado: '+name
        print('DD-01: cinco artefactos reproducibles y vigentes.')
    else:
        OUT.mkdir(parents=True,exist_ok=True)
        for name,content in generated.items(): (OUT/name).write_bytes(content)
    for name,m in data['profiles'].items():
        print(name, len(m['tables']),'tablas',sum(len(t['columns']) for t in m['tables'].values()),'columnas',len(m['relations']),'FK',len(m['indexes']),'índices')
