export class BayesianEdge {
    constructor(sourceName, targetName) {
        this.source = sourceName;
        this.target = targetName;
        this.weight = 0; // Calculated dynamically: 1 / out_edge_count
        this.codeSnippets = []; // Array of code strings generated for this specific relationship
    }

    addSnippet(codeStr) {
        if (codeStr && typeof codeStr === 'string' && codeStr.trim() !== '') {
            this.codeSnippets.push(codeStr);
        }
    }
}

export class BayesianNode {
    constructor(name) {
        this.name = name;
        this.codeSnippet = ""; // Direct code snippet for this specific node label
        this.outEdges = new Map(); // targetName -> BayesianEdge
        this.inEdges = new Map();  // sourceName -> BayesianEdge
    }

    addOutEdge(targetName) {
        if (!this.outEdges.has(targetName)) {
            const edge = new BayesianEdge(this.name, targetName);
            this.outEdges.set(targetName, edge);
        }
        return this.outEdges.get(targetName);
    }

    linkInEdge(sourceName, edgeReference) {
        this.inEdges.set(sourceName, edgeReference);
    }
}

export class BayesianGraph {
    constructor(graphType = "dependency") {
        this.nodes = new Map(); // name -> BayesianNode
        this.graphType = graphType;
    }

    getNode(name) {
        if (!this.nodes.has(name)) {
            this.nodes.set(name, new BayesianNode(name));
        }
        return this.nodes.get(name);
    }

    /**
     * Adds a directed link Source -> Target to the graph. 
     * In dependency graph: Parent -> Child (Parent depends on Child)
     * In dependent graph: Child -> Parent (Child is depended on by Parent)
     */
    addEdge(sourceName, targetName, edgeCodeSnippet = null, sourceNodeSnippet = null) {
        const srcNode = this.getNode(sourceName);
        const tgtNode = this.getNode(targetName);

        if (sourceNodeSnippet) {
            srcNode.codeSnippet = sourceNodeSnippet;
        }

        const outEdge = srcNode.addOutEdge(targetName);
        // Link the exact same reference to the inEdges of the target node
        tgtNode.linkInEdge(sourceName, outEdge); 

        if (edgeCodeSnippet) {
            outEdge.addSnippet(edgeCodeSnippet);
        }

        this.recalculateWeights();
        return outEdge;
    }

    // Assigns fair weights to all out edges of a node: 1 / N.
    recalculateWeights() {
        for (const [nodeName, node] of this.nodes.entries()) {
            const outCount = node.outEdges.size;
            if (outCount > 0) {
                const fairWeight = 1.0 / outCount;
                for (const edge of node.outEdges.values()) {
                    edge.weight = fairWeight;
                }
            }
        }
    }

    toJSON() {
        const obj = {
            graphType: this.graphType,
            nodes: {}
        };
        for (const [name, node] of this.nodes.entries()) {
            const outEdgesData = [];
            for (const edge of node.outEdges.values()) {
                outEdgesData.push({
                    target: edge.target,
                    weight: edge.weight,
                    snippetsCount: edge.codeSnippets.length,
                    codeSnippets: edge.codeSnippets
                });
            }
            obj.nodes[name] = {
                codeSnippet: node.codeSnippet,
                outEdges: outEdgesData
            };
        }
        return JSON.stringify(obj, null, 2);
    }

    static fromJSON(jsonStr) {
        try {
            const data = JSON.parse(jsonStr);
            if (!data || typeof data.nodes !== 'object') return new BayesianGraph();
            const graph = new BayesianGraph(data.graphType || "dependency");
            
            for (const name in data.nodes) {
                const nodeData = data.nodes[name];
                const node = graph.getNode(name);
                node.codeSnippet = nodeData.codeSnippet || "";

                if (Array.isArray(nodeData.outEdges)) {
                    for (const eData of nodeData.outEdges) {
                        const outEdge = graph.addEdge(name, eData.target);
                        outEdge.weight = eData.weight || 0;
                        if (Array.isArray(eData.codeSnippets)) {
                            outEdge.codeSnippets = eData.codeSnippets;
                        }
                    }
                }
            }
            return graph;
        } catch (e) {
            console.error("BayesianGraph JSON parse error:", e);
            return new BayesianGraph();
        }
    }

    toMermaid() {
        let mermaid = `graph TD\n`;
        const addedNodes = new Set();
        
        for (const [name, node] of this.nodes.entries()) {
            const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_');
            if (!addedNodes.has(cleanName)) {
                mermaid += `    ${cleanName}["${name}"]\n`;
                addedNodes.add(cleanName);
            }
            
            for (const edge of node.outEdges.values()) {
                const targetCleanName = edge.target.replace(/[^a-zA-Z0-9_]/g, '_');
                if (!addedNodes.has(targetCleanName)) {
                    mermaid += `    ${targetCleanName}["${edge.target}"]\n`;
                    addedNodes.add(targetCleanName);
                }
                const weightStr = (edge.weight * 100).toFixed(0) + '%';
                const snippetStr = edge.codeSnippets.length > 0 ? ` [${edge.codeSnippets.length} snippets]` : '';
                mermaid += `    ${cleanName} -- "weight: ${weightStr}${snippetStr}" --> ${targetCleanName}\n`;
            }
        }
        return mermaid;
    }

    /**
     * MECE Distillation Pipeline:
     * Overwrites multiple edge snippets with a single generalized/distilled implementation.
     */
    async autoDistillEdge(sourceName, targetName) {
        const srcNode = this.getNode(sourceName);
        if (!srcNode || !srcNode.outEdges.has(targetName)) return false;
        const edge = srcNode.outEdges.get(targetName);
        
        if (!edge.codeSnippets || edge.codeSnippets.length <= 1) {
            console.log(`[Bayesian Distill] Edge ${sourceName}->${targetName} has ${edge.codeSnippets ? edge.codeSnippets.length : 0} snippets. Skipping.`);
            return false;
        }

        console.log(`[Bayesian Distill] Distilling ${edge.codeSnippets.length} snippets for Edge: ${sourceName}->${targetName}...`);
        
        try {
            // Dynamic imports to prevent massive circular dependencies between models and engines
            const { getModelForPipelineRole } = await import('./WISH.js');
            const { buildOllamaRequestData, coreOllamaRequest } = await import('../services/api.js');
            
            const synthesizerModel = typeof getModelForPipelineRole === 'function' ? getModelForPipelineRole('synthesizer') : 'llama3.2:3b';
            
            const promptContent = `You are an expert system architect analyzing multiple historical implementations of the component "${sourceName}" when it interacted with its dependency "${targetName}".
Below are ${edge.codeSnippets.length} different implementations (code snippets) we have previously generated for this specific relationship context.
Your goal is to distill these into a single, unified "MECE" (Mutually Exclusive, Collectively Exhaustive) code implementation that generalizes the best structural practices from all of them.

HISTORICAL SNIPPETS:
${edge.codeSnippets.map((snip, idx) => `=== SNIPPET ${idx + 1} ===\n${snip}\n`).join('\n')}

INSTRUCTIONS:
Output ONLY the final, unified raw code snippet inside a standard markdown code block. Do not include any conversational filler.`;

            const requestData = buildOllamaRequestData(synthesizerModel, [{ role: 'user', content: promptContent }], false, {});
            const responseObj = await coreOllamaRequest(requestData);
            
            if (responseObj && responseObj.content) {
                const { extractCodeBlocks } = await import('../utils/helpers.js');
                const extractedBlocks = extractCodeBlocks(responseObj.content);
                const definitiveCode = extractedBlocks || responseObj.content;
                
                // MECE consolidation: Overwrite the massive chaotic array with the single perfected snippet!
                edge.codeSnippets = [definitiveCode];
                console.log(`[Bayesian Distill] ✅ Successfully distilled Edge ${sourceName}->${targetName} into 1 Master Snippet.`);
                return true;
            }
        } catch (error) {
            console.error(`[Bayesian Distill] ❌ Error distilling Edge ${sourceName}->${targetName}:`, error);
        }
        return false;
    }
}

