"""Parse The National Parks: Index 2012-2016 (the NPS "Red Book") into structured designation histories.

Usage: python3 parse-nps-index.py npindex2012-2016.pdf out.json
Needs pdftotext (poppler). Every event keeps the Index sentence it came from and its page number,
so each entry can be checked against the printed source.
"""
import json, re, subprocess, sys
from collections import Counter

pdf, out = sys.argv[1], sys.argv[2]
text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
pages = text.split('\f')

MON = r'(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Sept|Aug|Oct|Nov|Dec)\.?'
DATE = re.compile(MON + r'\s+(\d{1,2}),\s+(\d{4})')
MONTHS = {'January': 1, 'February': 2, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12, 'Jan': 1, 'Feb': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 'July': 7, 'Aug': 8, 'Sept': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12}
VERBS = r'(Proclaimed|Authorized|Established|Redesignated|Renamed|Transferred|Designated|Set aside|Reserved|Created|Acquired|Declared|Incorporated|Accepted|Dedicated|Original|Withdrawn|Made|Added|Reestablished|Re-established)'
HIST_START = re.compile(r'(?<![A-Za-z-])' + VERBS + r'\b')

def col_split(page):
    starts = Counter()
    for ln in page.split('\n'):
        m = re.match(r'^(\S.*?\S)(\s{2,})(\S)', ln)
        if m: starts[m.end(2)] += 1
    return starts.most_common(1)[0][0] if starts else 30

entries, cur = [], None
for pno, page in enumerate(pages, start=1):
    col = col_split(page)
    prev_left = ''
    for ln in page.split('\n'):
        left, right = ln[:col].strip(), ln[col:].strip()
        if len(ln) > col and ln[col - 1] not in ' ' and left:  # a word crosses the split: treat whole line as left
            pass
        new_name = left and cur is not None and any('www.nps.gov/' in l for l in cur['left']) and 'Acreage' in ' '.join(cur['right']) and not left.startswith('(')
        if (left and not prev_left) or new_name:
            cur = {'left': [], 'right': [], 'page': pno}
            entries.append(cur)
        if cur is not None:
            if left: cur['left'].append(left)
            if right: cur['right'].append(right)
        prev_left = left

def clean(lines):
    s = ' '.join(lines)
    s = s.replace('­ ', '').replace('­', '-').replace('­ ', '')
    return re.sub(r'\s+', ' ', s)

def iso(m):
    return f"{int(m.group(3)):04d}-{MONTHS[m.group(1).rstrip('.')]:02d}-{int(m.group(2)):02d}"

results = {}
for e in entries:
    url = next((l for l in e['left'] if 'www.nps.gov/' in l), None)
    if not url: continue
    code = re.search(r'www\.nps\.gov/(\w+)', url).group(1).lower()
    name = []
    for l in e['left']:
        if re.match(r'^(PO Box|P\.O\.|\d)', l) or re.search(r'\d{3}.\d{3}.\d{4}', l) or 'www.' in l: break
        name.append(l)
    body = clean(e['right'])
    acre = body.find('Acreage')
    pre = body[:acre] if acre >= 0 else body
    # History starts at the earlier of: the first capitalized action verb, or the sentence holding the first full date
    # (e.g. Yosemite: "Yosemite Valley ... granted to State of California June 30, 1864; ...").
    starts = []
    m = HIST_START.search(pre)
    if m: starts.append(m.start())
    dm0 = DATE.search(pre)
    if dm0: starts.append(max(pre.rfind('.', 0, dm0.start()), -1) + 1)
    if not starts: continue
    hist = pre[min(starts):].strip()
    events = []
    for sent in re.split(r'(?<!U\.S\.)(?<!Dept\.)(?<! St\.)(?<! Mt\.)(?<! Ft\.)(?<! Jr\.)(?<! Sr\.)(?<=\.)\s+(?=[A-Z])', hist):
        if re.match(r'^(Boundary change|Wilderness|Designated a (World|Biosphere)|Acreage)', sent): continue
        for clause in re.split(r';\s*', sent):
            clause = clause.strip().rstrip('.')
            dm = list(DATE.finditer(clause))
            if not dm: continue
            if re.search(r'wilderness designated|world heritage|biosphere|boundary change', clause, re.I): continue
            # One event per date; the verb is the last action word before that date in the clause,
            # else the clause's opening verb, else the previous event's verb.
            for d in dm:
                before = clause[:d.start()]
                vms = list(re.finditer(r'\b(proclaimed|authorized|established|redesignated|renamed|transferred|designated|set aside|reserved|created|acquired|declared|incorporated|accepted|dedicated|withdrawn|combined|added|reestablished|abolished|changed|granted)\b', before, re.I))
                verb = vms[-1].group(1).lower() if vms else (events[-1]['verb'] if events else 'unknown')
                if verb == 'unknown': continue  # a date with no designation action (e.g. an event in the unit's story)
                events.append({'verb': verb, 'date': iso(d), 'clause': clause})
    if events:
        rec = {'code': code, 'indexName': ' '.join(name), 'page': e['page'], 'history': hist, 'events': events}
        # Related units (wild and scenic rivers, parkways) are listed under their parent park's web address.
        # Keep every entry; the converter picks the one whose name matches the site.
        results.setdefault(code, {'code': code, 'entries': []})['entries'].append(rec)

json.dump(results, open(out, 'w'), indent=1)
print(f'{len(results)} units parsed', file=sys.stderr)
