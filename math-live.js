/**
 * Live Math Renderer - Using KaTeX for beautiful visual rendering
 * Converts mathematical notation to LaTeX rendered in real-time
 */

const MathLiveRenderer = (function() {
    'use strict';

    let previewContainer = null;
    let textarea = null;
    let renderTimeout = null;
    let isEnabled = false;

    // KaTeX auto-render extensions to detect math in text
    const renderOptions = {
        throwOnError: false,
        displayMode: false
    };

    function init() {
        textarea = document.getElementById('noteContent');
        if (!textarea) return;

        createPreviewContainer();
        setupEventListeners();
    }

    function createPreviewContainer() {
        previewContainer = document.getElementById('mathPreview');
        if (previewContainer) return;

        previewContainer = document.createElement('div');
        previewContainer.id = 'mathPreview';
        previewContainer.className = 'math-preview';

        const contentArea = textarea.closest('.content-area');
        if (contentArea) {
            contentArea.appendChild(previewContainer);
        }
    }

    function setupEventListeners() {
        if (!textarea) return;

        textarea.addEventListener('input', handleInput);
        textarea.addEventListener('keyup', handleInput);
    }

    function handleInput() {
        if (!isEnabled) return;

        if (renderTimeout) {
            clearTimeout(renderTimeout);
        }

        renderTimeout = setTimeout(() => {
            renderMath();
        }, 400);
    }

    function renderMath() {
        if (!previewContainer || !textarea) return;

        const text = textarea.value;

        if (!text.trim()) {
            previewContainer.innerHTML = '';
            previewContainer.classList.remove('visible');
            return;
        }

        // Extract math expressions from text and render them
        const html = processMathExpressions(text);
        
        if (!html) {
            previewContainer.classList.remove('visible');
            return;
        }

        previewContainer.innerHTML = html;
        previewContainer.classList.add('visible');
    }

    function processMathExpressions(text) {
        const lines = text.split('\n');
        let hasMath = false;
        let resultHtml = '';

        lines.forEach(line => {
            let processedLine = line;

            // Fix keyboard-style \frac without braces: \frac24 -> \frac{2}{4}
            processedLine = processedLine.replace(/\\frac(?!\s*\{)\s*([A-Za-z0-9()]+)\s*([A-Za-z0-9()]+)/g, (match, a, b) => {
                hasMath = true;
                try {
                    return `<span class="math-inline">${katex.renderToString(`\\\\frac{${a}}{${b}}`, renderOptions)}</span>`;
                } catch (e) {
                    return match;
                }
            });

            // Replace fractions: a/b -> \frac{a}{b}
            processedLine = processedLine.replace(/(\d+)\/(\d+)/g, (match, num, den) => {
                hasMath = true;
                try {
                    return `<span class="math-inline">${katex.renderToString(`\\\\frac{${num}}{${den}}`, renderOptions)}</span>`;
                } catch(e) {
                    return match;
                }
            });

            // Replace powers: x^2 -> x^{2} and 2^2 -> 2^{2}
            processedLine = processedLine.replace(/([A-Za-z0-9])\^(\d+)/g, (match, base, exp) => {
                hasMath = true;
                try {
                    return `<span class="math-inline">${katex.renderToString(`${base}^{${exp}}`, renderOptions)}</span>`;
                } catch(e) {
                    return match;
                }
            });

            // Replace subscripts: x_1 -> x_{1}
            processedLine = processedLine.replace(/([a-zA-Z])_(\d+)/g, (match, base, sub) => {
                hasMath = true;
                try {
                    return `<span class="math-inline">${katex.renderToString(`${base}_{${sub}}`, renderOptions)}</span>`;
                } catch(e) {
                    return match;
                }
            });

            // Replace square roots: √4 -> \sqrt{4}
            processedLine = processedLine.replace(/√(\d+)/g, (match, num) => {
                hasMath = true;
                try {
                    return `<span class="math-inline">${katex.renderToString(`\\\\sqrt{${num}}`, renderOptions)}</span>`;
                } catch(e) {
                    return match;
                }
            });

            // Replace sum notation
            processedLine = processedLine.replace(/∑_\{([^}]+)\}\^?\{?([^}]*)\}?/g, (match, bottom, top) => {
                hasMath = true;
                const topStr = top || 'n';
                try {
                    return `<span class="math-inline">${katex.renderToString(`\\\\sum_{${bottom}}^{${topStr}}`, {...renderOptions, displayMode: true})}</span>`;
                } catch(e) {
                    return match;
                }
            });

            // Replace integral
            processedLine = processedLine.replace(/∫_\{([^}]+)\}\^?\{?([^}]*)\}?/g, (match, bottom, top) => {
                hasMath = true;
                const topStr = top || 'b';
                try {
                    return `<span class="math-inline">${katex.renderToString(`\\\\int_{${bottom}}^{${topStr}}`, {...renderOptions, displayMode: true})}</span>`;
                } catch(e) {
                    return match;
                }
            });

            // Replace limit
            processedLine = processedLine.replace(/lim_\{[^}]+\}/g, (match) => {
                hasMath = true;
                const varMatch = match.match(/lim_\{([^}]+)\}/);
                if (varMatch) {
                    try {
                        return `<span class="math-inline">${katex.renderToString(`\\\\lim_{${varMatch[1]}}`, renderOptions)}</span>`;
                    } catch(e) {
                        return match;
                    }
                }
                return match;
            });

            // Replace Greek letters
            const greekMap = {
                'alpha': '\\alpha',
                'beta': '\\beta', 
                'gamma': '\\gamma',
                'delta': '\\delta',
                'epsilon': '\\epsilon',
                'theta': '\\theta',
                'lambda': '\\lambda',
                'mu': '\\mu',
                'pi': '\\pi',
                'sigma': '\\sigma',
                'omega': '\\omega',
                'phi': '\\phi',
                'psi': '\\psi'
            };

            Object.keys(greekMap).forEach(greek => {
                const regex = new RegExp(`\\\\b${greek}\\\\b`, 'gi');
                if (regex.test(processedLine)) {
                    hasMath = true;
                    processedLine = processedLine.replace(regex, (m) => {
                        try {
                            return katex.renderToString(greekMap[greek.toLowerCase()], renderOptions);
                        } catch(e) {
                            return m;
                        }
                    });
                }
            });

            // Replace common symbols
            const symbolMap = {
                '→': '\\rightarrow',
                '←': '\\leftarrow',
                '∞': '\\infty',
                '≠': '\\neq',
                '≤': '\\leq',
                '≥': '\\geq',
                '±': '\\pm',
                '∓': '\\mp',
                '∈': '\\in',
                '∉': '\\notin',
                '⊂': '\\subset',
                '⊃': '\\supset',
                '∪': '\\cup',
                '∩': '\\cap',
                '∀': '\\forall',
                '∃': '\\exists',
                '∂': '\\partial',
                '∇': '\\nabla',
                '∑': '\\sum',
                '∏': '\\prod',
                '∫': '\\int'
            };

            Object.keys(symbolMap).forEach(sym => {
                if (processedLine.includes(sym)) {
                    hasMath = true;
                    processedLine = processedLine.split(sym).map(part => {
                        try {
                            return part ? katex.renderToString(part, renderOptions) : '';
                        } catch(e) {
                            return part;
                        }
                    }).join(`<span class="math-symbol">${katex.renderToString(symbolMap[sym], renderOptions)}</span>`);
                }
            });

            resultHtml += `<div class="math-line">${processedLine}</div>`;
        });

        return hasMath ? resultHtml : null;
    }

    function toggle() {
        isEnabled = !isEnabled;
        
        const btn = document.getElementById('mathLiveBtn');
        if (btn) {
            btn.classList.toggle('active', isEnabled);
        }

        if (isEnabled) {
            renderMath();
        } else if (previewContainer) {
            previewContainer.classList.remove('visible');
        }
    }

    function setEnabled(enabled) {
        isEnabled = enabled;
    }

    function render() {
        if (isEnabled) {
            renderMath();
        }
    }

    return {
        init,
        toggle,
        setEnabled,
        render
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => MathLiveRenderer.init());
