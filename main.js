import { setActiveKeychain, DynamicTableState, setCoalescedPlan, setCoSy, ActiveKeychain } from './core/state.js';
import { Six_Plan, Four_Row, Seven_Wish, Knot, Hyper_Three_Cell } from './models/WISH.js';
window.Seven_Wish = Seven_Wish;
import { CoreSystem } from './renderers/archRenderer.js';
import { renderActiveQuipu, saveKeychain, loadKeychain, downloadKeychain } from './renderers/quipuRenderer.js';
import { recoalesceAndRenderAll } from './renderers/tableRenderer.js';
import { initCanvasSystem, renderCanvasUpdate, updateCanvasConsole } from './renderers/canvasRenderer.js';
import { renderDecompRecompConsole } from './renderers/decompRenderer.js';
import { applyQDL } from './services/qdlEngine.js';
import { populateModelOptions } from './services/api.js';
// --- NEW IMPORTS ---
import { applyWDL, wdlEmit, wdlShadowUpdate } from './services/wdlEngine.js';
import { initMainChatUI } from './renderers/mainChatUI.js';
import { initToolsUI } from './renderers/toolsUI.js';
import {
    renderKnotReader, knotReaderSwitchFocus,
    knotReaderPrev, knotReaderNext, knotReaderSelectQuipu
} from './renderers/knotReader.js';
import {
    handleExecuteSingleTurn, handleExecuteCoderTurn, handleSequentialConversation,
    handleSequentialCoder, resumeSequentialConversation, handleExecuteTwoPassTurn,
    handleSequentialTwoPass, resume2passtrack, executeLastWave, autoRecomposeAll
} from './services/tableExecutionSuite.js';

// --- Global UI Refresh Definition ---
window.GlobalUIRefresh = function () {
    if (window.ActiveKeychain && typeof window.ActiveKeychain.yieldElement === 'function') {
        window.ActiveKeychain.yieldElement('keychain-container');
    }
    recoalesceAndRenderAll();
    renderCanvasUpdate();
    if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Initializing UX Tool subsystems and binding UI events...");

    // --- Setup UI Sliders first thing ---
    try {
        const numCtS = document.getElementById('numCtxSlider');
        const numCtV = document.getElementById('numCtxValue');
        if (numCtS && numCtV) { numCtS.addEventListener('input', (e) => numCtV.textContent = e.target.value); }

        const tempS = document.getElementById('tempslider');
        const tempV = document.getElementById('tempValue');
        if (tempS && tempV) { tempS.addEventListener('input', (e) => tempV.textContent = e.target.value); }

        const topkS = document.getElementById('topkslider');
        const topkV = document.getElementById('topkValue');
        if (topkS && topkV) { topkS.addEventListener('input', (e) => topkV.textContent = e.target.value); }
        console.log("UI Sliders successfully bound.");
    } catch (err) {
        console.error("Error binding UI sliders:", err);
    }

    // --- Global Status UI Proxy ---
    const realStatusDiv = document.getElementById('statusDiv');
    let statusTimeout;
    if (realStatusDiv) {
        window.statusDiv = {
            set textContent(msg) {
                realStatusDiv.innerHTML = msg;
                realStatusDiv.classList.remove('hidden');
                realStatusDiv.classList.remove('opacity-0');
                realStatusDiv.classList.add('opacity-100');
                clearTimeout(statusTimeout);
                statusTimeout = setTimeout(() => {
                    realStatusDiv.classList.remove('opacity-100');
                    realStatusDiv.classList.add('opacity-0');
                    setTimeout(() => realStatusDiv.classList.add('hidden'), 300);
                }, 4000);
            },
            get textContent() { return realStatusDiv.innerHTML; }
        };
    } else {
        // Fallback bit-bucket to prevent crashes if the HTML element is removed again
        window.statusDiv = { textContent: "" };
    }

    // 1. Quipu System - DEPRECATED
    window.ActiveKeychain = null;

    // 2. Table System
    DynamicTableState.scenario = new Seven_Wish("Default Main Scenario");
    DynamicTableState.activeHistory = new Four_Row("first state history");
    setCoalescedPlan(new Four_Row("Coalesced plan"));

    // 3. Decomp/Recomp & Architecture Systems
    if (document.getElementById('viz-architect')) {
        const cosyInstance = new CoreSystem();
        setCoSy(cosyInstance);
        window.CoSy = cosyInstance;
        cosyInstance.init();
    }

    // 4. API & External Renderers
    await populateModelOptions();
    renderDecompRecompConsole();
    renderKnotReader();
    initCanvasSystem();
    initMainChatUI(); // NEW
    initToolsUI();    // NEW

    // 5. Initial Renders
    renderActiveQuipu();
    recoalesceAndRenderAll(DynamicTableState);

    // 6. Connect Legacy HTML Event Listeners
    const paintTracksBtn = document.getElementById('renderbtn');
    if (paintTracksBtn) paintTracksBtn.addEventListener('click', () => {
        console.log("[renderbtn] Clicked 'Render Visuals'. Triggering recoalesceAndRenderAll...");
        recoalesceAndRenderAll(DynamicTableState);
        console.log("[renderbtn] Render Sequence complete.");
    });

    const seeTexBtn = document.getElementById("seetex");
    if (seeTexBtn) seeTexBtn.onclick = () => {
        document.getElementById("scenetext").value = DynamicTableState.scenario.getJSONstring();
    };

    const emiTexBtn = document.getElementById("emitex");
    if (emiTexBtn) emiTexBtn.onclick = () => {
        DynamicTableState.loadScenarioFromJSON(document.getElementById("scenetext").value);
        recoalesceAndRenderAll(DynamicTableState);
    };

    const loadWdlBtn = document.getElementById("loadwdlbtn");
    if (loadWdlBtn) loadWdlBtn.onclick = () => { applyWDL(); };

    const saveWdlBtn = document.getElementById("savewdlbtn");
    if (saveWdlBtn) saveWdlBtn.onclick = () => {
        if (DynamicTableState.scenario) {
            document.getElementById("wdltext").value = wdlEmit(DynamicTableState.scenario.RegId);
        }
    };

    const exportNexusBtn = document.getElementById("exportNexusBtn");
    if (exportNexusBtn) exportNexusBtn.onclick = () => {
        if (DynamicTableState.scenario && typeof DynamicTableState.scenario.exportTemporalNexusJSON === 'function') {
            const jsonStr = DynamicTableState.scenario.exportTemporalNexusJSON();
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `temporal_nexus_graph_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            if (window.statusDiv) window.statusDiv.textContent = "Temporal Nexus Graph exported successfully.";
        } else {
            console.error("Export method not found on scenario.", DynamicTableState.scenario);
            if (window.statusDiv) window.statusDiv.textContent = "Error: Export method not found on active scenario.";
        }
    };

    const dumpBayesianDepBtn = document.getElementById("dumpBayesianDepBtn");
    if (dumpBayesianDepBtn) dumpBayesianDepBtn.onclick = () => {
        import('./core/state.js').then(module => {
            const mermaidStr = module.GlobalDependencyBayesianGraph.toMermaid();
            document.getElementById("bayesianDumpText").value = mermaidStr || "Graph is empty.";
            if (window.statusDiv) window.statusDiv.textContent = "Dependencies Bayesian Graph generated.";
        });
    };

    const dumpBayesianDptBtn = document.getElementById("dumpBayesianDptBtn");
    if (dumpBayesianDptBtn) dumpBayesianDptBtn.onclick = () => {
        import('./core/state.js').then(module => {
            const mermaidStr = module.GlobalDependentBayesianGraph.toMermaid();
            document.getElementById("bayesianDumpText").value = mermaidStr || "Graph is empty.";
            if (window.statusDiv) window.statusDiv.textContent = "Dependents Bayesian Graph generated.";
        });
    };

    const distillBayesianBtn = document.getElementById("distillBayesianBtn");
    if (distillBayesianBtn) distillBayesianBtn.onclick = () => {
        import('./core/state.js').then(async module => {
            if (window.statusDiv) window.statusDiv.textContent = "Starting Bayesian MECE Graph Distillation...";
            
            let count = 0;
            const depGraph = module.GlobalDependencyBayesianGraph;
            if (!depGraph) return;

            // Distill Dependencies
            for (const [name, node] of depGraph.nodes.entries()) {
                for (const edge of node.outEdges.values()) {
                    if (edge.codeSnippets && edge.codeSnippets.length > 1) {
                        const success = await depGraph.autoDistillEdge(edge.source, edge.target);
                        if(success) count++;
                    }
                }
            }
            
            // Re-save logic identical to TableExecutionSuite
            try {
                localStorage.setItem('bayesian_code_graph_dependency', depGraph.toJSON());
                localStorage.setItem('bayesian_code_graph_dependent', module.GlobalDependentBayesianGraph.toJSON());
            } catch (e) {
                console.warn("Storage quota exceeded during distillation save", e);
            }

            if (window.statusDiv) window.statusDiv.textContent = `Distilled ${count} redundant edges into native MECE nodes.`;
        });
    };
});

// --- Expose Globals for Inline HTML Event Handlers ---
window.updateCanvasConsole = updateCanvasConsole;
window.renderCanvasUpdate = renderCanvasUpdate;
window.renderKnotReader = renderKnotReader;
window.knotReaderSwitchFocus = knotReaderSwitchFocus;
window.knotReaderPrev = knotReaderPrev;
window.knotReaderNext = knotReaderNext;
window.knotReaderSelectQuipu = knotReaderSelectQuipu;

window.saveKeychain = saveKeychain;
window.loadKeychain = loadKeychain;
window.downloadKeychain = downloadKeychain;
window.applyQDL = applyQDL;
window.applyWDL = applyWDL;

// Expose Execution Suite handlers for dynamically generated buttons in the Coalesced Plan
window.recoalesceAndRenderAll = recoalesceAndRenderAll;
window.handleExecuteSingleTurn = handleExecuteSingleTurn;
window.handleExecuteCoderTurn = handleExecuteCoderTurn;
window.handleSequentialConversation = handleSequentialConversation;
window.handleSequentialCoder = handleSequentialCoder;
window.resumeSequentialConversation = resumeSequentialConversation;
window.handleExecuteTwoPassTurn = handleExecuteTwoPassTurn;
window.handleSequentialTwoPass = handleSequentialTwoPass;
window.resume2passtrack = resume2passtrack;
window.executeLastWave = executeLastWave;
window.autoRecomposeAll = autoRecomposeAll;