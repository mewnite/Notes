/**
 * Graph Tool Module
 * Provides interactive function plotting capabilities
 */

const GraphTool = (function() {
    'use strict';

    // Preset functions
    const PRESETS = [
        { label: 'x', func: 'x' },
        { label: 'x²', func: 'x^2' },
        { label: 'x³', func: 'x^3' },
        { label: '√x', func: 'sqrt(x)' },
        { label: 'sin(x)', func: 'sin(x)' },
        { label: 'cos(x)', func: 'cos(x)' },
        { label: 'tan(x)', func: 'tan(x)' },
        { label: '1/x', func: '1/x' },
        { label: '|x|', func: 'abs(x)' },
        { label: 'log(x)', func: 'log(x)' },
        { label: 'eˣ', func: 'exp(x)' }
    ];

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

    let isActive = false;
    let modal = null;
    let graphCanvas = null;
    let graphCtx = null;
    let graphs = [];
    let functionInput = null;

    function init() {
        const graphBtn = document.getElementById('graphModeBtn');
        if (!graphBtn) {
            // Create button if not exists
            createGraphButton();
        }
        
        createModal();
        setupEventListeners();
    }

    function createGraphButton() {
        const toolbar = document.querySelector('.editor-toolbar');
        if (!toolbar) return;

        const btn = document.createElement('button');
        btn.className = 'toolbar-btn';
        btn.id = 'graphModeBtn';
        btn.title = 'Graficar funciones';
        btn.innerHTML = '📈';
        toolbar.appendChild(btn);
    }

    function createModal() {
        modal = document.createElement('div');
        modal.id = 'graphModal';
        modal.className = 'graph-modal hidden';

        let presetsHtml = PRESETS.map(p => 
            `<button class="graph-preset" data-func="${p.func}">${p.label}</button>`
        ).join('');

        modal.innerHTML = `
            <div class="graph-modal-content">
                <div class="graph-modal-header">
                    <h3>Graficador de Funciones</h3>
                    <button class="graph-modal-close" aria-label="Cerrar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="graph-modal-body">
                    <div class="graph-controls">
                        <div class="graph-input-group">
                            <label for="graphFunction">Función f(x) =</label>
                            <input type="text" id="graphFunction" placeholder="Ej: x^2, sin(x), 2*x+1">
                        </div>
                        <div class="graph-presets">
                            <span class="graph-preset-label">Funciones rápidas:</span>
                            ${presetsHtml}
                        </div>
                    </div>
                    <div class="graph-canvas-container">
                        <canvas id="graphCanvas" width="600" height="400"></canvas>
                        <div class="graph-coords" id="graphCoords">
                            <span>x: 0.00</span>
                            <span>y: 0.00</span>
                        </div>
                    </div>
                    <div class="graph-options">
                        <div class="graph-option">
                            <label for="graphXMin">X mín:</label>
                            <input type="number" id="graphXMin" value="-10" step="1">
                        </div>
                        <div class="graph-option">
                            <label for="graphXMax">X máx:</label>
                            <input type="number" id="graphXMax" value="10" step="1">
                        </div>
                        <div class="graph-option">
                            <label for="graphYMin">Y mín:</label>
                            <input type="number" id="graphYMin" value="-10" step="1">
                        </div>
                        <div class="graph-option">
                            <label for="graphYMax">Y máx:</label>
                            <input type="number" id="graphYMax" value="10" step="1">
                        </div>
                        <button class="graph-btn" id="graphPlotBtn">Graficar</button>
                        <button class="graph-btn graph-btn-secondary" id="graphClearBtn">Limpiar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        graphCanvas = document.getElementById('graphCanvas');
        graphCtx = graphCanvas.getContext('2d');
        functionInput = document.getElementById('graphFunction');
    }

    function setupEventListeners() {
        const graphBtn = document.getElementById('graphModeBtn');
        const closeBtn = modal.querySelector('.graph-modal-close');
        const plotBtn = document.getElementById('graphPlotBtn');
        const clearBtn = document.getElementById('graphClearBtn');

        // Toggle modal
        if (graphBtn) {
            graphBtn.addEventListener('click', toggle);
        }

        // Close button
        closeBtn.addEventListener('click', hide);

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hide();
        });

        // Preset buttons
        modal.querySelectorAll('.graph-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                functionInput.value = btn.dataset.func;
                plotGraph();
            });
        });

        // Plot button
        plotBtn.addEventListener('click', plotGraph);

        // Clear button
        clearBtn.addEventListener('click', () => {
            graphs = [];
            drawGraph();
        });

        // Mouse move for coordinates
        graphCanvas.addEventListener('mousemove', updateCoords);

        // Window resize
        window.addEventListener('resize', () => {
            if (!modal.classList.contains('hidden')) {
                drawGraph();
            }
        });
    }

    function updateCoords(e) {
        const rect = graphCanvas.getBoundingClientRect();
        const xMin = parseFloat(document.getElementById('graphXMin').value);
        const xMax = parseFloat(document.getElementById('graphXMax').value);
        const yMin = parseFloat(document.getElementById('graphYMin').value);
        const yMax = parseFloat(document.getElementById('graphYMax').value);
        
        const x = xMin + (e.clientX - rect.left) / rect.width * (xMax - xMin);
        const y = yMax - (e.clientY - rect.top) / rect.height * (yMax - yMin);
        
        const coords = document.getElementById('graphCoords');
        coords.innerHTML = `<span>x: ${x.toFixed(2)}</span><span>y: ${y.toFixed(2)}</span>`;
    }

    function toggle() {
        isActive = !isActive;
        
        if (isActive) {
            modal.classList.remove('hidden');
            
            // Close other tools
            if (typeof MathKeyboard !== 'undefined') {
                MathKeyboard.hide();
            }
            if (typeof DrawingCanvas !== 'undefined' && DrawingCanvas.isActive()) {
                DrawingCanvas.toggle();
            }
            
            drawGraph();
        } else {
            modal.classList.add('hidden');
        }
    }

    function hide() {
        isActive = false;
        modal.classList.add('hidden');
    }

    function show() {
        isActive = true;
        modal.classList.remove('hidden');
        drawGraph();
    }

    function isActiveState() {
        return isActive;
    }

    function plotGraph() {
        const funcStr = functionInput.value.trim();
        if (!funcStr) return;

        try {
            const func = parseFunction(funcStr);
            graphs.push({ func: func, color: COLORS[graphs.length % COLORS.length] });
            drawGraph();
        } catch (err) {
            alert('Error en la función: ' + err.message);
        }
    }

    function parseFunction(str) {
        let parsed = str.toLowerCase()
            .replace(/\^/g, '**')
            .replace(/sin/g, 'Math.sin')
            .replace(/cos/g, 'Math.cos')
            .replace(/tan/g, 'Math.tan')
            .replace(/sqrt/g, 'Math.sqrt')
            .replace(/abs/g, 'Math.abs')
            .replace(/log/g, 'Math.log')
            .replace(/exp/g, 'Math.exp')
            .replace(/pi/g, 'Math.PI')
            .replace(/e(?![xp])/g, 'Math.E')
            .replace(/ln/g, 'Math.log');
        
        return function(x) {
            try {
                return new Function('x', 'return ' + parsed)(x);
            } catch (e) {
                return NaN;
            }
        };
    }

    function drawGraph() {
        if (!graphCtx) return;

        const width = graphCanvas.width;
        const height = graphCanvas.height;
        const xMin = parseFloat(document.getElementById('graphXMin').value);
        const xMax = parseFloat(document.getElementById('graphXMax').value);
        const yMin = parseFloat(document.getElementById('graphYMin').value);
        const yMax = parseFloat(document.getElementById('graphYMax').value);

        // Clear canvas
        graphCtx.fillStyle = '#ffffff';
        graphCtx.fillRect(0, 0, width, height);

        // Draw grid
        graphCtx.strokeStyle = '#e5e7eb';
        graphCtx.lineWidth = 1;

        // Grid lines
        for (let x = Math.ceil(xMin); x <= xMax; x++) {
            const px = (x - xMin) / (xMax - xMin) * width;
            graphCtx.beginPath();
            graphCtx.moveTo(px, 0);
            graphCtx.lineTo(px, height);
            graphCtx.stroke();
        }

        for (let y = Math.ceil(yMin); y <= yMax; y++) {
            const py = height - (y - yMin) / (yMax - yMin) * height;
            graphCtx.beginPath();
            graphCtx.moveTo(0, py);
            graphCtx.lineTo(width, py);
            graphCtx.stroke();
        }

        // Draw axes
        graphCtx.strokeStyle = '#374151';
        graphCtx.lineWidth = 2;

        // X axis
        if (yMin <= 0 && yMax >= 0) {
            const y0 = height - (0 - yMin) / (yMax - yMin) * height;
            graphCtx.beginPath();
            graphCtx.moveTo(0, y0);
            graphCtx.lineTo(width, y0);
            graphCtx.stroke();
        }

        // Y axis
        if (xMin <= 0 && xMax >= 0) {
            const x0 = (0 - xMin) / (xMax - xMin) * width;
            graphCtx.beginPath();
            graphCtx.moveTo(x0, 0);
            graphCtx.lineTo(x0, height);
            graphCtx.stroke();
        }

        // Draw functions
        graphs.forEach(graph => {
            graphCtx.strokeStyle = graph.color;
            graphCtx.lineWidth = 2;
            graphCtx.beginPath();

            let started = false;
            for (let px = 0; px < width; px++) {
                const x = xMin + px / width * (xMax - xMin);
                const y = graph.func(x);
                
                if (!isNaN(y) && isFinite(y)) {
                    const py = height - (y - yMin) / (yMax - yMin) * height;
                    
                    if (py >= -100 && py <= height + 100) {
                        if (!started) {
                            graphCtx.moveTo(px, py);
                            started = true;
                        } else {
                            graphCtx.lineTo(px, py);
                        }
                    } else {
                        started = false;
                    }
                } else {
                    started = false;
                }
            }
            graphCtx.stroke();
        });

        // Draw axis labels
        graphCtx.fillStyle = '#6b7280';
        graphCtx.font = '12px DM Sans';
        
        for (let x = Math.ceil(xMin); x <= xMax; x++) {
            if (x !== 0) {
                const px = (x - xMin) / (xMax - xMin) * width;
                graphCtx.fillText(x.toString(), px - 5, height - 5);
            }
        }

        for (let y = Math.ceil(yMin); y <= yMax; y++) {
            if (y !== 0) {
                const py = height - (y - yMin) / (yMax - yMin) * height;
                graphCtx.fillText(y.toString(), 5, py + 4);
            }
        }
    }

    // Public API
    return {
        init,
        toggle,
        hide,
        show,
        isActive: isActiveState,
        plot: plotGraph
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => GraphTool.init());
