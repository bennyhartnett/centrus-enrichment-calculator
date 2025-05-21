# Centrus Enrichment Calculator

<p align="center">
  <img src="assets/centrus-logo.svg" alt="Centrus Energy Logo" width="240"/>
</p>

A lightweight, client-side tool for exploring uranium enrichment scenarios. The calculators are implemented in plain JavaScript and styled with Bootstrap.

## Features
- **Feed & SWU for 1 kg product** – determine feed and separative work required for a single kilogram of enriched uranium.
- **Feed & SWU from product quantity** – compute input requirements for a specified product mass.
- **Product & SWU from feed quantity** – estimate how much enriched uranium can be produced from a feed stock.
- **Feed & product from SWU capacity** – calculate material flows when you know the available SWU.
- **Optimum tails assay** – search for the economic tails assay that minimizes cost per kilogram.

Each calculation copies its result to the clipboard and is logged in a history section for reference.

## Formulas and Calculations
The calculators implement the standard mass balance and separative work unit (SWU) equations used in the
nuclear fuel cycle. The key relationships are:

- **Value function** \(V(x) = (1 - 2x) \ln((1-x)/x)\). This describes the enrichment value of material at assay fraction \(x\).
- **Mass balance** for a product mass \(P\) with assays \(x_p\) (product), \(x_f\) (feed) and \(x_w\) (tails):
  \[F = \frac{x_p - x_w}{x_f - x_w} P, \quad W = F - P\]
- **SWU requirement** for that scenario:
  \[\text{SWU} = P\,V(x_p) + W\,V(x_w) - F\,V(x_f)\]

Additional calculators determine output quantities for given feed or SWU capacity and search for the optimum
tails assay that minimizes the cost per kilogram using a goldenâ€“section search algorithm.

## Usage
1. Clone or download this repository.
2. Open `enrichment-calculator.html` in any modern web browser.
3. Enter your desired inputs and press **Calculate**.

No build step or local server is required—everything runs entirely in the browser.

## Development
The algorithms live in [`calculate.js`](calculate.js). Input parsing, error handling and history tracking are included. Bootstrap and Bootstrap Icons are loaded from public CDNs.

Feel free to modify the HTML or JavaScript to suit your needs.

## License
No license has been specified.

