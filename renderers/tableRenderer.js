import { d2, d3, d4, d5, d6, d7, k1, DynamicTableState, CoalescedPlan } from '../core/state.js';
import { Four_Row, Three_Cell, Five_Choice, Five_Parallel, Hyper_Five_Choice, Reverse_Five_Parallel } from '../models/WISH.js';
import { handleExecuteCoderTurn, handleExecuteSingleTurn, handleExecuteTwoPassTurn, handleSequentialCoder, handleSequentialConversation, handleSequentialTwoPass, resume2passtrack, resumeSequentialConversation } from '../services/tableExecutionSuite.js';

export function handleAddNewCoderTrack(choiceRegid) {
	if (choiceRegid === undefined && DynamicTableState.scenario && DynamicTableState.scenario.decomposition) {
		const plan = d6(DynamicTableState.scenario.decomposition);
		choiceRegid = plan ? plan.steps[0] : null;
	}
	const rootChoice = d5(choiceRegid);
	if (!rootChoice) {
		console.error("cannot add coder track: root choice not found.");
		return;
	}
	//1. create the pair of Four_row tracks. 
	const cellCoderTrack = new Four_Row("Cell Coder Track");
	const horizontalCoderTrack = new Four_Row("Horizontal Coder Track");

	//2. COnfigure them as a pair
	cellCoderTrack.pairedCoderTrackId = horizontalCoderTrack.RegId;
	//3. Add them as new branches to the root choice. 
	rootChoice.addBranch(cellCoderTrack.RegId);
	rootChoice.addBranch(horizontalCoderTrack.RegId);

	//4. add an initial synchronized turn to both 
	cellCoderTrack.addCell();
	//console.log(`created new coder track pair: cell coder (ID: ${cellCoderTrack.RegId}, Paired with ${horizontalCoderTrack.RegId}) and horizontal coder (ID: ${horizontalCoderTrack.RegId})`);
	recoalesceAndRenderAll();

}

function insertAfter(parentElement, newElement, referenceElement) {
	const nextSibling = referenceElement.nextSibling;
	if (nextSibling) {
		parentElement.insertBefore(newElement, nextSibling);
	} else {
		parentElement.appendChild(newElement);
	}
}

export function renderDynamicScenarioTable(TS) {
	//console.log(`[renderDynamicScenarioTable] Attempting to render TS:`, TS);
	const tableContainerLocal = document.getElementById('dynamicTableTracksContainer'); // explicitly find it if window global is broken
	const container = window.dynamicTableTracksContainer || tableContainerLocal;

	if (!container) {
		console.error("[renderDynamicScenarioTable] cant find dyanmic table...");
		return;
	}
	container.innerHTML = "";

	const currentView = TS.currentView || "DECOMPOSITION";
	const targetPlanId = (currentView === "RECOMPOSITION") ? TS.scenario?.recomposition : TS.scenario?.decomposition;
	const plan = targetPlanId !== undefined ? d6(targetPlanId) : null;
	const rootChoice = plan && plan.steps && plan.steps.length > 0 ? d5(plan.steps[0]) : null;

	const headerEl = document.querySelector('h2[style*="gold-24kt"]');
	if (headerEl) headerEl.textContent = `Scenario Tracks (${currentView})`;

	if (rootChoice) {
		//console.log(`[renderDynamicScenarioTable] Iterating branches length: ${rootChoice.branches.length}`);

		// In RECOMPOSITION view, the root choice branches are the leaf rows.
		// We also need to render any Hyper_Five_Choice merge nodes and their outgoing branches.
		const renderedMergeChoices = new Set();

		rootChoice.branches.forEach(branchRegId => {
			const track = d4(branchRegId);
			//console.log(`[renderDynamicScenarioTable] Evaluating branch d4(${branchRegId}):`, track);
			const isPaired = d5(track.parentChoiceId)?.branches.some(otherId => d4(otherId)?.pairedCoderTrackId === track.RegId);
			if (!isPaired) {
				//console.log(`[renderDynamicScenarioTable] Branch is not paired. Calling recursivelyRenderTrack...`);
				recursivelyRenderTrack(branchRegId, null, true, renderedMergeChoices);
			} else {
				//console.log(`[renderDynamicScenarioTable] Branch IS paired. Skipping default render.`);
			}
		});
	} else {
		console.warn(`[renderDynamicScenarioTable] rootChoice is null. Skipping rendering.`);
	}
}


export function recursivelyRenderTrack(trackRegId, parenttr = null, isNOTAnExpectedHorizontalTrack = true, renderedMergeChoices = new Set(), inheritedRowspan = 1) {
	//console.log(`[recursivelyRenderTrack] Intruding trackRegId: ${trackRegId}`);
	const track = d4(trackRegId);
	if (!track) {
		console.warn(`[recursivelyRenderTrack] Aborted: track is null for ID: ${trackRegId}`);
		return;
	}

	const isInstanceOf = (track instanceof Four_Row) || (track && track.constructor && (track.constructor.name === "Four_Row" || track.constructor.name === "Four_Component"));
	//console.log(`[recursivelyRenderTrack] track valid for render? ${isInstanceOf}`, track.constructor ? track.constructor.name : 'no constructor');

	if (!isInstanceOf) {
		console.warn(`[recursivelyRenderTrack] Aborted: track is not a recognized Row type. Constructor is ${track.constructor ? track.constructor.name : 'N/A'}`);
		return;
	}

	const isHorizontalTrack = d5(track.parentChoiceId)?.branches.some(otherId => d4(otherId)?.pairedCoderTrackId === track.RegId);
	//console.log(`[recursivelyRenderTrack] isHorizontalTrack? ${isHorizontalTrack}, isNOTAnExpectedHorizontalTrack? ${isNOTAnExpectedHorizontalTrack}`);
	if (isHorizontalTrack && isNOTAnExpectedHorizontalTrack) {
		//console.log(`[recursivelyRenderTrack] Aborted: Horizontal track mismatch.`);
		return;
	}

	const tr = document.createElement('tr');
	tr.id = track.id;

	let startColumn = 0;
	const parentChoice = d5(track.parentChoiceId);
	if (parentChoice) {
		startColumn = parentChoice.getOffset();
	}
	//add empty padding cells to create the correct indentation. 
	//startColumn--;
	for (let i = 0; i < startColumn; i++) {
		const padTd = document.createElement('td');
		padTd.className = 'offset-cell';
		tr.appendChild(padTd);
	}

	if (parentChoice) {
		const padTd = document.createElement('td');
		padTd.className = 'choice-connector-cell';
		padTd.style.backgroundColor = parentChoice.branchesColour;
		tr.appendChild(padTd);
	}
	//2 - render the track's content
	const headerEl = track.yieldRowHeader();
	if (inheritedRowspan > 1) { headerEl.setAttribute('rowspan', inheritedRowspan); }
	tr.appendChild(headerEl);

	track.sequence.forEach(knotRegId => {
		const knot = typeof k1 === 'function' ? k1(knotRegId) : null;
		if (knot) {
			const knotEl = knot.yieldElement();
			if (inheritedRowspan > 1) { knotEl.setAttribute('rowspan', inheritedRowspan); }
			tr.appendChild(knotEl);
		}
	});


	//3 insert this tracks row into the Dom
	if (parenttr) {
		//if its a branch insert it after its parents row.
		insertAfter(dynamicTableTracksContainer, tr, parenttr);
	} else {
		//if its not a root track just append it. 
		dynamicTableTracksContainer.appendChild(tr);
	}

	//8-september
	if (track.pairedCoderTrackId !== null) {
		const pairedTrack = d4(track.pairedCoderTrackId);
		if (pairedTrack) {
			recursivelyRenderTrack(pairedTrack.RegId, tr, false);
		}
	}

	//4. render the terminating choice and recurse for branches. 
	const choiceId = track.terminatingChoice;
	//console.log(`[recursivelyRenderTrack] track.terminatingChoice for ${track.name} is: ${choiceId}`);
	const choice = d5(choiceId);
	if (choice) {
		//console.log(`[recursivelyRenderTrack] Found choice object. instanceof Five_Choice? ${choice instanceof Five_Choice}, instanceof Five_Parallel? ${choice instanceof Five_Parallel}, instanceof Hyper_Five_Choice? ${choice instanceof Hyper_Five_Choice}`);

		if (choice instanceof Reverse_Five_Parallel) {
			// Reverse_Five_Parallel: convergent native rendering. First encountered track renders merger block.
			if (!renderedMergeChoices.has(choice.RegId)) {
				renderedMergeChoices.add(choice.RegId);
				const choiceCell = choice.yieldElement();
				tr.appendChild(choiceCell);

				// Proactively construct the outbound spanning branch on THIS exact <tr> horizontal boundary!
				if (choice.branches && choice.branches.length > 0) {
					const outBranch = d4(choice.branches[0]);
					if (outBranch) {
						recursivelyRenderTrack(outBranch.RegId, tr, true, renderedMergeChoices, choice.structuralHeight || 1);
					}
				}
			}
			return; // Subsequent sibling Parent tracks natively skip yielding, letting spanned geometry overlay correctly.
		} else if (choice instanceof Hyper_Five_Choice) {
			// Hyper_Five_Choice: convergence merge node for Recomposition.
			// Only render the merge cell ONCE (on the first parent track that encounters it).
			if (!renderedMergeChoices.has(choice.RegId)) {
				renderedMergeChoices.add(choice.RegId);
				const choiceCell = choice.yieldElement();
				tr.appendChild(choiceCell);
			}

			// Defer recurring into the single outgoing branch until the LAST parent track is processed
			// This explicitly forces `outBranch` tr row creation sequentially AFTER all parent branches structurally loop.
			choice.processedParentCount = (choice.processedParentCount || 0) + 1;
			if (choice.processedParentCount >= choice.parentTrackIds.length) {
				choice.processedParentCount = 0; // reset
				if (choice.branches && choice.branches.length > 0) {
					const outBranch = d4(choice.branches[0]);
					if (outBranch) {
						recursivelyRenderTrack(outBranch.RegId, tr, true, renderedMergeChoices);
					}
				}
			}
		} else if (choice instanceof Five_Choice || choice instanceof Five_Parallel || typeof choice.yieldElement === 'function') {
			const choiceCell = choice.yieldElement();//get the td  
			tr.appendChild(choiceCell);
			//recusivelyrender all branches.
			if (choice.branches) {
				choice.branches.forEach(branchRegId => {
					const branchTrack = d4(branchRegId);
					if (branchTrack && track.pairedCoderTrackId !== branchTrack.RegId) {
						recursivelyRenderTrack(branchRegId, tr, true, renderedMergeChoices);
					}
				});
			}
		} else {
			console.warn(`[recursivelyRenderTrack] choice found but doesn't match expected types or lacks yieldElement.`);
		}
	}

}



export function coalesceScenarioToPlan(TS) {
	//console.log("[coalesceScenarioToPlan] Start of function");
	CoalescedPlan.sequence = [];
	if (!TS || !TS.scenario) return;
	const plan = TS.scenario.decomposition ? d6(TS.scenario.decomposition) : TS.scenario;
	if (!plan || !plan.steps || !plan.steps.length) return;

	const traverse = (trk) => {
		const track = d4(trk);
		if (!track) return;
		//console.log(`[coalesceScenarioToPlan] 📍 Traversed into Track: ${track.name} (RegId: ${track.RegId})`);

		const isHorizontalCoderTrack = d5(track.parentChoiceId)?.branches.some(otherId => d4(otherId)?.pairedCoderTrackId === track.RegId);
		if (isHorizontalCoderTrack) return;

		// Add all knots from the current track's sequence
		for (const knotRegId of track.sequence) {
			CoalescedPlan.sequence.push(knotRegId);
		}

		// Traversal: Find child branches and recurse
		const choice = d5(track.terminatingChoice);
		if (choice instanceof Five_Parallel) {
			//console.log(`[coalesceScenarioToPlan] ⏩ Choice ${choice.RegId} is PARALLEL. Spawning ${choice.branches.length} recursive branches.`);
			choice.branches.forEach(branchId => {
				if (d4(branchId) instanceof Four_Row) {
					traverse(branchId);
				}
			});
		} else if (choice instanceof Hyper_Five_Choice) {
			//console.log(`[coalesceScenarioToPlan] 🔮 Choice ${choice.RegId} is HYPER_MERGE. Following single outgoing branch.`);
			if (choice.branches.length > 0 && d4(choice.branches[0]) instanceof Four_Row) {
				traverse(choice.branches[0]);
			}
		} else if ((choice instanceof Five_Choice) && choice.selectedBranchId !== null) {
			//console.log(`[coalesceScenarioToPlan] 🔀 Choice ${choice.RegId} is SELECTIVE. Branching to single index: ${choice.selectedBranchId}`);
			if (d4(choice.selectedBranchId) instanceof Four_Row) {
				traverse(choice.selectedBranchId);
			}
		}
	};

	const rootChoice = d5(plan.steps[0]);
	if (rootChoice) {
		//console.log(`[coalesceScenarioToPlan] Starting traverse from root choice: ${rootChoice.conditional_phrase}`);
		if (rootChoice.selectedBranchId) {
			traverse(rootChoice.selectedBranchId);
		} else if (rootChoice instanceof Five_Parallel) {
			rootChoice.branches.forEach(bId => traverse(bId));
		}
	}
	//console.log(`[coalesceScenarioToPlan] Trace complete. Sequence length: ${CoalescedPlan.sequence.length}`);
}

export function CoalesceDecompositionSixPlanToExecutionFourRow(TS) {
	//console.log("[CoalesceDecompositionSixPlanToExecutionFourRow] Starting BFS trace...");
	CoalescedPlan.sequence = [];
	if (!TS || !TS.scenario) return;
	const plan = TS.scenario.decomposition ? d6(TS.scenario.decomposition) : TS.scenario;
	if (!plan || !plan.steps || !plan.steps.length) return;

	// Breadth-First Traversal (BFS) variant
	const queue = [];

	const rootChoice = d5(plan.steps[0]);
	if (rootChoice) {
		//console.log(`[BFS Trace] Initializing queue with ${rootChoice.branches.length} branches.`);
		if (rootChoice instanceof Five_Parallel) {
			rootChoice.branches.forEach(br => queue.push(br));
		} else if (rootChoice.selectedBranchId) {
			queue.push(rootChoice.selectedBranchId);
		}
	}

	while (queue.length > 0) {
		const trkId = queue.shift();
		const track = d4(trkId);
		if (!track) continue;
		//console.log(`[BFS Trace] Processing track: ${track.name} (ID: ${trkId})`);

		const isHorizontalCoderTrack = d5(track.parentChoiceId)?.branches.some(otherId => d4(otherId)?.pairedCoderTrackId === track.RegId);
		if (isHorizontalCoderTrack) continue;

		for (const knotId of track.sequence) {
			if (!CoalescedPlan.sequence.includes(knotId)) {
				CoalescedPlan.sequence.push(knotId);
			}
		}

		const choice = d5(track.terminatingChoice);
		if (choice instanceof Five_Parallel) {
			//console.log(`[BFS Trace] Adding ${choice.branches.length} parallel branches to queue.`);
			choice.branches.forEach(branchId => queue.push(branchId));
		} else if (choice instanceof Five_Choice && choice.selectedBranchId) {
			queue.push(choice.selectedBranchId);
		}
	}
	//console.log(`[BFS Trace] Complete. Sequence length: ${CoalescedPlan.sequence.length}`);
}


export async function executeDecompositionNextLayer(TS = DynamicTableState) {
	if (!TS || !TS.scenario) return;
	const plan = TS.scenario.decomposition ? d6(TS.scenario.decomposition) : TS.scenario;
	if (!plan || !plan.steps || !plan.steps.length) return;

	// 1. Gather all tracks from the scenario tree
	const allTracks = [];
	const collectTracksBFS = (rootId) => {
		const queue = [rootId];
		while (queue.length > 0) {
			const trkId = queue.shift();
			const track = d4(trkId);
			if (!track) continue;
			allTracks.push(track);
			const choice = d5(track.terminatingChoice);
			if (choice && choice.branches) {
				choice.branches.forEach(bId => queue.push(bId));
			}
		}
	};

	const rootChoice = d5(plan.steps[0]);
	if (rootChoice && rootChoice.branches) {
		rootChoice.branches.forEach(b => collectTracksBFS(b));
	}

	// 2. Determine the current frontier depth (the lowest depth with unexecuted knots)
	let minDepth = Infinity;
	allTracks.forEach(track => {
		const knots = track.sequence.map(id => k1(id)).filter(k => !!k);
		const hasUnexecuted = knots.some(k => {
			const cell = d3(k.TC);
			return !d2(cell.response).content || d2(cell.response).content === "[awaiting response...]" || d2(cell.response).content === "";
		});
		if (hasUnexecuted) {
			if (track.depth < minDepth) minDepth = track.depth;
		}
	});

	if (minDepth === Infinity) {
		//console.log("[executeDecompositionNextLayer] No more unexecuted layers found.");
		return;
	}

	//console.log(`[executeDecompositionNextLayer] Executing Depth Layer: ${minDepth}`);

	// 3. Execution: Run all unexecuted knots at this specific depth
	const frontierKnots = [];
	allTracks.forEach(track => {
		if (track.depth === minDepth) {
			track.sequence.forEach(knotId => {
				const k = k1(knotId);
				const cell = d3(k.TC);
				if (!d2(cell.response).content || d2(cell.response).content === "[awaiting response...]" || d2(cell.response).content === "") {
					frontierKnots.push(knotId);
				}
			});
		}
	});

	for (const knotId of frontierKnots) {
		handleExecuteSingleTurn(knotId);
	}
}





export function renderCoalescedPlan() {
	const container = document.getElementById('coalescedExecutionRowContainer');
	if (!container) return;
	container.innerHTML = '';
	const tr = document.createElement('tr');
	CoalescedPlan.sequence.forEach((knotRegId, index) => {
		const td = document.createElement('td');
		const knot = typeof k1 === 'function' ? k1(knotRegId) : null;
		const threeCell = knot ? d3(knot.TC) : null;
		if (!threeCell) return;
		//use existing function to render the prompt/response textareas. 
		td.appendChild(threeCell.yieldContentElements(true));
		//create the execution controls for this cell. 
		const controlsDiv = document.createElement('div');
		controlsDiv.className = 'execution-controls';

		const parentTrack = d4(knot.parentTrackId);

		if (typeof handleExecuteSingleTurn === 'function') {
			const execBtn = document.createElement('button');
			execBtn.textContent = "Execute Turn";
			execBtn.onclick = () => handleExecuteSingleTurn(knotRegId);
			execBtn.style = "background-color:#111 ; color:var(--gold-24kt); border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;";
			controlsDiv.appendChild(execBtn);
		}

		if (typeof handleSequentialConversation === 'function') {
			const execSeqBtn = document.createElement('button');
			execSeqBtn.textContent = "Run to Here";
			execSeqBtn.title = "Execute all turns from the start up to this one."
			execSeqBtn.onclick = () => handleSequentialConversation(index);
			execSeqBtn.style = "background-color:#111; color:var(--gold-24kt); border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;";
			controlsDiv.appendChild(execSeqBtn);
		}


		if (typeof handleExecuteTwoPassTurn === 'function') {
			const execFocusButton = document.createElement('button');
			execFocusButton.textContent = "execute Focused turn";
			execFocusButton.title = "run 2pass execution";
			execFocusButton.onclick = () => handleExecuteTwoPassTurn(knotRegId);
			execFocusButton.style = "background-color:#111 ; color:var(--gold-24kt); border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;";
			controlsDiv.appendChild(execFocusButton);
		}

		if (typeof handleSequentialTwoPass === 'function') {
			const exec2passSeqBtn = document.createElement('button');
			exec2passSeqBtn.textContent = "Focus Seq2to here.";
			exec2passSeqBtn.title = "2pass sequence to here from 0";
			exec2passSeqBtn.onclick = () => handleSequentialTwoPass(index);
			exec2passSeqBtn.style = "background-color: #111 ; color:var(--gold-24kt); border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;";
			controlsDiv.appendChild(exec2passSeqBtn);
		}



		if (index === CoalescedPlan.sequence.length - 1) {
			if (typeof resumeSequentialConversation === 'function') {
				const resumeBtn = document.createElement('button');
				resumeBtn.textContent = "resume track";
				resumeBtn.title = "execute all pending or failed on this plan.";
				resumeBtn.onclick = () => resumeSequentialConversation(index);
				resumeBtn.style = "background-color:#111 ; color:var(--gold-24kt); border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;";
				controlsDiv.appendChild(resumeBtn);
			}

			if (typeof resume2passtrack === 'function') {
				const resume2pBtn = document.createElement('button');
				resume2pBtn.textContent = "resume 2pass";
				resume2pBtn.title = "ask all undone prompts through 2pass";
				resume2pBtn.onclick = () => resume2passtrack(index);
				resume2pBtn.style = "background-color:#111 ; color:var(--gold-24kt); border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer;";
				controlsDiv.appendChild(resume2pBtn);
			}
		}

		td.appendChild(controlsDiv);
		tr.appendChild(td);
	});
	container.appendChild(tr);

	// Add special decomposition controls if applicable
	const controlsRow = document.createElement('tr');
	const controlsCell = document.createElement('td');
	controlsCell.colSpan = CoalescedPlan.sequence.length || 1;
	controlsCell.style.padding = '1rem';
	controlsCell.style.borderTop = '1px solid var(--gold-24kt)';
	controlsCell.style.textAlign = 'center';

	const nextLayerBtn = document.createElement('button');
	nextLayerBtn.textContent = 'Execute Next Decomposition Depth';
	nextLayerBtn.title = 'Concurrent execution of all components at the same depth frontier.';
	nextLayerBtn.onclick = () => executeDecompositionNextLayer();
	nextLayerBtn.style = "background-color: #9b111e; color: white; border: 1px solid var(--gold-24kt); font-weight: 500; border-radius: 0.375rem; padding: 0.75rem 1.25rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; box-shadow: 0 0 10px rgba(155, 17, 30, 0.5); margin: 0 auto;";

	controlsCell.appendChild(nextLayerBtn);
	controlsRow.appendChild(controlsCell);
	container.appendChild(controlsRow);
}




export function handleSwitchPlanView() {
	if (!DynamicTableState.scenario) return;
	DynamicTableState.currentView = (DynamicTableState.currentView === "DECOMPOSITION") ? "RECOMPOSITION" : "DECOMPOSITION";
	//console.log(`[tableRenderer] Switched view to: ${DynamicTableState.currentView}`);

	const switchBtn = document.getElementById('switchPlanBtn');
	if (switchBtn) {
		switchBtn.textContent = (DynamicTableState.currentView === "DECOMPOSITION") ? "Switch to Recomposition" : "Switch to Decomposition";
	}

	recoalesceAndRenderAll();
}

let isCompactMode = false;
export function toggleOldCompactMode() {
	isCompactMode = !isCompactMode;
	const container = document.getElementById('dynamicTableTracksContainer');
	if (container) {
		if (isCompactMode) container.classList.add('compact-mode');
		else container.classList.remove('compact-mode');
	}
	recoalesceAndRenderAll();
}

export function recoalesceAndRenderAll(TableState = DynamicTableState) {
	renderDynamicScenarioTable(TableState);
	coalesceScenarioToPlan(TableState);
	renderCoalescedPlan();
	renderWishSummary();
}

function renderWishSummary() {
	const containerOuter = document.getElementById('wish-summary-console');
	const containerInner = document.getElementById('wish-summary-container');
	if (!containerOuter || !containerInner) return;

	if (!DynamicTableState.scenario) {
		containerOuter.style.display = 'none';
		return;
	}

	const wish = DynamicTableState.scenario;
	if (wish.summary !== null && typeof k1 === 'function') {
		containerOuter.style.display = 'block';
		containerInner.innerHTML = '';

		const sumKnot = k1(wish.summary);
		if (sumKnot) {
			const knotEl = sumKnot.yieldElement();
			const table = document.createElement('table');
			table.className = 'scenario-table mx-auto';
			const tr = document.createElement('tr');
			tr.appendChild(knotEl);
			table.appendChild(tr);
			containerInner.appendChild(table);
		}
	}
}

export function toggleCompactMode() {
	const table = document.getElementById('main-scenario-table') || document.querySelector('.scenario-table');
	if (table) {
		table.classList.toggle('compact');
		const isCompact = table.classList.contains('compact');
		//console.log(`[toggleCompactMode] Compact mode is now: ${isCompact}`);

		// Hide bulky elements physically to reduce browser repaint/reflow strain
		const bulkySelectors = 'textarea, .knot-config-container, .cell-controls, .execution-controls, .choice-radios, .parallel-branches';
		const bulkyElements = table.querySelectorAll(bulkySelectors);

		bulkyElements.forEach(el => {
			if (isCompact) {
				el.dataset.oldDisplay = el.style.display;
				el.style.display = 'none';
			} else {
				el.style.display = el.dataset.oldDisplay || '';
			}
		});

		// Adjust cell padding for compact view
		const cells = table.querySelectorAll('td, th');
		cells.forEach(c => {
			c.style.padding = isCompact ? '0.25rem' : '1rem';
		});
	}
}


export function handlerEditedTextArea(event) {
	const texare = event.target;
	const layId = texare.class;
	let foundCell = d2(layId);
	if (foundCell) {
		foundCell.content = texare.value;
	} else {
		//console.log("can not find twolayer for this textarea.");
	}
	return;
}
