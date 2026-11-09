# Editorial content

Agency data covers the facts the agencies publish. Everything that makes the directory a guide, and the history the agencies do not publish in structured form, is written here: one JSON file per site in `data/editorial/`, named by the site's slug (the last part of its URL).

Anything carrying the Library's name follows the [TRPL brand guide](https://brand.labs.trlibrary.com) (voice and tone, editorial style guide, accuracy and approvals) and the Story Guide. Theodore Roosevelt quotes must be verbatim with a citation, or left out.

## File format

```json
{
  "slug": "grand-canyon-national-park",
  "status": "draft",
  "designationHistory": [
    {
      "date": "1908-01-11",
      "action": "designated",
      "designation": "National Monument",
      "name": "Grand Canyon National Monument",
      "authority": {
        "type": "presidential-proclamation",
        "citation": "Proclamation number from the Statutes at Large",
        "signedBy": "Theodore Roosevelt",
        "administration": "Theodore Roosevelt"
      },
      "note": "Proclaimed under the Antiquities Act.",
      "sources": [{ "title": "…", "url": "…" }],
      "reviewed": false
    }
  ],
  "guide": {
    "special": "What makes it special (plain text, paragraphs separated by blank lines)",
    "history": "Narrative history",
    "seeAndDo": "What to see and do",
    "tribalHomelands": "Whose lands these are (tribal review required)",
    "reviewed": false
  },
  "trConnection": { "summary": "…", "reviewed": false },
  "links": {
    "official": "https://…",
    "social": { "facebook": "…", "instagram": "…", "x": "…", "youtube": "…" },
    "alltrails": "https://www.alltrails.com/parks/us/…",
    "recreationGov": "https://www.recreation.gov/…",
    "other": [{ "label": "…", "url": "…" }]
  },
  "images": [{ "url": "…", "title": "…", "alt": "…", "credit": "…" }],
  "acres": { "value": 0, "kind": "documented", "source": "Official acreage report and year" }
}
```

### `authority.type`

`act-of-congress`, `presidential-proclamation`, `executive-order`, `secretarial-order`, `public-land-order`, `other`.

### Administration rule

`administration` is always the President in office when the action took effect. For an act of Congress, `signedBy` is the President who signed it. If a bill became law without a signature or over a veto, say so in `note` and keep `administration` as the sitting President.

### `action`

`established` (first protection), `designated` (new status), `redesignated` (status changed, such as monument to park), `enlarged`, `reduced`, `renamed`, `transferred` (between agencies), `abolished`.

The site shows the **first** entry as "First protected" and the **latest** `established`, `designated` or `redesignated` entry as "[designation] since".

## Review rules

1. Every entry starts with `"reviewed": false`. **Unreviewed entries are not published.** The live build leaves them out; run `SHOW_UNREVIEWED=1 npm run merge && npm run build` to preview them locally, where they carry a *Pending historian review* tag.
2. Run the entry through HistorianPanel (`accuracy-review`). Add at least one primary or official source to `sources` (Statutes at Large, the proclamation text, NPS legislative history, the Federal Register).
3. Only then set `"reviewed": true`.
4. `tribalHomelands` text needs tribal review as well as historian review, following the Library's hard-chapters routing.
5. Entries that name a recent or current President, or a monument designation still in public debate, route through Bridget (Javelin) before `reviewed` is set, per the Library's nonpartisan rule.
6. The by-administration filter has the same sensitivity as the PresidentialPublicLands project. Keep entries factual (date, authority, signer) with no characterization of any administration.

## Seeded entries (2026-11-08)

Ten files were seeded from staff knowledge to show the format: Yellowstone, Theodore Roosevelt, Grand Canyon, Yosemite, Mesa Verde, Crater Lake, Wind Cave, Devils Tower, Muir Woods and Pelican Island. All are unreviewed and have no citations yet.
