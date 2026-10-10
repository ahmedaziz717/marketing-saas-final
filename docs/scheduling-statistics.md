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
