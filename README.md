# Centrus Enrichment Calculator

A lightweight, client-side tool for exploring uranium enrichment scenarios. The calculators are implemented in plain JavaScript and styled with Bootstrap.

## Features
- **Feed & SWU for 1 kg product** – determine feed and separative work required for a single kilogram of enriched uranium.
- **Feed & SWU from product quantity** – compute input requirements for a specified product mass.
- **Product & SWU from feed quantity** – estimate how much enriched uranium can be produced from a feed stock.
- **Feed & product from SWU capacity** – calculate material flows when you know the available SWU.
- **Optimum tails assay** – search for the economic tails assay that minimizes cost per kilogram.

Each calculation copies its result to the clipboard and is logged in a history section for reference.

## Usage
1. Clone or download this repository.
2. Open `enrichment-calculator.html` in any modern web browser.
3. Enter your desired inputs and press **Calculate**.

No build step or local server is required—everything runs entirely in the browser.

## Live Site
A live demo is available at [bennyhartnett.com/enrichment-calculator.html](https://bennyhartnett.com/enrichment-calculator.html).

## Development
The algorithms live in [`calculate.js`](calculate.js). Input parsing, error handling and history tracking are included. Bootstrap and Bootstrap Icons are loaded from public CDNs.

Feel free to modify the HTML or JavaScript to suit your needs.

## License
No license has been specified.

