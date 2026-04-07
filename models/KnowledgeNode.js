import { ArchNode } from './ArchModels.js';

/**
 * KnowledgeNode represents the "knowledge" filing system for a given Component.
 * It is a member variable of Four_Component, separating the WDL Table UI routing
 * from the semantic architecture graph.
 */
export class KnowledgeNode extends ArchNode {
    constructor(id, label, description = "") {
        super(id, label, description);
        
        // --- Decomposition Knowledge ---
        this.rawJsonResponse = null;   // The full parsedJsonObj from LLM
        this.mermaidGraph = "";        // generateCausalityMermaid() output
        this.hopRegId = null;          // generateOntoHop() Hop RegId
        
        // `dependents` and `dependencies` arrays are inherited from ArchNode,
        // allowing this node to participate in the topological sort for Synthesis.
    }
}
