// popup.js
// This script runs in the extension popup.
// It lists hidden video IDs and allows unhide actions.

document.addEventListener('DOMContentLoaded', function() {
    const showHiddenToggle = document.getElementById('showHiddenToggle');
    const hiddenListDiv = document.getElementById('hiddenList');

    // Load and set the toggle state from storage
    chrome.storage.sync.get(['showHiddenVideos'], data => {
        showHiddenToggle.checked = !!data.showHiddenVideos;
    });

    // Listen for toggle changes and persist state
    showHiddenToggle.addEventListener('change', function() {
        const show = showHiddenToggle.checked;
        chrome.storage.sync.set({ showHiddenVideos: show }, () => {
            sendMessageToTabs({ action: show ? 'unhideAll' : 'rehideAll' });
        });
    });

    // Load hidden videos from storage and display them
    function loadHiddenVideos() {
        chrome.storage.sync.get(['hiddenVideos'], data => {
            const hidden = data.hiddenVideos || [];
            hiddenListDiv.innerHTML = '';
            if (hidden.length === 0) {
                hiddenListDiv.textContent = 'No hidden videos.';
                return;
            }
            hidden.forEach(video => {
                // Support both object and string (ID) entries
                let id, title, author, uploadTime, url;
                if (typeof video === 'string') {
                    id = video;
                    title = video;
                    author = '';
                    uploadTime = '';
                    url = '';
                } else {
                    id = video.id;
                    title = video.title || video.id;
                    author = video.author || '';
                    uploadTime = video.uploadTime || '';
                    url = video.url || '';
                }
                const div = document.createElement('div');
                div.className = 'video-item';
                div.innerHTML = `
                    <div class="video-info">
                        <a href="${url || '#'}" class="video-title" target="_blank" rel="noopener noreferrer">${title}</a><br>
                        <span class="video-meta">
                        ${author && uploadTime
                            ? `${author.trim()} | ${uploadTime.trim()}`
                            : author
                                ? author.trim()
                                : uploadTime
                                    ? uploadTime.trim()
                                    : ''}
                        </span>
                    </div>
                    <button data-id="${id}" class="x-btn" title="Unhide">&times;</button>
                `;
                hiddenListDiv.appendChild(div);
            });
            // Add event listeners to 'X' buttons
            document.querySelectorAll('.x-btn').forEach(btn => {
                btn.onclick = function() {
                    const videoId = this.getAttribute('data-id');
                    // Remove from storage and notify content script
                    chrome.storage.sync.get(['hiddenVideos'], data => {
                        let hidden = data.hiddenVideos || [];
                        hidden = hidden.filter(v => (typeof v === 'object' ? v.id !== videoId : v !== videoId));
                        chrome.storage.sync.set({ hiddenVideos: hidden }, () => {
                            sendMessageToTabs({ action: 'permanentUnhide', videoId });
                            loadHiddenVideos();
                        });
                    });
                };
            });
        });
    }

    // Send a message to all tabs on the subscriptions page
    function sendMessageToTabs(msg) {
        chrome.tabs.query({ url: 'https://www.youtube.com/feed/subscriptions*' }, tabs => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, msg);
            });
        });
    }

    // Listen for storage changes and reload the list
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.hiddenVideos) {
            loadHiddenVideos();
        }
    });

    // Initial load
    loadHiddenVideos();
});