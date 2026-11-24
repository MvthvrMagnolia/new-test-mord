/**
 * <kpi-appraisal> — reusable KPI appraisal component for pclOne (no framework, no dependencies).
 * Styled to the pclOne design system: square, black and white first, teal as a line only.
 *
 * The flow is Self-rating → Line manager → Pillar Lead. The `stage` attribute says whose turn it is:
 * earlier reviews show read-only, the current reviewer's column is editable, later reviewers are hidden.
 *
 *   <script src="kpi-appraisal.js"></script>      (plain script, or import it as a module)
 *   <kpi-appraisal stage="self"></kpi-appraisal>
 *
 * Fields follow the KPI Form template: Section I (background), Section II (work performance targets),
 * Section III (signatures & date).
 *
 *   el.data = {
 *     employee: {                                 // Section I — all optional
 *       name: 'Funke Ajayi', grade: 'Senior Associate', pillar: 'Client Market Engine',
 *       practiceArea: 'Public Sector', reviewPeriod: 'H2 2026 · 1 Jul – 31 Dec 2026',
 *     },
 *     kpis: [{                                    // Section II — one per performance target
 *       id: 'k1',
 *       target: 'Achieve monthly sales of 50,000,000',  // Performance Target (KPI & Expected Outcome) *
 *       description: 'Meet monthly targets',            // Description *
 *       weight: 25,                                     // Weight * (all KPIs should total 100)
 *       measurement: 'Monthly sales report from CRM',   // Measurement Method *
 *       keyActions: ['Weekly pipeline review'],         // Key Actions (optional) — string or array
 *       timeline: 'Monthly',                            // Review Timeline *
 *       reviews: {                                // any of these may be missing
 *         self:        { rating: 3, comment: 'I met 50% of my target' },
 *         lineManager: { rating: 2, comment: '' },
 *         pillarLead:  { rating: 2, comment: '' },
 *       },
 *     }],
 *     managerName: 'Tari Benson',                 // used when the manager signs from this screen
 *     signoffs: {                                 // Section III — { name, date } once signed
 *       employee: { name: 'Funke Ajayi', date: '2026-07-08' },
 *       manager:  null,
 *     },
 *   };
 *
 * Attributes
 *   stage        self | lineManager | pillarLead | complete   (default: self)
 *   readonly     show the stage without an editable column (e.g. the employee watching their review)
 *   heading      section title (default "KPIs."; pclOne headers end in a full stop)
 *   description  line under the title
 *   signer       employee | manager — shows a Sign button for that party if they have not signed
 *   theme        light | dark — force a theme; otherwise it follows the page's tokens or the OS setting
 *
 * Properties
 *   data          read/write; reading returns a copy including anything typed in
 *   ratingLabels  array indexed 1–5 with the label for each rating
 *   bands         [[minScore, 'Band name'], …] highest first, used for overall scores
 *
 * Events (bubble, composed)
 *   kpi-rating-change  detail { kpiId, role, rating, comment }   on every rating or comment change
 *   kpi-submit         detail { role, reviews: [{ kpiId, rating, comment }] }
 *   kpi-history        detail { kpiId }                          "Review history" clicked
 *   kpi-sign           detail { party, date }                    Sign button clicked (date is today, ISO)
 *
 * Theming: the component reads the pclOne tokens (--ink, --surface, --accent, --font-display, …) from the
 * page when tokens.css is loaded, and falls back to the same values built in when it is not.
 */

const ROLES = [
  { key: 'self',        who: 'Employee',     role: 'Self-rating', badge: 'E',  avatar: 'a-black' },
  { key: 'lineManager', who: 'Line manager', role: 'Review',      badge: 'LM', avatar: 'a-green' },
  { key: 'pillarLead',  who: 'Pillar Lead',  role: 'Review',      badge: 'PL', avatar: 'a-deep' },
];
const DEFAULT_LABELS = ['', 'Far Below Expectation', 'Below Expectation', 'Meets Expectation', 'Exceeds Expectation', 'Far Exceeds Expectation'];
const DEFAULT_BANDS = [[4.5, 'Outstanding'], [3.5, 'Exceeds Expectations'], [2.5, 'Meets Expectations'], [0, 'Below Expectations']];

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tone = r => !r ? 'tone-none' : r <= 2 ? 'tone-low' : r === 3 ? 'tone-mid' : 'tone-high';
const badgeTone = r => r <= 2 ? 'b-warning' : r >= 4 ? 'b-success' : 'b-neutral';
// Pick out the figures in a target sentence ("… sales of 50,000,000" → 50,000,000 reads in brand green).
const figures = t => esc(t).replace(/([₦$€£]?\d[\d,.]*\s?%?(?:\s?(?:k|m|bn|million|billion))?)/gi, '<em class="fig">$1</em>');
// pclOne date style: "24 Nov 2026".
const fmtDate = d => { const x = new Date(d); return isNaN(x) ? esc(d) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const list = v => (Array.isArray(v) ? v : String(v ?? '').split(/\n|;\s*/)).map(x => String(x).trim()).filter(Boolean);

// pclOne icon style: outline, 1.5px stroke, square caps, mitred joins; they take currentColor.
const svg = (d, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;
const ICON = {
  measure: svg('<path d="M3 20h18M6 17v-5M12 17V6M18 17v-8"/>'),
  clock:   svg('<rect x="3.75" y="5.25" width="16.5" height="15"/><path d="M3.75 9.75h16.5M8.25 3v4.5M15.75 3v4.5"/>'),
  actions: svg('<path d="M4 7l2 2 3.5-3.5M4 15l2 2 3.5-3.5M13 7.5h7M13 15.5h7"/>'),
  history: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 3.75V7.5h3.75"/><path d="M12 8v4.5l3 2"/>', 16),
  pen:     svg('<path d="M15 4.5l4.5 4.5L9 19.5H4.5V15z"/>', 16),
  check:   svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 14),
};

const STYLE = `
  /* pclOne tokens: taken from the page's tokens.css when present, else these fallbacks (light). */
  :host {
    --k-bg: var(--bg, #ffffff);
    --k-surface: var(--surface, #ffffff);
    --k-subtle: var(--surface-subtle, #f5f5f5);
    --k-sunken: var(--surface-sunken, #e6e6e6);
    --k-disabled-bg: var(--surface-disabled, #f0f0f0);
    --k-ink: var(--ink, #231f20);
    --k-muted: var(--ink-muted, #5f6062);
    --k-disabled: var(--ink-disabled, #a3a5a7);
    --k-line: var(--line, #e6e6e6);
    --k-line-strong: var(--line-strong, #797a7d);
    --k-focus: var(--line-focus, #1f5747);
    --k-primary: var(--primary, #231f20);
    --k-primary-hover: var(--primary-hover, #13352b);
    --k-primary-pressed: var(--primary-pressed, #000000);
    --k-on-primary: var(--on-primary, #ffffff);
    --k-accent: var(--accent, #00a48d);
    --k-accent-text: var(--accent-text, #1f5747);
    --k-success: var(--success, #1f5747);
    --k-success-soft: var(--success-soft, #e4f1ec);
    --k-warning: var(--warning, #8a5300);
    --k-warning-soft: var(--warning-soft, #fbf0dc);
    --k-hover: var(--state-hover, #231f200d);
    --k-pressed: var(--state-pressed, #231f201f);
    --k-panel: var(--panel, #262324);
    --k-green-700: var(--green-700, #1f5747);
    --k-green-900: var(--green-900, #13352b);
    --k-rich-black: var(--rich-black, #231f20);
    --k-display: var(--font-display, Poppins, "Segoe UI", system-ui, sans-serif);
    --k-text: var(--font-text, Roboto, system-ui, -apple-system, "Segoe UI", sans-serif);
    --k-fast: var(--duration-fast, 120ms);
    --k-base: var(--duration-base, 200ms);
    --k-instant: var(--duration-instant, 80ms);
    --k-ease: var(--ease-standard, cubic-bezier(0.2, 0, 0, 1));

    display: block; color: var(--k-ink); font: 400 16px/24px var(--k-text);
    -webkit-font-smoothing: antialiased;
  }
  /* Dark fallbacks, used only when the page has no tokens.css of its own. */
  :host([theme="dark"]) {
    --k-bg: var(--bg, #231f20); --k-surface: var(--surface, #2b2728); --k-subtle: var(--surface-subtle, #1c191a);
    --k-sunken: var(--surface-sunken, #171415); --k-disabled-bg: var(--surface-disabled, #2b2728);
    --k-ink: var(--ink, #ffffff); --k-muted: var(--ink-muted, #a3a5a7); --k-disabled: var(--ink-disabled, #6b6768);
    --k-line: var(--line, #3d3839); --k-line-strong: var(--line-strong, #8b8e90); --k-focus: var(--line-focus, #42bb98);
    --k-primary: var(--primary, #ffffff); --k-primary-hover: var(--primary-hover, #42bb98); --k-primary-pressed: var(--primary-pressed, #2f9c7d);
    --k-on-primary: var(--on-primary, #231f20); --k-accent-text: var(--accent-text, #42bb98);
    --k-success: var(--success, #42bb98); --k-success-soft: var(--success-soft, #17322a);
    --k-warning: var(--warning, #f2b544); --k-warning-soft: var(--warning-soft, #3a2c12);
    --k-hover: var(--state-hover, #ffffff12); --k-pressed: var(--state-pressed, #ffffff24);
  }
  @media (prefers-color-scheme: dark) {
    :host(:not([theme="light"])) {
      --k-bg: var(--bg, #231f20); --k-surface: var(--surface, #2b2728); --k-subtle: var(--surface-subtle, #1c191a);
      --k-sunken: var(--surface-sunken, #171415); --k-disabled-bg: var(--surface-disabled, #2b2728);
      --k-ink: var(--ink, #ffffff); --k-muted: var(--ink-muted, #a3a5a7); --k-disabled: var(--ink-disabled, #6b6768);
      --k-line: var(--line, #3d3839); --k-line-strong: var(--line-strong, #8b8e90); --k-focus: var(--line-focus, #42bb98);
      --k-primary: var(--primary, #ffffff); --k-primary-hover: var(--primary-hover, #42bb98); --k-primary-pressed: var(--primary-pressed, #2f9c7d);
      --k-on-primary: var(--on-primary, #231f20); --k-accent-text: var(--accent-text, #42bb98);
      --k-success: var(--success, #42bb98); --k-success-soft: var(--success-soft, #17322a);
      --k-warning: var(--warning, #f2b544); --k-warning-soft: var(--warning-soft, #3a2c12);
      --k-hover: var(--state-hover, #ffffff12); --k-pressed: var(--state-pressed, #ffffff24);
    }
  }
  @media (prefers-reduced-motion: reduce) { * { transition-duration: 0ms !important; } }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .overline { font: 500 12px/16px var(--k-display); letter-spacing: .08em; text-transform: uppercase; color: var(--k-muted); }
  .num { font-variant-numeric: tabular-nums; }

  .root { background: var(--k-surface); border: 1px solid var(--k-line); padding: 32px; }

  /* SectionHeader: Poppins title with full stop, 24px teal dash, one-line description */
  .sh { display: flex; flex-direction: column; gap: 8px; max-width: 640px; }
  h2 { font: 600 22px/30px var(--k-display); text-wrap: balance; }
  .dash { width: 24px; height: 2px; background: var(--k-accent); }
  .desc { font-size: 16px; line-height: 24px; color: var(--k-muted); }

  /* Stepper: a 2px line over each label — ink when done, teal for the current step */
  .steps { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 24px; counter-reset: step; }
  .step { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 2px solid var(--k-line); counter-increment: step; }
  .step-n { font: 500 12px/16px var(--k-display); letter-spacing: .08em; color: var(--k-muted); }
  .step-n::before { content: "STEP " counter(step); }
  .step-label { font: 500 14px/20px var(--k-display); color: var(--k-muted); display: inline-flex; align-items: center; gap: 4px; }
  .step.done { border-top-color: var(--k-ink); }
  .step.done .step-label, .step.current .step-label { color: var(--k-ink); }
  .step.current { border-top-color: var(--k-accent); }

  /* Section I: background */
  .profile { margin-top: 32px; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); border-top: 1px solid var(--k-line); border-left: 1px solid var(--k-line); }
  .profile > div { padding: 12px 16px; border-right: 1px solid var(--k-line); border-bottom: 1px solid var(--k-line); min-width: 0; }
  .profile dd { margin-top: 4px; font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
  .profile .p-name dd { font: 500 16px/24px var(--k-display); }

  /* Overall scores: the page's one dark feature block */
  .summary { margin-top: 24px; background: var(--k-panel); color: #ffffff; padding: 24px; border: 1px solid var(--k-panel); }
  :host([theme="dark"]) .summary { border-color: var(--k-line); }
  @media (prefers-color-scheme: dark) { :host(:not([theme="light"])) .summary { border-color: var(--k-line); } }
  .summary .overline { color: #c9cacc; }
  .summary .dash { margin-top: 8px; }
  .sum-grid { margin-top: 20px; display: grid; grid-template-columns: repeat(var(--cols), 1fr); }
  .sum { padding: 0 24px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  .sum:first-child { padding-left: 0; }
  .sum + .sum { border-left: 1px solid #3d3839; }
  .sum .who-name { color: #ffffff; }
  .sum .who-role { color: #c9cacc; }
  .sum .avatar { box-shadow: 0 0 0 1px #ffffff33; }
  .sum .b-solid { background: #ffffff; color: #231f20; }
  .stat { font: 600 32px/40px var(--k-display); letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
  .stat small { font: 500 14px/20px var(--k-display); color: #c9cacc; letter-spacing: 0; }
  .sum-pending { font: 500 14px/20px var(--k-display); color: #c9cacc; }
  .sum-pending b { display: block; font: 600 32px/40px var(--k-display); color: #ffffff; }
  .sum .track { background: #3d3839; }
  .band { font: 500 14px/20px var(--k-display); color: #ffffff; display: inline-flex; align-items: center; gap: 8px; }
  .band::before { content: ""; width: 6px; height: 6px; border-radius: 9999px; background: var(--k-accent); }
  .band.low::before { background: #f2b544; }

  .weight-note { margin-top: 12px; font-size: 12px; line-height: 16px; color: var(--k-muted); }
  .weight-note.off { color: var(--k-warning); }

  /* KPI card */
  .kpi { margin-top: 24px; border: 1px solid var(--k-line); background: var(--k-surface); }
  .kpi-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 24px; }
  .kpi-main { min-width: 0; max-width: 760px; display: flex; flex-direction: column; gap: 8px; }
  h3 { font: 600 18px/26px var(--k-display); text-wrap: balance; overflow-wrap: anywhere; }
  h3 .fig { font-style: normal; color: var(--k-accent-text); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .kpi-desc { font-size: 14px; line-height: 20px; color: var(--k-muted); }
  .weight { flex: none; width: 120px; display: flex; flex-direction: column; gap: 8px; text-align: right; }
  .weight .w-val { font: 600 22px/30px var(--k-display); font-variant-numeric: tabular-nums; }
  .track { height: 4px; background: var(--k-sunken); overflow: hidden; }
  .track i { display: block; height: 100%; background: var(--k-accent); transition: width 320ms var(--k-ease); }

  .specs { display: grid; grid-template-columns: repeat(var(--specs), 1fr); border-top: 1px solid var(--k-line); background: var(--k-subtle); }
  .spec { display: flex; gap: 12px; padding: 16px 24px; min-width: 0; }
  .spec + .spec { border-left: 1px solid var(--k-line); }
  .spec > svg { flex: none; color: var(--k-ink); margin-top: 0; }
  .spec dd { margin-top: 4px; font-size: 14px; line-height: 20px; overflow-wrap: anywhere; }
  .spec ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .spec li { position: relative; padding-left: 16px; }
  .spec li::before { content: ""; position: absolute; left: 0; top: 9px; width: 8px; height: 2px; background: var(--k-accent); }

  /* Reviews */
  .reviews { display: grid; grid-template-columns: repeat(var(--cols), 1fr); border-top: 1px solid var(--k-line); }
  .review { padding: 24px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .review + .review { border-left: 1px solid var(--k-line); }
  .review.editing { background: var(--k-subtle); }

  .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .avatar { flex: none; width: 32px; height: 32px; border-radius: 9999px; display: grid; place-items: center; font: 500 12px/16px var(--k-display); color: #ffffff; }
  .a-black { background: var(--k-rich-black); }
  .a-green { background: var(--k-green-700); }
  .a-deep  { background: var(--k-green-900); }
  .who-name { font: 500 14px/20px var(--k-display); display: flex; align-items: center; gap: 8px; }
  .who-role { font-size: 12px; line-height: 16px; color: var(--k-muted); }

  .badge { display: inline-flex; align-items: center; gap: 6px; height: 20px; padding: 0 8px; border-radius: 2px; font: 500 12px/16px var(--k-display); white-space: nowrap; background: var(--k-sunken); color: var(--k-ink); }
  .badge.dot::before { content: ""; width: 6px; height: 6px; border-radius: 9999px; background: currentColor; }
  .b-success { background: var(--k-success-soft); color: var(--k-success); }
  .b-warning { background: var(--k-warning-soft); color: var(--k-warning); }
  .b-solid { background: var(--k-primary); color: var(--k-on-primary); }

  .score { display: flex; align-items: baseline; gap: 4px; }
  .score b { font: 600 32px/40px var(--k-display); letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
  .score span { font: 500 14px/20px var(--k-display); color: var(--k-muted); }
  .tone-low .score b { color: var(--k-warning); }
  .scale { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; width: 120px; }
  .scale i { height: 4px; background: var(--k-sunken); }
  .tone-mid .scale i.on, .tone-high .scale i.on { background: var(--k-accent); }
  .tone-low .scale i.on { background: var(--k-warning); }
  .rating-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
  .weighted { font-size: 12px; line-height: 16px; color: var(--k-muted); font-variant-numeric: tabular-nums; }

  .comment { font-size: 14px; line-height: 20px; padding: 12px 16px; background: var(--k-subtle); overflow-wrap: anywhere; }
  .comment.none { background: none; padding: 0; color: var(--k-muted); font-size: 12px; line-height: 16px; }
  .waiting { font-size: 14px; color: var(--k-muted); }

  /* Editable rating: five square options, black when chosen */
  .field-label { font: 500 14px/20px var(--k-display); display: flex; justify-content: space-between; gap: 8px; }
  .field-label span { font: 400 12px/16px var(--k-text); color: var(--k-muted); }
  .picker { border: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-width: 320px; }
  .picker label { position: relative; cursor: pointer; }
  .picker input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
  .picker span {
    display: grid; place-items: center; height: 40px;
    font: 500 16px/24px var(--k-display); color: var(--k-ink);
    background: var(--k-surface); border: 1px solid var(--k-line-strong);
    transition: background-color var(--k-fast) var(--k-ease), border-color var(--k-fast) var(--k-ease), color var(--k-fast) var(--k-ease);
  }
  .picker label:hover span { border-color: var(--k-ink); background-image: linear-gradient(var(--k-hover), var(--k-hover)); }
  .picker input:focus-visible + span { outline: 2px solid var(--k-focus); outline-offset: 2px; }
  .picker input:checked + span { background: var(--k-primary); border-color: var(--k-primary); color: var(--k-on-primary); }
  .picker label:hover input:checked + span { background: var(--k-primary-hover); border-color: var(--k-primary-hover); }
  .pick-meta { display: flex; align-items: center; gap: 12px; min-height: 20px; }
  .pick-hint { font-size: 12px; line-height: 16px; color: var(--k-muted); }

  textarea {
    width: 100%; min-height: 88px; resize: vertical; padding: 12px;
    font: 400 16px/24px var(--k-text); color: var(--k-ink); background: var(--k-surface);
    border: 1px solid var(--k-line-strong); border-radius: 0;
    transition: border-color var(--k-fast) var(--k-ease), box-shadow var(--k-fast);
  }
  textarea::placeholder { color: var(--k-muted); }
  textarea:hover { border-color: var(--k-ink); }
  textarea:focus { outline: none; border-color: var(--k-ink); box-shadow: inset 0 -2px 0 var(--k-accent); }
  .comment-field { display: flex; flex-direction: column; gap: 6px; }
  .solo .review.editing { display: grid; grid-template-columns: minmax(0, 320px) 1fr; column-gap: 32px; row-gap: 16px; }
  .solo .review.editing .who { grid-column: 1 / -1; }
  .rate-block { display: flex; flex-direction: column; gap: 12px; }

  .foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 24px; border-top: 1px solid var(--k-line); min-height: 56px; }
  .gap { font-size: 14px; line-height: 20px; color: var(--k-muted); }
  .gap b { font-weight: 500; color: var(--k-warning); }
  .gap.agree b { color: var(--k-success); }

  /* TextLink: Poppins label over a 24px teal underline that grows on hover */
  .link {
    appearance: none; border: 0; background: none; cursor: pointer; margin-left: auto;
    display: inline-flex; align-items: center; gap: 8px; position: relative; padding-bottom: 6px;
    font: 500 14px/20px var(--k-display); color: var(--k-ink); white-space: nowrap;
  }
  .link::after { content: ""; position: absolute; left: 0; bottom: 0; width: 24px; height: 2px; background: var(--k-accent); transition: width var(--k-base) var(--k-ease); }
  .link:hover::after { width: 100%; }
  .link:focus-visible, .btn:focus-visible { outline: 2px solid var(--k-focus); outline-offset: 2px; }

  /* Section III: signatures & date */
  .agreement { margin-top: 24px; border: 1px solid var(--k-line); }
  .agreement-head { padding: 24px 24px 0; display: flex; flex-direction: column; gap: 8px; }
  .agreement-head h3 { font: 600 18px/26px var(--k-display); }
  .agreement-head p { font-size: 14px; line-height: 20px; color: var(--k-muted); }
  .signs { display: grid; grid-template-columns: 1fr 1fr; margin-top: 16px; border-top: 1px solid var(--k-line); }
  .sign { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; min-width: 0; }
  .sign + .sign { border-left: 1px solid var(--k-line); }
  .sign-name { margin-top: 4px; font: 500 16px/24px var(--k-display); }
  .sign-date { font-size: 12px; line-height: 16px; color: var(--k-muted); }
  .sign-wait { margin-top: 4px; font-size: 14px; color: var(--k-muted); }

  /* Buttons: square, Poppins Medium; primary is black and deepens to green on hover */
  .btn {
    appearance: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 40px; padding: 0 20px; border: 1px solid transparent; border-radius: 0;
    font: 500 14px/20px var(--k-display); white-space: nowrap;
    transition: background-color var(--k-fast) var(--k-ease), border-color var(--k-fast) var(--k-ease), color var(--k-fast) var(--k-ease);
  }
  .btn-primary { background: var(--k-primary); color: var(--k-on-primary); }
  .btn-primary:hover:not(:disabled) { background: var(--k-primary-hover); }
  .btn-primary:active:not(:disabled) { background: var(--k-primary-pressed); transition-duration: var(--k-instant); }
  .btn-secondary { background: transparent; color: var(--k-ink); border-color: var(--k-line-strong); height: 32px; padding: 0 12px; font-size: 12px; line-height: 16px; }
  .btn-secondary:hover { border-color: var(--k-ink); background: var(--k-hover); }
  .btn:disabled { background: var(--k-disabled-bg); color: var(--k-disabled); border-color: transparent; cursor: not-allowed; }

  /* Submit bar */
  .actions { margin-top: 24px; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-top: 24px; border-top: 1px solid var(--k-line); }
  .progress { flex: 1; max-width: 360px; display: flex; flex-direction: column; gap: 8px; }
  .progress-top { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; line-height: 20px; color: var(--k-muted); font-variant-numeric: tabular-nums; }
  .progress-top b { font: 500 14px/20px var(--k-display); color: var(--k-ink); }
  .submitted { display: inline-flex; align-items: center; gap: 8px; font: 500 14px/20px var(--k-display); color: var(--k-success); }
  .why-disabled { font-size: 12px; line-height: 16px; color: var(--k-muted); margin-top: 4px; text-align: right; }

  @media (max-width: 1023px) {
    .sum-grid, .reviews, .specs, .signs { grid-template-columns: 1fr; }
    .sum { padding: 16px 0 0; }
    .sum + .sum { border-left: 0; border-top: 1px solid #3d3839; margin-top: 16px; }
    .review + .review, .spec + .spec, .sign + .sign { border-left: 0; border-top: 1px solid var(--k-line); }
    .solo .review.editing { display: flex; }
  }
  @media (max-width: 639px) {
    .root { padding: 16px; }
    .kpi-head { flex-direction: column; gap: 16px; padding: 16px; }
    .weight { width: 100%; text-align: left; }
    .review, .spec, .sign { padding: 16px; }
    .foot { padding: 16px; }
    .summary { padding: 16px; }
    .steps { grid-template-columns: 1fr; }
    .actions { flex-direction: column; align-items: stretch; }
    .progress { max-width: none; }
  }
`;

class KpiAppraisal extends HTMLElement {
  static observedAttributes = ['stage', 'readonly', 'heading', 'description', 'signer'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = { kpis: [] };
    this._labels = DEFAULT_LABELS;
    this._bands = DEFAULT_BANDS;
    this._submitted = false;
    this.shadowRoot.addEventListener('change', e => this._onChange(e));
    this.shadowRoot.addEventListener('input', e => this._onInput(e));
    this.shadowRoot.addEventListener('click', e => this._onClick(e));
  }

  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._submitted = false; if (this.isConnected) this._render(); }

  set data(v) { this._data = structuredClone(v || { kpis: [] }); this._submitted = false; this._render(); }
  get data() { return structuredClone(this._data); }
  set ratingLabels(v) { this._labels = v; this._render(); }
  get ratingLabels() { return this._labels; }
  set bands(v) { this._bands = v; this._render(); }
  get bands() { return this._bands; }

  get _stageIndex() { const i = ROLES.findIndex(r => r.key === (this.getAttribute('stage') || 'self')); return i < 0 ? ROLES.length : i; }
  get _visible() { return ROLES.slice(0, Math.min(this._stageIndex + 1, ROLES.length)); }
  get _active() { return this.hasAttribute('readonly') || this._stageIndex >= ROLES.length ? null : ROLES[this._stageIndex].key; }
  get _kpis() { return this._data.kpis || []; }

  _review(k, role) { return (k.reviews && k.reviews[role]) || null; }
  _ratedCount(role) { return this._kpis.filter(k => this._review(k, role)?.rating).length; }
  _overall(role) {
    const kpis = this._kpis;
    if (!kpis.length || this._ratedCount(role) < kpis.length) return null;
    const w = kpis.reduce((s, k) => s + (+k.weight || 0), 0) || 1;
    return kpis.reduce((s, k) => s + this._review(k, role).rating * (+k.weight || 0), 0) / w;
  }
  _band(score) { return (this._bands.find(([min]) => score >= min) || [0, ''])[1]; }

  /* ---------- rendering ---------- */

  _render() {
    const visible = this._visible, active = this._active, cols = visible.length;
    const heading = this.getAttribute('heading') || 'KPIs.';
    const desc = this.getAttribute('description') ?? (active === 'self'
      ? 'Rate how well you delivered each locked KPI from 1 to 5.'
      : active ? 'Review each KPI. Earlier ratings are shown for reference.' : 'The ratings given for each of your locked KPIs this cycle.');

    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <section class="root ${cols === 1 ? 'solo' : ''}" style="--cols:${cols}">
        <header class="sh"><h2>${esc(heading)}</h2><span class="dash" aria-hidden="true"></span><p class="desc">${esc(desc)}</p></header>
        <ol class="steps" aria-label="Appraisal progress" data-steps>${this._steps()}</ol>
        ${this._profile()}
        <div class="summary" data-summary>${this._summary()}</div>
        ${this._weightNote()}
        ${this._kpis.map((k, i) => this._kpi(k, i)).join('')}
        ${this._agreement()}
        ${active ? `<div class="actions" data-actions>${this._actions()}</div>` : ''}
      </section>`;
  }

  _steps() {
    const idx = this._stageIndex, done = this._submitted;
    return ROLES.map((r, i) => {
      const state = i < idx || (i === idx && done) ? 'done' : i === idx ? 'current' : '';
      return `<li class="step ${state}" ${state === 'current' ? 'aria-current="step"' : ''}><span class="step-n"></span><span class="step-label">${state === 'done' ? ICON.check : ''}${esc(r.who)}</span></li>`;
    }).join('');
  }

  _profile() {
    const e = this._data.employee;
    if (!e) return '';
    const items = [['p-name', 'Name', e.name], ['', 'Grade', e.grade], ['', 'Pillar', e.pillar], ['', 'Practice area', e.practiceArea], ['', 'Review period', e.reviewPeriod]]
      .filter(([, , v]) => v);
    return `<dl class="profile" aria-label="Background information">${items.map(([c, k, v]) => `<div class="${c}"><dt class="overline">${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  _summary() {
    const n = this._kpis.length;
    return `<div class="overline">Overall score</div><span class="dash" aria-hidden="true"></span>
      <div class="sum-grid">${this._visible.map(r => {
        const score = this._overall(r.key), rated = this._ratedCount(r.key), isActive = r.key === this._active;
        const body = score != null
          ? `<div class="stat">${score.toFixed(2)}<small> / 5</small></div><span class="band ${score < 2.5 ? 'low' : ''}">${esc(this._band(score))}</span>`
          : `<div class="sum-pending"><b class="num">${rated} of ${n}</b>KPIs rated</div><div class="track" aria-hidden="true"><i style="width:${n ? rated / n * 100 : 0}%"></i></div>`;
        return `<div class="sum">${this._who(r, isActive)}${body}</div>`;
      }).join('')}</div>`;
  }

  _weightNote() {
    const n = this._kpis.length, total = this._kpis.reduce((s, k) => s + (+k.weight || 0), 0);
    if (!n) return '';
    const ok = Math.abs(total - 100) < 0.01;
    return `<p class="weight-note ${ok ? '' : 'off'}">${n} KPI${n === 1 ? '' : 's'} · weights total ${+total.toFixed(2)}%${ok ? '' : '. The KPI form requires 100%'}. Overall scores are weighted by each KPI's share.</p>`;
  }

  _who(r, isYou) {
    return `<div class="who"><span class="avatar ${r.avatar}" aria-hidden="true">${r.badge}</span>
      <div><div class="who-name">${esc(r.who)}${isYou ? '<span class="badge b-solid">You</span>' : ''}</div><div class="who-role">${esc(r.role)}</div></div></div>`;
  }

  _kpi(k, i) {
    const actions = list(k.keyActions), w = +k.weight || 0;
    const specs = [
      k.measurement && ['measure', 'Measurement method', `<dd>${esc(k.measurement)}</dd>`],
      k.timeline && ['clock', 'Review timeline', `<dd>${esc(k.timeline)}</dd>`],
      actions.length && ['actions', 'Key actions', `<dd><ul>${actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></dd>`],
    ].filter(Boolean);
    return `<article class="kpi" data-kpi="${i}">
      <div class="kpi-head">
        <div class="kpi-main">
          <div class="overline">KPI ${i + 1} · Locked</div>
          <h3>${figures(k.target)}</h3>
          ${k.description ? `<p class="kpi-desc">${esc(k.description)}</p>` : ''}
        </div>
        <div class="weight">
          <div class="overline">Weight</div>
          <div class="w-val">${w}%</div>
          <div class="track" role="img" aria-label="Weight ${w}% of 100%"><i style="width:${Math.min(w, 100)}%"></i></div>
        </div>
      </div>
      ${specs.length ? `<dl class="specs" style="--specs:${specs.length}">${specs.map(([ico, t, dd]) => `<div class="spec">${ICON[ico]}<div><dt class="overline">${t}</dt>${dd}</div></div>`).join('')}</dl>` : ''}
      <div class="reviews">${this._visible.map(role => role.key === this._active ? this._editor(k, i, role) : this._readonly(k, role)).join('')}</div>
      <div class="foot" data-foot="${i}">${this._foot(k)}</div>
    </article>`;
  }

  _readonly(k, role) {
    const rv = this._review(k, role.key), w = +k.weight || 0;
    if (!rv?.rating) return `<div class="review tone-none">${this._who(role)}<p class="waiting">Not rated yet</p></div>`;
    return `<div class="review ${tone(rv.rating)}">
      ${this._who(role)}
      <div>
        <div class="score"><b>${rv.rating}</b><span>/ 5</span></div>
        <div class="scale" aria-hidden="true">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= rv.rating ? 'on' : ''}"></i>`).join('')}</div>
      </div>
      <div class="rating-meta"><span class="badge dot ${badgeTone(rv.rating)}">${esc(this._labels[rv.rating])}</span><span class="weighted">Weighted ${(rv.rating * w / 100).toFixed(2)}</span></div>
      ${rv.comment ? `<p class="comment">${esc(rv.comment)}</p>` : '<p class="comment none">No comment provided</p>'}
    </div>`;
  }

  _editor(k, i, role) {
    const rv = this._review(k, role.key) || {}, name = `kpi-${i}`;
    return `<div class="review editing ${tone(rv.rating)}" data-editor="${i}">
      ${this._who(role, true)}
      <div class="rate-block">
        <fieldset class="picker"><legend class="sr">Rating for KPI ${i + 1}</legend>
          ${[1, 2, 3, 4, 5].map(n => `<label title="${esc(this._labels[n])}"><input type="radio" name="${name}" value="${n}" ${rv.rating === n ? 'checked' : ''} aria-label="${n}, ${esc(this._labels[n])}"><span>${n}</span></label>`).join('')}
        </fieldset>
        <div class="pick-meta" data-pickmeta>${this._pickMeta(rv.rating, k.weight)}</div>
      </div>
      <div class="comment-field">
        <label class="field-label" for="c-${i}">Comment <span>Optional</span></label>
        <textarea id="c-${i}" data-comment="${i}" rows="3" placeholder="${role.key === 'self' ? 'What did you deliver against this target?' : 'Explain your rating for the employee'}">${esc(rv.comment)}</textarea>
      </div>
    </div>`;
  }

  _pickMeta(rating, weight) {
    return rating
      ? `<span class="badge dot ${badgeTone(rating)}">${esc(this._labels[rating])}</span><span class="weighted">Weighted ${(rating * (+weight || 0) / 100).toFixed(2)}</span>`
      : '<span class="pick-hint">Choose a rating from 1 to 5</span>';
  }

  _foot(k) {
    const self = this._review(k, 'self'), vis = this._visible.filter(r => r.key !== 'self');
    let note = '';
    if (self?.rating) {
      const last = [...vis].reverse().find(r => this._review(k, r.key)?.rating);
      if (last) {
        const d = this._review(k, last.key).rating - self.rating;
        const whose = this._active === 'self' ? 'your' : 'the';
        note = d === 0
          ? `<span class="gap agree"><b>In agreement</b> with ${whose} self-rating</span>`
          : `<span class="gap">${esc(last.who)} rated <b>${Math.abs(d)} ${d < 0 ? 'lower' : 'higher'}</b> than ${whose} self-rating</span>`;
      }
    }
    return `${note}<button class="link" data-history>${ICON.history}Review history</button>`;
  }

  _agreement() {
    const so = this._data.signoffs;
    if (!so) return '';
    const signer = this.getAttribute('signer');
    const party = (key, label) => {
      const s = so[key];
      if (s?.name) return `<div class="sign"><div><div class="overline">${label}</div><div class="sign-name">${esc(s.name)}</div><div class="sign-date">${s.date ? 'Signed ' + fmtDate(s.date) : 'Signed'}</div></div><span class="badge dot b-success">Signed</span></div>`;
      const btn = signer === key ? `<button class="btn btn-secondary" data-sign="${key}">${ICON.pen}Sign</button>` : '';
      return `<div class="sign"><div><div class="overline">${label}</div><div class="sign-wait">Awaiting signature</div></div>${btn}</div>`;
    };
    return `<section class="agreement" aria-label="Signatures and date">
      <div class="agreement-head"><h3>KPI agreement.</h3><p>Signatures and dates confirming these KPIs.</p></div>
      <div class="signs">${party('employee', 'Employee')}${party('manager', 'Manager')}</div>
    </section>`;
  }

  _actions() {
    const n = this._kpis.length, rated = this._ratedCount(this._active), all = n > 0 && rated === n;
    const who = ROLES.find(r => r.key === this._active);
    if (this._submitted) return `<span class="submitted">${ICON.check}${this._active === 'self' ? 'Self-rating submitted' : 'Review submitted'}</span>`;
    const label = this._active === 'self' ? 'Submit self-rating' : 'Submit review';
    return `<div class="progress">
        <div class="progress-top"><b>${esc(who.who === 'Employee' ? 'Your self-rating' : 'Your review')}</b><span>${rated} of ${n} rated</span></div>
        <div class="track" aria-hidden="true"><i style="width:${n ? rated / n * 100 : 0}%"></i></div>
      </div>
      <div>
        <button class="btn btn-primary" data-submit ${all ? '' : 'disabled'}>${label}</button>
        ${all ? '' : `<p class="why-disabled">Rate every KPI to submit</p>`}
      </div>`;
  }

  /* ---------- interaction ---------- */

  _set(i, patch) {
    const k = this._kpis[i], role = this._active;
    k.reviews = k.reviews || {};
    k.reviews[role] = { rating: null, comment: '', ...k.reviews[role], ...patch };
    this._submitted = false;
    this.dispatchEvent(new CustomEvent('kpi-rating-change', { bubbles: true, composed: true,
      detail: { kpiId: k.id ?? i, role, rating: k.reviews[role].rating, comment: k.reviews[role].comment } }));
  }

  _onChange(e) {
    const input = e.target.closest('.picker input');
    if (!input) return;
    const i = +input.closest('[data-editor]').dataset.editor, rating = +input.value;
    this._set(i, { rating });
    // Update just the parts that depend on the rating, so focus and typed text are kept.
    const ed = this.shadowRoot.querySelector(`[data-editor="${i}"]`);
    ed.className = `review editing ${tone(rating)}`;
    ed.querySelector('[data-pickmeta]').innerHTML = this._pickMeta(rating, this._kpis[i].weight);
    this.shadowRoot.querySelector(`[data-foot="${i}"]`).innerHTML = this._foot(this._kpis[i]);
    this.shadowRoot.querySelector('[data-summary]').innerHTML = this._summary();
    this.shadowRoot.querySelector('[data-actions]').innerHTML = this._actions();
  }

  _onInput(e) {
    const ta = e.target.closest('textarea[data-comment]');
    if (ta) this._set(+ta.dataset.comment, { comment: ta.value });
  }

  _onClick(e) {
    if (e.target.closest('[data-submit]')) {
      const role = this._active;
      this._submitted = true;
      this.shadowRoot.querySelector('[data-actions]').innerHTML = this._actions();
      this.shadowRoot.querySelector('[data-steps]').innerHTML = this._steps();
      this.dispatchEvent(new CustomEvent('kpi-submit', { bubbles: true, composed: true, detail: {
        role, reviews: this._kpis.map((k, i) => ({ kpiId: k.id ?? i, rating: this._review(k, role).rating, comment: this._review(k, role).comment || '' })),
      } }));
      return;
    }
    const sb = e.target.closest('[data-sign]');
    if (sb) {
      const party = sb.dataset.sign, date = new Date().toISOString().slice(0, 10);
      const name = party === 'employee' ? this._data.employee?.name : this._data.managerName;
      this._data.signoffs = { ...this._data.signoffs, [party]: { name: name || 'Signed', date } };
      this.shadowRoot.querySelector('.agreement').outerHTML = this._agreement();
      this.dispatchEvent(new CustomEvent('kpi-sign', { bubbles: true, composed: true, detail: { party, date } }));
      return;
    }
    const h = e.target.closest('[data-history]');
    if (h) {
      const i = +h.closest('[data-kpi]').dataset.kpi;
      this.dispatchEvent(new CustomEvent('kpi-history', { bubbles: true, composed: true, detail: { kpiId: this._kpis[i].id ?? i } }));
    }
  }
}

if (!customElements.get('kpi-appraisal')) customElements.define('kpi-appraisal', KpiAppraisal);
if (typeof window !== 'undefined') window.KpiAppraisal = KpiAppraisal;
