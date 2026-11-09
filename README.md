# Public Lands Directory

**Live at [directory.labs.trlibrary.com](https://directory.labs.trlibrary.com)**

A guide to every federal public land managed by the four land agencies: national parks, forests, grasslands, wildlife refuges, monuments, seashores, recreation areas, historic sites and BLM conservation lands. Built by the Theodore Roosevelt Presidential Library, inspired by T.R.'s conservation record.

Each site has:

- Structured facts: designation, managing agencies, states, acreage, and a designation history recording every law, proclamation or order with the administration that signed it
- A guide: overview, what makes it special, history, what to see and do, plan your visit (hours, fees, passes, directions, visitor centers, campgrounds, weather), the Roosevelt connection, photos, and nearby places
- Live alerts: park closures and notices (NPS), weather watches and warnings (NWS) and wildfire perimeters (NIFC), refreshed hourly
- A boundary map with GeoJSON and KML downloads
- Links to the official site, Recreation.gov, AllTrails and directions
- The Roosevelt connection, where there is one: places T.R. protected as President, places that trace to his proclamations and orders, and places his own record shows he visited, with a landing page at `/roosevelt/`
- Embeds anyone can paste into their own site, plus open JSON, CSV and GeoJSON data

## How it stays current

A GitHub Actions workflow (`.github/workflows/sync-and-deploy.yml`) runs:

| When | What |
|------|------|
| Nightly | Full sync of every agency source, merge with editorial, rebuild, deploy |
| Hourly | Refresh NPS alerts, NWS alerts and wildfire perimeters, rebuild, deploy |
| On push to `main` | Rebuild with the latest editorial changes |

Generated data is not committed. It is rebuilt from the agencies on every full run and cached between runs. Only hand-written content (`data/editorial/`) and reference caches (`data/reference/`) live in git.

## Data sources

| Agency / data | Source |
|---|---|
| National Park Service units, photos, hours, fees, alerts | [NPS Data API](https://www.nps.gov/subjects/developer/) (needs `NPS_API_KEY`) |
| NPS boundaries | NPS Land Resources Division boundary service |
| Wildlife refuges and wetland management districts | USFWS `FWSApproved_Authoritative` (approved acquisition boundaries) |
| National forests (154 proclaimed), grasslands, USFS monuments, NRAs, scenic areas | USFS Enterprise Data Warehouse (`EDW_ProclaimedForestBoundaries_01`, `EDW_NationalGrassland_01`, `EDW_OtherNationalDesignatedArea_01`) |
| BLM national monuments and conservation areas | BLM `BLM_Natl_NLCS_NM_NCA_poly` |
| Weather alerts | api.weather.gov |
| Wildfire perimeters | NIFC WFIGS current interagency perimeters |
| State lines | Census TIGERweb |
| Cover photos | Agency photos credited to the agency (public domain); otherwise the site's Wikidata image or Commons category, license-checked by `scripts/sync-images.mjs` against the TRPL image-rights standard. Review sheet at `/covers/`; replace or veto picks in `data/editorial/_cover-overrides.json` |
| Official sites and social accounts | Agency URLs first; otherwise the site's Wikidata website or the agency's own unit page, each fetched and kept only if it resolves to a live `.gov` page (`scripts/sync-links.mjs`). Social accounts from Wikidata |
| Wilderness | [Wilderness Connect](https://wilderness.net) (University of Montana), National Wilderness Preservation System boundaries |
| Visitation | [NPS Visitor Use Statistics](https://irma.nps.gov/Stats/) |
| Reservations | Recreation.gov site search, matched by name and agency |
| Trails | AllTrails park pages and popular trails, gathered with the AllTrails connector in batches (AllTrails has no public API) |
| Roosevelt connections | The Library's own datasets: [Roosevelt's Public Lands](https://publiclands.labs.trlibrary.com), [Executive Orders and Proclamations](https://executiveactions.labs.trlibrary.com) (Then and now), [Day by Day](https://daybyday.labs.trlibrary.com) (each day's recorded location, matched to site boundaries) |

## Run it locally

Requires Node 20 or newer. No npm packages.

```sh
export NPS_API_KEY=...        # free key from nps.gov/subjects/developer; DEMO_KEY works for light testing
npm run sync                  # agencies -> data/sources, data/boundaries, data/directory.json
npm run alerts                # live alerts -> data/live/alerts.json
npm run build                 # static site -> dist/
npm run serve                 # http://localhost:8080
```

## Editing content

Designation histories, guide text, social links, AllTrails links and Roosevelt connections are written by hand in `data/editorial/<slug>.json`. See [docs/EDITORIAL.md](docs/EDITORIAL.md) for the format and the review rules. **Every historical claim must pass HistorianPanel review before `reviewed` is set to `true`.** Until then the site shows it as *Pending historian review*.

## Setup checklist (one-time)

1. Add the repository secret `NPS_API_KEY`.
2. Settings → Pages → Source: **GitHub Actions**. Custom domain: `directory.labs.trlibrary.com`.
3. DNS: `CNAME directory.labs` → `theodore-roosevelt-presidential-library.github.io`.

## Roadmap

Status as of November 2026.

**Built**
- Wilderness: 619 of the 801 designated wilderness areas from Wilderness Connect (wilderness.net) appear on 291 sites. Each shows on any site whose own agency manages part of it and that holds at least a tenth of its area, with a map layer, a "Has wilderness" filter and `/wilderness/{slug}.geojson`. Most of the rest are BLM wilderness outside the monuments and conservation areas the directory covers.
- Visitation: annual recreation visits for 388 National Park System units from NPS Visitor Use Statistics. Refreshed weekly.
- Recreation.gov: reservation pages for 1,083 sites across all four agencies, matched by name and agency. Forest Service units listed under a combined or state name ("Shasta-Trinity", "National Forests in Texas") link to that page.
- AllTrails: park pages for 381 sites and popular trails for 376.

**Content gaps (in progress)**
- Official websites: 1,293 of 1,355 sites have one. Remaining: 31 BLM, 23 FWS and 17 Forest Service units to match by hand.
- Cover photos: 1,083 of 1,355 sites have a cleared image. The other 272 need a photo found by hand or from the agencies; every automatic pick waits for review on `/covers/`.
- AllTrails: 140 searched sites had no AllTrails match, mostly offshore refuges, Alaska and small urban monuments. Wildlife refuges are not searched yet. A data partnership with AllTrails would cover everything and keep it in sync.
- Guide text written by the Library (overview, what makes it special, see and do), drafted by site and hidden until reviewed.
- Visitation for refuges, forests and BLM lands: the other agencies do not publish per-unit figures in a form that can be synced.

**Research batches (designation histories, HistorianPanel review)**
- Batch 1 (national parks): done. 128 claims checked, 119 confirmed, 8 corrected, 1 open.
- Batch 1b (rest of the NPS system): 350 units drafted from the NPS Index, waiting for review. 52 newer units still need a source.
- Monuments since 1994, all agencies: 40 monuments drafted from Federal Register proclamations, waiting for review. This covers most of batch 4.
- Batch 2: national forests and grasslands (proclamations, transfers, renamings).
- Batch 3: national wildlife refuges, starting with the T.R.-era bird reservations.
- Batch 4: the rest of the BLM conservation areas and older monuments.

See [docs/RESEARCH.md](docs/RESEARCH.md).

**Held**
- Whose lands these are: Indigenous homelands, added only after tribal and Library review.

**Decisions pending**
- Whether to show the Administration filter before the remaining histories are reviewed.
- Listing the directory on the Library's labs page.

**Known issues**
- Day by Day: some days carry a location inferred from an entry or carried forward from an earlier day, which produced false visits (Pelican Island, Antietam). Only days with a recorded location are used now, and town-level matches wait in `data/reference/tr-visit-candidates.json` for review. The underlying data needs fixing in the Day by Day project.
- The BLM boundary layer files a large southern California polygon under Browns Canyon (Colorado). It is clipped out in `scripts/sync-lands.mjs`. It may be Chuckwalla's boundary, which the directory currently lacks; worth asking BLM.

## Embeds

```html
<script src="https://directory.labs.trlibrary.com/embed/embed.js" async></script>
<public-lands-card site="theodore-roosevelt-national-park"></public-lands-card>
```

Views: `card` (default), `compact`, `alerts`, `history`, `map`, `roosevelt`. Theme: `theme="dark"`.

The whole directory (search, results and every full site page, without the Library's banner):

```html
<script src="https://directory.labs.trlibrary.com/embed/embed.js" async></script>
<public-lands-directory state="ND" tr="any"></public-lands-directory>
```

Optional starting points: `search`, `agency`, `state`, `category`, `tr` (`any`, `protected`, `visited`, `both`), `activity`, `view="map"`, or `site="<slug>"` to open on one site. The frame sizes itself to its content (`min-height` sets the floor). The page a reader is on is kept in the host URL as `?pl-dir=…`, so links, reloads and the back button return to it. It fires a `navigate` event with `{path, title}`. Any directory page also works in a plain iframe with `?embed=1`, at a fixed height. Sample page: `/embed/directory-demo.html`.

A map of many places:

```html
<script src="https://directory.labs.trlibrary.com/embed/embed.js" async></script>
<public-lands-map state="ND" tr="any" controls height="480"></public-lands-map>
```

Attributes: `agency` (NPS, FWS, USFS, BLM), `category`, `state`, `tr` (any, protected, executive-action, visited), `sites` (comma-separated slugs), `controls` (show the filter bar), `color="tr"`, `boundaries`. No-script option: iframe `/embed/directory-map.html?state=ND&controls=1`.

**Deep links.** Embeds read and write the host page's address, so readers can share exactly what they see:

- `?pl-site=yellowstone-national-park` opens that site in a card or on a map. `pl-view=history` picks the card view.
- `?pl-state=ND&pl-tr=any` (also `pl-agency`, `pl-cat`, `pl-q`) sets the map filters. When a reader changes the filters or clicks a site, the host URL updates to match.
- Two embeds on one page: give each its own prefix, for example `deep-link="parks-"`. Use `deep-link="off"` to ignore the host URL. Builder at [/embed/](https://directory.labs.trlibrary.com/embed/).
