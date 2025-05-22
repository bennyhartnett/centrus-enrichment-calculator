// gradient.js
// Dynamically cycles background gradients behind the page content

// Array of gradient color pairs
const gradients = [
  ['#ff5f6d', '#ffc371'],  // orange to yellow
  ['#24c6dc', '#514a9d'],  // teal to violet
  ['#ff512f', '#dd2476'],  // red to magenta
  ['#00d2ff', '#3a7bd5']   // light blue to darker blue
];

let index = 0;

function applyGradient() {
  const [start, end] = gradients[index];
  document.body.style.background = `linear-gradient(135deg, ${start}, ${end})`;
  index = (index + 1) % gradients.length;
}

document.addEventListener('DOMContentLoaded', () => {
  applyGradient();
  // Change gradient every 5 seconds
  setInterval(applyGradient, 5000);
});
