// CubPresence Extension - Content Script
// Runs on cubsoftware.site/apps/cubpresence pages
// Bridges communication between the website and the extension

(function() {
    // Inject a marker so the page knows the extension is installed
    const marker = document.createElement('div');
    marker.id = 'cubpresence-extension-installed';
    marker.style.display = 'none';
    document.documentElement.appendChild(marker);

    // Listen for messages from the page
    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        if (!event.data || !event.data.type) return;
        if (!event.data.type.startsWith('CUBPRESENCE_')) return;

        const type = event.data.type.replace('CUBPRESENCE_', '');

        try {
            const response = await chrome.runtime.sendMessage({
                type: type,
                config: event.data.config
            });

            // Send response back to page
            window.postMessage({
                type: 'CUBPRESENCE_RESPONSE',
                originalType: type,
                ...response
            }, '*');
        } catch (err) {
            window.postMessage({
                type: 'CUBPRESENCE_RESPONSE',
                originalType: type,
                success: false,
                error: err.message
            }, '*');
        }
    });

    // Listen for state updates from background
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'STATE_UPDATE') {
            window.postMessage({
                type: 'CUBPRESENCE_STATE_UPDATE',
                ...message
            }, '*');
        }
    });

    // Request initial state
    chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(state => {
        window.postMessage({
            type: 'CUBPRESENCE_STATE_UPDATE',
            ...state
        }, '*');
    }).catch(() => {});

    console.log('[CubPresence] Content script loaded');
})();
