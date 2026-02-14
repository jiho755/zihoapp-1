// Add JS here

const verses = [
  {
    text: "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.",
    reference: "John 3:16",
    blanks: ["God", "loved", "world", "gave", "Son", "believes", "perish", "eternal", "life"]
  },
  {
    text: "The Lord is my shepherd; I shall not want.",
    reference: "Psalm 23:1",
    blanks: ["Lord", "shepherd", "want"]
  },
  {
    text: "I can do all things through Christ who strengthens me.",
    reference: "Philippians 4:13",
    blanks: ["all", "Christ", "strengthens", "me"]
  },
  {
    text: "Trust in the Lord with all your heart, and do not lean on your own understanding.",
    reference: "Proverbs 3:5",
    blanks: ["Trust", "Lord", "heart", "lean", "understanding"]
  },
  {
    text: "But seek first the kingdom of God and his righteousness, and all these things will be added to you.",
    reference: "Matthew 6:33",
    blanks: ["seek", "first", "kingdom", "God", "righteousness", "added"]
  }
];

let currentVerse = {};
let score = 0;
let blanksFilled = 0;
let totalBlanks = 0;

const verseDisplay = document.getElementById('verse-display');
const userInput = document.getElementById('user-input');
const checkButton = document.getElementById('check-button');
const nextButton = document.getElementById('next-button');
const feedbackElement = document.getElementById('feedback');
const scoreElement = document.getElementById('score');

function selectRandomVerse() {
  const randomIndex = Math.floor(Math.random() * verses.length);
  currentVerse = { ...verses[randomIndex] }; // Create a copy to modify
  totalBlanks = currentVerse.blanks.length;
  blanksFilled = 0;
}

function displayVerse() {
  verseDisplay.innerHTML = '';
  feedbackElement.textContent = '';
  feedbackElement.className = 'feedback';
  userInput.value = '';
  userInput.focus();
  checkButton.disabled = false;

  const words = currentVerse.text.split(/(\b\w+\b|[^\w\s]+)/g).filter(word => word.trim() !== '');

  words.forEach(word => {
    const span = document.createElement('span');
    span.classList.add('verse-word');

    if (currentVerse.blanks.includes(word.replace(/[.,!?;:]$/, ''))) {
      const blankInput = document.createElement('input');
      blankInput.type = 'text';
      blankInput.classList.add('blank-input');
      blankInput.dataset.original = word.replace(/[.,!?;:]$/, ''); // Store original word without punctuation
      blankInput.placeholder = '____';
      blankInput.maxLength = word.length + 2; // Allow for slight typo + punctuation
      blankInput.addEventListener('input', () => {
        checkButton.disabled = !Array.from(document.querySelectorAll('.blank-input')).some(input => input.value.trim() !== '');
      });
      blankInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          checkAnswer();
        }
      });
      span.appendChild(blankInput);
    } else {
      span.textContent = word;
    }
    verseDisplay.appendChild(span);
    verseDisplay.appendChild(document.createTextNode(' ')); // Add space between words
  });

  const referenceSpan = document.createElement('span');
  referenceSpan.classList.add('verse-reference');
  referenceSpan.textContent = `(${currentVerse.reference})`;
  verseDisplay.appendChild(referenceSpan);

  // Focus on the first blank input if available
  const firstBlankInput = document.querySelector('.blank-input');
  if (firstBlankInput) {
    firstBlankInput.focus();
  }
}


function checkAnswer() {
  let allCorrect = true;
  blanksFilled = 0;
  const blankInputs = document.querySelectorAll('.blank-input');

  blankInputs.forEach(input => {
    const originalWord = input.dataset.original;
    const userAnswer = input.value.trim();

    if (userAnswer.toLowerCase() === originalWord.toLowerCase()) {
      input.disabled = true;
      input.style.backgroundColor = '#d4edda'; // Light green for correct
      input.style.borderColor = '#28a745';
      blanksFilled++;
    } else {
      allCorrect = false;
      input.style.backgroundColor = '#f8d7da'; // Light red for incorrect
      input.style.borderColor = '#dc3545';
    }
  });

  if (allCorrect && blanksFilled === totalBlanks) {
    feedbackElement.textContent = 'Correct! Well done!';
    feedbackElement.classList.remove('incorrect');
    feedbackElement.classList.add('correct');
    score++;
    scoreElement.textContent = `Score: ${score}`;
    checkButton.disabled = true;
    nextButton.disabled = false;
  } else if (blanksFilled === totalBlanks) {
    feedbackElement.textContent = 'Some blanks are incorrect. Try again!';
    feedbackElement.classList.remove('correct');
    feedbackElement.classList.add('incorrect');
    checkButton.disabled = true;
    nextButton.disabled = false;
  } else {
    feedbackElement.textContent = 'Keep going! Fill in the remaining blanks.';
    feedbackElement.classList.remove('correct', 'incorrect');
  }
}

function initGame() {
  selectRandomVerse();
  displayVerse();
  nextButton.disabled = true;
  checkButton.disabled = true; // Disable until user types something
}

checkButton.addEventListener('click', checkAnswer);
nextButton.addEventListener('click', initGame);

// Initial game load
initGame();