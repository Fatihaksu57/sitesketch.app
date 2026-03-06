// GEOCODING SERVICE
// iOS Detection & Utilities
const iOS = {
    isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
    nextFrame: () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))),
    forceLayout: (el) => { el.offsetHeight; return el; },
    getViewportHeight: () => window.visualViewport ? window.visualViewport.height : window.innerHeight
};

// EDITOR
class Editor {
    constructor() {
        this.canvas = null; this.ctx = null; this.photo = null; this.image = null;
        this.annotations = []; this.selectedTool = 'SELECT'; this.selectedAnn = null; this._draggingLabel = null;
        this.undoStack = []; this.redoStack = []; this.drawing = false; this.path = [];
        this.scale = 1; this.currentMousePos = null;
        this.dragPointIndex = null; // For dragging individual points in SELECT mode
        this._resizingPoint = null; // For scaling point annotations
        this._resizingLabel = null; // For resizing labels {ann, startX, startScale}
        this._rotating = null; // For rotating annotations {ann, startAngle, startRotation}
        this.currentSurface = 'GEHWEGPLATTE';
        this.currentDN = 'DN50';
        this.sizeMultiplier = 1;
        this._textInputActive = false;
        this.snapRadius = 35; // Snap-Radius in unscaled coords
        this._snapIndicator = null; // {x, y} for visual snap feedback
    }
    init(photo, img) {
        this.photo = photo; this.image = img; this.annotations = JSON.parse(JSON.stringify(photo.annotations || []));
        this.undoStack = []; this.redoStack = []; this.selectedAnn = null; this.selectedTool = 'SELECT';
        this.dragPointIndex = null;
        // Per-Foto Größenmultiplikator: bei hochauflösenden Bildern automatisch hochskalieren
        if (photo.sizeMultiplier) {
this.sizeMultiplier = photo.sizeMultiplier;
        } else {
const longestSide = Math.max(img.width, img.height);
if (longestSide > 1200) {
    this.sizeMultiplier = Math.max(1, Math.round(longestSide / 1200 * 4) / 4);
} else {
    this.sizeMultiplier = 1;
}
        }
        this.canvas = document.getElementById('editorCanvas'); this.ctx = this.canvas.getContext('2d');
        // Canvas sizing - iOS aware with visualViewport
        const toolbarReserve = iOS.isIOS ? 120 : 100;
        const headerReserve = iOS.isIOS ? 120 : 100;
        const margin = 32;
        const maxW = Math.max(200, window.innerWidth - margin);
        const maxH = Math.max(200, iOS.getViewportHeight() - (toolbarReserve + headerReserve));
        this.scale = Math.min(maxW / img.width, maxH / img.height, 1);
        this.canvas.width = img.width * this.scale; this.canvas.height = img.height * this.scale;
        this.setupEvents(); this.renderToolbar(); this.renderLegend(); this.renderLayers(); this.render();
    }
    setupEvents() {
        const getP = (e) => { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale }; };

        this.canvas.onmousedown = (e) => {
// Skip if this was already handled by touch event or text input is active
if (touchHandled || this._textInputActive) return;
const p = getP(e), tool = TOOLS[this.selectedTool];

if (this.selectedTool === 'SELECT') {
    // First check if clicking on a rotation handle
    if (this.selectedAnn && this.isRotatable(this.selectedAnn) && this.findRotationHandleAt(p, this.selectedAnn)) {
        const angle = Math.atan2(p.y - this.selectedAnn.point.y, p.x - this.selectedAnn.point.x);
        this._rotating = { ann: this.selectedAnn, startAngle: angle, startRotation: this.selectedAnn.rotation || 0 };
        this.saveState();
        return;
    }
    // Then check if clicking on a point scale handle
    if (this.selectedAnn && this.selectedAnn._pointResizeHandle) {
        const h = this.selectedAnn._pointResizeHandle;
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) {
            this._resizingPoint = { ann: this.selectedAnn, startX: p.x, startScale: this.selectedAnn.customScale || 1 };
            this.saveState();
            return;
        }
    }
    // Check if clicking on a label resize handle
    if (this.selectedAnn && this.selectedAnn._labelResizeHandle) {
        const h = this.selectedAnn._labelResizeHandle;
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) {
            this._resizingLabel = { ann: this.selectedAnn, startX: p.x, startScale: this.selectedAnn.labelScale || 1 };
            this.saveState();
            return;
        }
    }
    // Check if clicking on a text resize handle
    if (this.selectedAnn && this.selectedAnn._textResizeHandle) {
        const h = this.selectedAnn._textResizeHandle;
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) {
            this._resizingText = { ann: this.selectedAnn, startX: p.x, startScale: this.selectedAnn.textScale || 1 };
            this.saveState();
            return;
        }
    }
    // Then check if clicking on a point of the selected annotation (for individual point dragging)
    if (this.selectedAnn && this.selectedAnn.points) {
        const pointIdx = this.findPointAt(p, this.selectedAnn);
        if (pointIdx !== null) {
            this.dragPointIndex = pointIdx;
            this.selectedAnn._dragPoint = { ...p };
            this.saveState();
            return;
        }
    }
    // Check if clicking on a label (for label dragging)
    const labelAnn = this.findLabelAt(p);
    if (labelAnn) {
        this.selectedAnn = labelAnn;
        if (labelAnn.tool === 'TRASSE') this.ensureTrasseMeta(labelAnn);
        this._draggingLabel = labelAnn;
        this._labelDragStart = { ...p };
        this.saveState();
        this.dragPointIndex = null;
        this.renderLayers();
        this.render();
        this.updateTrasseProps();
        return;
    }
    // Otherwise try to select an annotation
    this.selectedAnn = this.findAt(p);
    if (this.selectedAnn && this.selectedAnn.tool === 'TRASSE') this.ensureTrasseMeta(this.selectedAnn);
    if (this.selectedAnn) this.selectedAnn._drag = { ...p };
    this.dragPointIndex = null;
    this._draggingLabel = null;
    this.renderLayers();
    this.render();
    this.updateTrasseProps();
}
else if (tool.type === 'line' || tool.type === 'arrow' || tool.type === 'dimension') {
    // Drag-to-draw: start a new line on mousedown
    this.drawing = true;
    const snapped = this.applySnap(p, null);
    this.path = [snapped];
    this.saveState();
    this.render();
}
else if (tool.type === 'point') {
    const now = Date.now();
    if (now - lastPlacementTime < PLACEMENT_DEBOUNCE) return;
    lastPlacementTime = now;
    this.saveState();
    const ann = { id: 'a' + Date.now(), tool: this.selectedTool, point: p };
    this.annotations.push(ann);
    this.selectedAnn = ann;
    this.selectedTool = 'SELECT';
    this.renderToolbar();
    this.renderLayers();
    this.render();
}
else if (tool.type === 'text') {
    this.showTextInput(p, (txt) => {
        if (txt) {
            this.saveState();
            const ann = { id: 'a' + Date.now(), tool: this.selectedTool, point: p, text: txt };
            this.annotations.push(ann);
            // Auto-select the new text element
            this.selectedAnn = ann;
            this.selectedTool = 'SELECT';
            this.renderToolbar();
            this.renderLayers();
            this.render();
        }
    });
}
        };

        this.canvas.onmousemove = (e) => {
if (touchHandled) return;
const p = getP(e);
this.currentMousePos = p;

// Snap indicator during line drawing
if (this.drawing && this.path.length > 0) {
    this.applySnap(p, null);
} else {
    this._snapIndicator = null;
}

// Rotating annotation in SELECT mode
if (this._rotating) {
    const angle = Math.atan2(p.y - this._rotating.ann.point.y, p.x - this._rotating.ann.point.x);
    this._rotating.ann.rotation = this._rotating.startRotation + (angle - this._rotating.startAngle);
    this.render();
    return;
}

// Resizing point annotation (scale handle)
if (this._resizingPoint) {
    const dx = p.x - this._resizingPoint.startX;
    const newScale = Math.max(0.3, Math.min(10, this._resizingPoint.startScale + dx / 50));
    this._resizingPoint.ann.customScale = newScale;
    this.render();
    return;
}

// Resizing label in SELECT mode
if (this._resizingLabel) {
    const dx = p.x - this._resizingLabel.startX;
    const newScale = Math.max(0.4, Math.min(5, this._resizingLabel.startScale + dx / 80));
    this._resizingLabel.ann.labelScale = newScale;
    this.render();
    return;
}

// Resizing text annotation in SELECT mode
if (this._resizingText) {
    const dx = p.x - this._resizingText.startX;
    const newScale = Math.max(0.3, Math.min(10, this._resizingText.startScale + dx / 50));
    this._resizingText.ann.textScale = newScale;
    this.render();
    return;
}

// Dragging a label in SELECT mode
if (this._draggingLabel && this._labelDragStart) {
    const a = this._draggingLabel;
    const dx = p.x - this._labelDragStart.x;
    const dy = p.y - this._labelDragStart.y;
    if (!a.labelOffset) a.labelOffset = { dx: 0, dy: 0 };
    a.labelOffset.dx += dx;
    a.labelOffset.dy += dy;
    this._labelDragStart = { ...p };
    this.render();
    return;
}

// Dragging individual point in SELECT mode
if (this.selectedTool === 'SELECT' && this.selectedAnn && this.dragPointIndex !== null && this.selectedAnn._dragPoint) {
    const snapped = this.applySnap(p, this.selectedAnn);
    this.selectedAnn.points[this.dragPointIndex].x = snapped.x;
    this.selectedAnn.points[this.dragPointIndex].y = snapped.y;
    // Recalculate length if map snapshot (not for Bestandstrasse)
    if (this.photo.isMapSnapshot && this.photo.mapMetadata && this.selectedAnn.tool !== 'BESTANDSTRASSE') {
        this.selectedAnn.computed = { lengthMeters: this.calcLength(this.selectedAnn.points) };
    }
    this.render();
    return;
}

// Dragging whole annotation in SELECT mode
if (this.selectedAnn && this.selectedAnn._drag) {
    const dx = p.x - this.selectedAnn._drag.x, dy = p.y - this.selectedAnn._drag.y;
    if (this.selectedAnn.points) this.selectedAnn.points = this.selectedAnn.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
    else if (this.selectedAnn.point) { this.selectedAnn.point.x += dx; this.selectedAnn.point.y += dy; }
    this.selectedAnn._drag = { ...p };
}

this.render();
        };

        this.canvas.onmouseup = (e) => {
if (touchHandled) return;
const p = getP(e);

// Finish rotating
if (this._rotating) {
    this._rotating = null;
    this.renderLayers();
    return;
}

// Finish resizing point (scale handle)
if (this._resizingPoint) {
    this._resizingPoint = null;
    this.renderLayers();
    return;
}

// Finish resizing label
if (this._resizingLabel) {
    this._resizingLabel = null;
    this.renderLayers();
    return;
}

// Finish resizing text
if (this._resizingText) {
    this._resizingText = null;
    this.renderLayers();
    return;
}

// Finish dragging label
if (this._draggingLabel) {
    this._draggingLabel = null;
    this._labelDragStart = null;
    this.renderLayers();
    return;
}

// Finish dragging individual point
if (this.dragPointIndex !== null && this.selectedAnn && this.selectedAnn._dragPoint) {
    delete this.selectedAnn._dragPoint; this._snapIndicator = null;
    this.dragPointIndex = null;
    this.renderLayers();
    return;
}

// Finish dragging whole annotation
if (this.selectedAnn && this.selectedAnn._drag) {
    delete this.selectedAnn._drag;
    this.saveState();
}

// Finish drawing line (drag-to-draw: complete line on mouseup)
if (this.drawing && this.path.length > 0) {
    const tool = TOOLS[this.selectedTool];
    if (tool && (tool.type === 'line' || tool.type === 'arrow' || tool.type === 'dimension')) {
        // Add end point with snap
        const snapped = this.applySnap(p, null);
        this.path.push(snapped);
        this._snapIndicator = null;

        // Create annotation with 2 points (start and end)
        const ann = { id: 'a' + Date.now(), tool: this.selectedTool, points: this.path };
        if (ann.tool === 'TRASSE') {
            ann.meta = { surface: this.currentSurface, dn: this.currentDN };
        }
        if (this.photo.isMapSnapshot && this.photo.mapMetadata && this.selectedTool !== 'BESTANDSTRASSE') {
            ann.computed = { lengthMeters: this.calcLength(this.path) };
        }
        // Bei Maßkette: Text abfragen
        if (tool.type === 'dimension') {
            const measure = prompt('Maß eingeben (z.B. 2.5 m):');
            ann.text = measure || '? m';
        }
        this.annotations.push(ann);
        this.renderLayers();
    }
    this.drawing = false;
    this.path = [];
    this.currentMousePos = null;
    this.render();
}
        };

        this.canvas.ondblclick = (e) => {
if (touchHandled) return;
const p = getP(e);
// Double click on label to reset position
const labelAnn = this.findLabelAt(p);
if (labelAnn && labelAnn.labelOffset) {
    this.saveState();
    delete labelAnn.labelOffset;
    this.render();
    return;
}
// Double click to edit text
if (this.selectedTool === 'SELECT' && this.selectedAnn && this.selectedAnn.text !== undefined) {
    this.showTextInput(this.selectedAnn.point, (txt) => {
        if (txt !== null) { this.saveState(); this.selectedAnn.text = txt; this.renderLayers(); this.render(); }
    }, this.selectedAnn.text);
}
        };

        // Touch events - iOS optimized with passive:false
        // Pinch-zoom & 2-finger pan state
        let lastTapTime = 0;
        let isZoomDragging = false;
        let zoomStartY = 0;
        let zoomStartScale = 1;
        let isPinching = false;
        let pinchStartDist = 0;
        let pinchStartScale = 1;
        let isPanning = false;
        let panStartX = 0, panStartY = 0;
        let panScrollStartX = 0, panScrollStartY = 0;

        // Schacht drag-to-size state
        let schachtDragStart = null;
        let schachtDragCurrent = null;

        // Flag to prevent mouse events from firing after touch events
        let touchHandled = false;
        let touchHandledTimer = null;
        // Debounce for point/schacht placement to prevent duplicates
        let lastPlacementTime = 0;
        const PLACEMENT_DEBOUNCE = 600; // ms

        const pinchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        const pinchCenter = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

        const isSchachtTool = () => {
const tool = TOOLS[this.selectedTool];
return tool && tool.type === 'point' && (tool.symbol === '□' || tool.symbol === '□□' || tool.symbol === '▬' || tool.symbol === '▯');
        };

        const handleTouchStart = (e) => {
// Skip if text input is active
if (this._textInputActive) return;
// 2-finger gesture: pinch-zoom or pan
if (e.touches.length === 2) {
    e.preventDefault();
    isPinching = true;
    isPanning = true;
    pinchStartDist = pinchDist(e.touches);
    pinchStartScale = this.scale;
    const center = pinchCenter(e.touches);
    panStartX = center.x;
    panStartY = center.y;
    const wrapper = this.canvas.parentElement;
    panScrollStartX = wrapper.scrollLeft;
    panScrollStartY = wrapper.scrollTop;
    // Cancel any ongoing 1-finger action
    this.drawing = false;
    this.path = [];
    schachtDragStart = null;
    schachtDragCurrent = null;
    return;
}

const now = Date.now();
const timeSinceLastTap = now - lastTapTime;

// Detect double-tap (second tap within 300ms) for zoom drag
// But NOT when in SELECT mode and tapping on an annotation (user wants to drag it)
if (timeSinceLastTap < 300 && e.touches.length === 1) {
    const t0 = e.touches[0];
    const r0 = this.canvas.getBoundingClientRect();
    const p0 = { x: (t0.clientX - r0.left) / this.scale, y: (t0.clientY - r0.top) / this.scale };
    const hitAnn = this.findAt(p0);
    const hitLabel = this.findLabelAt(p0);
    if (this.selectedTool === 'SELECT' && (hitAnn || hitLabel || this.selectedAnn)) {
        // Don't zoom-drag — fall through to normal SELECT handling
    } else {
        isZoomDragging = true;
        zoomStartY = e.touches[0].clientY;
        zoomStartScale = this.scale;
        e.preventDefault();
        return;
    }
}

lastTapTime = now;

// Normal touch handling
if (isZoomDragging || isPinching) return;

// Set flag to prevent subsequent mouse events from duplicating this action
touchHandled = true;
clearTimeout(touchHandledTimer);
touchHandledTimer = setTimeout(() => { touchHandled = false; }, 800);

e.preventDefault();
const t = e.touches[0];
const r = this.canvas.getBoundingClientRect();
const p = { x: (t.clientX - r.left) / this.scale, y: (t.clientY - r.top) / this.scale };
const tool = TOOLS[this.selectedTool];

if (this.selectedTool === 'SELECT') {
    // Check rotation handle first (touch)
    if (this.selectedAnn && this.isRotatable(this.selectedAnn) && this.findRotationHandleAt(p, this.selectedAnn)) {
        const angle = Math.atan2(p.y - this.selectedAnn.point.y, p.x - this.selectedAnn.point.x);
        this._rotating = { ann: this.selectedAnn, startAngle: angle, startRotation: this.selectedAnn.rotation || 0 };
        this.saveState();
        return;
    }
    // Check point scale handle (touch)
    if (this.selectedAnn && this.selectedAnn._pointResizeHandle) {
        const h = this.selectedAnn._pointResizeHandle;
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) {
            this._resizingPoint = { ann: this.selectedAnn, startX: p.x, startScale: this.selectedAnn.customScale || 1 };
            this.saveState();
            return;
        }
    }
    // Check text resize handle (touch)
    if (this.selectedAnn && this.selectedAnn._textResizeHandle) {
        const h = this.selectedAnn._textResizeHandle;
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.r) {
            this._resizingText = { ann: this.selectedAnn, startX: p.x, startScale: this.selectedAnn.textScale || 1 };
            this.saveState();
            return;
        }
    }
    // Check label resize handle (touch)
    if (this.selectedAnn && this.selectedAnn._labelResizeHandle) {
        const h = this.selectedAnn._labelResizeHandle;
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.r + 5) {
            this._resizingLabel = { ann: this.selectedAnn, startX: p.x, startScale: this.selectedAnn.labelScale || 1 };
            this.saveState();
            return;
        }
    }
    if (this.selectedAnn && this.selectedAnn.points) {
        const pointIdx = this.findPointAt(p, this.selectedAnn);
        if (pointIdx !== null) {
            this.dragPointIndex = pointIdx;
            this.selectedAnn._dragPoint = { ...p };
            this.saveState();
            return;
        }
    }
    // Check if touching a label (for label dragging)
    const labelAnn = this.findLabelAt(p);
    if (labelAnn) {
        this.selectedAnn = labelAnn;
        if (labelAnn.tool === 'TRASSE') this.ensureTrasseMeta(labelAnn);
        this._draggingLabel = labelAnn;
        this._labelDragStart = { ...p };
        this.saveState();
        this.dragPointIndex = null;
        this.renderLayers();
        this.render();
        this.updateTrasseProps();
        return;
    }
    this.selectedAnn = this.findAt(p);
    if (this.selectedAnn && this.selectedAnn.tool === 'TRASSE') this.ensureTrasseMeta(this.selectedAnn);
    if (this.selectedAnn) this.selectedAnn._drag = { ...p };
    this.dragPointIndex = null;
    this._draggingLabel = null;
    this.renderLayers();
    this.render();
    this.updateTrasseProps();
}
else if (isSchachtTool()) {
    // Schacht: start drag-to-size (only if no drag already active)
    if (schachtDragStart) return; // prevent re-entry
    e.preventDefault();
    this.saveState();
    schachtDragStart = p;
    schachtDragCurrent = p;
    this._schachtTouchId = e.touches[0] ? e.touches[0].identifier : null;
    this.render();
}
else if (tool && (tool.type === 'line' || tool.type === 'arrow' || tool.type === 'dimension')) {
    this.drawing = true;
    const snapped = this.applySnap(p, null);
    this.path = [snapped];
    this.saveState();
    this.render();
}
else if (tool && tool.type === 'point') {
    const now = Date.now();
    if (now - lastPlacementTime < PLACEMENT_DEBOUNCE) return;
    lastPlacementTime = now;
    this.saveState();
    const ann = { id: 'a' + Date.now(), tool: this.selectedTool, point: p };
    this.annotations.push(ann);
    this.selectedAnn = ann;
    this.selectedTool = 'SELECT';
    this.renderToolbar();
    this.renderLayers();
    this.render();
}
else if (tool && tool.type === 'text') {
    this.showTextInput(p, (txt) => {
        if (txt) {
            this.saveState();
            const ann = { id: 'a' + Date.now(), tool: this.selectedTool, point: p, text: txt };
            this.annotations.push(ann);
            this.selectedAnn = ann;
            this.selectedTool = 'SELECT';
            this.renderToolbar();
            this.renderLayers();
            this.render();
        }
    });
}
        };

        const handleTouchMove = (e) => {
// Handle pinch-zoom + 2-finger pan
if ((isPinching || isPanning) && e.touches.length === 2) {
    e.preventDefault();
    // Pinch zoom
    const newDist = pinchDist(e.touches);
    const zoomRatio = newDist / pinchStartDist;
    this.scale = Math.max(0.2, Math.min(5, pinchStartScale * zoomRatio));
    this.applyZoom();
    // Pan
    const center = pinchCenter(e.touches);
    const dx = panStartX - center.x;
    const dy = panStartY - center.y;
    const wrapper = this.canvas.parentElement;
    wrapper.scrollLeft = panScrollStartX + dx;
    wrapper.scrollTop = panScrollStartY + dy;
    return;
}

// Handle double-tap zoom drag
if (isZoomDragging && e.touches.length === 1) {
    e.preventDefault();
    const currentY = e.touches[0].clientY;
    const deltaY = zoomStartY - currentY;
    const zoomFactor = 1 + (deltaY / 200);
    const newScale = Math.max(0.2, Math.min(5, zoomStartScale * zoomFactor));
    this.scale = newScale;
    this.applyZoom();
    return;
}

e.preventDefault();
const t = e.touches[0];
const r = this.canvas.getBoundingClientRect();
const p = { x: (t.clientX - r.left) / this.scale, y: (t.clientY - r.top) / this.scale };
this.currentMousePos = p;

// Snap indicator during line drawing (touch)
if (this.drawing && this.path.length > 0) {
    this.applySnap(p, null);
}

// Schacht drag preview
if (schachtDragStart && isSchachtTool()) {
    schachtDragCurrent = p;
    this.render();
    // Draw preview rectangle
    const tool = TOOLS[this.selectedTool];
    const x1 = Math.min(schachtDragStart.x, p.x) * this.scale;
    const y1 = Math.min(schachtDragStart.y, p.y) * this.scale;
    const w = Math.abs(p.x - schachtDragStart.x) * this.scale;
    const h = Math.abs(p.y - schachtDragStart.y) * this.scale;
    if (w > 2 || h > 2) {
        this.ctx.fillStyle = tool.color + '66';
        this.ctx.strokeStyle = tool.color;
        this.ctx.lineWidth = 2 * this.scale;
        this.ctx.setLineDash([6, 4]);
        this.ctx.fillRect(x1, y1, w, h);
        this.ctx.strokeRect(x1, y1, w, h);
        this.ctx.setLineDash([]);
    }
    return;
}

// Rotating annotation (touch)
if (this._rotating) {
    const angle = Math.atan2(p.y - this._rotating.ann.point.y, p.x - this._rotating.ann.point.x);
    this._rotating.ann.rotation = this._rotating.startRotation + (angle - this._rotating.startAngle);
    this.render();
    return;
}

// Resize point (touch, scale handle)
if (this._resizingPoint) {
    const dx = p.x - this._resizingPoint.startX;
    const newScale = Math.max(0.3, Math.min(10, this._resizingPoint.startScale + dx / 50));
    this._resizingPoint.ann.customScale = newScale;
    this.render();
    return;
}

// Resize label (touch)
if (this._resizingLabel) {
    const dx = p.x - this._resizingLabel.startX;
    const newScale = Math.max(0.4, Math.min(5, this._resizingLabel.startScale + dx / 80));
    this._resizingLabel.ann.labelScale = newScale;
    this.render();
    return;
}

// Resize text (touch)
if (this._resizingText) {
    const dx = p.x - this._resizingText.startX;
    const newScale = Math.max(0.3, Math.min(10, this._resizingText.startScale + dx / 50));
    this._resizingText.ann.textScale = newScale;
    this.render();
    return;
}

// Label drag (touch)
if (this._draggingLabel && this._labelDragStart) {
    const a = this._draggingLabel;
    const ddx = p.x - this._labelDragStart.x;
    const ddy = p.y - this._labelDragStart.y;
    if (!a.labelOffset) a.labelOffset = { dx: 0, dy: 0 };
    a.labelOffset.dx += ddx;
    a.labelOffset.dy += ddy;
    this._labelDragStart = { ...p };
    this.render();
    return;
}

if (this.selectedTool === 'SELECT' && this.selectedAnn && this.dragPointIndex !== null && this.selectedAnn._dragPoint) {
    const snapped = this.applySnap(p, this.selectedAnn);
    this.selectedAnn.points[this.dragPointIndex].x = snapped.x;
    this.selectedAnn.points[this.dragPointIndex].y = snapped.y;
    if (this.photo.isMapSnapshot && this.photo.mapMetadata && this.selectedAnn.tool !== 'BESTANDSTRASSE') {
        this.selectedAnn.computed = { lengthMeters: this.calcLength(this.selectedAnn.points) };
    }
    this.render();
    return;
}

if (this.selectedAnn && this.selectedAnn._drag) {
    const dx = p.x - this.selectedAnn._drag.x, dy = p.y - this.selectedAnn._drag.y;
    if (this.selectedAnn.points) this.selectedAnn.points = this.selectedAnn.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
    else if (this.selectedAnn.point) { this.selectedAnn.point.x += dx; this.selectedAnn.point.y += dy; }
    this.selectedAnn._drag = { ...p };
}

this.render();
        };

        const handleTouchEnd = (e) => {
// End pinch/pan
if (isPinching || isPanning) {
    if (e.touches.length < 2) {
        isPinching = false;
        isPanning = false;
    }
    return;
}

// End zoom drag
if (isZoomDragging) {
    isZoomDragging = false;
    return;
}

// End Schacht drag-to-size
if (schachtDragStart && schachtDragCurrent && isSchachtTool()) {
    const now = Date.now();
    if (now - lastPlacementTime < PLACEMENT_DEBOUNCE) {
        schachtDragStart = null;
        schachtDragCurrent = null;
        this._schachtTouchId = null;
        return;
    }
    lastPlacementTime = now;
    const dx = Math.abs(schachtDragCurrent.x - schachtDragStart.x);
    const dy = Math.abs(schachtDragCurrent.y - schachtDragStart.y);
    const center = {
        x: (schachtDragStart.x + schachtDragCurrent.x) / 2,
        y: (schachtDragStart.y + schachtDragCurrent.y) / 2
    };
    // Wenn genug gezogen wurde: benutzerdefinierte Größe, sonst Standard-Tap
    const customSize = (dx > 8 || dy > 8) ? Math.max(dx, dy) : null;
    const ann = { id: 'a' + Date.now(), tool: this.selectedTool, point: center };
    if (customSize) ann.customSize = customSize;
    this.annotations.push(ann);
    this.selectedAnn = ann;
    this.selectedTool = 'SELECT';
    schachtDragStart = null;
    schachtDragCurrent = null;
    this._schachtTouchId = null;
    this.renderToolbar();
    this.renderLayers();
    this.render();
    return;
}
// Clean up stale Schacht drag state
if (schachtDragStart) {
    schachtDragStart = null;
    schachtDragCurrent = null;
    this._schachtTouchId = null;
}

e.preventDefault();
const lastP = this.currentMousePos;

// Finish rotating (touch)
if (this._rotating) {
    this._rotating = null;
    this.renderLayers();
    return;
}

// Finish resizing point (touch)
if (this._resizingPoint) {
    this._resizingPoint = null;
    this.renderLayers();
    return;
}

// Finish resizing label (touch)
if (this._resizingLabel) {
    this._resizingLabel = null;
    this.renderLayers();
    return;
}

// Finish resizing text (touch)
if (this._resizingText) {
    this._resizingText = null;
    this.renderLayers();
    return;
}

// Finish label drag (touch)
if (this._draggingLabel) {
    this._draggingLabel = null;
    this._labelDragStart = null;
    this.renderLayers();
    return;
}

if (this.dragPointIndex !== null && this.selectedAnn && this.selectedAnn._dragPoint) {
    delete this.selectedAnn._dragPoint; this._snapIndicator = null;
    this.dragPointIndex = null;
    this.renderLayers();
    return;
}

if (this.selectedAnn && this.selectedAnn._drag) {
    delete this.selectedAnn._drag;
    this.saveState();
}

if (this.drawing && this.path.length > 0 && lastP) {
    const tool = TOOLS[this.selectedTool];
    if (tool && (tool.type === 'line' || tool.type === 'arrow' || tool.type === 'dimension')) {
        const snapped = this.applySnap(lastP, null);
        this.path.push(snapped);
        this._snapIndicator = null;
        const ann = { id: 'a' + Date.now(), tool: this.selectedTool, points: this.path };
        if (ann.tool === 'TRASSE') {
            ann.meta = { surface: this.currentSurface, dn: this.currentDN };
        }
        if (this.photo.isMapSnapshot && this.photo.mapMetadata && this.selectedTool !== 'BESTANDSTRASSE') {
            ann.computed = { lengthMeters: this.calcLength(this.path) };
        }
        // Bei Maßkette: Text abfragen
        if (tool.type === 'dimension') {
            const measure = prompt('Maß eingeben (z.B. 2.5 m):');
            ann.text = measure || '? m';
        }
        this.annotations.push(ann);
        this.renderLayers();
    }
    this.drawing = false;
    this.path = [];
    this.currentMousePos = null;
    this.render();
}
        };

        // iOS: Must use passive: false to allow preventDefault
        this.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        this.canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    }

    findPointAt(p, ann) {
        if (!ann.points) return null;
        for (let i = 0; i < ann.points.length; i++) {
if (Math.hypot(p.x - ann.points[i].x, p.y - ann.points[i].y) < 22) {
    return i;
}
        }
        return null;
    }

    // --- SNAP SYSTEM ---
    // Find the closest snap target within snapRadius, excluding a specific annotation
    findSnapPoint(p, excludeAnn) {
        let best = null, bestDist = this.snapRadius;
        for (const a of this.annotations) {
if (a === excludeAnn) continue;
// Snap to endpoints of line/arrow/dimension annotations
if (a.points) {
    for (const pt of a.points) {
        const d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < bestDist) { bestDist = d; best = { x: pt.x, y: pt.y, type: 'endpoint' }; }
    }
    // Snap to nearest point on line segments
    for (let j = 0; j < a.points.length - 1; j++) {
        const np = this._nearestOnSeg(p, a.points[j], a.points[j + 1]);
        const d = Math.hypot(p.x - np.x, p.y - np.y);
        if (d < bestDist && d > 3) { bestDist = d; best = { x: np.x, y: np.y, type: 'online' }; }
    }
}
// Snap to center of point-type annotations (Schacht, Bohrung, etc.)
if (a.point) {
    const d = Math.hypot(p.x - a.point.x, p.y - a.point.y);
    if (d < bestDist) { bestDist = d; best = { x: a.point.x, y: a.point.y, type: 'center' }; }
}
        }
        return best;
    }

    // Nearest point on a line segment
    _nearestOnSeg(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return { x: a.x, y: a.y };
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return { x: a.x + t * dx, y: a.y + t * dy };
    }

    // Apply snap: returns snapped point or original
    applySnap(p, excludeAnn) {
        const snap = this.findSnapPoint(p, excludeAnn);
        if (snap) {
this._snapIndicator = snap;
return { x: snap.x, y: snap.y };
        }
        this._snapIndicator = null;
        return p;
    }

    // Draw snap indicator on canvas
    drawSnapIndicator() {
        if (!this._snapIndicator) return;
        const s = this._snapIndicator;
        const sx = s.x * this.scale, sy = s.y * this.scale;
        this.ctx.save();
        if (s.type === 'endpoint' || s.type === 'center') {
// Filled circle with crosshair for endpoint/center snap
this.ctx.strokeStyle = '#22C55E';
this.ctx.lineWidth = 2;
this.ctx.fillStyle = 'rgba(34,197,94,0.2)';
this.ctx.beginPath(); this.ctx.arc(sx, sy, 12, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
// Crosshair
this.ctx.beginPath();
this.ctx.moveTo(sx - 7, sy); this.ctx.lineTo(sx + 7, sy);
this.ctx.moveTo(sx, sy - 7); this.ctx.lineTo(sx, sy + 7);
this.ctx.stroke();
        } else {
// Diamond for on-line snap
this.ctx.strokeStyle = '#F59E0B';
this.ctx.lineWidth = 2;
this.ctx.fillStyle = 'rgba(245,158,11,0.2)';
this.ctx.beginPath();
this.ctx.moveTo(sx, sy - 8); this.ctx.lineTo(sx + 8, sy);
this.ctx.lineTo(sx, sy + 8); this.ctx.lineTo(sx - 8, sy);
this.ctx.closePath(); this.ctx.fill(); this.ctx.stroke();
        }
        this.ctx.restore();
    }
    // --- END SNAP SYSTEM ---
    findAt(p) {
        for (let i = this.annotations.length - 1; i >= 0; i--) {
const a = this.annotations[i];
if (a.points) { for (let j = 0; j < a.points.length - 1; j++) if (this.distSeg(p, a.points[j], a.points[j + 1]) < 15) return a; }
else if (a.point) {
    const tool = TOOLS[a.tool];
    const baseSize = a.customSize || (tool ? tool.size : 14) || 14;
    const cs = a.customScale || 1;
    const sz = baseSize * (a.customSize ? 1 : this.sizeMultiplier) * cs;
    // Rectangular shapes: bounding box hit test (with rotation support)
    if (tool && (tool.symbol === '□' || tool.symbol === '□□' || tool.symbol === '▬' || tool.symbol === '▯')) {
        const rot = a.rotation || 0;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        const dx = p.x - a.point.x, dy = p.y - a.point.y;
        const rx = dx * cos - dy * sin, ry = dx * sin + dy * cos;
        const halfW = (tool.symbol === '▬' ? sz * 0.7 : tool.symbol === '▯' ? sz * 0.35 : sz / 2) + 8;
        const halfH = (tool.symbol === '▬' ? sz * 0.35 : tool.symbol === '▯' ? sz * 0.7 : sz / 2) + 8;
        if (Math.abs(rx) <= halfW && Math.abs(ry) <= halfH) return a;
    }
    // Text annotations: use bounding box
    else if (tool && tool.type === 'text' && a.text) {
        const ts = a.textScale || 1;
        const sm = this.sizeMultiplier;
        const fontSize = 14 * ts * sm;
        const approxW = a.text.length * fontSize * 0.6 + 12 * ts * sm;
        const approxH = 20 * ts * sm;
        if (p.x >= a.point.x - 5 && p.x <= a.point.x + approxW + 5 &&
            p.y >= a.point.y - approxH / 2 - 5 && p.y <= a.point.y + approxH / 2 + 5) return a;
    }
    // All other point shapes: circular hit test
    else {
        const hitRadius = Math.max(20, sz / 2 + 8);
        if (Math.hypot(p.x - a.point.x, p.y - a.point.y) < hitRadius) return a;
    }
}
        }
        return null;
    }
    findLabelAt(p) {
        for (let i = this.annotations.length - 1; i >= 0; i--) {
const a = this.annotations[i];
if (a._labelBounds) {
    const b = a._labelBounds;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return a;
}
        }
        return null;
    }
    getResizeHandles(a) {
        // Returns corner handles for point annotations that can be resized
        const tool = TOOLS[a.tool]; if (!tool || !a.point) return [];
        const baseSize = a.customSize || tool.size || 14;
        const sz = baseSize * (a.customSize ? 1 : this.sizeMultiplier);
        const x = a.point.x, y = a.point.y;
        const half = sz / 2 + 4; // slightly outside the shape
        return [
{ x: x - half, y: y - half, cursor: 'nw' },
{ x: x + half, y: y - half, cursor: 'ne' },
{ x: x + half, y: y + half, cursor: 'se' },
{ x: x - half, y: y + half, cursor: 'sw' }
        ];
    }
    findResizeHandleAt(p, ann) {
        if (!ann || !ann.point) return null;
        const handles = this.getResizeHandles(ann);
        for (let i = 0; i < handles.length; i++) {
if (Math.hypot(p.x - handles[i].x, p.y - handles[i].y) < 12) return i;
        }
        return null;
    }
    isRotatable(ann) {
        if (!ann || !ann.point) return false;
        const tool = TOOLS[ann.tool];
        return tool && (tool.symbol === '□' || tool.symbol === '▬' || tool.symbol === '▯');
    }
    getRotationHandle(a) {
        if (!a.point) return null;
        const tool = TOOLS[a.tool]; if (!tool) return null;
        const cs = a.customScale || 1;
        const baseSize = a.customSize || tool.size || 14;
        const sz = baseSize * (a.customSize ? 1 : this.sizeMultiplier) * cs;
        const rot = a.rotation || 0;
        // Handle position: below the shape, rotated with the shape
        const dist = sz / 2 + 20;
        return {
x: a.point.x - dist * Math.sin(rot) * -1,
y: a.point.y + dist * Math.cos(rot) * 1
        };
    }
    findRotationHandleAt(p, ann) {
        if (!this.isRotatable(ann)) return false;
        const h = this.getRotationHandle(ann);
        if (!h) return false;
        return Math.hypot(p.x - h.x, p.y - h.y) < 14;
    }
    distSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); }
    calcLength(pts) {
        if (!this.photo.mapMetadata) return 0;
        const m = this.photo.mapMetadata, bb = m.boundingBox; let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
const p1 = { lon: bb.west + pts[i].x * (bb.east - bb.west) / m.pixelWidth, lat: bb.north - pts[i].y * (bb.north - bb.south) / m.pixelHeight };
const p2 = { lon: bb.west + pts[i + 1].x * (bb.east - bb.west) / m.pixelWidth, lat: bb.north - pts[i + 1].y * (bb.north - bb.south) / m.pixelHeight };
const R = 6371000, dLat = (p2.lat - p1.lat) * Math.PI / 180, dLon = (p2.lon - p1.lon) * Math.PI / 180;
const aa = Math.sin(dLat / 2) ** 2 + Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
total += R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
        }
        return total;
    }
    saveState() { this.undoStack.push(JSON.stringify(this.annotations)); this.redoStack = []; if (this.undoStack.length > 50) this.undoStack.shift(); }
    undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.annotations)); this.annotations = JSON.parse(this.undoStack.pop()); this.selectedAnn = null; this.renderLayers(); this.render(); }
    redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.annotations)); this.annotations = JSON.parse(this.redoStack.pop()); this.selectedAnn = null; this.renderLayers(); this.render(); }
    deleteSelected() { if (!this.selectedAnn) return; this.saveState(); this.annotations = this.annotations.filter(a => a.id !== this.selectedAnn.id); this.selectedAnn = null; this.renderLayers(); this.render(); }
    resetAllAnnotations() {
        if (!this.annotations.length) return;
        if (!confirm('Alle Markierungen auf diesem Bild zurücksetzen?')) return;
        this.saveState();
        this.annotations = [];
        this.selectedAnn = null;
        this.renderLayers();
        this.render();
        this.renderToolbar();
        this.toast('Alle Markierungen zurückgesetzt', 'info');
    }
    render() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
        this.annotations.forEach(a => this.drawAnn(a, a === this.selectedAnn));
        // Draw preview line while drawing (single straight line from start to current position)
        if (this.drawing && this.path.length > 0 && this.currentMousePos) {
const tool = TOOLS[this.selectedTool];
const previewTarget = this._snapIndicator || this.currentMousePos;
this.ctx.save();
this.ctx.strokeStyle = tool.color;
this.ctx.lineWidth = (tool.lineWidth || 2) * this.scale;
if (tool.dash) this.ctx.setLineDash(tool.dash.map(d => d * this.scale)); else this.ctx.setLineDash([]);
this.ctx.lineCap = 'round';
this.ctx.lineJoin = 'round';
this.ctx.globalAlpha = 0.6;
this.ctx.beginPath();
this.ctx.moveTo(this.path[0].x * this.scale, this.path[0].y * this.scale);
this.ctx.lineTo(previewTarget.x * this.scale, previewTarget.y * this.scale);
this.ctx.stroke();
// Draw start point
this.ctx.globalAlpha = 1;
this.ctx.fillStyle = '#FFF';
this.ctx.strokeStyle = tool.color;
this.ctx.lineWidth = 2;
this.ctx.setLineDash([]);
this.ctx.beginPath();
this.ctx.arc(this.path[0].x * this.scale, this.path[0].y * this.scale, 6, 0, Math.PI * 2);
this.ctx.fill();
this.ctx.stroke();
this.ctx.restore();
        }
        // Draw snap indicator
        this.drawSnapIndicator();
        this.updateMiniToolbar();
    }

    updateMiniToolbar() {
        let tb = document.getElementById('annMiniToolbar');
        if (!this.selectedAnn || this.selectedTool !== 'SELECT') {
if (tb) tb.style.display = 'none';
return;
        }
        // Create toolbar if it doesn't exist
        if (!tb) {
tb = document.createElement('div');
tb.id = 'annMiniToolbar';
tb.className = 'ann-mini-toolbar';
this.canvas.parentElement.appendChild(tb);
        }
        const a = this.selectedAnn;
        const isText = a.text !== undefined;
        tb.innerHTML = `
<button class="danger" title="Löschen" data-action="delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
<button title="Duplizieren" data-action="duplicate"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
${isText ? '<button title="Text bearbeiten" data-action="edit"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' : ''}
        `;
        tb.querySelector('[data-action="delete"]').onclick = (e) => {
e.stopPropagation();
this.deleteSelected();
this.renderToolbar();
        };
        tb.querySelector('[data-action="duplicate"]').onclick = (e) => {
e.stopPropagation();
this.duplicateSelected();
        };
        if (isText && tb.querySelector('[data-action="edit"]')) {
tb.querySelector('[data-action="edit"]').onclick = (e) => {
    e.stopPropagation();
    this.showTextInput(a.point, (txt) => {
        if (txt !== null && txt !== '') { this.saveState(); a.text = txt; this.renderLayers(); this.render(); }
    }, a.text);
};
        }
        // Position above the annotation
        const canvasRect = this.canvas.getBoundingClientRect();
        const wrapperRect = this.canvas.parentElement.getBoundingClientRect();
        let ax, ay;
        if (a.point) {
ax = a.point.x * this.scale;
ay = a.point.y * this.scale;
        } else if (a.points && a.points.length > 0) {
// Use topmost point
let minY = Infinity, midX = 0;
a.points.forEach(pt => { if (pt.y < minY) { minY = pt.y; midX = pt.x; } });
ax = midX * this.scale;
ay = minY * this.scale;
        } else {
tb.style.display = 'none';
return;
        }
        // Convert canvas coords to wrapper-relative coords
        const canvasOffsetX = canvasRect.left - wrapperRect.left + this.canvas.parentElement.scrollLeft;
        const canvasOffsetY = canvasRect.top - wrapperRect.top + this.canvas.parentElement.scrollTop;
        const posX = canvasOffsetX + ax;
        const posY = canvasOffsetY + ay - 12;
        tb.style.display = 'flex';
        tb.style.left = posX + 'px';
        tb.style.top = posY + 'px';
    }

    duplicateSelected() {
        if (!this.selectedAnn) return;
        this.saveState();
        const clone = JSON.parse(JSON.stringify(this.selectedAnn));
        clone.id = 'a' + Date.now();
        // Offset the clone slightly so it's visible
        const offset = 20;
        if (clone.point) {
clone.point.x += offset;
clone.point.y += offset;
        } else if (clone.points) {
clone.points = clone.points.map(pt => ({ x: pt.x + offset, y: pt.y + offset }));
        }
        // Reset label offset for clone
        delete clone.labelOffset;
        this.annotations.push(clone);
        this.selectedAnn = clone;
        this.renderLayers();
        this.render();
        this.renderToolbar();
        this.toast('Element dupliziert', 'info');
    }

    showTextInput(canvasPoint, callback, existingText) {
        this.closeTextInput();
        this._textInputActive = true;
        const overlay = document.createElement('div');
        overlay.className = 'text-input-overlay';
        overlay.id = 'textInputOverlay';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = existingText || '';
        input.placeholder = 'Text eingeben...';

        const okBtn = document.createElement('button');
        okBtn.className = 'text-ok';
        okBtn.innerHTML = '✓';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'text-cancel';
        cancelBtn.innerHTML = '✕';

        overlay.appendChild(input);
        overlay.appendChild(okBtn);
        overlay.appendChild(cancelBtn);

        const wrapper = this.canvas.parentElement;
        wrapper.appendChild(overlay);

        // Position at canvas point
        const canvasRect = this.canvas.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const cx = canvasRect.left - wrapperRect.left + wrapper.scrollLeft + canvasPoint.x * this.scale;
        const cy = canvasRect.top - wrapperRect.top + wrapper.scrollTop + canvasPoint.y * this.scale;
        overlay.style.left = cx + 'px';
        overlay.style.top = cy + 'px';

        const finish = (val) => {
this.closeTextInput();
callback(val);
        };

        okBtn.onclick = (e) => { e.stopPropagation(); finish(input.value); };
        cancelBtn.onclick = (e) => { e.stopPropagation(); finish(null); };
        input.onkeydown = (e) => {
if (e.key === 'Enter') { e.preventDefault(); finish(input.value); }
else if (e.key === 'Escape') { finish(null); }
        };
        // Prevent canvas events while typing
        overlay.onmousedown = (e) => e.stopPropagation();
        overlay.ontouchstart = (e) => e.stopPropagation();

        setTimeout(() => { input.focus(); input.select(); }, 50);
    }

    closeTextInput() {
        this._textInputActive = false;
        const el = document.getElementById('textInputOverlay');
        if (el) el.remove();
    }
    drawAnn(a, sel) {
        const tool = TOOLS[a.tool]; if (!tool) return;
        this.ctx.save();
        if (tool.type === 'line' && a.points && a.points.length > 1) {
// Bei Trasse: Farbe aus Oberfläche nehmen
let lineColor = tool.color;
if (a.tool === 'TRASSE' && a.meta?.surface) {
    const surf = SURFACES.find(s => s.value === a.meta.surface);
    if (surf?.color) lineColor = surf.color;
}

this.ctx.strokeStyle = lineColor; this.ctx.lineWidth = (tool.lineWidth + (sel ? 2 : 0)) * this.scale * this.sizeMultiplier; this.ctx.lineCap = 'round';
if (tool.dash) this.ctx.setLineDash(tool.dash.map(d => d * this.scale)); else this.ctx.setLineDash([]);
this.ctx.beginPath(); this.ctx.moveTo(a.points[0].x * this.scale, a.points[0].y * this.scale);
for (let i = 1; i < a.points.length; i++) this.ctx.lineTo(a.points[i].x * this.scale, a.points[i].y * this.scale);
this.ctx.stroke();
if (a.computed && a.computed.lengthMeters) {
    // Berechne die echte Mitte der Linie
    let totalLen = 0, segments = [];
    for (let i = 1; i < a.points.length; i++) {
        const dx = a.points[i].x - a.points[i - 1].x, dy = a.points[i].y - a.points[i - 1].y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        segments.push({ start: a.points[i - 1], end: a.points[i], len: segLen });
        totalLen += segLen;
    }
    const halfLen = totalLen / 2;
    let accumulated = 0, mid = a.points[0];
    let midSeg = null;
    for (const seg of segments) {
        if (accumulated + seg.len >= halfLen) {
            const ratio = (halfLen - accumulated) / seg.len;
            mid = { x: seg.start.x + (seg.end.x - seg.start.x) * ratio, y: seg.start.y + (seg.end.y - seg.start.y) * ratio };
            midSeg = seg;
            break;
        }
        accumulated += seg.len;
    }

    // Label erstellen - bei Trasse mit DN und Oberfläche
    let label = tool.name;
    if (a.tool === 'TRASSE' && a.meta) {
        const dn = a.meta.dn || 'DN50';
        const surfObj = SURFACES.find(s => s.value === (a.meta.surface || 'GEHWEGPLATTE'));
        const surfLabel = surfObj ? surfObj.label : a.meta.surface;
        label = `${dn} · ${surfLabel}`;
    }
    label += ' · ' + a.computed.lengthMeters.toFixed(1) + ' m';

    const ls = a.labelScale || 1; // Label-Skalierung
    const fontSize = 14 * this.scale * ls * this.sizeMultiplier;
    this.ctx.font = `bold ${fontSize}px 'Roboto', sans-serif`; const tw = this.ctx.measureText(label).width;

    // Label-Position: Auto-Offset basierend auf Linienrichtung
    let labelX = mid.x, labelY = mid.y;
    if (a.labelOffset) {
        labelX = mid.x + a.labelOffset.dx;
        labelY = mid.y + a.labelOffset.dy;
    } else if (midSeg) {
        // Automatischer Offset: horizontal → unten, vertikal → rechts
        const sdx = midSeg.end.x - midSeg.start.x;
        const sdy = midSeg.end.y - midSeg.start.y;
        const angle = Math.abs(Math.atan2(sdy, sdx));
        const offsetDist = 25 * this.sizeMultiplier;
        if (angle > Math.PI * 0.35 && angle < Math.PI * 0.65) {
            // Eher vertikal → Label nach rechts
            labelX = mid.x + offsetDist;
        } else {
            // Eher horizontal oder diagonal → Label nach unten
            labelY = mid.y + offsetDist;
        }
    }

    // Gestrichelte Verbindungslinie wenn Label verschoben wurde
    const boxH = 22 * this.scale * ls * this.sizeMultiplier;
    const boxW = tw + 12 * ls * this.sizeMultiplier;
    if (a.labelOffset && (Math.abs(a.labelOffset.dx) > 2 || Math.abs(a.labelOffset.dy) > 2)) {
        this.ctx.save();
        this.ctx.strokeStyle = lineColor;
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.4;
        this.ctx.setLineDash([4 * this.scale, 3 * this.scale]);
        this.ctx.beginPath();
        this.ctx.moveTo(mid.x * this.scale, mid.y * this.scale);
        this.ctx.lineTo(labelX * this.scale, labelY * this.scale);
        this.ctx.stroke();
        this.ctx.restore();
    }

    // Label-Box und Text zeichnen
    this.ctx.fillStyle = 'rgba(255,255,255,0.92)';
    this.ctx.strokeStyle = lineColor; this.ctx.lineWidth = 1.5;
    const boxYpos = labelY * this.scale - boxH / 2;
    const boxXpos = labelX * this.scale - tw / 2 - 6 * ls * this.sizeMultiplier;
    this.ctx.beginPath(); this.ctx.roundRect(boxXpos, boxYpos, boxW, boxH, 4 * this.scale); this.ctx.fill(); this.ctx.stroke();
    this.ctx.fillStyle = lineColor; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, labelX * this.scale, labelY * this.scale);

    // Speichere Label-Bounds für Hit-Testing (in unscaled coords)
    a._labelBounds = { x: labelX - (boxW / this.scale) / 2, y: labelY - (boxH / this.scale) / 2, w: boxW / this.scale, h: boxH / this.scale, midX: mid.x, midY: mid.y };

    // Resize-Handle am rechten Rand des Labels wenn selektiert
    if (sel) {
        const handleX = boxXpos + boxW;
        const handleY = boxYpos + boxH / 2;
        this.ctx.fillStyle = '#FFF';
        this.ctx.strokeStyle = lineColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.rect(handleX - 4, handleY - 4, 8, 8);
        this.ctx.fill();
        this.ctx.stroke();
        // Speichere Handle-Position für Hit-Testing
        a._labelResizeHandle = { x: (boxXpos + boxW) / this.scale, y: (boxYpos + boxH / 2) / this.scale, r: 18 };
    } else {
        a._labelResizeHandle = null;
    }
}
if (sel) a.points.forEach(p => { this.ctx.fillStyle = '#FFF'; this.ctx.strokeStyle = lineColor; this.ctx.lineWidth = 2; this.ctx.setLineDash([]); this.ctx.beginPath(); this.ctx.arc(p.x * this.scale, p.y * this.scale, 8, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke(); });
        } else if (tool.type === 'point' && a.point) {
const x = a.point.x * this.scale, y = a.point.y * this.scale;
const cs = a.customScale || 1;
const baseSize = a.customSize || tool.size || 14;
const sz = (sel ? baseSize + 4 : baseSize) * this.scale * (a.customSize ? 1 : this.sizeMultiplier) * cs;
const rot = a.rotation || 0;
this.ctx.fillStyle = tool.color; this.ctx.strokeStyle = '#FFF'; this.ctx.lineWidth = 3 * this.scale * this.sizeMultiplier;

// Apply rotation for rotatable shapes (□, ▬, ▯)
const needsRotation = (tool.symbol === '□' || tool.symbol === '▬' || tool.symbol === '▯') && rot !== 0;
if (needsRotation) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rot);
    this.ctx.translate(-x, -y);
}

if (tool.symbol === '○') { this.ctx.beginPath(); this.ctx.arc(x, y, sz / 2, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke(); }
else if (tool.symbol === '○_empty') {
    // Leerer Kreis (nur Rand, innen transparent)
    this.ctx.beginPath(); this.ctx.arc(x, y, sz / 2, 0, Math.PI * 2);
    this.ctx.strokeStyle = tool.color;
    this.ctx.lineWidth = 3 * this.scale * this.sizeMultiplier;
    this.ctx.stroke();
}
else if (tool.symbol === '▯') {
    // Hohes Rechteck für APL (vertikal)
    const w = sz * 0.7;
    const h = sz * 1.4;
    this.ctx.fillRect(x - w / 2, y - h / 2, w, h);
    this.ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}
else if (tool.symbol === '▬') {
    // Breites Rechteck für DAZK/APL
    const w = sz * 1.4;
    const h = sz * 0.7;
    this.ctx.fillRect(x - w / 2, y - h / 2, w, h);
    this.ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}
else if (tool.symbol === '□') { this.ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz); this.ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); }
else if (tool.symbol === '◆') {
    // Raute für Muffe
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - sz / 2);
    this.ctx.lineTo(x + sz / 2, y);
    this.ctx.lineTo(x, y + sz / 2);
    this.ctx.lineTo(x - sz / 2, y);
    this.ctx.closePath();
    this.ctx.fill(); this.ctx.stroke();
}
else if (tool.symbol === '⚠') {
    // Dreieck für Hindernis/Warnung
    this.ctx.beginPath();
    this.ctx.moveTo(x, y - sz / 2);
    this.ctx.lineTo(x + sz / 2, y + sz / 2);
    this.ctx.lineTo(x - sz / 2, y + sz / 2);
    this.ctx.closePath();
    this.ctx.fill(); this.ctx.stroke();
    // Ausrufezeichen
    this.ctx.fillStyle = '#FFF';
    this.ctx.font = `bold ${sz * 0.5}px sans-serif`;
    this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
    this.ctx.fillText('!', x, y + sz * 0.15);
}
else if (tool.symbol === '🛡') {
    // Schild für Brandschottung
    const w = sz * 0.8, h = sz;
    this.ctx.beginPath();
    this.ctx.moveTo(x - w / 2, y - h / 2);
    this.ctx.lineTo(x + w / 2, y - h / 2);
    this.ctx.lineTo(x + w / 2, y + h * 0.1);
    this.ctx.quadraticCurveTo(x + w / 2, y + h / 2, x, y + h / 2);
    this.ctx.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h * 0.1);
    this.ctx.closePath();
    this.ctx.fill(); this.ctx.stroke();
    // F für Feuer/Fire
    this.ctx.fillStyle = '#FFF';
    this.ctx.font = `bold ${sz * 0.4}px sans-serif`;
    this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
    this.ctx.fillText('F', x, y);
}
else { this.ctx.beginPath(); this.ctx.arc(x, y, sz / 2, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke(); this.ctx.strokeStyle = '#FFF'; this.ctx.beginPath(); this.ctx.moveTo(x - sz / 3, y); this.ctx.lineTo(x + sz / 3, y); this.ctx.moveTo(x, y - sz / 3); this.ctx.lineTo(x, y + sz / 3); this.ctx.stroke(); }

if (needsRotation) {
    this.ctx.restore();
}

// Draw scale handle when selected (like Text tool)
if (sel) {
    const handleX = x + sz / 2 + 14 * this.scale;
    const handleY = y;
    const hr = 10;
    this.ctx.fillStyle = '#FFF';
    this.ctx.strokeStyle = tool.color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath(); this.ctx.arc(handleX, handleY, hr, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
    this.ctx.strokeStyle = tool.color; this.ctx.lineWidth = 1.5;
    this.ctx.beginPath(); this.ctx.moveTo(handleX - 4, handleY); this.ctx.lineTo(handleX + 4, handleY); this.ctx.moveTo(handleX + 2, handleY - 3); this.ctx.lineTo(handleX + 4, handleY); this.ctx.lineTo(handleX + 2, handleY + 3); this.ctx.stroke();
    a._pointResizeHandle = { x: handleX / this.scale, y: handleY / this.scale, r: hr / this.scale + 12 };
    if (this.isRotatable(a)) {
        const rh = this.getRotationHandle(a);
        if (rh) {
            const rhx = rh.x * this.scale, rhy = rh.y * this.scale;
            this.ctx.save(); this.ctx.strokeStyle = tool.color; this.ctx.lineWidth = 1; this.ctx.globalAlpha = 0.5; this.ctx.setLineDash([3, 3]);
            this.ctx.beginPath(); this.ctx.moveTo(x, y); this.ctx.lineTo(rhx, rhy); this.ctx.stroke(); this.ctx.restore();
            this.ctx.fillStyle = '#FFF'; this.ctx.strokeStyle = tool.color; this.ctx.lineWidth = 2;
            this.ctx.beginPath(); this.ctx.arc(rhx, rhy, 7, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
            this.ctx.fillStyle = tool.color; this.ctx.font = `bold 10px sans-serif`; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.fillText('↻', rhx, rhy);
        }
    }
} else {
    a._pointResizeHandle = null;
}
        } else if (tool.type === 'arrow' && a.points && a.points.length >= 2) {
// Pfeil zeichnen
const p1 = a.points[0], p2 = a.points[a.points.length - 1];
const x1 = p1.x * this.scale, y1 = p1.y * this.scale;
const x2 = p2.x * this.scale, y2 = p2.y * this.scale;
const angle = Math.atan2(y2 - y1, x2 - x1);
const headLen = 20 * this.scale * this.sizeMultiplier;

this.ctx.strokeStyle = tool.color;
this.ctx.fillStyle = tool.color;
this.ctx.lineWidth = (tool.lineWidth + (sel ? 2 : 0)) * this.scale * this.sizeMultiplier;
this.ctx.lineCap = 'round';

// Linie
this.ctx.beginPath();
this.ctx.moveTo(x1, y1);
this.ctx.lineTo(x2, y2);
this.ctx.stroke();

// Pfeilspitze
this.ctx.beginPath();
this.ctx.moveTo(x2, y2);
this.ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
this.ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
this.ctx.closePath();
this.ctx.fill();

if (sel) {
    this.ctx.fillStyle = '#FFF'; this.ctx.strokeStyle = tool.color; this.ctx.lineWidth = 2;
    [p1, p2].forEach(p => { this.ctx.beginPath(); this.ctx.arc(p.x * this.scale, p.y * this.scale, 8, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke(); });
}
        } else if (tool.type === 'dimension' && a.points && a.points.length >= 2) {
// Maßkette zeichnen
const p1 = a.points[0], p2 = a.points[a.points.length - 1];
const x1 = p1.x * this.scale, y1 = p1.y * this.scale;
const x2 = p2.x * this.scale, y2 = p2.y * this.scale;
const tickLen = 10 * this.scale * this.sizeMultiplier;
const angle = Math.atan2(y2 - y1, x2 - x1);
const perpAngle = angle + Math.PI / 2;

this.ctx.strokeStyle = tool.color;
this.ctx.lineWidth = (tool.lineWidth + (sel ? 1 : 0)) * this.scale * this.sizeMultiplier;
this.ctx.lineCap = 'round';

// Hauptlinie
this.ctx.beginPath();
this.ctx.moveTo(x1, y1);
this.ctx.lineTo(x2, y2);
this.ctx.stroke();

// Endstriche
this.ctx.beginPath();
this.ctx.moveTo(x1 + tickLen * Math.cos(perpAngle), y1 + tickLen * Math.sin(perpAngle));
this.ctx.lineTo(x1 - tickLen * Math.cos(perpAngle), y1 - tickLen * Math.sin(perpAngle));
this.ctx.moveTo(x2 + tickLen * Math.cos(perpAngle), y2 + tickLen * Math.sin(perpAngle));
this.ctx.lineTo(x2 - tickLen * Math.cos(perpAngle), y2 - tickLen * Math.sin(perpAngle));
this.ctx.stroke();

// Maß-Text
const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
const label = a.text || '? m';
this.ctx.font = `bold ${12 * this.scale}px 'Roboto', sans-serif`;
const tw = this.ctx.measureText(label).width;
this.ctx.fillStyle = 'rgba(255,255,255,0.95)';
this.ctx.fillRect(midX - tw / 2 - 4, midY - 10 * this.scale, tw + 8, 20 * this.scale);
this.ctx.fillStyle = tool.color;
this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
this.ctx.fillText(label, midX, midY);

if (sel) {
    this.ctx.fillStyle = '#FFF'; this.ctx.strokeStyle = tool.color; this.ctx.lineWidth = 2;
    [p1, p2].forEach(p => { this.ctx.beginPath(); this.ctx.arc(p.x * this.scale, p.y * this.scale, 8, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke(); });
}
        } else if (tool.type === 'text' && a.point && a.text) {
const ts = a.textScale || 1;
const x = a.point.x * this.scale, y = a.point.y * this.scale;
const fontSize = 14 * this.scale * ts * this.sizeMultiplier;
this.ctx.font = `${fontSize}px sans-serif`; const tw = this.ctx.measureText(a.text).width, pad = 6 * this.scale * ts * this.sizeMultiplier, bh = 20 * this.scale * ts * this.sizeMultiplier;
this.ctx.fillStyle = sel ? '#FEF3C7' : '#FFFBEB'; this.ctx.strokeStyle = sel ? '#F59E0B' : '#FCD34D'; this.ctx.lineWidth = 1;
this.ctx.beginPath(); this.ctx.roundRect(x, y - bh / 2, tw + pad * 2, bh, 4); this.ctx.fill(); this.ctx.stroke();
this.ctx.fillStyle = '#1A1A2E'; this.ctx.textAlign = 'left'; this.ctx.textBaseline = 'middle'; this.ctx.fillText(a.text, x + pad, y);
// Resize handle when selected
if (sel) {
    const handleX = x + tw + pad * 2;
    const handleY = y;
    const hr = 10;
    this.ctx.fillStyle = '#FFF';
    this.ctx.strokeStyle = '#F59E0B';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath(); this.ctx.arc(handleX, handleY, hr, 0, Math.PI * 2); this.ctx.fill(); this.ctx.stroke();
    // Draw scale icon inside handle
    this.ctx.strokeStyle = '#F59E0B'; this.ctx.lineWidth = 1.5;
    this.ctx.beginPath(); this.ctx.moveTo(handleX - 4, handleY); this.ctx.lineTo(handleX + 4, handleY); this.ctx.moveTo(handleX + 2, handleY - 3); this.ctx.lineTo(handleX + 4, handleY); this.ctx.lineTo(handleX + 2, handleY + 3); this.ctx.stroke();
    // Store handle bounds for hit testing (in unscaled coords) - generous touch area
    a._textResizeHandle = { x: handleX / this.scale, y: handleY / this.scale, r: hr / this.scale + 12 };
} else {
    a._textResizeHandle = null;
}
        }
        this.ctx.restore();
    }

    closeFlyout() {
        const existing = document.querySelector('.tool-flyout');
        if (existing) existing.remove();
    }

    showFlyout(btn, content, title) {
        this.closeFlyout();
        const flyout = document.createElement('div');
        flyout.className = 'tool-flyout';

        const rect = btn.getBoundingClientRect();
        flyout.style.top = Math.min(rect.top, window.innerHeight - 300) + 'px';

        if (title) {
const titleEl = document.createElement('div');
titleEl.className = 'tool-flyout-title';
titleEl.textContent = title;
flyout.appendChild(titleEl);
        }

        flyout.appendChild(content);
        document.body.appendChild(flyout);

        // Close on outside click
        setTimeout(() => {
const closeHandler = (e) => {
    if (!flyout.contains(e.target) && !btn.contains(e.target)) {
        flyout.remove();
        document.removeEventListener('click', closeHandler);
    }
};
document.addEventListener('click', closeHandler);
        }, 10);
    }

    renderToolbar() {
        const tb = document.getElementById('editorToolbar');
        tb.innerHTML = '';

        // Tool-Icons mit Flyouts
        const toolGroups = [
{ id: 'SELECT', icon: '↖', name: 'Auswahl' },
{ id: 'LINES', icon: '━', name: 'Linien', children: ['TRASSE', 'BESTANDSTRASSE', 'KABEL', 'LF_KANAL', 'INSTALLATIONSROHR', 'PFEIL', 'MASSKETTE'] },
{ id: 'POINTS', icon: '●', name: 'Punkte', children: ['MUFFE', 'BOHRUNG_HAUSEINFUEHRUNG', 'BOHRUNG_WANDDURCHFUEHRUNG', 'BRANDSCHOTTUNG', 'HINDERNIS'] },
{ id: 'SCHACHT_GROUP', icon: '□', name: 'Schächte', children: ['SCHACHT_AZK_NEU', 'SCHACHT_AZK_BESTAND', 'SCHACHT_DAZK_NEU', 'SCHACHT_DAZK_BESTAND', 'SCHACHT_APL_NEU', 'SCHACHT_APL_BESTAND', 'SCHACHT_PATCHFELD_NEU', 'SCHACHT_PATCHFELD_BESTAND'] },
{ id: 'TEXT_CALL_OUT', icon: 'T', name: 'Text' },
{ id: 'SETTINGS', icon: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', name: 'Einstellungen', isSettings: true },
        ];

        const isToolInGroup = (toolId, groupChildren) => groupChildren && groupChildren.includes(toolId);
        const getActiveGroupForTool = () => {
for (const g of toolGroups) {
    if (g.children && g.children.includes(this.selectedTool)) return g.id;
}
return null;
        };

        toolGroups.forEach(group => {
const btn = document.createElement('button');
const isActive = this.selectedTool === group.id ||
    (group.children && group.children.includes(this.selectedTool));
btn.className = 'tool-btn' + (isActive ? ' active' : '');

// Zeige Farbe des aktiven Tools wenn in Gruppe
if (group.children && group.children.includes(this.selectedTool)) {
    const activeTool = TOOLS[this.selectedTool];
    if (activeTool?.color) {
        btn.innerHTML = `<span class="tool-color" style="background:${activeTool.color}"></span>`;
    } else {
        btn.innerHTML = group.icon;
    }
} else {
    btn.innerHTML = group.icon;
}

btn.onclick = (e) => {
    e.stopPropagation();

    if (group.isSettings) {
        // Settings Flyout
        const content = document.createElement('div');
        content.className = 'toolbar-settings';
        content.innerHTML = `
<div class="toolbar-setting-row">
    <label>Oberfläche</label>
    <select id="flyoutSurface">
        ${SURFACES.map(s => `<option value="${s.value}" ${this.currentSurface === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
    </select>
</div>
<div class="toolbar-setting-row">
    <label>DN</label>
    <select id="flyoutDN">
        ${DNS.map(d => `<option value="${d.value}" ${this.currentDN === d.value ? 'selected' : ''}>${d.label}</option>`).join('')}
    </select>
</div>
<div class="toolbar-setting-row">
    <label>Größe: ${this.sizeMultiplier}x</label>
    <input type="range" id="flyoutSize" min="0.5" max="4" step="0.25" value="${this.sizeMultiplier}">
</div>
        `;
        this.showFlyout(btn, content, 'Einstellungen');

        content.querySelector('#flyoutSurface').onchange = (e) => { this.currentSurface = e.target.value; };
        content.querySelector('#flyoutDN').onchange = (e) => { this.currentDN = e.target.value; };
        content.querySelector('#flyoutSize').oninput = (e) => {
            this.sizeMultiplier = parseFloat(e.target.value);
            e.target.previousElementSibling.textContent = `Größe: ${this.sizeMultiplier}x`;
            this.render();
        };
    } else if (group.children) {
        // Group Flyout
        const content = document.createElement('div');
        group.children.forEach(toolId => {
            const tool = TOOLS[toolId];
            if (!tool) return;
            const item = document.createElement('div');
            item.className = 'tool-flyout-item' + (this.selectedTool === toolId ? ' active' : '');
            item.innerHTML = tool.color
                ? `<span class="flyout-color" style="background:${tool.color}"></span><span>${tool.name}</span>`
                : `<span class="flyout-icon">${tool.icon || '•'}</span><span>${tool.name}</span>`;
            item.onclick = () => {
                this.selectedTool = toolId;
                this.selectedAnn = null;
                this.closeFlyout();
                this.renderToolbar();
                this.render();
            };
            content.appendChild(item);
        });
        this.showFlyout(btn, content, group.name);
    } else {
        // Direct tool selection
        this.selectedTool = group.id;
        this.selectedAnn = null;
        this.closeFlyout();
        this.renderToolbar();
        this.render();
    }
};

tb.appendChild(btn);
        });

        // Separator
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--border);margin:4px 0;';
        tb.appendChild(sep);

        // Delete Button (wenn etwas ausgewählt)
        if (this.selectedAnn) {
const del = document.createElement('button');
del.className = 'tool-btn';
del.style.color = '#DC2626';
del.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
del.onclick = () => this.deleteSelected();
tb.appendChild(del);
        }

        // Reset All Button (Alle Markierungen zurücksetzen)
        if (this.annotations.length > 0) {
const resetBtn = document.createElement('button');
resetBtn.className = 'tool-btn';
resetBtn.title = 'Alle Markierungen zurücksetzen';
resetBtn.style.color = '#DC2626';
resetBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg><span style="font-size:9px;display:block;line-height:1;margin-top:1px">Alle</span>';
resetBtn.onclick = () => this.resetAllAnnotations();
tb.appendChild(resetBtn);
        }

        this.updateTrasseProps();
    }
    ensureTrasseMeta(ann) {
        if (!ann) return;
        ann.meta = ann.meta || {};
        if (!ann.meta.surface) ann.meta.surface = this.currentSurface;
        if (!ann.meta.dn) ann.meta.dn = this.currentDN;
    }
    updateTrasseProps() {
        const panel = document.getElementById('trasseProps');
        if (!panel) return;
        const ann = this.selectedAnn;
        const tool = ann && TOOLS[ann.tool];
        if (!ann || !tool || tool.id !== 'TRASSE') { panel.style.display = 'none'; return; }
        this.ensureTrasseMeta(ann);
        panel.style.display = 'block';
        const surfOptions = SURFACES.map(s => `<option value="${s.value}" ${ann.meta.surface === s.value ? 'selected' : ''}>${s.label}</option>`).join('');
        const dnOptions = DNS.map(d => `<option value="${d.value}" ${ann.meta.dn === d.value ? 'selected' : ''}>${d.label}</option>`).join('');
        panel.innerHTML = `
<h4><span>Trasse Eigenschaften</span><button class="close-btn" onclick="document.getElementById('trasseProps').style.display='none'" title="Schließen">✕</button></h4>
<div class="row">
    <label>Oberfläche</label>
    <select data-prop="surface">${surfOptions}</select>
    <label>DN</label>
    <select data-prop="dn">${dnOptions}</select>
</div>
`;
        panel.querySelectorAll('select').forEach(sel => {
sel.onchange = () => {
    const prop = sel.dataset.prop;
    ann.meta[prop] = sel.value;
    this.render();
    this.renderLayers();
};
        });
    }
    renderLegend() {
        const list = document.getElementById('legendList'); if (!list) return;
        list.innerHTML = '';
        Object.values(TOOLS).filter(t => t.type !== 'utility').forEach(t => {
const item = document.createElement('div'); item.className = 'legend-item';
let symbolHtml;
if (t.type === 'line' || t.type === 'arrow' || t.type === 'dimension') {
    symbolHtml = `<span style="width:20px;height:4px;background:${t.color};border-radius:2px"></span>`;
} else if (t.symbol === '▯') {
    // Hohes Rechteck für APL
    symbolHtml = `<span style="width:10px;height:18px;background:${t.color};border-radius:1px"></span>`;
} else if (t.symbol === '▬') {
    // Breites Rechteck für DAZK
    symbolHtml = `<span style="width:18px;height:10px;background:${t.color};border-radius:1px"></span>`;
} else if (t.symbol === '□') {
    symbolHtml = `<span style="width:14px;height:14px;background:${t.color};border-radius:2px"></span>`;
} else if (t.symbol === '◆') {
    symbolHtml = `<span style="width:14px;height:14px;background:${t.color};transform:rotate(45deg);border-radius:2px"></span>`;
} else if (t.symbol === '○_empty') {
    symbolHtml = `<span style="width:14px;height:14px;border:2px solid ${t.color};border-radius:50%;box-sizing:border-box"></span>`;
} else if (t.symbol === '⚠') {
    symbolHtml = `<span style="color:${t.color};font-size:16px">⚠</span>`;
} else if (t.symbol === '🛡') {
    symbolHtml = `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:18px;background:${t.color};border-radius:2px 2px 8px 8px;color:#fff;font-size:9px;font-weight:bold">F</span>`;
} else {
    symbolHtml = `<span style="color:${t.color}">${t.symbol || '●'}</span>`;
}
item.innerHTML = `${symbolHtml}<span>${t.name}</span>`;
list.appendChild(item);
        });
    }
    renderLayers() {
        const list = document.getElementById('layerList'); list.innerHTML = '';
        if (!this.annotations.length) { list.innerHTML = '<p class="text-muted" style="font-size:12px">Keine Elemente</p>'; return; }
        [...this.annotations].reverse().forEach(a => {
const t = TOOLS[a.tool]; if (!t) return;
const item = document.createElement('div'); item.className = 'layer-item' + (a === this.selectedAnn ? ' selected' : '');
item.style.position = 'relative';
let lbl = t.name; if (a.computed?.lengthMeters) lbl += ` (${a.computed.lengthMeters.toFixed(1)}m)`; if (a.text) lbl = a.text.substring(0, 20);
const displaySymbol = t.symbol === '○_empty' ? '○' : (t.symbol || '━');
item.innerHTML = `<span style="color:${t.color}">${displaySymbol}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;cursor:pointer">${lbl}</span><button style="width:22px;height:22px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;border-radius:4px;flex-shrink:0" title="Löschen">✕</button>`;
// Click on label area to select
item.querySelector('span:nth-child(2)').onclick = () => { this.selectedAnn = a; this.selectedTool = 'SELECT'; if (a.tool === 'TRASSE') this.ensureTrasseMeta(a); this.renderToolbar(); this.renderLayers(); this.render(); };
item.querySelector('span:first-child').onclick = () => { this.selectedAnn = a; this.selectedTool = 'SELECT'; if (a.tool === 'TRASSE') this.ensureTrasseMeta(a); this.renderToolbar(); this.renderLayers(); this.render(); };
// Delete button
item.querySelector('button').onclick = (e) => {
    e.stopPropagation();
    this.saveState();
    this.annotations = this.annotations.filter(x => x.id !== a.id);
    if (this.selectedAnn === a) this.selectedAnn = null;
    this.renderToolbar(); this.renderLayers(); this.render();
};
list.appendChild(item);
        });
    }
    getAnnotations() { return this.annotations; }

    zoomIn() {
        this.scale = Math.min(this.scale * 1.25, 3);
        this.applyZoom();
    }

    zoomOut() {
        this.scale = Math.max(this.scale * 0.8, 0.2);
        this.applyZoom();
    }

    zoomReset() {
        const toolbarReserve = 150;
        const headerReserve = 120;
        const margin = 32;
        const maxW = Math.max(200, window.innerWidth - margin);
        const maxH = Math.max(200, window.innerHeight - (toolbarReserve + headerReserve));
        this.scale = Math.min(maxW / this.image.width, maxH / this.image.height, 1);
        this.applyZoom();
    }

    applyZoom() {
        this.canvas.width = this.image.width * this.scale;
        this.canvas.height = this.image.height * this.scale;
        this.render();
    }

    async renderToImage() {
        // Begrenze Canvas-Auflösung für bessere Annotation-Sichtbarkeit und kleinere Dateigröße
        const maxDim = 2000;
        const ratio = Math.min(maxDim / this.image.width, maxDim / this.image.height, 1);
        const c = document.createElement('canvas');
        c.width = Math.round(this.image.width * ratio);
        c.height = Math.round(this.image.height * ratio);
        const ctx = c.getContext('2d');
        ctx.drawImage(this.image, 0, 0, c.width, c.height);
        // Speichere Editor-Zustand und setze PDF-Rendering-Werte
        const os = this.scale, oc = this.ctx, om = this.sizeMultiplier;
        this.scale = ratio;
        // Annotationen proportional vergrößern damit sie im PDF sichtbar bleiben
        this.sizeMultiplier = Math.max(om, 1 / ratio);
        this.ctx = ctx;
        this.annotations.forEach(a => this.drawAnn(a, false));
        this.scale = os; this.ctx = oc; this.sizeMultiplier = om;
        return c.toDataURL('image/jpeg', 0.9);
    }
}

