# choosePC CSS Design Research Standard

Version: 2026-08-14
Status: project design constitution / research basis
Scope: CSS, rendered layout, typography, visual hierarchy, responsive behavior, accessibility, AI-generated UI failure prevention

## 0. Why this document exists

The current problem is not primarily a React/component problem. The UI can have correct semantics and still look unfinished because visual quality is determined by the rendered composition: scale, alignment, density, typography, whitespace, contrast, rhythm, grouping and response to viewport size.

For choosePC, a change is not considered a design improvement merely because cards were removed, corners were squared, a header was colored, or a component hierarchy was simplified. The rendered screen must improve as a composition.

Recent generative-UI research also shows that AI systems can state correct design principles while failing to implement them. Therefore design reasoning is not accepted as evidence. Only the rendered result is evidence.

### Mandatory rule

Every future visual change must be evaluated from screenshots at minimum at:

- 390 x 844
- 768 x 1024
- 1366 x 768
- 1440 x 900
- 1920 x 1080

A code review without rendered screenshots is incomplete for visual work.

---

## 1. Evidence hierarchy

This standard distinguishes three evidence levels.

### Level A — peer-reviewed controlled or large-scale empirical evidence

Use as strong guidance. Examples: controlled experiments on visual complexity, alignment, whitespace, typography, colour, cultural adaptation and webpage layout.

### Level B — peer-reviewed or large-scale observational/computational evidence

Use as supporting guidance, especially for layout metrics and cultural variation.

### Level C — recent preprints / emerging generative-UI evidence

Use to identify AI-specific failure modes, but do not treat as timeless universal law.

Project-specific numeric values below are engineering decisions informed by the evidence, not claims that one exact number is universally optimal.

---

## 2. Main research conclusions that directly affect CSS

### 2.1 Global composition is perceived before fine detail

Tuch et al. found that visual complexity and prototypicality affect aesthetic judgment extremely quickly. Thielsch and Hirschfeld found that low spatial frequencies — the coarse/global layout — uniquely contribute to perceived website aesthetics. Reinecke et al. likewise showed that colorfulness and visual complexity can predict a substantial portion of first-impression judgments.

**CSS consequence:** fixing icons, borders or micro-copy cannot rescue a weak global composition. First inspect:

1. page silhouette,
2. occupied vs empty area,
3. major horizontal/vertical alignments,
4. major type scale,
5. density distribution,
6. contrast distribution,
7. section rhythm.

Micro-polish comes later.

### 2.2 Structure has a larger aesthetic impact than colour alone

Seckler, Opwis and Tuch experimentally manipulated symmetry, visual complexity, hue, saturation and brightness. Structural factors had broad effects on simplicity, diversity and craftsmanship; colour had its strongest effect on perceived colorfulness.

**CSS consequence:** do not try to repair a poor layout by changing the palette. Layout and typography must be correct before colour tuning.

### 2.3 Alignment, balance, unity and sequence matter

Altaboli and Lin found significant effects of balance, unity and sequence on perceived interface aesthetics. Tüchler et al. found that horizontal/vertical alignment structure affects aesthetic and usability ratings.

**CSS consequence:** every major region must share deliberate alignment lines. Avoid unrelated widths, arbitrary left offsets and accidental centers.

For choosePC:

- establish one primary content start line,
- one primary content end line,
- a small set of secondary alignment lines for labels/values,
- do not invent a new width for each section.

### 2.4 Whitespace is not inherently premium

Coursaris and Kripintris experimentally tested e-commerce pages with different whitespace levels and found that excessive whitespace can reduce perceived usability. This is especially important because current AI UI generation often equates “professional” with sparse layouts.

**CSS consequence:** whitespace must express grouping and hierarchy. It must not be used simply to make the page look “clean.”

For choosePC, large unused horizontal areas on 1920px screens are a defect unless they serve a clear compositional function.

### 2.5 Proximity is a powerful grouping cue

Vision and HCI research shows that proximity grouping is perceived quickly, and spatial + semantic grouping improves recall and search.

**CSS consequence:** use spacing before boxes. A group should look like a group because its internal spacing is smaller than its external spacing.

Do not default to a bordered card for every semantic grouping.

### 2.6 Unity and variety must coexist

Post et al. experimentally studied “Unity in Variety” in website aesthetics. Both unity and variety contribute positively; excessive uniformity is not the target.

**CSS consequence:** a good design system is consistent without making every section identical.

Use consistent typography, alignment and spacing tokens while allowing section-specific composition where the task changes.

### 2.7 Typography is functional layout, not decoration

Ling and van Schaik found line length affects scanning and subjective outcomes. Shaikh and Chaparro found line length changes reading performance. Rello, Pielot and Marcos studied font size and line spacing for online readability. Schmidt et al. found font size and column width among variables that affect aesthetic preference and interaction measures.

**CSS consequence:** typography must be treated as a geometry system.

Each text role needs defined:

- font family,
- font size,
- weight,
- line height,
- measure / max line length,
- spacing before/after,
- colour/contrast.

### 2.8 Contrast and colour must support readability first

Hall and Hanna found higher text-background contrast generally improved readability. WCAG 2.2 requires 4.5:1 for normal text and 3:1 for large text at AA.

**CSS consequence:** low-contrast gray helper text is not an acceptable way to create hierarchy. Hierarchy should primarily come from size, weight, spacing and position; colour can reinforce it.

### 2.9 Aesthetic preference is culturally variable

Reinecke and Bernstein showed culturally adaptive interfaces can improve performance and preference. Reinecke and Gajos collected 2.4 million aesthetic ratings from nearly 40,000 participants and found strong variation in preferred visual complexity and colorfulness. Cyr and Trevor-Smith found significant differences across Japanese, German and US websites. Shin et al. specifically warn that generative systems can replace local preferences with dominant global defaults, including imposing minimalist defaults in contexts where Japanese users may expect higher information density.

**CSS consequence:** do not assume a generic Western SaaS landing page is the universal definition of “professional.” choosePC is a Japanese PC decision tool; informative density can be intentional.

### 2.10 AI-generated interfaces converge on defaults

UI-Bench found large quality differences among AI text-to-app systems despite similar underlying models. Higher-quality outputs were associated with deliberate layout planning, distinctive typography, coherent colour programs and stronger responsiveness; lower-performing outputs commonly converged on generic templates, repetitive card grids, weak hierarchy, uneven padding and generic controls.

Shin et al. describe design homogenization in web vibe coding and recommend “productive friction”: explicitly surface assumptions and alternatives rather than accepting the model’s first default.

Design Theater (Imteyaz et al., 2026) found that more than 25% of stated design rationales were not implemented on average, and interfaces converged in visual appearance and layout organization.

**CSS consequence:** never accept “I improved hierarchy” as evidence. Measure and inspect the rendered screen.

---

## 3. Diagnosis of the current choosePC screenshots

This section is based on the 1920px and result-page screenshots captured from the current project, not on a generic AI-site stereotype.

### 3.1 The 1920px page is visually under-filled

The main content occupies a relatively narrow band while a very large part of the viewport is unused. This creates neither intentional editorial whitespace nor a useful application workspace. It reads as a desktop page designed for a much smaller canvas and merely centered/offset inside 1920px.

**Required correction:** wide viewports must change the composition, not only increase the outer margin.

### 3.2 The type scale is too small and too flat

The primary heading is large enough to notice, but much of the body, navigation, labels, helper text and tab text is visually tiny relative to a 1920px display. Too many levels are distinguished by only a few pixels or by faint colour.

**Required correction:** establish a more decisive scale. Major section headings, field labels, helper text, table-like explanation rows and navigation must have visibly distinct roles.

### 3.3 The page has spreadsheet-like horizontal-rule repetition

Many sections use repeated thin horizontal rules with small text. The structure is technically clear but visually resembles an administrative table rather than a consumer diagnostic product.

**Required correction:** use rules selectively. Group by proximity and typography first; reserve rules for genuine separation or tabular semantics.

### 3.4 The current design confuses “no cards” with “good layout”

Removing cards removed one AI default but did not create a replacement visual system. The result is an under-designed field of text, lines and buttons.

**Required correction:** replace card dependence with intentional grouping, strong typography, controlled widths, visible hierarchy, spatial rhythm and task-specific layouts.

### 3.5 The footer appears too early on tall/wide screens

The page content ends well above the viewport bottom, leaving a large blank area below the footer in the captured wide screen.

**Required correction:** use a page shell with `min-height: 100dvh` and flex/grid structure so the footer occupies the logical bottom when content is short.

### 3.6 Result pages lack a strong decision focal point

The result state is text-correct but visually distributed across multiple small regions. The user’s decision (“buy / caution / avoid”) should dominate the composition immediately, followed by reasons and alternatives.

**Required correction:** result status must be the highest-contrast information region after the site header, without turning it into a generic rounded dashboard card.

---

## 4. CSS architecture rules for choosePC

## 4.1 Layout frame

### Rule L1 — Use the viewport deliberately

At desktop widths, the application shell should use a large proportion of the available canvas. A narrow article measure may be used *inside* the shell for prose, but the whole diagnostic UI must not collapse to an article column.

Project target for wide screens:

- shell width: fluid, approximately 86–92vw,
- hard maximum: chosen after screenshot comparison, initially test 1440–1560px,
- prose measure inside the shell: generally 55–80ch depending on purpose,
- tables/forms/results may use more width than prose.

These are project engineering starting points, not universal research constants.

### Rule L2 — One dominant alignment system

Define CSS variables for shell and content gutters. Do not scatter literal margins through components.

```css
:root {
  --page-gutter: clamp(20px, 3.2vw, 56px);
  --shell-max: 1500px;
}

.page-shell {
  width: min(calc(100% - 2 * var(--page-gutter)), var(--shell-max));
  margin-inline: auto;
}
```

### Rule L3 — Breakpoints follow content failure, not device names

Use media queries when the composition stops working, and container queries for reusable components whose behavior depends on available component width.

Do not maintain separate “desktop/tablet/mobile” layouts that only shrink the same structure.

### Rule L4 — Avoid equal columns unless content is genuinely equal

50/50 is not a neutral choice. If one region is primary, give it more area. Use asymmetric grids where task hierarchy requires it.

---

## 4.2 Typography

### Rule T1 — No default 12px application body text

For ordinary Japanese body/interface copy, start testing at 15–17px depending on density. Helper/meta text may be smaller but must remain readable and high enough contrast.

### Rule T2 — Use a defined type scale

Do not choose every size independently. Initial project scale to test:

- display / verdict: `clamp(30px, 2.4vw, 44px)`
- page h1: `clamp(28px, 2.0vw, 40px)`
- h2: `clamp(21px, 1.3vw, 28px)`
- h3: 18–21px
- body: 15.5–17px
- label: 14–16px, medium/semi-bold
- meta/helper: 13–14.5px

Do not treat these as sacred numbers; screenshot testing decides the final values.

### Rule T3 — Line-height is role-specific

- headings: roughly 1.15–1.35
- body: roughly 1.55–1.8 for Japanese prose
- dense labels/tables: roughly 1.35–1.55

The page must also survive WCAG text-spacing overrides without clipping or overlap.

### Rule T4 — Avoid excessive `font-weight: 700`

If almost everything is bold, nothing is hierarchical. Reserve strong weight for actual anchors.

### Rule T5 — Avoid low-contrast gray as the primary hierarchy mechanism

Helper text may be quieter but must remain legible. Use spacing/size/weight first.

---

## 4.3 Spacing and grouping

### Rule S1 — Spacing must encode semantic distance

Internal gaps within a semantic group must be clearly smaller than gaps between groups.

Use a controlled spacing scale, for example:

```css
:root {
  --s-1: 4px;
  --s-2: 8px;
  --s-3: 12px;
  --s-4: 16px;
  --s-5: 24px;
  --s-6: 32px;
  --s-7: 48px;
  --s-8: 64px;
}
```

The exact scale may change; the important constraint is consistency and perceptual grouping.

### Rule S2 — Do not maximize whitespace

Whitespace has to buy something: emphasis, separation, focus, scanability or calm. Empty pixels with no compositional function are waste.

### Rule S3 — Do not wrap every group in a box

Preferred grouping order:

1. proximity,
2. alignment,
3. heading hierarchy,
4. background shift only when semantically meaningful,
5. rule/border when actual boundary is needed,
6. container/card only when the object is independently manipulable or conceptually self-contained.

---

## 4.4 Borders, radius and shadow

### Rule B1 — Borders are structural, not decorative filler

Repeated 1px gray outlines around everything create generated-dashboard morphology.

### Rule B2 — Radius is semantic

Do not apply one global `border-radius` to every interactive and non-interactive surface. Inputs/buttons may have modest radius for affordance; major information regions do not need rounded containers by default.

### Rule B3 — Shadows are exceptional

No ambient drop shadow on ordinary sections. Shadow is allowed for elevation states that are actually elevated: popovers, dialogs, menus, sticky overlays.

---

## 4.5 Colour system

### Rule C1 — Define roles, not random hex values

Use tokens for:

- page background,
- primary surface,
- text strong,
- text normal,
- text muted,
- rule/subtle border,
- brand/action,
- positive,
- warning,
- danger,
- focus.

### Rule C2 — One main brand family, restrained semantic colours

Professional does not mean monochrome. The current dark blue can remain a brand anchor, but the interface needs a deliberate supporting palette rather than only dark blue + gray + white.

### Rule C3 — Colour must not carry meaning alone

Status must also use labels, symbols, weight or shape. Maintain WCAG contrast.

### Rule C4 — Do not use alternating pastel sections as the default hierarchy

A background change requires a semantic reason.

---

## 4.6 Forms and controls

### Rule F1 — Inputs and buttons must share a geometry system

Control heights, internal padding, type sizes, border weights and focus rings must be coherent.

### Rule F2 — Primary action must visually dominate adjacent explanatory text

Do not make the main button look disabled because the fill colour is too pale.

### Rule F3 — Do not make every action a filled button

Use a hierarchy:

- one primary action,
- secondary outline/text actions,
- navigation links as links,
- utility actions with appropriate compact treatment.

### Rule F4 — Focus is designed, not browser-accidental

Visible `:focus-visible` state is mandatory.

---

## 4.7 Result and comparison states

### Rule R1 — The verdict is the first visual object

The result must answer the user’s question before presenting details.

### Rule R2 — Reasons must be grouped by decision relevance

Do not flatten “good points,” “warnings,” price evidence and missing information into equal typographic blocks.

### Rule R3 — Comparisons should be scanable without looking like a SaaS dashboard

Prefer rows with strong labels, numbers and compact evidence over a grid of rounded score cards.

### Rule R4 — Missing evidence has its own visual state

Unknown is not neutral. It must be visibly different from positive/negative evidence without using fake precision.

---

## 4.8 Responsive behavior

### Rule P1 — Mobile is a recomposition

Do not simply stack every desktop region.

Re-evaluate:

- what must be first,
- what can collapse,
- which labels can shorten,
- which explanatory blocks can move behind disclosure,
- whether a desktop comparison row needs a different mobile representation.

### Rule P2 — Meet reflow requirements

At 320 CSS px equivalent width, ordinary content must not require two-dimensional scrolling except genuinely two-dimensional content.

### Rule P3 — Use fluid functions carefully

`clamp()`, `min()`, `max()`, CSS Grid and container queries are preferred to long chains of arbitrary breakpoints when the relationship is naturally fluid.

### Rule P4 — Never hide content only to make a screenshot cleaner

Responsive simplification must preserve task information and functionality.

---

## 5. Anti-AI design rules

These are project rules based on recent generative-UI research and repeated observed failure modes. They are not claims that every instance is inherently bad.

### Do not default to

- centered hero + short subtitle + CTA + three cards,
- repeated 3-column feature grids,
- rounded white cards on pale gray backgrounds,
- decorative gradient blobs,
- pills/badges for non-status prose,
- huge empty hero whitespace,
- generic “dashboard” KPI boxes,
- every section sharing identical padding and shape,
- tiny gray helper copy,
- generic blue CTA as the only visual identity,
- large radius on every element,
- unnecessary shadows,
- icons merely to fill empty space,
- alternating pastel section backgrounds,
- full-page symmetric composition when task hierarchy is asymmetric.

### Instead require

- domain-specific structure,
- deliberate information density,
- recognizable diagnostic workflow,
- typography with a clear hierarchy,
- section-specific composition,
- meaningful alignment and proximity,
- a small coherent visual vocabulary,
- visible task priority,
- rendered validation across widths.

---

## 6. AI workflow for design changes

The model that writes the CSS must not be the sole evaluator of the CSS.

### Phase 1 — inspect before editing

1. render current page at all target widths,
2. describe global composition without looking at code,
3. identify top 5 visual defects,
4. identify which defects are CSS/layout vs content/logic,
5. rank by first-impression impact.

### Phase 2 — produce alternatives before code

For a major redesign, generate at least 3 structurally different wireframe directions before styling. They must differ in information architecture/composition, not merely colour.

### Phase 3 — define CSS intent

Before editing, state:

- shell width strategy,
- major alignment lines,
- type scale,
- spacing scale,
- colour roles,
- border/radius policy,
- responsive recomposition rules.

### Phase 4 — implement

Use tokens and layout primitives. Avoid one-off pixel values unless there is a documented reason.

### Phase 5 — rendered audit

Run a screenshot review independent from the implementation reasoning.

Audit:

- global silhouette,
- horizontal occupancy,
- vertical rhythm,
- type hierarchy,
- control prominence,
- contrast,
- alignment,
- proximity grouping,
- information density,
- repetitive component morphology,
- mobile recomposition,
- footer/page-height behavior.

### Phase 6 — pairwise comparison

Compare before/after screenshots side by side and answer:

> Which version would a professional designer be more willing to deliver to a client, and why?

This mirrors UI-Bench’s pairwise framing and avoids self-congratulation from absolute scoring.

---

## 7. Machine-checkable visual gates

Automated checks cannot measure taste, but they can catch common regressions.

### Required checks

- no horizontal page overflow at target widths,
- footer placement works on short pages,
- normal text contrast meets WCAG AA,
- zoom/reflow does not destroy form layout,
- minimum tap target policy is enforced for primary controls,
- no text clipped under WCAG text-spacing override,
- no result state displays contradictory evidence,
- screenshot generation succeeds for all target widths.

### Heuristics worth adding to CI

These are warnings, not absolute failures:

- body font below project minimum,
- more than a threshold number of distinct border-radius values,
- excessive unique spacing literals outside tokens,
- excessive box-shadow declarations,
- excessive card-like bordered surfaces,
- content shell occupying too little of a 1920px viewport,
- footer ending far above viewport bottom on short pages,
- large regions with low information density without intentional media/illustration.

---

## 8. Specific next redesign direction for choosePC

Do not apply another “polish” layer on the current CSS.

The next visual implementation should be a controlled rebuild of the page shell and type/spacing system while preserving the diagnosis logic.

Priority order:

1. rebuild viewport shell and 1920px composition,
2. rebuild typography scale,
3. rebuild spacing/grouping system,
4. redesign form controls and action hierarchy,
5. redesign result focal hierarchy,
6. redesign comparison rows,
7. add responsive recomposition,
8. tune colour and detail,
9. screenshot pairwise audit,
10. only then consider micro-decoration.

The current failure must not be “fixed” by adding more boxes, cards, gradients, icons or whitespace.

---

## 9. Core research map

### Generative UI / AI-specific

1. Jung, S., Garcinuno, A., & Mateega, S. (2025). *UI-Bench: A Benchmark for Evaluating Design Capabilities of AI Text-to-App Tools*. arXiv:2508.20410. [Level C]
2. Shin, D., Gao, A., Pang, R. Y., Lee, J., Reinecke, K., & Tseng, E. (2026). *Interrogating Design Homogenization in Web Vibe Coding*. arXiv:2603.13036. [Level C]
3. Imteyaz, K., Imteyaz, K., Rajpal, N., Shaikh, K., Muller, M., & Savage, S. (2026). *Design Theater: Evaluating the Gap Between User-Facing Design Reasoning and Implementation in Generative UI Tools*. Accepted at AAAI/AIES; arXiv:2607.22928. [Level B/C]
4. Lai, P., Zhuang, J., Zhang, K., et al. (2025). *WebRenderBench: Enhancing Web Interface Generation through Layout-Style Consistency and Reinforcement Learning*. arXiv:2510.04097. [Level C]
5. Chen, X. A., Petridis, S. D., Deng, T., Bari, H., Du, R., & Li, Y. (2026). *Rethinking the UI of GenUI: A Tale of Two Designs*. arXiv:2606.13843. [Level C]

### Website aesthetics / global layout

6. Tuch, A. N., Presslaber, E. E., Stöcklin, M., Opwis, K., & Bargas-Avila, J. A. (2012). The role of visual complexity and prototypicality regarding first impression of websites. *International Journal of Human-Computer Studies, 70*(11), 794–811. doi:10.1016/j.ijhcs.2012.06.003. [Level A]
7. Reinecke, K., Yeh, T., Miratrix, L., Mardiko, R., Zhao, Y., Liu, J., & Gajos, K. Z. (2013). Predicting users’ first impressions of website aesthetics with a quantification of perceived visual complexity and colorfulness. *CHI ’13*. doi:10.1145/2470654.2481281. [Level A]
8. Seckler, M., Opwis, K., & Tuch, A. N. (2015). Linking objective design factors with subjective aesthetics. *Computers in Human Behavior, 49*, 375–389. doi:10.1016/j.chb.2015.02.056. [Level A]
9. Thielsch, M. T., & Hirschfeld, G. (2010). High and low spatial frequencies in website evaluations. *Ergonomics*. doi:10.1080/00140139.2010.489970. [Level A]
10. Altaboli, A., & Lin, Y. (2011). Investigating effects of screen layout elements on interface and screen design aesthetics. *Advances in Human-Computer Interaction*, 659758. doi:10.1155/2011/659758. [Level A]
11. Tüchler, A. F., Zarina, L., & Skilters, J. (2021). The impact of interface alignment structure on aesthetic appreciation and usability rating. [Level B]
12. Post, R. A. G., Blijlevens, J., & Hekkert, P. (2017). Unity in Variety in website aesthetics: A systematic inquiry. *International Journal of Human-Computer Studies, 103*, 48–62. doi:10.1016/j.ijhcs.2017.02.003. [Level A]
13. Schmidt, K. E., Liu, Y., & Sridharan, S. (2009). Webpage aesthetics, performance and usability: design variables and their effects. *Ergonomics, 52*(6), 631–643. doi:10.1080/00140130802558995. [Level A]
14. Coursaris, C. K., & Kripintris, K. (2012). Web aesthetics and usability: An empirical study of the effects of white space. *International Journal of E-Business Research, 8*(1), 35–53. doi:10.4018/jebr.2012010103. [Level A]
15. van den Berg, R., Cornelissen, F. W., & Roerdink, J. B. T. M. (2009). A crowding model of visual clutter. *Journal of Vision, 9*(4). doi:10.1167/9.4.24. [Level A]

### Typography / text layout

16. Ling, J., & van Schaik, P. (2006). The influence of font type and line length on visual search and information retrieval in web pages. *International Journal of Human-Computer Studies, 64*(5), 395–404. doi:10.1016/j.ijhcs.2005.08.015. [Level A]
17. Shaikh, A. D., & Chaparro, B. S. (2005). The effects of line length on reading performance of online news articles. *Proceedings of the Human Factors and Ergonomics Society Annual Meeting, 49*(5). doi:10.1177/154193120504900514. [Level A]
18. Rello, L., Pielot, M., & Marcos, M.-C. (2016). Make It Big!: The effect of font size and line spacing on online readability. *CHI ’16*, 3637–3648. doi:10.1145/2858036.2858204. [Level A]
19. Beier, S., Berlow, S., Boucaud, E., et al. (2021). Readability Research: An Interdisciplinary Approach. arXiv:2107.09615. [Level C / synthesis]

### Colour / contrast

20. Hall, R. H., & Hanna, P. (2004/2007 online). The impact of web page text-background colour combinations on readability, retention, aesthetics and behavioural intention. *Behaviour & Information Technology, 23*(3), 183–195. doi:10.1080/01449290410001669932. [Level A]
21. Bonnardel, N., Piolat, A., & Le Bigot, L. (2011). The impact of colour on Website appeal and users’ cognitive processes. *Displays, 32*(2), 69–80. doi:10.1016/j.displa.2010.12.002. [Level A]

### Grouping / proximity

22. Ben-Av, M. B., Sagi, D., & Braun, J. (1995). Perceptual grouping by similarity and proximity. *Vision Research, 35*(6), 853–866. doi:10.1016/0042-6989(94)00173-J. [Level A]
23. Niemelä, M., & Saariluoma, P. (2003). Layout attributes and recall. *Behaviour & Information Technology, 22*(5), 353–363. doi:10.1080/0144929031000156924. [Level A]
24. Han, S. (2004). Interactions between proximity and similarity grouping. *Neuroscience Letters, 367*(1), 40–43. doi:10.1016/j.neulet.2004.05.098. [Level A]
25. Sourulahti, S., & Jokinen, J. P. P. (2026). *Modeling Adaptive Visual Search in Semantically Hierarchical Layouts*. arXiv:2606.26725. [Level C]

### Culture / localization

26. Reinecke, K., & Bernstein, A. (2011). Improving performance, perceived usability, and aesthetics with culturally adaptive user interfaces. *ACM Transactions on Computer-Human Interaction, 18*(2), Article 8. doi:10.1145/1970378.1970382. [Level A]
27. Reinecke, K., & Gajos, K. Z. (2014). Quantifying visual preferences around the world. *CHI ’14*, 11–20. [Level A/B, large-scale]
28. Cyr, D., & Trevor-Smith, H. (2004). Localization of Web design: An empirical comparison of German, Japanese, and United States Web site characteristics. *JASIST, 55*(13), 1199–1208. doi:10.1002/asi.20075. [Level B]
29. Singh, N., & Matsuo, H. (2004). Measuring cultural adaptation on the Web: A content analytic study of U.S. and Japanese Web sites. *Journal of Business Research, 57*(8), 864–872. doi:10.1016/S0148-2963(02)00482-4. [Level B]

### Standards / implementation references

30. W3C. (2023–2026 maintained). *Web Content Accessibility Guidelines (WCAG) 2.2* and Understanding documents: Contrast (Minimum), Reflow, Text Spacing. [Normative/official]
31. W3C CSS Working Group. *CSS Containment Module Level 3* — container queries. [Official specification]
32. W3C CSS Working Group. *CSS Values and Units Level 4* — `min()`, `max()`, `clamp()`. [Official specification]

---

## 10. Final project rule

The definition of “fixed” is not “the CSS changed.”

The definition is:

- the screenshot is compositionally stronger,
- the hierarchy is obvious at first glance,
- the page uses its viewport intentionally,
- typography and spacing form a coherent system,
- the interface does not converge on generic AI templates,
- the design works as a Japanese PC decision tool rather than a generic SaaS page,
- responsive views are recomposed rather than mechanically stacked,
- accessibility constraints survive,
- an independent screenshot review prefers the new version over the old one.

If those conditions are not met, the redesign is not complete regardless of how many CSS lines changed.
