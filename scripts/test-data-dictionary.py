#!/usr/bin/env python3
"""Verificaciones estáticas DD-01; sin DB, red ni dependencias externas."""
import importlib.util
import io
import json
import re
import unittest
from xml.etree import ElementTree as ET
from zipfile import ZipFile
from pathlib import Path

spec=importlib.util.spec_from_file_location('dictionary',Path(__file__).with_name('data-dictionary.py'))
dd=importlib.util.module_from_spec(spec); spec.loader.exec_module(dd)

class DictionaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=dd.model(); cls.output=dd.artifacts(cls.data)

    def test_scanner_nested_literals_and_comments(self):
        source="a NUMERIC(10,2), b TEXT CHECK(b IN ('a,b','it''s (ok)')), c TEXT DEFAULT '--x' -- comment"
        parts=dd.split_items(dd.clean(source))
        self.assertEqual(len(parts),3)
        self.assertIn("'--x'",parts[2])
        self.assertNotIn('comment',parts[2])

    def test_fixture_metadata_independent(self):
        sql="""CREATE TABLE parent (id BIGSERIAL PRIMARY KEY);
        CREATE TABLE child (id BIGINT PRIMARY KEY REFERENCES parent(id), amount NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK(amount > 0), tag TEXT UNIQUE, version BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE);
        CREATE INDEX idx_child_amount ON child(amount) WHERE amount > 1;"""
        m=dd.parse([('fixture.sql',sql)])
        c=m['tables']['child']['columns']
        self.assertEqual(c['amount']['type'],'NUMERIC(10,2)')
        self.assertEqual(c['amount']['default'],'1')
        self.assertTrue(c['version']['not_null'])
        self.assertEqual(m['relations'][0]['children_per_parent'],'0..1')
        self.assertEqual(len(m['sequences']),2)
        self.assertEqual(len(m['indexes']),5)
        self.assertIn('WHERE amount > 1',m['indexes']['idx_child_amount']['definition'])

    def test_real_totals_reviewed_against_ddl(self):
        expected={'laboratorio-init':(22,186,29,50),'laboratorio-ampliado':(27,254,38,64),'produccion-minima':(19,159,21,42),'produccion-extendida':(26,243,34,62)}
        for name,m in self.data['profiles'].items():
            self.assertEqual((len(m['tables']),sum(len(t['columns']) for t in m['tables'].values()),len(m['relations']),len(m['indexes'])),expected[name])
        self.assertEqual(len(self.data['sources']),15)
        # Listas de CREATE TABLE/ADD COLUMN independientes del clasificador.
        sql=dd.clean((dd.ROOT/'Base-de-Datos/init.sql').read_text())
        declared=set(re.findall(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)',sql,re.I))
        self.assertEqual(declared,set(self.data['profiles']['laboratorio-init']['tables']))
        for table,t in self.data['profiles']['laboratorio-init']['tables'].items():
            self.assertIn(table,dd.DESCRIPTIONS)
            for c in t['columns'].values(): self.assertTrue(c['definition'].startswith(c['name']+' '))

    def test_profile_differences_and_overrides(self):
        lab=self.data['profiles']['laboratorio-ampliado']; prod=self.data['profiles']['produccion-extendida']
        self.assertIn('control_piloto_yape',lab['tables']); self.assertNotIn('control_piloto_yape',prod['tables'])
        self.assertTrue(any(r['columns']=='piloto_id' for r in lab['relations']))
        self.assertFalse(any(r['columns']=='piloto_id' for r in prod['relations']))
        self.assertIn('chk_operacion_produccion_sin_piloto',prod['tables']['operaciones_pago']['constraints'])
        checks=lab['tables']['operaciones_pago']['constraints']
        self.assertIn('piloto_ensayo IS TRUE',checks['chk_piloto_local']['expression'])
        self.assertIn("'piloto_manual'",checks['operaciones_pago_entorno_check']['expression'])
        self.assertNotIn('push_dispositivos',self.data['profiles']['laboratorio-init']['tables'])
        self.assertNotIn('cambio_seguridad_en',self.data['profiles']['laboratorio-init']['tables']['usuario_2fa']['columns'])
        self.assertIn('cambio_seguridad_en',lab['tables']['usuario_2fa']['columns'])

    def test_reconstructed_lab_uses_all_migrations_except_exclusive_014(self):
        init=(dd.ROOT/'Base-de-Datos/init.sql').read_text()
        sources=[('Base-de-Datos/init.sql',init.split(dd.MARKER)[0])]
        sources += [(str(p.relative_to(dd.ROOT)),p.read_text()) for p in sorted((dd.ROOT/'Base-de-Datos/migrations').glob('*.sql')) if not p.name.startswith('014')]
        rebuilt=dd.parse(sources); lab=self.data['profiles']['laboratorio-ampliado']
        self.assertEqual(set(rebuilt['tables']),set(lab['tables']))
        for table in rebuilt['tables']:
            self.assertEqual(set(rebuilt['tables'][table]['columns']),set(lab['tables'][table]['columns']))
        self.assertEqual(set(rebuilt['indexes']),set(lab['indexes']))
        self.assertEqual(set(rebuilt['functions']),set(lab['functions']))
        self.assertEqual(set(rebuilt['triggers']),set(lab['triggers']))

    def test_fk_cardinality_and_integrity(self):
        for m in self.data['profiles'].values():
            for r in m['relations']:
                self.assertIn(r['target'],m['tables'])
                for c in r['target_columns'].split(', '): self.assertIn(c,m['tables'][r['target']]['columns'])
            bychild={r['table']:r for r in m['relations']}
            self.assertEqual(bychild['pagos']['children_per_parent'],'0..1')
            self.assertEqual(bychild['usuario_2fa']['children_per_parent'],'0..1')
            self.assertEqual(bychild['suministros']['children_per_parent'],'0..N')
            self.assertEqual(bychild['notificaciones']['parent_per_child'],'0..1')
            self.assertFalse(any(r['columns']=='activa_id' for r in m['relations']))
            self.assertFalse(any(r['table']=='incidencia_eventos' and r['columns']=='solicitud_id' for r in m['relations']))
            for t in m['triggers'].values(): self.assertIn(t['function'],m['functions'])

    def test_sequences_and_critical_constraints(self):
        lab=self.data['profiles']['laboratorio-ampliado']
        identity=next(s for s in lab['sequences'] if s['table']=='incidencia_eventos')
        self.assertEqual(identity['kind'],'IDENTITY ALWAYS')
        self.assertEqual(identity['column'],'orden')
        outbox=lab['tables']['correo_outbox']['constraints'].values()
        self.assertTrue(any('octet_length(payload)' in c['expression'] for c in outbox))
        self.assertIn('SECURITY DEFINER',lab['functions']['registrar_evento_incidencia']['definition'])

    def test_xlsx_package_and_counts(self):
        ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        with ZipFile(io.BytesIO(self.output['diccionario-de-datos.xlsx'])) as z:
            self.assertIsNone(z.testzip())
            for name in z.namelist(): ET.fromstring(z.read(name))
            wb=ET.fromstring(z.read('xl/workbook.xml'))
            names=[s.attrib['name'] for s in wb.find('m:sheets',ns)]
            self.assertEqual(names,['Tablas','Columnas','Relaciones','Restricciones','Indices','Secuencias','Funciones','Triggers','Fuentes'])
            counts=[sum(len(m['tables']) for m in self.data['profiles'].values()),sum(len(t['columns']) for m in self.data['profiles'].values() for t in m['tables'].values()),sum(len(m['relations']) for m in self.data['profiles'].values())]
            counts += [sum(len(t['constraints'])+sum(c['not_null'] for c in t['columns'].values()) for m in self.data['profiles'].values() for t in m['tables'].values()),sum(len(m['indexes']) for m in self.data['profiles'].values()),sum(len(m['sequences']) for m in self.data['profiles'].values()),sum(len(m['functions']) for m in self.data['profiles'].values()),sum(len(m['triggers']) for m in self.data['profiles'].values()),len(self.data['sources'])]
            for i,count in enumerate(counts,1):
                root=ET.fromstring(z.read(f'xl/worksheets/sheet{i}.xml'))
                self.assertEqual(len(root.findall('m:sheetData/m:row',ns)),count+1)
                self.assertFalse(root.findall('.//m:f',ns))
                for text in root.findall('.//m:t',ns): self.assertLessEqual(len(text.text or ''),32767)

    def test_reproducibility_and_der_edges(self):
        self.assertEqual(self.output,dd.artifacts(dd.model()))
        der=self.output['diagrama-entidad-relacion.md'].decode()
        self.assertEqual(der.count('```mermaid'),4)
        self.assertEqual(der.count(' : "'),sum(len(m['relations']) for m in self.data['profiles'].values()))
        for name,content in self.output.items(): self.assertEqual((dd.OUT/name).read_bytes(),content)

if __name__=='__main__': unittest.main(verbosity=2)
