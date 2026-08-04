# Parlay Compounder

## Publish

1. Create a new GitHub repository.
2. Upload `index.html` and `parlay-lab.js` to the repository root.
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Use the generated GitHub Pages URL in Glide's Web Embed component.

Both site files must remain together. `index.html` loads `parlay-lab.js` using a relative path.

## Live Google Sheets feed

The calculator automatically loads the published `Market Edge View` CSV feed configured in `parlay-lab.js`. Users do not paste or manually edit candidate values. The **Refresh Google Sheet** button reloads updated bookmaker odds, breakeven values, and model values.

The feed uses columns A:L:

1. MatchID
2. Player A
3. Player B
4. Market
5. Pick/Side
6. Breakeven %
7. No-Vig Prob
8. Model Prob
9. Edge %
10. Confidence
11. Model Fair Odds
12. Breakeven Edge

The currently configured feed is public. Do not add private or sensitive columns to the published sheet.
