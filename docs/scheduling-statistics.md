# Live scheduling analysis, version 2

The account and date range are run inputs. No imported history is used. Daily
and hourly account Insights request actions and action_values, account
attribution, and action_report_time=impression, since the question is ad delivery
rather than the time a later purchase occurs. These numbers may differ from
conversion-date reports. Both requests have the same account/date/attribution.

## Metric and confidence definition

The explicit analysis objective is **lowest cost per attributed purchase**.
Revenue, ROAS and click metrics are descriptive, not the statistical objective.
There is no overall confidence merging weekday and hourly questions.

For each observed period i, model K_i ~ Poisson(S_i \* lambda_i), with purchase
count K_i and fixed spend exposure S_i. Use independent Jeffreys rate priors
p(lambda_i) proportional to lambda_i^(-1/2). Posterior lambda_i | K_i,S_i is
Gamma(shape=K_i+1/2, rate=S_i). Units are purchases per account-currency unit.
The posterior is proper for positive exposure, including zero-purchase periods.

Choose the observed lowest-CPA period (max K_i/S_i), then report its posterior
probability of having the largest rate against ALL observed, comparable periods.
This accounts for uncertainty across the entire comparison set; it is not a
selected pairwise p-value. Every period's probability is available. Equal
observed-rate ties have deterministic label ordering but no claim of uniqueness.

40,000 fixed-seed Monte Carlo draws use the Marsaglia–Tsang gamma algorithm and
the shape<1 augmentation identity. Same evidence yields identical output; label
sorting makes source row order irrelevant. Numerical probability standard error
is sqrt(p\*(1-p)/40000), at most .0025. This is Monte Carlo error, not model error.
95% equal-tail CPA credible intervals invert the posterior rate quantiles. UI
never claims exactly 100% certainty based on a finite number of draws.

This is a **model-conditional Bayesian probability**, not a frequentist
confidence level, a probability of profit, causal lift or future success.
Independent event counts and constant rates conditional on spend may not hold:
Meta modelling, repeat purchases/users, audience/campaign mix, overdispersion,
seasonality and non-random delivery are not controlled. The report states these
limitations visibly. No guaranteed improvement or automatic scheduling follows.
Aggregate revenue cannot identify order-value variance, so we do not fabricate
ROAS confidence intervals or reuse CPA confidence for ROAS.

## Missing data and test policy

No 14-day cutoff enters the calculation. A one-week report may yield numeric
probabilities, with a separate warning that each weekday occurred once. A test
candidate requires posterior probability >=95%; weekday candidates additionally
require repeated observations for every compared weekday. These are conservative
product decision rules, not statistical calibration or a change to probability.
Hourly aggregates cannot establish repeat-day stability; state this explicitly.

All-zero purchases, <2 spend-positive periods, missing metrics, zero-spend
purchases, partial coverage, negative/invalid or fractional counts yield null
(not 0%) confidence and a precise explanation. Zero-spend/zero-purchase periods
are outside the comparison set, and no claim covers unobserved periods.

Use one purchase action definition across all rows (prefer website pixel
purchase, then omni_purchase, then purchase); never sum overlapping aliases.
Hourly purchase confidence is withheld unless hourly delivery and purchase
totals reconcile with the daily report. Meta may omit zero-action rows: they
are zero-filled ONLY when known hourly conversions already sum to complete
daily conversions and delivery also reconciles. Value reconciliation is
separate. Missing/suppressed metrics otherwise remain unknown.

Only Meta code 100 referencing action fields/breakdowns permits a traffic-only
fallback, labelled explicitly. Authentication, rate-limit and network failures
propagate and never fall back to imported data. Hourly purchase fields are
actually requested; traffic never substitutes for purchase efficiency.

## References

- Meta Insights breakdowns: https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/breakdowns.md/
- Meta report time and attribution: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights.md/
- Stan posterior simulation and Gamma–Poisson conjugacy: https://mc-stan.org/docs/2_23/stan-users-guide/posterior-predictive-simulation-in-stan.html

## Validation

Unit tests cover symmetry, increased evidence, currency rescaling, input order,
missing/zero/fractional counts, and analytic two-Gamma comparisons (via the Beta
CDF identity). API tests cover requested conversion fields, impression date,
conversion reconciliation, omitted vs zero values, unsupported fields and
non-fallback failures. Integration tests run the real quote/run/worker path
without paid generation and confirm the paused historical import is untouched.

## Building and inspecting the workflow

Use Optimize → Workflows → **Meta scheduling analysis**, or assemble the same public nodes:

| Step                                       | Add from          | User-controlled settings                                                       | Output                                                         |
| ------------------------------------------ | ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Account & date range                       | Fields            | Connected account and dates at run time; optional saved/locked defaults        | Typed account/date request                                     |
| Fetch live Meta performance                | Steps → Meta Ads  | Daily only or daily + hourly                                                   | Fresh account-level evidence, timezone, currency and coverage  |
| Optimization engine → Scheduling optimizer | Steps → Engines   | Weekdays, hours or both; test probability; observed dates required per weekday | Separate model probabilities, CPA intervals and proposed tests |
| Output                                     | Steps → Utilities | Connect analysis to Results                                                    | Inspectable report retained in run history                     |

The canvas displays configuration summaries even after a run. Each scheduling step has Receives/Produces instructions and saved input/output data inspection. No AI prompt is necessary for the statistical calculation. Save workflow retains a draft; publishing an App remains separate.

The analysis objective is currently **lowest cost per attributed purchase**. Other objectives are not offered as if supported. The probability threshold defaults to 95%, and weekday test readiness requires at least two observed dates per compared weekday. These are decision rules: changing either does not change the posterior probability. Settings are recorded in each report. Requesting hourly analysis with daily-only fetching is rejected with instructions to correct the two settings.

### Compatibility and execution

Legacy standalone scheduling drafts are adapted on read to include an explicit fetch step, retaining existing node IDs and custom settings. The adapter is idempotent and does not write database rows. Published legacy App versions preserve their original fetch contract, as do already-running snapshots. Newly published explicit workflows retain their four public steps. A nested explicit fetch may accept already-fetched live Meta evidence; the account is still checked against the current workspace. Historical import evidence is not silently treated as a live account/date request.

The fetch step uses the existing bounded daily/hourly reader, account attribution and impression-date reporting. It never queues or resumes historical imports. Daily-only fetching skips the hourly API request. Quotes for this four-step workflow remain zero AI credits. Scheduling analysis never expands into paid copy generation, and it never mutates advertising delivery or budgets.
