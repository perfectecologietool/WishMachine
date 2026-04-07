// Neon-styled carousel for browsing Quipu knot response.content values.
// Renders markdown with marked.js, provides navigation and "Switch Focus" to Keychain UI.

import { ActiveKeychain, q1, s1, k1, d2, d3 } from '../core/state.js';
import { Quipu, Strand } from '../models/QuipuModels.js';
import { Knot } from '../models/WISH.js';
// Assumes `marked` is available globally via CDN as specified in your HTML

let currentKnotList = [];
let currentKnotIndex = 0;
let selectedQuipuRegId = null;
/**
  * Populates the Quipu selector dropdown and wires up the reader UI.
  * Called after DOMContentLoaded and keychain is ready.
  */
export function renderKnotReader() {
    const selector = document.getElementById('knot-reader-quipu-select');
    const display = document.getElementById('knot-reader-display');
    const posLabel = document.getElementById('knot-reader-position');
    if (!selector || !display) return;

    const kc = window.ActiveKeychain;
    if (!kc || kc.quipus.length === 0) {
        selector.innerHTML = '<option value="">No Quipus in Keychain</option>';
        display.innerHTML = '<p class="knot-reader-empty">No Quipus loaded yet. Load a Keychain first.</p>';
        posLabel.textContent = '—';
        return;
    }

    // Populate dropdown
    selector.innerHTML = '';
    kc.quipus.forEach((qRegId, idx) => {
        const quipu = q1(qRegId);
        const opt = document.createElement('option');
        opt.value = qRegId;
        opt.textContent = `[${idx}] ${quipu ? quipu.name : 'Quipu ' + qRegId}`;
        selector.appendChild(opt);
    });

    // Default: select visibleQuipuIndex
    if (kc.visibleQuipuIndex >= 0 && kc.visibleQuipuIndex < kc.quipus.length) {
        selector.value = kc.quipus[kc.visibleQuipuIndex];
    }

    // Load knots for selected
    loadQuipuKnots(parseInt(selector.value));
}


/**
     * Collects all Knots from the selected Quipu into a flat traversal array.
     */
export function loadQuipuKnots(quipuRegId) {
    selectedQuipuRegId = quipuRegId;
    currentKnotList = [];
    currentKnotIndex = 0;

    // console.log('[KnotReader] loadQuipuKnots called with quipuRegId:', quipuRegId);

    const quipu = q1(quipuRegId);
    // console.log('[KnotReader] q1() returned:', quipu);

    if (!(quipu instanceof Quipu)) {
        displayEmpty(`Quipu not found (RegId: ${quipuRegId}, got: ${typeof quipu}).`);
        // console.warn('[KnotReader] quipu instanceof Quipu === false. Aborting.');
        return;
    }

    // console.log('[KnotReader] quipu.strands:', quipu.strands, '(length:', quipu.strands ? quipu.strands.length : 'N/A', ')');

    // Walk strands top-to-bottom, knots left-to-right
    // quipu.strands entries are objects: {strandRegId, summaryTwoLayerId}
    for (const strandEntry of quipu.strands) {
        const sId = (typeof strandEntry === 'object' && strandEntry !== null) ? strandEntry.strandRegId : strandEntry;
        const strand = s1(sId);
        // console.log('[KnotReader]   strandEntry:', strandEntry, '→ sId:', sId, '→ s1() returned:', strand);
        if (!strand) {
            // console.warn('[KnotReader]   strand is null/undefined, skipping.');
            continue;
        }
        // console.log('[KnotReader]   strand.knots:', strand.knots, '(length:', strand.knots ? strand.knots.length : 'N/A', ')');
        for (const knotRegId of strand.knots) {
            // console.log('[KnotReader]     pushing knotRegId:', knotRegId);
            currentKnotList.push(knotRegId);
        }
    }

    // console.log('[KnotReader] Final currentKnotList:', currentKnotList, '(length:', currentKnotList.length, ')');

    if (currentKnotList.length === 0) {
        displayEmpty('This Quipu has no knots.');
        return;
    }

    displayKnot(0);
}


/**
     * Renders a single knot's response.content into the display div with markdown.
     */
export function displayKnot(index) {
    if (index < 0 || index >= currentKnotList.length) return;
    currentKnotIndex = index;

    const display = document.getElementById('knot-reader-display');
    const posLabel = document.getElementById('knot-reader-position');
    const prevBtn = document.getElementById('knot-reader-prev');
    const nextBtn = document.getElementById('knot-reader-next');
    const focusBtn = document.getElementById('knot-reader-focus-btn');
    if (!display) return;

    const knotRegId = currentKnotList[index];
    const knot = k1(knotRegId);

    if (!knot) {
        display.innerHTML = '<p class="knot-reader-empty">Knot data not found.</p>';
        return;
    }

    // Data access chain: Knot.TC → Three_Cell.response → Two_Layer.content
    const tc = d3(knot.TC);
    let content = '';
    let promptContent = '';
    if (tc) {
        const respLayer = d2(tc.response);
        content = respLayer ? respLayer.content : '';
        const promptLayer = d2(tc.prompt);
        promptContent = promptLayer ? promptLayer.content : '';
    }

    // Build the knot metadata header
    const strandInfo = knot.parentStrandId !== null ? `Strand ${knot.parentStrandId}` : 'Unknown Strand';
    const metaHtml = `
            <div class="knot-reader-meta">
                <span class="knot-reader-meta-tag">Knot ${knotRegId}</span>
                <span class="knot-reader-meta-tag">${strandInfo}</span>
                <span class="knot-reader-meta-tag">Index ${knot.strandIndex}</span>
                <span class="knot-reader-meta-tag status-${knot.executionStatus || 'PENDING'}">${knot.executionStatus || 'PENDING'}</span>
            </div>
        `;

    // Prompt summary (collapsed by default)
    const promptHtml = promptContent.trim() ? `
            <details class="knot-reader-prompt-details">
                <summary class="knot-reader-prompt-summary">⚡ Prompt</summary>
                <div class="knot-reader-prompt-body">${escapeHtml(promptContent)}</div>
            </details>
        ` : '';

    // Main response content — format and render
    let bodyHtml = '';
    if (!content || content.trim() === '') {
        bodyHtml = '<p class="knot-reader-empty">⸻ No response content yet ⸻</p>';
    } else {
        // As requested: add new lines after commas and semicolons
        let processedContent = content.replace(/([,;])\s*/g, '$1\n');

        if (typeof marked !== 'undefined' && marked.parse) {
            marked.setOptions({ breaks: true }); // ensure \n becomes <br> outside code blocks
            bodyHtml = marked.parse(processedContent);
        } else {
            bodyHtml = '<pre class="knot-reader-fallback">' + escapeHtml(processedContent) + '</pre>';
        }
    }

    // Dynamic font sizing based on length
    let fontSizeStyle = "1rem";
    if (content && content.length > 2000) {
        fontSizeStyle = "0.8rem";
    } else if (content && content.length > 1000) {
        fontSizeStyle = "0.9rem";
    }

    display.innerHTML = metaHtml + promptHtml + `<div class="knot-reader-body" style="font-size: ${fontSizeStyle}; line-height: 1.6;">` + bodyHtml + '</div>';

    // Update nav controls
    if (posLabel) posLabel.textContent = `${index + 1} / ${currentKnotList.length}`;
    if (prevBtn) prevBtn.disabled = currentKnotList.length <= 1; // Only disable if there's no other knot to switch to
    if (nextBtn) nextBtn.disabled = currentKnotList.length <= 1;
    if (focusBtn) focusBtn.disabled = false;
}


export function displayEmpty(msg) {
    const display = document.getElementById('knot-reader-display');
    const posLabel = document.getElementById('knot-reader-position');
    if (display) display.innerHTML = `<p class="knot-reader-empty">${msg}</p>`;
    if (posLabel) posLabel.textContent = '—';
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


/**
 * Switch the main Keychain UI to show the Quipu containing the current knot.
 */
export function knotReaderSwitchFocus() {
    const kc = window.ActiveKeychain;
    if (!kc || selectedQuipuRegId === null) return;
    const quipuIdx = kc.quipus.indexOf(selectedQuipuRegId);
    if (quipuIdx === -1) return;
    kc.visibleQuipuIndex = quipuIdx;
    // Re-render the keychain UI
    if (typeof kc.yieldElement === 'function') {
        kc.yieldElement('keychain-container');
    }
    // Scroll to the keychain section
    const keychainSection = document.getElementById('keychain-container');
    if (keychainSection) {
        keychainSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
    * Navigate to previous knot. Loops to end if at beginning.
    */
export function knotReaderPrev() {
    if (currentKnotList.length === 0) return;
    if (currentKnotIndex > 0) {
        displayKnot(currentKnotIndex - 1);
    } else {
        // Loop round to the end
        displayKnot(currentKnotList.length - 1);
    }
}

/**
 * Navigate to next knot. Loops to start if at end.
 */
export function knotReaderNext() {
    if (currentKnotList.length === 0) return;
    if (currentKnotIndex < currentKnotList.length - 1) {
        displayKnot(currentKnotIndex + 1);
    } else {
        // Loop round to the start
        displayKnot(0);
    }
};

/**
 * Called when the Quipu selector dropdown changes.
 */
export function knotReaderSelectQuipu(selectEl) {
    const regId = parseInt(selectEl.value);
    if (!isNaN(regId)) {
        loadQuipuKnots(regId);
    }
}
