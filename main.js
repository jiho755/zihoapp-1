// Bible Viewer Logic

document.addEventListener('DOMContentLoaded', () => {
  const bibleData = {
    "Genesis": {
      "1": {
        "1": "In the beginning, God created the heavens and the earth.",
        "2": "The earth was without form and void, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters.",
        "3": "And God said, “Let there be light,” and there was light."
      },
      "2": {
        "1": "Thus the heavens and the earth were finished, and all the host of them.",
        "2": "And on the seventh day God finished his work that he had done, and he rested on the seventh day from all his work that he had done.",
        "3": "So God blessed the seventh day and made it holy, because on it God rested from all his work that he had done in creation."
      }
    },
    "John": {
      "1": {
        "1": "In the beginning was the Word, and the Word was with God, and the Word was God.",
        "2": "He was in the beginning with God.",
        "3": "All things were made through him, and without him was not anything made that was made."
      },
      "3": {
        "16": "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.",
        "17": "For God did not send his Son into the world to condemn the world, but in order that the world might be saved through him."
      }
    }
  };

  const bookSelect = document.getElementById('book-select');
  const chapterSelect = document.getElementById('chapter-select');
  const verseSelect = document.getElementById('verse-select');
  const bibleTextDisplay = document.getElementById('bible-text-display');
  const prevChapterBtn = document.getElementById('prev-chapter');
  const nextChapterBtn = document.getElementById('next-chapter');

  let currentBook = '';
  let currentChapter = 0;
  let currentVerse = 0;

  function populateBooks() {
    bookSelect.innerHTML = '<option value="">Select Book</option>';
    for (const book in bibleData) {
      const option = document.createElement('option');
      option.value = book;
      option.textContent = book;
      bookSelect.appendChild(option);
    }
  }

  function populateChapters(book) {
    chapterSelect.innerHTML = '<option value="">Select Chapter</option>';
    if (book && bibleData[book]) {
      for (const chapter in bibleData[book]) {
        const option = document.createElement('option');
        option.value = chapter;
        option.textContent = `Chapter ${chapter}`;
        chapterSelect.appendChild(option);
      }
    }
    verseSelect.innerHTML = '<option value="">Select Verse</option>'; // Clear verses when chapter changes
  }

  function populateVerses(book, chapter) {
    verseSelect.innerHTML = '<option value="">Select Verse</option>';
    if (book && chapter && bibleData[book] && bibleData[book][chapter]) {
      for (const verse in bibleData[book][chapter]) {
        const option = document.createElement('option');
        option.value = verse;
        option.textContent = `Verse ${verse}`;
        verseSelect.appendChild(option);
      }
    }
  }

  function displayBibleText() {
    if (currentBook && currentChapter && currentVerse &&
        bibleData[currentBook] && bibleData[currentBook][currentChapter] &&
        bibleData[currentBook][currentChapter][currentVerse]) {
      bibleTextDisplay.innerHTML = `<p><span class="verse-number">${currentVerse}.</span> ${bibleData[currentBook][currentChapter][currentVerse]}</p>`;
    } else if (currentBook && currentChapter && bibleData[currentBook] && bibleData[currentBook][currentChapter]) {
        // If only chapter is selected, display all verses in that chapter
        let chapterText = '';
        for (const verseNum in bibleData[currentBook][currentChapter]) {
            chapterText += `<p><span class="verse-number">${verseNum}.</span> ${bibleData[currentBook][currentChapter][verseNum]}</p>`;
        }
        bibleTextDisplay.innerHTML = chapterText;
    }
    else {
      bibleTextDisplay.innerHTML = '<p>Select a book, chapter, and verse to view the Bible text.</p>';
    }
  }

  function updateNavigationButtons() {
    const books = Object.keys(bibleData);
    const currentBookIndex = books.indexOf(currentBook);
    const chapters = currentBook ? Object.keys(bibleData[currentBook]) : [];
    const currentChapterIndex = chapters.indexOf(String(currentChapter)); // Convert to string for comparison

    prevChapterBtn.disabled = true;
    nextChapterBtn.disabled = true;

    if (currentBook && currentChapter) {
        // Check previous chapter
        if (currentChapterIndex > 0) {
            prevChapterBtn.disabled = false;
        } else if (currentBookIndex > 0) {
            const prevBook = books[currentBookIndex - 1];
            if (Object.keys(bibleData[prevBook]).length > 0) {
                prevChapterBtn.disabled = false;
            }
        }

        // Check next chapter
        if (currentChapterIndex < chapters.length - 1) {
            nextChapterBtn.disabled = false;
        } else if (currentBookIndex < books.length - 1) {
            const nextBook = books[currentBookIndex + 1];
            if (Object.keys(bibleData[nextBook]).length > 0) {
                nextChapterBtn.disabled = false;
            }
        }
    }
  }


  bookSelect.addEventListener('change', (event) => {
    currentBook = event.target.value;
    currentChapter = 0; // Reset chapter when book changes
    currentVerse = 0;   // Reset verse when book changes
    populateChapters(currentBook);
    displayBibleText();
    updateNavigationButtons();
  });

  chapterSelect.addEventListener('change', (event) => {
    currentChapter = parseInt(event.target.value);
    currentVerse = 0; // Reset verse when chapter changes
    populateVerses(currentBook, currentChapter);
    displayBibleText();
    updateNavigationButtons();
  });

  verseSelect.addEventListener('change', (event) => {
    currentVerse = parseInt(event.target.value);
    displayBibleText();
    updateNavigationButtons();
  });

  prevChapterBtn.addEventListener('click', () => {
    const books = Object.keys(bibleData);
    const currentBookIndex = books.indexOf(currentBook);
    const chapters = Object.keys(bibleData[currentBook]);
    const currentChapterIndex = chapters.indexOf(String(currentChapter));

    if (currentChapterIndex > 0) {
      currentChapter = parseInt(chapters[currentChapterIndex - 1]);
    } else if (currentBookIndex > 0) {
      currentBook = books[currentBookIndex - 1];
      const prevBookChapters = Object.keys(bibleData[currentBook]);
      currentChapter = parseInt(prevBookChapters[prevBookChapters.length - 1]);
      populateChapters(currentBook); // Repopulate chapters for new book
      bookSelect.value = currentBook;
    }
    currentVerse = 0;
    chapterSelect.value = currentChapter;
    populateVerses(currentBook, currentChapter);
    displayBibleText();
    updateNavigationButtons();
  });

  nextChapterBtn.addEventListener('click', () => {
    const books = Object.keys(bibleData);
    const currentBookIndex = books.indexOf(currentBook);
    const chapters = Object.keys(bibleData[currentBook]);
    const currentChapterIndex = chapters.indexOf(String(currentChapter));

    if (currentChapterIndex < chapters.length - 1) {
      currentChapter = parseInt(chapters[currentChapterIndex + 1]);
    } else if (currentBookIndex < books.length - 1) {
      currentBook = books[currentBookIndex + 1];
      currentChapter = parseInt(Object.keys(bibleData[currentBook])[0]);
      populateChapters(currentBook); // Repopulate chapters for new book
      bookSelect.value = currentBook;
    }
    currentVerse = 0;
    chapterSelect.value = currentChapter;
    populateVerses(currentBook, currentChapter);
    displayBibleText();
    updateNavigationButtons();
  });


  // Initial population
  populateBooks();
  updateNavigationButtons();
});
