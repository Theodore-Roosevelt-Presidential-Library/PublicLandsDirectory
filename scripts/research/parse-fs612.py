"""Parse the Forest Service chronologic record (FS-612, 'Establishment and Modification of National
Forest Boundaries', 1891-1985 edition, OCR text from archive.org CAT92970816) into rows.
Usage: python3 parse-fs612.py all.txt out.json"""
import re, json, sys
MON = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC'
DATE = rf'(?:{MON})\.?\s+[\dIl]{{1,2}}\s*[.,]\s*\d{{4}}'
TYPE = r'(?:Proclamation|Proc\.|E\.\s?O\.|Executive Order|Act|Public Law|P\.\s?L\.(?:\s?O\.)?|Sec\.?\s?(?:of\s)?Agr\.?\s?Order|Sec\.?\s?Int\.?\s?Order|Admin\.?\s?Order|Secretary[^0-9]*?Order|Joint Resolution)(?:\s+(?:No\.\s?)?[\dIl,-]+)?'
ROW = re.compile(rf'^(?P<name>\S.*?)\s{{2,}}(?P<st>[A-Z]{{2}}(?:\s+[A-Z]{{2}})*)\s{{2,}}(?P<type>{TYPE})\s+\.?\s*(?P<date>{DATE})(?:\s+(?P<eff>{DATE}))?\s*(?P<rest>.*)$')
CIT = re.compile(r'^(?P<cit>(?:\d+\s+Stat\.\s*\d+(?:,\s*\d+)?|\d+\s+F\.\s?R\.\s*[\d,]+|\d+\s+U\.S\.C\.\s*\d+)(?:\s*[;,]\s*(?:\d+\s+Stat\.\s*\d+|\d+\s+F\.\s?R\.\s*[\d,]+))*)\s*(?P<effect>.*)$')
def nd(s):
    s = re.sub(r'(?<=\s)[Il](?=[.,\s])', '1', s).replace('.', ',')
    m = re.match(rf'({MON}),?\s+(\d{{1,2}})\s*,\s*(\d{{4}})', s)
    if not m: return None
    mm = MON.split('|').index(m.group(1)) + 1
    return f'{m.group(3)}-{mm:02d}-{int(m.group(2)):02d}'
rows, cur, page = [], None, 1
for raw in open(sys.argv[1], encoding='utf-8', errors='ignore'):
    page += raw.count('\f')
    line = raw.rstrip('\n').replace('\f', '')
    clean = re.sub(r'^[^A-Za-z]{0,3}', '', line)  # OCR junk at the start of a line
    m = ROW.match(clean)
    if m:
        rest = m.group('rest').strip(); c = CIT.match(rest)
        cur = {'name': re.sub(r'\s+', ' ', m.group('name')).strip(" .,'’^"), 'states': m.group('st').split(), 'type': re.sub(r'\s+', ' ', m.group('type')),
               'date': nd(m.group('date')), 'effective': nd(m.group('eff')) if m.group('eff') else None,
               'citation': c.group('cit') if c else None, 'effect': (c.group('effect') if c else rest).strip(), 'pdfPage': page}
        rows.append(cur); continue
    if not cur or not line.strip() or re.search(r'CHRONOLOGIC RECORD|FOREST RESERVE\s+STATE|Date effective is same|ESTABLISHMENT AND MODIFICATION|^\s*\d{4}\s*$|Page \d+', line):
        if re.search(r'Page \d+|FOREST RESERVE\s+STATE', line): cur = None
        continue
    left, right = line[:24].strip(), line[60:].strip()
    if left and not re.match(r'^[A-Z]{2}$', left) and len(left) > 2 and not right: cur['name'] += ' ' + left.strip(" .,'’")
    if right and len(right) > 2: cur['effect'] = (cur['effect'] + ' ' + re.sub(r'\s{2,}.*$', '', right)).strip()
    st = re.findall(r'^\s{20,30}([A-Z]{2})\s*$', line)
    if st: cur['states'] += st
json.dump(rows, open(sys.argv[2], 'w'), indent=1)
print(len(rows), 'rows;', sum(1 for r in rows if re.search('stablish', r['effect'])), 'establishing;', sum(1 for r in rows if not r['date']), 'without date')
