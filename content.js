// content.js
// This script runs on the YouTube subscriptions page.
// It adds 'Hide' buttons to each video and hides videos based on stored IDs.

// Helper: Get all video elements on the page
function getVideoElements() {
    // Updated selector for YouTube subscriptions as of 2024
    return Array.from(document.querySelectorAll('ytd-rich-item-renderer'));
}

// Helper: Get the video ID from a video element
function getVideoId(videoElem) {
    const link = videoElem.querySelector('a#thumbnail');
    if (link && link.href) {
        // YouTube video URLs are like https://www.youtube.com/watch?v=VIDEO_ID
        const url = new URL(link.href);
        return url.searchParams.get('v');
    }
    return null;
}

// Helper: Extract video info (id, title, author, uploadTime, url) from a video element
function getVideoInfo(videoElem, fallbackId = '') {
    const link = videoElem.querySelector('a#thumbnail');
    const url = link && link.href ? link.href : '';
    let id = getVideoId(videoElem) || fallbackId;
    // Title
    let title = '';
    const titleElem = videoElem.querySelector('#video-title');
    if (titleElem) title = titleElem.textContent.trim();
    // Author
    let author = '';
    const authorElem = videoElem.querySelector('ytd-channel-name, #channel-name');
    if (authorElem) author = authorElem.textContent.trim();
    // Upload time
    let uploadTime = '';
    const timeElem = videoElem.querySelector('div#metadata-line span');
    if (timeElem) uploadTime = timeElem.textContent.trim();
    return { id, title, author, uploadTime, url };
}

// Ensure 'Hide' button is present on each video
function ensureHideButtons() {
    getVideoElements().forEach(videoElem => {
        const videoId = getVideoId(videoElem);
        if (!videoId) return;
        if (!videoElem.querySelector('.hide-yt-video-btn')) {
            const btn = document.createElement('button');
            btn.textContent = 'Hide';
            btn.className = 'hide-yt-video-btn';
            btn.style.margin = '8px';
            btn.onclick = () => hideVideo(videoElem);
            videoElem.prepend(btn);
        }
    });
}

// Helper: Show or hide videos based on toggle and hidden list
function updateVideoVisibility(hiddenVideos, showHidden) {
    ensureHideButtons(); // Always ensure buttons are present
    const hiddenIds = hiddenVideos.map(v => v.id);
    getVideoElements().forEach(videoElem => {
        const videoId = getVideoId(videoElem);
        if (!videoId) return;
        if (showHidden) {
            videoElem.style.display = '';
        } else {
            videoElem.style.display = hiddenIds.includes(videoId) ? 'none' : '';
        }
    });
}

// Modified processVideos to use toggle
function processVideosWithToggle(hiddenVideos) {
    chrome.storage.sync.get(['showHiddenVideos'], data => {
        const showHidden = !!data.showHiddenVideos;
        updateVideoVisibility(hiddenVideos, showHidden);
    });
}

// Add 'Hide' buttons and hide videos as needed
function processVideos(hiddenVideos) {
    // hiddenVideos is now an array of objects
    const hiddenIds = hiddenVideos.map(v => v.id);
    getVideoElements().forEach(videoElem => {
        const videoId = getVideoId(videoElem);
        if (!videoId) return;

        // Hide video if its ID is in the hidden list
        if (hiddenIds.includes(videoId)) {
            videoElem.style.display = 'none';
        } else {
            videoElem.style.display = '';
        }
    });
}

// Hide a video and save its info
function hideVideo(videoElem) {
    const info = getVideoInfo(videoElem);
    chrome.storage.sync.get(['hiddenVideos'], data => {
        let hidden = data.hiddenVideos || [];
        // Remove any ID-only entry for this video
        hidden = hidden.filter(v => (typeof v === 'object' ? v.id !== info.id : v !== info.id));
        if (!hidden.some(v => v.id === info.id)) {
            hidden.push(info);
            chrome.storage.sync.set({ hiddenVideos: hidden }, () => {
                migrateHiddenVideos(processVideosWithToggle);
            });
        }
    });
}

// Listen for storage changes (e.g., unhide all)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.hiddenVideos) {
        processVideosWithToggle(changes.hiddenVideos.newValue || []);
    }
    if (area === 'sync' && changes.showHiddenVideos) {
        // Re-evaluate visibility when toggle changes
        chrome.storage.sync.get(['hiddenVideos'], data => {
            processVideosWithToggle(data.hiddenVideos || []);
        });
    }
});

// Listen for messages from popup (e.g., unhide all, permanently unhide)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'unhideAll') {
        chrome.storage.sync.set({ showHiddenVideos: true });
    } else if (msg.action === 'rehideAll') {
        chrome.storage.sync.set({ showHiddenVideos: false });
    } else if (msg.action === 'permanentUnhide' && msg.videoId) {
        chrome.storage.sync.get(['hiddenVideos'], data => {
            let hidden = data.hiddenVideos || [];
            hidden = hidden.filter(v => v.id !== msg.videoId);
            chrome.storage.sync.set({ hiddenVideos: hidden }, () => {
                processVideosWithToggle(hidden);
            });
        });
    }
});

// Migrate any ID-only entries in hiddenVideos to full objects if possible, and clean up entries without id
function migrateHiddenVideos(callback) {
    chrome.storage.sync.get(['hiddenVideos'], data => {
        let hidden = data.hiddenVideos || [];
        let changed = false;
        // If any entry is a string (ID), try to upgrade it
        hidden = hidden.map(entry => {
            if (typeof entry === 'string') {
                // Try to find the video element and extract info
                const videoElem = getVideoElements().find(v => getVideoId(v) === entry);
                if (videoElem) {
                    changed = true;
                    return getVideoInfo(videoElem, entry);
                } else {
                    // Fallback: keep as object with id only
                    changed = true;
                    return { id: entry, title: '', author: '', uploadTime: '', url: '' };
                }
            }
            // If already object, ensure it has an id
            if (typeof entry === 'object' && entry.id) return entry;
            // If object but missing id, try to use a fallback
            if (typeof entry === 'object' && !entry.id) {
                if (entry.title) return { ...entry, id: entry.title };
                return null; // Remove if no id at all
            }
            return null; // Remove if not valid
        }).filter(Boolean).filter(entry => entry.id); // Remove any without id
        if (changed) {
            chrome.storage.sync.set({ hiddenVideos: hidden }, () => {
                if (callback) callback(hidden);
            });
        } else {
            if (callback) callback(hidden);
        }
    });
}

// Initial run: migrate and process with toggle
migrateHiddenVideos(processVideosWithToggle);

// After hiding a video, migrate and update
// Optional: re-process videos if new ones are loaded (e.g., infinite scroll)
const observer = new MutationObserver(() => {
    chrome.storage.sync.get(['hiddenVideos'], data => {
        processVideosWithToggle(data.hiddenVideos || []);
    });
    ensureHideButtons();
});
observer.observe(document.body, { childList: true, subtree: true });

// On initial load, ensure buttons are present
ensureHideButtons(); 