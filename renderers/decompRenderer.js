import { createModelSelector } from '../models/WISH.js';
// Legacy imports retained for potential future use by other consumers
// import { ActiveKeychain, s1, k1, d2, d3 } from '../core/state.js';
// import { Quechuy_executeQuipu, buildDecompositionPrompt } from '../services/quipuEngine.js';
// import { Quechuy_DecomposeAndSynthesize, Quechuy_executeRecomposition } from '../services/decompEngine.js';
// import { buildWDLRecompositionPlan } from '../services/wdlEngine.js';


// ═══════════════════════════════════════════════════════════════
// Model Configuration for the Pipeline
// ═══════════════════════════════════════════════════════════════

const DECOMP_RECOMP_STORAGE_KEY = 'DecompRecompModels';

/**
 * Immediately-invoked function expression (IIFE) that loads the previously
 * saved model selections for the decomposition/recomposition pipeline from
 * localStorage. If none exist, initializes with default empty values.
 */
(function loadDecompRecompModels() {
    const defaults = { decomp: '', architect: '', synthesizer: '', leaf: '', moral: '' };
    try {
        const saved = localStorage.getItem(DECOMP_RECOMP_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            window.DecompRecompModels = Object.assign(defaults, parsed);
            //console.log('[DecompRecomp] Restored model selections from localStorage:', window.DecompRecompModels);
            return;
        }
    } catch (e) {
        console.warn('[DecompRecomp] Failed to restore from localStorage:', e);
    }
    window.DecompRecompModels = defaults;
})();

/**
 * Saves the current model selections for the decomposition and recomposition 
 * pipeline (stored in window.DecompRecompModels) to localStorage.
 */
function saveDecompRecompModels() {
    try {
        localStorage.setItem(DECOMP_RECOMP_STORAGE_KEY, JSON.stringify(window.DecompRecompModels));
    } catch (e) {
        console.warn('[DecompRecomp] Failed to save to localStorage:', e);
    }
}

/**
 * Processes the 'decomp-seed-prompt' input.
 * If populated, it creates a new Quipu with a single Strand and Knot.
 * @returns {number|null} The RegId of the Quipu to execute, or null if none.
 */
function _setupDecompQuipuFromSeed() {
    const promptInput = document.getElementById('decomp-seed-prompt');
    const seedText = promptInput ? promptInput.value.trim() : '';

    if (!seedText) {
        return getVisibleQuipuRegId();
    }

    if (!window.ActiveKeychain) {
        console.warn('[DecompRecomp] No ActiveKeychain found.');
        return getVisibleQuipuRegId();
    }

    const keychain = window.ActiveKeychain;
    const newQuipu = new Quipu(`Decomp - ${seedText.substring(0, 20)}...`);
    newQuipu.executionStrategy = 'SEQUENTIAL';

    keychain.quipus.push(newQuipu.RegId);
    keychain.visibleQuipuIndex = keychain.quipus.length - 1;

    const strandId = newQuipu.pushStrand();
    const strand = s1(strandId);

    const knotId = strand.knots[0];
    const knot = k1(knotId);

    const tc = d3(knot.TC);
    if (tc && tc.prompt) {
        const fakeRootComponent = {
            name: seedText,
            role: "the root system",
            is_implementable: false
        };
        const generatedPrompt = buildDecompositionPrompt(fakeRootComponent, "The Entire Project", "implicit boundaries");
        d2(tc.prompt).content = generatedPrompt;
    }

    knot.responseCallbackId = "sensibleRecursiveDecomposition";
    promptInput.value = '';

    if (typeof GlobalUIRefresh === 'function') {
        GlobalUIRefresh();
    }

    return newQuipu.RegId;
}

/**
 * Helper function to retrieve the RegId of the Quipu that is currently visible
 */
function getVisibleQuipuRegId() {
    const kc = window.ActiveKeychain;
    if (!kc || kc.quipus.length === 0) return null;
    const idx = kc.visibleQuipuIndex;
    return kc.quipus[idx] !== undefined ? kc.quipus[idx] : null;
}

/**
 * Renders the Decomp-Recomp Console into #decomp-recomp-console.
 */
export function renderDecompRecompConsole() {
    const container = document.getElementById('decomp-recomp-console');
    if (!container) {
        console.warn('[renderDecompRecompConsole] #decomp-recomp-console not found in DOM.');
        return;
    }

    const fallbackModel = document.getElementById('modelSel')?.value || '';
    if (!window.DecompRecompModels.decomp) window.DecompRecompModels.decomp = fallbackModel;
    if (!window.DecompRecompModels.architect) window.DecompRecompModels.architect = fallbackModel;
    if (!window.DecompRecompModels.synthesizer) window.DecompRecompModels.synthesizer = fallbackModel;
    if (!window.DecompRecompModels.leaf) window.DecompRecompModels.leaf = fallbackModel;
    if (!window.DecompRecompModels.moral) window.DecompRecompModels.moral = fallbackModel;

    container.innerHTML = '';

    // Compact panel styled to blend with the gem-gold sweep-console
    const panel = document.createElement('div');
    panel.style.cssText = 'background: rgba(10, 5, 15, 0.6); border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; padding: 12px 16px; margin-top: 8px;';

    const title = document.createElement('div');
    title.textContent = '⚙ Pipeline Model Assignments';
    title.style.cssText = 'color: #FFD700; margin: 0 0 10px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8;';
    panel.appendChild(title);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 16px;';

    const roles = [
        { key: 'decomp', label: '🔬 Decomposition' },
        { key: 'moral', label: '⚖️ Moral Gate' },
        { key: 'architect', label: '🏗 Architect' },
        { key: 'synthesizer', label: '🔧 Synthesizer' },
        { key: 'leaf', label: '🍃 Leaf Code-Gen' }
    ];

    for (const role of roles) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px;';

        const lbl = document.createElement('label');
        lbl.textContent = role.label + ':';
        lbl.style.cssText = 'color: #FFD700; font-size: 11px; min-width: 120px; white-space: nowrap; opacity: 0.75;';

        const sel = createModelSelector(window.DecompRecompModels[role.key], (e) => {
            window.DecompRecompModels[role.key] = e.target.value;
            saveDecompRecompModels();
        });
        sel.style.cssText = 'flex: 1; font-size: 11px; padding: 3px 5px; background: #050505; color: #FFD700; border: 1px solid rgba(255,215,0,0.25); border-radius: 4px;';

        row.appendChild(lbl);
        row.appendChild(sel);
        grid.appendChild(row);
    }
    panel.appendChild(grid);
    container.appendChild(panel);
}

/**
 * Refreshes the Decomp-Recomp JSON Viewer textarea with the current master tree data.
 */
export function refreshDecompJsonViewer() {
    const viewer = document.getElementById('decomp-json-viewer');
    if (!viewer) return;

    if (window.ActiveDecompRecompState && window.ActiveDecompRecompState.masterJsonTree) {
        let outputText = "=== LIVE SYSTEM ARCHITECTURE ===\n";
        try {
            outputText += JSON.stringify(window.ActiveDecompRecompState.masterJsonTree, null, 2);
        } catch (e) {
            outputText += "[Error stringifying master JSON tree: " + e.message + "]\n";
        }

        if (window.ActiveDecompRecompState.ontologyExport) {
            outputText += "\n\n=== ONTO27 KNOWLEDGE GRAPH EXPORT ===\n" +
                "// Paste the below array into Onto27.a.html 'deserialize()' or as new format data:\n";
            try {
                outputText += JSON.stringify([window.ActiveDecompRecompState.ontologyExport], null, 2);
            } catch (e) {
                outputText += "[Error stringifying ontologyExport: " + e.message + "]\n";
            }
        }

        viewer.value = outputText;
    } else {
        viewer.value = '';
    }
}

// Map the exports globally just like the other modules if needed by inline handlers
window.refreshDecompJsonViewer = refreshDecompJsonViewer;
window.renderDecompRecompConsole = renderDecompRecompConsole;
