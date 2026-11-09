# Designation-history research

Every site's history is built from one official compiled record per agency, then verified by HistorianPanel before it publishes.

| Batch | Agency | Official record | Status |
|---|---|---|---|
| 1 | National Park Service | *The National Parks: Index 2012–2016* (the "Red Book"), [PDF](https://www.nps.gov/aboutus/upload/npindex2012-2016.pdf) | Extracted for 411 units. **National parks reviewed:** 128 events checked; 119 confirmed, 8 corrected (applied), 1 unresolved (Pinnacles 1908 date, hidden). Other NPS units next |
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

## Batch 1 findings

- **Index errors caught:** Badlands monument proclamation (Jan. 25, 1939, not Jan. 24) and the Saguaro National Park act (Oct. 14, 1994, not Oct. 4).
- **Parser errors caught:** related units (wild and scenic rivers, parkways) share their parent park's web address in the Index, so they overwrote Zion's and Grand Teton's entries. Fixed: the converter now picks the entry whose name matches the site. Both histories were regenerated, keeping the verified events.
- **Inauguration-day dates settled:** Marble Canyon (Jan. 20, 1969) was signed by Lyndon B. Johnson, and Hot Springs (March 4, 1921) by Woodrow Wilson. Badlands (March 4, 1929) has no source naming the signer yet, so it stays blank.
- **Not designations:** two events were removed, a 1932 Denali boundary revision and the 1993 American Samoa lease.
- **Guard added:** a site states "first protected" only when no unreviewed event is older than its earliest reviewed one.

## Drafts waiting for review (November 2026)

These histories are written but not published. Each event carries `reviewed: false` until HistorianPanel checks it.

- **Batch 1b, NPS units in the NPS Index:** 350 units drafted from *The National Parks: Index 2012–2016* (`scripts/research/nps-to-editorial.mjs`).
- **Monuments since 1994, all agencies:** 40 monuments, 51 events drafted from presidential proclamations in the Federal Register (`scripts/research/fr-proclamations.mjs`). This covers newer NPS monuments the Index predates and most of batch 4 (BLM and Forest Service monuments). The script keeps only proclamations whose title names the monument. When a title is just the monument's name (for example Proclamation 10285, Bears Ears, 2021), the draft says so, and the reviewer describes what the proclamation changed.
- **Still without a draft:** 52 NPS units, mostly parks created by law after 2016, trails and parts of larger units the Index does not list separately (for example Amache and Blackwell School National Historic Sites). These need the statute from Congress.gov.

Review order, highest traffic first: NPS monuments and historic sites with Roosevelt connections, then the remaining monuments, then the rest of batch 1b.
