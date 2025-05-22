# Centrus Enrichment Calculator

<p align="center">
  <!-- Approximated Centrus Energy logo. Replace with official artwork if available. -->
  <img src="assets/centrus-energy-logo.svg" alt="Centrus Energy Logo" width="240"/>
</p>

A lightweight, browser-based tool for exploring uranium enrichment scenarios. All calculations run entirely client-side using plain JavaScript, so the page works offline after the initial load. This project is **not** affiliated with Centrus Energy and is provided only as an educational resource.

## Table of Contents
- [Getting Started](#getting-started)
- [Features](#features)
- [Usage](#usage)
- [Formulas](#formulas)
- [Development](#development)
- [License](#license)
- [Live Site](#live-site)

## Getting Started
1. Clone or download this repository.
2. Open `enrichment-calculator.html` in any modern web browser.
3. Enter your desired inputs and press **Calculate**.
4. Results are copied to your clipboard and also appear in the history panel.

## Features
- **Feed & SWU for 1 kg product** – determine feed and separative work required for a single kilogram of enriched uranium.
- **Feed & SWU from product quantity** – compute input requirements for a specified product mass.
- **Product & SWU from feed quantity** – estimate how much enriched uranium can be produced from a feed stock.
- **Feed & product from SWU capacity** – calculate material flows when you know the available SWU.
- **Optimum tails assay** – search for the economic tails assay that minimizes cost per kilogram.

Each calculation automatically copies its result to the clipboard and is logged in the on-page history section for later reference.

## Usage
Open `enrichment-calculator.html` in your browser and fill in the values for the desired calculation. Press **Calculate** to see the results. Use the **Clear** button to reset a form if needed. No build step or server is required—everything runs entirely in the browser.

## Live Site
A live demo is available at [bennyhartnett.com/enrichment-calculator.html](https://bennyhartnett.com/enrichment-calculator.html).

## Formulas
The calculators implement the standard mass balance and separative work unit (SWU) equations used in the nuclear fuel cycle. The key relationships are shown below using MathJax notation.

1. **Value function**
   $$
   V(x) = (1 - 2x) \ln\left(\frac{1-x}{x}\right)
   $$
2. **Mass balance** for a product mass $P$ with assays $x_p$ (product), $x_f$ (feed) and $x_w$ (tails)
   $$
   F = \frac{x_p - x_w}{x_f - x_w} P,\quad W = F - P
   $$
3. **SWU requirement** for that scenario
   $$
   \text{SWU} = P\,V(x_p) + W\,V(x_w) - F\,V(x_f)
   $$
4. **Product from feed**
   $$
   P = \frac{x_f - x_w}{x_p - x_w} F
   $$
5. **Product from SWU capacity**
   $$
   P = \frac{S}{V(x_p) + \frac{x_p - x_f}{x_f - x_w} V(x_w) - \frac{x_p - x_w}{x_f - x_w} V(x_f)}
   $$
6. **Cost per kilogram** (used in the optimum tails search)
   $$
   C = c_f \frac{F}{P} + c_s \frac{\text{SWU}}{P}
   $$

Additional calculators determine output quantities for given feed or SWU capacity and search for the optimum tails assay that minimizes the cost per kilogram using a golden-section search algorithm.

## Development
The algorithms live in [`calculate.js`](calculate.js). Input parsing, error handling and history tracking are included. Bootstrap and Bootstrap Icons are loaded from public CDNs. Feel free to modify the HTML or JavaScript to suit your needs.

