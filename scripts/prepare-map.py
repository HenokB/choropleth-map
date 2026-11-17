"""Reduce Natural Earth v5.1.2 50m GeoJSON to the fields Atlas uses.
Usage: python3 scripts/prepare-map.py /path/to/ne_50m_admin_0_countries.geojson
Source: https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson
"""
import json
import pathlib
import sys

source = json.loads(pathlib.Path(sys.argv[1]).read_text())
def rounded(value):
    return [rounded(x) for x in value] if isinstance(value, list) else round(value, 3)

features = []
for feature in source['features']:
    p = feature['properties']
    code = p['ISO_A3_EH'] if str(p['ISO_A3_EH']) != '-99' else p['ADM0_A3']
    # Australia has separately drawn territories sharing AUS in Natural Earth.
    if p['ADM0_A3'] in ['ATC', 'IOA']: code = p['ADM0_A3']
    aliases = {str(p[k]) for k in ['NAME', 'NAME_LONG', 'NAME_EN', 'ADMIN', 'FORMAL_EN', 'ISO_A2_EH', 'ADM0_A3'] if p.get(k) and str(p[k]) != '-99'}
    if code in ['ATC', 'IOA']: aliases.discard(p['ISO_A2_EH'])
    features.append({'type': 'Feature', 'id': code, 'properties': {
        'name': p['NAME_EN'], 'continent': {
            'IOT': 'Asia', 'MDV': 'Asia', 'MUS': 'Africa', 'SHN': 'Africa', 'SYC': 'Africa',
            'ATF': 'Antarctica', 'HMD': 'Antarctica', 'SGS': 'South America',
        }.get(code, p['CONTINENT']), 'aliases': sorted(aliases),
        'label': [p['LABEL_X'], p['LABEL_Y']]}, 'geometry': {
        'type': feature['geometry']['type'], 'coordinates': rounded(feature['geometry']['coordinates'])}})
features.sort(key=lambda f: f['properties']['name'])
pathlib.Path('assets/data/world.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':'), ensure_ascii=False))
print(f'Prepared {len(features)} country and territory features.')
