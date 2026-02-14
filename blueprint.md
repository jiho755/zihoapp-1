# Project Blueprint: Bible Viewing Page

## Overview
This project is being transformed from a Lottery Number Generator into a Bible Viewing Page. The application will allow users to select a specific book, chapter, and verse, and then display the corresponding Bible text.

## Detailed Outline

### Initial State (Before this task)
*   The project was a Lottery Number Generator with `index.html`, `style.css`, and `main.js` structured for that purpose.
*   Git repository initialized and pushed to `https://github.com/jiho755/zihoapp-1`.

### Current Task: Implement Bible Viewing Page

#### **1. HTML Structure (`index.html`)**
    *   **Purpose:** Define the layout and interactive elements of the Bible viewer.
    *   **Components:**
        *   Main application container.
        *   Header/Title for the application (e.g., "Bible Viewer").
        *   Dropdowns (select elements) for choosing a Bible book, chapter, and verse.
        *   A display area (`div`) for the selected Bible text.
        *   Navigation buttons (e.g., "Previous Chapter", "Next Chapter").

#### **2. CSS Styling (`style.css`)**
    *   **Purpose:** Provide a clean, readable, and user-friendly design for the Bible viewer.
    *   **Design Principles:**
        *   Clear typography for Bible text readability.
        *   Intuitive layout for selectors and text display.
        *   Responsive design for various screen sizes.
        *   Calm and focused aesthetic.

#### **3. JavaScript Logic (`main.js`)**
    *   **Purpose:** Handle data management, user selections, and dynamic display of Bible content.
    *   **Core Functionality:**
        *   **Bible Data Source:**
            *   Due to the nature of this environment, a full Bible text API integration is outside the scope without specific API key/endpoint.
            *   **Initial Implementation:** Hardcode a small sample of Bible data (e.g., a few verses from Genesis and John) directly within `main.js` to demonstrate functionality.
            *   **Future Consideration:** Explain how to integrate a real Bible API (e.g., ESV API, Bible Gateway API) if the user provides credentials or specifies a public API.
        *   **UI Element References:** Get references to all necessary HTML elements (select dropdowns, text display, buttons).
        *   **Populate Selectors:** Dynamically populate the book, chapter, and verse dropdowns based on the available data.
        *   **Event Handlers:**
            *   Add event listeners to the book, chapter, and verse dropdowns to detect changes.
            *   Add event listeners to "Previous/Next Chapter" buttons.
        *   **`displayBibleText()` function:**
            *   Based on current selections, retrieve the corresponding text from the data source.
            *   Render the text in the designated display area.
        *   **State Management:** Keep track of the currently selected book, chapter, and verse.

## Plan & Steps for Current Change
1.  Update `blueprint.md` (in progress).
2.  **Update `index.html`:** Create the new structure for the Bible viewer, including selector dropdowns and text display.
3.  **Update `style.css`:** Add new styling specific to the Bible viewer for readability and aesthetics.
4.  **Update `main.js`:**
    *   Define hardcoded sample Bible data.
    *   Implement functions to populate dropdowns and display text.
    *   Add event listeners for user interactions.
5.  Test the selection and display of Bible text.
6.  Commit and push all changes.