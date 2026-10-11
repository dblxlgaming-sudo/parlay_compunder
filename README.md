# Parlay Compounder

The Compounder consumes model-produced market artifacts. It does not use Google Sheets and does not control the member site's Home or Full Slate publication pipeline.

## Data flow

```text
Tennis V2 corrected downstream CSV --\
                                      -> Compounder publisher -> compounder-feed.json -> GitHub Pages tool
WNBA frozen market.csv --------------/
```

The receiver preserves model-owned prices and probabilities. It applies only the reviewed LBG core-market classification and Compounder-eligibility rules needed by the existing tool.

Tennis uses `MatchID` as its authoritative event identity because `lbg-tennis-downstream/1` does not supply `EventID`. The receiver does not manufacture one. WNBA uses its supplied `EventID`. Automatic combination exclusion and manual Kelly suppression compare the resulting authoritative event identity.

## Supported source contracts

- Tennis: `lbg-tennis-downstream/1`, using the corrected downstream handoff CSV.
- WNBA: frozen `market.csv`, using `StableRowID` and `EventID` supplied by the model artifact.

Only priced ML, spread, and total markets can enter. Direct American odds, model probability, no-vig probability, model fair odds when supplied, EV availability, line, sportsbook, and provenance are retained.

## Build locally

```powershell
node scripts/build-compounder-feed.mjs `
  --tennis "<corrected-tennis-downstream.csv>" `
  --wnba "<frozen-wnba-market.csv>" `
  --output compounder-feed.json
```

## Sport-agent publication handoff

Each sport agent can advance only its own side of the feed. The publisher retains the latest accepted rows for the other sport.

```powershell
node scripts/publish-compounder-feed.mjs publish --tennis "<corrected-tennis-downstream.csv>" --production
node scripts/publish-compounder-feed.mjs publish --wnba "<frozen-wnba-market.csv>" --production
```

Production publication requires the canonical repository on `main`, a clean worktree, and the expected GitHub origin. It creates a data-only immutable release, updates `compounder-feed.json`, commits only those data paths, pushes `main`, and verifies GitHub Pages.

The Tennis agent can invoke this receiver the same way it invokes the Match Details publisher. The WNBA agent can invoke it from its frozen-run delivery path. Those producer hooks belong to their respective agents; this repository owns the receiver and consumer.

## Line Lab handoff

Use:

```text
https://dblxlgaming-sudo.github.io/parlay_compunder/?market_id=<stable-market-id>
```

The feed loads first, then the exact eligible market is placed in My Parlay and its event date is selected.

## Member site

The member site should link or embed the existing GitHub Pages URL. It should not copy model artifacts or alter the Compounder's feed.
