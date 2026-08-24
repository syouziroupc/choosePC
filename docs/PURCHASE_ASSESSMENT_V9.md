# Purchase assessment v9

The public purchase judgement is intentionally based on two customer-facing criteria only:

1. **Price**: how the listed price compares with available market evidence.
2. **Performance fit**: whether the PC meets the selected use case requirements.

Internal diagnostic scores such as hardware composition, condition, longevity and risk are retained for compatibility and operations, but they do not directly change the purchase verdict.

Known hard failures still override the two axes. Examples are an essential use-case requirement below minimum or a known insufficient desktop PSU. Unknown essential evidence returns an insufficient-data verdict rather than guessing.

`result.purchaseAssessment` is the stable public summary:

```json
{
  "price": {
    "score": 78,
    "verdict": "good",
    "marketAvailable": true,
    "fairPriceJpy": 50000
  },
  "performanceFit": {
    "score": 84,
    "verdict": "sufficient"
  },
  "weaknesses": [
    {
      "code": "acceptable:ramGb",
      "metric": "ramGb",
      "label": "メモリ容量",
      "severity": "notice",
      "message": "メモリ容量は最低目安を満たしていますが、推奨水準までは余裕がありません",
      "actual": 8,
      "minimum": 8,
      "preferred": 16
    }
  ]
}
```

If trusted or caller-supplied market evidence is unavailable, `price.score` is `null`, `price.verdict` is `unknown`, and the service does not invent a good/bad price judgement. Performance fit remains available independently.

The legacy `scores.overall` field remains for compatibility, but from engine v0.3 it is simply the mean of `fit` and `value`. New user interfaces should use `purchaseAssessment` instead of the legacy score vector.
