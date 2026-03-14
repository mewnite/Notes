/**
 * Math Tools - Entry Point
 * Initializes all math tool modules
 * 
 * This is the main entry point that coordinates:
 * - MathKeyboard: Tabbed interface for mathematical symbols
 * - DrawingCanvas: Hand drawing with mouse/touch support
 * - GraphTool: Interactive function plotter
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize modules (each module auto-initializes, but we ensure order)
    
    // MathKeyboard is ready (auto-initializes)
    // DrawingCanvas is ready (auto-initializes)  
    // GraphTool is ready (auto-initializes)
    
    console.log('Math Tools initialized');
});

// Expose global functions for external integration
window.MathTools = {
    // Keyboard functions
    showKeyboard: function() {
        if (typeof MathKeyboard !== 'undefined') MathKeyboard.show();
    },
    hideKeyboard: function() {
        if (typeof MathKeyboard !== 'undefined') MathKeyboard.hide();
    },
    insertSymbol: function(symbol) {
        if (typeof MathKeyboard !== 'undefined') MathKeyboard.insertSymbol(symbol);
    },
    
    // Drawing functions
    toggleDrawing: function() {
        if (typeof DrawingCanvas !== 'undefined') DrawingCanvas.toggle();
    },
    clearDrawing: function() {
        if (typeof DrawingCanvas !== 'undefined') DrawingCanvas.clear();
    },
    getDrawingData: function() {
        if (typeof DrawingCanvas !== 'undefined') return DrawingCanvas.getData();
        return null;
    },
    setDrawingData: function(data) {
        if (typeof DrawingCanvas !== 'undefined') DrawingCanvas.setData(data);
    },
    
    // Graph functions
    toggleGraph: function() {
        if (typeof GraphTool !== 'undefined') GraphTool.toggle();
    },
    plotFunction: function(func) {
        if (typeof GraphTool !== 'undefined') {
            GraphTool.show();
            // Set function and plot
            const input = document.getElementById('graphFunction');
            if (input) {
                input.value = func;
                GraphTool.plot();
            }
        }
    }
};
