// Fish and Wildlife Service, Forest Service and BLM units with boundaries, from each agency's authoritative ArcGIS services.
// Usage: node scripts/sync-lands.mjs [fws|usfs|blm ...]   (default: all)
import { join } from 'node:path';
import { DATA, writeJSON, arcgisQuery, dissolve, bboxOf, labelPoint, categorize, titleCase, nowISO } from './lib.mjs';

const OFFSET = process.env.BOUNDARY_OFFSET || '0.002'; // ~200 m simplification, keeps files web-sized
const geoParams = (outFields) => ({ returnGeometry: 'true', outFields, outSR: '4326', maxAllowableOffset: OFFSET, geometryPrecision: '4' });

function group(features, keyFn) {
  const m = new Map();
  for (const f of features) { const k = keyFn(f.properties); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(f); }
  return m;
}

function baseRecord({ id, agency, unitCode, name, designation, category, acres, source, sourceUrl, feats, extra = {} }) {
  const geom = dissolve(feats);
  return {
    id, agency, agencyUnitCode: unitCode, name, designation, category: category || categorize(designation, name),
    states: [], location: geom ? labelPoint(geom) : null,
    acres: acres ? { value: Math.round(acres), kind: 'gis', source } : null,
    boundary: geom ? { geometry: geom, bbox: bboxOf(geom), source, sourceUrl } : null,
    sources: [{ name: source, url: sourceUrl }],
    synced: nowISO(),
    ...extra,
  };
}

// ---------- U.S. Fish and Wildlife Service: refuges and wetland management districts ----------
async function fws() {
  const L = 'https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/FWSApproved_Authoritative/FeatureServer/0';
  const feats = await arcgisQuery(L, { where: "RSL_TYPE IN ('NWR','WMD')", ...geoParams('ORGNAME,ORGCODE,LIT,RSL_TYPE,GISACRES,DOCACRES,FWSREGION,LABELNAME') }, { geojson: true, pageSize: 50 });
  const groups = group(feats, (p) => p.ORGCODE);
  const out = [];
  for (const [code, fs] of groups) {
    const p = fs[0].properties;
    const name = titleCase(p.ORGNAME).replace(/\bNWR\b/, 'National Wildlife Refuge');
    const isWMD = p.RSL_TYPE === 'WMD';
    const acres = fs.reduce((s, f) => s + (f.properties.GISACRES || 0), 0);
    const slugBase = name.toLowerCase().replace(/ national wildlife refuge$| wetland management district$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    out.push(baseRecord({
      id: `fws-${code}`, agency: 'FWS', unitCode: p.LIT, name,
      designation: isWMD ? 'Wetland Management District' : 'National Wildlife Refuge',
      category: isWMD ? 'wetland-management-district' : 'national-wildlife-refuge',
      acres, source: 'USFWS approved acquisition boundaries', sourceUrl: L, feats: fs,
      extra: {
        acres: { value: Math.round(acres), kind: 'approved-boundary-gis', source: 'USFWS approved acquisition boundaries', note: 'Area inside the approved acquisition boundary; land actually owned or managed by FWS can be smaller.' },
        // fws.gov uses /refuge/<name> for refuges; checked in merge if CHECK_LINKS=1
        url: isWMD ? null : `https://www.fws.gov/refuge/${slugBase}`,
        fwsRegion: p.FWSREGION,
      },
    }));
  }
  return out;
}

// ---------- USDA Forest Service: proclaimed forests, grasslands, special national designations ----------
async function usfs() {
  const EDW = 'https://apps.fs.usda.gov/arcx/rest/services/EDW';
  const out = [];

  const PF = `${EDW}/EDW_ProclaimedForestBoundaries_01/MapServer/0`;
  const pf = await arcgisQuery(PF, geoParams('proclaimedforestid,forestname,gis_acres'), { geojson: true, pageSize: 20 });
  for (const [id, fs] of group(pf, (p) => p.proclaimedforestid)) {
    const p = fs[0].properties;
    out.push(baseRecord({ id: `usfs-pf-${id}`, agency: 'USFS', unitCode: String(id), name: titleCase(p.forestname).replace(/National Forest$/i, 'National Forest'), designation: 'National Forest', category: 'national-forest', acres: fs.reduce((s, f) => s + (f.properties.gis_acres || 0), 0), source: 'USFS proclaimed national forest boundaries', sourceUrl: PF, feats: fs }));
  }

  const NG = `${EDW}/EDW_NationalGrassland_01/MapServer/0`;
  const ng = await arcgisQuery(NG, geoParams('nationalgrasslandid,grasslandname,gis_acres'), { geojson: true, pageSize: 20 });
  for (const [id, fs] of group(ng, (p) => p.nationalgrasslandid)) {
    const p = fs[0].properties;
    out.push(baseRecord({ id: `usfs-ng-${id}`, agency: 'USFS', unitCode: String(id), name: titleCase(p.grasslandname), designation: 'National Grassland', category: 'national-grassland', acres: fs.reduce((s, f) => s + (f.properties.gis_acres || 0), 0), source: 'USFS national grassland boundaries', sourceUrl: NG, feats: fs }));
  }

  const OD = `${EDW}/EDW_OtherNationalDesignatedArea_01/MapServer/0`;
  const types = ['National Monument', 'National Volcanic Monument', 'National Recreation Area', 'National Scenic Area', 'National Scenic Recreation Area', 'National Scenic And Research Area', 'National Scenic And Wildlife Area', 'National Historic Area', 'National Game Refuge', 'National Wildlife Refuge'];
  const where = `areatype IN (${types.map((t) => `'${t}'`).join(',')}) AND (areaid IS NULL OR areaid <> 'BLM')`;
  const od = await arcgisQuery(OD, { where, ...geoParams('othnatldesgid,areatype,fullname,areaname,gis_acres') }, { geojson: true, pageSize: 20 });
  for (const [name, fs] of group(od, (p) => (p.fullname || '').trim().replace(/\s+/g, ' '))) {
    if (!name || /^national /i.test(name)) continue;
    const p = fs[0].properties;
    const clean = name.replace(/(National Recreation Area) National Recreation Area$/, '$1');
    out.push(baseRecord({ id: `usfs-od-${p.othnatldesgid}`, agency: 'USFS', unitCode: String(p.othnatldesgid), name: clean, designation: p.areatype.replace(' And ', ' and '), acres: fs.reduce((s, f) => s + (f.properties.gis_acres || 0), 0), source: 'USFS nationally designated areas', sourceUrl: OD, feats: fs }));
  }
  return out;
}

// ---------- Bureau of Land Management: National Conservation Lands (monuments, NCAs and similar) ----------
async function blm() {
  const L = 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_NLCS_NM_NCA_poly/MapServer/1';
  const feats = await arcgisQuery(L, geoParams('NLCS_ID,NCA_NAME,sma_code,STATE_ADMN'), { geojson: true, pageSize: 100 });
  const out = [];
  for (const [id, fs] of group(feats, (p) => p.NLCS_ID)) {
    const p = fs[0].properties;
    if (!p.NCA_NAME) continue;
    const name = p.NCA_NAME.trim();
    const designation = p.sma_code === 'BLM_MON' ? 'National Monument' : /Conservation Area/i.test(name) ? 'National Conservation Area' : (name.match(/(Outstanding Natural Area|Cooperative Management and Protection Area|Forest Reserve|Recreation Area|Scenic Area|Special Management Area|Wildlife Area)$/i)?.[1] || 'National Conservation Lands unit');
    const states = [...new Set(fs.map((f) => f.properties.STATE_ADMN).filter(Boolean))];
    out.push(baseRecord({ id: `blm-${id}`, agency: 'BLM', unitCode: id, name, designation, category: p.sma_code === 'BLM_MON' ? 'national-monument' : undefined, source: 'BLM National Conservation Lands (monuments and NCAs)', sourceUrl: L, feats: fs, extra: { administeringStates: states } }));
  }
  return out;
}

const runners = { fws, usfs, blm };
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(runners);
for (const k of which) {
  const t = Date.now();
  const recs = await runners[k]();
  await writeJSON(join(DATA, 'sources', `${k}.json`), recs, false);
  console.log(`${k.toUpperCase()}: ${recs.length} records, ${recs.filter((r) => r.boundary).length} with boundaries (${((Date.now() - t) / 1000).toFixed(0)}s)`);
}
