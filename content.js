(function () {
    /* 
       microweb Content Script
       Supports multiple color area selections with fixed/floating types
       Per-page area storage using URL as key
    */

    if (window.microwebListenerAttached) {
        console.log("microweb - Script already running.");
        return;
    }
    window.microwebListenerAttached = true;

    // -- State --
    var isMonochrome = true;
    var isHidingEngagement = true;
    var selectionMode = false;
    var editingAreaId = null;
    var newAreaType = 'floating';
    var colorAreas = [];
    var nextAreaId = 1;
    var pageKey = getPageKey();

    // -- Elements --
    var overlayContainer = null;
    var selectionLayer = null;
    var selectionBox = null;

    function getPageKey() {
        // Use hostname + pathname as unique key for this page
        return window.location.hostname + window.location.pathname;
    }

    function init() {
        console.log("microweb - Starting for page:", pageKey);
        createOverlays();
        loadSettings();

        window.addEventListener('scroll', handleScroll);

        chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            if (request.action === "ping") {
                sendResponse({ status: "ok", pageKey: pageKey });
                return;
            }

            if (request.action === "updateSettings") {
                isMonochrome = request.settings.monochrome;
                isHidingEngagement = request.settings.hideEngagement;
                updateState();
            } else if (request.action === "toggleSelectionMode") {
                editingAreaId = null;
                newAreaType = request.areaType || 'floating';
                enterSelectionMode();
            } else if (request.action === "resetArea") {
                colorAreas = [];
                saveAreas();
                updateOverlay();
                sendResponse({ areas: colorAreas, pageKey: pageKey });
            } else if (request.action === "getAreas") {
                sendResponse({ areas: colorAreas, pageKey: pageKey });
            } else if (request.action === "deleteArea") {
                deleteArea(request.areaId);
                sendResponse({ areas: colorAreas, pageKey: pageKey });
            } else if (request.action === "editArea") {
                editingAreaId = request.areaId;
                var area = colorAreas.find(function (a) { return a.id === request.areaId; });
                if (area) newAreaType = area.type;
                highlightAreaForEdit(request.areaId);
            } else if (request.action === "toggleAreaType") {
                toggleAreaType(request.areaId);
                sendResponse({ areas: colorAreas, pageKey: pageKey });
            }
            return true;
        });
    }

    function createOverlays() {
        if (document.getElementById('microweb-root')) return;

        overlayContainer = document.createElement('div');
        overlayContainer.id = 'microweb-root';
        document.body.appendChild(overlayContainer);

        selectionLayer = document.createElement('div');
        selectionLayer.id = 'microweb-selection-layer';
        document.body.appendChild(selectionLayer);

        selectionLayer.addEventListener('mousedown', handleMouseDown);
        selectionLayer.addEventListener('mousemove', handleMouseMove);
        selectionLayer.addEventListener('mouseup', handleMouseUp);

        overlayContainer.style.display = 'none';
    }

    function updateState() {
        updateOverlay();
        if (isHidingEngagement) {
            document.documentElement.classList.add('mw-hide-engagement');
        } else {
            document.documentElement.classList.remove('mw-hide-engagement');
        }
    }

    function handleScroll() {
        updateOverlay();
    }

    function updateOverlay() {
        if (!overlayContainer) return;

        // On X.com (Twitter), skip full-page overlay - only use CSS grayscale on media
        var isTwitter = window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com');

        if (!isMonochrome || isTwitter) {
            overlayContainer.style.display = 'none';
            return;
        }
        overlayContainer.style.display = 'block';
        overlayContainer.innerHTML = '';

        if (colorAreas.length === 0) {
            var full = document.createElement('div');
            full.className = 'mw-overlay-full';
            overlayContainer.appendChild(full);
        } else if (colorAreas.length === 1) {
            createSingleAreaOverlay(colorAreas[0]);
        } else {
            createMultiAreaOverlay();
        }
    }

    function getViewportArea(area) {
        var scrollY = window.scrollY || window.pageYOffset;
        var y;
        if (area.type === 'fixed') {
            y = area.originalY - scrollY;
        } else {
            y = area.y;
        }
        return {
            x: area.x,
            y: y,
            width: area.width,
            height: area.height
        };
    }

    function createSingleAreaOverlay(area) {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var rect = getViewportArea(area);

        if (rect.y > 0) {
            createPartialOverlay(0, 0, vw, rect.y);
        }
        var bottomStart = rect.y + rect.height;
        if (bottomStart < vh) {
            createPartialOverlay(0, bottomStart, vw, vh - bottomStart);
        }
        if (rect.x > 0) {
            createPartialOverlay(0, Math.max(0, rect.y), rect.x, Math.min(rect.height, vh));
        }
        var rightStart = rect.x + rect.width;
        if (rightStart < vw) {
            createPartialOverlay(rightStart, Math.max(0, rect.y), vw - rightStart, Math.min(rect.height, vh));
        }
    }

    function createMultiAreaOverlay() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var rects = colorAreas.map(function (area) {
            return getViewportArea(area);
        }).filter(function (r) {
            return r.y + r.height > 0 && r.y < vh && r.x + r.width > 0 && r.x < vw;
        });

        if (colorAreas.length === 0) {
            var full = document.createElement('div');
            full.className = 'mw-overlay-full';
            overlayContainer.appendChild(full);
            return;
        }

        var minX = Math.min.apply(null, rects.map(function (r) { return r.x; }));
        var minY = Math.min.apply(null, rects.map(function (r) { return r.y; }));
        var maxX = Math.max.apply(null, rects.map(function (r) { return r.x + r.width; }));
        var maxY = Math.max.apply(null, rects.map(function (r) { return r.y + r.height; }));

        minX = Math.max(0, minX);
        minY = Math.max(0, minY);
        maxX = Math.min(vw, maxX);
        maxY = Math.min(vh, maxY);

        if (minY > 0) {
            createPartialOverlay(0, 0, vw, minY);
        }
        if (maxY < vh) {
            createPartialOverlay(0, maxY, vw, vh - maxY);
        }
        if (minX > 0) {
            createPartialOverlay(0, minY, minX, maxY - minY);
        }
        if (maxX < vw) {
            createPartialOverlay(maxX, minY, vw - maxX, maxY - minY);
        }

        fillInternalGaps(rects, minX, minY, maxX, maxY);
    }

    function fillInternalGaps(rects, minX, minY, maxX, maxY) {
        var xCoords = [minX, maxX];
        var yCoords = [minY, maxY];

        rects.forEach(function (r) {
            xCoords.push(Math.max(minX, r.x));
            xCoords.push(Math.min(maxX, r.x + r.width));
            yCoords.push(Math.max(minY, r.y));
            yCoords.push(Math.min(maxY, r.y + r.height));
        });

        xCoords = xCoords.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
        yCoords = yCoords.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });

        for (var i = 0; i < xCoords.length - 1; i++) {
            for (var j = 0; j < yCoords.length - 1; j++) {
                var cellX = xCoords[i];
                var cellY = yCoords[j];
                var cellW = xCoords[i + 1] - cellX;
                var cellH = yCoords[j + 1] - cellY;
                var cellCenterX = cellX + cellW / 2;
                var cellCenterY = cellY + cellH / 2;

                var insideAny = rects.some(function (r) {
                    return cellCenterX >= r.x && cellCenterX <= r.x + r.width &&
                        cellCenterY >= r.y && cellCenterY <= r.y + r.height;
                });

                if (!insideAny && cellW > 0 && cellH > 0) {
                    createPartialOverlay(cellX, cellY, cellW, cellH);
                }
            }
        }
    }

    function createPartialOverlay(left, top, width, height) {
        if (width <= 0 || height <= 0) return;
        var div = document.createElement('div');
        div.className = 'mw-overlay-part';
        div.style.left = left + 'px';
        div.style.top = top + 'px';
        div.style.width = width + 'px';
        div.style.height = height + 'px';
        overlayContainer.appendChild(div);
    }

    function deleteArea(areaId) {
        colorAreas = colorAreas.filter(function (a) { return a.id !== areaId; });
        saveAreas();
        updateOverlay();
    }

    function toggleAreaType(areaId) {
        var area = colorAreas.find(function (a) { return a.id === areaId; });
        if (!area) return;

        var scrollY = window.scrollY || window.pageYOffset;

        if (area.type === 'fixed') {
            area.type = 'floating';
            area.y = area.originalY - scrollY;
        } else {
            area.type = 'fixed';
            area.originalY = area.y + scrollY;
        }

        saveAreas();
        updateOverlay();
    }

    function highlightAreaForEdit(areaId) {
        var area = colorAreas.find(function (a) { return a.id === areaId; });
        if (!area) return;

        colorAreas = colorAreas.filter(function (a) { return a.id !== areaId; });
        updateOverlay();

        enterSelectionMode();

        if (selectionBox) selectionBox.remove();
        selectionBox = document.createElement('div');
        selectionBox.className = 'mw-selection-box mw-editing';
        selectionLayer.appendChild(selectionBox);

        var displayY = area.type === 'fixed' ? area.originalY - (window.scrollY || 0) : area.y;
        updateSelectionBox(area.x, displayY, area.width, area.height);
    }

    function loadSettings() {
        // Load global settings + page-specific areas
        chrome.storage.sync.get(['monochrome', 'hideEngagement'], function (result) {
            isMonochrome = result.monochrome !== false;
            isHidingEngagement = result.hideEngagement !== false;

            // Load page-specific areas from local storage (per-page)
            chrome.storage.local.get(['areas_' + pageKey], function (localResult) {
                var storedAreas = localResult['areas_' + pageKey];
                if (storedAreas && Array.isArray(storedAreas)) {
                    colorAreas = storedAreas;
                    nextAreaId = colorAreas.reduce(function (max, a) { return Math.max(max, a.id + 1); }, 1);
                }
                updateState();
            });
        });
    }

    function saveAreas() {
        // Save page-specific areas to local storage
        var data = {};
        data['areas_' + pageKey] = colorAreas;
        chrome.storage.local.set(data);
    }

    function enterSelectionMode() {
        selectionMode = true;
        if (selectionLayer) selectionLayer.style.display = 'block';
        document.body.style.cursor = 'crosshair';
    }

    function exitSelectionMode() {
        selectionMode = false;
        if (selectionLayer) selectionLayer.style.display = 'none';
        document.body.style.cursor = 'default';
        if (selectionBox) {
            selectionBox.remove();
            selectionBox = null;
        }
        editingAreaId = null;
    }

    var isDragging = false;
    var startX = 0, startY = 0;

    function handleMouseDown(e) {
        if (!selectionMode) return;
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        if (!selectionBox) {
            selectionBox = document.createElement('div');
            selectionBox.className = 'mw-selection-box';
            selectionLayer.appendChild(selectionBox);
        }
        updateSelectionBox(startX, startY, 0, 0);
    }

    function handleMouseMove(e) {
        if (!selectionMode || !isDragging) return;
        e.preventDefault();

        var currentX = e.clientX;
        var currentY = e.clientY;

        var width = currentX - startX;
        var height = currentY - startY;

        var finalX = width < 0 ? currentX : startX;
        var finalY = height < 0 ? currentY : startY;
        var finalW = Math.abs(width);
        var finalH = Math.abs(height);

        updateSelectionBox(finalX, finalY, finalW, finalH);
    }

    function handleMouseUp(e) {
        if (!selectionMode || !isDragging) return;
        isDragging = false;

        var rect = selectionBox.getBoundingClientRect();
        var scrollY = window.scrollY || window.pageYOffset;

        if (rect.width > 10 && rect.height > 10) {
            var newArea = {
                id: editingAreaId !== null ? editingAreaId : nextAreaId++,
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
                type: newAreaType
            };

            if (newAreaType === 'fixed') {
                newArea.originalY = rect.top + scrollY;
            }

            colorAreas.push(newArea);
            saveAreas();
            updateOverlay();
        }

        exitSelectionMode();
    }

    function updateSelectionBox(x, y, w, h) {
        if (!selectionBox) return;
        selectionBox.style.left = x + 'px';
        selectionBox.style.top = y + 'px';
        selectionBox.style.width = w + 'px';
        selectionBox.style.height = h + 'px';
    }

    init();

})();
