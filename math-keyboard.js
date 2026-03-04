/**
 * Math Keyboard Module
 * Provides a tabbed interface for inserting mathematical symbols
 */

const MathKeyboard = (function() {
    'use strict';

    // Symbol categories
    const SYMBOLS = {
        basic: {
            label: 'Básico',
            sections: [
                { label: 'Operadores', items: ['+', '−', '×', '÷', '±', '∓'] },
                { label: 'Comparación', items: ['=', '≠', '<', '>', '≤', '≥', '≈', '≡'] },
                { label: 'Potencias', items: ['²', '³', 'ⁿ', '⁻¹', '√', '∛', '⁴√'] },
                { label: 'Fracciones', items: ['½', '⅓', '⅔', '¼', '¾', '⅕', '⅙', '⅚'] }
            ]
        },
        greek: {
            label: 'Griego',
            sections: [
                { label: 'Minúsculas', items: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω'] },
                { label: 'Mayúsculas', items: ['Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ', 'Λ', 'Μ', 'Ν', 'Ξ', 'Π', 'Ρ', 'Σ', 'Τ', 'Φ', 'Χ', 'Ψ', 'Ω'] }
            ]
        },
        sets: {
            label: 'Conjuntos',
            sections: [
                { label: 'Operaciones', items: ['∪', '∩', '∖', '⊂', '⊃', '⊆', '⊇', '∈', '∉', '∀', '∃', '∄'] },
                { label: 'Conjuntos Numéricos', items: ['ℕ', 'ℤ', 'ℚ', 'ℝ', 'ℂ', '∅', '∞'] }
            ]
        },
        calculus: {
            label: 'Cálculo',
            sections: [
                { label: 'Cálculo', items: ['∫', '∬', '∭', '∮', '∂', '∇', 'lim', '→'] },
                { label: 'Sumatorio y Productorio', items: ['∑', '∑_{i=1}^{n}', '∏', '∏_{i=1}^{n}'] },
                { label: 'Funciones Comunes', items: ['sin', 'cos', 'tan', 'log', 'ln', 'exp'] }
            ]
        },
        logic: {
            label: 'Lógica',
            sections: [
                { label: 'Conectivos', items: ['¬', '∧', '∨', '⊕', '→', '↔', '⊤', '⊥'] },
                { label: 'Razonamiento', items: ['∴', '∵', '⊢', '⊨'] }
            ]
        },
        matrix: {
            label: 'Matrices',
            sections: [
                { label: 'Delimitadores', items: ['(', ')', '[', ']', '{', '}', '⟨', '⟩', '|'] },
                { label: 'Notación Vectorial', items: ['·', '×', '̂', '⃗', '‖', '⊥', '∥', '∠'] },
                { label: 'Unidades', items: ['°', '′', '″', '%', '‰'] }
            ]
        }
    };

    let noteContent = null;
    let keyboard = null;
    let isVisible = false;

    function init(textareaId) {
        noteContent = document.getElementById(textareaId);
        if (!noteContent) return;

        const mathBtn = document.getElementById('mathKeyboardBtn');
        if (!mathBtn) return;

        createKeyboard();
        setupEventListeners(mathBtn);
    }

    function createKeyboard() {
        keyboard = document.createElement('div');
        keyboard.id = 'mathKeyboard';
        keyboard.className = 'math-keyboard hidden';

        let html = '<div class="math-keyboard-header">';
        html += '<div class="math-tabs">';
        
        // Create tabs
        const tabs = Object.keys(SYMBOLS);
        tabs.forEach((tab, index) => {
            html += `<button class="math-tab ${index === 0 ? 'active' : ''}" data-tab="${tab}">${SYMBOLS[tab].label}</button>`;
        });
        
        html += '</div>';
        html += '<button class="math-close" aria-label="Cerrar">';
        html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        html += '</button></div>';
        html += '<div class="math-keyboard-body">';

        // Create panels
        tabs.forEach((tab, index) => {
            html += `<div class="math-panel ${index === 0 ? 'active' : ''}" data-panel="${tab}">`;
            
            SYMBOLS[tab].sections.forEach(section => {
                html += `<div class="math-section">`;
                html += `<span class="math-label">${section.label}</span>`;
                html += '<div class="math-symbols">';
                
                section.items.forEach(item => {
                    html += `<button class="math-symbol" data-insert="${escapeHtml(item)}" title="${item}">${item}</button>`;
                });
                
                html += '</div></div>';
            });
            
            html += '</div>';
        });

        html += '</div>';
        keyboard.innerHTML = html;

        // Insert after the button
        const mathBtn = document.getElementById('mathKeyboardBtn');
        mathBtn.parentNode.appendChild(keyboard);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function setupEventListeners(mathBtn) {
        // Tab switching
        keyboard.querySelectorAll('.math-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                keyboard.querySelectorAll('.math-tab').forEach(t => t.classList.remove('active'));
                keyboard.querySelectorAll('.math-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                keyboard.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
            });
        });

        // Close button
        keyboard.querySelector('.math-close').addEventListener('click', hide);

        // Symbol insertion
        keyboard.querySelectorAll('.math-symbol').forEach(btn => {
            btn.addEventListener('click', () => insertSymbol(btn.dataset.insert));
        });

        // Toggle keyboard visibility
        mathBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!mathBtn.contains(e.target) && !keyboard.contains(e.target)) {
                hide();
            }
        });
    }

    function insertSymbol(symbol) {
        if (!noteContent) return;

        const start = noteContent.selectionStart;
        const end = noteContent.selectionEnd;
        const text = noteContent.value;

        noteContent.value = text.substring(0, start) + symbol + text.substring(end);
        noteContent.selectionStart = noteContent.selectionEnd = start + symbol.length;
        noteContent.focus();
        noteContent.dispatchEvent(new Event('input'));
    }

    function toggle() {
        if (isVisible) hide();
        else show();
    }

    function show() {
        isVisible = true;
        keyboard.classList.remove('hidden');
        
        // Close other modes
        if (typeof DrawingCanvas !== 'undefined' && DrawingCanvas.isActive()) {
            DrawingCanvas.toggle();
        }
        if (typeof GraphTool !== 'undefined' && GraphTool.isActive()) {
            GraphTool.toggle();
        }
    }

    function hide() {
        isVisible = false;
        keyboard.classList.add('hidden');
    }

    function isActive() {
        return isVisible;
    }

    // Public API
    return {
        init,
        toggle,
        show,
        hide,
        isActive,
        insertSymbol
    };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => MathKeyboard.init('noteContent'));
