/**
 * Math to Image Converter - Auto-generates images from rendered math
 * Converts KaTeX formulas to downloadable images automatically
 */

const MathToImage = (function() {
    'use strict';

    // Configuration
    let config = {
        scale: 2,
        backgroundColor: 'transparent',
        autoGenerate: true
    };

    // State
    let currentImageData = null;
    let currentSvgData = null;
    let isGenerated = false;
    let mathContainer = null;
    let initialized = false;
    let genDebounce = null;
    let mutationObserver = null;
    let checkInterval = null;

    // Dummy showToolbar to prevent errors (can be implemented if needed)
    function showToolbar(type) {
        // Placeholder - toolbar management can be added here if needed
        console.log('MathToImage: showToolbar called with type:', type);
    }

    /**
     * Initialize and start observing for math changes
     */
    function init() {
        if (initialized) return;
        initialized = true;
        console.log('MathToImage: Initializing...');
        
        // Start observing immediately once DOM is ready
        setupAutoGeneration();
    }

    /**
     * Set up automatic generation when math is detected
     */
    function setupAutoGeneration() {
        // Clear previous observers/intervals if any
        if (mutationObserver) {
            try { mutationObserver.disconnect(); } catch(e) {}
        }
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }

        // Debounced generator reused across events
        genDebounce = debounce(() => {
            if (!config.autoGenerate) return;
            const mathElement = findMathElement();
            if (mathElement) {
                generateFromElement(mathElement);
            }
        }, 2500);

        // Periodic check to catch first render
        checkInterval = setInterval(() => {
            const mathElement = findMathElement();
            if (mathElement) {
                generateFromElement(mathElement);
                clearInterval(checkInterval);
                checkInterval = null;
            }
        }, 300);

        // Input typing updates
        const noteContent = document.getElementById('noteContent');
        if (noteContent) {
            noteContent.removeEventListener?.('input', genDebounce);
            noteContent.addEventListener('input', genDebounce);
        }

        // Observe math preview DOM mutations (child changes and attribute/style updates)
        const mathPreview = document.getElementById('mathPreview');
        if (mathPreview) {
            mutationObserver = new MutationObserver(() => genDebounce());
            mutationObserver.observe(mathPreview, { childList: true, subtree: true, characterData: true, attributes: true });
        }
    }

    /**
     * Find the math element in the DOM
     */
    function findMathElement() {
        // Priority order for finding math
        const selectors = [
            '#mathPreview',
            '.math-preview',
            '.math-inline',
            '.katex',
            '.katex-html'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.innerHTML.trim() && element.innerHTML.length > 10) {
                // Check if it has actual rendered math content
                const hasKatex = element.querySelector('.katex');
                const hasMath = element.querySelector('[class*="katex"]');
                const hasText = element.textContent.trim().length > 0;
                
                if ((hasKatex || hasMath || element.querySelector('svg')) && hasText) {
                    console.log('MathToImage: Found math element:', selector);
                    return element;
                }
            }
        }
        return null;
    }

    /**
     * Generate image from element
     */
    async function generateFromElement(element) {
        if (!element) {
            console.log('MathToImage: No element provided');
            return false;
        }

        mathContainer = element;
        // allow regeneration continuously; do not block subsequent renders
        isGenerated = false;

        try {
            // Check for SVG first (MathJax)
            const svg = element.querySelector('svg');
            if (svg) {
                console.log('MathToImage: Found SVG');
                currentSvgData = serializeSvg(svg.cloneNode(true));
                currentImageData = null;
                showToolbar('svg');
                return true;
            }

            // Try html2canvas first for KaTeX
            if (typeof html2canvas !== 'undefined') {
                console.log('MathToImage: Using html2canvas');
                const canvas = await html2canvas(element, {
                    scale: config.scale,
                    backgroundColor: config.backgroundColor,
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                });
                currentSvgData = null;
                currentImageData = canvas.toDataURL('image/png');
                showToolbar('image');
                return true;
            }

            // Fallback: direct canvas rendering
            console.log('MathToImage: Using fallback canvas method');
            currentImageData = await fallbackCanvasRender(element);
            showToolbar('image');
            return true;

        } catch (error) {
            console.error('MathToImage: Error generating:', error);
            isGenerated = false;
            return false;
        }
    }

    /**
     * Fallback canvas rendering using direct SVG conversion
     */
    function fallbackCanvasRender(element) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Get element dimensions
            const rect = element.getBoundingClientRect();
            const width = Math.max(rect.width * config.scale, 200);
            const height = Math.max(rect.height * config.scale, 60);
            
            canvas.width = width;
            canvas.height = height;

            // Clear canvas
            ctx.clearRect(0, 0, width, height);

            // Draw background if not transparent
            if (config.backgroundColor && config.backgroundColor !== 'transparent') {
                ctx.fillStyle = config.backgroundColor;
                ctx.fillRect(0, 0, width, height);
            }

            // Try to get SVG representation
            const svg = elementToSvg(element, width, height);
            
            if (svg) {
                const img = new Image();
                const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);
                
                img.onload = function() {
                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/png'));
                };
                
                img.onerror = function() {
                    URL.revokeObjectURL(url);
                    // Last resort: just return empty canvas
                    resolve(canvas.toDataURL('image/png'));
                };
                
                img.src = url;
            } else {
                // Just return what we have
                resolve(canvas.toDataURL('image/png'));
            }
        });
    }

    /**
     * Convert element to SVG using foreignObject
     */
    function elementToSvg(element, width, height) {
        const clone = element.cloneNode(true);
        
        // Get computed styles
        const computed = window.getComputedStyle(element);
        const fontSize = computed.fontSize || '16px';
        const fontFamily = computed.fontFamily || 'KaTeX_Main, Times New Roman, serif';
        const color = computed.color || '#000000';

        clone.style.cssText = `
            font-family: ${fontFamily};
            font-size: ${fontSize};
            color: ${color};
            background: ${config.backgroundColor === 'transparent' ? 'none' : config.backgroundColor};
            display: inline-block;
            padding: 10px;
        `;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `width: ${width}px; height: ${height}px; overflow: hidden;`;
        wrapper.appendChild(clone);

        const html = wrapper.innerHTML;

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
            <foreignObject width="100%" height="100%">
                <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: ${fontSize}; color: ${color};">
                    ${html}
                </div>
            </foreignObject>
        </svg>`;
    }

    /**
     * Serialize SVG to string
     */
    function serializeSvg(svgElement) {
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgElement);
        
        // Add XML declaration
        svgString = '<?xml version="1.0" encoding="UTF-8"?>' + svgString;
        
        return svgString;
    }


    /**
     * Debounce helper
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Public API
    return {
        init,
        
        /**
         * Force generate image from current math
         */
        generate: function() {
            const element = findMathElement();
            if (element) {
                isGenerated = false;
                return generateFromElement(element);
            }
            showToast('No se detectó ninguna fórmula', 'error');
            return Promise.resolve(false);
        },

        /**
         * Download current image
         */
        download: function() {
            const timestamp = Date.now();
            
            if (currentSvgData) {
                const blob = new Blob([currentSvgData], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `formula-${timestamp}.svg`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('SVG descargado', 'success');
            } else if (currentImageData) {
                const a = document.createElement('a');
                a.href = currentImageData;
                a.download = `formula-${timestamp}.png`;
                a.click();
                showToast('Imagen descargada', 'success');
            } else {
                // Try to generate first
                this.generate().then(() => {
                    if (currentImageData || currentSvgData) {
                        this.download();
                    }
                });
            }
        },

        /**
         * Copy image to clipboard
         */
        copyToClipboard: async function() {
            try {
                if (currentSvgData) {
                    await navigator.clipboard.writeText(currentSvgData);
                    showToast('SVG copiado', 'success');
                } else if (currentImageData) {
                    const response = await fetch(currentImageData);
                    const blob = await response.blob();
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    showToast('Imagen copiada', 'success');
                } else {
                    // Try to generate first
                    await this.generate();
                    if (currentImageData) {
                        await this.copyToClipboard();
                    }
                }
            } catch (error) {
                console.error('Copy error:', error);
                showToast('Error al copiar', 'error');
            }
        },

        /**
         * Configure options
         */
        configure: function(options) {
            Object.assign(config, options);
        },

        /**
         * Get current image data
         */
        getImageData: function() {
            return currentImageData;
        }
    };

    /**
     * Show toast notification
     */
    function showToast(message, type) {
        const existing = document.querySelector('.mti-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `mti-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
})();

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    MathToImage.init();
});

window.MathToImage = MathToImage;
