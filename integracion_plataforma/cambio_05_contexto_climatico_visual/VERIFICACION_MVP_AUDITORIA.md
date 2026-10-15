# INDEPENDENT AUDIT — Cambio 05 MVP (05.1 + 05.6 + 05.7)

**Method: executed, not read.** The two new backend services were run directly with
Node v22.23.2 inside an **isolated sandbox** (copies of the services + the `reference/`
package + the site YAML), so this audit **wrote nothing into the repo store**.
The implementer's `VERIFICACION_MVP.md` was treated as a self-report and reproduced
item by item. Date: 2026-10-02. Auditor driver: `scripts/auditar_cambio05.js`
(project side, not in this repo).

---

## 1. What ran and what it returned

| # | Check (executed) | Result |
|---|---|---|
| A1 | Services load with **Node built-ins only** (`fs, path, https, crypto`) | **PASS** — `getContext, verificarAnclas, clasificar, FUENTES, EST_A_MES` / `guardarVersion, listarVersiones, leerVersion, ultimaVersion, reconstruirEspejo, readManifest, STORE_DIR, FAMILIAS` |
| T1.0 | `getContext({remote:false})` against the shipped seeds | **PASS** — no throw |
| T1.1 | `sitio` anchored to the repo YAML | **PASS** — lat 1.2136 · lon −77.2811 · 2600 m · America/Bogota |
| T1.2 | `modo_vigente` values | **PASS** — `oni=1.8`, `roni=1.36` |
| T1.3 | Classification uses the RONI as label | **PASS** — `clasificacion=nino`, `fuente_clasificacion=RONI` |
| T1.4 | 11 indices, series present | **PASS** — 11 keys present (2076 template months each; declared coverage: oni/roni 919, nino 918, soi 900, pdo 2072, mei 576) |
| T1.5 | `meta` carries sha256 + timestamp + source | **PASS** — `sha256=434ba3242efb45d6`, source `CPC/NOAA · NCEI · PSL` |
| T1.6 | Site climatology read from `exploracion_indices.json` | **PASS** — 88.366 % / 4.9066 kWh·m⁻²·d⁻¹ |
| T1.7 | Roles declared (label vs local predictor) | **PASS** — `etiqueta=roni`, `predictor_local=nino4` |
| T1.8 | No invented asset coordinates | **PASS** — 2 assets, all `lat/lon = null` |
| T1.9 | **Historical anchors** via `verificarAnclas(indices)` | **PASS 4/4** — 1997-12 **+2.37** · 2010-11 **−1.57** · 2015-12 **+2.59** · 2020-11 **−1.11** |
| T2 | **Append-only**: save v1 → v2 → v3 | **PASS** — sha256 of v1 **unchanged** (`ba549f42f18fe09b` → `ba549f42f18fe09b`), 3 distinct files, manifest lists sha256 per version |
| T3 | External source down (stubbed `https.get` → 503) | **PASS (partial, see F1)** — no throw · `stale:true` · still serves 2076 months from the seed/store |

**Cross-implementation check (the strongest one)**: T1.9's four values were computed
independently by the project's **Python** parser (`scripts/descargar_indices.py`, validated
in `reference/`) and are **identical** to the JavaScript service's output.

## 2. Plan-compliance (corrections C1–C4)

| Item | Verified how | Result |
|---|---|---|
| **C1** menu is `App.jsx`, not `Sidebar.jsx` | read the commit diff | **PASS** — `menuItems` gained `{id:'clima', label:t('nav.clima')}`, plus a **real linkable `/clima`** (`pushState` + `popstate`) and an `ErrorBoundary` so a fault cannot take the dashboard down |
| **C2** zero touches to `app.js` | commit file list | **PASS** — `Backend/app.js` is not in the commit |
| **C3** `ClimateChart` at full size, PlotlyMini only as pattern | read the component | **PASS** — new `ClimateChart.jsx` (`height=300`, `minWidth=380`), uses `Plotly.purge → newPlot({responsive:true}) → Plots.resize` |
| **C4** `stale` created (no reusable pattern existed) | T3 + code | **PASS** (with F1) — `stale: !usadoRemoto` |
| §7.11 sizes encoded | read the components | **PASS** — every chart `height={300}` (≥260) with `minWidth=380`; insight cards `min-h-[120px]` |
| §7.12 no charts in modals | grep `src/climate/` | **PASS** — the only `dialog|modal|overlay` matches are **comments stating there are none** |

## 3. What I could NOT reproduce here (declared, not hidden)

1. **`yarn build` / `yarn lint`** — no `node_modules` in this clone (the stack runs in the VM).
   The implementer's numbers (build 18.35 s; 0 lint issues in `src/climate`) remain a
   self-report. The code-level evidence above supports it but does not prove it.
2. **The browser-measured V1–V5** (Chrome headless + puppeteer-core) — not runnable here.
   Their reported minimum 621×300 px is plausible and the components **encode** the
   minimums, but the measurement itself is not independently reproduced.
3. **Criterion 10 (Mongo mirror rebuild)** — no local Mongo. The implementer already
   declared it as *not measured*; I confirm it is **not verified**.

## 4. Findings

**F1 — real spec gap (minor): the age field does not exist.** `VERIFICACION_MVP.md` claims
the fallback returns *"200 + `stale:true` + `antiguedad`"*. Executed: `stale:true` ✓ but
`antiguedad` is **absent** — a grep of the service finds only `stale: !usadoRemoto`
(line 191); nothing computes an age, and the payload has no such field.
Plan §3.6 rule 5 requires *"the last stored version with `stale:true` **and its age**"*.
**Fix (≈3 lines):** expose `antiguedad` from the store manifest (the `descargado_en` of the
last version of the family, or the last successful remote fetch timestamp).
Severity: low — the criterion's core (never serve an empty chart) is met.

**F2 — robustness nit:** `verificarAnclas()` throws `TypeError: Cannot read properties of
undefined (reading 'mes')` when called without its argument. A `if (!series?.mes) return []`
guard would make it safe to call from a health check. Severity: low.

**F3 — cosmetic:** the index arrays are 2076 entries long with per-index coverage holes
(the template spans further back than each source's history). Harmless, but the frontend
must not plot raw length without masking `null`/`NaN`.

## 5. Verdict

**MVP accepted.** Every claim I could execute reproduces, including the two that mattered
most: the **four historical anchors** (cross-checked against an independent Python
implementation) and the **append-only store** (byte-identical first version after further
writes). The corrections C1–C4 were applied as specified.

**Pending before closing:** F1 (add the age to the degraded response). F2/F3 are optional.
The 3 items in §3 stay as the implementer's self-report until they are run in the VM.
