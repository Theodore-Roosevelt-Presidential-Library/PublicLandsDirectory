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

Planned development, roughly in order. Status as of November 2026.

**Content gaps (in progress)**
- Official websites: 1,284 of 1,346 sites verified. Remaining: 31 BLM, 23 FWS and 17 Forest Service units to match by hand.
- Cover photos: about 1,000 of 1,355 sites have a cleared image. A wider Commons search (public domain and CC0 only) is filling the rest; every automatic pick waits for review on `/covers/`.
- AllTrails: park pages and popular trails for national parks and T.R.-connected sites first, then the remaining sites in batches. A data partnership with AllTrails would cover everything and keep it in sync.
- Guide text written by the Library (overview, what makes it special, see and do), drafted by site and hidden until reviewed.

**Research batches (designation histories, HistorianPanel review)**
- Batch 1 (national parks): done. 128 claims checked, 119 confirmed, 8 corrected, 1 open.
- Batch 1b: the rest of the NPS system from the NPS Index.
- Batch 2: national forests and grasslands (proclamations, transfers, renamings).
- Batch 3: national wildlife refuges, starting with the T.R.-era bird reservations.
- Batch 4: BLM monuments and conservation areas, plus Forest Service monuments.

**New data**
- Wilderness areas (wilderness.net boundaries) shown inside each site.
- Annual visitation (NPS Stats, with agency figures elsewhere where published).
- Recreation.gov links for every agency, not just NPS.
- Whose lands these are: Indigenous homelands, added only after tribal and Library review.

**Decisions pending**
- Whether to show the Administration filter before the remaining histories are reviewed.
- Listing the directory on the Library's labs page.

**Known issues**
- Day by Day: some days carry a location inferred from an entry or carried forward from an earlier day, which produced false visits (Pelican Island, Antietam). Only days with a recorded location are used now, and town-level matches wait in `data/reference/tr-visit-candidates.json` for review. The underlying data needs fixing in the Day by Day project.

## Embeds

```html
<script src="https://directory.labs.trlibrary.com/embed/embed.js" async></script>
<public-lands-card site="theodore-roosevelt-national-park"></public-lands-card>
```

Views: `card` (default), `compact`, `alerts`, `history`, `map`, `roosevelt`. Theme: `theme="dark"`.

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
