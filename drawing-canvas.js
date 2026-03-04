/**
 * Drawing Canvas Module
 * Provides hand-drawing capabilities with smooth stroke rendering
 * Uses quadratic curve interpolation for natural-looking strokes
 */

const DrawingCanvas = (function() {
    'use strict';

    // Configuration
    const CONFIG = {
        minDistance: 2,           // Minimum distance between points
        smoothingFactor: 0.3,     // How much to smooth (0-1)
        simplifyTolerance: 1.5,   // Tolerance for point reduction
        lineWidth: 3,             // Base line width
        lineWidthVariation: 1,    // How much width varies with speed
        minLineWidth: 1.5,        // Minimum line width
        maxLineWidth: 5,          // Maximum line width
        tension: 0.3             // Curve tension for quadratic bezier
    };

    let ctx = null;
    let isActive = false;
    let isDrawing = false;
    let canvas = null;
    let noteContent = null;
    let drawBtn = null;
    let clearBtn = null;

    // Stroke data
    let currentStroke = [];
    let strokes = [];
    let lastPoint = null;
    let lastTime = 0;

    function init() {
        canvas = document.getElementById('drawingCanvas');
        noteContent = document.getElementById('noteContent');
        drawBtn = document.getElementById('drawModeBtn');
        clearBtn = document.getElementById('clearDrawingBtn');

        if (!canvas || !drawBtn) return;

        ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        setupEventListeners();
        setupResizeObserver();
    }

    function setupEventListeners() {
        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events with better handling
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);
        canvas.addEventListener('touchcancel', stopDrawing);

        // Toggle button
        drawBtn.addEventListener('click', toggle);

        // Clear button
        if (clearBtn) {
            clearBtn.addEventListener('click', clearCanvas);
        }
    }

    function setupResizeObserver() {
        const observer = new MutationObserver(() => {
            if (!canvas.classList.contains('hidden')) {
                resizeCanvas();
                redrawAllStrokes();
            }
        });

        const editorView = document.getElementById('editorView');
        if (editorView) {
            observer.observe(editorView, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function resizeCanvas() {
        if (!canvas) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height - 60;
    }

    // Get position from mouse event
    function getPosition(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            time: Date.now()
        };
    }

    // Calculate distance between two points
    function distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Calculate speed between two points
    function getSpeed(p1, p2) {
        const dist = distance(p1, p2);
        const time = p2.time - p1.time || 1;
        return dist / time;
    }

    // Get line width based on speed (slower = thicker)
    function getLineWidth(speed) {
        const speedFactor = Math.max(0, Math.min(1, 1 - speed * 0.1));
        const width = CONFIG.lineWidth + (speedFactor * CONFIG.lineWidthVariation);
        return Math.max(CONFIG.minLineWidth, Math.min(CONFIG.maxLineWidth, width));
    }

    function startDrawing(e) {
        if (!isActive) return;
        
        e.preventDefault();
        isDrawing = true;
        currentStroke = [];
        
        const pos = getPosition(e);
        lastPoint = pos;
        lastTime = pos.time;
        
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!isDrawing || !isActive) return;
        
        e.preventDefault();
        
        const pos = getPosition(e);
        
        // Only add point if it's far enough from last point
        if (lastPoint && distance(lastPoint, pos) < CONFIG.minDistance) {
            return;
        }

        const speed = getSpeed(lastPoint, pos);
        const lineWidth = getLineWidth(speed);

        // Add point to current stroke
        currentStroke.push({
            x: pos.x,
            y: pos.y,
            time: pos.time,
            width: lineWidth
        });

        // Draw smooth curve using quadratic bezier
        if (currentStroke.length >= 2) {
            const p1 = currentStroke[currentStroke.length - 2];
            const p2 = currentStroke[currentStroke.length - 1];
            
            // Use midpoints for smoother curves
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = '#000';
            ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(midX, midY);
        }

        lastPoint = pos;
    }

    function stopDrawing() {
        if (!isDrawing) return;
        
        isDrawing = false;

        // Draw final segment if there's enough data
        if (currentStroke.length >= 2) {
            const lastPt = currentStroke[currentStroke.length - 1];
            ctx.lineTo(lastPt.x, lastPt.y);
            ctx.stroke();
        }

        // Save stroke if it has points
        if (currentStroke.length > 1) {
            // Simplify the stroke to reduce data
            const simplified = simplifyStroke(currentStroke);
            strokes.push(simplified);
            saveDrawing();
        }

        currentStroke = [];
        lastPoint = null;
    }

    // Touch handlers with multi-touch support
    function handleTouchStart(e) {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            startDrawing(mouseEvent);
        }
    }

    function handleTouchMove(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            draw(mouseEvent);
        }
    }

    function handleTouchEnd(e) {
        stopDrawing();
    }

    // Simplify stroke using Ramer-Douglas-Peucker algorithm
    function simplifyStroke(points) {
        if (points.length <= 2) return points;

        // First pass: reduce points using perpendicular distance
        const simplified = [points[0]];
        
        for (let i = 1; i < points.length - 1; i++) {
            const prev = simplified[simplified.length - 1];
            const curr = points[i];
            const next = points[i + 1];
            
            // Calculate perpendicular distance from point to line
            const dist = perpendicularDistance(curr, prev, next);
            
            if (dist > CONFIG.simplifyTolerance) {
                simplified.push(curr);
            }
        }
        
        simplified.push(points[points.length - 1]);
        
        // Second pass: merge very close points
        const merged = [simplified[0]];
        for (let i = 1; i < simplified.length; i++) {
            if (distance(merged[merged.length - 1], simplified[i]) > CONFIG.minDistance) {
                merged.push(simplified[i]);
            }
        }
        
        return merged;
    }

    // Calculate perpendicular distance from point to line
    function perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        
        if (dx === 0 && dy === 0) {
            return distance(point, lineStart);
        }
        
        const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
        
        if (t < 0) return distance(point, lineStart);
        if (t > 1) return distance(point, lineEnd);
        
        return distance(point, {
            x: lineStart.x + t * dx,
            y: lineStart.y + t * dy
        });
    }

    // Redraw all strokes (used after resize)
    function redrawAllStrokes() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        strokes.forEach(stroke => {
            drawStroke(stroke);
        });
    }

    // Draw a single stroke with smooth curves
    function drawStroke(stroke) {
        if (stroke.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);

        if (stroke.length === 2) {
            // Simple line for 2 points
            ctx.lineWidth = stroke[1].width || CONFIG.lineWidth;
            ctx.strokeStyle = '#000';
            ctx.lineTo(stroke[1].x, stroke[1].y);
            ctx.stroke();
            return;
        }

        // Use quadratic curves for smooth rendering
        for (let i = 1; i < stroke.length - 1; i++) {
            const p0 = stroke[i - 1];
            const p1 = stroke[i];
            const p2 = stroke[i + 1];

            // Calculate control point
            const cpx = p1.x;
            const cpy = p1.y;
            
            // Calculate endpoint (midpoint between this and next)
            const endX = (p1.x + p2.x) / 2;
            const endY = (p1.y + p2.y) / 2;

            // Use the width of the next point
            ctx.lineWidth = p2.width || CONFIG.lineWidth;
            ctx.strokeStyle = '#000';

            ctx.quadraticCurveTo(cpx, cpy, endX, endY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(endX, endY);
        }

        // Draw last segment
        const lastPt = stroke[stroke.length - 1];
        ctx.lineTo(lastPt.x, lastPt.y);
        ctx.stroke();
    }

    function toggle() {
        isActive = !isActive;

        if (isActive) {
            canvas.classList.remove('hidden');
            noteContent.classList.add('hidden');
            if (clearBtn) clearBtn.classList.remove('hidden');
            resizeCanvas();
            redrawAllStrokes();

            // Close other tools
            if (typeof MathKeyboard !== 'undefined') {
                MathKeyboard.hide();
            }
            if (typeof GraphTool !== 'undefined' && GraphTool.isActive()) {
                GraphTool.toggle();
            }
        } else {
            canvas.classList.add('hidden');
            noteContent.classList.remove('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
        }
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        strokes = [];
        document.dispatchEvent(new CustomEvent('drawingCleared'));
    }

    function saveDrawing() {
        if (strokes.length === 0) {
            window.currentDrawingData = null;
            return;
        }

        // Flatten all strokes to points
        const allPoints = [];
        strokes.forEach(stroke => {
            stroke.forEach(pt => {
                allPoints.push(`${pt.x.toFixed(1)},${pt.y.toFixed(1)}:${pt.width?.toFixed(1) || CONFIG.lineWidth}`);
            });
            allPoints.push(';'); // Stroke separator
        });

        window.currentDrawingData = {
            width: canvas.width,
            height: canvas.height,
            strokes: strokes
        };
    }

    function loadDrawing(data) {
        if (!data || !ctx) return;

        canvas.width = data.width || canvas.width;
        canvas.height = data.height || canvas.height;

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        strokes = data.strokes || [];
        redrawAllStrokes();
    }

    function getDrawingData() {
        return window.currentDrawingData;
    }

    function setDrawingData(data) {
        if (data && data.strokes) {
            strokes = data.strokes;
            if (isActive) {
                loadDrawing(data);
            }
        }
    }

    function isActiveState() {
        return isActive;
    }

    // Public API
    return {
        init,
        toggle,
        clear: clearCanvas,
        getData: getDrawingData,
        setData: setDrawingData,
        isActive: isActiveState
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => DrawingCanvas.init());
