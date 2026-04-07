import { Quipu } from '../models/QuipuModels.js';
import { DecompRecompState } from '../models/DecompModels.js';
import { CoSy, ActiveKeychain, s1, k1, q1, d2, d3 } from '../core/state.js';
import { Quechuy_executeQuipu, buildCodeGenerationPrompt, buildSystemArchitectPrompt, buildSystemSynthesizerPrompt } from './quipuEngine.js';
import { Prompt_engines, Knot_Type } from '../core/constants.js';
import { qdlw_addStrand, qdlw_wireContext, qdlw_wirePromptSource } from './qdlEngine.js';

/**
 * One-click pipeline: executes Phase 1 decomposition on the given Quipu,
 * then automatically chains into Phase 2 synthesis without waiting for the user.
 *
 * Creates a DecompRecompState, runs the decomposition Quipu to completion,
 * then builds and executes the synthesis Quipu from the resulting ArchNode graph.
 *
 * @param {number} quipuRegId - The RegId of the Quipu to decompose.
 */
export async function Quechuy_DecomposeAndSynthesize(quipuRegId) {
    const quipu = q1(quipuRegId);
    if (!quipu) {
        console.error('[Quechuy_DecomposeAndSynthesize] Quipu not found:', quipuRegId);
        return;
    }

    // Create state object for this attempt
    const seedPrompt = '';
    if (quipu.strands.length > 0) {
        const firstStrand = s1(quipu.strands[0].strandRegId);
        if (firstStrand && firstStrand.knots.length > 0) {
            const firstKnot = k1(firstStrand.knots[0]);
            if (firstKnot) {
                const tc = d3(firstKnot.TC);
                if (tc && tc.prompt) {
                    const promptContent = d2(tc.prompt).content || '';
                    // seedPrompt is for tracking, not used functionally yet
                }
            }
        }
    }

    window.ActiveDecompRecompState = new DecompRecompState(seedPrompt, quipuRegId);
    console.log('[Quechuy_DecomposeAndSynthesize] === PHASE 1: DECOMPOSITION ===');

    // Phase 1: Execute the decomposition Quipu
    window.isExecutingQuipu = true;
    if (typeof Tone !== 'undefined') Tone.start();
    await Quechuy_executeQuipu(quipuRegId);

    // Check if stopped by user
    if (!window.isExecutingQuipu) {
        console.log('[Quechuy_DecomposeAndSynthesize] Stopped by user during decomposition.');
        window.ActiveDecompRecompState.stop();
        return;
    }

    console.log('[Quechuy_DecomposeAndSynthesize] === PHASE 2: SYNTHESIS ===');

    // Phase 2: Automatically chain into synthesis
    await Quechuy_executeRecomposition(quipuRegId);

    console.log('[Quechuy_DecomposeAndSynthesize] === PIPELINE COMPLETE ===');
}





/**
 * Initiates the Quechuy Recomposition process.
 * Reads the structure from the current ArchNode tree, performs a topological sort,
 * creates a new Quipu in the ActiveKeychain, and generates a bottom-up execution graph.
 */
export function Quechuy_Recomposition() {
    if (!window.CoSy || !window.CoSy.nodes || window.CoSy.nodes.length === 0) {
        console.warn("Quechuy_Recomposition: CoreSystem (CoSy) is empty. Run Decomposition first.");
        alert("Please run a Decomposition first to generate the architectural graph.");
        return;
    }

    if (!window.ActiveKeychain) {
        console.error("Quechuy_Recomposition: No ActiveKeychain found.");
        return;
    }

    console.log("--- Starting Quechuy Recomposition ---");

    // 1. Perform Topological Sort (Bottom-Up: Leaves first, Root last)
    const sortedNodes = _topologicalSort(window.CoSy);
    if (!sortedNodes || sortedNodes.length === 0) {
        console.error("Quechuy_Recomposition: Failed to sort nodes.");
        return;
    }

    console.log("Topological Sort Order (Bottom-Up):", sortedNodes.map(n => n.label));

    // 2. Setup the New Recomposition Quipu
    const originalRootName = sortedNodes[sortedNodes.length - 1].label;
    const recompositionQuipu = new Quipu(`Recomposition: ${originalRootName}`);
    window.ActiveKeychain.quipus.push(recompositionQuipu.RegId);

    // Switch UI focus to the new Quipu
    window.ActiveKeychain.visibleQuipuIndex = window.ActiveKeychain.quipus.length - 1;

    // Mapping from ArchNode ID -> newly created Recomposition Knot RegId
    // This is crucial for linking Parent Synthesis context to the outputs of Child Knots.
    const nodeToRecompKnotMap = {};

    // 3. Traverse and Build the Recomposition Graph
    sortedNodes.forEach(node => {
        // Create a strand for this node
        const strandRegId = qdlw_addStrand(recompositionQuipu.RegId);
        const strand = s1(strandRegId);
        strand.metadata.archNodeId = node.id; // Link back to the ArchNode

        let templateName = "";
        let knotType = "";
        let contextSourceKnots = [];

        // Determine if this is a leaf node (no outgoing dependencies in CoSy)
        const outgoingEdges = window.CoSy.edges.filter(e => e.from === node.id);
        const isLeaf = outgoingEdges.length === 0 || (node.label && node.label.startsWith("🍃"));

        if (isLeaf) {
            console.log(`Building Leaf Recomposition Knot for: ${node.label}`);
            templateName = "LEAF_NODE_RECOMPOSITION_PROMPT_TEMPLATE";
            knotType = Knot_Type.SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_NO_CONTEXT;

            // For a leaf, its context is the original JSON block that birthed it during decomposition.
            // Ideally, the ArchNode holds a reference to the Decomposition Knot that created it,
            // but for now, we will prepopulate the prompt with its semantic definitions.
        } else {
            console.log(`Building Parent Synthesis Knot for: ${node.label}`);
            templateName = "PARENT_NODE_SYNTHESIS_PROMPT_TEMPLATE";
            knotType = Knot_Type.MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OTHER_KNOT_HISTORY;

            // A parent node needs the responses of its children as context
            outgoingEdges.forEach(edge => {
                const childNodeId = edge.to;
                const childRecompKnotId = nodeToRecompKnotMap[childNodeId];
                if (childRecompKnotId) {
                    contextSourceKnots.push(childRecompKnotId);
                }
            });
        }

        // Create the Knot
        // We use a generic model to start, User can change globally using the new global selector
        const model = document.getElementById('model_selector')?.value || "llama3.2:3b";

        // Create the Knot and configure it based on topological position
        const knotRegId = recompositionQuipu.pushKnotToStrand(strandRegId);
        const knot = k1(knotRegId);

        // Configure Strategy Data
        knot.knotType = knotType;
        knot.promptTemplateId = templateName;

        // If Parent, link context
        if (!isLeaf && contextSourceKnots.length > 0) {
            knot.sourceContextKnotIds = [...contextSourceKnots];
        }

        const tc = d3(knot.TC);

        // Fill in template variables (COMPONENT_NAME, PARENT_SYSTEM, etc.)
        // Here we approximate based on labels. 
        // If the node label has a prefix, strip it for the variable.
        const cleanName = node.label.replace("🍃 ", "");
        let parentName = "System";
        // Find incoming edge to get parent name (if any)
        const incomingEdge = window.CoSy.edges.find(e => e.to === node.id);
        if (incomingEdge) {
            const parentNode = window.CoSy.nodes.find(n => n.id === incomingEdge.from);
            if (parentNode) {
                parentName = parentNode.label.replace("🍃 ", "");
            }
        }

        // Pre-populate the Template Variables block so the user sees it visually
        tc.prompt.content = `{{COMPONENT_NAME}}:${cleanName}\n{{PARENT_SYSTEM}}:${parentName}\n{{COMPONENT_ROLE}}:Subcomponent of ${parentName}`;
        tc.model = model;

        // Save the mapping for future Parents to reference this Knot
        nodeToRecompKnotMap[node.id] = knotRegId;
    });

    // Trigger UI Re-render
    if (window.ActiveKeychain && typeof window.ActiveKeychain.yieldElement === 'function') {
        window.ActiveKeychain.yieldElement('keychain-container');
    } else if (typeof qdlShadowUpdate === 'function') {
        qdlShadowUpdate();
    }

    console.log("--- Quechuy Recomposition Initialized ---");
    alert("Recomposition Quipu created! Review the new Knots and execute them bottom-up.");
}


/**
 * Performs a topological sort on the CoreSystem (CoSy) graph.
 * Returns an array of Nodes ordered from bottom-level leaves up to the root.
 * Generates an error if a cycle is detected (though decomposition should be a DAG).
 * @param {CoreSystem} cosy - The architectural graph
 * @returns {Array} Array of node objects sorted bottom-up
 */
export function _topologicalSort(cosy) {
    const nodes = cosy.nodes;
    const edges = cosy.edges;

    // Create adjacency list and in-degree map
    const adjList = new Map();
    const inDegree = new Map();

    nodes.forEach(n => {
        adjList.set(n.id, []);
        inDegree.set(n.id, 0); // Note: we are tracking in-degree for a BOTTOM-UP sort.
        // So we actually want edges to point from Child -> Parent.
        // In CoSy, edges usually go Parent -> Child dependencies.
    });

    // Invert the edges: If Parent -> Child, we record Child -> Parent
    edges.forEach(e => {
        if (adjList.has(e.to) && inDegree.has(e.from)) {
            adjList.get(e.to).push(e.from);
            inDegree.set(e.from, inDegree.get(e.from) + 1);
        }
    });

    // Queue nodes with 0 in-degree (these are the Leaves!)
    const queue = [];
    inDegree.forEach((degree, nodeId) => {
        if (degree === 0) {
            queue.push(nodeId);
        }
    });

    const sortedNodeIds = [];

    while (queue.length > 0) {
        const current = queue.shift();
        sortedNodeIds.push(current);

        const neighbors = adjList.get(current) || [];
        neighbors.forEach(neighbor => {
            const currentInDegree = inDegree.get(neighbor) - 1;
            inDegree.set(neighbor, currentInDegree);
            if (currentInDegree === 0) {
                queue.push(neighbor);
            }
        });
    }

    if (sortedNodeIds.length !== nodes.length) {
        console.warn("Topological sort detected a cycle. Some nodes were skipped.");
    }

    return sortedNodeIds.map(id => nodes.find(n => n.id === id)).filter(Boolean);
}

/**
 * Computes the QDL address string for a knot in the recomposition quipu.
 * Address format: knotIndex,strandPosition,quipuIndex
 * Each recomposition strand may hold one or more knots.
 * @param {number} knotRegId  - The RegId of the recomposition knot.
 * @param {number} quipuRegId - The RegId of the recomposition quipu.
 * @returns {string|null} Address string "knotIdx,strandPos,quipuIdx" or null on failure.
 */
function _recompKnotAddress(knotRegId, quipuRegId) {
    const knot = k1(knotRegId);
    if (!knot) return null;
    const strand = s1(knot.parentStrandId);
    if (!strand) return null;
    const keychain = window.ActiveKeychain;
    if (!keychain) return null;
    const quipuIdx = keychain.quipus.indexOf(quipuRegId);
    if (quipuIdx === -1) return null;
    const addr = `${knot.strandIndex},${strand.positionOnQuipu},${quipuIdx}`;
    console.log(`[_recompKnotAddress] knotRegId=${knotRegId} -> address="${addr}"`);
    return addr;
}


/**
 * Phase 2 Builder — ArchNode-Driven.
 * Walks the CoSy ArchNode graph using order_of_appearance (leaves first, root last)
 * and constructs a SEQUENTIAL Quipu that synthesizes the system bottom-up.
 *
 * Each ArchNode carries:
 *   - decompKnotRegId: link back to Phase 1 knot (for context)
 *   - recompKnotRegId: written here, link to Phase 2 knot (for child wiring)
 *   - dependencies[]: child ArchNodes whose recompKnotRegId is already set
 *
 * Leaf nodes  → code-generation prompt from the decomp spec JSON
 * Parent nodes → two-knot strand (Evaluator + Architect) wired to child responses
 *
 * @param {number} sourceQuipuRegId - The RegId of the Phase 1 decomposition Quipu.
 * @returns {number|null} The RegId of the newly created Phase 2 Quipu, or null on failure.
 */
export function buildRecompositionQuipu(sourceQuipuRegId) {
    if (typeof CoSy === 'undefined' || !CoSy || CoSy.nodes.size === 0) {
        console.error('[buildRecompositionQuipu] CoSy graph is empty. Run Phase 1 decomposition first.');
        return null;
    }
    if (!window.ActiveKeychain) {
        console.error('[buildRecompositionQuipu] No ActiveKeychain found.');
        return null;
    }

    const leafTemplate = Prompt_engines.find(e => e.name === 'LEAF_NODE_RECOMPOSITION_PROMPT_TEMPLATE');
    const parentTemplate = Prompt_engines.find(e => e.name === 'PARENT_NODE_SYNTHESIS_PROMPT_TEMPLATE');
    if (!leafTemplate || !parentTemplate) {
        console.error('[buildRecompositionQuipu] Recomposition prompt templates not found in Prompt_engines!');
        return null;
    }

    // Resolve the default model from the source quipu's first knot, fallback to UI selector.
    const sourceQuipu = q1(sourceQuipuRegId);
    let defaultModel = document.getElementById('modelSel')?.value || '';
    const architectModel = (window.DecompRecompModels && window.DecompRecompModels.architect) || defaultModel;
    const synthesizerModel = (window.DecompRecompModels && window.DecompRecompModels.synthesizer) || defaultModel;
    const leafModel = (window.DecompRecompModels && window.DecompRecompModels.leaf) || defaultModel;

    // Resolve target language from DecompRecompState if available
    const targetLanguage = (window.ActiveDecompRecompState && window.ActiveDecompRecompState.targetLanguage)
        ? window.ActiveDecompRecompState.targetLanguage
        : 'JavaScript';

    // ── Step 1: Create the new Phase 2 Quipu ─────────────────────────────────
    const recompQuipu = new Quipu('Phase 2: Synthesis');
    recompQuipu.executionStrategy = 'DEPENDENCY_AWARE';
    const recompQuipuRegId = recompQuipu.RegId;

    // Add to keychain so address resolution works during construction.
    window.ActiveKeychain.quipus.push(recompQuipuRegId);

    // Reset all ArchNodes' isProcessed flag (in case of re-runs)
    CoSy.nodes.forEach(n => { n.isProcessed = false; n.recompKnotRegId = null; });

    // ── Step 2: Sort ArchNodes by order_of_appearance (leaves first) ──────────
    // order_of_appearance is assigned during decomposition: children get higher
    // values than their parents. Sorting ascending gives us leaves first naturally,
    // BUT we actually need the reverse: leaves have HIGHER order_of_appearance
    // (they were discovered later during decomposition). We need leaves first
    // for synthesis, so we sort by order_of_appearance descending... wait:
    // Actually in sensibleRecursiveDecomposition, the PARENT gets an order first,
    // then children get sequential orders after it. So children have HIGHER values.
    // For synthesis we need leaves (highest order) first → sort DESCENDING.
    // BUT: roots have dependents.length === 0 and lowest order_of_appearance.
    // Let's just use the graph structure: leaves = no dependencies.
    // Sort so all leaves come before all parents, within each group sort by order.
    const allNodes = Array.from(CoSy.nodes.values()); // Use all nodes from the graph

    // Partition into leaves and parents, then concatenate: leaves first, parents after
    const leaves = allNodes.filter(n => n.knowledgeNode ? n.knowledgeNode.dependencies.length === 0 : n.dependencies.length === 0);
    const parents = allNodes.filter(n => n.knowledgeNode ? n.knowledgeNode.dependencies.length > 0 : n.dependencies.length > 0);

    // Sort parents so that lower-level parents come before higher-level ones
    // A parent whose children are ALL leaves should come before a grandparent
    // We use order_of_appearance descending: deeper parents were created later
    parents.sort((a, b) => {
        const orderA = a.knowledgeNode ? a.knowledgeNode.order_of_appearance : a.order_of_appearance;
        const orderB = b.knowledgeNode ? b.knowledgeNode.order_of_appearance : b.order_of_appearance;
        return orderB - orderA;
    });

    const topoOrder = [...leaves, ...parents];

    console.log(`[buildRecomp] Traversal order (${topoOrder.length} nodes): ${topoOrder.map(n => n.label).join(' → ')}`);

    // ── Step 3: Build a knot for each ArchNode ────────────────────────────────
    let leafCount = 0;
    let parentCount = 0;

    for (const archNode of topoOrder) {
        const kn = archNode.knowledgeNode || archNode;
        const isLeaf = kn.dependencies.length === 0;

        // ── Use kn.decompKnotRegId to find original decomp knot ──────
        const origKnotRegId = kn.decompKnotRegId;
        let origKnotAddress = null;
        if (origKnotRegId !== null && origKnotRegId !== undefined) {
            const _origKnot = k1(origKnotRegId);
            if (_origKnot) {
                const origStrand = s1(_origKnot.parentStrandId);
                const origQuipu = origStrand ? q1(origStrand.parentQuipuId) : null;
                if (origStrand && origQuipu) {
                    const origQuipuIdx = window.ActiveKeychain.quipus.indexOf(origQuipu.RegId);
                    origKnotAddress = `${_origKnot.strandIndex},${origStrand.positionOnQuipu},${origQuipuIdx}`;
                }
            }
        }

        // Component metadata from the ArchNode / Four_Component
        const compName = archNode.label ? archNode.label.replace('🍃 ', '') : (archNode.name || 'Component');
        let parentSystemName = 'System';
        if (kn.dependents.length > 0) {
            const depNode = kn.dependents[0];
            parentSystemName = depNode.label ? depNode.label.replace('🍃 ', '') : (depNode.name || 'System');
        }

        // ── Strand + Knot creation ────────────────────────────────────────────
        const newStrandRegId = qdlw_addStrand(recompQuipuRegId);
        const newStrand = s1(newStrandRegId);
        newStrand.name = isLeaf
            ? `Synth Leaf: ${compName}`
            : `Synth Parent: ${compName}`;
        console.log(`[buildRecomp] Node "${compName}" (order=${kn.order_of_appearance}) → Strand ${newStrand.positionOnQuipu} (isLeaf=${isLeaf}, decompKnot=${origKnotRegId})`);

        let primaryKnotRegId;

        if (isLeaf) {
            // Leaf: simple prompt, no aggregation sources.
            primaryKnotRegId = newStrand.knots[0];
            const leafKnot = k1(primaryKnotRegId);
            leafKnot.knotType = Knot_Type.USER_PROMPT_NO_CONTEXT;
            leafKnot.responseCallbackId = 'extractCodeBlocks';
            leafKnot.forceJsonOutput = false;
            d3(leafKnot.TC).model = leafModel;

            // Extract the parsed JSON spec from the Phase 1 knot's response
            let specJsonObj = {};
            if (origKnotRegId !== null && origKnotRegId !== undefined) {
                const _origKnot = k1(origKnotRegId);
                if (_origKnot) {
                    try {
                        const _responseContent = d2(d3(_origKnot.TC).response).content || '';
                        const _extracted = extractJsonObject(_responseContent);
                        if (_extracted.length > 0) specJsonObj = _extracted[0];
                    } catch (_e) {
                        console.warn(`[buildRecomp] Could not parse spec JSON for leaf "${compName}": `, _e);
                    }
                }
            }
            const prompt = buildCodeGenerationPrompt(specJsonObj, targetLanguage);
            d2(d3(leafKnot.TC).prompt).content = prompt;

            // Wire original decomp knot as context (if available)
            if (origKnotAddress) {
                leafKnot.knotType = Knot_Type.USER_PROMPT_OTHER_KNOT_HISTORY;
                qdlw_wireContext(primaryKnotRegId, origKnotAddress);
            }

            leafCount++;
        } else {
            // Parent: two-knot strand (Evaluator + Architect)

            // Extract the parsed JSON spec from the Phase 1 knot's response (used by both knots)
            let parentSpecJsonObj = {};
            if (origKnotRegId !== null && origKnotRegId !== undefined) {
                const _origKnot = k1(origKnotRegId);
                if (_origKnot) {
                    try {
                        const _responseContent = d2(d3(_origKnot.TC).response).content || '';
                        const _extracted = extractJsonObject(_responseContent);
                        if (_extracted.length > 0) parentSpecJsonObj = _extracted[0];
                    } catch (_e) {
                        console.warn(`[buildRecomp] Could not parse spec JSON for parent "${compName}": `, _e);
                    }
                }
            }

            // 1. Coherence Evaluator Knot
            const evaluatorKnotRegId = newStrand.knots[0];
            const evaluatorKnot = k1(evaluatorKnotRegId);
            evaluatorKnot.knotType = Knot_Type.USER_PROMPT_NO_CONTEXT;
            evaluatorKnot.requestCallbackId = 'none';
            evaluatorKnot.responseCallbackId = 'none';
            evaluatorKnot.forceJsonOutput = false;
            d3(evaluatorKnot.TC).model = architectModel;

            d2(d3(evaluatorKnot.TC).prompt).content = buildSystemArchitectPrompt(parentSpecJsonObj, targetLanguage);

            // 2. System Architect Knot
            newStrand.addKnot();
            primaryKnotRegId = newStrand.knots[1];
            const parentKnot = k1(primaryKnotRegId);
            parentKnot.knotType = Knot_Type.MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OTHER_KNOT_HISTORY;
            parentKnot.responseCallbackId = 'none';
            parentKnot.forceJsonOutput = false;
            d3(parentKnot.TC).model = synthesizerModel;

            let prompt = buildSystemSynthesizerPrompt(parentSpecJsonObj, targetLanguage);

            // Enrich with cyclic back-reference specs
            if (kn.cyclicBackReferences && kn.cyclicBackReferences.length > 0) {
                prompt += `\n\n--- RECURSIVE DEPENDENCY CONTEXT ---\n`;
                prompt += `The following descendant concepts claimed recursive dependency on this component.\n`;
                prompt += `Integrate their specifications into your architectural design:\n\n`;
                for (const ref of kn.cyclicBackReferences) {
                    prompt += `Descendant "${ref.compName}" (from "${ref.fromNodeLabel}"):\n`;
                    prompt += JSON.stringify(ref.jsonSpec, null, 2) + `\n\n`;
                }
                console.log(`[buildRecomp] Enriched prompt for "${compName}" with ${kn.cyclicBackReferences.length} cyclic back-reference(s)`);
            }

            d2(d3(parentKnot.TC).prompt).content = prompt;

            // Tell the engine to use the concat_child_code callback
            parentKnot.requestCallbackId = 'concat_child_code';

            // ── Wire children via knowledgeNode.dependencies[].recompKnotRegId ──────
            for (const childNode of kn.dependencies) {
                const childKn = childNode.knowledgeNode || childNode;
                const childRecompKnotRegId = childKn.recompKnotRegId;
                if (childRecompKnotRegId !== null && childRecompKnotRegId !== undefined) {
                    const addr = _recompKnotAddress(childRecompKnotRegId, recompQuipuRegId);
                    if (addr) {
                        const childLabel = childNode.label || childNode.name;
                        console.log(`[buildRecomp]   Wiring child "${childLabel}" (recompKnot=${childRecompKnotRegId}) addr="${addr}" → synthesizer(${primaryKnotRegId})`);
                        qdlw_wirePromptSource(primaryKnotRegId, addr);
                    }
                } else {
                    const childLabel = childNode.label || childNode.name;
                    console.warn(`[buildRecomp]   Child "${childLabel}" has no recompKnotRegId — skipping wiring`);
                }
            }

            // Wire original decomp knot as context (background info).
            if (origKnotAddress) {
                qdlw_wireContext(primaryKnotRegId, origKnotAddress);
            }

            // Wire the Coherence Evaluator as additional context to the Architect
            const evalAddr = `${evaluatorKnot.strandIndex},${newStrand.positionOnQuipu},${window.ActiveKeychain.quipus.indexOf(recompQuipuRegId)}`;
            qdlw_wireContext(primaryKnotRegId, evalAddr);

            parentCount++;
        }

        // ── Persist recompKnotRegId on the KnowledgeNode ──────────────────────────
        kn.recompKnotRegId = primaryKnotRegId;
        kn.isProcessed = true;
        console.log(`[buildRecomp]   → Node "${compName}" recompKnotRegId = ${primaryKnotRegId}`);
    }

    console.log(`[buildRecompositionQuipu] Built Phase 2 Quipu (RegId=${recompQuipuRegId}): ${leafCount} leaf knots + ${parentCount} synthesis knots.`);
    return recompQuipuRegId;
}


/**
 * Phase 2 Entry Point.
 * Calls buildRecompositionQuipu to construct the Phase 2 quipu from the CoSy graph,
 * adds it to the active keychain, re-renders the UI, and executes it.
 *
 * @param {number} decompositionQuipuRegId - The RegId of the completed Phase 1 Quipu.
 */
export async function Quechuy_executeRecomposition(decompositionQuipuRegId) {
    console.log('[Quechuy_executeRecomposition] Building Phase 2 Synthesis Quipu...');
    if (typeof statusDiv !== 'undefined') statusDiv.textContent = 'Building synthesis quipu...';

    // Transition state: decomposition → ready for synthesis
    if (window.ActiveDecompRecompState) {
        window.ActiveDecompRecompState.markDecompositionComplete();
    }

    const recompQuipuRegId = buildRecompositionQuipu(decompositionQuipuRegId);
    if (recompQuipuRegId === null) {
        console.error('[Quechuy_executeRecomposition] Build failed. Aborting.');
        if (typeof statusDiv !== 'undefined') statusDiv.textContent = 'Synthesis build failed!';
        if (typeof playCompletionSound === 'function') playCompletionSound('failure');
        return;
    }

    // Transition state: ready → synthesizing
    if (window.ActiveDecompRecompState) {
        window.ActiveDecompRecompState.startSynthesis(recompQuipuRegId);
    }

    // Render the keychain so the new quipu is visible before execution starts.
    if (window.ActiveKeychain && typeof window.ActiveKeychain.yieldElement === 'function') {
        window.ActiveKeychain.yieldElement('keychain-container');
    }

    console.log(`[Quechuy_executeRecomposition] Executing Phase 2 Quipu (RegId=${recompQuipuRegId}) using DEPENDENCY_AWARE strategy...`);
    window.isExecutingQuipu = true;
    if (typeof Tone !== 'undefined' && Tone.start) Tone.start();
    await Quechuy_executeQuipu(recompQuipuRegId);

    // Transition state: synthesizing → complete
    if (window.ActiveDecompRecompState) {
        window.ActiveDecompRecompState.markComplete();
    }

    // Full UI refresh after synthesis finishes
    if (typeof window.GlobalUIRefresh === 'function') {
        window.GlobalUIRefresh();
    }
}


/**
 * Checks if candidateNode is an ancestor of descendantNode in the CoSy graph.
 * Walks UP the dependents chain (parent direction) from descendantNode.
 * Used to detect cyclic back-references during decomposition.
 *
 * @param {ArchNode} candidateNode  - The node to check as a potential ancestor.
 * @param {ArchNode} descendantNode - The node to walk up from.
 * @returns {boolean} True if candidateNode is an ancestor of descendantNode.
 */
export function _isAncestorOf(candidateNode, descendantNode) {
    const visited = new Set();
    const startKn = descendantNode.knowledgeNode || descendantNode;
    const targetId = candidateNode.knowledgeNode ? candidateNode.knowledgeNode.id : candidateNode.id;
    
    const queue = [...startKn.dependents];
    while (queue.length > 0) {
        const current = queue.shift();
        const currentId = current.knowledgeNode ? current.knowledgeNode.id : current.id;
        if (currentId === targetId) return true;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        const currentKn = current.knowledgeNode || current;
        queue.push(...currentKn.dependents);
    }
    return false;
}

