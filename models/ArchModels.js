/* =================================================================================
   ======================== 1. CORE OOP DOMAIN =====================================
   ================================================================================= 
   
   THE DEPENDENCY PARADIGM:
   In this graph architecture, edges represent *dependencies*. 
   Rule: "The older object points to the newer object, for which the older 
          object depends on the newer object."
   
   Visually: [Parent/Older] to [Child/Newer]
   Meaning: The Parent cannot function or be completed until the Child exists/completes.
   
   Terminology Mapping:
   - 'dependents': Array of nodes that rely on *this* node. (The ancestors/parents)
   - 'dependencies': Array of nodes that *this* node requires. (The descendants/children)
*/

/**
 * Base class for all nodes in the Nexus environment.
 * Manages fundamental identity and creation chronometry.
 */
export class NexusNode {
    constructor(id, label) {
        this.id = id;
        this.label = label || "Untitled";
        this.created = Date.now(); // Establishes "Older" vs "Newer" chronologically
    }
}


 /**
 * ArchNode represents a singular entity or task in the architectural graph.
 * Extends NexusNode with specialized graph logic (edges/connections).
 */
export class ArchNode extends NexusNode {
    constructor(id, label, description = "") {
        super(id, label);
        this.description = description;

        // Graph Structure Links (Bidirectional tracking)
        this.dependents = [];   // Who depends on me? (Edges pointing TO me)
        this.dependencies = []; // Who do I depend on? (Edges pointing FROM me)

        // Traversal Metadata (populated by sensibleRecursiveDecomposition)
        this.order_of_appearance = 0;              // Temporal creation order (1-indexed)
        this.parent_index = 0;                     // order_of_appearance of the parent ArchNode
        this.children_order_of_appearance = [];    // [int,...] order values of children
        this.isProcessed = false;                  // Recomposition traversal flag
        this.decompKnotRegId = null;               // RegId of the Decomposition Quipu Knot
        this.recompKnotRegId = null;                //RegId of the Recomposition Quipu Knot 
        this.cyclicBackReferences = [];            // [{compName, jsonSpec, fromNodeLabel}] specs from cyclic descendants
    }

    /**
     * Establishes a dependency edge: This Node -> Child Node.
     * Enforces the rule: Older (this) depends on Newer (childNode).
     * @param {ArchNode} childNode - The newer node required by this node.
     */
    addDependency(childNode) {
        // Prevent duplicate edge registrations
        if (!this.dependencies.includes(childNode)) {
            this.dependencies.push(childNode);
        }
        // Maintain the bidirectional relationship in the child
        if (!childNode.dependents.includes(this)) {
            childNode.dependents.push(this);
        }
    }

    /**
     * Severs a dependency edge between this Node and a Child Node.
     * @param {ArchNode} childNode - The node to detach.
     */
    removeDependency(childNode) {
        // Filter out the child from this node's dependency list
        this.dependencies = this.dependencies.filter(d => d.id !== childNode.id);
        // Filter out this node from the child's dependent list
        childNode.dependents = childNode.dependents.filter(d => d.id !== this.id);
    }

    /**
     * Safely deletes this node from the OOP structure.
     * Iterates through all connected parents and children to severe ties,
     * preventing memory leaks or ghost edges in the graph engine.
     */
    destroy() {
        // Slice into a new array [...array] to avoid index shifting during iteration
        [...this.dependents].forEach(parent => parent.removeDependency(this));
        [...this.dependencies].forEach(child => this.removeDependency(child));
    }
}
