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
    }

    // No query string found, nothing to clean
    return null;
  } catch (e) {
    // Handle potential errors from new URL() constructor (e.g., invalid URL format)
    // or other unexpected issues during processing.
    console.warn(`Could not process URL "${urlString}": ${e.message}`);
    return null;
  }
}

function isGmailUrl(urlString) {
  return typeof urlString === "string" && urlString.includes("mail.google.com");
}

function isGmailInitiator(details) {
  const initiator =
    details.initiator || details.originUrl || details.documentUrl || "";
  return isGmailUrl(initiator);
}

function decodeReutersNewslinkUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.hostname !== "newslink.reuters.com") {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    for (const segment of segments) {
      // Reuters uses base64url-ish encoding without padding.
      // The decoded content is typically a full https://... URL.
      if (!segment.startsWith("aHR0")) {
        continue;
      }

      const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4)) % 4),
        "=",
      );
      const decoded = atob(padded);

      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        return decoded;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function tryDecodeUrlString(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return decoded;
    }
  } catch (e) {
    // ignore
  }

  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decoded = atob(padded);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return decoded;
    }
  } catch (e) {
    // ignore
  }

  return null;
}

function unwrapTrackingUrl(urlString) {
  let current = urlString;

  for (let i = 0; i < 5; i++) {
    const reutersDecoded = decodeReutersNewslinkUrl(current);
    if (reutersDecoded) {
      current = reutersDecoded;
      continue;
    }

    let url;
    try {
      url = new URL(current);
    } catch (e) {
      break;
    }

    const paramsToTry = [
      "url",
      "u",
      "q",
      "redirect",
      "redirect_url",
      "redirectUrl",
      "redir",
      "destination",
      "dest",
      "target",
      "continue",
      "next",
      "link",
    ];

    let found = null;
    for (const key of paramsToTry) {
      const value = url.searchParams.get(key);
      const decoded = tryDecodeUrlString(value);
      if (decoded) {
        found = decoded;
        break;
      }
    }

    if (!found) {
      break;
    }

    current = found;
  }

  return current;
}

const gmailInitiatedTabExpirations = new Map();

function markTabAsGmailInitiated(tabId) {
  if (typeof tabId !== "number" || tabId < 0) {
    return;
  }
  gmailInitiatedTabExpirations.set(tabId, Date.now() + 15 * 1000);
}

function isTabMarkedGmailInitiated(tabId) {
  if (typeof tabId !== "number" || tabId < 0) {
    return false;
  }

  const expiresAt = gmailInitiatedTabExpirations.get(tabId);
  if (!expiresAt) {
    return false;
  }

  if (Date.now() > expiresAt) {
    gmailInitiatedTabExpirations.delete(tabId);
    return false;
  }

  return true;
}

function shouldSkipUrlForGmailActions(urlString) {
  try {
    const url = new URL(urlString);

    // Gmail UI actions (Show original, Download message, etc.) rely on query params.
    if (url.hostname === "mail.google.com") {
      return true;
    }

    // Avoid breaking other Google apps by stripping required query params.
    const isGoogleDomain =
      url.hostname === "google.com" ||
      url.hostname.endsWith(".google.com") ||
      url.hostname.endsWith(".googleusercontent.com");

    // Exception: allow Google's /url redirector to be unwrapped/cleaned.
    if (url.hostname === "www.google.com" && url.pathname === "/url") {
      return false;
    }

    if (isGoogleDomain) {
      return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

function shouldPreserveQueryForWrapperHop(urlString) {
  try {
    const url = new URL(urlString);

    // Substack app-link uses query params (publication_id, post_id, token) to reach the real post.
    if (url.hostname === "substack.com" && url.pathname.startsWith("/app-link/")) {
      return true;
    }

    // Prolific completion/study links encode participant + study metadata in the query string.
    const prolificHostnames = ["prolific.com", "prolific.co"];
    const isProlificDomain = prolificHostnames.some((root) =>
      url.hostname === root ||
      url.hostname === `www.${root}` ||
      url.hostname.endsWith(`.${root}`),
    );

    if (isProlificDomain) {
      return true;
    }

    return false;
  } catch (e) {
    return true;
  }
}

async function isEnabled() {
  try {
    const { enabled } = await browser.storage.local.get({ enabled: true });
    return Boolean(enabled);
  } catch (e) {
    // If storage fails for any reason, default to enabled.
    return true;
  }
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Only intercept Gmail-initiated top-level navigations.
    if (details.type !== "main_frame") {
      return;
    }

    if (shouldSkipUrlForGmailActions(details.url)) {
      return;
    }

    const initiatedByGmail = isGmailInitiator(details);
    const markedByGmail = isTabMarkedGmailInitiated(details.tabId);
    if (initiatedByGmail) {
      markTabAsGmailInitiated(details.tabId);
    } else if (markedByGmail) {
      // Allow a single follow-up request after a Gmail click (e.g., redirect hop).
      gmailInitiatedTabExpirations.delete(details.tabId);
    }

    const eligible = initiatedByGmail || markedByGmail;
    if (!eligible) {
      return;
    }

    // Must return a promise for async decision (supported in Firefox).
    return isEnabled().then((enabled) => {
      if (!enabled) {
        return;
      }

      if (shouldPreserveQueryForWrapperHop(details.url)) {
        return;
      }

      const candidate = unwrapTrackingUrl(details.url);
      const cleaned = cleanUrl(candidate);
      if (!cleaned) {
        return;
      }

      // Avoid loops: do not redirect to the same URL.
      if (cleaned === details.url) {
        return;
      }

      return { redirectUrl: cleaned };
    });
  },
  { urls: ["<all_urls>"] },
  ["blocking"],
);

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

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "cleanAllTabs") {
    return cleanAllTabs();
  }
});

// Optional: Log when the extension is installed or updated
browser.runtime.onInstalled.addListener((details) => {
  console.log("URL Cleaner extension installed or updated.", details);
  // Perform any first-time setup here if needed
});
