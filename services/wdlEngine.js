import { d2, d3, d4, d5, d6, d7, dE, dH, dC, k1, SevenWishArray, ActiveDecompRecompState, DynamicTableState } from '../core/state.js';
import { Seven_Wish, Six_Plan, Five_Choice, Five_Parallel, Five_Judgement, Hyper_Five_Choice, Reverse_Five_Parallel, Four_Row, Four_Component, Three_Cell, Knot, Event, Hop, Concept, getModelForPipelineRole } from '../models/WISH.js';
import { Knot_Type, Prompt_engines } from '../core/constants.js';
import { extractCodeBlocks, truncateThinkingTags, extractJsonObject, interpolatePrompt } from '../utils/helpers.js';

// ============================================================================
// SECTION 1: PROGRAMMATIC BUILDER API (Javascript -> Seven_Wish)
// ============================================================================

export function wdl_createWish(name = "New Programmatic Wish") {
    const w = new Seven_Wish(name);
    return w;
}

export function wdl_addChoice(sixPlanRegId, choiceName = "New Choice") {
    const plan = d6(sixPlanRegId);
    if (!plan) throw new Error(`wdl_addChoice: Invalid Six_Plan ID ${sixPlanRegId}`);

    const choice = new Five_Choice(choiceName);
    choice.parentPlanId = plan.RegId;

    // The legacy Six_Plan constructor hard-codes a "start${globalUID}" choice at index 0.
    // If we are appending the very first WDL-defined choice, we MUST obliterate the preset dummy root.
    if (plan.steps.length === 1) {
        const dummyChoice = d5(plan.steps[0]);
        if (dummyChoice && dummyChoice.conditional_phrase.startsWith("start")) {
            plan.steps = [];
        }
    }

    plan.steps.push(choice.RegId);
    return choice;
}

export function wdl_addParallel(sixPlanRegId, parallelName = "New Parallel") {
    const plan = d6(sixPlanRegId);
    if (!plan) throw new Error(`wdl_addParallel: Invalid Six_Plan ID ${sixPlanRegId}`);

    const parallel = new Five_Parallel(parallelName);
    parallel.parentPlanId = plan.RegId;

    if (plan.steps.length === 1) {
        const dummyChoice = d5(plan.steps[0]);
        if (dummyChoice && dummyChoice.conditional_phrase.startsWith("start")) {
            plan.steps = [];
        }
    }

    plan.steps.push(parallel.RegId);
    return parallel;
}

export function wdl_addRow(fiveChoiceRegId, rowName = "New Row", useComponent = false) {
    const choice = d5(fiveChoiceRegId);
    if (!choice) throw new Error(`wdl_addRow: Invalid Five_Choice ID ${fiveChoiceRegId}`);

    const row = useComponent ? new Four_Component(rowName) : new Four_Row(rowName);
    row.parentChoiceId = choice.RegId;
    choice.addBranch(row.RegId);
    return row;
}

export function wdl_addComponent(fiveChoiceRegId, componentName = "New Component") {
    return wdl_addRow(fiveChoiceRegId, componentName, true);
}

export function wdl_addKnot(fourRowRegId, promptText = "", responseText = "", knotType = null) {
    const track = d4(fourRowRegId);
    if (!track) throw new Error(`wdl_addKnot: Invalid Four_Row ID ${fourRowRegId}`);

    if (typeof window === 'undefined' || typeof window.KnotClass === 'undefined') {
        throw new Error("wdl_addKnot: window.KnotClass is not initialized. Ensure QuipuModels loaded.");
    }

    const knot = new window.KnotClass(track.RegId);
    if (knotType) knot.knotType = knotType;

    const cell = d3(knot.TC);
    if (cell) {
        d2(cell.prompt).content = promptText;
        d2(cell.response).content = responseText;
    }

    track.sequence.push(knot.RegId);
    return knot;
}

export function wdl_terminateRowWithChoice(fourRowRegId, choiceName = "") {
    const row = d4(fourRowRegId);
    if (!row) throw new Error(`Invalid Four_Row ID ${fourRowRegId}`);
    if (row.terminatingChoice !== null) return d5(row.terminatingChoice);

    const choice = new Five_Choice(choiceName);
    choice.parentTrackId = row.RegId;

    // Propagate parentPlanId from row's parent choice if available
    if (row.parentChoiceId !== null) {
        const parentChoice = d5(row.parentChoiceId);
        if (parentChoice) choice.parentPlanId = parentChoice.parentPlanId;
    }

    row.terminatingChoice = choice.RegId;
    return choice;
}

export function wdl_terminateRowWithParallel(fourRowRegId, parallelName = "") {
    const row = d4(fourRowRegId);
    if (!row) throw new Error(`Invalid Four_Row ID ${fourRowRegId}`);
    if (row.terminatingChoice !== null) return d5(row.terminatingChoice);

    const parallel = new Five_Parallel(parallelName);
    parallel.parentTrackId = row.RegId;

    // Propagate parentPlanId from row's parent choice if available
    if (row.parentChoiceId !== null) {
        const parentChoice = d5(row.parentChoiceId);
        if (parentChoice) parallel.parentPlanId = parentChoice.parentPlanId;
    }

    row.terminatingChoice = parallel.RegId;
    return parallel;
}

export function wdl_terminateRowWithJudgement(fourRowRegId, conditionalPhrase = "") {
    const row = d4(fourRowRegId);
    if (!row) throw new Error(`Invalid Four_Row ID ${fourRowRegId}`);
    if (row.terminatingChoice !== null) return d5(row.terminatingChoice);

    const judgement = new Five_Judgement(conditionalPhrase);
    judgement.parentTrackId = row.RegId;

    if (row.parentChoiceId !== null) {
        const parentChoice = d5(row.parentChoiceId);
        if (parentChoice) judgement.parentPlanId = parentChoice.parentPlanId;
    }

    row.terminatingChoice = judgement.RegId;
    return judgement;
}

export function wdl_buildMoralVerificationKnot(judgementRegId, parentFourRowId, parsedSubcomponents) {
    const judgement = d5(judgementRegId);
    const parentRow = d4(parentFourRowId);
    if (!judgement || !judgement.OrthoFourRow || !parentRow) return;

    let ancestralNames = [];
    let currentKn = parentRow.knowledgeNode;
    while (currentKn) {
        ancestralNames.unshift(currentKn.label || "System");
        if (currentKn.dependents && currentKn.dependents.length > 0) {
            currentKn = currentKn.dependents[0];
        } else {
            currentKn = null;
        }
    }
    const ancestralPathString = ancestralNames.join(" -> ");

    let prompt = Prompt_engines.find(e => e.name === "MORAL_VERIFICATION_PROMPT_TEMPLATE").string;
    prompt = prompt.replace('{{ANCESTRAL_PATH}}', ancestralPathString);
    prompt = prompt.replace('{{PARENT_SYSTEM}}', parentRow.name);
    
    const subList = parsedSubcomponents.map(c => {
         return typeof c === 'string' ? `- ${c}` : `- ${c.name || c.component_name}`;
    }).join('\n');
    prompt = prompt.replace('{{SUBCOMPONENT_LIST}}', subList);

    let knotClass = typeof window.KnotClass !== 'undefined' ? window.KnotClass : Knot;
    const orthoKnot = new knotClass(judgement.OrthoFourRow.RegId);
    judgement.OrthoFourRow.sequence.push(orthoKnot.RegId);

    const cell = d3(orthoKnot.TC);
    if (cell) {
        d2(cell.prompt).content = prompt;
        cell.model = getModelForPipelineRole('moral'); 
    }
    
    orthoKnot.knotType = Knot_Type.USER_PROMPT_NO_CONTEXT;
    orthoKnot.responseCallbackId = "WDLmoralVerification";
}

export function wdl_addBranchWithKnot(fiveChoiceRegId, rowName, promptText, model, knotType) {
    const row = wdl_addRow(fiveChoiceRegId, rowName);
    const knot = wdl_addKnot(row.RegId, promptText, "", knotType);
    d3(knot.TC).model = model;
    return { row, knot };
}

export function wdl_getHTCaddr(knotRegId) {
    const knot = typeof k1 === 'function' ? k1(knotRegId) : null;
    if (!knot) return null;
    const row = d4(knot.parentTrackId);
    if (!row) return [null, null, null, null, knotRegId];
    const choice = row.parentChoiceId !== null ? d5(row.parentChoiceId) : null;
    const planId = choice ? choice.parentPlanId : null;

    let wishId = null;
    if (typeof SevenWishArray !== 'undefined') {
        for (const sw of SevenWishArray) {
            if (sw.decomposition === planId || sw.recomposition === planId) {
                wishId = sw.RegId;
                break;
            }
        }
    }
    return [wishId, planId, choice ? choice.RegId : null, row.RegId, knotRegId];
}

// --- Bayesian Memory Injector ---
function fetchBayesianMemory(kn) {
    //XXX is it an effecient fetch? 
    let memoryPrompt = "";
    if (!kn) return memoryPrompt;

    if (typeof window !== 'undefined' && window.GlobalDependencyBayesianGraph) {
        let childMemories = [];
        if (kn.dependencies && kn.dependencies.length > 0) {
            for (const childKn of kn.dependencies) {
                if (!childKn.label) continue;
                const srcNode = window.GlobalDependencyBayesianGraph.nodes.get(kn.label);
                if (srcNode) {
                    const edge = srcNode.outEdges.get(childKn.label);
                    if (edge && edge.codeSnippets && edge.codeSnippets.length > 0) {
                        childMemories.push(`- Implementation when '${kn.label}' depends on '${childKn.label}':\n\`\`\`\n${edge.codeSnippets[0]}\n\`\`\``);
                    }
                }
            }
            if (childMemories.length > 0) {
                memoryPrompt += `\n\n[PAST BAYESIAN MEMORY: Subcomponent Implementations]\n${childMemories.join('\n')}`;
            }
        }
    }

    if (typeof window !== 'undefined' && window.GlobalDependentBayesianGraph) {
        let parentMemories = [];
        if (kn.dependents && kn.dependents.length > 0) {
            for (const parentKn of kn.dependents) {
                if (!parentKn.label) continue;
                const tgtNode = window.GlobalDependentBayesianGraph.nodes.get(kn.label);
                if (tgtNode) {
                    const edge = tgtNode.outEdges.get(parentKn.label);
                    if (edge && edge.codeSnippets && edge.codeSnippets.length > 0) {
                        parentMemories.push(`- Implementation of '${kn.label}' when used by '${parentKn.label}':\n\`\`\`\n${edge.codeSnippets[0]}\n\`\`\``);
                    }
                }
            }
            if (parentMemories.length > 0) {
                memoryPrompt += `\n\n[PAST BAYESIAN MEMORY: Parent Context Implementations]\n${parentMemories.join('\n')}`;
            }
        }
    }
    return memoryPrompt;
}

// ============================================================================
// SECTION 2: WDL TEXT COMPILER (Raw Text -> Seven_Wish)
// ============================================================================

/**
 * Parses a raw WDL string and compiles it instantly into the Quipu state architecture.
 * Because the hierarchy is strictly WISH -> PLAN -> CHOICE -> ROW -> KNOT, 
 * a rapid line-by-line state machine compiler successfully maps the AST inherently.
 * @param {string} wdlText The raw script content
 * @returns {Seven_Wish|null} Returns the finalized mapped Seven_Wish object.
 */
export function wdlCompileInstructionSet(wdlText) {
    console.log("[WDL Compiler] Starting Compilation. Raw text length: " + wdlText.length);
    const lines = wdlText.split('\n');
    console.log(`[WDL Compiler] Total lines to parse: ${lines.length}`);

    let activeWish = null;
    let activePlan = null;  // holds d6
    let activeChoice = null; // holds d5
    let activeRow = null;    // holds d4
    let activeKnot = null;   // holds k1

    // State machine to handle multi-line string blocks implicitly correctly if they aren't fully enclosed in quotes
    let multiLineState = null; // "PROMPT" or "RESPONSE"

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.startsWith('//') || line.startsWith('#')) continue;
        console.log(`[WDL Compiler] Parsing line ${i + 1}: "${line}"`);

        // --- Handle Multiline Text Accumulation ---
        if (multiLineState === "PROMPT" && activeKnot) {
            // Check if we hit the next keyword indicating termination
            if (line.match(/^(RESPONSE:|KNOT:|ROW:|CHOICE:|DIAGNOSIS:|PROGNOSIS:|SUMMARY:|WISH:|TYPE:|CONTEXT_SOURCE:|PROMPT_SOURCE:|PROMPT_FN:|CONTEXT_FN:|RESPONSE_FN:|FORCE_JSON:)/i)) {
                multiLineState = null;
            } else {
                d2(d3(activeKnot.TC).prompt).content += '\n' + line.replace(/^"/, '').replace(/"$/, '');
                continue;
            }
        } else if (multiLineState === "RESPONSE" && activeKnot) {
            if (line.match(/^(PROMPT:|KNOT:|ROW:|CHOICE:|DIAGNOSIS:|PROGNOSIS:|SUMMARY:|WISH:|TYPE:|CONTEXT_SOURCE:|PROMPT_SOURCE:|PROMPT_FN:|CONTEXT_FN:|RESPONSE_FN:|FORCE_JSON:)/i)) {
                multiLineState = null;
            } else {
                d2(d3(activeKnot.TC).response).content += '\n' + line.replace(/^"/, '').replace(/"$/, '');
                continue;
            }
        }

        // --- Structural Keyword Parsing ---
        const wishMatch = line.match(/^WISH:\s*(.*)$/i);
        if (wishMatch) {
            let name = wishMatch[1].replace(/^"|"$/g, '').trim();
            activeWish = wdl_createWish(name || "Parsed Wish");
            activePlan = null; activeChoice = null; activeRow = null; activeKnot = null;
            continue;
        }

        if (!activeWish) {
            console.warn(`WDL Compiler Error: Encountered instruction before 'WISH:' declaration at line ${i + 1}`);
            continue; // Ensure root node exists
        }

        if (line.match(/^DIAGNOSIS:/i)) {
            activePlan = d6(activeWish.decomposition);
            activeChoice = null; activeRow = null; activeKnot = null;
            continue;
        }

        if (line.match(/^PROGNOSIS:/i)) {
            activePlan = d6(activeWish.recomposition);
            activeChoice = null; activeRow = null; activeKnot = null;
            continue;
        }

        if (line.match(/^SUMMARY:/i)) {
            activePlan = null; activeChoice = null; activeRow = null;
            if (activeWish.summary !== null && typeof k1 === 'function') activeKnot = k1(activeWish.summary);
            continue;
        }

        const choiceMatch = line.match(/^CHOICE:\s*(.*)$/i);
        if (choiceMatch) {
            if (!activePlan) { console.warn(`WDL Warning: CHOICE hit without active DIAGNOSIS/PROGNOSIS at line ${i + 1}`); continue; }
            let name = choiceMatch[1].replace(/^"|"$/g, '').trim();
            activeChoice = wdl_addChoice(activePlan.RegId, name || "Parsed Choice");
            activeRow = null; activeKnot = null;
            continue;
        }

        const parallelMatch = line.match(/^PARALLEL:\s*(.*)$/i);
        if (parallelMatch) {
            if (!activePlan) { console.warn(`WDL Warning: PARALLEL hit without active DIAGNOSIS/PROGNOSIS at line ${i + 1}`); continue; }
            let name = parallelMatch[1].replace(/^"|"$/g, '').trim();
            activeChoice = wdl_addParallel(activePlan.RegId, name || "Parsed Parallel");
            activeRow = null; activeKnot = null;
            continue;
        }

        const rowMatch = line.match(/^ROW:\s*(.*)$/i);
        if (rowMatch) {
            if (!activeChoice) { console.warn(`WDL Warning: ROW hit without active CHOICE at line ${i + 1}`); continue; }
            let name = rowMatch[1].replace(/^"|"$/g, '').trim();
            activeRow = wdl_addRow(activeChoice.RegId, name || "Parsed Row");
            activeKnot = null;
            continue;
        }

        const knotMatch = line.match(/^KNOT:/i);
        if (knotMatch) {
            if (activePlan !== null && activeRow === null) { console.warn(`WDL Warning: KNOT hit inside plan without active ROW at line ${i + 1}`); continue; }

            // If we are in SUMMARY: block, activeKnot already points to the summary knot.
            // If we are in a ROW, we create a new one.
            if (activeRow !== null) {
                activeKnot = wdl_addKnot(activeRow.RegId, "", "", Knot_Type.USER_PROMPT_NO_CONTEXT);
            }
            continue;
        }

        const promptMatch = line.match(/^PROMPT:\s*(.*)$/i);
        if (promptMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: PROMPT hit without active KNOT at line ${i + 1}`); continue; }
            const txt = promptMatch[1].replace(/^"/, '').replace(/"$/, ''); // Strip leading/trailing quotes on same line
            d2(d3(activeKnot.TC).prompt).content = txt;
            multiLineState = "PROMPT"; // Track in case it bleeds to next lines
            continue;
        }

        const responseMatch = line.match(/^RESPONSE:\s*(.*)$/i);
        if (responseMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: RESPONSE hit without active KNOT at line ${i + 1}`); continue; }
            const txt = responseMatch[1].replace(/^"/, '').replace(/"$/, '');
            d2(d3(activeKnot.TC).response).content = txt;
            multiLineState = "RESPONSE";
            continue;
        }

        // --- Hyper_Three_Cell Configuration Directives ---

        const typeMatch = line.match(/^TYPE:\s*(.*)$/i);
        if (typeMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: TYPE hit without active KNOT at line ${i + 1}`); continue; }
            const val = typeMatch[1].replace(/^"|"$/g, '').trim();
            // Accept either the enum key name or its value
            if (Knot_Type[val] !== undefined) {
                activeKnot.knotType = Knot_Type[val];
            } else {
                activeKnot.knotType = val;
            }
            continue;
        }

        const ctxSrcMatch = line.match(/^CONTEXT_SOURCE:\s*(.*)$/i);
        if (ctxSrcMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: CONTEXT_SOURCE hit without active KNOT at line ${i + 1}`); continue; }
            const val = ctxSrcMatch[1].replace(/^"|"$/g, '').trim();
            if (!activeKnot.sourceContextKnotIds) activeKnot.sourceContextKnotIds = [];
            activeKnot.sourceContextKnotIds.push(val);
            continue;
        }

        const pmtSrcMatch = line.match(/^PROMPT_SOURCE:\s*(.*)$/i);
        if (pmtSrcMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: PROMPT_SOURCE hit without active KNOT at line ${i + 1}`); continue; }
            const val = pmtSrcMatch[1].replace(/^"|"$/g, '').trim();
            if (!activeKnot.sourcePromptKnotIds) activeKnot.sourcePromptKnotIds = [];
            activeKnot.sourcePromptKnotIds.push(val);
            continue;
        }

        const promptFnMatch = line.match(/^PROMPT_FN:\s*(.*)$/i);
        if (promptFnMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: PROMPT_FN hit without active KNOT at line ${i + 1}`); continue; }
            activeKnot.requestCallbackId = promptFnMatch[1].replace(/^"|"$/g, '').trim();
            continue;
        }

        const ctxFnMatch = line.match(/^CONTEXT_FN:\s*(.*)$/i);
        if (ctxFnMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: CONTEXT_FN hit without active KNOT at line ${i + 1}`); continue; }
            activeKnot.contextCallbackId = ctxFnMatch[1].replace(/^"|"$/g, '').trim();
            continue;
        }

        const respFnMatch = line.match(/^RESPONSE_FN:\s*(.*)$/i);
        if (respFnMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: RESPONSE_FN hit without active KNOT at line ${i + 1}`); continue; }
            activeKnot.responseCallbackId = respFnMatch[1].replace(/^"|"$/g, '').trim();
            continue;
        }

        const jsonMatch = line.match(/^FORCE_JSON:\s*(.*)$/i);
        if (jsonMatch) {
            if (!activeKnot) { console.warn(`WDL Warning: FORCE_JSON hit without active KNOT at line ${i + 1}`); continue; }
            const val = jsonMatch[1].replace(/^"|"$/g, '').trim().toLowerCase();
            activeKnot.forceJsonOutput = (val === 'true' || val === '1' || val === 'yes');
            continue;
        }

    }

    console.log("[WDL Compiler] Compilation finished. Returning activeWish:", activeWish);
    return activeWish;
}

// ============================================================================
// SECTION 3: WDL EMISSION (Seven_Wish -> Raw Text)
// ============================================================================

export function wdlEmit(sevenWishRegId) {
    const wish = typeof d7 === 'function' ? d7(sevenWishRegId) : null;
    if (!wish) return "// Invalid Wish RegId\n";

    let out = `WISH: "${wish.name}"\n\n`;

    const emitPlan = (planId, label) => {
        const plan = d6(planId);
        if (!plan) return;
        out += `  ${label}:\n`;
        plan.steps.forEach(choiceId => {
            const ch = d5(choiceId);
            if (!ch) return;
            out += `    CHOICE: "${ch.name}"\n`;
            ch.branches.forEach(rowId => {
                const row = d4(rowId);
                if (!row) return;
                out += `      ROW: "${row.name}"\n`;
                row.sequence.forEach(knotId => {
                    const knot = typeof k1 === 'function' ? k1(knotId) : null;
                    if (!knot) return;
                    out += `        KNOT:\n`;
                    // Emit HTC configuration attributes
                    if (knot.knotType) out += `          TYPE: "${knot.knotType}"\n`;
                    if (knot.requestCallbackId && knot.requestCallbackId !== 'none') out += `          PROMPT_FN: "${knot.requestCallbackId}"\n`;
                    if (knot.contextCallbackId && knot.contextCallbackId !== 'none') out += `          CONTEXT_FN: "${knot.contextCallbackId}"\n`;
                    if (knot.responseCallbackId && knot.responseCallbackId !== 'none') out += `          RESPONSE_FN: "${knot.responseCallbackId}"\n`;
                    if (knot.forceJsonOutput) out += `          FORCE_JSON: true\n`;
                    if (knot.sourceContextKnotIds && knot.sourceContextKnotIds.length > 0) {
                        knot.sourceContextKnotIds.forEach(addr => { out += `          CONTEXT_SOURCE: "${addr}"\n`; });
                    }
                    if (knot.sourcePromptKnotIds && knot.sourcePromptKnotIds.length > 0) {
                        knot.sourcePromptKnotIds.forEach(addr => { out += `          PROMPT_SOURCE: "${addr}"\n`; });
                    }
                    const cell = d3(knot.TC);
                    if (cell) {
                        const pTxt = d2(cell.prompt).content;
                        if (pTxt) out += `          PROMPT: "${pTxt.replace(/\n/g, '\\n')}"\n`;
                        const rTxt = d2(cell.response).content;
                        if (rTxt) out += `          RESPONSE: "${rTxt.replace(/\n/g, '\\n')}"\n`;
                    }
                });
            });
        });
        out += '\n';
    };

    emitPlan(wish.decomposition, "DIAGNOSIS");
    emitPlan(wish.recomposition, "PROGNOSIS");

    if (wish.summary && typeof k1 === 'function' && k1(wish.summary)) {
        out += `  SUMMARY:\n`;
        out += `    KNOT:\n`;
        const cell = d3(k1(wish.summary).TC);
        if (cell) {
            const pTxt = d2(cell.prompt).content;
            if (pTxt) out += `      PROMPT: "${pTxt.replace(/\n/g, '\\n')}"\n`;
            const rTxt = d2(cell.response).content;
            if (rTxt) out += `      RESPONSE: "${rTxt.replace(/\n/g, '\\n')}"\n`;
        }
    }

    return out;
}

// ============================================================================
// SECTION 4: UI INTEGRATION WRAPPERS
// ============================================================================

import { recoalesceAndRenderAll } from '../renderers/tableRenderer.js';

export function wdlShadowUpdate() {
    try {
        const outputArea = document.getElementById('qdl-live-output');
        if (outputArea && DynamicTableState.scenario) {
            outputArea.value = wdlEmit(DynamicTableState.scenario.RegId);
        }
    } catch (e) {
        console.error("WDL Shadow Update error:", e);
    }
}

export function applyWDL() {
    console.log("[applyWDL] Button clicked. Fetching text area...");
    const inputArea = document.getElementById('wdltext');
    if (!inputArea || !inputArea.value.trim()) {
        console.warn("[applyWDL] Failed: inputArea missing or empty.");
        alert("No WDL text to apply.");
        return;
    }

    try {
        console.log("[applyWDL] Initiating compile instruction set...");
        const newWish = wdlCompileInstructionSet(inputArea.value);
        if (newWish) {
            console.log("[applyWDL] Target newWish successfully compiled:", newWish);
            DynamicTableState.scenario = newWish;
            recoalesceAndRenderAll(DynamicTableState);
            console.log("[applyWDL] WDL rendered to table successfully.");
        } else {
            console.error("[applyWDL] Compiler returned null. Syntax failure.");
        }
    } catch (e) {
        alert("WDL Error: " + e.message);
        console.error("[applyWDL] Critical WDL Apply Error:", e);
    }
}

// ============================================================================
// SECTION 5: ARCHITECTURAL DECOMPOSITION CALLBACKS & PROMPTS
// ============================================================================

export var processingCallbacks = {
    /* append suffix to prom pt instructing performance by model
@param {string}
@returns {string}	*/
    "none": (prompt, template = {}, ob2 = {}) => { return prompt; },
    "addCoderSuffix": (promptContent, obj = {}, obj2 = {}) => { return promptContent + "Provide your code as a single code block without additional supporting paragraphs."; },
    /**
     * Appends a suffix for mathematical solutions.
     * @param {string} pmptstr - The original prompt.
     * @param {object} data - Associated data object.
     * @param {object} obj2 - Secondary context object.
     * @returns {string} The interpolated prompt.
     */
    "INPUTinterpolateTemplate": (pmptstr, data = {}, obj2 = {}) => {
        //presently inserts pmpt into template... should replaceinsert object.elements into pmpt.  
        return interpolatePrompt(pmptstr, data, obj2);
        /*
        const prompt = JSON.stringify(pmpt);
        if(template && template.includes(`{{INPUT}}`)){
            return template.replace('{{INPUT}}', prompt);
        } return prompt;*/
    },
    /**
     * Example callback: appends a math step-by-step instruction to the prompt.
     */
    "addMathSuffix": (promptContent, template = {}, obj1 = {}) => { return promptContent + "solve the following math problem step-by-step. Dont use LaTeX."; },

	"WDLmoralVerification": (responseText, parsedJsonObj, contextObj) => {
		const originKnot = contextObj && contextObj.htcAddr ? wdl_getKnotFromHTC(contextObj.htcAddr) : null;
		if (originKnot) {
			const orthoRow = typeof d4 === 'function' ? d4(originKnot.parentTrackId) : null;
			if (orthoRow && orthoRow.parentChoiceId !== null) {
				const judgement = typeof d5 === 'function' ? d5(orthoRow.parentChoiceId) : null;
				if (judgement && judgement.parseRawVerdict) {
					judgement.parseRawVerdict(responseText);
				}
			}
		}
		return responseText;
	},

    /**
     * Extract code within triple back ticks.
     */
    "extractCodeBlocks": (responseContent, template = {}, obj2 = {}) => { return extractCodeBlocks(responseContent); },
    /**
     * Removes thinking tags (<think>...</think>) from the response string.
     */
    "truncateThinking": (responseText, template = {}, obj = {}) => { return truncateThinkingTags(responseText); },
    /**
     * Extracts code blocks from a child's response and appends them to the parent's prompt accumulation. 
     * Used by Phase 2 Recomposition Architect Knots.
     */
    "concat_child_code": (currentPrompt, childResponse, contextObj) => {
        const code = extractCodeBlocks(childResponse);
        let sourceLabel = contextObj.sourceKnotAddress || "UNKNOWN";
        if (contextObj.sourceKnotAddress) {
            const sourceKnotId = resolveKnotAddress(contextObj.sourceKnotAddress, contextObj.knot, contextObj.quipu);
            if (sourceKnotId !== null) {
                const sKnot = k1(sourceKnotId);
                const sStrand = s1(sKnot.parentStrandId);
                if (sStrand) sourceLabel = sStrand.name;
            }
        }

        if (code) {
            return `${currentPrompt}\n\n<Component source="${sourceLabel}">\n\`\`\`\n${code}\n\`\`\`\n</Component>`;
        }
        return `${currentPrompt}\n\n<Component source="${sourceLabel}">\n${childResponse}\n</Component>`;
    },
    /**
     * Callback to consume a JSON curriculum array and spawn a strand of child knots for each subject topic.
     */
    "populationStrandFromCurriculum": (jsonString, obj = {}, contextObject = {}) => {
        const { knot: knotRegId, quipu: quipuRegId } = contextObject;
        if (knotRegId === undefined || quipuRegId === undefined) {
            return "[CALLBACK ERROR: Context is missing knot or quipu reference.]";
        }
        const currentKnot = k1(knotRegId);
        const parentStrand = s1(currentKnot.parentStrandId);
        if (!parentStrand) {
            return "[CALLBACK ERROR:  Could not find parent strand.]";
        }
        let curriculum;
        try {
            curriculum = JSON.parse(jsonString);
            if (!curriculum || !Array.isArray(curriculum.subjects)) {
                throw new Error("Invalid structure: 'subjects' array is missing");
            }
        } catch (e) {
            console.error("Failed to parse curriculum JSON:", e);
            return `[CALLBACK ERROR: Failed to parse curriculum JSON. ${e.message}]`;
        }

        let topicsCount = 0;
        curriculum.subjects.forEach(subject => {
            if (subject && Array.isArray(subject.topics)) {
                subject.topics.forEach(topic => {
                    if (topic && topic.name && topic.summary) {
                        parentStrand.addKnot();
                        const newKnotRegId = parentStrand.knots[parentStrand.knots.length - 1];
                        const newKnot = k1(newKnotRegId);
                        const newKnotPrompt = d2(d3(newKnot.TC).prompt);
                        newKnotPrompt.content = `explain this topic in more detail: \n\nTopic: ${topic.name}\n Summary: ${topic.summary}`;
                        newKnot.knotType = Knot_Type.USER_PROMPT_OWN_STRAND_HISTORY;
                        topicsCount++;
                    }
                });
            }
        });

    }
    ,
    "interpolateDecompositionFromParent": (promptText, sourceResponseContent, contextObj) => {
        // Find the specific component within the parent's spec and interpolate into the prompt template
        if (!contextObj || !contextObj.knot) return promptText;
        const knotId = contextObj.knot;
        const knot = typeof k1 === 'function' ? k1(knotId) : null;
        if (!knot || knot.parentTrackId === null) return promptText;

        const childRow = d4(knot.parentTrackId);
        if (!(childRow instanceof Four_Component)) return promptText;

        // Use the clean name from KnowledgeNode (no UID suffix) for matching against JSON spec
        const rowName = (childRow.knowledgeNode && childRow.knowledgeNode.label) ? childRow.knowledgeNode.label : childRow.name;

        // --- KnowledgeNode Traversal ---
        // Traverse UP: childRow → parentChoiceId (Five_Parallel) → parentTrackId → grandparent Four_Component
        // The grandparent's knowledgeNode.rawJsonResponse holds the clean parsed spec
        let parentJson = null;

        if (childRow.parentChoiceId !== null && childRow.parentChoiceId !== undefined) {
            const parentChoice = d5(childRow.parentChoiceId);
            if (parentChoice && parentChoice.parentTrackId !== null && parentChoice.parentTrackId !== undefined) {
                const grandparentRow = d4(parentChoice.parentTrackId);
                if (grandparentRow && grandparentRow instanceof Four_Component && grandparentRow.knowledgeNode && grandparentRow.knowledgeNode.rawJsonResponse) {
                    parentJson = grandparentRow.knowledgeNode.rawJsonResponse;
                    console.log(`[interpolateDecomp] 🧠 Retrieved spec from grandparent KnowledgeNode: "${grandparentRow.name}"`);
                }
            }
        }

        // Fallback: re-parse the raw LLM response only if KnowledgeNode path failed
        if (!parentJson) {
            console.warn(`[interpolateDecomp] ⚠️ KnowledgeNode path failed for "${rowName}". Falling back to raw response parsing.`);
            try {
                if (typeof sourceResponseContent === 'string') {
                    const parsedList = typeof extractJsonObject === 'function' ? extractJsonObject(sourceResponseContent) : [JSON.parse(sourceResponseContent)];
                    parentJson = parsedList.length > 0 ? parsedList[0] : null;
                } else if (typeof sourceResponseContent === 'object') {
                    parentJson = sourceResponseContent;
                }
            } catch (e) { console.error("[interpolateDecomp] parse error:", e); return promptText; }
        }

        if (!parentJson || !parentJson.subcomponents || !Array.isArray(parentJson.subcomponents)) {
            console.error(`[interpolateDecomp] ❌ No subcomponents array found for "${rowName}".`);
            return promptText;
        }

        // Match the subcomponent by name (case-insensitive)
        const match = parentJson.subcomponents.find(c => c.name && c.name.toLowerCase() === rowName.toLowerCase());

        // --- Diagnostic extraction: log missing expected fields ---
        let compName = " ";
        let compRole = " ";
        let parentSystem = " ";
        let parentBoundary = " ";

        if (!match) {
            console.warn(`[interpolateDecomp] ⚠️ No match for rowName="${rowName}" in ${parentJson.subcomponents.length} subcomponents. Available: [${parentJson.subcomponents.map(c => c.name).join(', ')}]`);
        } else {
            if (!match.name) console.warn(`[interpolateDecomp] ⚠️ match found but match.name is missing`);
            else compName = match.name;

            if (!match.role) console.warn(`[interpolateDecomp] ⚠️ match.role is missing for "${compName}"`);
            else compRole = match.role;
        }

        if (!parentJson.component_name) console.warn(`[interpolateDecomp] ⚠️ parentJson.component_name is missing`);
        else parentSystem = parentJson.component_name;

        if (!parentJson.boundary_conditions) console.warn(`[interpolateDecomp] ⚠️ parentJson.boundary_conditions is missing`);
        else parentBoundary = JSON.stringify(parentJson.boundary_conditions);

        const dataObj = {
            COMPONENT_NAME: compName,
            COMPONENT: compName,
            component: compName,
            component_name: compName,
            COMPONENT_ROLE: compRole,
            PARENT_SYSTEM: parentSystem,
            PARENT_BOUNDARY: parentBoundary
        };

        if (typeof interpolatePrompt === 'function') {
            return interpolatePrompt(promptText, dataObj);
        }
        return promptText;
    },
    "WDLsensibleRecursiveDecomposition": (responseText, parsedJsonObj = {}, contextObj = {}) => {
        return WDLsensibleRecursiveDecomposition(responseText, parsedJsonObj, contextObj);
    },
    "WDLexpoundIgnite": (responseText, parsedJsonObj = {}, contextObj = {}) => {
        return WDLexpoundIgnite(responseText, parsedJsonObj, contextObj);
    }
};



/**
 * Applies a named response callback function to the raw content from the LLM. 
 * @param {string} rawContentString - The raw text response from the ollama API. 
 * @param {string|object} rawContentObject - Potentially JSON-parseable response.
 * @param {object} contextObj - Metadata Context.
 * @param {string} callbackId - The key of the function in the processing callbacks. 
 * @returns {string} The transformed content.
 */
export function applyResponseCallback(rawContentString = "", rawContentObject = "", contextObj = {}, callbackId = "none") {
    let del = rawContentString;
    if (callbackId && callbackId !== "none" && processingCallbacks[callbackId]) {
        try {
            let ore = extractJsonObject(rawContentObject);
            for (let i = 0; i < ore.length; i++) {
                del = processingCallbacks[callbackId](del, ore[i], contextObj);
            }

        } catch (e) {
            if (typeof processingCallbacks[callbackId] === 'function') {
                // Fallback to straight string-to-string replacement
                del = processingCallbacks[callbackId](del, rawContentObject, contextObj);
            } else {
                console.error(`Error applying response callback "${callbackId}": `, e);
                return `[CALLBACK ERROR: ${e.message}]`;
            }
        }
    }
    return del;
}

/**
 * Applies a named response callback function.
 */
export function DELETE_THIS_applyResponseCallback(rawContentString = "", rawContentObject = "", contextObj = {}, callbackId = "none") {
    let del = rawContentString;
    if (callbackId && callbackId !== "none" && processingCallbacks[callbackId]) {
        try {
            // If it's a known function that expect parsed object, pass it
            del = processingCallbacks[callbackId](del, rawContentObject, contextObj);
        } catch (e) {
            console.error(`Error applying response callback "${callbackId}": `, e);
        }
    }
    return del;
}

/**
 * Builds the initial prompt for decomposing a subsystem by injecting the component data into the SENSIBLE_DECOMPOSITION template.
 * @param {object} component             - the child component JSON definition
 * @param {string} parentSystemName      - name of the parent resolving this component
 * @param {string} boundaries_of_system  - restrictions/boundaries from the parent context
 * @returns {string} The fully formed decomposition prompt
 */
export function buildDecompositionPrompt(component, parentSystemName, boundaries_of_system) {
    const compName = component.name || component.component_name || `Component`;
    const compRole = component.role || "";

    const templateEntry = Prompt_engines.find(e => e.name === "SENSIBLE_DECOMPOSITION_PROMPT_TEMPLATE");
    if (!templateEntry) {
        console.error("[buildDecompositionPrompt] SENSIBLE_DECOMPOSITION_PROMPT_TEMPLATE not found in Prompt_engines!");
        return `Decompose ${compName} within ${parentSystemName}.`;
    }
    return templateEntry.string
        .replace(/\{\{COMPONENT_NAME\}\}/g, compName)
        .replace(/\{\{COMPONENT_ROLE\}\}/g, compRole)
        .replace(/\{\{PARENT_BOUNDARY\}\}/g, boundaries_of_system || "implicit bounds")
        .replace(/\{\{PARENT_SYSTEM\}\}/g, parentSystemName);
}

/**
 * Renders a full structured code-generation prompt from a KnowledgeNode.
 * @param {KnowledgeNode} knowledgeNode - The KnowledgeNode of the component to implement.
 * @param {string} targetLanguage - e.g. "JavaScript", "Python", "TypeScript".
 * @returns {string} The fully rendered prompt string.
 */
export function buildCodeGenerationPrompt(knowledgeNode, targetLanguage) {
    const lines = [];
    const arr = (v) => (Array.isArray(v) ? v : []);
    const spec = (knowledgeNode && knowledgeNode.rawJsonResponse) ? knowledgeNode.rawJsonResponse : {};
    const compName = knowledgeNode ? knowledgeNode.label : (spec.component_name || "");
    // console.log(`XXX2343 ${typeof spec} is ${JSON.stringify(spec)}`);
    // console.log(`XXX2343 ${typeof knowledgeNode?.rawJsonResponse} is ${JSON.stringify(knowledgeNode?.rawJsonResponse)}`);

    lines.push(`Role:\nAct as a junior software engineer tasked with implementing a concrete software component from a formal system specification.\n`);
    lines.push(`Your goal:\nTranslate the structured JSON specification into clean, working, production-quality code.\n`);
    lines.push(`Constraints:\n- Do not invent features outside the JSON boundary_conditions.included.\n- Do not implement anything listed under boundary_conditions.excluded.\n- Use only the declared inputs, outputs, state_variables, and functions.\n- Ensure failure_modes are handled defensively where applicable.\n- Code must be internally consistent and runnable.\n- No explanatory prose outside code.\n- Include minimal comments explaining how each JSON field influenced implementation.\n- Target language: ${targetLanguage}\n`);
    lines.push(`Provide type-safe documentation about function parameters.\n`);
    lines.push(`SPECIFICATION INTERPRETATION WITH VALUES\n`);

    lines.push(`component_name:\nVALUE: ${compName}\n`);
    lines.push(`parent_system:\nVALUE: ${spec.parent_system || ''}\n`);
    lines.push(`definition:\nVALUE: ${spec.definition || ''}\n`);
    lines.push(`type:\nVALUE: ${spec.type || ''}\n`);

    const bc = spec.boundary_conditions || {};
    lines.push(`boundary_conditions.included:\nVALUE:`);
    arr(bc.included).forEach(item => lines.push(`- ${item}`));
    lines.push(``);

    lines.push(`boundary_conditions.excluded:\nVALUE:`);
    arr(bc.excluded).forEach(item => lines.push(`- ${item}`));
    lines.push(``);

    lines.push(`subcomponents:`);
    arr(spec.subcomponents).forEach(comp => {
        lines.push(`- ${comp.name || ''} (${comp.role || ''}) [Implementable: ${comp.is_implementable}]`);
    });

    const ib = spec.internal_behaviour || {};
    lines.push(`internal_behaviour.inputs:`);
    arr(ib.inputs).forEach(i => lines.push(`- ${i}`));
    lines.push(`internal_behaviour.outputs:`);
    arr(ib.outputs).forEach(o => lines.push(`- ${o}`));
    lines.push(`internal_behaviour.state_variables:`);
    arr(ib.state_variables).forEach(s => lines.push(`- ${s}`));
    lines.push(`internal_behaviour.functions:`);
    arr(ib.functions).forEach(f => lines.push(`- ${f}`));

    lines.push(`failure_modes:`);
    arr(spec.failure_modes).forEach(fm => lines.push(`- ${fm}`));

    // Include mermaid causality graph if available
    if (knowledgeNode && knowledgeNode.mermaidGraph) {
        lines.push(`\n────────────────────────\nCAUSALITY GRAPH\n${knowledgeNode.mermaidGraph}`);
    }

    lines.push(`────────────────────────\nOUTPUT CONTRACT\n\nReturn only valid ${targetLanguage} code.\nNo markdown.\nNo explanation outside code.`);

    return lines.join('\n');
}

/**
 * Renders a full structured system architect prompt from a KnowledgeNode.
 * @param {KnowledgeNode} knowledgeNode - The KnowledgeNode of the parent system.
 * @param {string} targetLanguage - e.g. "JavaScript", "Python", "TypeScript".
 * @returns {string} The fully rendered prompt string.
 */
export function buildSystemArchitectPrompt(knowledgeNode, targetLanguage) {
    const lines = [];
    const arr = (v) => (Array.isArray(v) ? v : []);
    const spec = (knowledgeNode && knowledgeNode.rawJsonResponse) ? knowledgeNode.rawJsonResponse : {};
    const compName = knowledgeNode ? knowledgeNode.label : (spec.component_name || "");

    lines.push(`Role:\nAct as a senior software architect responsible for integrating multiple implemented components into a unified, production-grade system.\n`);
    lines.push(`Your objective:\nPlan the best way to amalgamate the provided child component implementations into a single coherent system.\n`);
    lines.push(`Target language: ${targetLanguage}\n`);

    lines.push(`component_name: ${compName}\n`);
    lines.push(`definition: ${spec.definition || ''}\n`);

    // List subcomponents from JSON spec
    lines.push(`subcomponents (from spec):`);
    arr(spec.subcomponents).forEach(comp => {
        lines.push(`- ${comp.name || ''} (${comp.role || ''})`);
    });

    // List child dependencies from KnowledgeNode graph (authoritative names)
    if (knowledgeNode && knowledgeNode.dependencies && knowledgeNode.dependencies.length > 0) {
        lines.push(`\nchild modules (from knowledge graph):`);
        knowledgeNode.dependencies.forEach(childKN => {
            lines.push(`- ${childKN.label || 'unnamed'}`);
        });
    }

    // Include mermaid causality graph if available
    if (knowledgeNode && knowledgeNode.mermaidGraph) {
        lines.push(`\n────────────────────────\nCAUSALITY GRAPH\n${knowledgeNode.mermaidGraph}`);
    }

    lines.push(`────────────────────────\nOUTPUT CONTRACT\n\nReturn architectural integration code. No markdown.`);

    return lines.join('\n');
}

export function WDLexpoundIgnite(responseText, parsedJsonObj = {}, contextObj = {}) {
    const knotRegId = contextObj.htcAddr ? contextObj.htcAddr[4] : contextObj.knot;
    console.log(`[WDLexpoundIgnite] 🟢 ENTRY: Processing expound for Knot ID: ${knotRegId}`);

    if (Array.isArray(parsedJsonObj) && parsedJsonObj.length > 0) {
        parsedJsonObj = parsedJsonObj[0];
    }

    const originKnot = k1(knotRegId);
    if (!originKnot) {
        console.error(`[WDLexpoundIgnite] ❌ CRITICAL: Could not find origin knot object for ID: ${knotRegId}`);
        return responseText;
    }

    const topicName = parsedJsonObj.refined_goal || parsedJsonObj.expounded_wish || parsedJsonObj.original_wish || "Unknown System";
    console.log(`[WDLexpoundIgnite] Refined topic: ${topicName}`);

    const parentRow = d4(originKnot.parentTrackId);
    if (parentRow && typeof parentRow.name === 'string') {
        parentRow.name = "Refined: " + topicName;
    }

    const seedComponent = {
        name: topicName,
        role: "Root System",
        is_implementable: false,
        type: "System"
    };

    const promptText = buildDecompositionPrompt(seedComponent, " ", " ");
    const knot = wdl_addKnot(parentRow.RegId, promptText, "", Knot_Type.USER_PROMPT_OTHER_KNOT_HISTORY);
    knot.responseCallbackId = "WDLsensibleRecursiveDecomposition";

    if (window.DecompositionWaveFront) {
        window.DecompositionWaveFront.push({ type: 'knot', id: knot.RegId });
    } else {
        window.DecompositionWaveFront = [{ type: 'knot', id: knot.RegId }];
    }

    return responseText;
}

/**
 * Main WDL Architectural Decomposition Callback.
 * Responds to LLM JSON output by spawning parallel branches in the Six_Plan.
 */
export function WDLsensibleRecursiveDecomposition(responseText, parsedJsonObj = {}, contextObj = {}) {
    const knotRegId = contextObj.htcAddr ? contextObj.htcAddr[4] : contextObj.knot;
    console.log(`[WDLsensibleDecomp] 🟢 ENTRY: Processing decomposition for Knot ID: ${knotRegId}`);

    // Safety check: if parsedJsonObj is an array (due to extractJsonObject return type), take first element.
    if (Array.isArray(parsedJsonObj) && parsedJsonObj.length > 0) {
        parsedJsonObj = parsedJsonObj[0];
    }

    const originKnot = k1(knotRegId);
    if (!originKnot) {
        console.error(`[WDLsensibleDecomp] ❌ CRITICAL: Could not find origin knot object for ID: ${knotRegId}`);
        return responseText;
    }
    console.log(`[WDLsensibleDecomp] originKnot.parentTrackId: ${originKnot.parentTrackId}`);

    if (knotRegId === undefined) {
        console.warn("[WDLsensibleDecomp] ❌ Missing knot context.");
        return responseText;
    }

    const parentSystemName = parsedJsonObj.noun
        || parsedJsonObj.component_name
        || parsedJsonObj.name
        || "Unknown System";

    // --- Token Conservation ---
    // Moved after parentSystemName resolution to provide better labeling for purged content.
    const originCell = d3(originKnot.TC);
    if (originCell) {
        const originPrompt = d2(originCell.prompt);
        if (originPrompt && originPrompt.content && originPrompt.content.length > 50) {
            console.log(`[WDLsensibleDecomp] 💎 Token conservation: Purging prompt context for "${parentSystemName}" (${knotRegId})`);
            originPrompt.content = `[Decomposition Context for: ${parentSystemName}]`;
        }
    }

    const components = parsedJsonObj.components
        || parsedJsonObj.subcomponents
        || (parsedJsonObj.internal_behaviour && parsedJsonObj.internal_behaviour.subcomponents)
        || [];

    const boundaries_of_system = parsedJsonObj.boundary_conditions || "";

    console.log(`[WDLsensibleDecomp] Parsed parent: "${parentSystemName}". Found ${components.length} subcomponents.`);

    // --- TERMINATION LIMIT ---
    const currentTotalRows = typeof FourRowArray !== 'undefined' ? FourRowArray.length : 0;
    const limit = (typeof window.decomp_strand_limit !== 'undefined' && !isNaN(window.decomp_strand_limit)) ? window.decomp_strand_limit : 1024;

    if (currentTotalRows >= limit) {
        console.warn(`[WDLsensibleDecomp] 🛑 LIMIT REACHED: (${currentTotalRows}/${limit}). Stopping.`);
        return responseText;
    }

    if (!Array.isArray(components) || components.length === 0) {
        console.log(`[WDLsensibleDecomp] 🍂 LEAF CASE: No subcomponents for "${parentSystemName}".`);
        return responseText;
    }

    // --- Establish the WDL Parent Architecture ---
    const parentFourRowId = originKnot.parentTrackId;
    console.log(`[WDLsensibleDecomp] Targeting parentFourRowId: ${parentFourRowId}`);
    const parentRow = d4(parentFourRowId);
    if (!parentRow) {
        console.error(`[WDLsensibleDecomp] ❌ CRITICAL: Parent row with ID ${parentFourRowId} not found in FourRowArray.`);
        return responseText;
    }

    const model = (originKnot && d3(originKnot.TC)) ? d3(originKnot.TC).model : "rnj-1:8b";

    // Terminate the row with a new Judgement point representing the recursive split and moral verification
    const newChoice = wdl_terminateRowWithJudgement(parentFourRowId, `Decomp: ${parentSystemName}`);
    if (!newChoice) return responseText;

    const parentAddressStr = contextObj.htcAddr ? contextObj.htcAddr.join(',') : (wdl_getHTCaddr(knotRegId) || []).join(',');
    const ancestorAddresses = [...(originKnot.sourceContextKnotIds || [])];
    ancestorAddresses.push(parentAddressStr);

    console.log(`[WDLsensibleDecomp] 🌳 BRANCHING: System "${parentSystemName}" splitting into ${components.length} parallel paths.`);

    for (const component of components) {
        const compName = component.name || component.component_name || `Component`;

        // Refined Leaf Detection:
        // is_implementable: true if it fits in ~100 lines/2000 tokens.
        // type: "physical" if it's a concrete software artifact.
        const isImplementable = component.is_implementable === true || component.is_implementable === "true";
        const isPhysicalType = component.type && component.type.toLowerCase() === "physical";

        // A leaf is ONLY something that is BOTH implementable and physical.
        // Everything else (abstract, system, etc.) requires further decomposition.
        const isLeaf = isImplementable && isPhysicalType;

        // Instead of hard-coding the prompt text, assign the raw template.
        // It will be interpolated at execution time by 'interpolateDecompositionFromParent'
        const templateEntry = Prompt_engines.find(e => e.name === "SENSIBLE_DECOMPOSITION_PROMPT_TEMPLATE");
        const rawTemplateText = templateEntry ? templateEntry.string : "Decompose {{COMPONENT_NAME}} within {{PARENT_SYSTEM}}.";

        // Using Four_Component for better semantic tracking in WDL
        const newRow = new Four_Component(compName);
        newRow.parentChoiceId = newChoice.RegId;
        newChoice.addBranch(newRow.RegId);

        // Add knot to the component
        const knotClass = (typeof window !== 'undefined' && typeof window.KnotClass !== 'undefined') ? window.KnotClass : null;
        if (!knotClass) continue;

        const newKnot = new knotClass(newRow.RegId);
        newKnot.knotType = Knot_Type.SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_OTHER_KNOT_HISTORY; // Link to parent for interpolation context!

        const cell = d3(newKnot.TC);
        if (cell) {
            d2(cell.prompt).content = rawTemplateText;
            cell.model = model;
        }
        newRow.sequence.push(newKnot.RegId);

        // Configuration
        newKnot.responseCallbackId = isLeaf ? "none" : "WDLsensibleRecursiveDecomposition";
        newKnot.requestCallbackId = "interpolateDecompositionFromParent";
        newKnot.sourcePromptKnotIds = [knotRegId]; // The parent's address! 
        newKnot.sourceContextKnotIds = [...ancestorAddresses];

        // Store this child's individual component JSON on its own KnowledgeNode
        newRow.knowledgeNode.rawJsonResponse = component;

        // Form the structural edges for Bayesian aggregation
        if (parentRow && parentRow.knowledgeNode && newRow.knowledgeNode) {
            parentRow.knowledgeNode.addDependency(newRow.knowledgeNode);
        }

        console.log(`[WDLsensibleDecomp]   ├─ Branch Created: "${compName}" (Type: ${component.type}, Imp: ${isImplementable}) -> Leaf: ${isLeaf}`);
        console.log(`[WDLsensibleDecomp]   └─ New Choice ${newChoice.RegId} parentPlanId: ${newChoice.parentPlanId}`);
    }

    // After all components have been instantiated, append the Moral Verification Knot to the OrthoFourRow
    wdl_buildMoralVerificationKnot(newChoice.RegId, parentFourRowId, components);


    const causalityGraph = generateCausalityMermaid(parsedJsonObj);
    if (causalityGraph) {
        console.log(`[WDLsensibleDecomp] ⛓️ CAUSALITY GRAPH for ${parentSystemName}:\n${causalityGraph}`);
    }

    // --- KnowledgeNode Storage ---
    // The knowledge (spec, metrics, subcomponents) belongs to the parent node we just decomposed.
    const parentRowForK = d4(parentFourRowId);
    if (parentRowForK && parentRowForK.knowledgeNode) {
        parentRowForK.knowledgeNode.rawJsonResponse = parsedJsonObj;
        parentRowForK.knowledgeNode.mermaidGraph = causalityGraph;
        console.log(`[WDLsensibleDecomp] 🧠 Stored Decomposition Knowledge inside "${parentSystemName}"`);
    }

    // --- HyperHop Ontology Integration ---
    try {
        const hopRegId = generateOntoHop(parsedJsonObj, components, parentSystemName, causalityGraph, knotRegId);
        if (hopRegId && parentRowForK && parentRowForK.knowledgeNode) {
            parentRowForK.knowledgeNode.hopRegId = hopRegId;
        }

    } catch (e) {
        console.error("[WDLsensibleDecomp] ❌ Ontology Generation Error:", e);
    }
    console.log(`[WDLsensibleDecomp] ✅ SUCCESS: All ${newChoice.branches.length} subcomponents successfully added to Parallel Choice ${newChoice.RegId}.`);

    // Programmatically trigger a full WDL Table render
    if (typeof window.recoalesceAndRenderAll === 'function') window.recoalesceAndRenderAll();

    if (!window.DecompositionWaveFront) window.DecompositionWaveFront = [];
    window.DecompositionWaveFront.push({ type: 'parallel', id: newChoice.RegId });
    console.log(`[WaveFront] Pushed Five_Parallel ${newChoice.RegId} to explicit queue. Length: ${window.DecompositionWaveFront.length}`);

    return responseText;
}

/**
 * Generates a Mermaid causality graph from the structured decomposition JSON.
 * @param {object} parsedJsonObj - The JSON object containing subcomponents and interactions.
 * @returns {string} Mermaid.js graph definition.
 */
export function generateCausalityMermaid(parsedJsonObj) {
    if (!parsedJsonObj || !parsedJsonObj.synchronous_interactions) return "";

    let mermaid = "graph LR\n";
    const interactions = parsedJsonObj.synchronous_interactions || [];

    interactions.forEach(inter => {
        const parts = inter.participants || [];
        if (parts.length >= 2) {
            const from = `${parts[0].replace(/\s+/g, '_')}`;
            const to = `${parts[1].replace(/\s+/g, '_')}`;
            const type = inter.interaction_type || "interaction";
            mermaid += `    ${from} -- "${type}" --> ${to}\n`;
        }
    });

    return mermaid;
}

/**
 * Generates an ontology HyperHop for the decomposition step.
 * @param {object} parsedJsonObj - The decomposition JSON.
 * @param {Array} subcomponents - The list of child components.
 * @param {string} parentSystemName - Name of the parent system.
 * @param {string} causalityMermaid - The Mermaid graph string.
 * @param {number|string} knotRegId - The ID of the parent knot.
 */
export function generateOntoHop(parsedJsonObj, subcomponents, parentSystemName, causalityMermaid, knotRegId) {
    if (!ActiveDecompRecompState) {
        console.warn("[generateOntoHop] ActiveDecompRecompState not found. Skipping ontology export.");
        return;
    }

    // --- Locate the Active Argument (Six_Plan) ---
    const knot = k1(knotRegId);
    let activePlan = null;
    if (knot) {
        const track = d4(knot.parentTrackId);
        if (track) {
            const choice = d5(track.parentChoiceId);
            if (choice) { activePlan = d6(choice.parentPlanId); }
        }
    }
    if (!activePlan && DynamicTableState.scenario) {
        activePlan = d6(DynamicTableState.scenario.decomposition);
    }

    // Initialize Ontology instance
    if (!(ActiveDecompRecompState.ontologyExport instanceof Ontology)) {
        ActiveDecompRecompState.ontologyExport = new Ontology("WDL Decomposition Ontology");
    }
    const ont = ActiveDecompRecompState.ontologyExport;

    // 1. Resolve Predicates
    const getPredicate = (name) => {
        let id = ont.predicates.triplet.find(pid => dP(pid)?.name === name);
        if (id === undefined) {
            const p = new TripletPredicate(name);
            ont.predicates.triplet.push(p.RegId);
            id = p.RegId;
        }
        return id;
    };
    const isPredId = getPredicate("is");
    const containsPredId = getPredicate("contains");

    // 2. Resolve Concepts
    const getConcept = (name) => {
        let id = ont.concepts.find(cid => dC(cid)?.name === name);
        if (id === undefined) {
            const c = new Concept(name);
            ont.concepts.push(c.RegId);
            id = c.RegId;
        }
        return id;
    };
    const parentId = getConcept(parentSystemName);
    const parentType = parsedJsonObj.type || "System";
    const parentTypeId = getConcept(parentType);

    // 3. Resolve/Create Events
    const getEvent = (srcId, predId, tgtId) => {
        let id = ont.graph.events.find(eid => {
            const e = dE(eid);
            return e && e.triplet.source === srcId && e.triplet.predicate === predId && e.triplet.target === tgtId;
        });
        if (id === undefined) {
            const e = new Event(srcId, predId, tgtId);
            ont.addGraphElement('events', e.RegId);
            id = e.RegId;
        }
        return id;
    };

    const sourceEventIds = [];
    sourceEventIds.push(getEvent(parentId, isPredId, parentTypeId));

    const targetEventIds = [];
    subcomponents.forEach(comp => {
        const compName = comp.name || comp.component_name || "Component";
        const childId = getConcept(compName);
        const childType = comp.type || "Subcomponent";
        const childTypeId = getConcept(childType);

        sourceEventIds.push(getEvent(parentId, containsPredId, childId));
        targetEventIds.push(getEvent(childId, isPredId, childTypeId));
    });

    // 4. Create Hop
    const hop = new Hop(sourceEventIds, "AND", targetEventIds, {
        parentKnotId: knotRegId,
        mermaid: causalityMermaid
    });
    ont.addGraphElement('hops', hop.RegId);

    // 5. Link to Argument (Six_Plan)
    if (activePlan) {
        activePlan.addNode(hop.RegId);
        console.log(`[generateOntoHop] 🗳️ Added Hop ${hop.RegId} to Six_Plan "${activePlan.name}" argument nodes.`);
        // Ensure the argument is registered in the ontology
        if (!ont.graph.arguments.includes(activePlan.RegId)) {
            ont.addGraphElement('arguments', activePlan.RegId);
        }
    }
    console.log(`${hop.toJson()}`);
    return hop;
}

/**
 * Builds the reversed Recomposition Plan from a completed Decomposition Plan within the same Wish.
 * Uses post-order traversal to map Five_Parallel to Hyper_Five_Choice and attach Prompts.
 * @param {number} wishRegId 
 * @returns 
 */
export function buildWDLRecompositionPlan(wishRegId) {
    console.log(`[buildRecomp] 🟢 ENTRY with wishRegId: ${wishRegId}`);

    // DynamicTableState.scenario IS the wish object directly, not a RegId
    const wish = (typeof wishRegId === 'object' && wishRegId !== null) ? wishRegId : (typeof d7 === 'function' ? d7(wishRegId) : null);
    console.log(`[buildRecomp] wish resolved:`, wish);
    if (!wish) {
        console.error("buildWDLRecompositionPlan: Invalid Seven_Wish", wishRegId);
        return null;
    }
    console.log(`[buildRecomp] wish.decomposition = ${wish.decomposition}, wish.recomposition = ${wish.recomposition}`);

    const decompPlan = typeof d6 === 'function' ? d6(wish.decomposition) : null;
    console.log(`[buildRecomp] decompPlan:`, decompPlan);
    if (!decompPlan || !decompPlan.steps || decompPlan.steps.length === 0) {
        console.error("buildWDLRecompositionPlan: Decomposition plan is empty.", decompPlan);
        return null;
    }
    console.log(`[buildRecomp] decompPlan.steps:`, decompPlan.steps, `decompPlan.tracks:`, decompPlan.tracks);

    const recompPlan = typeof d6 === 'function' ? d6(wish.recomposition) : null;
    console.log(`[buildRecomp] recompPlan:`, recompPlan);
    if (!recompPlan) {
        console.error("buildWDLRecompositionPlan: Recomposition plan not initialized.");
        return null;
    }

    // Ensure recomposition plan is clean.
    recompPlan.steps = [];

    // Map: Decomposition Four_Component RegId -> Recomposition Four_Component RegId
    const rowMap = new Map();

    // Recursive function to collect nodes post-order (leaves first, roots last)
    const orderedRows = [];
    function traverse(choiceId) {
        console.log(`[buildRecomp]   traverse(choiceId=${choiceId})`);
        const choice = d5(choiceId);
        if (!choice) { console.warn(`[buildRecomp]   d5(${choiceId}) returned null`); return; }
        console.log(`[buildRecomp]   choice.branches:`, choice.branches);
        choice.branches.forEach(rowId => {
            const row = d4(rowId);
            if (!row) { console.warn(`[buildRecomp]     d4(${rowId}) returned null`); return; }
            console.log(`[buildRecomp]     row "${row.name}" (RegId=${row.RegId}), terminatingChoice=${row.terminatingChoice}`);
            if (row.terminatingChoice) {
                traverse(row.terminatingChoice);
            }
            orderedRows.push(row);
        });
    }

    traverse(decompPlan.steps[0]);
    console.log(`[buildRecomp] Post-order traversal complete. orderedRows.length = ${orderedRows.length}`);
    orderedRows.forEach((r, i) => console.log(`[buildRecomp]   [${i}] "${r.name}" (RegId=${r.RegId}, isLeaf=${!r.terminatingChoice})`));

    if (orderedRows.length === 0) { console.warn('[buildRecomp] No rows found! Aborting.'); return null; }

    // Use a single entry choice for the entire recomp plan starts
    const rootRecompChoice = wdl_addChoice(recompPlan.RegId, "Recomposition Start");
    console.log(`[buildRecomp] rootRecompChoice created: RegId=${rootRecompChoice.RegId}`);

    orderedRows.forEach(decompNode => {
        const isLeaf = !decompNode.terminatingChoice;

        const recompRow = new Four_Component(`Recomp: ${decompNode.name}`);
        // Share the decomp node's KnowledgeNode by reference (single source of truth)
        // Decomposition writes, Recomposition reads — safe to share.
        if (decompNode.knowledgeNode) {
            recompRow.knowledgeNode = decompNode.knowledgeNode;
        }
        rowMap.set(decompNode.RegId, recompRow.RegId);

        let knotClass = typeof window !== 'undefined' && typeof window.KnotClass !== 'undefined' ? window.KnotClass : null;
        if (!knotClass) knotClass = Knot; // Internal fallback
        /*XXX const newKnot = new Hyper_Three_Cell(recompRow.RegId); recompRow.sequence.push(newKnot);*/
        const newKnot = new knotClass(recompRow.RegId);
        recompRow.sequence.push(newKnot.RegId);

        const cell = d3(newKnot.TC);
        const originalKnotId = decompNode.sequence.length > 0 ? decompNode.sequence[decompNode.sequence.length - 1] : null;

        // --- KnowledgeNode Retrieval ---
        // The KnowledgeNode is the single source of truth for decomposition knowledge
        const kn = decompNode.knowledgeNode || null;
        const knLabel = kn ? kn.label : decompNode.name;

        if (kn && kn.rawJsonResponse) {
            const specSubCount = kn.rawJsonResponse.subcomponents ? kn.rawJsonResponse.subcomponents.length : 0;
            console.log(`[buildRecomp] 🧠 KnowledgeNode for "${knLabel}": ${specSubCount} subcomponents, ${kn.dependencies.length} child dependencies.`);
        } else {
            console.warn(`[buildRecomp] ⚠️ No KnowledgeNode spec for "${knLabel}". Prompts will use fallback.`);
        }

        const targetLang = (typeof window.ActiveDecompRecompState !== 'undefined' && window.ActiveDecompRecompState && window.ActiveDecompRecompState.targetLanguage) ? window.ActiveDecompRecompState.targetLanguage : "JavaScript";

        if (isLeaf) {
            recompRow.structuralHeight = 1; // Base leaves represent exactly 1 physical rendered Row
            // Leaf uses Code Generation prompt — pass KnowledgeNode directly
            newKnot.knotType = Knot_Type.USER_PROMPT_NO_CONTEXT;
            newKnot.responseCallbackId = 'extractCodeBlocks';
            const prompt = buildCodeGenerationPrompt(kn, targetLang) + fetchBayesianMemory(kn);
            if (cell) {
                d2(cell.prompt).content = prompt;
                cell.model = getModelForPipelineRole('leaf');
            }

            // Attach leaf row directly to root choice
            recompRow.parentChoiceId = rootRecompChoice.RegId;
            rootRecompChoice.addBranch(recompRow.RegId);
        } else {
            // Parent uses Two Knots



            // Prepare Parent merger via Reverse_Five_Parallel
            const mergeChoice = new Reverse_Five_Parallel(`Merge into ${decompNode.name}`);
            recompPlan.steps.push(mergeChoice.RegId);

            // Phase 1: Collect Context Array from all Executed Children Leaves
            const childContextIds = [];
            let heightAccumulator = 0; // Tally structural rowspan logic for the Table Renderer
            const decompParallel = d5(decompNode.terminatingChoice);
            if (decompParallel) {
                decompParallel.branches.forEach(childRowId => {
                    const childRecompRowId = rowMap.get(childRowId);
                    if (childRecompRowId) {
                        const childRecompRow = d4(childRecompRowId);
                        mergeChoice.addParentTrack(childRecompRow.RegId);
                        childRecompRow.terminatingChoice = mergeChoice.RegId;

                        heightAccumulator += (childRecompRow.structuralHeight || 1);

                        const lastChildKnotId = childRecompRow.sequence[childRecompRow.sequence.length - 1];
                        if (lastChildKnotId !== undefined) {
                            childContextIds.push(lastChildKnotId);
                        }
                    }
                });
            }

            mergeChoice.structuralHeight = heightAccumulator + 1; // Geometric constraint: sum of parents + 1 for own physical tr output
            mergeChoice.addBranch(recompRow.RegId);
            recompRow.parentChoiceId = mergeChoice.RegId;
            recompRow.structuralHeight = heightAccumulator + 1; // Inherit computed geometric constraints

            // Phase 2: Knot 1 - Architecture Advice (Now Context Aware)
            newKnot.knotType = Knot_Type.USER_PROMPT_OTHER_KNOT_HISTORY;
            newKnot.sourceContextKnotIds = [...childContextIds];
            newKnot.responseCallbackId = 'extractCodeBlocks';

            const childNames = kn ? kn.dependencies.map(dep => dep.label || 'unnamed') : [];
            const subcStr = childNames.length > 0 ? childNames.join(', ') : JSON.stringify((kn && kn.rawJsonResponse) ? (kn.rawJsonResponse.subcomponents || []) : []);
            const prompt1 = `Provide overarching advice on how to anneal the following subcomponents together to mold and make the Parent system "${knLabel}".\nSubcomponents:\n${subcStr}` + fetchBayesianMemory(kn);
            if (cell) {
                d2(cell.prompt).content = prompt1;
                cell.model = getModelForPipelineRole('architect');
            }

            // Phase 3: Knot 2 - System Architect Implementation
            const newKnot2 = new knotClass(recompRow.RegId);
            //
            //     newKnot2.knotType = Knot_Type.USER_PROMPT_OTHER_KNOT_HISTORY;
            //     newKnot2.sourceContextKnotIds = [newKnot.RegId, ...childContextIds];
            //
            newKnot2.knotType = Knot_Type.MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OTHER_KNOT_HISTORY;
            newKnot2.sourceContextKnotIds = [newKnot.RegId]; // Context from Architecture Advice Knot
            newKnot2.sourcePromptKnotIds = [...childContextIds]; // Subcomponents implementations
            newKnot2.requestCallbackId = 'concat_child_code'; // Callback to aggregate subcomponents sequentially into the prompt string
            //

            newKnot2.responseCallbackId = 'extractCodeBlocks'; // Assure proper isolation payload extraction
            recompRow.sequence.push(newKnot2.RegId);

            const cell2 = d3(newKnot2.TC);
            const prompt2 = typeof buildSystemArchitectPrompt === 'function' ? buildSystemArchitectPrompt(kn, targetLang) : `Implement the architected parent system ${knLabel} referencing provided child modules context.`;
            if (cell2) {
                d2(cell2.prompt).content = prompt2;
                cell2.model = getModelForPipelineRole('synthesizer');
            }
        }

        if (!recompPlan.tracks.includes(recompRow.RegId)) {
            recompPlan.tracks.push(recompRow.RegId);
        }
    });

    if (!recompPlan.steps.includes(rootRecompChoice.RegId)) {
        recompPlan.steps.unshift(rootRecompChoice.RegId); // Ensure root choice is step 0
    }

    console.log(`[buildWDLRecompositionPlan] Successfully mapped ${orderedRows.length} nodes to Recomposition.`);
    if (typeof window.recoalesceAndRenderAll === 'function') window.recoalesceAndRenderAll();
    return recompPlan.RegId;
}

