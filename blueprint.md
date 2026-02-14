# Project Blueprint: Bible Fill-in-the-Blanks Game

## Overview
This project is being transformed from a basic "Hello World" web page into an interactive Bible fill-in-the-blanks game. The game will present users with a Bible verse where certain words are hidden, and the user must type the correct words to complete the verse.

## Detailed Outline

### Initial State (Before this task)
*   `index.html`: Basic HTML5 structure with a "Hello, world!" heading, a simple button, and links to `style.css` and `main.js`.
*   `style.css`: Empty CSS file.
*   `main.js`: Empty JavaScript file.
*   Git repository initialized and pushed to `https://github.com/jiho755/zihoapp-1`.

### Current Task: Implement Bible Fill-in-the-Blanks Game

#### **1. HTML Structure (`index.html`)**
    *   **Purpose:** Define the layout and interactive elements of the game.
    *   **Components:**
        *   Main game container.
        *   Header/Title for the game.
        *   Display area for the Bible verse with blanks.
        *   Input field for user to type their answer.
        *   "Check Answer" button.
        *   Feedback area (e.g., "Correct!", "Incorrect, try again.").
        *   "Next Verse" button.
        *   Score display.

#### **2. CSS Styling (`style.css`)**
    *   **Purpose:** Provide a clean, visually appealing, and responsive design for the game.
    *   **Design Principles:**
        *   Modern, clean aesthetic.
        *   Clear typography for readability.
        *   Responsive layout for different screen sizes.
        *   Theming (e.g., soft background colors, distinct button styles).
    *   **Specifics:**
        *   Style game container, verse text, input field, buttons, and feedback messages.
        *   Use CSS variables for colors and fonts to ensure consistency.
        *   Implement basic animations for feedback (optional, but good for UX).

#### **3. JavaScript Logic (`main.js`)**
    *   **Purpose:** Handle all game mechanics, from verse selection to answer validation and UI updates.
    *   **Core Functionality:**
        *   **Verse Data:** Store a collection of Bible verses (initially hardcoded, can be expanded later). Each entry will include the verse text and its reference (e.g., "John 3:16").
        *   **Verse Selection:** Randomly select a verse from the collection.
        *   **Blank Generation:**
            *   Algorithm to identify words to be blanked out (e.g., exclude common words, blank a certain percentage).
            *   Replace selected words with interactive input elements or blank placeholders.
        *   **User Interaction:**
            *   Event listener for the "Check Answer" button.
            *   Capture user input from the text field.
        *   **Answer Checking:**
            *   Compare user's input with the original blanked word (case-insensitive, trim whitespace).
            *   Provide immediate visual feedback (e.g., highlight correct words in green, incorrect in red).
        *   **Game Flow:**
            *   Manage current verse state.
            *   Handle "Next Verse" functionality.
            *   Keep track of score (e.g., correct answers out of total attempts).
        *   **UI Updates:** Dynamically update the verse display, score, and feedback messages.

#### **4. Advanced Capabilities & Considerations**
    *   **Accessibility:** Ensure keyboard navigation and proper ARIA attributes for screen readers.
    *   **Error Handling:** Gracefully handle edge cases or unexpected user input.
    *   **Modularity:** Organize JavaScript code into functions and potentially classes for better maintainability.

## Plan & Steps for Current Change
1.  Read `index.html`, `main.js`, `style.css` (completed).
2.  Create `blueprint.md` (in progress).
3.  **Update `index.html`:** Design the basic game UI.
4.  **Update `style.css`:** Add initial styling for the game elements.
5.  **Update `main.js`:**
    *   Define a basic set of Bible verses.
    *   Implement `initGame` function.
    *   Implement `displayVerse` function to create blanks.
    *   Implement `checkAnswer` function.
    *   Implement event listeners.
6.  Test the basic game functionality.
7.  Refine styling and add responsiveness.
8.  Add score tracking and "Next Verse" functionality.