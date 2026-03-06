/*
 * ExprToImage - Parse simple calculator-like expressions to LaTeX, render with KaTeX,
 * and generate a high-quality image (PNG via html2canvas) updated live.
 *
 * Supported syntax (web2.0calc-style):
 * - Exponents: ^ (right-associative), e.g., x^2, (a+b)^(c+d)
 * - Roots: sqrt(expr)
 * - Fractions: / (left-associative), rendered as nested \frac
 * - Parentheses: ( ... )
 * - Unary +/-
 * - Identifiers (letters) and numbers
 */

const ExprToImage = (function() {
  'use strict';

  const cfg = {
    inputSelector: '#noteContent',
    imgSelector: '#exprImage',
    renderContainerId: 'exprRenderContainer',
    scale: 3,
    backgroundColor: 'transparent',
    debounceMs: 2500
  };

  let inputEl = null;
  let imgEl = null;
  let renderHost = null;
  let debTimer = null;

  // Public init
  function init(options = {}) {
    Object.assign(cfg, options);

    inputEl = document.querySelector(cfg.inputSelector);
    imgEl = document.querySelector(cfg.imgSelector);

    if (!inputEl || !imgEl) {
      console.warn('ExprToImage: input or img element not found');
      return;
    }

    // Create off-DOM render host
    renderHost = document.getElementById(cfg.renderContainerId);
    if (!renderHost) {
      renderHost = document.createElement('div');
      renderHost.id = cfg.renderContainerId;
      renderHost.style.position = 'absolute';
      renderHost.style.left = '-10000px';
      renderHost.style.top = '0';
      renderHost.style.pointerEvents = 'none';
      document.body.appendChild(renderHost);
    }

    inputEl.addEventListener('input', onInput);
    // Initial render
    scheduleRender();
  }

  function onInput() {
    scheduleRender();
  }

  function scheduleRender() {
    clearTimeout(debTimer);
    debTimer = setTimeout(renderFromInput, cfg.debounceMs);
  }

  async function renderFromInput() {
    let raw = (inputEl.value || '').trim();
    // If using textarea, prefer current line under caret for parsing
    if (inputEl.tagName === 'TEXTAREA') {
      const caret = inputEl.selectionStart || 0;
      const text = inputEl.value || '';
      const start = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
      const endIdx = text.indexOf('\n', caret);
      const end = endIdx === -1 ? text.length : endIdx;
      const line = text.slice(start, end).trim();
      if (line) raw = line;
    }
    if (!raw) {
      imgEl.removeAttribute('src');
      imgEl.alt = '';
      imgEl.style.display = 'none';
      if (imgEl.nextElementSibling && imgEl.nextElementSibling.id === 'exprPlaceholder') {
        imgEl.nextElementSibling.style.display = 'block';
      }
      return;
    }

    try {
      // 1) Parse -> AST
      const ast = parse(raw);
      // 2) AST -> LaTeX
      const latex = toLatex(ast);
      // 3) Render KaTeX into host
      const html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
      renderHost.innerHTML = html;
      // 4) To image high-res via html2canvas
      const canvas = await html2canvas(renderHost, {
        scale: cfg.scale,
        backgroundColor: cfg.backgroundColor,
        logging: false,
        useCORS: true
      });
      const dataUrl = canvas.toDataURL('image/png');
      // 5) Update <img>
      imgEl.src = dataUrl;
      imgEl.alt = latex;
      imgEl.style.display = 'block';
      imgEl.style.opacity = '1';
      if (imgEl.nextElementSibling && imgEl.nextElementSibling.id === 'exprPlaceholder') {
        imgEl.nextElementSibling.style.display = 'none';
      }
    } catch (err) {
      console.error('ExprToImage render error:', err);
      // Fallback: try to show KaTeX error rendering or clear
      try {
        const html = katex.renderToString('\\text{Error de sintaxis}', { throwOnError: false, displayMode: true });
        renderHost.innerHTML = html;
        const canvas = await html2canvas(renderHost, { scale: cfg.scale, backgroundColor: cfg.backgroundColor, logging: false });
        imgEl.src = canvas.toDataURL('image/png');
        imgEl.alt = 'Error';
      } catch(e) {
        imgEl.removeAttribute('src');
        imgEl.alt = '';
        imgEl.style.display = 'none';
        if (imgEl.nextElementSibling && imgEl.nextElementSibling.id === 'exprPlaceholder') {
          imgEl.nextElementSibling.style.display = 'block';
        }
      }
    }
  }

  // ===== Lexer / Parser (Recursive Descent) =====
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      const ch = input[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (/[0-9]/.test(ch)) {
        let j = i+1;
        while (j < input.length && /[0-9.]/.test(input[j])) j++;
        tokens.push({ type: 'num', value: input.slice(i, j) });
        i = j; continue;
      }
      if (/[a-zA-Z]/.test(ch)) {
        let j = i+1;
        while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
        tokens.push({ type: 'id', value: input.slice(i, j) });
        i = j; continue;
      }
      if ('+-*/^()'.includes(ch)) {
        tokens.push({ type: ch, value: ch });
        i++; continue;
      }
      // Unknown char
      tokens.push({ type: 'unknown', value: ch });
      i++;
    }
    return tokens;
  }

  function parse(input) {
    const toks = tokenize(input);
    let pos = 0;

    function peek() { return toks[pos] || { type: 'eof' }; }
    function consume(type) {
      const t = peek();
      if (t.type === type) { pos++; return t; }
      return null;
    }

    function parseExpr() { return parseSum(); }

    function parseSum() {
      let node = parseProd();
      while (true) {
        const t = peek();
        if (t.type === '+' || t.type === '-') {
          pos++;
          const right = parseProd();
          node = { kind: 'bin', op: t.type, left: node, right };
        } else break;
      }
      return node;
    }

    function parseProd() {
      let node = parsePower();
      while (true) {
        const t = peek();
        const t1 = peek(1); // Look ahead to next token
        // Handle implicit multiplication: 2(x+3) or (x+3)2 or x(x+1) or (x+3)(x+2) or 2x
        if (!t || !t1) break;
        
        // Check if current token is followed by next token that starts a factor
        // Cases: 2(x+3), x(x+1), (x+3)(x+2), 2x, x2, (something)(x+2)
        const isLeftFactor = (t.type === 'num' || t.type === 'id' || t.type === ')' || t.type === '(');
        const isRightFactor = (t1.type === '(' || t1.type === 'id' || t1.type === 'num');
        
        if (isLeftFactor && isRightFactor) {
          // Implicit multiplication - treat as *
          const right = parsePower();
          node = { kind: 'bin', op: '*', left: node, right };
          continue;
        }
        
        if (t.type === '*' || t.type === '/') {
          pos++;
          const right = parsePower();
          node = { kind: 'bin', op: t.type, left: node, right };
          continue;
        }
        break;
      }
      return node;
    }

    function parsePower() {
      // right-associative: a ^ b ^ c  => a ^ (b ^ c)
      let node = parseUnary();
      if (peek().type === '^') {
        consume('^');
        const right = parsePower();
        node = { kind: 'bin', op: '^', left: node, right };
      }
      return node;
    }

    function parseUnary() {
      const t = peek();
      if (t.type === '+' || t.type === '-') {
        pos++;
        const arg = parseUnary();
        return { kind: 'un', op: t.type, arg };
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const t = peek();
      if (t.type === 'num') { pos++; return { kind: 'num', value: t.value }; }
      if (t.type === 'id') {
        // function call: sqrt(...), sin(...), cos(...)
        const name = t.value; pos++;
        if (peek().type === '(') {
          consume('(');
          const arg = parseExpr();
          if (!consume(')')) throw new Error('Se esperaba )');
          return { kind: 'call', name, args: [arg] };
        }
        return { kind: 'id', name };
      }
      if (t.type === '(') {
        consume('(');
        const inner = parseExpr();
        if (!consume(')')) throw new Error('Se esperaba )');
        return { kind: 'group', expr: inner };
      }
      throw new Error('Token inesperado: ' + t.type + ' ' + (t.value||''));
    }

    const ast = parseExpr();
    if (peek().type !== 'eof') {
      // Best-effort: ignore the rest
    }
    return ast;
  }

  // ===== AST -> LaTeX =====
  function toLatex(node, parentOp = null) {
    switch (node.kind) {
      case 'num':
        return node.value;
      case 'id':
        return node.name;
      case 'group': {
        return `\\left(${toLatex(node.expr)}\\right)`;
      }
      case 'un': {
        const inner = toLatex(node.arg, 'un');
        return (node.op === '-') ? `-\n${inner}` : inner; // unary plus ignored
      }
      case 'bin': {
        const op = node.op;
        if (op === '^') {
          const base = toLatex(node.left, '^base');
          const exp = toLatex(node.right, '^exp');
          return `${wrapIfNeeded(node.left, 'powBase', base)}^{${exp}}`;
        }
        if (op === '/') {
          const L = toLatex(node.left, '/');
          const R = toLatex(node.right, '/');
          return `\\frac{${L}}{${R}}`;
        }
        if (op === '*') {
          const L = toLatex(node.left, '*');
          const R = toLatex(node.right, '*');
          return `${L} \\cdot ${R}`;
        }
        if (op === '+' || op === '-') {
          const L = toLatex(node.left, op);
          const R = toLatex(node.right, op);
          return `${L} ${op} ${R}`;
        }
        return '';
      }
      case 'call': {
        const name = node.name.toLowerCase();
        const arg = toLatex(node.args[0]);
        if (name === 'sqrt') return `\\sqrt{${arg}}`;
        if (['sin','cos','tan','log','ln'].includes(name)) return `\\${name}\\left(${arg}\\right)`;
        // generic function f(x)
        return `${node.name}\\left(${arg}\\right)`;
      }
      default:
        return '';
    }
  }

  function wrapIfNeeded(sub, context, rendered) {
    // For power bases, wrap groups/nested sums/products in parentheses
    if (sub.kind === 'num' || sub.kind === 'id' || sub.kind === 'call') return rendered;
    return `\\left(${rendered}\\right)`;
  }

  return { init };
})();

// Auto-init if default selectors exist
document.addEventListener('DOMContentLoaded', () => {
  const hasDefault = document.querySelector('#noteContent') && document.querySelector('#exprImage');
  if (hasDefault) ExprToImage.init();
});
