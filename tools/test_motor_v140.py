#!/usr/bin/env python3
from importlib.util import spec_from_file_location,module_from_spec
from pathlib import Path
import datetime as dt
P=Path(__file__).with_name('actualizar_bdns.py');s=spec_from_file_location('bdns',P);m=module_from_spec(s);s.loader.exec_module(m)
TODAY=dt.date(2026,8,26)
def detail(benef,region='ES - ESPAÑA',start='2026-08-01',end='2026-09-30',text=''):
 return {'codigoBDNS':'999001','descripcion':'Ayudas municipales','tiposBeneficiarios':[{'descripcion':benef}],'regiones':[{'descripcion':region}],'fechaInicioSolicitud':start,'fechaFinSolicitud':end,'descripcionFinalidad':'Transformación digital de pequeños municipios','urlBasesReguladoras':'https://example.test/bases','anuncios':[{'titulo':'Extracto','texto':text}]}
a=m.normalize_item({},detail('PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA',text='Podrán ser beneficiarios los ayuntamientos y municipios de menos de 5.000 habitantes.'),today=TODAY)
assert 'municipality' in a['beneficiary_targets'] and a['population_rules'][0]['max']==5000 and a['population_rules'][0]['basis']=='municipality' and a['status']=='pending_review' and a['application_status']=='open_detected' and a['extraction_confidence']=='high'
b=m.normalize_item({},detail('GRAN EMPRESA',text='Beneficiarios: grandes empresas.'),today=TODAY);assert 'company' in b['beneficiary_targets'] and 'municipality' not in b['beneficiary_targets']
c=m.normalize_item({},detail('PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA',text='Podrán solicitar las EATIM y entidades locales menores.'),today=TODAY);assert 'eatim' in c['beneficiary_targets']; e=m.normalize_item({},detail('PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA',text='Podrán solicitar las EATIM de hasta 1.000 habitantes.'),today=TODAY); assert e['population_rules'][0]['basis']=='eatim'
d=m.normalize_item({},detail('PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA',end='2026-08-01',text='Ayuntamientos.'),today=TODAY);assert d['application_status']=='closed_detected'
print('OK test_motor_v140: extracción estructurada, municipio, EATIM, privado y plazo.')
