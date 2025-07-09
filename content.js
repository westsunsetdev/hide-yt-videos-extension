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
    const authorElem = videoElem.querySelector('ytd-channel-name a, #channel-name a');
    if (authorElem) author = authorElem.textContent.trim();
    // Upload time
    let uploadTime = '';
    const metadataSpans = videoElem.querySelectorAll('div#metadata-line span');
    if (metadataSpans.length > 1) {
        uploadTime = metadataSpans[1].textContent.trim();
    } else if (metadataSpans.length === 1) {
        uploadTime = metadataSpans[0].textContent.trim();
    }
    return { id, title, author, uploadTime, url };
}

// Inject custom CSS for the X button if not already present
function injectHideButtonCSS() {
    if (document.getElementById('hide-yt-x-btn-style')) return;
    const style = document.createElement('style');
    style.id = 'hide-yt-x-btn-style';
    style.textContent = `
        .hide-yt-video-btn {
            position: absolute !important;
            top: 8px;
            left: 8px;
            z-index: 10;
            background: rgba(255,255,255,0.85);
            border: none;
            color: #c00;
            font-size: 1.5em;
            font-weight: bold;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 6px rgba(60,60,60,0.10);
            transition: background 0.2s, color 0.2s;
        }
        .hide-yt-video-btn:hover {
            background: #ffeaea;
            color: #a00;
        }
        .hide-yt-video-btn:active {
            background: #ffcccc;
        }
    `;
    document.head.appendChild(style);
}

function ensureHideButtons() {
    injectHideButtonCSS();
    getVideoElements().forEach(videoElem => {
        const videoId = getVideoId(videoElem);
        if (!videoId) return;
        // Only add the button if it doesn't already exist
        if (!videoElem.querySelector('.hide-yt-video-btn')) {
            const thumb = videoElem.querySelector('ytd-thumbnail');
            if (thumb) {
                thumb.style.position = 'relative';
                const btn = document.createElement('button');
                btn.textContent = '×';
                btn.className = 'hide-yt-video-btn';
                btn.title = 'Hide this video';
                btn.onclick = (e) => { e.stopPropagation(); hideVideo(videoElem); };
                thumb.appendChild(btn);
            }
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
                // After updating storage, immediately hide the video on the page
                processVideosWithToggle(hidden);
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

// On page load, hide videos in the hidden list
chrome.storage.sync.get(['hiddenVideos'], data => {
    processVideosWithToggle(data.hiddenVideos || []);
});

// In MutationObserver, keep the UI in sync with storage
const observer = new MutationObserver(() => {
    chrome.storage.sync.get(['hiddenVideos'], data => {
        processVideosWithToggle(data.hiddenVideos || []);
    });
});
observer.observe(document.body, { childList: true, subtree: true });

// On initial load, ensure buttons are present
ensureHideButtons(); 