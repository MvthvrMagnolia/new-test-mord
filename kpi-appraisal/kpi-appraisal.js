/**
 * <kpi-appraisal> — reusable KPI appraisal component (no framework, no dependencies).
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
 *       practiceArea: 'Public Sector', reviewPeriod: 'H2 2026 · 1 July – 31 December 2026',
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
 *   heading      card title (default "KPIs")
 *   description  line under the title
 *   signer       employee | manager — shows a Sign button for that party if they have not signed
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
 * Theme from outside with CSS custom properties, e.g. kpi-appraisal { --kpi-brand: #00907a; }
 */

const ROLES = [
  { key: 'self',        who: 'Employee',     role: 'Self-rating', badge: 'E' },
  { key: 'lineManager', who: 'Line manager', role: 'Review',      badge: 'LM' },
  { key: 'pillarLead',  who: 'Pillar Lead',  role: 'Review',      badge: 'PL' },
];
const DEFAULT_LABELS = ['', 'Far Below Expectation', 'Below Expectation', 'Meets Expectation', 'Exceeds Expectation', 'Far Exceeds Expectation'];
const DEFAULT_BANDS = [[4.5, 'Outstanding'], [3.5, 'Exceeds Expectations'], [2.5, 'Meets Expectations'], [0, 'Below Expectations']];

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tone = r => !r ? 'tone-none' : r <= 2 ? 'tone-low' : r === 3 ? 'tone-mid' : 'tone-high';
// Highlight the figures in a target sentence ("… sales of 50,000,000" → 50,000,000 stands out).
const figures = t => esc(t).replace(/([₦$€£]?\d[\d,.]*\s?%?(?:\s?(?:k|m|bn|million|billion))?)/gi, '<em class="fig">$1</em>');
const fmtDate = d => { const x = new Date(d); return isNaN(x) ? esc(d) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
const list = v => (Array.isArray(v) ? v : String(v ?? '').split(/\n|;\s*/)).map(x => String(x).trim()).filter(Boolean);

const ICON = {
  goal: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.3" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="3.3" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r=".9" fill="currentColor"/></svg>',
  history: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.2h2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 5.2V8l2 1.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  measure: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 13.5h12M4 11V8M8 11V4.5M12 11V6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  clock: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  actions: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4.5l1.2 1.2L6.5 3.4M3 10.5l1.2 1.2 2.3-2.3M9 4.5h4.5M9 10.5h4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pen: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const STYLE = `
  :host {
    --brand: var(--kpi-brand, #00907a);
    --brand-deep: var(--kpi-brand-deep, #14352d);
    --brand-soft: var(--kpi-brand-soft, #e3f4ef);
    --brand-ink: var(--kpi-brand-ink, #0b5e50);
    --accent: var(--kpi-accent, #3dbb8f);
    --surface: var(--kpi-surface, #ffffff);
    --inset: var(--kpi-inset, #f7f9f8);
    --ink: var(--kpi-ink, #111816);
    --muted: var(--kpi-muted, #66706c);
    --faint: var(--kpi-faint, #b4bbb8);
    --line: var(--kpi-line, #e3e9e6);
    --track: var(--kpi-track, #e4e8e6);
    --warn: var(--kpi-warn, #d98a12);
    --warn-soft: var(--kpi-warn-soft, #fdf0dc);
    --warn-ink: var(--kpi-warn-ink, #8a5300);
    --display: var(--kpi-display-font, Poppins, system-ui, sans-serif);
    display: block; color: var(--ink);
    font-family: var(--kpi-font, Roboto, system-ui, sans-serif);
    -webkit-font-smoothing: antialiased;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 28px; }

  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  h2 { font-family: var(--display); font-size: 20px; font-weight: 600; letter-spacing: -.3px; }
  .desc { margin-top: 6px; font-size: 14.5px; color: var(--muted); }

  /* Flow stepper */
  .flow { list-style: none; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .flow li { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--faint); }
  .flow li + li::before { content: ""; width: 18px; height: 1.5px; background: var(--track); border-radius: 2px; margin-right: 2px; }
  .flow .n { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; border: 1.5px solid var(--track); background: var(--surface); }
  .flow .done { color: var(--brand-ink); }
  .flow .done .n { color: #fff; background: var(--brand); border-color: var(--brand); }
  .flow .now { color: var(--ink); }
  .flow .now .n { color: var(--brand-ink); border-color: var(--brand); box-shadow: 0 0 0 3px rgba(0,144,122,.15); }

  /* Section I: background */
  .profile { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .profile div { background: var(--surface); padding: 12px 14px; min-width: 0; }
  .profile dt { font-size: 11px; font-weight: 500; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
  .profile dd { margin-top: 3px; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .profile .p-name dd { font-family: var(--display); font-weight: 600; font-size: 15px; }

  /* Overall scores */
  .summary { margin-top: 20px; display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 12px; }
  .sum { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--inset); }
  .sum.active { border-color: rgba(0,144,122,.35); background: var(--brand-soft); }
  .sum-score { text-align: right; }
  .sum-score .big { font-size: 24px; }
  .sum-score .big span { font-size: 13px; }
  .sum-score .label { font-size: 12.5px; margin-top: 2px; }
  .sum-pending { font-size: 13px; color: var(--muted); text-align: right; }
  .sum-pending b { display: block; font-size: 18px; font-family: var(--display); color: var(--ink); }

  .who { display: flex; align-items: center; gap: 10px; }
  .badge { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--brand-ink); background: var(--brand-soft); }
  .sum.active .badge { background: var(--surface); }
  .who-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .who-role { font-size: 12px; color: var(--muted); }
  .you { font-size: 10.5px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; color: #fff; background: var(--brand); padding: 2px 6px; border-radius: 4px; }

  /* KPI */
  .kpi { margin-top: 22px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .target {
    position: relative; display: flex; align-items: center; gap: 24px; padding: 22px 24px; color: #fff;
    background: radial-gradient(120% 140% at 100% 0%, rgba(61,187,143,.35), transparent 55%), linear-gradient(135deg, var(--brand-deep), #1b4a3d);
  }
  .target::after {
    content: ""; position: absolute; right: 120px; top: 50%; width: 132px; height: 84px; transform: translateY(-50%); pointer-events: none;
    background:
      linear-gradient(rgba(255,255,255,.06), rgba(255,255,255,.06)) 0 0 / 40px 40px no-repeat,
      linear-gradient(rgba(255,255,255,.10), rgba(255,255,255,.10)) 46px 0 / 40px 40px no-repeat,
      linear-gradient(rgba(255,255,255,.04), rgba(255,255,255,.04)) 92px 0 / 40px 40px no-repeat,
      linear-gradient(rgba(255,255,255,.04), rgba(255,255,255,.04)) 0 44px / 40px 40px no-repeat,
      linear-gradient(rgba(255,255,255,.06), rgba(255,255,255,.06)) 46px 44px / 40px 40px no-repeat,
      linear-gradient(rgba(255,255,255,.10), rgba(255,255,255,.10)) 92px 44px / 40px 40px no-repeat;
  }
  .target-main { flex: 1; min-width: 0; position: relative; z-index: 1; }
  .eyebrow { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 500; letter-spacing: .8px; text-transform: uppercase; color: rgba(255,255,255,.65); }
  .eyebrow .dot { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.4); }
  .t-value { margin-top: 10px; font-family: var(--display); font-weight: 600; font-size: 22px; line-height: 1.3; letter-spacing: -.3px; max-width: 760px; overflow-wrap: anywhere; }
  .t-value .fig { font-style: normal; color: var(--accent); white-space: nowrap; }
  .t-desc { margin-top: 8px; display: flex; align-items: flex-start; gap: 6px; font-size: 13.5px; line-height: 1.45; color: rgba(255,255,255,.8); max-width: 760px; }
  .t-desc svg { flex: none; margin-top: 2px; }

  /* How the KPI is measured, reviewed and delivered */
  .specs { display: grid; grid-template-columns: repeat(var(--specs), 1fr); border-bottom: 1px solid var(--line); background: var(--inset); }
  .spec { display: flex; gap: 10px; padding: 14px 22px; min-width: 0; }
  .spec + .spec { border-left: 1px solid var(--line); }
  .spec-ico { flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--brand-ink); background: var(--brand-soft); }
  .spec dt { font-size: 11px; font-weight: 500; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
  .spec dd { margin-top: 3px; font-size: 13.5px; line-height: 1.45; overflow-wrap: anywhere; }
  .spec ul { list-style: none; display: flex; flex-direction: column; gap: 3px; }
  .spec li { position: relative; padding-left: 12px; }
  .spec li::before { content: ""; position: absolute; left: 0; top: .6em; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
  .weight { position: relative; z-index: 1; flex: none; width: 76px; height: 76px; display: grid; place-items: center; }
  .weight svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  .weight b { font-family: var(--display); font-size: 18px; font-weight: 600; line-height: 1; }
  .weight small { display: block; margin-top: 3px; font-size: 10px; letter-spacing: .6px; text-transform: uppercase; color: rgba(255,255,255,.7); text-align: center; }

  .reviews { display: grid; grid-template-columns: repeat(var(--cols), 1fr); }
  .review { padding: 20px 22px 22px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .review + .review { border-left: 1px solid var(--line); }
  .review.editing { background: linear-gradient(180deg, rgba(0,144,122,.05), transparent 70%); }

  .rating { display: flex; align-items: center; gap: 14px; }
  .big { font-family: var(--display); font-size: 30px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .big span { font-size: 14px; font-weight: 500; color: var(--faint); }
  .scale { display: flex; gap: 4px; margin-top: 6px; }
  .scale i { width: 22px; height: 6px; border-radius: 3px; background: var(--track); }
  .label { font-size: 14px; font-weight: 500; }
  .meta { font-size: 12.5px; color: var(--muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
  .tone-low .big, .tone-low .label { color: var(--warn-ink); }
  .tone-low .scale i.on { background: var(--warn); }
  .tone-mid .big, .tone-mid .label { color: var(--brand); }
  .tone-mid .scale i.on { background: var(--brand); }
  .tone-high .big, .tone-high .label { color: var(--brand-ink); }
  .tone-high .scale i.on { background: var(--brand-ink); }
  .tone-none .label { color: var(--muted); font-weight: 400; }

  .comment { font-size: 13.5px; line-height: 1.5; padding: 10px 12px 10px 14px; border-radius: 10px; background: var(--inset); border-left: 3px solid var(--brand); overflow-wrap: anywhere; }
  .tone-low .comment { border-left-color: var(--warn); }
  .comment.none { background: none; border-left-color: var(--line); color: var(--faint); font-style: italic; }
  .waiting { font-size: 13.5px; color: var(--faint); font-style: italic; }

  /* Editable rating */
  .picker { border: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; max-width: 340px; }
  .picker label { position: relative; cursor: pointer; }
  .picker input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
  .picker span {
    display: grid; place-items: center; height: 44px; border-radius: 10px;
    font-family: var(--display); font-size: 17px; font-weight: 600; color: var(--muted);
    background: var(--surface); border: 1.5px solid var(--line); transition: background 150ms, border-color 150ms, color 150ms, transform 150ms;
  }
  .picker label:hover span { border-color: var(--faint); color: var(--ink); }
  .picker input:focus-visible + span { outline: 2px solid var(--brand); outline-offset: 2px; }
  .picker input:checked + span { color: #fff; transform: translateY(-1px); }
  .tone-low .picker input:checked + span { background: var(--warn); border-color: var(--warn); }
  .tone-mid .picker input:checked + span { background: var(--brand); border-color: var(--brand); }
  .tone-high .picker input:checked + span { background: var(--brand-ink); border-color: var(--brand-ink); }
  .pick-meta { display: flex; align-items: baseline; gap: 10px; min-height: 20px; }
  .pick-meta .meta { margin-top: 0; }
  textarea {
    width: 100%; resize: vertical; min-height: 64px; font: 13.5px/1.5 inherit; font-family: inherit; color: var(--ink);
    padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface);
  }
  textarea:focus { outline: 2px solid var(--brand); outline-offset: -1px; border-color: transparent; }
  .solo .review.editing { display: grid; grid-template-columns: minmax(0, 340px) 1fr; grid-template-rows: auto 1fr; column-gap: 32px; row-gap: 14px; }
  .solo .review.editing .who { grid-column: 1 / -1; }
  .solo .review.editing .rate-block { display: flex; flex-direction: column; gap: 10px; }
  .rate-block { display: flex; flex-direction: column; gap: 10px; }

  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 22px; border-top: 1px solid var(--line); background: var(--inset); min-height: 50px; }
  .gap { font-size: 12.5px; color: var(--muted); }
  .gap b { color: var(--warn-ink); font-weight: 600; }
  .gap.agree b { color: var(--brand-ink); }
  .link { appearance: none; border: 0; background: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font: 500 13px inherit; font-family: inherit; color: var(--brand-ink); padding: 6px 8px; border-radius: 8px; margin-left: auto; white-space: nowrap; }
  .link:hover { background: var(--brand-soft); }

  /* Section III: signatures & date */
  .agreement { margin-top: 22px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
  .agree-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--line); background: var(--inset); }
  .agree-head h3 { font-size: 14px; font-weight: 600; }
  .agree-head p { font-size: 12.5px; color: var(--muted); }
  .signs { display: grid; grid-template-columns: 1fr 1fr; }
  .sign { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; min-width: 0; }
  .sign + .sign { border-left: 1px solid var(--line); }
  .sign-who { font-size: 11px; font-weight: 500; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
  .sign-name { margin-top: 3px; font-family: var(--display); font-size: 16px; font-weight: 600; font-style: italic; }
  .sign-date { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
  .sign-ok { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; color: var(--brand-ink); background: var(--brand-soft); padding: 4px 10px; border-radius: 999px; }
  .sign-wait { margin-top: 3px; font-size: 13.5px; color: var(--faint); font-style: italic; }
  .sign-btn { flex: none; appearance: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font: 500 13px inherit; font-family: inherit; color: #fff; background: var(--brand-deep); border: 0; padding: 8px 14px; border-radius: 9px; }

  /* Submit bar */
  .actions { margin-top: 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px 14px 20px; border-radius: 12px; background: var(--inset); border: 1px solid var(--line); }
  .progress { display: flex; align-items: center; gap: 12px; font-size: 13.5px; color: var(--muted); }
  .bar { width: 120px; height: 6px; border-radius: 999px; background: var(--track); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--brand); border-radius: inherit; transition: width 200ms; }
  .submit {
    appearance: none; cursor: pointer; border: 0; display: inline-flex; align-items: center; gap: 8px;
    font: 500 14px inherit; font-family: inherit; color: #fff; background: var(--brand-deep);
    padding: 11px 18px; border-radius: 10px; transition: opacity 150ms;
  }
  .submit:hover { background: #0f2a23; }
  .submit:disabled { opacity: .4; cursor: not-allowed; }
  .submitted { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 500; color: var(--brand-ink); }

  .weight-note { margin-top: 10px; font-size: 12.5px; color: var(--muted); }
  .weight-note.off { color: var(--warn-ink); }

  @media (max-width: 860px) {
    .summary, .reviews, .specs, .signs { grid-template-columns: 1fr; }
    .review + .review, .spec + .spec, .sign + .sign { border-left: 0; border-top: 1px solid var(--line); }
    .target::after { display: none; }
    .solo .review.editing { display: flex; }
  }
  @media (max-width: 480px) {
    .card { padding: 18px; }
    .target { padding: 18px; gap: 14px; }
    .t-value { font-size: 28px; }
    .weight { width: 64px; height: 64px; }
    .actions { flex-direction: column; align-items: stretch; }
    .submit { justify-content: center; }
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
    const w = kpis.reduce((s, k) => s + (k.weight || 0), 0) || 1;
    return kpis.reduce((s, k) => s + this._review(k, role).rating * (k.weight || 0), 0) / w;
  }
  _band(score) { return (this._bands.find(([min]) => score >= min) || [0, ''])[1]; }

  /* ---------- rendering ---------- */

  _render() {
    const visible = this._visible, active = this._active, cols = visible.length;
    const heading = this.getAttribute('heading') || 'KPIs';
    const desc = this.getAttribute('description') ?? (active === 'self'
      ? 'Rate how well you delivered each locked KPI from 1 to 5.'
      : active ? 'Review each KPI. Earlier ratings are shown for reference.' : 'The ratings given for each of your locked KPIs this cycle.');

    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <section class="card ${cols === 1 ? 'solo' : ''}" style="--cols:${cols}">
        <div class="head">
          <div><h2>${esc(heading)}</h2><p class="desc">${esc(desc)}</p></div>
          ${this._flow()}
        </div>
        ${this._profile()}
        <div class="summary" data-summary>${this._summary()}</div>
        ${this._weightNote()}
        ${this._kpis.map((k, i) => this._kpi(k, i)).join('')}
        ${this._agreement()}
        ${active ? `<div class="actions" data-actions>${this._actions()}</div>` : ''}
      </section>`;
  }

  _profile() {
    const e = this._data.employee;
    if (!e) return '';
    const items = [['p-name', 'Name', e.name], ['', 'Grade', e.grade], ['', 'Pillar', e.pillar], ['', 'Practice area', e.practiceArea], ['', 'Review period', e.reviewPeriod]]
      .filter(([, , v]) => v);
    return `<dl class="profile" aria-label="Background information">${items.map(([c, k, v]) => `<div class="${c}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
  }

  _weightNote() {
    const n = this._kpis.length, total = this._kpis.reduce((s, k) => s + (+k.weight || 0), 0);
    if (!n) return '';
    const ok = Math.abs(total - 100) < 0.01;
    return `<p class="weight-note ${ok ? '' : 'off'}">${n} KPI${n === 1 ? '' : 's'} · weights total ${+total.toFixed(2)}%${ok ? '' : ' — the template requires 100%'}. Overall scores are weighted by each KPI's share.</p>`;
  }

  _agreement() {
    const so = this._data.signoffs;
    if (!so) return '';
    const signer = this.getAttribute('signer');
    const party = (key, label) => {
      const s = so[key];
      if (s?.name) return `<div class="sign"><div><div class="sign-who">${label}</div><div class="sign-name">${esc(s.name)}</div><div class="sign-date">${s.date ? 'Signed ' + fmtDate(s.date) : 'Signed'}</div></div><span class="sign-ok">${ICON.check}Signed</span></div>`;
      const btn = signer === key ? `<button class="sign-btn" data-sign="${key}">${ICON.pen}Sign</button>` : '';
      return `<div class="sign"><div><div class="sign-who">${label}</div><div class="sign-wait">Awaiting signature</div></div>${btn}</div>`;
    };
    return `<section class="agreement" aria-label="Signatures and date">
      <div class="agree-head"><h3>KPI agreement</h3><p>Signatures &amp; date</p></div>
      <div class="signs">${party('employee', 'Employee')}${party('manager', 'Manager')}</div>
    </section>`;
  }

  _flow() {
    const idx = this._stageIndex, done = this._submitted;
    return `<ol class="flow" aria-label="Appraisal progress">${ROLES.map((r, i) => {
      const state = i < idx || (i === idx && done) ? 'done' : i === idx ? 'now' : '';
      return `<li class="${state}" ${state === 'now' ? 'aria-current="step"' : ''}><span class="n">${state === 'done' ? ICON.check : i + 1}</span>${esc(r.who)}</li>`;
    }).join('')}</ol>`;
  }

  _summary() {
    const n = this._kpis.length;
    return this._visible.map(r => {
      const score = this._overall(r.key), isActive = r.key === this._active;
      const right = score != null
        ? `<div class="sum-score ${tone(Math.round(score))}"><div class="big">${score.toFixed(2)}<span> / 5</span></div><div class="label">${esc(this._band(score))}</div></div>`
        : `<div class="sum-pending"><b>${this._ratedCount(r.key)} of ${n}</b>rated</div>`;
      return `<div class="sum ${isActive ? 'active' : ''}">${this._who(r, isActive)}${right}</div>`;
    }).join('');
  }

  _who(r, isYou) {
    return `<div class="who"><span class="badge" aria-hidden="true">${r.badge}</span>
      <div><div class="who-name">${esc(r.who)}${isYou ? '<span class="you">You</span>' : ''}</div><div class="who-role">${esc(r.role)}</div></div></div>`;
  }

  _kpi(k, i) {
    const actions = list(k.keyActions);
    const specs = [
      k.measurement && ['measure', 'Measurement method', `<dd>${esc(k.measurement)}</dd>`],
      k.timeline && ['clock', 'Review timeline', `<dd>${esc(k.timeline)}</dd>`],
      actions.length && ['actions', 'Key actions', `<dd><ul>${actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></dd>`],
    ].filter(Boolean);
    const r = 33, c = 2 * Math.PI * r, w = k.weight || 0;
    return `<article class="kpi" data-kpi="${i}">
      <div class="target">
        <div class="target-main">
          <div class="eyebrow">KPI ${i + 1}<span class="dot"></span>Locked</div>
          <h3 class="t-value">${figures(k.target)}</h3>
          ${k.description ? `<p class="t-desc">${ICON.goal}<span>${esc(k.description)}</span></p>` : ''}
        </div>
        <div class="weight" aria-label="Weight ${w}%">
          <svg viewBox="0 0 76 76" width="100%" height="100%" aria-hidden="true">
            <circle cx="38" cy="38" r="${r}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="5"/>
            <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * w / 100).toFixed(1)} ${c.toFixed(1)}"/>
          </svg>
          <div><b>${w}%</b><small>weight</small></div>
        </div>
      </div>
      ${specs.length ? `<dl class="specs" style="--specs:${specs.length}">${specs.map(([ico, t, dd]) => `<div class="spec"><span class="spec-ico">${ICON[ico]}</span><div><dt>${t}</dt>${dd}</div></div>`).join('')}</dl>` : ''}
      <div class="reviews">${this._visible.map(role => role.key === this._active ? this._editor(k, i, role) : this._readonly(k, role)).join('')}</div>
      <div class="foot" data-foot="${i}">${this._foot(k)}</div>
    </article>`;
  }

  _readonly(k, role) {
    const rv = this._review(k, role.key), w = k.weight || 0;
    if (!rv?.rating) return `<div class="review tone-none">${this._who(role)}<p class="waiting">Not rated yet</p></div>`;
    return `<div class="review ${tone(rv.rating)}">
      ${this._who(role)}
      <div class="rating">
        <div><div class="big">${rv.rating}<span> / 5</span></div>
          <div class="scale" aria-hidden="true">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= rv.rating ? 'on' : ''}"></i>`).join('')}</div></div>
        <div><div class="label">${esc(this._labels[rv.rating])}</div><div class="meta">Weighted ${(rv.rating * w / 100).toFixed(2)}</div></div>
      </div>
      ${rv.comment ? `<p class="comment">${esc(rv.comment)}</p>` : '<p class="comment none">No comment provided</p>'}
    </div>`;
  }

  _editor(k, i, role) {
    const rv = this._review(k, role.key) || {}, name = `kpi-${i}`;
    return `<div class="review editing ${tone(rv.rating)}" data-editor="${i}">
      ${this._who(role, true)}
      <div class="rate-block">
        <fieldset class="picker"><legend class="sr">Rating for KPI ${i + 1}</legend>
          ${[1, 2, 3, 4, 5].map(n => `<label title="${esc(this._labels[n])}"><input type="radio" name="${name}" value="${n}" ${rv.rating === n ? 'checked' : ''} aria-label="${n} – ${esc(this._labels[n])}"><span>${n}</span></label>`).join('')}
        </fieldset>
        <div class="pick-meta" data-pickmeta>${this._pickMeta(rv.rating, k.weight)}</div>
      </div>
      <textarea data-comment="${i}" rows="2" placeholder="${role.key === 'self' ? 'What did you deliver? (optional)' : 'Add a comment for the employee (optional)'}" aria-label="Comment for KPI ${i + 1}">${esc(rv.comment)}</textarea>
    </div>`;
  }

  _pickMeta(rating, weight) {
    return rating
      ? `<span class="label">${esc(this._labels[rating])}</span><span class="meta">Weighted ${(rating * (weight || 0) / 100).toFixed(2)}</span>`
      : '<span class="label">Pick a rating from 1 to 5</span>';
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

  _actions() {
    const n = this._kpis.length, rated = this._ratedCount(this._active), all = n > 0 && rated === n;
    if (this._submitted) return `<span class="submitted">${ICON.check} Submitted</span><span class="progress">${rated} of ${n} rated</span>`;
    const label = this._active === 'self' ? 'Submit self-rating' : 'Submit review';
    return `<div class="progress"><div class="bar"><i style="width:${n ? rated / n * 100 : 0}%"></i></div>${all ? 'All KPIs rated' : `${rated} of ${n} rated`}</div>
      <button class="submit" data-submit ${all ? '' : 'disabled'}>${label}</button>`;
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
      this.shadowRoot.querySelector('.flow').outerHTML = this._flow();
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
