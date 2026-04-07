// @deprecated — Knot and Hyper_Three_Cell have been moved to ./WISH.js
// Strand, Quipu, and Keychain are legacy Quipu infrastructure preserved for context only.
export { Knot, Hyper_Three_Cell } from './WISH.js';

import { getNextUID, StrandArray, QuipuArray, KeychainArray, s1, q1, kc1, d3, d4, d6 } from '../core/state.js';

import { Two_Layer, Three_Cell, Six_Plan, createModelSelector } from './TableModels.js';





/**
 * The Strand is a composite object that holds a temporally ordered sequence of Knots.
 * It represents a single row in the Quipu "Collca" UI.
 */
export class Strand {
	/**
	 * Initializes a new Strand.
	 * @param {number} positionOnQuipu - The vertical index of this Strand in the Quipu.
	 * @param {string} name - The human-readable name of the Strand.
	 * @param {number|null} parentQuipuId - The Quipu RegId this Strand belongs to.
	 */
	constructor(positionOnQuipu = 0, name = "New Strand", parentQuipuId = null) {
		this.name = name;
		this.knots = [];
		this.positionOnQuipu = positionOnQuipu;
		this.parentQuipuId = parentQuipuId;
		this.parentChoiceId = null;
		this.choiceIndex = 0;
		this.workbitmap = [];

		StrandArray.push(this);
		this.RegId = StrandArray.length - 1;
		this.id = `strand-${this.RegId}`;
	}

	/**
	 * Appends a new empty Knot to the end of this Strand.
	 */
	addKnot() {
		const newKnot = new Knot(this.RegId, this.knots.length);
		this.knots.push(newKnot.RegId);
		this.workbitmap.push(false);
	}

	/**
	 * Removes the last Knot from this Strand.
	 */
	popKnot() {
		if (this.knots.length > 0) {
			this.knots.pop();
			this.workbitmap.pop();
		}
	}

	/**
	 * Creates a deep clone of this Strand and all its constituent Knots.
	 * @param {number} newpos - The designated position of the cloned Strand in the parent Quipu.
	 * @returns {Strand} A new, independent Strand object.
	 */
	clone(newpos) {
		const newStrand = new Strand(newpos, `(clone)${this.name}`, this.parentQuipuId);
		this.knots.forEach(knotRegId => {
			const originalKnot = k1(knotRegId);
			if (originalKnot) {
				const clonedKnot = originalKnot.clone();
				clonedKnot.parentStrandId = newStrand.RegId;
				newStrand.knots.push(clonedKnot.RegId);
				newStrand.workbitmap.push(false);
			}
		});
		return newStrand;
	}


	/**
	 * Renders the table header (row controls) for this Strand.
	 * @returns {HTMLTableHeaderCellElement} A `th` element populated with Strand controls.
	 */
	yieldRowHeader() {
		const th = document.createElement('th');
		th.className = 'strand-header';

		const nameInput = document.createElement('input');
		nameInput.type = 'text';
		nameInput.value = this.name;
		nameInput.onchange = (e) => { this.name = e.target.value; };

		const addKnotBtn = document.createElement('button');
		addKnotBtn.textContent = '+ Knot';
		addKnotBtn.onclick = () => {
			this.addKnot();
			if (window.ActiveKeychain) {
				window.ActiveKeychain.yieldElement('keychain-container');
			}
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		const popKnotBtn = document.createElement('button');
		popKnotBtn.textContent = '- Knot';
		popKnotBtn.title = 'Remove last knot';
		popKnotBtn.onclick = () => {
			this.popKnot();
			if (window.ActiveKeychain) {
				window.ActiveKeychain.yieldElement('keychain-container');
			}
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		const cloneStrandBtn = document.createElement('button');
		cloneStrandBtn.textContent = 'clone';
		cloneStrandBtn.title = 'clone this strand';
		cloneStrandBtn.onclick = () => {
			if (window.ActiveKeychain) {
				const parentQuipu = q1(this.parentQuipuId);
				//XX32 could say parentQuipu.clonestrand(this.positionOnQuipu, this.RegId); 
				parentQuipu.cloneStrand(this.RegId, this.positionOnQuipu);
				window.ActiveKeychain.yieldElement('keychain-container');
			}
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		const removeStrandBtn = document.createElement('button');
		removeStrandBtn.textContent = '✖';
		removeStrandBtn.title = 'Remove this strand';
		removeStrandBtn.style.cssText = 'color: red; margin-left: 10px; border: none; background: transparent; cursor: pointer; font-weight: bold;';
		removeStrandBtn.onclick = () => {
			if (window.ActiveKeychain) {
				const parentQuipu = q1(this.parentQuipuId);
				parentQuipu.removeStrand(this.RegId);
				window.ActiveKeychain.yieldElement('keychain-container');
			}
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		th.appendChild(nameInput);
		th.appendChild(addKnotBtn);
		th.appendChild(popKnotBtn);
		th.appendChild(cloneStrandBtn);
		th.appendChild(removeStrandBtn);
		return th;
	}

	/**
	 * Renders the full interactive UI row for this Strand, containing all its Knots.
	 * @returns {HTMLTableRowElement} A `tr` element representing the Strand.
	 */
	yieldElement() {
		const tr = document.createElement('tr');
		tr.className = 'quipu-strand';
		tr.appendChild(this.yieldRowHeader());
		this.knots.forEach(knotRegId => {
			const knot = k1(knotRegId);
			if (knot) {
				tr.appendChild(knot.yieldElement());
			}
		});
		return tr;
	}

	/**
	 * Serializes this Strand and its Knots into a JSON string.
	 * @returns {string} The JSON representation of this Strand.
	 */
	getJSONstring() {
		const data = {
			RegId: this.RegId,
			name: this.name,
			positionOnQuipu: this.positionOnQuipu,
			parentQuipuId: this.parentQuipuId,
			parentChoiceId: this.parentChoiceId,
			choiceIndex: this.choiceIndex,
			knots: this.knots.map(knotRegId => JSON.parse(k1(knotRegId).getJSONstring()))
		};
		return JSON.stringify(data);
	}

	/**
	 * Reconstructs a Strand instance and fully recursively populates its cloned Knots from a JSON string.
	 * @param {string} jsonData - The serialized JSON string.
	 * @returns {Strand} A newly instantiated Strand.
	 */
	static fromJSON(jsonData) {
		const data = JSON.parse(jsonData);

		const newStrand = new Strand(data.parentQuipuId, data.positionOnQuipu, data.name);
		newStrand.parentChoiceId = data.parentChoiceId || null;
		newStrand.choiceIndex = data.choiceIndex || 0;
		newStrand.knots = [];

		if (data.knots && Array.isArray(data.knots)) {
			data.knots.forEach(knotData => {
				const newKnot = Knot.fromJSON(JSON.stringify(knotData));
				newKnot.parentStrandId = newStrand.RegId;
				newStrand.knots.push(newKnot.RegId);
				newStrand.workbitmap.push(false);
			});
		}
		return newStrand;
	}



}


/**
 * The Quipu is the master composite object for a workflow.
 * It holds a collection of Strands and represents the entire "Collca" table UI.
 */
export class Quipu {
	/**
	 * Initializes a new Quipu instance.
	 * @param {string} projectName - The name of the Quipu workflow.
	 */
	constructor(projectName = "New Quipu") {
		// --- Core Data ---
		this.name = projectName;

		// Holds descriptions of each strand. Each object contains the strand's RegId
		// and a RegId for a Two_Layer to hold the strand's final summary/output.
		this.strands = []; // Format: [{ strandRegId: number, summaryTwoLayerId: number }]

		// --- NEW: Execution Strategy ---
		this.executionStrategy = ExecutionStrategy.SEQUENTIAL; // 'SEQUENTIAL' or 'DEPENDENCY_AWARE'
		this.startKnotAddress = [0, 0];


		// --- Registry and Identification ---
		QuipuArray.push(this);
		this.RegId = QuipuArray.length - 1;
		this.id = `quipu-${this.RegId}`;
	}

	/**
	 * Appends a new empty Strand to the Quipu.
	 * @returns {number} The registry ID of the newly created Strand.
	 */
	pushStrand() {
		const newStrand = new Strand(this.strands.length, `Strand ${this.strands.length}`, this.RegId);
		const summary = new Two_Layer("summary", `[Summary for Strand ${newStrand.RegId}]`);
		this.strands.push({
			strandRegId: newStrand.RegId,
			summaryTwoLayerId: summary.RegId
		});
		newStrand.addKnot();
		return newStrand.RegId;
	}

	/**
	 * Removes a Strand from the Quipu and re-indexes the remaining Strands.
	 * @param {number} strandRegId - The registry ID of the Strand to remove.
	 */
	removeStrand(strandRegId) {
		this.strands = this.strands.filter(s => s.strandRegId !== strandRegId);
		// Re-index remaining strands
		this.strands.forEach((strandInfo, index) => {
			const strand = s1(strandInfo.strandRegId);
			if (strand) strand.positionOnQuipu = index;
		});
	}


	/**
	 * Clones an existing Strand and inserts it immediately after the original.
	 * @param {number} originalStrandRegId - The RegId of the Strand to duplicate.
	 * @param {number} pos - Optional positional hint (unused but kept for API compat).
	 */
	cloneStrand(originalStrandRegId, pos) {

		const originalIndex = this.strands.findIndex(sInfo => sInfo.strandRegId === originalStrandRegId);
		//if(s1(this.strands[pos].strandRegId).RegId == originalStrandRegId){//check passed. faster than findIndex 
		if (originalIndex === -1) {
			console.error("cannot clone strand: originla not found");
			return;
		}
		const originalStrand = s1(originalStrandRegId);
		if (!originalStrand) return;

		const clonedStrand = originalStrand.clone(originalIndex + 1);
		clonedStrand.parentQuipuId = this.RegId;
		const newSummary = new Two_Layer("summary", `[Summary for strand ${clonedStrand.RegId}`);
		const newStrandInfo = { strandRegId: clonedStrand.RegId, summaryTwoLayerId: newSummary.RegId };
		//insert the cloed strand immediate after the orginal
		this.strands.splice(originalIndex + 1, 0, newStrandInfo);
		//updateposition quipu for al subseunt strans to maintain orrect addresin.
		for (let i = originalIndex + 1; i < this.strands.length; i++) {
			const strand = s1(this.strands[i].strandRegId);
			if (strand) { strand.positionOnQuipu = i; }
		}
	}

	/**
	 * Sets the LLM model for all Knots in all Strands contained in this Quipu.
	 * @param {string} modelId - The string identifier of the chosen model.
	 */
	setAllModels(modelId) {
		if (!modelId) { return; }
		this.strands.forEach(strandInfo => {
			const strand = s1(strandInfo.strandRegId);
			if (strand) {
				strand.knots.forEach(knotRegId => {
					const knot = k1(knotRegId);
					if (knot && knot.TC !== undefined) {
						const cell = d3(knot.TC);
						if (cell) {
							cell.model = modelId;
						}
					}
				});
			}
		});
		// Request a global UI refresh if the active keychain container is visible. 
		if (window.ActiveKeychain && typeof window.ActiveKeychain.yieldElement === 'function') {
			window.ActiveKeychain.yieldElement('keychain-container');
		} else if (typeof qdlShadowUpdate === 'function') {
			qdlShadowUpdate();
		}
	}

	/**
	 * Renders the entire Quipu UI into a container element.
	 * @param {string} containerId - The ID of the DOM element to render the Quipu table into.
	 */
	yieldElement(containerId) {

		const container = document.getElementById(containerId);
		if (!container) {
			console.error(`Quipu render failed: container with id "${containerId}" not found.`);
			return;
		}
		container.innerHTML = ''; // Clear previous content

		const table = document.createElement('table');
		table.className = 'quipu-collca';
		const tbody = document.createElement('tbody');

		this.strands.forEach(strandInfo => {
			const strand = s1(strandInfo.strandRegId);
			if (strand) {
				tbody.appendChild(strand.yieldElement());
			}
		});

		table.appendChild(tbody);
		container.appendChild(table);

		const controlsDiv = document.createElement('div');
		controlsDiv.className = 'quipu-controls';

		const addStrandBtn = document.createElement('button');
		addStrandBtn.textContent = '+ Add Strand';
		addStrandBtn.onclick = () => {
			this.pushStrand();
			window.ActiveKeychain.yieldElement('keychain-container'); // Re-render the entire table
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		const executeBtn = document.createElement('button');
		executeBtn.textContent = 'Execute Quipu';
		executeBtn.title = 'Run the entire workflow defined in this Quipu.';
		executeBtn.onclick = () => {
			if (typeof Quechuy_executeQuipu === 'function') {
				window.isExecutingQuipu = true;
				if (typeof Tone !== 'undefined' && Tone.start) Tone.start();
				Quechuy_executeQuipu(this.RegId);
			} else {
				alert("Execution engine not loaded.");
			}
		};

		const stopBtn = document.createElement('button');
		stopBtn.textContent = 'STOP';
		stopBtn.title = 'Emergency Stop Execution';
		stopBtn.style.backgroundColor = '#dc2626'; // Red color
		stopBtn.style.marginLeft = '10px';
		stopBtn.onclick = () => {
			window.isExecutingQuipu = false;
			console.log("STOP button pressed. Quipu execution will halt.");

			// Abort any currently executing knots in the visible Quipu
			if (window.ActiveKeychain && window.ActiveKeychain.quipus && window.ActiveKeychain.quipus.length > 0) {
				const activeQuipuRegId = window.ActiveKeychain.quipus[window.ActiveKeychain.visibleQuipuIndex];
				const activeQuipu = q1(activeQuipuRegId);
				if (activeQuipu && activeQuipu.strands) {
					activeQuipu.strands.forEach((strandInfo) => {
						const strand = s1(strandInfo.strandRegId);
						if (strand && strand.knots) {
							strand.knots.forEach((knotRegId) => {
								const knot = k1(knotRegId);
								if (knot && knot.executionStatus === ExecutionStatus.WORKING) {
									console.log(`[STOP] Aborting knot ${knotRegId}`);
									if (knot.abortController) {
										knot.abortController.abort();
									}
									knot.executionStatus = ExecutionStatus.FAILED;
								}
							});
						}
					});
				}
				if (typeof renderActiveQuipu === 'function') {
					renderActiveQuipu();
				}
			}
		};

		// --- NEW: Strategy Selector ---
		const strategyLabel = document.createElement('label');
		strategyLabel.textContent = 'Execution Strategy: ';
		strategyLabel.style.marginLeft = '20px';

		const strategySelector = document.createElement('select');

		strategySelector.innerHTML = StrategyOptions;

		strategySelector.value = this.executionStrategy;
		strategySelector.onchange = (e) => {
			this.executionStrategy = e.target.value;
			console.log(`Quipu execution strategy set to: ${this.executionStrategy}`);
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		const maxCtxDiv = document.createElement('div');
		maxCtxDiv.style.display = 'inline-flex';
		maxCtxDiv.style.alignItems = 'center';
		maxCtxDiv.style.marginLeft = '20px';
		const maxCtxCheckbox = document.createElement('input');
		maxCtxCheckbox.type = 'checkbox';
		maxCtxCheckbox.id = 'max-ctx-toggle-${this.RegId}';
		maxCtxCheckbox.checked = window.USE_MAX_CONTEXT || false;
		maxCtxCheckbox.onchange = (e) => {
			window.USE_MAX_CONTEXT = e.target.checked;
			//	document.getElementById('numCtxSlider').disabled = e.target.checked;
		}
		const maxCtxLabel = document.createElement('label');
		maxCtxLabel.textContent = "Use Model's Max Content";
		maxCtxLabel.htmlFor = `max-ctx-toggle-${this.RegId}`;
		maxCtxLabel.style.marginLeft = '8px';
		maxCtxDiv.appendChild(maxCtxCheckbox);
		maxCtxDiv.appendChild(maxCtxLabel);



		// --- NEW: Global Model Selector ---
		const quipuModelLabel = document.createElement('label');
		quipuModelLabel.textContent = 'Set All Models: ';
		quipuModelLabel.style.marginLeft = '20px';

		const quipuModelSelector = createModelSelector("llama3.2:3b", (event) => {
			if (confirm(`Are you sure you want to change the model for ALL knots in this Quipu to ${event.target.value}?`)) {
				this.setAllModels(event.target.value);
			} else {
				// Revert the selector UI if cancelled
				event.target.value = "llama3.2:3b"; // or keep previous state
			}
		});


		controlsDiv.appendChild(addStrandBtn);
		controlsDiv.appendChild(executeBtn);
		controlsDiv.appendChild(stopBtn);
		controlsDiv.appendChild(strategyLabel);
		controlsDiv.appendChild(strategySelector);
		controlsDiv.appendChild(maxCtxDiv);
		controlsDiv.appendChild(quipuModelLabel);
		controlsDiv.appendChild(quipuModelSelector);
		container.appendChild(controlsDiv);
	}

	/**
	 * Creates a deep clone of this Quipu and its entire descending hierarchy of Strands and Knots.
	 * @returns {Quipu} A new, independent Quipu object.
	 */
	clone() {
		const newQuipu = new Quipu(`${this.name} (clone)`);
		newQuipu.startKnotAddress = JSON.parse(JSON.stringify(this.startKnotAddress));

		this.strands.forEach(strandInfo => {
			const originalStrand = s1(strandInfo.strandRegId);
			if (originalStrand) {
				const clonedStrand = originalStrand.clone(originalStrand.positionOnQuipu + 1);
				clonedStrand.parentQuipuId = newQuipu.RegId;
				const newSummary = new Two_Layer("summary", "");
				newQuipu.strands.push({ strandRegId: clonedStrand.RegId, summaryTwoLayerId: newSummary.RegId });
			}
		}
		);
		return newQuipu;
	}

	/**
	 * Serializes this Quipu and all its contained Strands/Knots into a JSON string.
	 * @returns {string} The JSON representation of the Quipu.
	 */
	getJSONstring() {
		const data = {
			RegId: this.RegId,
			name: this.name,
			startKnotAddress: this.startKnotAddress,
			executionStrategy: this.executionStrategy,
			strands: this.strands.map(sInfo => {
				return {
					strandRegId: sInfo.strandRegId,
					summaryTwoLayerId: sInfo.summaryTwoLayerId,
					strandData: JSON.parse(s1(sInfo.strandRegId).getJSONstring())
				};
			})
		};
		return JSON.stringify(data);
	}

	/**
	 * Reconstructs a full Quipu instance from a JSON string, deeply regenerating all Strands and Knots.
	 * @param {string} jsonData - The serialized JSON string.
	 * @returns {Quipu} A newly instantiated Quipu.
	 */
	static fromJSON(jsonData) {
		const data = JSON.parse(jsonData);
		const newQuipu = new Quipu(data.name);
		newQuipu.strands = [];
		newQuipu.startKnotAddress = data.startKnotAddress;
		newQuipu.executionStrategy = data.executionStrategy;
		if (data.strands && Array.isArray(data.strands)) {
			data.strands.forEach(sInfo => {
				const newStrand = Strand.fromJSON(JSON.stringify(sInfo.strandData));
				newStrand.parentQuipuId = newQuipu.RegId;
				//we need to recreate the summary Object. 
				const newSummary = new Two_Layer("summary", "");
				newQuipu.strands.push({
					strandRegId: newStrand.RegId,
					summaryTwoLayerId: newSummary.RegId
				});
			});
		}
		return newQuipu;
	}


}


/**
 * The Keychain is the master object that manages a selection of Quipus. 
 * It is responsible for orchestrating the fork-join of dynamic workflows, cloning a template 
 * Quipu to create parallel execution paths, and managing the overall state visually.
 */
export class Keychain {
	/**
	 * Initializes a new Keychain.
	 * @param {string} name - The human-readable name of the Keychain.
	 */
	constructor(name = "new keychain") {
		this.name = name;
		/* @type {number[]} an array of Six_Plan RegIds managed by this keychain.*/
		this.sixPlans = [];
		/*@ type {number [null] the RegId of the primary Six_Plan that serves as the template for cloning.*/
		this.templatePlanId = null;
		/*@type {boolean} a state flag for the quiechuy to know if it is in the middle of a forked execution.*/
		this.isExecutingParallel = false;

		// NEW: Keep track of which Six_Plan is currently visible in the UI
		this.visibleSixPlanIndex = 0;
	}
	/**
	 * Sets the initial template Six_Plan for this keychain. This is the master layout that will be cloned.
	 * @returns {number} The RegId of the generated primary template Six_Plan.
	 */
	setTemplatePlan() {
		// Assuming Six_Plan is available globally or imported
		const primaryPlan = new Six_Plan();
		// In Six_Plan, we need a name if not present, let's keep it simple
		this.templatePlanId = primaryPlan.RegId;
		this.sixPlans.push(primaryPlan.RegId);
		return primaryPlan.RegId;
	}

	/**
	 * Clones the underlying template Six_Plan and adds the new instance to the keychain array.
	 * @returns {number|null} The RegId of the newly created Six_Plan clone, or null on failure.
	 */
	cloneTemplate() {
		if (this.templatePlanId === null) {
			console.error("cannnot clone: no template plan has been set for this keychain.");
			return null;
		}
		// NOTE: Requires a clone() method on Six_Plan
		const templatePlan = typeof d6 === 'function' ? d6(this.templatePlanId) : null;
		if (templatePlan && typeof templatePlan.clone === 'function') {
			const clonedPlan = templatePlan.clone();
			this.sixPlans.push(clonedPlan.RegId);
			return clonedPlan.RegId;
		} else {
			console.error("cloning failed: template plan not found or does not have a clone method.");
			return null;
		}
	}

	/**
	 * Renders the entire UI for the currently visible Six_Plan managed by this keychain.
	 * @param {string} containerId - The ID of the DOM element to render the UI into.
	 */
	yieldElement(containerId) {
		const container = document.getElementById(containerId);
		if (!container) {
			console.error(`keychain render failed container with id "${containerId}" not found`);
			return;
		}
		container.innerHTML = '';
		if (this.sixPlans.length === 0) return;

		// Ensure index is in bounds
		if (this.visibleSixPlanIndex >= this.sixPlans.length || this.visibleSixPlanIndex < 0) {
			this.visibleSixPlanIndex = this.sixPlans.length - 1;
		}

		const currentPlanId = this.sixPlans[this.visibleSixPlanIndex];
		const plan = typeof d6 === 'function' ? d6(currentPlanId) : null; // Assuming d6 accesses Six_PlanArray

		if (plan) {
			// UI Controls for cycling
			const controlsNav = document.createElement('div');
			controlsNav.className = 'keychain-nav-controls';
			controlsNav.style.display = 'flex';
			controlsNav.style.alignItems = 'center';
			controlsNav.style.gap = '10px';
			controlsNav.style.marginBottom = '20px';
			controlsNav.style.padding = '10px';
			controlsNav.style.backgroundColor = 'rgba(255,255,255,0.05)';
			controlsNav.style.border = '1px solid rgba(255,255,255,0.1)';

			const prevBtn = document.createElement('button');
			prevBtn.textContent = '◀ Previous Plan';
			prevBtn.disabled = this.visibleSixPlanIndex === 0;
			prevBtn.onclick = () => {
				if (this.visibleSixPlanIndex > 0) {
					this.visibleSixPlanIndex--;
					this.yieldElement(containerId);
				}
			};

			const positionLabel = document.createElement('span');
			positionLabel.textContent = `Plan ${this.visibleSixPlanIndex + 1} of ${this.sixPlans.length}`;
			positionLabel.style.fontWeight = 'bold';

			const nextBtn = document.createElement('button');
			nextBtn.textContent = 'Next Plan ▶';
			nextBtn.disabled = this.visibleSixPlanIndex === this.sixPlans.length - 1;
			nextBtn.onclick = () => {
				if (this.visibleSixPlanIndex < this.sixPlans.length - 1) {
					this.visibleSixPlanIndex++;
					this.yieldElement(containerId);
				}
			};

			const addPlanBtn = document.createElement('button');
			addPlanBtn.textContent = '+ New Blank Plan';
			addPlanBtn.onclick = () => {
				const newPlan = new Six_Plan();
				this.sixPlans.push(newPlan.RegId);
				this.visibleSixPlanIndex = this.sixPlans.length - 1;
				window.GlobalUIRefresh();
			};

			const refreshBtn = document.createElement('button');
			refreshBtn.textContent = '↻ Refresh UI';
			refreshBtn.style.backgroundColor = '#64748b';
			refreshBtn.onclick = () => {
				window.GlobalUIRefresh();
			};

			controlsNav.appendChild(prevBtn);
			controlsNav.appendChild(positionLabel);
			controlsNav.appendChild(nextBtn);

			const separator = document.createElement('span');
			separator.textContent = ' | ';
			controlsNav.appendChild(separator);

			controlsNav.appendChild(addPlanBtn);

			const separator2 = document.createElement('span');
			separator2.textContent = ' | ';
			controlsNav.appendChild(separator2);

			controlsNav.appendChild(refreshBtn);

			container.appendChild(controlsNav);

			const planContainer = document.createElement('div');
			planContainer.className = 'six-plan-instance-container';
			planContainer.id = `plan-container-${plan.RegId}`;

			const title = document.createElement('h2');
			// Six_Plan may not have a native .name property yet. 
			const planName = plan.name || `Plan ${this.visibleSixPlanIndex}`;
			title.textContent = this.visibleSixPlanIndex === 0 ? `${planName} (Primary Template)` : `${planName} (Plan ${this.visibleSixPlanIndex})`;

			container.appendChild(title);
			container.appendChild(planContainer);

			if (typeof plan.yieldElement === 'function') {
				plan.yieldElement(planContainer.id);
			}
		}
	}

	/**
	 * Serializes the entire Keychain state to a JSON string.
	 * @returns {string} The JSON representation of this Keychain and all managed Six_Plans.
	 */
	getJSONstring() {
		const data = {
			name: this.name,
			templatePlanId: this.templatePlanId,
			sixPlans: this.sixPlans.map(planRegId => {
				const plan = typeof d6 === 'function' ? d6(planRegId) : null;
				return plan && typeof plan.getJSONstring === 'function' ? JSON.parse(plan.getJSONstring()) : null;
			}).filter(q => q !== null)
		};
		return JSON.stringify(data, null, 2);
	}


	/**
	 * Reconstructs a Keychain from a JSON string, deep-cloning all its managed Six_Plans.
	 * @param {string} jsonString - The serialized JSON string representing the Keychain.
	 * @returns {Keychain} A newly instantiated Keychain.
	 */
	static fromJSON(jsonString) {
		const data = JSON.parse(jsonString);
		const newKeychain = new Keychain(data.name);
		newKeychain.sixPlans = []; //clear the default 

		const oldPlanIdToNewIdMap = {};
		if (data.sixPlans && Array.isArray(data.sixPlans)) {
			data.sixPlans.forEach(planData => {
				if (planData) {
					// Requires fromJSON on Six_Plan
					const newPlan = typeof Six_Plan !== 'undefined' ? Six_Plan.fromJSON(JSON.stringify(planData)) : null;
					if (newPlan) {
						newKeychain.sixPlans.push(newPlan.RegId);
						oldPlanIdToNewIdMap[planData.RegId] = newPlan.RegId;
					}
				}
			});
		}
		if (data.templatePlanId && oldPlanIdToNewIdMap[data.templatePlanId]) {
			newKeychain.templatePlanId = oldPlanIdToNewIdMap[data.templatePlanId];
		}
		return newKeychain;
	}
}
