# FICO MANA — final-artifact local performance audit

Measured 2 October 2026, raw capture at00:14:10UTC /08:14:10Asia/Manila. Optimized isolated artifact **G_49QPnFspJYRESLpAIja**, Chrome154,1440×900, existing loopback3200server warm, unthrottled CPU/network, three fresh contexts per surface. Browser routing disables HTTP cache; every API is fulfilled synthetically and external origins blocked. Both review browsers were closed/waiting during this nine-context run. No production records, transfers or provider calls occurred.

Runner: `scripts/qa-operational-performance.mjs`, with `QA_PERFORMANCE_OUTPUT=test-results/operational-performance-2026-10-02.json`. All nine observations are retained; the1Octoberartifact was not overwritten. Runner exited0. **9/9passed,42/42APIattempts completed,0failed/pending,0unexpected mutations/external requests/runtime errors.** The console's existing automatic sync POST is fulfilled locally, never sent to the app server.

## Measurements

Times include navigation, automation and visible/correct/focusable assertions, not pure render time or hosted latency. Search includes250msdebounce.

| Operation,ms | Trial1 | Trial2 | Trial3 | Median | Earlier optimized median |
|---|---:|---:|---:|---:|---:|
| Admin → correct attention action focused |392.44|321.20|356.00|**356.00**|344.91|
| Keyboard search → correct result focused |355.71|351.92|352.93|**352.93**|372.13|
| Editor → correct next-task action focused |257.15|228.49|225.02|**228.49**|238.72|
| Files → correct originals folder focused |234.79|251.29|228.87|**234.79**|246.56|
| Folder activation →500rows + search focused |205.76|187.38|177.18|**187.38**|187.06|
| Local file filter → correct single row |197.49|203.48|188.76|**197.49**|209.04|

Earlier medians use the same runner/fixtures on1Octoberartifact `kTBGuaRwla6df94Wb1baT`, not an unmodified pre-feature implementation. Small differences across these three-sample runs do not establish a causal speedup/regression. No sample was discarded. New Workspace has no comparable pre-change route baseline; earlier optimized core209.40ms / secondary33.58ms remain historical, not remeasured on this final artifact. Development527.11msversus optimized209.40ms is not a code before/after improvement.

## Cost and rendering boundaries

Admin/search6completedAPIrequests/context; Editor4; Files4. Files filtering is local, with no extra API request.500metadata rows represent2.62GBofphotos but only73,517UTF-8bytesoflistJSON: no binary photos transferred/decoded/opened. Not ZIP throughput or large-image-cache reliability evidence.

Observed encoded JavaScript: Admin290,534–302,151bytes depending on prefetch timing; Editor248,898; Files265,046. CSS42,521encodedbytes. Actual Resource Timing observations, not a bundle-coverage certificate. Layout-shift max-session windows: Admin0 /0.01612 /0.01612; Editor/Files0 in all samples. No field CWV distribution established.

Implemented low-cost architecture: bounded parallel read-only aggregation; fast Workspace core before independent details; timeout/capability/workspace scoping; debounced abortable search/stale guards; memoized queue grouping/filtering; existing metadata caches/private local image caching. No load balancer, paid service or billing change introduced for local fixture operations below0.4seconds.

Earlier100-concurrent synthetic attention-reader test established700metadataqueries/100reads, not100real users completing bookings/production capacity. No hosted capacity, p95/p99, physical-device acceptance or current provider-cost claim.

## Decision

No demonstrated slow primary local operation warrants speculative infrastructure. Keep evidence reproducible and verify authenticated logs/domains during the later authorized release. Performance alone does not satisfy the full quality gate or authorize promotion.
