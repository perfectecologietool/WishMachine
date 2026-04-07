/*
                <!-- Visual Canvas System -->
                <section>
                    <details>
                        <summary class="text-slate-100">Visual Workflow Canvas</summary>
                        <div class="details-content space-y-4">
                            <!-- Canvas Container -->
                            <div id="canvas-wrapper" class="w-full h-[600px] bg-slate-900 border border-slate-700 rounded overflow-hidden relative">
                                <canvas id="workflow-canvas"></canvas>
                                <div class="absolute top-2 left-2 bg-slate-800 p-2 rounded text-xs text-slate-400 pointer-events-none">
                                    Pan: Drag | Zoom: Scroll
                                </div>
                            </div>
                            <button onclick="renderCanvasUpdate()">Refresh Canvas</button>
                        </div>
                    </details>
                </section>
<!-- ... existing HTML ... -->
<!-- Add script at bottom -->
<script src="/visual-canvas-renderer.js"></script>
<script>
    document.addEventListener('DOMContentLoaded', () => {
        initCanvasSystem();
    });
</script>
*/


// visual-canvas-renderer.js
// A high-performance HTML5 Canvas renderer for the C234 Workflow System.
// Handles visualization of Four_Rows (Tracks), Five_Choices, and Five_Auto_Choices.
import { d2, d3, d4, d5, DynamicTableState } from '../core/state.js';
import { recoalesceAndRenderAll } from './tableRenderer.js';

export class WorkflowCanvas {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');

        // Viewport State
        this.scale = 1.0;
        this.offsetX = 50;
        this.offsetY = 300;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Configuration
        this.NODE_WIDTH = 180;
        this.NODE_HEIGHT = 80;
        this.H_SPACING = 100; // Horizontal space between nodes
        this.V_SPACING = 120; // Vertical space between branches

        // Event Listeners
        this.initListeners();

        // Initial Resize
        this.resize();
    }

    initListeners() {
        window.addEventListener('resize', () => this.resize());

        this.canvas.addEventListener('mousedown', (e) => {
            // Check if we clicked an interactive object first
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // We need a way to distinguish between a "Click" (Selection/Action) and a "Drag Start" (Panning).
            // Simple heuristic: If we click an object, we handle interaction. If background, we pan.
            // BUT, the requirement is "Click to Select", "Click to Move". 
            // So we can handle interaction on MouseDown? Or MouseUp?
            // Let's use MouseDown for hit testing.

            const clickedObject = this.hitTest(x, y);
            if (clickedObject) {
                this.onObjectClicked(clickedObject);
                // If we clicked an object, we don't start panning
                return;
            }

            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.canvas.style.cursor = 'grabbing';

            // Also clear selection on background click
            this.activeSelection = null;
            this.render();
            this.updateSideConsole(null);
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.offsetX += dx;
                this.offsetY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.render();
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(0.1, this.scale + delta), 5);

            // Zoom towards mouse pointer logic could go here, keeping simple center zoom for now
            this.scale = newScale;
            this.render();
        });
    }

    hitTest(x, y) {
        // Convert Screen Coords to World Coords
        const worldX = (x - this.offsetX) / this.scale;
        const worldY = (y - this.offsetY) / this.scale;

        if (!this.hitRegions) return null;

        // Check Hit Regions (Reverse order to catch top-most elements first)
        for (let i = this.hitRegions.length - 1; i >= 0; i--) {
            const region = this.hitRegions[i];
            if (worldX >= region.x && worldX <= region.x + region.w &&
                worldY >= region.y && worldY <= region.y + region.h) {
                return region.data;
            }
        }
        return null;
    }

    resize() {
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight; // Or fixed height
        this.render();
    }

    /**
     * Hit Test Registry
     * Stores regions: {x, y, w, h, data}
     */
    registerHitRegion(x, y, w, h, data) {
        if (!this.hitRegions) this.hitRegions = [];
        this.hitRegions.push({ x, y, w, h, data });
    }

    /**
     * Main Render Loop
     */
    render() {
        // Reset Hit Regions on every frame
        this.hitRegions = [];

        // Delegate to Scenario Renderer if available
        // Assuming global 'TheScenario' exists as in script.js
        if (typeof TheScenario !== 'undefined' && TheScenario) {
            this.renderScenario(TheScenario);
        }
    }

    /**
     * Entry point to render the current Legacy Scenario (Six_Plan)
     * @param {Six_Plan} scenario 
     */
    renderScenario(scenario) {
        if (!scenario || !scenario.steps || scenario.steps.length === 0) return;

        // Clear Canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        // Apply Viewport Transform
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // Start Recursive Rendering from the Root Choice
        // The root of a Six_Plan is always a Five_Choice (step[0])
        const rootChoiceId = scenario.steps[0];
        this.drawRecursively(rootChoiceId, 0, 0);

        this.ctx.restore();
    }

    // --- Interaction Logic ---

    handleInteraction(x, y) {
        // Convert Screen Coords to World Coords
        const worldX = (x - this.offsetX) / this.scale;
        const worldY = (y - this.offsetY) / this.scale;

        // Check Hit Regions (Reverse order to catch top-most elements first)
        for (let i = this.hitRegions.length - 1; i >= 0; i--) {
            const region = this.hitRegions[i];
            if (worldX >= region.x && worldX <= region.x + region.w &&
                worldY >= region.y && worldY <= region.y + region.h) {

                this.onObjectClicked(region.data);
                return;
            }
        }

        // If no object clicked, clear selection
        this.activeSelection = null;
        this.render();
        this.updateSideConsole(null);
    }

    onObjectClicked(data) {
        if (data.type === 'CELL') {
            // Toggle Selection
            if (this.activeSelection && this.activeSelection.id === data.id) {
                this.activeSelection = null; // Deselect
            } else {
                this.activeSelection = { type: 'Three_Cell', id: data.id }; // Select
            }
            this.render();
            this.updateSideConsole(this.activeSelection ? data.id : null);
            this.highlightTableRow(this.activeSelection ? data.id : null);

        } else if (data.type === 'EDGE') {
            // Move Logic
            if (this.activeSelection && this.activeSelection.type === 'Three_Cell') {
                this.executeMove(this.activeSelection.id, data.trackRegId, data.index);
            }
        }
    }

    executeMove(cellRegId, targetTrackRegId, targetIndex) {
        console.log(`Moving Cell ${cellRegId} to Track ${targetTrackRegId} at index ${targetIndex}`);

        // 1. Find Source Track
        // We need to find which track currently holds this cell.
        // Since we don't have a direct back-reference easily available without searching, 
        // we can iterate all tracks or rely on the cell's parentTrackId if accurate.
        const cell = d3(cellRegId);
        if (!cell || cell.parentTrackId === null) return;

        const sourceTrack = d4(cell.parentTrackId);

        if (sourceTrack) {
            // 2. Remove from Source
            // Adjustment: If moving within same track and targetIndex > currentIndex, decrement targetIndex
            const sourceIndex = sourceTrack.sequence.indexOf(cellRegId);
            if (sourceTrack.RegId === targetTrackRegId && sourceIndex < targetIndex) {
                targetIndex--;
            }

            sourceTrack.removeCell(cellRegId);

            // 3. Insert into Target
            const targetTrack = d4(targetTrackRegId);
            targetTrack.insertCell(cellRegId, targetIndex);

            // 4. Clear Selection & Refresh
            this.activeSelection = null;
            recoalesceAndRenderAll(); // Global Refresh
            // this.render() will be called by recoalesceAndRenderAll -> renderDynamicScenarioTable -> ...
        }
    }

    updateSideConsole(cellRegId) {
        // Dispatch event or call global function to update UI
        if (typeof updateCanvasConsole === 'function') {
            updateCanvasConsole(cellRegId);
        }
    }

    highlightTableRow(cellRegId) {
        if (!cellRegId && cellRegId !== 0) return;

        // Find the TD or TR in the HTML table
        // The Three_Cell.yieldElement() creates a TD with id=this.id (which is UUID, not RegId)
        // We need to resolve RegId to UUID.
        const cell = d3(cellRegId);
        if (cell) {
            const el = document.getElementById(cell.id);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add('highlight-flash');
                setTimeout(() => el.classList.remove('highlight-flash'), 1000);
            }
        }
    }

    // --- The Layout Engine ---

    /**
     * Recursively traverses the data structure and draws nodes.
     * Logic: Choice -> Branches(Tracks) -> TerminatingChoice -> Recurse
     */
    drawRecursively(choiceRegId, x, y) {
        const choice = d5(choiceRegId);
        if (!choice) { console.log("choice failed"); return; }

        // 1. Draw The Choice Node
        this.drawChoiceNode(choice, x, y);

        // Calculate total height of all branches to center them vertically relative to this choice
        // This is a simplified layout; a true tree layout requires pre-calculating subtree heights.
        let currentY = y - ((choice.branches.length - 1) * this.V_SPACING) / 2;

        // 2. Iterate Branches
        choice.branches.forEach(branchRegId => {
            const track = d4(branchRegId);
            if (!track) return;

            // Draw Connection Line
            const startX = x + this.NODE_WIDTH / 2;
            const startY = y;
            const endX = x + this.NODE_WIDTH + this.H_SPACING;
            const endY = currentY;

            this.drawConnection(startX, startY, endX, endY);

            // 3. Draw The Track Node
            this.drawTrackNode(track, endX, endY);
            console.log("gets to here");
            // 4. Recurse if the track has a terminating choice
            if (track.terminatingChoice !== null) {
                // Connect Track to its Terminating Choice
                const choiceX = endX + this.NODE_WIDTH + this.H_SPACING;
                const choiceY = endY; // Linear flow usually

                this.drawConnection(endX + this.NODE_WIDTH, endY, choiceX, choiceY);

                // Recurse
                this.drawRecursively(track.terminatingChoice, choiceX, choiceY);
            }

            // Increment Y for the next branch
            currentY += this.V_SPACING;
        });
    }

    // --- Drawing Primitives ---

    drawTrackNode(track, x, y) {
        // Delegate to new renderer
        this.drawTrackWithCells(track, x, y);
    }

    /**
     * Renders a Track as a container with internal Cells and Edges.
     */
    drawTrackWithCells(track, x, y) {
        const trackWidth = this.NODE_WIDTH;
        const cellHeight = 60; // Height of a 3-cell node
        const edgeHeight = 20; // Space for the edge/circle
        const padding = 10;

        // 1. Draw Track Header (The "Face" logic can go here later)
        // For now, just a header at the top
        this.ctx.fillStyle = '#1e293b';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, trackWidth, 40, 10); // Header only
        this.ctx.fill();
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Text: Track Name
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.font = 'bold 12px Inter, sans-serif';
        this.ctx.fillText(track.name.substring(0, 20), x + 10, y + 25);

        let currentY = y + 40 + padding;

        // 2. Iterate Sequence to Draw Edges and Cells
        // Sequence: [Edge 0] -> [Cell 0] -> [Edge 1] -> [Cell 1] ...

        for (let i = 0; i <= track.sequence.length; i++) {
            // A. Draw Edge Node (Insertion Point)
            this.drawEdgeNode(track, i, x + trackWidth / 2, currentY);
            currentY += edgeHeight;

            // B. Draw Cell Node (if matches an index)
            if (i < track.sequence.length) {
                const cellRegId = track.sequence[i];
                this.drawCellNode(cellRegId, x + 10, currentY, trackWidth - 20, cellHeight);
                currentY += cellHeight + 5;
            }
        }
    }

    drawEdgeNode(track, index, cx, cy) {
        const radius = 6;

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);

        // Visual State: Is this a valid drop target?
        // We need to know if a selection is active. 
        // For now, we'll check a global or class property activeSelection
        const isActive = (this.activeSelection && this.activeSelection.type === 'Three_Cell');

        if (isActive) {
            this.ctx.fillStyle = '#10b981'; // Green for "Paste Here"
            this.ctx.fill();
            this.ctx.strokeStyle = '#fff';
        } else {
            this.ctx.fillStyle = '#475569'; // Slate-600 (Subtle)
            this.ctx.fill();
            this.ctx.strokeStyle = '#94a3b8';
        }
        this.ctx.stroke();

        // REGISTER HIT REGION
        this.registerHitRegion(cx - 10, cy - 10, 20, 20, {
            type: 'EDGE',
            trackRegId: track.RegId,
            index: index
        });
    }

    drawCellNode(cellRegId, x, y, w, h) {
        const cell = d3(cellRegId);
        if (!cell) return;

        // Check Selection State
        const isSelected = (this.activeSelection && this.activeSelection.id === cellRegId);

        // Box
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, 6);
        this.ctx.fillStyle = isSelected ? '#3b82f6' : '#334155'; // Blue if selected, Dark Slate otherwise
        this.ctx.fill();
        this.ctx.strokeStyle = isSelected ? '#93c5fd' : '#64748b';
        this.ctx.lineWidth = isSelected ? 2 : 1;
        this.ctx.stroke();

        // Text: Prompt Preview
        const prompt = d2(cell.prompt);
        const promptText = prompt ? prompt.content.substring(0, 25) + '...' : '[Empty]';

        this.ctx.fillStyle = '#e2e8f0';
        this.ctx.font = '11px sans-serif';
        this.ctx.fillText(promptText, x + 5, y + 20);

        // Text: Response Preview
        const response = d2(cell.response);
        const responseText = response ? (response.content ? response.content.substring(0, 25) + '...' : '[Waiting]') : '[No Resp]';
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText(responseText, x + 5, y + 40);

        // REGISTER HIT REGION
        this.registerHitRegion(x, y, w, h, {
            type: 'CELL',
            id: cellRegId
        });
    }

    drawChoiceNode(choice, x, y) {
        // Draw Choice as a Diamond (Rhombus) or Hexagon
        // Let's use a distinct shape

        const size = 40; // radius
        const centerX = x;
        const centerY = y;

        this.ctx.save();
        this.ctx.translate(centerX, centerY);

        // Check if Auto-Choice
        const isAuto = (choice.constructor.name === "Five_Auto_Choice");

        this.ctx.beginPath();
        this.ctx.moveTo(0, -size); // Top
        this.ctx.lineTo(size, 0);  // Right
        this.ctx.lineTo(0, size);  // Bottom
        this.ctx.lineTo(-size, 0); // Left
        this.ctx.closePath();

        // Fill
        this.ctx.fillStyle = isAuto ? '#dd6b20' : choice.branchesColour; // Orange for Auto
        this.ctx.fill();

        // Stroke
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Text
        this.ctx.fillStyle = '#000'; // Contrast text
        this.ctx.font = 'bold 10px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(isAuto ? "AUTO" : "CHOICE", 0, 5);

        this.ctx.restore();

        // Draw Condition Text above
        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.font = 'italic 12px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(choice.conditional_phrase.substring(0, 25), x, y - size - 10);
        this.ctx.textAlign = 'start'; // Reset
    }

    drawConnection(x1, y1, x2, y2) {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);

        // Bezier Curve for smooth flow
        const cp1x = x1 + (x2 - x1) / 2;
        const cp1y = y1;
        const cp2x = x2 - (x2 - x1) / 2;
        const cp2y = y2;

        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);

        this.ctx.strokeStyle = '#64748b';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
}

// Global Instance
export let globalCanvasRenderer = null;

export function initCanvasSystem() {
    // Requires a container with ID 'canvas-wrapper' and canvas with ID 'workflow-canvas'
    if (document.getElementById('workflow-canvas')) {
        globalCanvasRenderer = new WorkflowCanvas('workflow-canvas', 'canvas-wrapper');
        console.log(`Canvas System Initialized ${typeof globalCanvasRenderer}`);
    }
}

// Hook into the main render cycle
export function renderCanvasUpdate() {
    console.log(`gets to here ##1 ${typeof globalCanvasRenderer}  and ${typeof DynamicTableState}`);
    if (globalCanvasRenderer && typeof DynamicTableState !== 'undefined') {
        globalCanvasRenderer.renderScenario(DynamicTableState.scenario);
    } else {
        console.log("nothingfound in renderCanvasUpdate");
    }
}


export function updateCanvasConsole(cellRegId) {
    const consoleContainer = document.getElementById('canvas-side-console');
    if (!consoleContainer) {
        // Create if missing
        const newConsole = document.createElement('div');
        newConsole.id = 'canvas-side-console';
        newConsole.style.position = 'fixed';
        newConsole.style.bottom = '20px';
        newConsole.style.right = '20px';
        newConsole.style.width = '300px';
        newConsole.style.backgroundColor = '#1e293b';
        newConsole.style.border = '1px solid #475569';
        newConsole.style.borderRadius = '8px';
        newConsole.style.padding = '15px';
        newConsole.style.color = '#f8fafc';
        newConsole.style.zIndex = '1000';
        newConsole.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        newConsole.style.display = 'none'; // Hidden by default
        document.body.appendChild(newConsole);
        // Retry with the new container
        return window.updateCanvasConsole(cellRegId);
    }

    if (cellRegId === null) {
        consoleContainer.style.display = 'none';
        return;
    }

    const cell = d3(cellRegId);
    if (!cell) return;

    consoleContainer.style.display = 'block';
    consoleContainer.innerHTML = ''; // Clear previous

    // Header
    const header = document.createElement('h3');
    header.textContent = `Edit Cell (ID: ${cellRegId})`;
    header.style.marginBottom = '10px';
    header.style.fontSize = '1.1rem';
    header.style.fontWeight = 'bold';
    consoleContainer.appendChild(header);

    // Prompt Editor
    const pLabel = document.createElement('label');
    pLabel.textContent = "User Prompt:";
    pLabel.style.display = 'block';
    pLabel.style.fontSize = '0.9rem';
    pLabel.style.marginBottom = '4px';
    pLabel.style.color = '#cbd5e1';
    consoleContainer.appendChild(pLabel);

    const pInput = document.createElement('textarea');
    pInput.value = d2(cell.prompt).content;
    pInput.rows = 4;
    pInput.style.width = '100%';
    pInput.style.backgroundColor = '#0f172a';
    pInput.style.color = '#e2e8f0';
    pInput.style.border = '1px solid #334155';
    pInput.style.borderRadius = '4px';
    pInput.style.padding = '8px';
    pInput.style.marginBottom = '10px';
    pInput.style.fontFamily = 'monospace';
    pInput.oninput = () => {
        d2(cell.prompt).content = pInput.value;
        // Debounce re-render if needed, or just let it update on next refresh
    };
    consoleContainer.appendChild(pInput);

    // Response Editor
    const rLabel = document.createElement('label');
    rLabel.textContent = "Assistant Response:";
    rLabel.style.display = 'block';
    rLabel.style.fontSize = '0.9rem';
    rLabel.style.marginBottom = '4px';
    rLabel.style.color = '#cbd5e1';
    consoleContainer.appendChild(rLabel);

    const rInput = document.createElement('textarea');
    const respObj = d2(cell.response);
    rInput.value = respObj ? respObj.content : "";
    rInput.rows = 4;
    rInput.style.width = '100%';
    rInput.style.backgroundColor = '#0f172a';
    rInput.style.color = '#e2e8f0';
    rInput.style.border = '1px solid #334155';
    rInput.style.borderRadius = '4px';
    rInput.style.padding = '8px';
    rInput.style.fontFamily = 'monospace';
    rInput.oninput = () => {
        if (respObj) respObj.content = rInput.value;
    };
    consoleContainer.appendChild(rInput);

    // Actions
    const closeBtn = document.createElement('button');
    closeBtn.textContent = "Close";
    closeBtn.style.marginTop = '10px';
    closeBtn.style.padding = '5px 10px';
    closeBtn.style.backgroundColor = '#334155';
    closeBtn.style.color = 'white';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '4px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => {
        consoleContainer.style.display = 'none';
        if (window.TheWorkflowCanvas) {
            window.TheWorkflowCanvas.activeSelection = null;
            window.TheWorkflowCanvas.render();
        }
    };
    consoleContainer.appendChild(closeBtn);
};
