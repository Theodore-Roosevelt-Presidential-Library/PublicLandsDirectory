# Designation-history research

Every site's history is built from one official compiled record per agency, then verified by HistorianPanel before it publishes.

| Batch | Agency | Official record | Status |
|---|---|---|---|
| 1 | National Park Service | *The National Parks: Index 2012–2016* (the "Red Book"), [PDF](https://www.nps.gov/aboutus/upload/npindex2012-2016.pdf) | Extracted for 411 units (694 events). National parks under review |
| 2 | Forest Service | FS-612, *Establishment and Modification of National Forest Boundaries and National Grasslands: A Chronological Record, 1891–1996* | Next |
| 3 | Fish and Wildlife Service | Annual Report of Lands, plus the Roosevelt-era tables in Roosevelt's Public Lands | Planned |
| 4 | BLM and units created since 2015 | Proclamation texts (Federal Register) and enabling acts | Planned |

## How a batch works

1. **Extract.** A parser reads the official record and keeps each event's own wording, its date and the page it came from. Example: `scripts/research/parse-nps-index.py npindex2012-2016.pdf data/research/nps-index.json`.
2. **Convert.** `scripts/research/nps-to-editorial.mjs` writes `designationHistory` into `data/editorial/<slug>.json`:
   - The authority is stated only when the record says so ("proclaimed" is a presidential proclamation; "authorized" is an act of Congress). Everything else is `unspecified`.
   - The administration is the President in office on that date (`scripts/research/presidents.mjs`). Dates that fall on the day the presidency changed hands are left blank and flagged.
   - Every entry starts `reviewed: false`, so nothing publishes yet.
3. **Verify.** HistorianPanel checks each claim against independent sources (statutes, proclamation texts, park legislative histories). The claims go in `data/research/review-batch<N>-claims.json` and the verdicts in `review-batch<N>-verdicts.json`.
4. **Apply.** Confirmed entries get `reviewed: true` and the independent source is added. Corrected entries are fixed and then confirmed. Unresolved entries stay hidden.

The Index stops at December 31, 2015. Units created after that date (Stonewall, Emmett Till and Mamie Till-Mobley, Chuckwalla and others) are researched individually in batch 4.
