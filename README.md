# Parlay Compounder

The Compounder consumes model-produced market artifacts. It does not use Google Sheets and does not control the member site's Home or Full Slate publication pipeline.

## Production data flow

```text
Sport models -> Publisher qualification/publication -> public-feed.json -> GitHub Pages tool
```

The production client reads the Publisher contract directly:

```text
https://lbg-todays-board.univursmusic.chatgpt.site/public-feed.json
```

Contract: `triple-threat-compounder-feed/1`. The endpoint chooses the active America/Phoenix board date. A specific published board can be requested with `?date=YYYY-MM-DD`.

The Compounder does not calculate qualification. It accepts only records whose authoritative `compounderEligibility` is exactly `ELIGIBLE`. `selectionId` is the stable selected-outcome identity; `eventId` drives same-event protections. Prices, probabilities, classifications, dates, and provenance are preserved from Publisher.

The last successfully validated publication is retained in browser storage. A network failure, an unavailable response, or an unpublished `db-0` response cannot replace it. A genuinely published slate with zero eligible markets is accepted and displayed as a valid empty pool. Saved legs are revalidated against every accepted replacement slate.

The legacy local artifact builders remain available for source-contract testing and recovery, but `compounder-feed.json` is no longer the production default.

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

`market_id` must use Publisher `selectionId`. A non-default compatible endpoint can be supplied as an HTTPS-encoded `feed` query parameter:

```text
https://dblxlgaming-sudo.github.io/parlay_compunder/?feed=https%3A%2F%2Fexample.com%2Ffeed.json&market_id=<selectionId>
```

## Member site

The member site should link or embed the existing GitHub Pages URL. It should not copy model artifacts or alter the Compounder's feed.
