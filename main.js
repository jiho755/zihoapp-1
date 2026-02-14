// Lottery Number Generator Logic

document.addEventListener('DOMContentLoaded', () => {
  const numberBalls = document.querySelectorAll('.number-ball');
  const generateButton = document.getElementById('generate-button');

  const MIN_NUMBER = 1;
  const MAX_NUMBER = 45;
  const NUM_BALLS = 6;

  function generateLotteryNumbers() {
    const numbers = new Set();
    while (numbers.size < NUM_BALLS) {
      const randomNumber = Math.floor(Math.random() * (MAX_NUMBER - MIN_NUMBER + 1)) + MIN_NUMBER;
      numbers.add(randomNumber);
    }
    return Array.from(numbers).sort((a, b) => a - b);
  }

  function updateNumberDisplay(generatedNumbers) {
    numberBalls.forEach((ball, index) => {
      // Add a slight delay for a "reveal" effect
      setTimeout(() => {
        ball.textContent = generatedNumbers[index];
        ball.style.transform = 'scale(1.1)'; // Pop out slightly
        ball.style.backgroundColor = getRandomColor(); // Change color
        setTimeout(() => {
          ball.style.transform = 'scale(1)'; // Return to normal size
        }, 200);
      }, index * 100); // Stagger the animation
    });
  }

  function getRandomColor() {
    const colors = [
      '#e74c3c', // red
      '#f39c12', // orange
      '#f1c40f', // yellow
      '#2ecc71', // green
      '#3498db', // blue
      '#9b59b6', // purple
      '#1abc9c'  // turquoise
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  generateButton.addEventListener('click', () => {
    const generatedNumbers = generateLotteryNumbers();
    updateNumberDisplay(generatedNumbers);
  });

  // Initial display (optional, can generate numbers on load or keep '?' )
  // updateNumberDisplay(generateLotteryNumbers());
});
