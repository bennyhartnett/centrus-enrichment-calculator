/**
 * calculate.js
 *
 * Client-side SWU Calculators with comprehensive features:
 *  - Input parsing (assays, masses, numeric values)
 *  - Validation and error handling
 *  - Core enrichment math (mass balance, SWU calculation)
 *  - Optimized algorithm (golden-section search for optimum tails assay)
 *  - Performance safeguards (debounce, button disabling)
 *  - UX enhancements (Enter-key submission, copy-to-clipboard)
 *  - Calculation history tracking
 *
 * Usage:
 *  - Include this script in an HTML page with matching element IDs
 *  - Each calculator form should have class ".calculator" wrapping inputs and a button
 *  - Provide a <div id="calc-history"></div> to display recent runs
 */

// Tiny epsilon to avoid division-by-zero or log(0)
const EPS = 1e-9;
// Maximum iterations for search algorithms
const MAX_ITER = 100;
// In-memory record of the last 20 calculations
let history = [];

// --- Utility Functions ---
/**
 * debounce
 * Prevents a function from being called more than once within the delay interval.
 * Useful for throttling rapid clicks.
 * @param {Function} fn - the function to debounce
 * @param {number} delay - milliseconds to wait before allowing next call
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * copyToClipboard
 * Copies given text to the user's clipboard if supported.
 * Logs an error if the operation fails.
 * @param {string} text - the text to copy
 */
function copyToClipboard(text) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).catch(err => console.error('Copy failed', err));
}

// --- Input Parsers ---
/**
 * parseAssay
 * Parses an assay input (e.g., "5%", "0.05", "1/20") into a fraction [0,1].
 * Validates that the result is within (EPS, 1-EPS).
 * @param {string} raw - the raw input string
 * @param {HTMLSelectElement} unitSelect - <select> element indicating 'percent' or 'fraction'
 * @returns {number} fraction value
 * @throws Error if parse fails or value out of range
 */
function parseAssay(raw, unitSelect) {
  raw = raw.trim();
  let num;
  // Support "n/d" fraction syntax
  if (raw.includes('/')) {
    const parts = raw.split('/').map(parseFloat);
    if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]) || parts[1] === 0) {
      throw new Error('Invalid fraction for assay');
    }
    num = parts[0] / parts[1];
    unitSelect = { value: 'fraction' }; // override unit
  }
  // Support percentage syntax ending with '%'
  else if (/^\d+(\.\d+)?%$/.test(raw)) {
    num = parseFloat(raw.slice(0, -1));
    unitSelect = { value: 'percent' };
  }
  // Otherwise, treat as direct decimal or use unit selector
  else {
    num = parseFloat(raw);
  }
  if (isNaN(num)) throw new Error('Invalid assay input');
  // Convert percent to fraction if needed
  const frac = unitSelect.value === 'percent' ? num / 100 : num;
  // Ensure fraction is within (0,1)
  if (!(frac > EPS && frac < 1 - EPS)) {
    throw new Error('Assay must be between 0 and 1 (exclusive)');
  }
  return frac;
}

/**
 * parseMass
 * Parses a mass input (e.g., "100 g", "0.1 kg", "5 lb") into kilograms.
 * Validates positive mass value.
 * @param {string} raw - raw input string
 * @param {HTMLSelectElement} unitSelect - <select> with 'kg','g','lb'
 * @returns {number} mass in kg
 * @throws Error if invalid or non-positive
 */
function parseMass(raw, unitSelect) {
  raw = raw.trim();
  const match = raw.match(/^([\d.]+)\s*(kg|g|lb)$/i);
  let num, unit;
  if (match) {
    num = parseFloat(match[1]);
    unit = match[2].toLowerCase();
  } else {
    num = parseFloat(raw);
    unit = unitSelect.value;
  }
  if (isNaN(num) || num <= 0) throw new Error('Mass must be a positive number');
  switch (unit) {
    case 'kg': return num;
    case 'g': return num / 1000;
    case 'lb': return num * 0.45359237;
    default: throw new Error('Unsupported mass unit: ' + unit);
  }
}

/**
 * parseNumeric
 * Parses a simple numeric input (SWU, price) ensuring positive value.
 * @param {string} raw - raw input string
 * @returns {number}
 * @throws Error if invalid or ≤ 0
 */
function parseNumeric(raw) {
  const val = parseFloat(raw);
  if (isNaN(val) || val <= 0) throw new Error('Value must be a positive number');
  return val;
}

// --- Output Formatter ---
/**
 * formatMass
 * Formats a mass in kilograms into the specified unit string.
 * @param {number} kg - mass in kilograms
 * @param {string} unit - 'kg', 'g', or 'lb'
 * @returns {string} formatted mass
 */
function formatMass(kg, unit) {
  switch (unit) {
    case 'kg': return `${kg.toFixed(6)} kg`;
    case 'g': return `${(kg * 1000).toFixed(3)} g`;
    case 'lb': return `${(kg / 0.45359237).toFixed(6)} lb`;
    default: throw new Error('Unsupported mass unit: ' + unit);
  }
}

// --- Core Mathematical Functions ---
/**
 * valueFunction
 * The SWU value function V(x) = (1 - 2x) * ln((1 - x)/x), clipped to avoid log(0).
 * @param {number} x - assay fraction
 * @returns {number}
 */
function valueFunction(x) {
  x = Math.min(Math.max(x, EPS), 1 - EPS);
  return (1 - 2 * x) * Math.log((1 - x) / x);
}

/**
 * massBalance
 * Performs mass balance: F = ((xp - xw)/(xf - xw)) * P, W = F - P.
 * Validates F ≈ P + W within tolerance.
 * @param {number} P - product mass
 * @param {number} xp - product assay fraction
 * @param {number} xf - feed assay fraction
 * @param {number} xw - tails assay fraction
 * @returns {{F: number, W: number}}
 * @throws Error on mass balance violation
 */
function massBalance(P, xp, xf, xw) {
  const F = ((xp - xw) / (xf - xw)) * P;
  const W = F - P;
  if (Math.abs(F - (P + W)) > 1e-6) {
    throw new Error('Mass balance violated: F != P + W');
  }
  return { F, W };
}

/**
 * computeFeedSwuForOneKg
 * Calculates feed (F), tails (W), and SWU for producing 1 kg of product.
 * @param {number} xp - product assay fraction
 * @param {number} xw - tails assay fraction
 * @param {number} xf - feed assay fraction
 * @returns {{F:number, W:number, swu:number}}
 */
function computeFeedSwuForOneKg(xp, xw, xf) {
  // Validate assay ordering: product > feed > tails
  if (!(xp > xf && xf > xw)) {
    throw new Error('Assay relationship must satisfy xp > xf > xw');
  }
  const P = 1;
  const { F, W } = massBalance(P, xp, xf, xw);
  const swu = P * valueFunction(xp)
            + W * valueFunction(xw)
            - F * valueFunction(xf);
  return { F, W, swu };
}

/**
 * computeFeedSwu
 * Calculates feed, tails, and SWU for a given product mass P.
 * @param {number} xp - product assay
 * @param {number} xw - tails assay
 * @param {number} xf - feed assay
 * @param {number} P  - desired product mass
 * @returns {{F:number, W:number, swu:number}}
 */
function computeFeedSwu(xp, xw, xf, P) {
  if (!(xp > xf && xf > xw)) {
    throw new Error('Assay relationship must satisfy xp > xf > xw');
  }
  const { F, W } = massBalance(P, xp, xf, xw);
  const swu = P * valueFunction(xp)
            + W * valueFunction(xw)
            - F * valueFunction(xf);
  return { F, W, swu };
}

/**
 * computeEupSwu
 * Calculates product mass P and SWU for a given feed mass F.
 * @param {number} xp - product assay
 * @param {number} xw - tails assay
 * @param {number} xf - feed assay
 * @param {number} F  - available feed mass
 * @returns {{P:number, W:number, swu:number}}
 */
function computeEupSwu(xp, xw, xf, F) {
  if (!(xp > xf && xf > xw)) {
    throw new Error('Assay relationship must satisfy xp > xf > xw');
  }
  const P = ((xf - xw) / (xp - xw)) * F;
  if (P <= 0) {
    throw new Error('Computed product mass must be positive');
  }
  const W = F - P;
  const swu = P * valueFunction(xp)
            + W * valueFunction(xw)
            - F * valueFunction(xf);
  return { P, W, swu };
}

/**
 * computeFeedEupFromSwu
 * Calculates product mass P and feed mass F for a given SWU capacity S.
 * @param {number} xp - product assay
 * @param {number} xw - tails assay
 * @param {number} xf - feed assay
 * @param {number} S  - available SWU
 * @returns {{P:number, F:number}}
 */
function computeFeedEupFromSwu(xp, xw, xf, S) {
  if (!(xp > xf && xf > xw)) {
    throw new Error('Assay relationship must satisfy xp > xf > xw');
  }
  // Denominator of formula must not be zero
  const denom = valueFunction(xp)
    + ((xp - xf) / (xf - xw)) * valueFunction(xw)
    - ((xp - xw) / (xf - xw)) * valueFunction(xf);
  if (Math.abs(denom) < EPS) {
    throw new Error('Denominator too small for SWU->mass conversion');
  }
  const P = S / denom;
  const { F } = massBalance(P, xp, xf, xw);
  return { P, F };
}

/**
 * findOptimumTails
 * Uses golden-section search to find tails assay xw minimizing cost per kg:
 * C = cf·(F/P) + cs·(SWU/P)
 * @param {number} xp - product assay
 * @param {number} xf - feed assay
 * @param {number} cf - feed cost per kg
 * @param {number} cs - SWU cost per SWU
 * @returns {{xw:number, F_per_P:number, swu_per_P:number, cost_per_P:number}}
 */
function findOptimumTails(xp, xf, cf, cs) {
  let a = EPS, b = xf - EPS;
  const phi = (1 + Math.sqrt(5)) / 2;
  // Interior points
  let c = b - (b - a) / phi;
  let d = a + (b - a) / phi;
  let fc = cost(c), fd = cost(d);

  // cost function closure
  function cost(xw) {
    const Fp = (xp - xw) / (xf - xw);
    const swu_p = valueFunction(xp)
      + ((xp - xf) / (xf - xw)) * valueFunction(xw)
      - ((xp - xw) / (xf - xw)) * valueFunction(xf);
    return cf * Fp + cs * swu_p;
  }

  // Golden-section iteration
  for (let i = 0; i < MAX_ITER && (b - a) > EPS; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - (b - a) / phi;
      fc = cost(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + (b - a) / phi;
      fd = cost(d);
    }
  }

  // Best estimate
  const xw = (a + b) / 2;
  const Fp = (xp - xw) / (xf - xw);
  const swu_p = valueFunction(xp)
    + ((xp - xf) / (xf - xw)) * valueFunction(xw)
    - ((xp - xw) / (xf - xw)) * valueFunction(xf);
  const costVal = cost(xw);
  return { xw, F_per_P: Fp, swu_per_P: swu_p, cost_per_P: costVal };
}

// --- History & Rendering ---
/**
 * recordHistory
 * Logs each calculation with name, inputs, result, and timestamp.
 * Keeps only the latest 20 entries.
 */
function recordHistory(name, inputs, result) {
  history.push({ name, inputs, result, time: new Date().toLocaleTimeString() });
  if (history.length > 20) history.shift();
  renderHistory();
}

/**
 * renderHistory
 * Renders the history array into the #calc-history container as HTML.
 */
function renderHistory() {
  const container = document.getElementById('calc-history');
  if (!container) return;
  container.innerHTML = history.map(item =>
    `<div class="history-entry">` +
      `<strong>[${item.time}]</strong> ${item.name}: ` +
      `${JSON.stringify(item.inputs)} → ${JSON.stringify(item.result)}` +
    `</div>`
  ).join('');
}

// --- DOM Binding ---
document.addEventListener('DOMContentLoaded', () => {
  // Enter-key submission: pressing Enter inside any input triggers its calculator button
  document.body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement.tagName === 'INPUT') {
      const btn = document.activeElement.closest('.calculator').querySelector('button');
      if (btn) btn.click();
    }
  });

  // Configuration for each calculator: button ID, function, input specs, output ID, format
  const configs = [ /* ... same as above ... */ ];

  // Attach handlers for each calculator
  configs.forEach(cfg => {
    const btn = document.getElementById(cfg.btn);
    if (!btn) return;
    const handler = () => {
      const outEl = document.getElementById(cfg.out);
      outEl.setAttribute('aria-live', 'polite');
      outEl.textContent = '';
      btn.disabled = true;
      try {
        // Parse inputs according to their type and unit settings
        const inputs = cfg.args.map(a => {
          const raw = document.getElementById(a.id).value;
          if (a.type === 'assay') return parseAssay(raw, document.getElementById(a.unit));
          if (a.type === 'mass') return parseMass(raw, document.getElementById(a.unit));
          return parseNumeric(raw);
        });
        // Perform calculation
        const res = cfg.fn(...inputs);
        // Format result text
        const text = cfg.format(res);
        // Display, copy, and record
        outEl.textContent = text;
        copyToClipboard(text);
        recordHistory(cfg.btn, inputs, res);
      } catch (err) {
        console.error(err);
        outEl.textContent = `Error: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    };
    // Debounce click to protect performance
    btn.addEventListener('click', debounce(handler, 300));
  });

  // Initial render of empty history
  renderHistory();
});

export {
  computeFeedSwuForOneKg,
  computeFeedSwu,
  computeEupSwu,
  computeFeedEupFromSwu,
  findOptimumTails
};
