# choosePC Reference-Driven Redesign Plan

Version: 2026-08-14
Status: implementation blueprint
Depends on: `docs/CSS_DESIGN_RESEARCH_STANDARD.md`

## 0. Core rule

The next redesign is **not an AI-original visual design exercise**.

AI may implement, test, measure and adapt the interface, but it must not invent the visual language from a blank page. The implementation must be traceable to proven interaction/layout patterns from real production websites and to the research base already documented in `CSS_DESIGN_RESEARCH_STANDARD.md`.

This document defines:

1. which real sites are reference sources,
2. exactly which patterns are borrowed from each,
3. which patterns are explicitly rejected,
4. the desktop and mobile page compositions,
5. concrete CSS geometry/tokens,
6. component-by-component design rules,
7. anti-AI failure gates,
8. screenshot acceptance criteria.

This is a structural reference plan, not permission to copy another site's source code, brand assets, copyrighted graphics, distinctive trade dress, or text verbatim.

---

# 1. Reference-site strategy

No single reference site is suitable for the whole product. choosePC combines a consumer decision tool, a technical specification evaluator, and a shopping comparison surface. Therefore the design should be assembled from several proven patterns.

## 1.1 PCPartPicker — primary reference for dense technical comparison

Reference role:

- dense but orderly technical information,
- row-based comparison,
- clear price prominence,
- one major task occupying most of the page,
- high information density without turning every datum into a card,
- technical utility first, decoration second.

Borrow:

- wide desktop work area,
- consistent columns for repeated items,
- product/comparison rows rather than card grids,
- price/action separation,
- predictable alignment between comparable items,
- compact but readable metadata.

Do not borrow:

- branding,
- exact colour palette,
- exact table styling,
- any copyrighted text/assets,
- layout elements irrelevant to choosePC.

choosePC application:

- offer comparison rows,
- detailed PC specification presentation,
- desktop width strategy,
- scanning rhythm.

## 1.2 Kakaku.com — reference for Japanese information density

Reference role:

- Japanese consumer users are comfortable with substantially higher information density than a generic Western SaaS landing page,
- price/specification information is allowed to be visible rather than hidden for the sake of minimalism,
- labels and values can be compact if alignment and hierarchy are strong.

Borrow:

- price as a strong visual datum,
- compact label/value presentation,
- specification-oriented scanning,
- dense information arranged with repeated alignment lines,
- obvious distinction between core buying information and secondary explanation.

Do not borrow:

- advertising density,
- clutter caused by commercial navigation,
- excessive link density,
- legacy visual styling,
- exact navigation structure.

choosePC application:

- result evidence,
- market-price evidence,
- spec tables,
- desktop information density calibration.

## 1.3 GOV.UK Design System / service forms — reference for input flow

Reference role:

- explicit labels,
- strong question/action hierarchy,
- helper text that does not compete with the task,
- predictable error/validation placement,
- task-first pages,
- forms that remain understandable without decorative containers.

Borrow:

- label immediately above the field,
- short hint directly attached to the relevant field,
- clear error placement,
- one dominant primary action,
- semantic spacing instead of card borders,
- plain language.

Do not borrow:

- GOV.UK branding,
- exact typography/colour,
- government-specific navigation.

choosePC application:

- URL entry,
- manual specification entry,
- missing-information repair flow,
- validation errors.

## 1.4 Wirecutter — reference for decision-first result hierarchy

Reference role:

- conclusion before exhaustive evidence,
- strong recommendation sentence,
- supporting explanation after the decision,
- product identity + key reasons + next action as a coherent unit.

Borrow:

- verdict-first reading order,
- one clear summary sentence,
- evidence progressively disclosed below,
- separation of recommendation from technical explanation.

Do not borrow:

- editorial brand style,
- photography treatment,
- prose tone,
- exact article layout.

choosePC application:

- purchase verdict header,
- first 400–600 vertical pixels of result page,
- recommendation explanation.

## 1.5 Notebookcheck — reference for technical evidence depth

Reference role:

- detailed device/spec evidence,
- technically serious presentation,
- dense information made navigable through headings and tables,
- technical claims visibly separated from conclusions.

Borrow:

- clear evidence sections,
- specification tables when data is genuinely tabular,
- technical labels,
- compact comparison of CPU/GPU/memory/storage facts.

Do not borrow:

- article-page clutter,
- advertising,
- exact colour/typography,
- excessive benchmark detail where the user does not need it.

choosePC application:

- detailed evidence view,
- 'why this verdict' section,
- optional benchmark/spec drill-down.

## 1.6 Can You RUN It / similar diagnostic services — reference for task framing only

Reference role:

- users arrive with one concrete question,
- diagnostic result should clearly answer pass/fail/uncertain before explanation.

Borrow:

- question-first framing,
- result state as an unmistakable status,
- minimum necessary user input before diagnosis.

Do not borrow:

- ad-heavy composition,
- download prompts,
- visual branding,
- oversimplified technical claims.

choosePC application:

- initial entry screen,
- verdict semantics.

---

# 2. Research-to-design mapping

The implementation must explicitly connect design decisions to the research base.

## 2.1 Global composition before detail

Research basis:

- Tuch et al. (2012): visual complexity and prototypicality affect first impressions extremely quickly.
- Thielsch & Hirschfeld (2010): coarse/global spatial information contributes to website aesthetics.
- Reinecke et al. (2013): colourfulness and visual complexity predict first-impression ratings.

Design consequence:

- fix the 1920px silhouette first,
- then typography,
- then spacing/alignment,
- then component styling,
- colour tuning last.

A redesign that changes button styling but preserves the same weak global silhouette is automatically rejected.

## 2.2 Structure before colour

Research basis:

- Seckler, Opwis & Tuch (2015): structural factors affected more aesthetic dimensions than colour factors.

Design consequence:

- no palette-first redesign,
- no 'make it more premium with a new blue',
- no gradients as a substitute for hierarchy.

## 2.3 Deliberate density, not maximal whitespace

Research basis:

- Coursaris & Kripintris (2012): excessive whitespace can reduce perceived usability.
- Reinecke & Gajos (2014): preferred complexity varies substantially across users/cultures.
- Cyr & Trevor-Smith (2004): Japanese, German and US websites differ measurably in visual characteristics.

Design consequence:

- wide screens must contain useful composition,
- Japanese information density may be higher than generic SaaS layouts,
- whitespace must communicate grouping or emphasis, not merely 'cleanliness'.

## 2.4 Alignment and grouping over boxes

Research basis:

- Altaboli & Lin (2011): balance, unity and sequence affect aesthetic ratings.
- Tüchler et al. (2021): alignment structure affects aesthetics/usability ratings.
- Ben-Av, Sagi & Braun (1995): proximity is a strong grouping cue.
- Niemelä & Saariluoma (2003): layout attributes influence recall.

Design consequence:

- use stable alignment lines,
- internal spacing < external spacing,
- borders only when a true boundary exists,
- no box around every semantic group.

## 2.5 Typography is layout

Research basis:

- Ling & van Schaik (2006), Shaikh & Chaparro (2005), Rello et al. (2016), Schmidt et al. (2009).

Design consequence:

- minimum normal UI copy target: 15–17px desktop,
- helper/meta target: 13–14px,
- mobile does not solve width by reducing core text to 9–11px,
- line length and line-height are controlled by role.

## 2.6 AI-specific failure controls

Research basis:

- UI-Bench (Jung et al., 2025): weaker generated interfaces converge on generic templates, repetitive cards, generic controls and weak responsiveness.
- Shin et al. (2026): frictionless vibe coding can homogenize design and reproduce dominant defaults.
- Design Theater (Imteyaz et al., 2026): stated design rationale and rendered implementation diverge substantially; generated interfaces converge in appearance/layout.

Design consequence:

- no acceptance based on written rationale,
- no AI-original blank-canvas design,
- require real-site references per component,
- require screenshot pairwise review,
- require multiple viewport renders,
- implementation model cannot be sole evaluator.

---

# 3. Current screenshot diagnosis

Based on the current 1920px home and purchase-result screenshots:

## 3.1 Home page failures

- content occupies too little of the 1920px viewport,
- type is physically small relative to viewport,
- large empty right/bottom regions do not perform a compositional role,
- the header is visually stronger than the product task,
- URL entry and CTA are too visually weak,
- criteria information reads like an administrative table,
- repeated horizontal rules make the product feel bureaucratic,
- the footer appears before the bottom of a 1080px screen, then leaves a large blank region.

## 3.2 Result-page failures

- result and evidence are too small for a decision screen,
- two-column good/warning summary has weak focal hierarchy,
- recommendation rows are visually under-weight and feel like plain text separated by rules,
- price is not sufficiently dominant relative to metadata,
- actions sit far to the right with weak relationship to the product row,
- the page resembles a printed report scaled down inside a browser rather than an interactive buying tool,
- detailed criteria appears too close in hierarchy to the actual buying decision.

---

# 4. New visual architecture

## 4.1 Desktop shell

Target viewports:

- primary design canvas: 1920×1080,
- secondary: 1440×900 and 1366×768,
- responsive audit: 768×1024 and 390×844.

Desktop shell:

```css
:root {
  --shell-max: 1360px;
  --reading-max: 760px;
  --gutter-desktop: 32px;
  --gutter-tablet: 24px;
  --gutter-mobile: 16px;
}
```

At 1920px, 1360px content occupies ~71% of viewport width. This is deliberately much more substantial than the current narrow composition while still preserving readable margins.

The exact shell may move between 1320 and 1440px after screenshot review. AI must not change it merely to make implementation easier.

## 4.2 Primary alignment lines

Desktop pages use only these major horizontal alignment lines:

1. shell start,
2. primary task content start,
3. task content end,
4. optional evidence/meta column start,
5. shell end.

No section may invent a new arbitrary left edge unless its content type requires it.

## 4.3 Columns

Home initial state:

- 12-column underlying grid,
- primary task occupies 8–9 columns,
- secondary explanatory content occupies 3–4 columns only where it adds immediate value,
- no persistent diagnostic sidebar.

Result state:

- verdict and primary evidence use full main width,
- comparison list uses full available width,
- optional detailed evidence may use an asymmetric 8/4 split below the primary decision section.

50/50 columns are prohibited unless the content genuinely has equal importance.

---

# 5. Concrete type system

Use Japanese system fonts or a locally available production-safe Japanese sans stack. Do not introduce a decorative webfont merely for novelty.

Starting scale:

```css
:root {
  --text-xs: 13px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-md: 18px;
  --text-lg: 22px;
  --text-xl: 28px;
  --text-2xl: 36px;
  --text-3xl: 44px;
}
```

Roles:

- brand: 20–22px / 700,
- nav: 14–15px / 500–600,
- eyebrow/context: 13–14px / 700,
- H1: 40–44px desktop, 30–34px mobile,
- H2: 26–30px desktop, 22–26px mobile,
- H3: 19–22px,
- body: 16px,
- label: 15px / 600–700,
- meta/helper: 13–14px,
- verdict: 38–46px desktop,
- product price: 26–32px desktop.

Weight policy:

- allowed default weights: 400, 500/600, 700,
- do not use 800 everywhere,
- no bold helper text unless semantically required.

Line-height:

- H1/verdict: 1.15–1.25,
- H2/H3: 1.25–1.4,
- body Japanese prose: 1.65–1.8,
- dense data rows: 1.4–1.55.

Hard gate:

- no normal user-facing content below 13px,
- no mobile task text below 14px,
- exceptions require explicit justification.

---

# 6. Spacing system

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;
}
```

Rules:

- field label → input: 8px,
- input → hint/error: 8–12px,
- related fields: 20–24px,
- section heading → content: 16–24px,
- major sections: 48–64px,
- page H1 → main task: 28–36px,
- result verdict → evidence: 32–48px.

Do not use the same padding on every section. Consistency comes from the spacing scale, not identical containers.

---

# 7. Colour system

The current dark blue may remain as the brand anchor, but the page must not become 'blue + pale blue cards'.

Starting roles:

```css
:root {
  --page: #ffffff;
  --surface-subtle: #f5f7f9;
  --ink-strong: #16202a;
  --ink: #2f3a43;
  --ink-muted: #5f6b75;
  --rule: #d8dee4;
  --brand-deep: #103b56;
  --action: #0b6e9f;
  --action-hover: #07597f;
  --positive: #18794e;
  --warning: #a45f00;
  --danger: #b42318;
  --focus: #147eb3;
}
```

Rules:

- page background remains white,
- no gradient,
- no decorative colour blobs,
- pale semantic backgrounds only for genuine result/alert regions,
- not every section gets a background,
- one primary action colour,
- semantic colours must include labels/icons, never colour alone.

---

# 8. Border, radius and shadow policy

## Border

Allowed:

- inputs,
- table header/body separation where tabular semantics exist,
- major section delimiter,
- result status accent,
- focus/validation states.

Disallowed by default:

- border around every section,
- border around every explanation group,
- border merely because whitespace feels empty.

## Radius

Starting values:

```css
:root {
  --radius-control: 3px;
  --radius-small: 2px;
}
```

- ordinary content containers: 0px,
- inputs/buttons: 2–4px,
- no 12/16/24px universal card radius,
- pill shape only for genuine status/tag semantics.

## Shadow

- page content: zero box shadows,
- only overlays/popovers/dialogs may use elevation shadows.

---

# 9. Home page — exact composition

## 9.1 Header

Reference: technical utility sites rather than SaaS marketing headers.

Desktop:

- 64px high,
- full-width dark brand bar,
- internal width follows 1360px shell,
- brand left,
- 3–4 concise navigation links right,
- nav 14–15px,
- no giant header padding,
- no segmented tab-like borders around every nav item.

The header must not visually dominate the diagnosis task.

## 9.2 Intro/task block

Reference: GOV.UK task clarity + diagnostic-service question framing.

Order:

1. small context label `購入前チェック`,
2. H1 `このパソコン、買って大丈夫？`,
3. one short explanatory paragraph,
4. primary URL field,
5. primary button,
6. manual-entry text link,
7. compact supported-site note.

Desktop geometry:

- top padding from header: 52–64px,
- H1 max width ~820px,
- explanatory paragraph max width ~760px,
- URL row target width 880–1040px,
- input height 52px,
- CTA height 52px,
- CTA width 160–190px.

No surrounding card.
No pale panel behind the form.
No decorative icon.
No three-card feature row.

## 9.3 Workflow alternatives

Current purchase/replacement/sell alternatives must not compete with the initial task.

Use a simple secondary navigation row below the primary input area:

`購入前チェック` | `買い替えチェック` | `売却チェック`

Rules:

- no equal-height feature cards,
- no descriptive subtitles inside tabs on desktop,
- active state uses text weight + underline/bottom rule,
- 44–48px interaction height,
- this row begins only after the primary task is visually established.

## 9.4 What is checked

Reference: Kakaku.com/Notebookcheck information density, not an FAQ card grid.

Use a definition-list / specification-list structure:

- CPU・GPU — 用途に必要な処理性能
- メモリ・ストレージ — 容量不足の可能性
- 販売価格 — 相場との比較
- 中古状態 — 確認可能な状態情報
- 判定信頼度 — 根拠データの充足度

Desktop:

- full main column width,
- label column 180–220px,
- explanation column flexible,
- 15–16px text,
- selective separators only,
- section heading 26–28px.

This should resemble a concise specification/reference section, not a dashboard.

## 9.5 Footer behavior

- page shell uses `min-height: 100svh`,
- short pages keep footer at viewport bottom,
- footer does not appear halfway down a 1080px screenshot,
- footer height approximately 120–160px depending on content,
- no large blank region below footer.

---

# 10. Manual specification input — exact composition

Reference: GOV.UK forms.

Desktop:

- one main column, target form measure 820–980px,
- labels above fields by default,
- fieldset only where semantic grouping truly matters,
- no spreadsheet-style 3-column `label | input | help` for every field,
- hint under label or input,
- optional advanced fields collapsed until requested.

Example:

```text
CPU
[ Intel Core i5-8365U                         ]
型番が分かる場合はそのまま入力してください。

メモリ
[ 8 ] GB

ストレージ
[ 256 ] GB   [ SSD ▼ ]
```

Why:

- the current row grid is visually administrative,
- labels above fields are more robust on intermediate/mobile widths,
- helper text becomes attached to the relevant control rather than a third table column.

Primary submit button:

- 180–240px desktop,
- 52px high,
- clearly filled,
- placed directly after the final essential field,
- optional data must never visually block diagnosis.

---

# 11. Purchase-result page — exact composition

## 11.1 Verdict first

Reference: Wirecutter decision-first hierarchy + diagnostic pass/fail framing.

First viewport must answer the question immediately.

Order:

1. context label `購入判定`,
2. verdict headline,
3. one-sentence interpretation,
4. key evidence list,
5. price status if known,
6. next action.

Example structural hierarchy:

```text
購入判定
購入候補に残してよいPCです
用途には合っています。価格だけ相場と比較して最終確認してください。

性能      十分
メモリ    十分
価格      要確認
情報量    十分
```

The four evidence items are not four rounded cards. Use aligned rows/labels or compact inline evidence with strong text hierarchy.

Verdict styling:

- 38–46px,
- status colour accent as a 4–6px vertical rule or small semantic marker,
- no huge score number,
- no fake precision.

## 11.2 Good/warning evidence

Current equal 50/50 columns are removed.

Preferred structure:

```text
確認できたこと
✓ CPUは用途の推奨目安を満たす
✓ メモリ容量は十分

購入前に確認
! 価格は近い構成と比較
! 販売価格は最終確認が必要
```

Desktop may use two columns only if both blocks have enough content and the layout remains balanced. Otherwise stack them.

- headings 19–21px,
- body 15–16px,
- no border box,
- grouping by spacing and semantic markers.

## 11.3 Offer comparison

Reference: PCPartPicker + Kakaku.com.

Desktop comparison row columns:

1. product/merchant identity: min 380px,
2. relevant specs: min 260px,
3. price: 130–160px,
4. fit/evidence: 160–200px,
5. action: 150–180px.

Approximate grid:

```css
.offer-row {
  display: grid;
  grid-template-columns:
    minmax(360px, 1.8fr)
    minmax(220px, 1.1fr)
    150px
    180px
    160px;
  gap: 24px;
  align-items: center;
}
```

Row behavior:

- 20–24px vertical padding,
- separator only between rows,
- product title 18px/700,
- merchant/meta 13–14px,
- price 26–30px/700,
- suitability plain language,
- action physically close enough to belong to the row,
- no rank-number circle,
- no score chips,
- no card shadow.

If specifications are identical to the diagnosis target, do not repeat useless values merely to fill columns.

## 11.4 Detailed evidence

Reference: Notebookcheck.

Below comparison results, use expandable or strongly sectioned evidence:

- CPU/GPU evidence,
- memory/storage evidence,
- price evidence,
- used-condition evidence,
- missing/uncertain information.

Use real tables only where data is tabular.
Use prose for interpretation.
Do not turn every evidence category into a separate card.

## 11.5 Criteria / methodology

`判定で見ている項目` moves below primary actions and comparison results.

It is supporting methodology, not equal-priority buying information.

On mobile it may be collapsed behind `判定基準を見る`.

---

# 12. Missing-data result

Reference: GOV.UK validation/error hierarchy.

Do not show a generic neutral result screen.

Structure:

```text
判定に必要な情報が足りません
CPUと販売価格を確認できませんでした。

不足している情報
・CPU
・販売価格

[不足情報を入力する]
商品ページをもう一度読み取る
```

Rules:

- missing data is a task-repair state,
- no recommendation rows until evidence is sufficient,
- no good/bad lists that imply a verdict,
- no score,
- primary action repairs missing information.

---

# 13. Mobile recomposition

Reference: GOV.UK form prioritization, not desktop shrinking.

390×844 initial viewport priority:

1. brand/header,
2. context label,
3. H1,
4. one-line/short explanation,
5. URL input,
6. CTA,
7. manual-entry link,
8. workflow alternatives.

Everything else comes after the first screen.

Mobile rules:

- H1 30–34px,
- body 16px,
- labels 15px,
- helper 13–14px,
- controls 48–52px high,
- minimum horizontal gutter 16px,
- no 9–11px core UI text,
- no five-column rows squeezed into two columns,
- comparison items become stacked semantic rows,
- methodology collapses,
- no horizontal scroll for ordinary content.

Mobile offer structure:

```text
Product title
Merchant
Specs summary

¥27,800
用途: 十分   価格: 妥当
[商品ページを確認]
```

No card shadow. A bottom separator and spacing create item boundaries.

---

# 14. Anti-AI implementation prohibitions

The implementation is rejected if any of the following appear without explicit justification:

- centered hero with CTA and 3 cards,
- rounded white card grid,
- large pale-gray page background used to make white cards visible,
- gradient hero,
- decorative blobs,
- arbitrary illustration added to occupy blank space,
- status represented as pills everywhere,
- 3-column feature grid,
- identical container shape for unrelated sections,
- excessive `border-radius`,
- box shadows on ordinary content,
- body/helper text below project minimum,
- 50/50 layouts where one side is clearly primary,
- every section centered,
- fake numeric confidence/quality scores presented as precision,
- mobile implemented only by stacking the desktop DOM and shrinking text,
- more whitespace used merely to look 'premium'.

---

# 15. Quantitative CSS gates

These are project heuristics, not universal scientific constants.

## Desktop 1920×1080

- shell target: 1320–1440px,
- initial primary content occupies at least ~65% of viewport width as a meaningful composition,
- H1 >= 38px,
- body >= 15px,
- helper >= 13px,
- primary control height 48–54px,
- no ordinary card shadows,
- ordinary container radius 0px,
- no normal page content after footer,
- footer must not leave a large blank area below it.

## Mobile 390×844

- H1 >= 30px,
- body >= 15px,
- task labels >= 14px,
- controls >= 46px high,
- no horizontal overflow,
- primary URL field + CTA visible without excessive scrolling,
- no 2D data table unless genuinely necessary.

## CSS complexity

Warnings in CI/manual review:

- more than 4 radius values,
- more than 1 page-content box-shadow declaration,
- excessive unique one-off spacing literals,
- more than 3 large pastel/background surfaces in one viewport,
- more than 2 large bordered content boxes in the initial viewport,
- text <= 12px outside legal/meta edge cases,
- desktop shell < 60% of a 1920px viewport without intentional editorial/media reason.

---

# 16. Reference-driven implementation workflow

## Step 1 — reference capture

Before coding, capture or inspect the current live versions of:

- PCPartPicker builder/list/comparison,
- Kakaku.com PC product/search/spec pages,
- GOV.UK form/question examples,
- Wirecutter product recommendation page,
- Notebookcheck device review/spec sections,
- one diagnostic pass/fail service.

For each, record only:

- shell width behavior,
- type hierarchy,
- alignment lines,
- row/card morphology,
- spacing rhythm,
- primary action placement,
- mobile behavior.

Do not copy brand assets or source CSS.

## Step 2 — grayscale wireframe

Build the choosePC layout in grayscale first.

No semantic colours beyond temporary neutral indicators.

Acceptance question:

> Is the hierarchy obvious if all brand colour is removed?

If not, structure is not finished.

## Step 3 — typography and spacing

Apply the defined scales. Do not tune colour yet.

## Step 4 — controls

Implement form/action geometry based on the GOV.UK-derived task hierarchy.

## Step 5 — result hierarchy

Implement verdict-first result based on Wirecutter/diagnostic structure.

## Step 6 — comparison rows

Implement PCPartPicker/Kakaku-style structured rows.

## Step 7 — technical evidence

Implement Notebookcheck-like serious evidence depth below the user decision.

## Step 8 — semantic colour

Only now apply brand + result colours.

## Step 9 — multi-width screenshot audit

Capture:

- 390×844,
- 768×1024,
- 1366×768,
- 1440×900,
- 1920×1080.

Required states:

- home URL mode,
- home manual mode,
- missing-data result,
- positive purchase result,
- caution result,
- bad result,
- 3+ comparison offers.

## Step 10 — independent pairwise review

The evaluator should receive old/new screenshots without implementation rationale first.

Questions:

1. Which has clearer primary task?
2. Which looks more like a real specialist PC service?
3. Which uses 1920px more intentionally?
4. Which has stronger readable typography?
5. Which is easier to scan?
6. Which shows less generic AI-template morphology?
7. Which result communicates the buying decision faster?

A change that cannot win this comparison is not merged merely because the CSS is cleaner.

---

# 17. What the AI is allowed to invent

AI may decide:

- exact values inside the bounded token ranges after screenshot testing,
- which of two proven reference patterns better fits a specific state,
- small responsive breakpoint adjustments,
- minor spacing corrections,
- accessibility refinements,
- implementation details that do not define visual identity.

AI may not independently invent:

- the overall page morphology,
- a new decorative visual style,
- arbitrary card systems,
- new gradients/illustrations,
- unrelated dashboard metaphors,
- typography hierarchy outside the defined system,
- a completely new information architecture without evidence.

The goal is constrained adaptation, not generative novelty.

---

# 18. Primary target appearance

The target is a **Japanese specialist PC decision service**.

It should visually combine:

- PCPartPicker's technical utility,
- Kakaku.com's willingness to show useful information,
- GOV.UK's task clarity,
- Wirecutter's conclusion-first recommendation hierarchy,
- Notebookcheck's technical seriousness.

It should *not* look like:

- a startup SaaS landing page,
- a generic AI dashboard,
- a government back-office system,
- a spreadsheet pasted into a browser,
- an affiliate blog,
- an over-minimal luxury landing page.

This combination is the concrete visual direction for the next implementation.