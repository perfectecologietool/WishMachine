/**
 * DecompRecomp Engine (Layer 3 Orchestrator)
 * 
 * This file sits above the standard execution suites (Quipu/QDL) and the Architectural
 * Graph (ArchNode/CoreSystem). It is responsible for orchestrating complex, multi-Quipu
 * workflows, specifically the Quechuy Recomposition algorithm.
 */

// ═══════════════════════════════════════════════════════════════
// DecompRecompState — Independent State for Each Attempt
// ═══════════════════════════════════════════════════════════════

/**
 * Encapsulates the full state of a single Decomposition-Synthesis attempt.
 * Acts as the single source of truth for tracking progress across both phases.
 *
 * Lifecycle: DECOMPOSING → READY_FOR_SYNTHESIS → SYNTHESIZING → COMPLETE
 *            (can be STOPPED at any phase)
 *
 * @param {string} seedPrompt       - The original user prompt that started decomposition.
 * @param {number} seedQuipuRegId   - RegId of the Phase 1 decomposition Quipu.
 */
export class DecompRecompState {
    constructor(seedPrompt, seedQuipuRegId) {
        this.id = Date.now();
        this.seedPrompt = seedPrompt;
        this.decompQuipuRegId = seedQuipuRegId;
        this.recompQuipuRegId = null;

        // DECOMPOSING | READY_FOR_SYNTHESIS | SYNTHESIZING | COMPLETE | STOPPED
        this.status = 'DECOMPOSING';

        this.model = '';
        this.targetLanguage = 'JavaScript';

        // The unified output JSON structure from all decomposition knots
        this.masterJsonTree = null;

        // Concept deduplication register — Map<lowercaseName, archNodeId>
        // When a duplicate is found, the archNodeId lets us create a DAG edge
        this.conceptRegister = new Map();

        this.createdAt = new Date().toISOString();

        console.log(`[DecompRecompState] Created attempt ${this.id} for Quipu ${seedQuipuRegId}`);
    }

    /**
     * Recursively traverses the master JSON tree to find a matching object by its "id".
     * Replaces that object's "subcomponents" array (or entire structure) with new data.
     * @param {string} targetId - The ID of the component to update.
     * @param {object} newJsonData - The parsed JSON data for that component's children/details.
     */
    updateMasterJsonTree(targetId, newJsonData) {
        if (!this.masterJsonTree) {
            this.masterJsonTree = newJsonData;
            return;
        }

        const traverseAndMerge = (currentNode) => {
            if (currentNode.id === targetId) {
                // Merge the new data fields into the existing node
                // But preserve the existing node reference so the tree updates correctly
                Object.assign(currentNode, newJsonData);
                return true; // Found and updated
            }

            if (Array.isArray(currentNode.subcomponents)) {
                for (const child of currentNode.subcomponents) {
                    if (traverseAndMerge(child)) {
                        return true;
                    }
                }
            } else if (Array.isArray(currentNode.components)) {
                // Support alternate JSON key
                for (const child of currentNode.components) {
                    if (traverseAndMerge(child)) {
                        return true;
                    }
                }
            }
            return false;
        };

        const found = traverseAndMerge(this.masterJsonTree);
        if (!found) {
            console.warn(`[DecompRecompState] JSON Merge Failed: Could not find node with id '${targetId}' in master tree.`);
        }
    }

    /**
     * Marks the decomposition phase as complete.
     * Called when all decomposition knots have finished executing or the user stops.
     */
    markDecompositionComplete() {
        this.status = 'READY_FOR_SYNTHESIS';
        console.log(`[DecompRecompState] Attempt ${this.id} → READY_FOR_SYNTHESIS`);
    }

    /**
     * Marks the synthesis phase as started.
     * @param {number} recompQuipuRegId - RegId of the newly created Phase 2 Quipu.
     */
    startSynthesis(recompQuipuRegId) {
        this.recompQuipuRegId = recompQuipuRegId;
        this.status = 'SYNTHESIZING';
        console.log(`[DecompRecompState] Attempt ${this.id} → SYNTHESIZING (Quipu ${recompQuipuRegId})`);
    }

    /**
     * Marks the entire attempt as complete.
     */
    markComplete() {
        this.status = 'COMPLETE';
        console.log(`[DecompRecompState] Attempt ${this.id} → COMPLETE`);
    }

    /**
     * Emergency stop: freezes the current state.
     * Unexecuted knots in the decomposition tree become de facto leaf nodes.
     */
    stop() {
        this.status = 'STOPPED';
        console.log(`[DecompRecompState] Attempt ${this.id} → STOPPED`);
    }
}
