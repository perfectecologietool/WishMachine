
// ==========================================
// === NEW: Embedding / R.A.G. Services ===
// ==========================================

/**
 * Creates the EmbedRequest object structure.
 * @param {string} text - The text to embed.
 * @param {string} model - The embedding model name.
 * @returns {object} The request payload for the API.
 */
 
 export function createEmbedRequest(text, model) {
    return {
        model: model,
        input: text
    };
}

/**
 * Calls the C234 Proxy to get embeddings from Ollama.
 * @param {object} packet - The EmbedRequest object.
 * @returns {Promise<object>} The EmbedResponse JSON object from Ollama.
 */
export async function callC234ForEmbedding(packet) {
    try {
        const response = await fetch('/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(packet)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Embedding request failed: ${response.status} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Error in callC234ForEmbedding:", error);
        throw error;
    }
}


/**
 * Helper to parse the response and create the client-side chunk object.
 * @param {object} embedResponse - The raw response from Ollama.
 * @param {string} originalText - The text that was embedded.
 * @returns {object} The formatted chunk object {text, embedding}.
 */
export function createJSONChunkObject(embedResponse, originalText) {
    let embedding = [];
    
    // Handle different Ollama response versions/formats
    if (embedResponse.embedding) {
        // Single embedding response
        embedding = embedResponse.embedding;
    } else if (embedResponse.embeddings && Array.isArray(embedResponse.embeddings)) {
        // Batch embedding response (take the first one since we send single strings)
        embedding = embedResponse.embeddings[0];
    }

    return {
        text: originalText,
        embedding: embedding
    };
}

/**
 * Main Orchestrator function to generate an embedding chunk.
 * @param {string} text - Input text.
 * @param {string} Embedding_Model - Selected model.
 * @returns {Promise<object>} The resulting chunk object.
 */
export async function makeEmbeddingObject(text, Embedding_Model) {
    if (!text || !Embedding_Model) {
        throw new Error("Text and Model are required for embedding.");
    }
    
    // Subgoal 3 logic
    var packet = createEmbedRequest(text, Embedding_Model);
    var embedResponse = await callC234ForEmbedding(packet);
    var chunk = createJSONChunkObject(embedResponse, text);
    
    return chunk;
}