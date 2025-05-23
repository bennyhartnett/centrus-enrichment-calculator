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

// Conversion factors for unit toggling
const UNIT_FACTORS = { kg: 1, lb: 2.20462262185 };
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
  str = str.trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length !== 2) return NaN;
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (isNaN(num) || isNaN(den) || den === 0) return NaN;
    return num / den;
  }
  return parseFloat(str);
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
function parseMass(raw, unitSelect, formSelect = { value: 'UF₆' }) {
  raw = raw.trim();
  const match = raw.match(/^([\d./]+)\s*(kg|g|lb)$/i);
  let num, unit;
  if (match) {
    num = parseFraction(match[1]);
    unit = match[2].toLowerCase();
  } else {
    num = parseFraction(raw);
    unit = unitSelect.value;
  }
  if (isNaN(num) || num <= 0) throw new Error('Mass must be a positive number');
  switch (unit) {
    case 'kg': break;
    case 'g': num /= 1000; break;
    case 'lb': num *= 0.45359237; break;
    default: throw new Error('Unsupported mass unit: ' + unit);
  }
  const formFactor = FORM_FACTORS[formSelect.value] || 1;
  return num / formFactor;
}

/**
 * parseNumeric
 * Parses a simple numeric input (SWU, price) ensuring positive value.
 * @param {string} raw - raw input string
 * @returns {number}
 * @throws Error if invalid or ≤ 0
 */
function parseNumeric(raw) {
  const val = parseFraction(raw);
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

 



// --- DOM Binding ---
function init() {
  // Enter key submits the nearest calculator
  document.body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement.tagName === 'INPUT') {
      const form = document.activeElement.closest('.calculator');
      const btn = form && form.querySelector('button.btn-primary');
      if (btn && !btn.disabled) {
        btn.click();
      } else if (btn && btn.disabled) {
        highlightInvalid(form, true);
      }
    }
  });

  const fracUnit = { value: 'fraction' };
  const massUnit = { value: 'kg' };
  const massForm = { value: 'UF₆' };

  function byId(id) { return document.getElementById(id); }
  function getAssay(id) { return parseAssay(byId(id).value, fracUnit); }
  function getMass(id) { return parseMass(byId(id).value, massUnit, massForm); }
  function getNum(id)  { return parseNumeric(byId(id).value); }

  function toDisplayMass(kgU) {
    const kgForm = kgU * FORM_FACTORS[massForm.value];
    return formatMass(kgForm, massUnit.value).replace(/ .*/, '');
  }

  const inputParsers = {
    xp1: 'assay', xw1: 'assay', xf1: 'assay',
    p2: 'mass', xp2: 'assay', xw2: 'assay', xf2: 'assay',
    F3: 'mass', xp3: 'assay', xw3: 'assay', xf3: 'assay',
    S4: 'numeric', xp4: 'assay', xw4: 'assay', xf4: 'assay',
    cf5: 'numeric', cs5: 'numeric', xp5: 'assay', xf5: 'assay'
  };

  function checkFormValidity(form) {
    let valid = true;
    const invalid = [];
    form.querySelectorAll('input[id]:not([readonly])').forEach(inp => {
      const type = inputParsers[inp.id];
      if (!type) return;
      try {
        switch (type) {
          case 'assay':
            parseAssay(inp.value, fracUnit);
            break;
          case 'mass':
            parseMass(inp.value, massUnit, massForm);
            break;
          default:
            parseNumeric(inp.value);
        }
      } catch (_) {
        valid = false;
        invalid.push(inp);
      }
    });
    return { valid, invalid };
  }

  function updateCalculateButtons() {
    document.querySelectorAll('form.calculator').forEach(form => {
      const { valid } = checkFormValidity(form);
      const btn = form.querySelector('button.btn-primary');
      if (btn) btn.disabled = !valid;
    });
  }

  function highlightInvalid(form, on) {
    form.querySelectorAll('input.is-invalid').forEach(i => i.classList.remove('is-invalid'));
    if (!on) return;
    const { invalid } = checkFormValidity(form);
    invalid.forEach(inp => inp.classList.add('is-invalid'));
  }

  function validateInput(input) {
    const type = inputParsers[input.id];
    if (!type) return;
    try {
      switch (type) {
        case 'assay':
          parseAssay(input.value, fracUnit);
          break;
        case 'mass':
          parseMass(input.value, massUnit, massForm);
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
      updateCalculateButtons();
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
  updateCalculateButtons();

  document.querySelectorAll('form.calculator').forEach(form => {
    const btn = form.querySelector('button.btn-primary');
    if (!btn) return;
    btn.addEventListener('mouseenter', () => {
      if (btn.disabled) highlightInvalid(form, true);
    });
    btn.addEventListener('mouseleave', () => highlightInvalid(form, false));
  });

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
    updateCalculateButtons();
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
      copyToClipboard(`${toDisplayMass(res.F)} ${massForm.value}, ${res.swu.toFixed(3)} SWU`);
      
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
      copyToClipboard(`${toDisplayMass(res.P)} ${massForm.value}, ${res.swu.toFixed(3)} SWU`);
       
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
      copyToClipboard(`${res.P.toFixed(6)} kg, ${toDisplayMass(res.F)} ${massForm.value} feed`);
       
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  });
  byId('clear4').addEventListener('click', () => resetForm('form4'));

  // Mode 5 - Optimum tails assay
  byId('calc5').addEventListener('click', () => {
    try {
      const cf = getNum('cf5') / FORM_FACTORS[massForm.value];
      const cs = getNum('cs5');
      const xp = getAssay('xp5');
      const xf = getAssay('xf5');
      const res = findOptimumTails(xp, xf, cf, cs);
      const xwPercent = res.xw * 100;
      byId('xw5').value = xwPercent.toFixed(3);
      copyToClipboard(`${xwPercent.toFixed(3)} %`);
     
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
  computeEupSwu,
  computeFeedEupFromSwu,
  findOptimumTails
};
