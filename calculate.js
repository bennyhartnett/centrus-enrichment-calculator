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
 * 
 *
 * Usage:
 *  - Include this script in an HTML page with matching element IDs
 *  - Each calculator form should have class ".calculator" wrapping inputs and a button
 *   
 */

// Tiny epsilon to avoid division-by-zero or log(0)
const EPS = 1e-9;
// Maximum iterations for search algorithms
const MAX_ITER = 100;
// In-memory record of the last 20 calculations

// Conversion factors for UF₆ to U mass
const FORM_FACTORS = {
  'UF₆': 352.019328978 / 238.02891,
  'U₃O₈': 842.07873 / (3 * 238.02891),
  'U metal': 1
};
 

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

/**
 * parseFraction
 * Parses a decimal or fraction string like "1/2" into a number.
 * Returns NaN if parsing fails.
 * @param {string} str
 * @returns {number}
 */
function parseFraction(str) {
  return parseFloat(str.trim());
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
function parseAssay(raw) {
  raw = raw.trim();
  if (raw.endsWith('%')) raw = raw.slice(0, -1);
  const num = parseFloat(raw);
  if (isNaN(num)) throw new Error('Invalid assay input');
  const frac = num / 100;
  if (!(frac > EPS && frac < 1 - EPS)) {
    throw new Error('Assay must be between 0 and 100 (exclusive)');
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
function parseMass(raw) {
  const num = parseFloat(raw.trim());
  if (isNaN(num) || num <= 0) throw new Error('Mass must be a positive number');
  return num;
}

/**
 * parseNumeric
 * Parses a simple numeric input (SWU, price) ensuring positive value.
 * @param {string} raw - raw input string
 * @returns {number}
 * @throws Error if invalid or ≤ 0
 */
function parseNumeric(raw) {
  const val = parseFloat(raw.trim());
  if (isNaN(val) || val <= 0) throw new Error('Value must be a positive number');
  return val;
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
  const F = P * (xp - xw) / (xf - xw);
  const W = F - P;
  const swu = P * valueFunction(xp)
            + W * valueFunction(xw)
            - F * valueFunction(xf);
  return { F, W, swu };
}

/**
 * calcFeedAndSwu
 * Direct implementation of the Python reference `calc_feed_and_swu`.
 * Accepts assays in percent just like the Python version and returns feed
 * mass and SWU for a desired product quantity.
 * @param {number} productQuantityKgU - product mass in kilograms of uranium
 * @param {number} productAssayPercent - product assay in percent U‑235
 * @param {number} feedAssayPercent - feed assay in percent U‑235
 * @param {number} tailsAssayPercent - tails assay in percent U‑235
 * @returns {{feed:number, swu:number}}
 */
function calcFeedAndSwu(productQuantityKgU,
                        productAssayPercent,
                        feedAssayPercent = 0.711,
                        tailsAssayPercent = 0.23) {
  const xp = productAssayPercent / 100;
  const xf = feedAssayPercent / 100;
  const xw = tailsAssayPercent / 100;

  if (!(xp > xf && xf > xw)) {
    throw new Error('Assay relationship must satisfy xp > xf > xw');
  }

  const feed = productQuantityKgU * (xp - xw) / (xf - xw);
  const tails = feed - productQuantityKgU;
  const swu = productQuantityKgU * valueFunction(xp)
            + tails * valueFunction(xw)
            - feed * valueFunction(xf);
  return { feed, swu };
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
function findOptimumTails(xp, xf, cf, cs, steps = 10000) {
  let best = { xw: 0, F_per_P: 0, swu_per_P: 0, cost_per_P: Infinity };

  for (let i = 1; i < steps; i++) {
    // avoid xw=0 or xw=xf exactly
    const xw = (xf - EPS) * (i / steps);

    // feed per product
    const Fp = (xp - xw) / (xf - xw);

    // SWU per product
    const swu_p = valueFunction(xp)
      + ((xp - xf) / (xf - xw)) * valueFunction(xw)
      - ((xp - xw) / (xf - xw)) * valueFunction(xf);

    // total cost per product
    const cost = cf * Fp + cs * swu_p;

    if (cost < best.cost_per_P) {
      best = { xw, F_per_P: Fp, swu_per_P: swu_p, cost_per_P: cost };
    }
  }

  return best;
}

 



// --- DOM Binding ---
function init() {
  // Enter key submits the nearest calculator
  document.body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement.tagName === 'INPUT') {
      const form = document.activeElement.closest('.calculator');
      const btn = form && form.querySelector('button.btn-primary');
      if (btn) btn.click();
    }
  });

  const massUnit = 'kg';
  const massForm = 'UF₆';

  document.querySelectorAll('.mass-unit').forEach(span => {
    span.textContent = massForm === 'U metal'
      ? `${massUnit} U`
      : `${massUnit} ${massForm}`;
  });

  document.querySelectorAll('.assay-unit').forEach(span => {
    span.textContent = '% ²³⁵U';
  });

  function byId(id) { return document.getElementById(id); }
  function getAssay(id) { return parseAssay(byId(id).value); }
  function getMass(id) { return parseMass(byId(id).value); }
  function getNum(id)  { return parseNumeric(byId(id).value); }

  function toDisplayMass(kgU) {
    return kgU.toFixed(6);
  }

  const inputParsers = {
    xp1: 'assay', xw1: 'assay', xf1: 'assay',
    p2: 'mass', xp2: 'assay', xw2: 'assay', xf2: 'assay',
    F3: 'mass', xp3: 'assay', xw3: 'assay', xf3: 'assay',
    S4: 'numeric', xp4: 'assay', xw4: 'assay', xf4: 'assay',
    cf5: 'numeric', cs5: 'numeric', xp5: 'assay', xf5: 'assay'
  };


  function validateInput(input) {
    const type = inputParsers[input.id];
    if (!type) return;
    try {
      switch (type) {
        case 'assay':
          parseAssay(input.value);
          break;
        case 'mass':
          parseMass(input.value);
          break;
        default:
          parseNumeric(input.value);
      }
      input.classList.add('is-valid');
    } catch (_) {
      input.classList.remove('is-valid');
    }
  }

  document.querySelectorAll('form.calculator input:not([readonly])')
    .forEach(inp => inp.addEventListener('input', () => {
      validateInput(inp);
    }));

  // Validate all inputs initially so default values get success styling
  document.querySelectorAll('form.calculator input:not([readonly])')
    .forEach(inp => validateInput(inp));

  function setupSyncFields() {
    const groups = {};
    document.querySelectorAll('form.calculator input[id]')
      .forEach(inp => {
        if (inp.hasAttribute('readonly')) return;
        const m = inp.id.match(/^([a-zA-Z]+)\d+$/);
        if (!m) return;
        const base = m[1];
        (groups[base] ||= []).push(inp);
      });

    Object.values(groups).forEach(inputs => {
      if (inputs.length < 2) return;
      inputs.forEach(inp => {
        inp.addEventListener('input', () => {
          inputs.forEach(other => {
            if (other !== inp) {
              other.value = inp.value;
              validateInput(other);
            }
          });
        });
      });
    });
  }

  setupSyncFields();

  // Mode 1 - Feed & SWU for 1 kg
  byId('calc1').addEventListener('click', () => {
    try {
      const xp = getAssay('xp1');
      const xw = getAssay('xw1');
      const xf = getAssay('xf1');
      const res = computeFeedSwuForOneKg(xp, xw, xf);
      byId('feed1').value = res.F.toFixed(6);
      byId('swu1').value = res.swu.toFixed(3);
      copyToClipboard(`${res.F.toFixed(6)} kg, ${res.swu.toFixed(3)} SWU`);
       
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });
  function resetForm(formId) {
    const form = byId(formId);
    form.reset();
    form.querySelectorAll('input').forEach(i => {
      i.value = '';
      i.classList.remove('is-valid', 'is-invalid');
    });
  }

  byId('clear1').addEventListener('click', () => resetForm('form1'));

  // Mode 2 - Feed & SWU from EUP quantity
  byId('calc2').addEventListener('click', () => {
    try {
      const P = getMass('p2');
      const xp = getAssay('xp2');
      const xw = getAssay('xw2');
      const xf = getAssay('xf2');
      const res = computeFeedSwu(xp, xw, xf, P);
      byId('feed2').value = toDisplayMass(res.F);
      byId('swu2').value = res.swu.toFixed(3);
      copyToClipboard(`${toDisplayMass(res.F)} ${massForm}, ${res.swu.toFixed(3)} SWU`);
      
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });
  byId('clear2').addEventListener('click', () => resetForm('form2'));

  // Mode 3 - EUP & SWU from feed quantity
  byId('calc3').addEventListener('click', () => {
    try {
      const F = getMass('F3');
      const xp = getAssay('xp3');
      const xw = getAssay('xw3');
      const xf = getAssay('xf3');
      const res = computeEupSwu(xp, xw, xf, F);
      byId('P3').value = toDisplayMass(res.P);
      byId('swu3').value = res.swu.toFixed(3);
      copyToClipboard(`${toDisplayMass(res.P)} ${massForm}, ${res.swu.toFixed(3)} SWU`);
       
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });
  byId('clear3').addEventListener('click', () => resetForm('form3'));

  // Mode 4 - Feed & EUP from SWU quantity
  byId('calc4').addEventListener('click', () => {
    try {
      const S = getNum('S4');
      const xp = getAssay('xp4');
      const xw = getAssay('xw4');
      const xf = getAssay('xf4');
      const res = computeFeedEupFromSwu(xp, xw, xf, S);
      byId('P4').value = res.P.toFixed(6);
      byId('feed4').value = toDisplayMass(res.F);
      copyToClipboard(`${res.P.toFixed(6)} kg, ${toDisplayMass(res.F)} ${massForm} feed`);
       
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });
  byId('clear4').addEventListener('click', () => resetForm('form4'));

  // Mode 5 - Optimum tails assay
  byId('calc5').addEventListener('click', () => {
    try {
      const cf = getNum('cf5');
      const cs = getNum('cs5');
      const xp = getAssay('xp5');
      const xf = getAssay('xf5');
      const res = findOptimumTails(xp, xf, cf, cs);
      const val = res.xw * 100;
      byId('xw5').value = val.toFixed(3);
      copyToClipboard(`${val.toFixed(3)} %`);
     
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });
  byId('clear5').addEventListener('click', () => resetForm('form5'));
 
  const yearEl = document.getElementById('current-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // When accordion sections expand, keep the header in view
  document.querySelectorAll('#calcModes .accordion-collapse')
    .forEach(el => {
      el.addEventListener('shown.bs.collapse', () => {
        const header = el.previousElementSibling;
        if (header) header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

  // Expose remover globally for inline handlers
  
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}


export {
  computeFeedSwuForOneKg,
  computeFeedSwu,
  calcFeedAndSwu,
  computeEupSwu,
  computeFeedEupFromSwu,
  findOptimumTails
};
