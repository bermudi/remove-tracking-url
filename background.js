/**
 * Cleans a URL by removing its query string (search parameters).
 *
 * Uses the URL API for robust parsing and manipulation.
 * Only processes 'http:' and 'https:' protocols.
 * Returns the cleaned URL string if cleaning was performed, otherwise null.
 *
 * @param {string} urlString The URL to potentially clean.
 * @returns {string | null} The cleaned URL or null if no cleaning was needed/possible.
 */
function cleanUrl(urlString) {
  try {
    const url = new URL(urlString);

    // Only process http and https URLs
    if (!["http:", "https:"].includes(url.protocol)) {
      // console.debug(`Skipping non-HTTP(S) URL: ${urlString}`);
      return null;
    }

    // Check if there's a query string to remove
    if (url.search) {
      const originalUrl = url.toString(); // Get full original URL string representation
      url.search = ""; // Remove the query string
      const cleanedUrlString = url.toString();

      // Return the cleaned URL only if it actually changed
      // (Handles cases like url ending in '?' but no params)
      return cleanedUrlString !== originalUrl ? cleanedUrlString : null;
    } else {
      // No query string found, nothing to clean
      return null;
    }
  } catch (e) {
    // Handle potential errors from new URL() constructor (e.g., invalid URL format)
    // or other unexpected issues during processing.
    console.warn(`Could not process URL "${urlString}": ${e.message}`);
    return null;
  }
}

/**
 * Cleans URLs of all eligible tabs in the current window by removing query strings.
 * Updates tabs concurrently and provides user notification.
 * Requires 'tabs' and 'notifications' permissions in manifest.json.
 */
async function cleanAllTabs() {
  let cleanedCount = 0;
  let failedCount = 0;
  const updatePromises = [];

  try {
    // Query for all tabs in the currently active window
    const tabs = await browser.tabs.query({ currentWindow: true });

    for (const tab of tabs) {
      // Ensure tab has an ID and a URL before proceeding
      if (!tab.id || !tab.url) {
        // console.debug(`Skipping tab without ID or URL: ${tab.id}`);
        continue;
      }

      const cleanedUrl = cleanUrl(tab.url);

      if (cleanedUrl) {
        // If cleaning resulted in a new URL, create an update promise
        const updatePromise = browser.tabs
          .update(tab.id, { url: cleanedUrl })
          .then(() => {
            cleanedCount++;
            // console.log(`Successfully cleaned tab ${tab.id} to ${cleanedUrl}`);
          })
          .catch((error) => {
            failedCount++;
            console.error(
              `Failed to update tab ${tab.id} (URL: ${tab.url}):`,
              error,
            );
            // Optionally try to notify user about specific failures here
          });
        updatePromises.push(updatePromise);
      }
    }

    // Wait for all update attempts to settle (complete or fail)
    await Promise.allSettled(updatePromises); // Use allSettled to wait even if some fail

    console.log(
      `Cleaning complete. Success: ${cleanedCount}, Failed: ${failedCount}`,
    );

    // Provide user feedback via notification
    let message;
    if (cleanedCount > 0 || failedCount > 0) {
      message = `${cleanedCount} URL(s) cleaned successfully.`;
      if (failedCount > 0) {
        message += ` ${failedCount} update(s) failed (check console).`;
      }
    } else {
      message = "No URLs required cleaning.";
    }

    // Use a default icon path - adjust as needed
    const iconUrl = browser.runtime.getURL("icons/icon-48.png");

    browser.notifications
      .create({
        type: "basic",
        iconUrl: iconUrl, // Make sure you have an icon at this path
        title: "URL Cleaner Result",
        message: message,
      })
      .catch((err) => console.error("Error creating notification:", err)); // Catch errors creating notification itself
  } catch (error) {
    console.error("Error during the cleanAllTabs process:", error);
    // Notify user about the general failure
    try {
      const iconUrl = browser.runtime.getURL("icons/icon-48.png");
      await browser.notifications.create({
        type: "basic",
        iconUrl: iconUrl,
        title: "URL Cleaner Error",
        message:
          "An unexpected error occurred while cleaning tabs. Check the console.",
      });
    } catch (e) {
      console.error("Could not display error notification:", e);
    }
  }

  // Optional: Return counts if needed elsewhere
  // return { cleanedCount, failedCount };
}

// --- Event Listener ---

// Listen for clicks on the browser action icon (toolbar button)
browser.browserAction.onClicked.addListener((tab) => {
  // The 'tab' argument here is the tab that was active when the icon was clicked.
  // We still want to clean *all* tabs in the current window as per the function's logic.
  console.log("Browser action clicked. Starting cleanAllTabs...");
  cleanAllTabs();
});

// Optional: Log when the extension is installed or updated
browser.runtime.onInstalled.addListener((details) => {
  console.log("URL Cleaner extension installed or updated.", details);
  // Perform any first-time setup here if needed
});
