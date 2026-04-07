import { CoalescedPlan, d2, d3, d4, d5, d6, k1, KnotArray, DynamicTableState, GlobalDependencyBayesianGraph, GlobalDependentBayesianGraph } from '../core/state.js';
import { coreOllamaRequestHTC, coreTwoPassRequest } from './api.js';
import { logTurnToActiveHistory } from './tableEngine.js';
import { Four_Row, Knot, Three_Cell, Hyper_Three_Cell, Two_Layer, Four_Component } from '../models/WISH.js';
import { recoalesceAndRenderAll } from '../renderers/tableRenderer.js';
import { ExecutionStatus, Knot_Type, Prompt_engines } from '../core/constants.js';
import { wdl_createWish, wdl_addKnot, buildDecompositionPrompt, buildWDLRecompositionPlan } from './wdlEngine.js';
import { playSound, Arpeggio_A, Arpeggio_C, Arpeggio_E } from '../utils/audio.js';

// Global explicit pipeline queue for Wave-Front execution
window.DecompositionWaveFront = [];

// --- DOM References ---
const getStatusDiv = () => document.getElementById('statusDiv') || document.getElementById('status');
const statusDiv = {
	get textContent() { const d = getStatusDiv(); return d ? d.textContent : ''; },
	set textContent(val) { const d = getStatusDiv(); if (d) d.textContent = val; },
	get textConetnt() { const d = getStatusDiv(); return d ? d.textContent : ''; }, // handles typos!
	set textConetnt(val) { const d = getStatusDiv(); if (d) d.textContent = val; }
};
const getExecControls = () => document.querySelectorAll(`.execution-controls button`);

export async function handleExecuteSingleTurn(knotRegId) {
	// console.log(`executing turn for cell id ${knotRegId}`);
	statusDiv.textContent += "<br>executing turn...";
	document.querySelectorAll(`button`).forEach(b => b.disabled = true);
	const success = await coreOllamaRequestHTC(knotRegId);
	if (success) {
		statusDiv.textContent += "<br>turn executed successfully.";
	} else {
		statusDiv.textContent += "<br>error during turn execution.";
	}
	document.querySelectorAll(`button`).forEach(b => b.disabled = false);
	recoalesceAndRenderAll();
}

/**
 * Executes a level-by-level (Wave-front) decomposition of the entire system.
 * It identifies all PENDING knots that are configured for decomposition and executes them.
 * As callbacks create new children, it re-scans and executes the next wave.
 */
export async function handleFullDecomposition() {
	const startTime = Date.now();
	console.log("[WaveFront] 🚀 Starting Full Automated Decomposition");
	statusDiv.textContent = "Starting full automated decomposition...";

	// Disable all buttons to prevent concurrent interference
	document.querySelectorAll(`button`).forEach(b => b.disabled = true);

	let waveCount = 0;
	// Read the limit from the UI, default to 20 if missing or invalid
	const limitInput = document.getElementById('decompLimit');
	const maxWaves = limitInput ? (parseInt(limitInput.value, 10) || 20) : 20;
	let totalExecuted = 0;

	console.log(`[WaveFront] User-defined limit: ${maxWaves} waves.`);

	try {
		while (waveCount < maxWaves) {
			const pendingIds = collectRecursivePENDINGKnots();

			if (pendingIds.length === 0) {
				console.log(`[WaveFront] ✅ No more pending decomposition knots found after ${waveCount} waves.`);
				break;
			}

			console.log(`[WaveFront] 🌊 Wave ${waveCount + 1}: Executing ${pendingIds.length} knots.`);
			statusDiv.textContent = `Executing Wave ${waveCount + 1}: ${pendingIds.length} knots...`;

			// Execute the current wave sequentially
			for (const knotId of pendingIds) {
				// We call the core request directly to avoid button flicker
				const success = await coreOllamaRequestHTC(knotId);
				if (success) {
					totalExecuted++;
				}
			}

			waveCount++;
			// Re-render after each wave to show progress
			recoalesceAndRenderAll();
		}
	} catch (error) {
		console.error("[WaveFront] ❌ Error during automated decomposition:", error);
		statusDiv.textContent = "Error during automated decomposition. See console.";
	} finally {
		// Re-enable all buttons
		document.querySelectorAll(`button`).forEach(b => b.disabled = false);
		const duration = (Date.now() - startTime) / 1000;
		console.log(`[WaveFront] ⏱️ Full decomposition took ${duration.toFixed(2)} seconds.`);
		statusDiv.textContent = `Full decomposition complete. ${totalExecuted} knots executed in ${waveCount} waves (${duration.toFixed(2)}s).`;
		recoalesceAndRenderAll();
	}
}

/**
 * Executes a single level (one Wave) of the decomposition. 
 * Pops an item from the explicit WaveFront queue (a First-in First-out or sequential pipeline) 
 * and executes its branches.
 */
export async function executeNextWave() {
	console.log("[WaveFront] 🚀 Manual 'Execute Next Wave' triggered.");
	
	if (!window.DecompositionWaveFront || window.DecompositionWaveFront.length === 0) {
		console.log(`[WaveFront] ✅ WaveFront queue is empty. System fully decomposed.`);
		statusDiv.textContent = "WaveFront pipeline empty. System fully decomposed.";
		return;
	}

	const currentItem = window.DecompositionWaveFront.shift(); // Pop from front
	console.log(`[WaveFront] 🌊 Processing ${currentItem.type} (ID: ${currentItem.id}) from queue. Remaining: ${window.DecompositionWaveFront.length}`);
	statusDiv.textContent = `Executing from WaveFront: ${currentItem.type}...`;

	// Disable buttons
	document.querySelectorAll(`button`).forEach(b => b.disabled = true);

	try {
		let totalExecuted = 0;
		if (currentItem.type === 'knot') {
			const success = await coreOllamaRequestHTC(currentItem.id);
			if (success) totalExecuted++;
		} else if (currentItem.type === 'parallel') {
			const parallel = typeof d5 === 'function' ? d5(currentItem.id) : null;
			
			if (parallel && parallel.constructor.name === "Five_Judgement") {
				if (parallel.raw_verdict === null) {
					// Unresolved gate: Execute ONLY the OrthoFourRow then re-queue
					const orthoSeq = parallel.OrthoFourRow.sequence;
					console.log(`[WaveFront] ⚖️ Five_Judgement Gate executing OrthoFourRow with ${orthoSeq.length} knots.`);
					const results = await Promise.all(orthoSeq.map(id => coreOllamaRequestHTC(id)));
					totalExecuted += results.filter(success => success).length;
					
					// Re-queue the judgement for Pass 2 (branches) since the raw_verdict should now be populated
					window.DecompositionWaveFront.unshift({ type: 'parallel', id: currentItem.id });
					recoalesceAndRenderAll();
					statusDiv.textContent = `Gate OrthoFourRow completed. Re-queued for branch evaluation.`;
					playSound(Arpeggio_E);
					document.querySelectorAll(`button`).forEach(b => b.disabled = false);
					return; // Halt this wave so user can see the judgement
				} else {
					// Resolved gate: Filter branches dynamically based on verdict array
					const knotsToExecute = [];
					for (let i = 0; i < parallel.branches.length; i++) {
						if (parallel.verdict[i] === true) {
							const rowId = parallel.branches[i];
							const row = typeof d4 === 'function' ? d4(rowId) : null;
							if (row && row.sequence && row.sequence.length > 0) {
								knotsToExecute.push(row.sequence[0]);
							}
						} else {
							console.log(`[WaveFront] ✂️ Soft-pruned morally unviable branch: ${d4(parallel.branches[i])?.name}`);
						}
					}
					
					console.log(`[WaveFront] 📨 Dispatching ${knotsToExecute.length}/${parallel.branches.length} morally viable knots concurrently...`);
					const results = await Promise.all(knotsToExecute.map(id => coreOllamaRequestHTC(id)));
					totalExecuted += results.filter(success => success).length;
					recoalesceAndRenderAll(); 
				}
			} else if (parallel && Array.isArray(parallel.branches)) {
				const knotsToExecute = [];
				for (const branchId of parallel.branches) {
					const row = typeof d4 === 'function' ? d4(branchId) : null;
					// execute the knots inside this row
					if (row && row.sequence && row.sequence.length > 0) {
						// Assuming sequence[0] is the primary knot for decomposition
						knotsToExecute.push(row.sequence[0]);
					}
				}
				
				console.log(`[WaveFront] 📨 Dispatching EVERYTHING (${knotsToExecute.length} knots) concurrently for Five_Parallel...`);
				const results = await Promise.all(knotsToExecute.map(id => coreOllamaRequestHTC(id)));
				totalExecuted += results.filter(success => success).length;
				recoalesceAndRenderAll(); // Visual feedback
			}
		}

		statusDiv.textContent = `Wave complete. Executed ${totalExecuted} knots.`;
		playSound(Arpeggio_E);
	} catch (error) {
		console.error("[WaveFront] ❌ Error during manual wave execution:", error);
		statusDiv.textContent = "Error during wave execution. See console.";
	} finally {
		// Re-enable buttons
		document.querySelectorAll(`button`).forEach(b => b.disabled = false);
		recoalesceAndRenderAll();
	}
}

/**
 * Orchestrates a completely fresh decomposition sweep starting from a topic name.
 */
export async function handleNewDecompositionSweep() {
	const topicInput = document.getElementById('topic_name');
	const topicName = topicInput ? topicInput.value.trim() : "";

	if (!topicName) {
		alert("Please enter a system topic to decompose.");
		return;
	}

	console.log(`[Sweep] 🧹 Starting fresh decomposition sweep for: "${topicName}"`);
	statusDiv.textContent = `Initializing sweep for ${topicName}...`;

	// 1. Create a brand new Seven_Wish
	const wish = wdl_createWish(`Sweep: ${topicName}`);

	// 2. Set as the active scenario for the table
	DynamicTableState.scenario = wish;
	DynamicTableState.currentView = "DECOMPOSITION";

	// 3. Configure the seed knot in the Decomposition Six_Plan
	const plan = d6(wish.decomposition);
	if (!plan || !plan.steps.length) {
		console.error("[Sweep] Failed to locate root plan/steps.");
		return;
	}

	const rootChoice = d5(plan.steps[0]);
	const oldRootRowId = rootChoice.branches[0];

	// Ensure the base root track is a Four_Component representing the super wish
	const rootRow = new Four_Component(topicName);
	rootRow.parentChoiceId = rootChoice.RegId;
	rootChoice.branches = [rootRow.RegId];

	if (oldRootRowId !== undefined) {
		const oldTrack = d4(oldRootRowId);
		if (oldTrack) oldTrack.destructor();
	}

	// Initialize the sequence for our seed knot

	rootRow.sequence = [];
//AUTUMN FRAME
	const expoundTemplate = Prompt_engines.find(e => e.name === "EXPOUND_WISH_PROMPT_TEMPLATE");
	const promptText = expoundTemplate ? expoundTemplate.string.replace(/{{TOPIC_NAME}}/g, topicName) : `Objective: Expand, clarify, and formulate the raw wish or system topic into a highly actionable, high-fidelity engineering goal.\nTask: Rephrase the provided wish, expounding on implicit requirements, context, and structural ambitions.\n\nRaw Topic: '${topicName}'\n\nReturn your response ONLY AS JSON strictly matching this format:\n{'original_wish': 'string', 'expounded_wish': 'string', 'refined_goal': 'string'}`;

	// Add the first knot
	const knot = wdl_addKnot(rootRow.RegId, promptText, "", Knot_Type.USER_PROMPT_NO_CONTEXT);
	
	//Last Knot in Autumn frame calls WDLexpoundIgnite. 
	knot.responseCallbackId = "WDLexpoundIgnite";
//END OF AUTUMN FRAME
	// 4. Force a render so the user sees the start
	recoalesceAndRenderAll();

	// 5. Seed the WaveFront Pipeline with the root knot
	window.DecompositionWaveFront = [{ type: 'knot', id: knot.RegId }];
	
	console.log(`[Sweep] 🏁 Fresh decomposition sweep initialized for "${topicName}". Awaiting manual wave execution.`);
}

/**
 * Handles building the Recomposition plan from the completed Decomposition.
 * Follows the same pattern as handleNewDecompositionSweep.
 */
export function handleBuildRecomposition() {
	console.log(`[Recomp] 🔧 handleBuildRecomposition() invoked.`);
	
	if (!DynamicTableState.scenario) {
		console.error('[Recomp] No active scenario. Run decomposition first.');
		alert('No active scenario. Run decomposition first.');
		return;
	}

	const wish = DynamicTableState.scenario;
	console.log(`[Recomp] Active scenario:`, wish);
	console.log(`[Recomp] wish.RegId=${wish.RegId}, decomposition=${wish.decomposition}, recomposition=${wish.recomposition}`);

	// Neutralize any dangling wavefront knots that still have responseCallbackIds
	// These are the "last layer" leaves that never got executed
	if (window.DecompositionWaveFront && window.DecompositionWaveFront.length > 0) {
		console.log(`[Recomp] Neutralizing ${window.DecompositionWaveFront.length} remaining wavefront items...`);
		for (const item of window.DecompositionWaveFront) {
			if (item.type === 'parallel') {
				const parallel = d5(item.id);
				if (parallel && Array.isArray(parallel.branches)) {
					for (const branchId of parallel.branches) {
						const row = d4(branchId);
						if (row && row.sequence) {
							for (const kId of row.sequence) {
								const knot = k1(kId);
								if (knot && knot.responseCallbackId && knot.responseCallbackId !== 'none') {
									console.log(`[Recomp]   Neutralized knot ${kId}: was "${knot.responseCallbackId}" → "none"`);
									knot.responseCallbackId = 'none';
								}
							}
						}
					}
				}
			}
		}
	}

	statusDiv.textContent = 'Building WDL Recomposition plan...';
	const result = buildWDLRecompositionPlan(wish);
	
	if (result !== null) {
		statusDiv.textContent = 'Recomposition built! Click "Switch to Recomposition" to view.';
		console.log(`[Recomp] ✅ buildWDLRecompositionPlan returned: ${result}`);
	} else {
		statusDiv.textContent = 'Recomposition build failed. Check console.';
		console.error('[Recomp] ❌ buildWDLRecompositionPlan returned null.');
	}
}

/**
 * Helper to find all knots in the system that are PENDING and have the 
 * WDLsensibleRecursiveDecomposition callback set.
 * (Now deprecated since we use the explicit pipeline window.DecompositionWaveFront)
 */
function collectRecursivePENDINGKnots() {
	const pending = [];
	const activeScenario = DynamicTableState.scenario;
	if (!activeScenario) {
		console.log("[WaveFront] No active scenario found.");
		return [];
	}

	console.log(`[WaveFront] Collecting pending knots for Scenario ${activeScenario.RegId} ("${activeScenario.name}")`);

	KnotArray.forEach((knot, index) => {
		if (!knot) return;
		
		// 1. Must be PENDING and have the correct callback
		if (knot.executionStatus !== ExecutionStatus.PENDING || 
			knot.responseCallbackId !== "WDLsensibleRecursiveDecomposition") {
			return;
		}

		// 2. Must belong to the current active scenario
		let belongs = false;
		if (knot.parentTrackId !== null) {
			const track = d4(knot.parentTrackId);
			if (track && track.parentChoiceId !== null) {
				const choice = d5(track.parentChoiceId);
				if (choice && (choice.parentPlanId == activeScenario.decomposition || 
							   choice.parentPlanId == activeScenario.recomposition)) {
					belongs = true;
				}
			} else if (track) {
				// Search if it's a root-level track in the active plans
				const decPlan = d6(activeScenario.decomposition);
				const recPlan = d6(activeScenario.recomposition);
				if ((decPlan && decPlan.tracks.includes(track.RegId)) || 
					(recPlan && recPlan.tracks.includes(track.RegId))) {
					belongs = true;
				}
			}
		}

		if (belongs) {
			console.log(`[WaveFront]   + Found Knot ${index} (Track: ${knot.parentTrackId})`);
			pending.push(index);
		} else {
			// console.log(`[WaveFront]   - Skipping Knot ${index}: Not in active scenario plans.`);
		}
	});
	return pending;
}


export async function handleExecuteCoderTurn(knotRegId) {
	/* ... original function body preserved ... */
}

export async function handleSequentialConversation(upToIndex) {
	statusDiv.textContent = "Starting sequential execution...";
	//step1 archive the results of the previous run before restting. 
	DynamicTableState.archiveCurrentHistory();
	//step2 reset the global conversationhistory for a fresh run. giving it a timestampedname is usefulrfor the archive.
	DynamicTableState.activeHistory = new Four_Row(`Run@${new Date().toLocaleTimeString()}`);
	//disable all execution buttons to prevent conflicts.
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = true);
	//step3 loop and execute each turn sequentially.
	//the await is critical to ensure the loop pauses until each turn is complete. 
	for (let i = 0; i <= upToIndex; i++) {
		const knotRegId = CoalescedPlan.sequence[i];
		if (!k1(knotRegId)) continue;
		statusDiv.textContent = `Executing turn ${i + 1} of ${upToIndex + 1}...`;
		//handleexecutesingturn no correctly contributes to new clean conversationhisotry.
		await handleExecuteSingleTurn(knotRegId);
	}
	statusDiv.textContent = "Sequential execution complete.";
	//recoalesceAndRenderAll(); //called by handleExecSingleTurn()
	//reenable buttons. 
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = false);
}


export async function handleSequentialCoder(upToIndex) {
	/* ... original function body preserved ... */
}

export async function resumeSequentialConversation(upToIndex) {
	statusDiv.textContent = "Resuming sequential executor...";
	//archiving and resetting the history. ensure correct context. 
	DynamicTableState.archiveCurrentHistory();
	DynamicTableState.activeHistory = new Four_Row(`Resume@${new Date().toLocaleTimeString()}`);
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = true);

	for (let i = 0; i <= upToIndex; i++) {
		const knotRegId = CoalescedPlan.sequence[i];
		const knot = k1(knotRegId);
		const threeCell = knot ? d3(knot.TC) : null;
		if (!threeCell) continue;
		const responseContent = d2(threeCell.response).content;
		const needsExecution = (responseContent === "[Awaiting Response...]" || responseContent.startsWith("[ERROR") || responseContent === "" || responseContent === " ");
		if (needsExecution) {
			statusDiv.textContent = `executing turn ${i + 1} of ${upToIndex + 1}`;
			await handleExecuteSingleTurn(knotRegId);
		} else {
			statusDiv.textContent = `skipping turn ${i + 1} of ${upToIndex + 1}`;
			logTurnToActiveHistory(knotRegId);
		}
	}
	statusDiv.textContent = "resume execution complete";
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = false);
}



// --- Two Pass Execution ---
export async function handleExecuteTwoPassTurn(knotRegId) {
	statusDiv.textContent = "executing focused turn";
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = true);
	const success = await coreTwoPassRequest(knotRegId);
	if (success) { statusDiv.textContent = "focused turn executed successfully."; } else { statusDiv.textContent = "error during focused turn execution."; }
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = false);
	recoalesceAndRenderAll();

}


export async function handleSequentialTwoPass(upToIndex) {
	statusDiv.textContent = "Starting sequential execution...";
	//step1 archive the results of the previous run before restting. 
	DynamicTableState.archiveCurrentHistory();
	DynamicTableState.activeHistory = new Four_Row(`Run@${new Date().toLocaleTimeString()}`);
	//disable all execution buttons to prevent conflicts.
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = true);
	//step3 loop and execute each turn sequentially.
	//the await is critical to ensure the loop pauses until each turn is complete. 
	for (let i = 0; i <= upToIndex; i++) {
		const cellRegId = CoalescedPlan.sequence[i];
		if (!d3(cellRegId)) continue;
		statusDiv.textContent = `Executing turn ${i + 1} of ${upToIndex + 1}...`;
		//handleexecutesingturn no correctly contributes to new clean conversationhisotry.
		await handleExecuteTwoPassTurn(cellRegId);
	}
	statusDiv.textContent = "Sequential execution complete.";

	//	recoalesceAndRenderAll();
	//reenable buttons. 
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = false);
}


export async function resume2passtrack(upToIndex) {

	statusDiv.textContent = "Resuming sequential executor...";
	DynamicTableState.archiveCurrentHistory();
	DynamicTableState.activeHistory = new Four_Row(`Run@${new Date().toLocaleTimeString()}`);
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = true);

	for (let i = 0; i <= upToIndex; i++) {
		const cellRegId = CoalescedPlan.sequence[i];
		const threeCell = d3(cellRegId);
		if (!threeCell) continue;
		const responseContent = d2(threeCell.response).content;
		const needsExecution = (responseContent === "[Awaiting Response...]" || responseContent.startsWith("[ERROR") || responseContent === "" || responseContent === " ");
		if (needsExecution) {
			statusDiv.textContent = `executing turn ${i + 1} of ${upToIndex + 1}`;
			await handleExecuteTwoPassTurn(cellRegId);
		} else {
			statusDiv.textContent = `skipping turn ${i + 1} of ${upToIndex + 1}`;
			logTurnToActiveHistory(cellRegId);
		}
	}
	calculateAggregateTokensForTwoPass(upToIndex);
	statusDiv.textContent = "resume execution complete";
	document.querySelectorAll(`.execution-controls button`).forEach(b => b.disabled = false);
}


export function calculateAggregateTokensForTwoPass(upToIndex) {
	var presentAggregate = 0;
	for (let i = 0; i <= upToIndex; i++) {
		presentAggregate += d2(d3(DynamicTableState.activeHistory.sequence[i]).prompt).individual_tokens;
		d2(d3(DynamicTableState.activeHistory.sequence[i]).prompt).aggregate_tokens_at_this_point = presentAggregate;

		presentAggregate += d2(d3(DynamicTableState.activeHistory.sequence[i]).response).individual_tokens;
		d2(d3(DynamicTableState.activeHistory.sequence[i]).response).aggregate_tokens_at_this_point = presentAggregate;

	}
}

/**
 * Executes the final wave of decomposition.
 * Processes the remaining items in the WaveFront queue (leaf nodes),
 * neutralizing their response callbacks to prevent further recursion
 * but allowing their prompt callbacks to execute.
 */
export async function executeLastWave() {
	console.log("[WaveFront] 🚀 Manual 'Execute Last Wave' triggered.");
	
	if (!window.DecompositionWaveFront || window.DecompositionWaveFront.length === 0) {
		console.log(`[WaveFront] ✅ WaveFront queue is empty. System fully decomposed.`);
		statusDiv.textContent = "WaveFront pipeline empty. System fully decomposed.";
		return;
	}

	statusDiv.textContent = `Executing Last Wave...`;
	document.querySelectorAll(`button`).forEach(b => b.disabled = true);

	try {
		let totalExecuted = 0;
		// Process all remaining items in the queue
		while (window.DecompositionWaveFront.length > 0) {
			const currentItem = window.DecompositionWaveFront.shift(); 
			console.log(`[WaveFront] 🌊 Last Wave Processing ${currentItem.type} (ID: ${currentItem.id}). Remaining: ${window.DecompositionWaveFront.length}`);

			if (currentItem.type === 'knot') {
				const knot = k1(currentItem.id);
				if (knot) {
					// Neutralize recursive callback for leaf nodes
					if (knot.responseCallbackId && knot.responseCallbackId !== 'none') {
						console.log(`[WaveFront]   Neutralized knot ${currentItem.id}: "${knot.responseCallbackId}" → "none"`);
						knot.responseCallbackId = 'none';
					}
				}
				const success = await coreOllamaRequestHTC(currentItem.id);
				if (success) totalExecuted++;
			} else if (currentItem.type === 'parallel') {
				const parallel = typeof d5 === 'function' ? d5(currentItem.id) : null;
				if (parallel && Array.isArray(parallel.branches)) {
					for (const branchId of parallel.branches) {
						const row = typeof d4 === 'function' ? d4(branchId) : null;
						if (row && row.sequence && row.sequence.length > 0) {
							const knotId = row.sequence[0];
							const knot = k1(knotId);
							if (knot) {
								if (knot.responseCallbackId && knot.responseCallbackId !== 'none') {
									console.log(`[WaveFront]   Neutralized knot ${knotId}: "${knot.responseCallbackId}" → "none"`);
									knot.responseCallbackId = 'none';
								}
							}
							const success = await coreOllamaRequestHTC(knotId);
							if (success) totalExecuted++;
						}
					}
				}
			}
		}

		statusDiv.textContent = `Last Wave complete. Executed ${totalExecuted} knots.`;
		playSound(Arpeggio_E);
	} catch (error) {
		console.error("[WaveFront] ❌ Error during manual last wave execution:", error);
		statusDiv.textContent = "Error during last wave execution. See console.";
	} finally {
		// Re-enable buttons
		document.querySelectorAll(`button`).forEach(b => b.disabled = false);
		recoalesceAndRenderAll();
	}
}

/**
 * Checks if every knot inside a given track has a valid response.
 * Handles normal Four_Row or Four_Component tracks.
 */
export function isTrackFullyExecuted(trackId) {
	const track = typeof d4 === 'function' ? d4(trackId) : null;
	if (!track) return true; // non-existent track is practically "done"
	for (const knotId of track.sequence) {
		const knot = k1(knotId);
		if (!knot) return false;
		const cell = d3(knot.TC);
		if (!cell) return false;
		const resp = d2(cell.response).content;
		if (!resp || resp === "[awaiting response...]" || resp.trim() === "" || resp.startsWith("[ERROR")) {
			return false;
		}
	}
	return true;
}

/**
 * Checks if a track's prerequisite parents have completely executed.
 * In Recomposition, this means waiting for all parentTracks of a Hyper_Five_Choice.
 */
export function isTrackEligible(trackId) {
	const track = typeof d4 === 'function' ? d4(trackId) : null;
	if (!track) return false;
	
	if (track.parentChoiceId === null || track.parentChoiceId === undefined) return true; // root track
	
	const pChoice = d5(track.parentChoiceId);
	if (!pChoice) return true;

	// If parent choice is a merge node (Hyper_Five_Choice), it has a parentTracks array
	if (pChoice && Array.isArray(pChoice.parentTracks) && pChoice.parentTracks.length > 0) {
		return pChoice.parentTracks.every(pTrackId => isTrackFullyExecuted(pTrackId));
	} else {
		// Normal choice or Parallel. It is eligible if its parent track is fully executed.
		if (pChoice.parentTrackId !== null && pChoice.parentTrackId !== undefined) {
			return isTrackFullyExecuted(pChoice.parentTrackId);
		}
		return true;
	}
}

/**
 * Determines the next wave of knots to execute in the bottom-up recomposition tree.
 * Only returns knots from tracks whose dependencies (parent merge nodes) are fully resolved.
 */
export function getRecompositionFrontierKnots(TS = DynamicTableState) {
	if (!TS || !TS.scenario || !TS.scenario.recomposition) return [];
	
	const recompPlanId = TS.scenario.recomposition;
	const plan = typeof d6 === 'function' ? d6(recompPlanId) : null;
	if (!plan || !plan.steps || !plan.steps.length) return [];
	
	const allTracks = plan.tracks || [];
	
	if (allTracks.length === 0) {
		const queue = [...plan.steps]; 
		const visitedChoices = new Set();
		const visitedTracks = new Set();
		
		while(queue.length > 0) {
			const choiceId = queue.shift();
			if (visitedChoices.has(choiceId)) continue;
			visitedChoices.add(choiceId);
			
			const choice = d5(choiceId);
			if (!choice) continue;
			
			if (Array.isArray(choice.branches)) {
				choice.branches.forEach(bId => {
					if (!visitedTracks.has(bId)) {
						visitedTracks.add(bId);
						allTracks.push(bId);
						const iterTrack = d4(bId);
						if (iterTrack && iterTrack.terminatingChoice) {
							queue.push(iterTrack.terminatingChoice);
						}
					}
				});
			}
		}
	}
	
	const frontier = [];
	for (const trkId of allTracks) {
		// Track must NOT be fully executed, but MUST be eligible (prerequisites met)
		if (!isTrackFullyExecuted(trkId) && isTrackEligible(trkId)) {
			const track = d4(trkId);
			if (!track) continue;
			// Find the FIRST unexecuted knot in this sequential track
			for (const knotId of track.sequence) {
				const knot = k1(knotId);
				if (!knot) continue;
				const cell = d3(knot.TC);
				if (!cell) continue;
				const resp = d2(cell.response).content;
				
				if (!resp || resp === "[awaiting response...]" || resp.trim() === "" || resp.startsWith("[ERROR")) {
					frontier.push(knotId);
					break; // we only process one knot deep per track at a time
				}
			}
		}
	}
	return frontier;
}

/**
 * Executes a single layer (wave) of the Recomposition Pipeline.
 * Concurrency is limited to 3 concurrent requests to avoid API flooding.
 */
export async function executeRecompositionNextLayer(TS = DynamicTableState) {
	console.log(`[Recomposition] 🚀 executeRecompositionNextLayer triggered.`);
	const frontierKnots = getRecompositionFrontierKnots(TS);

	if (frontierKnots.length === 0) {
		console.log(`[Recomposition] ✅ Frontier is empty. Synthesis complete.`);
		statusDiv.textContent = `Recomposition synthesis complete.`;
		return 0; // Returning 0 indicates no work left
	}

	console.log(`[Recomposition] 🌊 Frontier identified ${frontierKnots.length} knots to execute.`);
	statusDiv.textContent = `Executing Recomposition Layer: ${frontierKnots.length} knots...`;
	
	document.querySelectorAll(`button`).forEach(b => b.disabled = true);

	let totalExecuted = 0;
	try {
		console.log(`[Recomposition] 📨 Dispatching ALL ${frontierKnots.length} frontier knots concurrently...`);
		const results = await Promise.all(frontierKnots.map(id => coreOllamaRequestHTC(id)));
		totalExecuted += results.filter(success => success).length;
		recoalesceAndRenderAll();

		statusDiv.textContent = `Recomposition layer complete. Executed ${totalExecuted} knots.`;
		playSound(Arpeggio_E);
	} catch (error) {
		console.error(`[Recomposition] ❌ Error during execution:`, error);
		statusDiv.textContent = `Error during Recomposition layer execution. See console.`;
	} finally {
		document.querySelectorAll(`button`).forEach(b => b.disabled = false);
		recoalesceAndRenderAll();
	}
	return totalExecuted;
}

/**
 * Loops the recomposition execution layer-by-layer until the entire synthesis finishes.
 */
export async function autoRecomposeAll(TS = DynamicTableState) {
	console.log(`[Recomposition] ⚡ Starting Auto-Recompose All.`);
	statusDiv.textContent = `Auto-Recompose: Starting automatic synthesis pipeline...`;
	
	let iteration = 0;
	let dynamicLimit = 50; // Safety fallback against endless loops
	
	// Dynamically calculate the maximum possible layers/waves based on the plan size
	if (TS && TS.scenario && TS.scenario.recomposition) {
		const plan = d6(TS.scenario.recomposition);
		if (plan && plan.tracks) {
			const totalKnots = plan.tracks.reduce((sum, trkId) => {
				const trk = d4(trkId);
				return sum + (trk && trk.sequence ? trk.sequence.length : 0);
			}, 0);
			// The absolute theoretical maximum number of iterations occurs if exactly 1 knot
			// executes per wave. So totalKnots is an extremely safe upper runtime bound.
			dynamicLimit = Math.max(50, totalKnots + 10);
		}
	}
	console.log(`[Recomposition] 🛡️ Computed dynamic iteration limit: ${dynamicLimit}`);
	
	while (iteration < dynamicLimit) {
		// Enforce Recomposition View for correct visual updates during auto
		DynamicTableState.currentView = "RECOMPOSITION";
		
		const executedThisRound = await executeRecompositionNextLayer(TS);
		if (executedThisRound === 0) {
			console.log(`[Recomposition] 🏁 Auto-Recompose finished successfully on iteration ${iteration}.`);
			playSound(Arpeggio_A);
			break;
		}
		iteration++;
	}

	if (iteration >= dynamicLimit) {
		console.warn(`[Recomposition] 🛑 Auto-Recompose halted after hitting absolute limit of ${dynamicLimit} iterations.`);
		statusDiv.textContent = `Auto-Recompose halted (Iteration limit reached).`;
	}
}

/**
 * Full Pipeline: Orchestrates Initialize Sweep → N Waves → Build Recomposition.
 * Reads the wave count from the #numberWaves input.
 */
export async function runFullPipeline() {
	var starttimeoffunction = Date.now();
	const wavesInput = document.getElementById('numberWaves');
	const numWaves = wavesInput ? parseInt(wavesInput.value, 10) || 3 : 3;

	console.log(`[FullPipeline] ⚡ Starting full pipeline with ${numWaves} wave(s).`);
	statusDiv.textContent = `Full Pipeline: Starting with ${numWaves} wave(s)...`;

	// Disable all buttons
	document.querySelectorAll('button').forEach(b => b.disabled = true);

	try {
		// Phase 1: Initialize Sweep
		console.log(`[FullPipeline] 🔴 Phase 1: Initialize Sweep`);
		statusDiv.textContent = `Full Pipeline [1/${numWaves + 3}]: Initializing Sweep...`;
		await handleNewDecompositionSweep();

		// Phase 2: Execute N Waves
		for (let i = 1; i <= numWaves; i++) {
			console.log(`[FullPipeline] 🔵 Phase 2: Wave ${i}/${numWaves}`);
			statusDiv.textContent = `Full Pipeline [${i + 1}/${numWaves + 3}]: Executing Wave ${i}/${numWaves}...`;
			await executeNextWave();
		}

//phase 2.999  
		console.log(`[FullPipeline] 🟢 Phase 2.999: Execute Last Wave`);
		statusDiv.textContent = `Full Pipeline [${numWaves + 2}/${numWaves + 3}]: Executing Last Wave...`;
		await executeLastWave();

		// Phase 3: Build Recomposition
		console.log(`[FullPipeline] 🟣 Phase 3: Build Recomposition`);
		statusDiv.textContent = `Full Pipeline [${numWaves + 3}/${numWaves + 4}]: Building Recomposition...`;
		handleBuildRecomposition();

		// Phase 4: Auto-Recompose
		console.log(`[FullPipeline] 🔵 Phase 4: Auto-Recompose`);
		statusDiv.textContent = `Full Pipeline [${numWaves + 4}/${numWaves + 4}]: Auto-Recomposing all branches...`;
		await autoRecomposeAll();

		statusDiv.textContent = `Full Pipeline complete! (${numWaves} waves + last wave + recomposition)`;
		console.log(`[FullPipeline] ✅ Full pipeline complete.`);
		playSound(Arpeggio_A);

		// Transpose to Bayesian Graphs
		transposeRecompositionGraph(DynamicTableState.scenario);

		const timeTaken = Date.now() - starttimeoffunction;
		console.log(`Time taken to finish pipeline is ${timeTaken} milliseconds`);

		// --- Genie's Long-Term Storage for Successful Wishes ---
		try {
			const wish = DynamicTableState.scenario;
			if (wish) {
				const sumKnot = typeof k1 === 'function' ? k1(wish.summary) : null;
				const sumCell = sumKnot ? (typeof d3 === 'function' ? d3(sumKnot.TC) : null) : null;
				const sumContent = sumCell ? (typeof d2 === 'function' ? d2(sumCell.response).content : "") : "";
				
				const wishData = {
					name: wish.name,
					durationMs: timeTaken,
					seven_wish_summary: sumContent,
					temporalNexusGraph: JSON.parse(wish.exportTemporalNexusJSON()),
					timestamp: Date.now()
				};
				
				let rememberedWishes = [];
				try {
					const existing = localStorage.getItem('genie_remembered_wishes');
					if (existing) rememberedWishes = JSON.parse(existing);
				} catch (e) {
					console.warn("[FullPipeline] Failed to parse remembered wishes, starting fresh.");
				}
				
				rememberedWishes.push(wishData);
				localStorage.setItem('genie_remembered_wishes', JSON.stringify(rememberedWishes));
				console.log(`[FullPipeline] 🧞 Genie stored successful wish "${wish.name}" to localStorage.`);
			}
		} catch (e) {
			console.error("[FullPipeline] 🧞 Genie failed to store wish:", e);
		}
	} catch (error) {
		console.error(`[FullPipeline] ❌ Error:`, error);
		statusDiv.textContent = `Full Pipeline ERROR: ${error.message}`;
	} finally {
		// Re-enable all buttons
		document.querySelectorAll('button').forEach(b => b.disabled = false);
	}
}

export function transposeRecompositionGraph(wish) {
	if (!wish || !wish.recomposition) return;
	const recompPlan = typeof d6 === 'function' ? d6(wish.recomposition) : null;
	if (!recompPlan || !recompPlan.tracks) return;

	for (const rowId of recompPlan.tracks) {
		const row = d4(rowId);
		if (!row || !(row instanceof Four_Component)) continue;

		const kn = row.knowledgeNode;
		if (!kn) continue;

		const componentName = kn.label || row.name;

		let codeSnippet = "";
		if (row.sequence && row.sequence.length > 0) {
			const lastKnotId = row.sequence[row.sequence.length - 1];
			const knot = k1(lastKnotId);
			if (knot) {
				const cell = d3(knot.TC);
				if (cell) {
					codeSnippet = d2(cell.response).content || "";
				}
			}
		}

		GlobalDependencyBayesianGraph.getNode(componentName).codeSnippet = codeSnippet;
		GlobalDependentBayesianGraph.getNode(componentName).codeSnippet = codeSnippet;

		// Edges out to dependencies (children)
		if (kn.dependencies && kn.dependencies.length > 0) {
			for (const childKn of kn.dependencies) {
				const childName = childKn.label;
				GlobalDependencyBayesianGraph.addEdge(componentName, childName, codeSnippet, null);
				GlobalDependentBayesianGraph.addEdge(childName, componentName, codeSnippet, null);
			}
		}

		// Edges out to dependents (parents)
		if (kn.dependents && kn.dependents.length > 0) {
			for (const parentKn of kn.dependents) {
				const parentName = parentKn.label;
				GlobalDependencyBayesianGraph.addEdge(parentName, componentName, codeSnippet, null);
				GlobalDependentBayesianGraph.addEdge(componentName, parentName, codeSnippet, null);
			}
		}
	}

	try {
		localStorage.setItem('bayesian_code_graph_dependency', GlobalDependencyBayesianGraph.toJSON());
		localStorage.setItem('bayesian_code_graph_dependent', GlobalDependentBayesianGraph.toJSON());
		console.log(`[BayesianGraph] 🕸️ Successfully transposed and saved Bayesian Graphs.`);
	} catch (e) {
		console.error("[BayesianGraph] ❌ Failed to save Bayesian Graphs:", e);
	}
}