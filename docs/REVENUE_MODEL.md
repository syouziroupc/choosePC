# Revenue Model — Draft 0.9

This is a planning model, not a promised forecast. All assumptions must be replaced with observed data after launch.

## 1. Revenue pillars at launch

1. **Own PC sales** — user asks 正二郎商事 to source/supply a suitable PC.
2. **Affiliate purchases** — when the best-ranked suitable offer is available through an affiliate program.
3. **Buyback and resale** — selected sell/replace leads can become inventory.
4. **Repair / upgrade** — KEEP/UPGRADE/REPAIR decisions can generate service work.
5. **Accessories** — secondary affiliate opportunities after the primary decision.

Later pillars: sponsorship with explicit separation, corporate replacement leads, external buyback leads, B2B widget/API. These are excluded from launch forecasts.

## 2. Formula

```text
affiliate = sessions * diagnosis_start_rate * diagnosis_completion_rate * offer_click_rate * external_purchase_cvr * average_commission
own_sales = sessions * purchase_consultation_rate * purchase_close_rate * average_own_sale_gross_profit
repair = sessions * repair_lead_rate * repair_close_rate * average_repair_gross_profit
buyback = sessions * buyback_lead_rate * buyback_close_rate * average_resale_gross_profit
```

## 3. Planning scenarios per 1,000 sessions

### Conservative

- diagnosis start 25%; completion 65%; offer click 18%; external purchase CVR 2.5%; average commission ¥2,500
- purchase consultation 0.30%; close 20%; own-sale gross profit ¥7,000
- repair lead 0.20%; close 30%; repair gross profit ¥4,000
- buyback lead 0.10%; close 25%; resale gross profit ¥7,000

Estimated gross contribution: **about ¥10,200 / 1,000 sessions**.

### Base

- diagnosis start 35%; completion 72%; offer click 25%; external purchase CVR 3.5%; average commission ¥3,000
- purchase consultation 0.60%; close 30%; own-sale gross profit ¥9,000
- repair lead 0.40%; close 45%; repair gross profit ¥5,000
- buyback lead 0.25%; close 35%; resale gross profit ¥8,000

Estimated gross contribution: **about ¥38,800 / 1,000 sessions**.

### Strong execution

- diagnosis start 45%; completion 78%; offer click 32%; external purchase CVR 5.0%; average commission ¥3,500
- purchase consultation 1.00%; close 35%; own-sale gross profit ¥10,000
- repair lead 0.60%; close 50%; repair gross profit ¥5,500
- buyback lead 0.40%; close 40%; resale gross profit ¥9,000

Estimated gross contribution: **about ¥85,600 / 1,000 sessions**.

## 4. Base-case scale illustration

| Monthly sessions | Gross contribution planning model |
|---:|---:|
| 1,000 | ~¥38,800 |
| 5,000 | ~¥194,000 |
| 10,000 | ~¥388,000 |
| 20,000 | ~¥776,000 |
| 50,000 | ~¥1,940,000 |

This is not net profit. It excludes inventory funding, returns, labour, taxes, advertising, payment costs, AI/API costs and infrastructure.

## 5. Gaming laptops

Gaming laptops are measured separately because ticket size, affiliate commission amount, URL-check intent, and potential used-device buyback economics may differ materially from general laptops. The dashboard must prove or reject this using observed conversion and contribution by category.

## 6. Revenue guardrail

Evaluation/ranking code must not import or query commission percentage, expected commission, or merchant payout tier. Only after ranking is frozen may commercial metadata be attached.
