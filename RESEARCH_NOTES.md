# RESEARCH_NOTES.md

Raw material for the app's domain model. Facts first, interpretation marked. Confidence scale:
**High** = read in a standards body / industry-association document (or a manufacturer catalogue) by me;
**Medium** = consistent across several manufacturer/engineering pages, not read in the standard itself;
**Low** = one vendor/blog page, or sources disagree;
**Estimate** = my own interpolation or calibration, no source states it.

Researched 2026-11-24. Several standards (CMAA 70/74, FEM 1.001, ISO 4301, EN 15011) are paywalled; I did **not** read their texts. Where I quote them, I quote a document that quotes them, and say so.

---

## 0. Who uses this, and what they need

**Primary user:** a sales/proposal engineer or design engineer at a crane builder (or a plant engineer at a customer), who has four or five headline numbers (capacity, span, lift height, duty) and needs a credible general-arrangement (GA) drawing *today* to put in a quotation or to start detailed design. The sample drawing is exactly that artefact: it is marked "PRELIMINARY DRAWING / OFFER ONLY", has a technical data block, "drawing not in scale", and customer-facing clearances ("Min.920", "Min.1150").

**Jobs to be done**
1. Turn headline specs into a dimensioned GA in minutes, without CAD.
2. Check that the building can take the crane (headroom, hook approach, min. rail height above floor, overall length/width).
3. Tweak and compare variants (e.g. 10 t vs 12.5 t, A4 vs A5), keep them, reopen them next week.
4. Hand the drawing to someone else: PDF to the customer, DXF to a draughtsman.

**Fears**
- A wrong dimension reaching a customer. So the drawing must say what is an input, what is a standard value and what is an estimate, and carry a "not for fabrication" mark.
- Not knowing *why* an input is rejected, or being blocked by a rule they think is wrong. So errors say how to fix, and unusual-but-valid combinations are warnings, not blockers.
- Losing work (unsaved changes, concurrent edit, accidental delete).
- Being the one who has to explain an invented number. So every derived number has a formula, a source ID and a confidence tag one click away.

**What "great" feels like:** the first render is already a good drawing; changing span moves the drawing instantly; hover a dimension and the matching part lights up with its formula; export opens in CAD.

Design consequences: sensible defaults; presets; live preview from the shared engine; two-tier validation (errors/warnings); an assumptions panel; EST. marking on the sheet itself; PDF/SVG/PNG/DXF export.

---

## 1. Reference material I was given

### 1a. `sample_crane.png` (company drawing) — what I took

Single-girder, top-running EOT crane, 10 t, 25 m span, 7.9 m lift, FEM A5, hoist group M5, travel group M5. Content:
- **Views:** front elevation (top-left), end/section view "A-A" (top-right), plan (below the front view), a small site-plan inset with feeding point and direction, a "Detail Z" of the rail/wheel. Plan under front and left-view to the right = **first-angle projection**.
- **Dimension style:** thin continuous dimension lines with open/short arrowheads, extension lines, text above the line (horizontal) or rotated (vertical), stacked dimension chains outside the part. Roughly 3 text sizes.
- **Line types:** thick continuous for crane outline, thin for dimensions, hatched/stippled ground and wall fills, chain (centre) lines for rails/axes.
- **Dimensions that look *driving* (a customer/sales person states them):** span 25000 (rail centre to rail centre), lift height 7900, capacity 10 t, rail 50×30 flat (Detail Z: 75 / 50 / 30 / Ø250), "Min.235" wall clearance each side, floor ±0.
- **Dimensions that look *derived* (a manufacturer produces them):** overall length 25270 (= span + 270, so 135 per side), wheelbase 3800, overall width 4310, hook approaches Min.920 / Min.1150 (left/right differ, hoist is asymmetric), 620 (girder underside to highest hook position — a *low-headroom* hoist), max static wheel load 74.8 kN, wheel Ø250, 1046/1229 (end view: hoist offsets), crane/trolley weight 8.9 t / 0.68 t.
- **Technical data block:** load, span, lifting height, hoisting/traversing/travelling speed, weight of trolley, weight of crane, power supply, crane group, hoist group, bridge travel group, supply power, tolerances "acc. to ISO/FEM standard", paint, "drawing not in scale".
- **Title block** is a CAD template (bilingual placeholder text, not usable).

**Skipped on purpose:** site plan inset, wall/roof/ground hatch, cabin/walkway/cable festoon detail, Detail Z, speeds/power/paint, bilingual title block, per-component outlines of the hoist (I draw a schematic hoist).

I used the sample as a **calibration point** for the estimates: wheelbase ≈ span/6.6, length = span+270, width = wheelbase+510, hook approach 1150, hook headroom 620, wheel load 74.8 kN, crane mass 8.9 t. For the same inputs the model gives: length 25270 (exact, by construction), hook approach 1150 and low-headroom 620 (exact, by construction), mass 8.9 t (exact, by construction), wheelbase 3600 (−5 %), overall width 4110 (−5 %), wheel Ø250 (same) and wheel load 68.6 kN (−8 %). A unit test pins these tolerances (wheelbase/width/mass/load within 6–10 %). Matching the sample on the three "exact" items proves nothing about other cranes: they are one data point each.

### 1b. `crane_sketch_taken_from_internet.avif` — what I took

Front elevation only, single girder on top-running end trucks, hoist hanging below the girder, building section with hatched walls/roof. Dimensions are drawn without values: girder depth, hook height (hoisting height to floor), hook approach (left and right), span between rails, overall crane length, floor to hook. **Took:** the *set of dimension types* and their placement (stacked chains below, vertical to the right of the hoist, approach dimensions at the two ends). **Skipped:** colours, building, vector-stock style art.

### 1c. The brief (4 pages)
Minimum requirements as stated in the task; `DECISIONS.md` must be hand-written; README must contain *real hours spent*; **`AI_LOG.md` is also a required deliverable** (tools used, 3–5 key prompts, one time the AI was wrong); 3–5 min demo video. Database "SQLite is fine" — Postgres is the stack I was told to use. Evaluation order: framing/judgment → honesty about assumptions → backend → code quality → AI use → usability. "Not graded: visual polish, number of features."

---

## 2. Domain research

### 2.1 Crane types and vocabulary

| Term | Meaning (as used in this app) | Source | Conf. |
|---|---|---|---|
| EOT / bridge crane | Electric overhead travelling crane: a bridge (girder(s) + end carriages) running on runway rails high on the building; a trolley/hoist runs on the bridge | IS 3177:1999 scope — https://law.resource.org/pub/in/bis/S08/is.3177.1999.pdf | High |
| Single girder | One main girder; hoist hangs below it on the bottom flange. Typical range 1–20 t, ~3–31.5 m span | https://www.bettercrane.com/overhead-crane/specifications/ ; https://www.biey.com/cranes/6970.html | Medium |
| Double girder | Two girders; trolley/crab runs on top rails between/over them, hook can go higher. Typical 5–80 t, 10.5–35 m span | same | Medium |
| Top-running | End carriages run on rails on top of runway beams (what the sample shows). Under-running (suspended) cranes exist; **not covered** | IS 3177; sample | Medium |
| Span | Distance between runway rail centrelines | IS 3177 Annex A "Span S" | High |
| Rail gauge / track gauge | Used for the trolley: distance between trolley rails (= girder spacing on double girder) | Chinese LH tables ("K") — https://www.yangyucrane.com/products/overhead-crane/double-girder-overhead-crane/ | Low (symbols undefined on page) |
| Lift / height of lift | Vertical hook travel from highest to lowest position. R5 preferred series ≤16 m: 2.5, 4, 6.3, 10, 16, then R10 | IS 3177 Annex E-3 | High |
| Headroom | Vertical distance from rail top up to the highest point of the crane structure/trolley (building must clear it) | Common definition; IS 3177 Fig. 2A lists the clearances to be provided to the manufacturer | Medium |
| Hook approach | Minimum horizontal distance from hook centreline to runway rail centreline | https://www.biey.com/cranes/6970.html ; IS 3177 Annex A "position of hook from centre line of rails" | Medium |
| End approach | Distance from hook to the *end* of the runway (the sources define it inconsistently) | same | Low — **not used as a dimension** |
| Wheelbase | Distance between outer wheel centres of one end carriage (runway direction) | CMAA 74 §3.6.1 via https://og.mhi.org/downloads/industrygroups/cmaa/faqs/most-asked-action-alerts.pdf | High |
| Wheel diameter | Tread diameter, standardised 160, 200, 250, 315, 400, 500, 630 … mm | IS 3177 cl. 8.6.6 | High |
| End carriage / end truck | Cross-beam at each end of the bridge carrying the wheels | Common | High |
| Rail types | DIN 536 A45/A55/A65/A75/A100 (head width = number); also flat/square bar (sample uses flat 50×30) | https://wirthrail.com/our-products/crane-rails-eu/ | High (DIN dims), Low (selection) |
| Control | Pendant, radio, cabin | IS 3177 Annex A | High (existence) |

IS 3177 states a precise **dimension sheet** (Annex A.10.4, Fig. 2A "E.O.T. Clearance Diagram"): span S, rail head width B, clearances C from obstruction to top of rail, side clearances, position of hook from rail centreline, rail height from floor, wheel spacing, maximum/minimum wheel load. That list is what the "Calculated dimensions" panel mirrors.

### 2.2 Standards: what each actually covers (verified where noted)

| Standard | What it covers | Read? | Conf. |
|---|---|---|---|
| **IS 3177:1999** (+Amend. 1) | Code of practice for EOT cranes and gantry cranes other than steel-work cranes: scope single/double girder/mono-box; classification by IS 13834 (ISO 4301 equivalent, mechanisms M1–M8); information to be supplied by purchaser/manufacturer (Annex A); preferred capacity/height/speed series (Annex E); wheel diameter series and wheel sizing (cl. 8.6) | **Yes, full text** | High |
| **CMAA 70 / 74** | US specs. 70 = top-running double-girder cranes, 74 = top-running single-girder cranes with top-running or underhung trolley. Service classes A–F by load class L1–L4 × cycles N1–N4. Girder deflection limit 1/888 of span (rated load + trolley/hoist weight, no inertia). §3.6.1 of 74: end-truck wheelbase ≥ span/8 | CMAA FAQ & buyers' guide documents, not the spec | High for 1/888 and 1/8 (CMAA documents themselves); Medium for scope |
| **FEM 1.001 / ISO 4301-1** | Classification: utilisation class U0–U9 × load spectrum Q1–Q4 → crane group A1–A8; mechanisms M1–M8. Sources disagree on class label sets and on mapping to CMAA; **not equivalent** | Not read; vendor summaries only | Medium for existence/ordering, **Low for exact matrix** |
| **EN 15011** | Bridge and gantry cranes (fixed or rail travelling); hoists are in EN 14492-2 | iTeh catalogue page + vendor blogs | Medium |
| **IS 807 / IS 800** | Structural design rules for cranes: deflection 1/750 (>12 m span) per two secondary sources; IS 3177 itself says IS 807 holds deflection and wheelbase/span rules and is "to be modified" | Not read | Low |
| **GB/T 3811, JB/T** | Chinese crane design code; deflection S/800 (A1–A6/A5–A6) or S/1000 (A7–A8) per vendor pages | Not read | Low |
| **ISO 2374** | Range of maximum capacities for basic crane models (0.1–1000 t) | Not read; IS 3177 Annex E uses R10 ≤125 t | Medium |
| **ISO 128 / 129 / 5457 / 5455 / 7200 / 5456-2** | Drawing conventions: line types and 1:2 width ratio; dimensioning; sheet formats and borders; scales; title block; projection method | Snippets from iTeh previews / learning pages | Medium |

**Duty classes (what they imply for inputs).** The duty group selects *how hard the crane works over its life*, not geometry. In this app it only moves the girder-depth heuristic (heavier duty → deeper, stiffer girder, per Kino's L/18→L/14 range) and is printed on the sheet. Verified fragments: CMAA matrix (Class A = L1×N1 … F), N1 20k–100k, N2 100k–500k, N3 500k–2M, N4 >2M cycles (https://www.cranebuzz.com/planning/Overhead_Crane_Hoist_Duty_Comparisons.pdf, "an excerpt from CMAA"); ISO/FEM mechanism mapping in the same document (CMAA A–F ≈ ISO M3–M8, FEM 1Bm–5m) — a vendor summary, **Low**. Plain-language descriptors shown in the UI come from https://www.alwahacranes.com/cranes/crane-duty-classification-fem-iso-cmaa/ (A1–A2 light/occasional, A3–A4 moderate, A5–A6 regular/intensive, A7–A8 very intensive/continuous). That page also says FEM A5 and CMAA C are "not direct equivalents" — **so the app does not translate between systems**; it takes FEM/ISO group A1–A8 only (the sample says FEM A5).

### 2.3 Relationships found (capacity / span / depth / width / wheelbase / wheel / approach / headroom)

| Relationship | Found | Source | Conf. |
|---|---|---|---|
| Box girder depth | L/18 (light) … L/14 (heavy); width ≈ H/3…H/2 and ≥ L/50; camber ≈ L/1000 | https://www.kinocranes.com/online-tools/girder-pre-sizing-estimator/ | Low–Medium (vendor "pre-sizing rule of thumb") |
| | 1/15…1/20 of span for a 50 t example, H/B ≤ 3.5 | https://www.mdpi.com/2076-3417/14/21/9926 | Medium (peer-reviewed, one example) |
| | 1/12…1/20, 15 most common | https://www.biey.com/cranes/5683.html | Low |
| | **Conflict:** CED Engineering says 8…14 — likely rolled wide-flange beams, not box | cedengineering PDF | not used |
| Deflection limits | 1/888 (CMAA 70, quoted by CMAA's own guide); 1/750 for >12 m (IS 807 via vendor guide); S/800, S/1000 (GB) | cmaa_guide (og.mhi.org); loadmate/revacranes; Kino | High / Low / Low — **sources disagree**, app prints CMAA's 1/888 only as an *information* row |
| Wheelbase | ≥ S/8 (CMAA 74 §3.6.1, quoted by CMAA FAQ); ≥ S/7 for 4 wheels per end (CED Engineering overview) ; catalogue rows ≈ S/3.75 (7.5 m) … S/7.1 (28.5 m) | og.mhi.org FAQ; CED; bettercrane LD 10 t table | High (S/8); Medium (S/7); the app enforces S/8 and *defaults* to S/7 |
| Single-girder catalogue, 10 t | span 7.5…28.5 m → wheelbase 2000…4000, crane width 2500…4700, girder height 900…1450, rail top→girder top 720…1200, rail top→highest hook 1850…1920, hook limits 1293/1893, rail P24 | https://www.bettercrane.com/overhead-crane/specifications/10-ton-overhead-crane.html | Medium (one manufacturer) |
| Double-girder catalogue, 10 t | wheel tread→hoist top 1350, →girder bottom 165…465, →hook centre 385; wheel distance 3200…3900; track gauge 1400…1800; hook limits 1200; max wheel load 39…71 kN; mass 5.2…14.9 t (7.5…25.5 m); rail P38 | https://www.bettercrane.com/overhead-crane/specifications/double-girder-bridge-10-ton.html | Low (page text flattened, columns ambiguous) |
| Double-girder catalogue, 32/5 t | wheelbase 3800/4000, track gauge 2000, max wheel pressure 159…222 kN, mass 11.6…25.3 t (7.5…25.5 m) | https://www.yangyucrane.com/products/overhead-crane/double-girder-overhead-crane/ | Low (symbols undefined) |
| Hook approach | single girder 600–1200 mm typical; double girder 300–600 (vendor) | https://www.sourcebyspec.com/… ; biey | Low |
| | double girder 20 t forum spec: 600 mm; worked example 683 mm; 10 t catalogue (LH): 1200 mm. **Conflict, wide spread.** | sefindia forum; voittocrane; bettercrane | Low |
| | sample (10 t, single): 920 / 1150 mm | sample_crane.png | Medium (a real company drawing) |
| | rule: single-girder approach ≈ ½ hoist wheelbase + frame offset + rail clearance (no numbers) | https://www.biey.com/cranes/6970.html | Low |
| Hoist (trolley) wheelbase vs capacity | 1000–1200 (5 t), 1200–1500 (10 t), 1500–1800 (16 t) | same (citing a CD1 catalogue) | Low |
| Wheel sizes | Demag DRS max load per wheel: 160 → 7 t, 200 → 10 t, 250 → 16 t, 315 → 22 t, 400 → 30 t, 500 → 40 t (also 125 → 5 t, not an IS size) | https://www.demagcranes.com/sites/default/files/media/documents/WheelRange.pdf (text extracted from catalogue; some digits OCR-damaged, cross-checked with search summary) | Medium |
| Rail/wheel-load | DIN A45 ≤100 kN, A55 ≤150, A65 ≤200, A75 ≤260, A100 ≤380 (blog's own table, not from a standard) ; the real criterion is Hertzian contact stress `P ≤ p_mean·b_k·D·c1·c2` (blog cites IS 3177 cl. 6.1.1 / FEM 1.001 Bk 3; IS 3177 amendment 1 cl. 8.6.6 has the same structure with coefficient tables that did not survive the PDF text) | https://eotconnect.com/blog/crane-rail-sizing-chart-selection-guide.html ; IS 3177 | Low |
| DIN 536 rail geometry (head width / height / base / web / kg/m) | A45 45/55/125/24/22.1; A55 55/65/150/31/31.8; A65 65/75/175/38/43.1; A75 75/85/200/45/56.2; A100 100/95/200/60/74.3 | https://wirthrail.com/our-products/crane-rails-eu/ (A45 mass typo on the page; the other two figures given agree with 22.1) | Medium–High |
| Capacity series | R10 preferred: 0.63 0.8 1 1.25 1.6 2 2.5 3.2 4 5 6.3 8 10 12.5 16 20 25 32 40 50 63 … t | IS 3177 Annex E-2 | High |
| Span series | no preferred series found; vendors use 7.5, 10.5, … 31.5 (3 m pitch, 1.5 m offset) | bettercrane/yangyu tables | Low |
| Typical duty per capacity | single 1–5 t A3–A4; 5–20 t double A5–A6 (vendor) | bettercrane | Low |

### 2.4 GA drawing conventions
- **Sheet:** A3 landscape 420×297 mm, filing margin 20 mm left, 10 mm elsewhere, title block bottom-right (ISO 5457; snippets via search, not full text — Medium).
- **Line widths:** ISO 128-2 series 0.13 … 2 mm, ratio between wide and narrow lines 2:1 (so 0.5/0.25 or 0.7/0.35) — Medium.
- **Line types:** continuous (thick) visible edges, continuous thin for dimensions/extension/leaders/hatching, dashed for hidden, chain-thin for centre lines.
- **Dimensioning:** extension lines, closed/filled arrowheads, dimension line ≈ 10 mm outside part, text above the line, rotated 90° on vertical dimensions (ISO 129-1 — **not verified by search**; matches the sample).
- **Title block fields:** title, drawing number, scale, date, revision, projection, units, drawn-by/status. ISO 7200 lists 19 fields, 8 mandatory (secondary source) — I use a subset.
- **Scale:** ISO 5455 reduction scales 1:2 1:5 1:10 1:20 1:50 1:100 1:200 1:500 1:1000 (read in a second research document; the standard itself not read). The app picks the largest scale that fits the front elevation and plan together, and a separate (equal or larger) scale for the end view, both printed under each view. **It also uses intermediates (1:25, 1:75, 1:125, 1:150, 1:250, 1:300, 1:400, 1:750) so the sheet is used well. Those are not ISO-preferred scales.**
- **Units:** millimetres throughout the drawing; tonnes and metres on inputs.
- **Projection:** first angle (as in the sample): plan under front elevation, view from the left to the right of front.

---

## 3. Formula and rule table

Every rule in `packages/shared`. IDs appear in code comments (`// F-xx`). **Status** is what the drawing shows: *input* (user typed), *standard* (taken from a standard or catalogue unchanged), *estimate* (everything else).

Notation: `Q` capacity (t), `S` span (mm), `A` duty group number 1–8, `h` girder depth, `W` wheelbase, `Ø` wheel diameter, `g` = 9.81 m/s². `ceilN(x)` = round up to a multiple of N.

| ID | Name | Expression | Source | Conf. | Status |
|---|---|---|---|---|---|
| F-01 | Capacity series | allowed values: IS 3177 R10 series 1…50 t (1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 6.3, 8, 10, 12.5, 16, 20, 25, 32, 40, 50) | IS 3177 Annex E-2 | High | standard |
| F-02 | Type envelope | single girder: Q ≤ 20 t, S ≤ 31.5 m (warn above 16 t or 25 m); double girder: Q ≤ 50 t, S ≤ 35 m (warn below 5 t); both: S ≥ 5 m (warn below 7.5 m), lift 2…30 m | vendor ranges (bettercrane, biey, yuantai) | Medium | — |
| F-03 | Minimum wheelbase | `W ≥ S/8` (hard error) | CMAA 74 §3.6.1 via MHI FAQ | High | standard |
| F-04 | Wheelbase | `W = ceil50(max(S/7, W_min))`, `W_min = 1500 + 50·Q` (single) or `2800 + 40·Q` (double) | S/7: CED Engineering overview (Medium) + catalogue rows; `W_min`: **own fit** to bettercrane 10 t single (2000), LH 10 t double (3200), Yangyu 32 t (≈4000) | Estimate | estimate |
| F-05 | Depth ratio | `r = 18 − 4·(A−1)/7` → h = S/r | Kino L/18…L/14 mapped linearly to A1…A8 | Estimate | estimate |
| F-06 | Girder depth | `h = ceil50(max(S/r, h_min))`, `h_min = 600 + 40·Q` (single), `700 + 25·Q` (double) | S/r: F-05. `h_min`: own fit to bettercrane 10 t single (900…1000 at short span) | Estimate | estimate |
| F-07 | Girder width | `b = ceil10(max(h/2.5, S/50))` | Kino: B ≈ H/3…H/2, ≥ L/50 | Low | estimate |
| F-08 | Deflection limit, camber | info rows: `δ_max = S/888`; `camber ≈ S/1000` | CMAA via og.mhi.org (High); Kino (Low) | High / Low | standard / estimate |
| F-09 | Wheel diameter | smallest IS size in {160, 200, 250, 315, 400, 500} with `0.6 · P_DRS ≥ R_wheel`, `P_DRS` = 68.6, 98.1, 157, 216, 294, 392 kN (7, 10, 16, 22, 30, 40 t × g) | sizes: IS 3177 cl. 8.6.6 (High); ratings: Demag DRS catalogue (Medium); 0.6 utilisation: **own calibration** so the sample (74.8 kN) gets Ø250 | Estimate | estimate |
| F-10 | Mass estimate | `m_double = a + b·S_m`, `b = 0.534 + 0.0103·(Q−10)`, `a = max(0.4, 1.22 + 0.211·(Q−10))` t; `m_single = 0.61·m_double` | fit to LH 10 t and 32/5 t tables (double); 0.61 = sample 8.9 t ÷ model 14.5 t | Low | estimate |
| F-11 | Maximum static wheel load | `R_end = Q·g·(S−a)/S + m·g/2`; `R_wheel = R_end / n_w` | equilibrium of a hook at the approach limit `a` + half the crane mass per end (trolley mass already inside `m`); sample check 68.6 kN vs 74.8 kN (−8 %) | Estimate (formula exact, inputs estimated) | estimate |
| F-12 | Wheels per end | `n_w = 2` if `R_end/2 ≤ 0.6·392 kN` else 4 (bogie, inner pair at 1.6·Ø) | own | Estimate | estimate |
| F-13 | Rail selection | smallest of A45 / A55 / A65 / A75 / A100 with limit ≥ R_wheel (100, 150, 200, 260, 380 kN); user may override (warning if over limit) | eotconnect blog table (not a standard) | Low | estimate |
| F-14 | DIN 536 rail section | head width / height / base width / web from table in 2.3 | wirthrail.com | Medium–High | standard |
| F-15 | End overhang, overall length | `e = Ø/2 + 10`, `L = S + 2·e` | calibrated: sample 25270 − 25000 = 270 with Ø250 | Estimate | estimate |
| F-16 | Overall width | `B = W + Ø + 260` (4-wheel: `W` = outer wheel centres) | sample 4310 − 3800 = 510; bettercrane B = W + 500 | Estimate | estimate |
| F-17 | Girder bottom below rail top | `d = Ø/2 + 55` | bettercrane single (H3 − H1 = 180…325) | Estimate | estimate |
| F-18 | Hoist headroom, single | standard: `1170 + 50·Q` below girder bottom to hook (highest); low-headroom: `520 + 10·Q` | standard: bettercrane (1850 − 180 at 10 t); low: sample 620 mm at 10 t; slope in Q **assumed** | Estimate | estimate |
| F-19 | Hook highest position, double | `d + 100 + 10·Q` below rail top | LH 10 t: H4 − d ≈ 205 | Low | estimate |
| F-20 | Crab height above girder top (double) | `350 + 14·Q` | LH 10 t H = 1350 above rail; girder top ≈ h − d | Low | estimate |
| F-21 | Hook approach | single: `t_wb/2 + 450`, `t_wb = 800 + 60·Q`; double: `600 + 10·Q` | single: biey structure + sample 1150 (450 offset calibrated); `t_wb`: CD1 catalogue values; double: forum/vendor values **disagree 300…1200** | Low | estimate |
| F-22 | Girder centre spacing (double) | `K = 1200 + 25·Q` | LH 10 t (1400…1800), Yangyu 32 t (2000) | Low | estimate |
| F-23 | Elevations | rail top = 0; girder top (single) `h − d`; girder top (double) `h − d`; total headroom = highest point above rail top; highest hook = −(hook offset); floor = highest hook − lift | geometry | — | derived |
| F-24 | Minimum rail height above floor | `lift + hook offset` | geometry | — | derived |
| F-25 | Trolley position | `x = a + (S − 2a)·p`, p = 0…1 | geometry | — | input-derived |

Known weak spots, in order: **F-21 (hook approach)**, F-18/19/20 (hook/trolley vertical envelope), F-10 (mass), F-04/F-06 (`W_min`, `h_min`).

### (b) Questions only a Modern Crane Co engineer can answer (ranked by impact)
1. **Hook approach and headroom** for your standard hoist/trolley models by capacity — in particular is the double-girder hook approach 300–600 mm or ~1200 mm? (every clearance claim to a customer depends on it)
2. Which duty system do you quote in — FEM/ISO groups, CMAA classes, or both — and what is your depth/deflection rule per duty (S/800, S/888, S/1000)?
3. Standard end-carriage designs: wheel count, wheelbase and wheel diameter as a function of capacity/span (is wheelbase fixed by catalogue or by S/7?).
4. Rail types you actually specify (DIN A-rails vs flat bar vs CR) and the rail/wheel-load pairing rule.
5. Typical mass of bridge + trolley by capacity/span (to size wheel loads and give runway loads to the customer).
6. Which parts of the drawing are contractual (dimensions given to the customer) versus schematic?
7. Standard girder section: rolled I-beam, box, or box with rail on top? Standard thicknesses/camber?
8. Do you quote cabin-operated cranes often, and what are the cabin size/clearance rules?
9. Required clearance values to building: wall (the sample says min. 235 mm), roof, side walkway.
10. Target markets/units (metric only? imperial? CMAA in the US?) and drawing standard (first vs third angle).

### (c) Known simplifications
- Single-girder box section and double-girder box girders drawn as plain rectangles; no end-plates, stiffeners, walkways, cable festoons, hoist internals or hook geometry beyond a schematic.
- Symmetric hoist and hook approach (the sample is asymmetric: 920/1150).
- Top-running only; no under-running, no cabin, no gantry/semi-gantry, no twin hoists, no auxiliary hook.
- No structural verification: depth, width and masses are *proportioning heuristics* — the app is a layout tool, not a design check, and says so on every sheet.
- Runway shown as short beam segments with a break symbol; no building.
- Wheel load is a static estimate without dynamic factors.
- No electrical data (power, speeds, voltage) — not geometry.
- DXF is the sheet as plotted (A3 mm, at the printed scale), written as R12 LINE/CIRCLE/TEXT only; dimensions are lines and text, not CAD DIMENSION entities, so they are not associative. Scale by the title-block scale to get full size.
- Projection is fixed to first angle (ISO / the company sample). Third angle (ASME) is not offered.
- Estimated values are marked `*` and drawn with dashed dimension lines and italic text; there is no colour-only meaning.
- Auth is a single 12 h JWT (no refresh token). Reading another user's design id answers 403 (not 404); ids are unguessable cuids, so the leak is the existence of an id, not its content.
- The demo account is shared by everyone who clicks "Try the demo" (it is a public account by design); its seeded designs are reset on every deploy.
