document.addEventListener('DOMContentLoaded', () => {
    const monoToggle = document.getElementById('mono-toggle');
    const hideToggle = document.getElementById('hide-toggle');
    const addFixedBtn = document.getElementById('add-fixed-btn');
    const addFloatingBtn = document.getElementById('add-floating-btn');
    const clearAreasBtn = document.getElementById('clear-areas-btn');
    const areaListContainer = document.getElementById('area-list');
    const pageIndicator = document.getElementById('page-indicator');

    let currentPageKey = '';

    // Load initial state
    chrome.storage.sync.get(['monochrome', 'hideEngagement'], (result) => {
        monoToggle.checked = result.monochrome !== false;
        hideToggle.checked = result.hideEngagement !== false;
    });

    // Get current tab info and load areas
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
            try {
                const url = new URL(tabs[0].url);
                currentPageKey = url.hostname + url.pathname;
                pageIndicator.textContent = url.hostname;
                pageIndicator.title = currentPageKey;
            } catch (e) {
                pageIndicator.textContent = 'Unknown page';
            }
        }
        refreshAreaList();
    });

    function sendMessage(message, callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                if (tabs[0].url.startsWith("chrome://") || tabs[0].url.startsWith("edge://")) {
                    console.log("Cannot run on system pages");
                    if (pageIndicator) pageIndicator.textContent = 'System page';
                    return;
                }

                chrome.tabs.sendMessage(tabs[0].id, message, function (response) {
                    if (chrome.runtime.lastError) {
                        console.warn("Could not send message:", chrome.runtime.lastError.message);
                        chrome.scripting.executeScript({
                            target: { tabId: tabs[0].id },
                            files: ['content.js']
                        }).then(() => {
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabs[0].id, message, callback);
                            }, 100);
                        });
                    } else if (callback) {
                        callback(response);
                    }
                });
            }
        });
    }

    function refreshAreaList() {
        sendMessage({ action: "getAreas" }, (response) => {
            if (response && response.areas) {
                renderAreaList(response.areas);
            }
        });
    }

    function renderAreaList(areas) {
        if (!areas || areas.length === 0) {
            areaListContainer.innerHTML = '<div class="no-areas">No color areas for this page</div>';
            return;
        }

        areaListContainer.innerHTML = areas.map((area, index) => {
            const typeLabel = area.type === 'fixed' ? 'Fixed' : 'Floating';
            const typeIcon = area.type === 'fixed' ? '📌' : '🔄';
            return `
            <div class="area-item" data-id="${area.id}">
                <div class="area-header">
                    <span class="area-info">Area ${index + 1} (${Math.round(area.width)} x ${Math.round(area.height)})</span>
                    <div class="area-actions">
                        <button class="small edit-btn" data-id="${area.id}">Edit</button>
                        <button class="small danger delete-btn" data-id="${area.id}">Del</button>
                    </div>
                </div>
                <div class="area-type-row">
                    <span>${typeIcon} ${typeLabel}</span>
                    <button class="small toggle-type-btn" data-id="${area.id}">Switch Type</button>
                </div>
            </div>
        `}).join('');

        areaListContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const areaId = parseInt(btn.dataset.id);
                sendMessage({ action: "editArea", areaId: areaId });
                window.close();
            });
        });

        areaListContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const areaId = parseInt(btn.dataset.id);
                sendMessage({ action: "deleteArea", areaId: areaId }, () => {
                    refreshAreaList();
                });
            });
        });

        areaListContainer.querySelectorAll('.toggle-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const areaId = parseInt(btn.dataset.id);
                sendMessage({ action: "toggleAreaType", areaId: areaId }, () => {
                    refreshAreaList();
                });
            });
        });
    }

    monoToggle.addEventListener('change', () => {
        const settings = {
            monochrome: monoToggle.checked,
            hideEngagement: hideToggle.checked
        };
        chrome.storage.sync.set(settings);
        sendMessage({ action: "updateSettings", settings: settings });
    });

    hideToggle.addEventListener('change', () => {
        const settings = {
            monochrome: monoToggle.checked,
            hideEngagement: hideToggle.checked
        };
        chrome.storage.sync.set(settings);
        sendMessage({ action: "updateSettings", settings: settings });
    });

    addFixedBtn.addEventListener('click', () => {
        sendMessage({ action: "toggleSelectionMode", areaType: "fixed" });
        window.close();
    });

    addFloatingBtn.addEventListener('click', () => {
        sendMessage({ action: "toggleSelectionMode", areaType: "floating" });
        window.close();
    });

    clearAreasBtn.addEventListener('click', () => {
        sendMessage({ action: "resetArea" }, () => {
            refreshAreaList();
        });
    });
});
