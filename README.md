# Public Lands Directory

**Live at [directory.labs.trlibrary.com](https://directory.labs.trlibrary.com)**

A guide to every federal public land managed by the four land agencies: national parks, forests, grasslands, wildlife refuges, monuments, seashores, recreation areas, historic sites and BLM conservation lands. Built by the Theodore Roosevelt Presidential Library, inspired by T.R.'s conservation record.

Each site has:

- Structured facts: designation, managing agencies, states, acreage, and a designation history recording every law, proclamation or order with the administration that signed it
- A guide: overview, what makes it special, history, what to see and do, plan your visit (hours, fees, passes, directions, visitor centers, campgrounds, weather), whose lands these are, the Roosevelt connection, photos, and nearby places
- Live alerts: park closures and notices (NPS), weather watches and warnings (NWS) and wildfire perimeters (NIFC), refreshed hourly
- A boundary map with GeoJSON and KML downloads
- Links to the official site, Recreation.gov, AllTrails and directions
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

## Embeds

```html
<script src="https://directory.labs.trlibrary.com/embed/embed.js" async></script>
<public-lands-card site="theodore-roosevelt-national-park"></public-lands-card>
```

Views: `card` (default), `compact`, `alerts`, `history`, `map`. Theme: `theme="dark"`. Builder at [/embed/](https://directory.labs.trlibrary.com/embed/).
