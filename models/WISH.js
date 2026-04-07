import { getNextUID, globalUID, TwoLayerArray, ThreeCellArray, FourRowArray, FiveChoiceArray, SixPlanArray, SevenWishArray, KnotArray, EventArray, HopArray, ConceptArray, PredicateArray, d2, d3, d4, d5, d6, d7, dE, dH, dC, dP, k1, textAreaSizeRegistry } from '../core/state.js';
import { Prompt_engines, modeloptions, ExecutionStatus, Knot_Type, ExecutionStrategy, StrategyOptions } from '../core/constants.js';
import { KnowledgeNode } from './KnowledgeNode.js';
import { recoalesceAndRenderAll, handleAddNewCoderTrack } from '../renderers/tableRenderer.js';
import { parseAddressString, reverseParseAddress, extractJsonObject } from '../utils/helpers.js';
import { executeSingleKnot } from '../services/quipuEngine.js';
import { processingCallbacks } from '../services/wdlEngine.js';

function handlerEditedTextArea(event) {
	const texare = event.target;
	const layId = texare.class;
	let foundCell = d2(layId);
	if (foundCell) {
		foundCell.content = texare.value;
	} else {
		console.log('can not find twolayer for this textarea.');
	}
	return;
}


export class Two_Layer {
	//Two_Layer represents ollama/api/types.go: Message struct 
	constructor(r = "", m = "") {
		this.id = getNextUID();

		this.role = r;
		this.content = m;
		this.individual_tokens = 0; // the token size of this specific message. 
		this.aggregate_tokens_at_this_point = 0;
		TwoLayerArray.push(this);
		this.RegId = TwoLayerArray.length - 1;
	}

	getJSONstring() {
		var data = {
			id: this.id,
			RegId: this.RegId,
			role: this.role,
			content: this.content,
		};
		return JSON.stringify(data, null, 2);
	}


	static fromJSON(data) {

		var newInstance = new Two_Layer(data.role, data.content);
		return newInstance;
	}


	yieldElement(uniqueContextId = this.id) {
		/* returns theHTML string or DOM element for a message*/
		var diiv = document.createElement('div');
		//diiv.id = this.id; 
		diiv.className = `message-role-${this.role}`;
		var roleStrong = document.createElement('strong');
		roleStrong.textContent = `Role: ${this.role}: `;
		diiv.appendChild(roleStrong);
		var contentSpan = document.createElement('textarea');
		// Apply "24kt gold writing on ebony background"
		contentSpan.style.backgroundColor = "#050505";
		contentSpan.style.color = "#FFD700";
		contentSpan.style.border = "1px solid #333";

		contentSpan.class = `${this.RegId}`;
		contentSpan.value = this.content || ""; contentSpan.placeholder = (this.role === 'user' ? "[your turn]" : "[awaiting response...]");
		var elemId = `textarea-${uniqueContextId}-${this.role}`;
		contentSpan.id = elemId;
		var savedSize = textAreaSizeRegistry.get(elemId);
		if (savedSize) {
			contentSpan.style.width = savedSize.width;
			contentSpan.style.height = savedSize.height;
		} else {
			contentSpan.style.width = "300px";
			contentSpan.style.height = "100px";
		}
		contentSpan.addEventListener('mouseup', () => {
			textAreaSizeRegistry.set(elemId, {
				width: contentSpan.style.width,
				height: contentSpan.style.height
			});
		});
		var toke = document.createElement('div');
		toke.innerHTML = `Individual Token: ${this.individual_tokens} Aggregate: ${this.aggregate_tokens_at_this_point}`;
		diiv.appendChild(toke);
		/*
		contentSpan.addEventListener('change', (event) => {
			this.setContent(event.target.value);
			recoalesceAndRenderAll();
		});
		*/
		contentSpan.addEventListener('change', (event) => {
			handlerEditedTextArea(event);
			recoalesceAndRenderAll();
			// Debounced full Quipu UI refresh after typing episode finishes
			if (window._globalRefreshTimer) clearTimeout(window._globalRefreshTimer);
			window._globalRefreshTimer = setTimeout(() => {
				if (typeof window.GlobalUIRefresh === 'function') window.GlobalUIRefresh();
			}, 300);
		});
		diiv.appendChild(contentSpan);
		return diiv;
	}

	destructor() {
		TwoLayerArray[this.RegId] = null; // Do not splice to avoid shifting indices for other objects
	}

	setContent(newContent) {
		this.content = newContent;
	}
	setRole(newRole) {
		this.content = newRole;
	}

}

export function getModelForPipelineRole(roleKey) {
	if (typeof window !== 'undefined' && window.DecompRecompModels && window.DecompRecompModels[roleKey]) {
		return window.DecompRecompModels[roleKey];
	}
	return document.getElementById('modelSel') ? document.getElementById('modelSel').value : "llama3.2:3b";
}

export class Three_Cell {
	constructor(p_role = "user", p_content = "", r_role = "assistant", r_content = "") {
		this.id = getNextUID();
		this.prompt = new Two_Layer(p_role, p_content).RegId;
		this.response = new Two_Layer(r_role, r_content).RegId;
		ThreeCellArray.push(this);
		this.RegId = ThreeCellArray.length - 1;
		this.originalCellId = null;
		this.parentTrackId = null;

		this.model = getModelForPipelineRole('decomp'); // Default fallback to generic decomp role
	}

	getJSONstring() {
		var promptData = JSON.parse(d2(this.prompt).getJSONstring());
		var responseData = JSON.parse(d2(this.response).getJSONstring());
		var data = {
			id: this.id,
			RegId: this.RegId,
			model: this.model,
			parentTrackId: this.parentTrackId,
			individual_tokens: this.individual_tokens,
			aggregate_tokens: this.aggregate_tokens,
			prompt: promptData,
			response: responseData
		};
		return JSON.stringify(data, null, 2);
	}

	static fromJSON(data) {
		var newPrompt = Two_Layer.fromJSON(data.prompt);
		var newResponse = Two_Layer.fromJSON(data.response);
		var newInstance = new Three_Cell();
		newInstance.prompt = newPrompt.RegId;
		newInstance.response = newResponse.RegId;
		newInstance.model = data.model;
		newInstance.parentTrackId = data.parentTrackId;
		return newInstance;
	}

	yieldElement() {	/*returns td DOM element */
		//this function is used by the main dynamicscenariotable...
		var tdd = document.createElement('td');
		tdd.classname = 'cell-content';
		tdd.id = this.id;

		//prompt engine. 
		const promptContainer = document.createElement('div');
		const promptEngineLabel = document.createElement('label');
		promptEngineLabel.textContent = "Prompt Engine:";
		promptEngineLabel.style.display = "block";
		promptEngineLabel.style.fontWeight = "bold";
		const promptEngineSelect = document.createElement('select');
		promptEngineSelect.className = 'prompt-engine-selector';
		Prompt_engines.forEach(engine => {
			const option = document.createElement('option');
			option.value = engine.string;
			option.textContent = engine.name;
			promptEngineSelect.appendChild(option);
		});
		promptEngineSelect.onchange = (event) => {
			const selectedPromptText = event.target.value;
			const currentPrompt = d2(this.prompt);
			currentPrompt.setContent(selectedPromptText);
			recoalesceAndRenderAll();
		};
		promptContainer.appendChild(promptEngineLabel);
		promptContainer.appendChild(promptEngineSelect);
		promptContainer.appendChild(d2(this.prompt).yieldElement(this.id));
		tdd.appendChild(promptContainer);
		//		tdd.appendChild(d2(this.prompt).yieldElement(this.id));
		tdd.appendChild(d2(this.response).yieldElement(this.id));

		let controlDiv = document.createElement('div');
		controlDiv.className = 'cell-controls';
		//		var execAdHoc = document.createElement('button');
		//		execAdHoc.textContent = "execute ad Hoc";
		//		execAdHoc.title = "execute the conversation from the root start to here."
		//		execAdHoc.onclick = () => handleExecuteOnTheFlyToHere(this.RegId);
		//		controlDiv.appendChild(execAdHoc);
		var modelSelectorLabel = document.createElement('label');
		modelSelectorLabel.textContent = "Model: ";
		//the callback function updates this specific instance's model. 
		var modelSelector = createModelSelector(this.model, (event) => {
			this.model = event.target.value;
		});
		controlDiv.appendChild(modelSelectorLabel);
		controlDiv.appendChild(modelSelector);
		/*
		let makeChoice = document.createElement('button');
		makeChoice.textContent = "Convert into Choice";
		makeChoice.title = "convert this turn into a choice.";
		makeChoice.onclick = () => handleConvertToChoice(parentTrackId, cellIndex);
		controlDiv.appendChild(makeChoice);
		*/
		//24Jun25
		/*	var execToHereBtn = document.createElement('button');
			execToHereBtn.textContent = "execute to here";
			execToHereBtn.title = "set all choices to lead to this point and execute.";
			execToHereBtn.onclick = () => handleExecuteToHere(this.RegId, this.parentTrackId);
	controlDiv.appendChild(execToHereBtn);
	*/
		tdd.appendChild(controlDiv);

		return tdd;
	}
	yieldContentElements(isCoalesced = false) {
		var contentFragment = document.createDocumentFragment();
		contentFragment.appendChild(d2(this.prompt).yieldElement(this.id));
		contentFragment.appendChild(d2(this.response).yieldElement(this.id));
		return contentFragment;
	}

	isEmpty() {
		return (!d2(this.prompt).content || d2(this.prompt).content === "[your turn]") && (!d2(this.response).content || d2(this.response).content === "[awaiting response...]");
	}

	destructor() {
		d2(this.prompt).destructor();
		d2(this.response).destructor();
		ThreeCellArray[this.RegId] = null; // Do not splice to avoid shifting indices
	}



}

export class Four_Row {
	constructor(nam = "trax") {
		this.id = getNextUID();
		this.name = `${nam}${getNextUID()}`;
		this.sequence = [];
		this.summary = new Three_Cell("system", "[Summary]", "assistant", "[Not yet summarized]").RegId;
		this.terminatingChoice = null;
		this.parentChoiceId = null;
		this.pairedCoderTrackId = null;
		this.depth = 0; // Tracks architectural distance from root

		FourRowArray.push(this);
		this.RegId = FourRowArray.length - 1;

	}

	getJSONstring() {
		var sequenceData = this.sequence.map(cellRegId => JSON.parse(k1(cellRegId).getJSONstring()));
		//serialize the terminating choice, if it exists. 
		let choiceData = null;
		let choiceType = 'manual';
		if (this.terminatingChoice !== null) {
			choiceData = JSON.parse(d5(this.terminatingChoice).getJSONstring());
		}
		var data = {
			id: this.id,
			RegId: this.RegId,
			name: this.name,
			parentChoiceId: this.parentChoiceId,
			pairedCoderTrackId: this.pairedCoderTrackId,
			sequence: sequenceData,
			terminatingChoice: choiceData
		};
		return JSON.stringify(data, null, 2);
	}

	static fromJSON(data) {
		var newInstance = new Four_Row(data.name);
		newInstance.pairedCoderTrackId = data.pairedCoderTrackId || null;
		if (data.sequence && Array.isArray(data.sequence)) {
			data.sequence.forEach(knotData => { // Actually now it's knotData!
				let knotClass = typeof k1 === 'function' && typeof Knot !== 'undefined' ? Knot : (window.KnotClass || null);
				if (knotClass) {
					var newKnotInstance = knotClass.fromJSON(JSON.stringify(knotData));
					newInstance.addCell(newKnotInstance.RegId, false);
				}
			});
		}


		if (data.terminatingChoice) {
			var newChoice = Five_Choice.fromJSON(data.terminatingChoice);
			//Does this fail? 
			newInstance.terminatingChoice = newChoice.RegId;
		}



		return newInstance;
	}


	//linear sequence of knots
	addCell(knotRegId = null, syncToPair = true) {
		let kClass = typeof k1 === 'function' && typeof Knot !== 'undefined' ? Knot : (window.KnotClass || null);
		if (knotRegId === null && kClass) {
			const pk = new kClass();
			knotRegId = pk.RegId;
		}
		if (knotRegId !== null) {
			const knot = k1(knotRegId);
			knot.parentTrackId = this.RegId;
			const tc = d3(knot.TC);
			if (tc) tc.parentTrackId = this.RegId;
			this.sequence.push(knotRegId);
		}

		//if this is a coder track and sync is enabled, add a cell to its pair. 
		if (syncToPair && this.pairedCoderTrackId !== null) {
			const pairedTrack = d4(this.pairedCoderTrackId);
			if (pairedTrack && kClass) {
				const emptyKnot = new kClass();
				d2(d3(emptyKnot.TC).prompt).content = "[Auto-Generated]";
				d2(d3(emptyKnot.TC).response).content = "[Awaiting Integration...]";
				pairedTrack.addCell(emptyKnot.RegId, false);
			}
		}
	}

	getCell(ind) { return k1(this.sequence[ind]); }
	length() { return this.sequence.length; }

	destructor() {
		for (let i = 0; i < this.sequence.length; i++) { 
			const k = k1(this.sequence[i]);
			if (k && typeof k.destructor === 'function') {
				k.destructor(); 
			}
		}
		FourRowArray[this.RegId] = null; // Do not splice to avoid shifting indices
	}

	/*
	promotes the end of this track to a branching choice point. 
	@param {string} conditional_phrase - the reason for the choice. 
	@param {number} numBranches - the number of paths to create (min 2);
	*/
	addTerminatingChoice(conditional_phrase, numBranches = 2) {
		if (d5(this.terminatingChoice) instanceof Five_Choice) {
			console.log(`track #{this.id} already has the terminating choice.`);
			return;
		}
		var newChoice = new Five_Choice(conditional_phrase);
		newChoice.parentTrackId = this.RegId;
		for (let i = 0; i < numBranches; i++) {
			var branchName = `option ${i + 1}`;
			var newBranchTrack = new Four_Row(branchName);
			newBranchTrack.addCell();
			newChoice.addBranch(newBranchTrack.RegId);
		}
		this.terminatingChoice = newChoice.RegId;
	}

	setAllModels(modelId) {
		if (!modelId) { return; }
		this.sequence.forEach(knotRegId => {
			var knot = k1(knotRegId);
			if (knot && knot.TC !== undefined) {
				var cell = d3(knot.TC);
				if (cell) cell.model = modelId;
			}
		});
		recoalesceAndRenderAll();
	}

	/*
	Creates the HTML content for the track's header/control console. 
	@returns {HTMLElement} - the <th> element for the row header.
	*/
	yieldRowHeader() {
		var thd = document.createElement('th');
		thd.className = `row-control-console`;
		if (d4(this.parentChoiceId) && d4(d4(this.parentChoiceId).parentTrackId)?.pairedCoderTrackId === this.RegId) {
			thd.classList.add('horizontal-coder-track-header');
		}
		var nameSpan = document.createElement(`span`);
		nameSpan.textContent = this.name;
		var namefiel = document.createElement('input');
		namefiel.name = `trackname${this.id}`;
		var namelbl = document.createElement('label');
		namelbl.for = `trackname${this.id}`;
		namefiel.type = 'text';
		namefiel.onchange = (e) => {
			this.name = e.target.value;
			recoalesceAndRenderAll();
		}
		namelbl.textContent = "track's name:"
		thd.appendChild(namelbl);
		thd.appendChild(namefiel);
		thd.appendChild(nameSpan);

		var addTurnBt = document.createElement(`button`);
		addTurnBt.textContent = "+ Turn";
		addTurnBt.title = "add new turn to the end of track";
		addTurnBt.onclick = () => {
			this.addCell();
			recoalesceAndRenderAll();
		};

		var controlsContainer = document.createElement('div');
		var ChoNam = document.createElement('input');
		ChoNam.type = 'text';
		ChoNam.placeholder = "conditional phrase for the choice";
		var trnoin = document.createElement('input');
		trnoin.type = 'number';
		trnoin.value = '2';
		trnoin.min = '2';

		var appendChoiceBt = document.createElement('button');
		appendChoiceBt.textContent = "Terminate with choice";
		appendChoiceBt.title = "terminate track with a choice.";
		appendChoiceBt.onclick = () => {
			var numTracks = parseInt(trnoin.value, 10) || 2;
			this.addTerminatingChoice(ChoNam.value, numTracks);
			recoalesceAndRenderAll();
		};


		controlsContainer.appendChild(addTurnBt);
		controlsContainer.appendChild(document.createElement('hr'));
		controlsContainer.appendChild(ChoNam);
		controlsContainer.appendChild(trnoin);
		controlsContainer.appendChild(appendChoiceBt);


		var nesetAllDiv = document.createElement('div');
		var setAllLabel = document.createElement('label');
		setAllLabel.textContent = "Model for whole track:";
		setAllLabel.style.display = 'block';
		var setAllSelector = createModelSelector(this.sequence.length > 0 && k1(this.sequence[0]) ? d3(k1(this.sequence[0]).TC).model : 'llama3.2:3b', () => { });
		var setallbut = document.createElement('button');
		setallbut.textContent = 'model for all';
		setallbut.onclick = () => {
			var selectedModel = setAllSelector.value;
			this.setAllModels(selectedModel);
		};
		nesetAllDiv.appendChild(setAllLabel);
		nesetAllDiv.appendChild(setAllSelector);
		nesetAllDiv.appendChild(setallbut);

		thd.appendChild(nesetAllDiv);

		return thd;
	}
}

/**
 * Four_Component: A hybrid class that extends Four_Row with ArchNode graph logic.
 * Used for structured architectural decomposition where rows represent system components.
 */
export class Four_Component extends Four_Row {
	constructor(nam = "component") {
		super(nam);
		// The WDL UI routing node now holds a separate filing system node.
		this.knowledgeNode = new KnowledgeNode(this.RegId, nam);

		this.depth = 0; // Merged from Four_Row context
	}

	// Delegate graph edges to the KnowledgeNode
	addDependency(childFourComponent) {
		if (childFourComponent && childFourComponent.knowledgeNode) {
			this.knowledgeNode.addDependency(childFourComponent.knowledgeNode);
		}
	}

	removeDependency(childFourComponent) {
		if (childFourComponent && childFourComponent.knowledgeNode) {
			this.knowledgeNode.removeDependency(childFourComponent.knowledgeNode);
		}
	}

	destructor() {
		if (this.knowledgeNode) {
			this.knowledgeNode.destroy();
		}
		super.destructor();
	}

	get is_a_parent_System() {
		return this.knowledgeNode && this.knowledgeNode.dependencies.length > 0;
	}

	get is_a_Leaf_node() {
		return !this.is_a_parent_System;
	}
}
window.Four_Component = Four_Component;


export class Paired_Four_Row {
	constructor(name = "PairedTrack") {
		this.id = getNextUID();
		this.name = name;
		//internal hidden tracks.
		this.cellTrack = new Four_Row(`${name} - Cell`);
		this.horizontalTrack = new Four_Row(`${name} - Horizontal`);
		//link them internally, but this is hidden from the outside world.
		this.cellTrack.pairedCoderTrackId = this.horizontalTrack.RegId;
	}

	get sequence() {
		const logicalSequence = [];
		for (let i = 0; i < this.cellTrack.sequence.length; i++) {
			const cellTurn = d3(this.cellTrack.sequence[i]);
			const horizontalTurn = d3(this.horizontalTrack.sequence[i]);
			//create a temporay logical cell for rendering in the coalesced plan. 
			const logicalCell = new Three_Cell();
			d2(logicalCell.prompt).role = d2(cellTurn.prompt).role;
			d2(logicalCell.prompt).content = d2(cellTurn.prompt).content;
			d2(logicalCell.prompt).role = d2(horizontalTurn.response).role;
			d2(logicalCell.prompt).content = d2(horizontalTurn.response).content;
			logicalCell.parent = this;
			logicalSequence.push(logicalCell);
		}
		return logicalSequence;
	}
	addTurn() {
		//this method correctly syncs the two hidden tracks. 
		this.cellTrack.addCell();
	}
}

function getHSLPastel() {
	var jewels = [
		{ name: 'ruby', color: '#9b111e' },
		{ name: 'sapphire', color: '#0f52ba' },
		{ name: 'emerald', color: '#50c878' },
		{ name: 'topaz', color: '#ffc87c' }
	];
	var hue = Math.floor(Math.random() * 131);
	return `hsl(${hue}, 90%, 80%)`;
}

export class Five_Choice {
	constructor(ConditionalPhrase = "") {
		this.id = getNextUID();
		this.conditional_phrase = ConditionalPhrase;
		this.branches = [];
		this.favouredBranchId = null;
		this.selectedBranchId = null;
		this.parentTrackId = null;
		this.parentPlanId = null;
		this.branchesColour = getHSLPastel();
		FiveChoiceArray.push(this); this.RegId = FiveChoiceArray.length - 1;

	}

	getJSONstring() {
		var branchesData = this.branches.map(trackRegId => JSON.parse(d4(trackRegId).getJSONstring()));
		var data = {
			id: this.id,
			RegId: this.RegId,
			conditional_phrase: this.conditional_phrase,
			parentTrackId: this.parentTrackId,
			parentPlanId: this.parentPlanId,
			selectedBranchId: this.selectedBranchId,
			branches: branchesData
		};
		return JSON.stringify(data, null, 2);
	}


	static fromJSON(data) {
		//@param {object} data -  plain object from JSON.parse()
		//@returns {number} the RegId of the newly created instance.	 
		if (!data || !Array.isArray(data.branches)) {
			console.error("five_Choice.fromJSON error#1.0 ");
			return;//return new Five_Choice();
		}

		var newInstance = new Five_Choice(data.conditional_phrase);
		var oldIdToNewIdMap = {};

		newInstance.parentPlanId = data.parentPlanId || null;

		if (data.branches && Array.isArray(data.branches)) {
			data.branches.forEach(branchData => {
				var newBranchInstance = Four_Row.fromJSON(branchData);
				newInstance.addBranch(newBranchInstance.RegId);
				oldIdToNewIdMap[branchData.RegId] = newBranchInstance.RegId;
			});
		}



		if (data.selectedBranchId && oldIdToNewIdMap[data.selectedBranchId]) {
			newInstance.selectedBranchId = oldIdToNewIdMap[data.selectedBranchId];
		} else if (newInstance.branches.length > 0) {
			newInstance.selectedBranchId = newInstance.branches[0];
		}
		return newInstance;

	}

	getOffset() {
		// [this choice] [parentTrack.squence.length]->[parentChoice=1]->[parentTrack.seq.len]
		var retval = 0;//this choice.
		var pres_choi = this;
		let flag030 = true;

		while (flag030) {
			retval += 1;//one for the choice cell. 
			if (pres_choi.parentTrackId != null) {
				let paTr = d4(pres_choi.parentTrackId);
				if (paTr === null) { flag030 = false; continue; }
				retval += paTr.sequence.length + 1; // plus header
				if (paTr.parentChoiceId != null) {
					pres_choi = d5(paTr.parentChoiceId);
					if (pres_choi === null) { flag030 = false; continue; }
				} else { flag030 = false; }
			} else { flag030 = false; }
		}
		return retval;
	}

	addBranch(branchTrackRegId) {
		let xe3 = typeof d4 === 'function' ? d4(branchTrackRegId) : null;
		if (xe3) {
			xe3.parentChoiceId = this.RegId;
			this.branches.push(xe3.RegId);
			if (this.selectedBranchId === null || this.selectedBranchId === undefined) {
				this.selectedBranchId = xe3.RegId;
			}
		}
	}

	/* 
	creates and returns the complete table cell (td for the choice hub, including the correct rowspan and all UI elements. 
	@returns {HTMLTableCellElement} the fully constructed td element for
	*/
	yieldElement() {
		//create the cell that will be returned. 
		var ttdd = document.createElement('td');
		ttdd.className = 'five-choice';

		// Map color back to jewel class for glowing effects
		if (this.branchesColour === '#9b111e') ttdd.classList.add('jewel-ruby');
		else if (this.branchesColour === '#0f52ba') ttdd.classList.add('jewel-sapphire');
		else if (this.branchesColour === '#50c878') ttdd.classList.add('jewel-emerald');
		else if (this.branchesColour === '#ffc87c') ttdd.classList.add('jewel-topaz');
		else ttdd.style.backgroundColor = this.branchesColour;

		ttdd.rowSpan = 1;
		var container = document.createElement('div');
		container.className = 'choice-hub-container';

		var phraseInput = document.createElement('input');
		phraseInput.type = 'text';
		phraseInput.value = this.conditional_phrase;
		phraseInput.placeholder = 'condition for this choice.';
		phraseInput.onchange = (e) => { this.conditional_phrase = e.target.value; };
		container.appendChild(phraseInput);

		var radioGroup = document.createElement('div');
		radioGroup.className = 'choice-radios';

		//Dynamically create a radio button for each branch. 
		this.branches.forEach(brch => {
			let branch = typeof d4 === 'function' ? d4(brch) : null;

			if (!branch) { return; console.log("Branch used without respecting RegId"); return; }

			const isHorizontalCoderTrack = this.branches.some(otherId => {
				return typeof d4 === 'function' && d4(otherId)?.pairedCoderTrackId === branch.RegId;
			});
			if (isHorizontalCoderTrack) return;

			var id = `radio-${this.RegId}-${branch.id}`;
			var isChecked = (this.selectedBranchId === brch);
			var branchDiv = document.createElement('div');
			var radioInput = document.createElement('input');
			radioInput.type = 'radio';
			radioInput.id = branch.id;
			radioInput.name = `choice-${this.id}`;

			radioInput.value = parseInt(brch);
			radioInput.checked = isChecked;
			radioInput.onchange = () => {
				this.selectedBranchId = parseInt(radioInput.value);
				if (typeof recoalesceAndRenderAll === 'function') recoalesceAndRenderAll();
			};
			var label = document.createElement('label');
			label.for = branch.id;
			label.textContent = `${branch.name}`;
			branchDiv.appendChild(radioInput);
			branchDiv.appendChild(label);
			radioGroup.appendChild(branchDiv);
		});

		const addCoderBtn = document.createElement('button');
		addCoderBtn.textContent = '+ Coder Track';
		addCoderBtn.title = 'Add a new Cell/Horizontal coder track pair here.';
		addCoderBtn.style.marginTop = '10px';
		addCoderBtn.onclick = () => handleAddNewCoderTrack(this.RegId);
		container.appendChild(addCoderBtn);


		container.appendChild(radioGroup);
		ttdd.appendChild(container);
		return ttdd;
	}
}

export class Five_Auto_Choice extends Five_Choice {
	constructor(conditionalphrase = "What is the most accurate and good option?") {
		super(conditionalphrase);
		this.parentResponsesSummary = new Three_cell().RegId;
	}
}

export class Five_Parallel extends Five_Choice {
	constructor(conditionalphrase = "") {
		super(conditionalphrase);
	}

	yieldElement() {
		var ttdd = document.createElement('td');
		ttdd.className = 'five-parallel';

		// Map color back to jewel class for glowing effects
		if (this.branchesColour === '#9b111e') ttdd.classList.add('jewel-ruby');
		else if (this.branchesColour === '#0f52ba') ttdd.classList.add('jewel-sapphire');
		else if (this.branchesColour === '#50c878') ttdd.classList.add('jewel-emerald');
		else if (this.branchesColour === '#ffc87c') ttdd.classList.add('jewel-topaz');
		else ttdd.style.backgroundColor = this.branchesColour;

		let validBranchCount = 0;
		this.branches.forEach(brch => {
			let branch = typeof d4 === 'function' ? d4(brch) : null;
			if (!branch) return;
			const isHorizontalCoderTrack = this.branches.some(otherId => {
				return typeof d4 === 'function' && d4(otherId)?.pairedCoderTrackId === branch.RegId;
			});
			if (!isHorizontalCoderTrack) validBranchCount++;
		});
		ttdd.rowSpan = this.structuralHeight || validBranchCount || 1;
		var container = document.createElement('div');
		container.className = 'choice-hub-container';

		var phraseInput = document.createElement('input');
		phraseInput.type = 'text';
		phraseInput.value = this.conditional_phrase;
		phraseInput.placeholder = 'condition for this parallel.';
		phraseInput.onchange = (e) => { this.conditional_phrase = e.target.value; };
		container.appendChild(phraseInput);

		var parallelGroup = document.createElement('div');
		parallelGroup.className = 'parallel-branches';

		this.branches.forEach(brch => {
			let branch = typeof d4 === 'function' ? d4(brch) : null;
			if (!branch) { console.log("Branch used without respecting RegId"); return; }

			const isHorizontalCoderTrack = this.branches.some(otherId => {
				return typeof d4 === 'function' && d4(otherId)?.pairedCoderTrackId === branch.RegId;
			});
			if (isHorizontalCoderTrack) return;

			var branchDiv = document.createElement('div');
			var label = document.createElement('label');
			label.textContent = `${branch.name}`;
			branchDiv.appendChild(label);
			parallelGroup.appendChild(branchDiv);
		});

		const addCoderBtn = document.createElement('button');
		addCoderBtn.textContent = '+ Coder Track';
		addCoderBtn.title = 'Add a new Cell/Horizontal coder track pair here.';
		addCoderBtn.style.marginTop = '10px';
		addCoderBtn.onclick = () => handleAddNewCoderTrack(this.RegId);
		container.appendChild(addCoderBtn);

		container.appendChild(parallelGroup);
		ttdd.appendChild(container);
		return ttdd;
	}
}

export class Five_Judgement extends Five_Parallel {
	constructor(conditionalphrase = "") {
		super(conditionalphrase);
		this.OrthoFourRow = new Four_Row("⚖ Moral Gate");
		this.OrthoFourRow.parentChoiceId = this.RegId; // Backwards traversal support
		this.raw_verdict = null;
		this.verdict = []; // Boolean flag array 1:1 with this.branches
		this.branchesColour = '#4a1942'; // Distinguishing deep purple
	}

	addBranch(branchTrackRegId) {
		super.addBranch(branchTrackRegId);
		this.verdict.push(false); // Gate closed by default
	}

	parseRawVerdict(string_raw_verdict) {
		this.raw_verdict = string_raw_verdict;
		try {
			// using extractJsonObject from helpers.js (make sure to import or use global if available)
			const parsed = typeof extractJsonObject === 'function' ? extractJsonObject(string_raw_verdict) : JSON.parse(string_raw_verdict);
			if (parsed && Array.isArray(parsed.subcomponents)) {
				for (let i = 0; i < this.branches.length; i++) {
					const branchTrack = typeof d4 === 'function' ? d4(this.branches[i]) : null;
					if (branchTrack) {
						let bName = branchTrack.name || "";
						// some components parse with component_name
						if (branchTrack.knowledgeNode && branchTrack.knowledgeNode.label) {
							bName = branchTrack.knowledgeNode.label;
						}
						
						const match = parsed.subcomponents.find(s => s.name === bName || s.component_name === bName);
						this.verdict[i] = match && match.verdict === true;
					}
				}
			}
		} catch (e) {
			console.error("[Five_Judgement] Failed to parse moral gate verdict:", e);
		}
	}
}

export class Hyper_Five_Choice extends Five_Choice {
	constructor(conditionalphrase = "Synthesis Merge") {
		super(conditionalphrase);
		this.parentTrackIds = []; // Allow multiple incoming tracks
		this.branchesColour = '#8b5cf6'; // Amethyst purple
	}

	addParentTrack(trackId) {
		if (!this.parentTrackIds.includes(trackId)) {
			this.parentTrackIds.push(trackId);
		}
	}

	addBranch(branchTrackRegId) {
		// Enforce that branches is an array but contains ONLY ONE Four_Component
		let xe3 = typeof d4 === 'function' ? d4(branchTrackRegId) : null;
		if (xe3) {
			xe3.parentChoiceId = this.RegId;
			if (this.branches.length > 0) {
				console.warn(`[Hyper_Five_Choice] Overwriting branch. Hyper_Five_Choice only supports a single outgoing branch.`);
			}
			this.branches = [xe3.RegId];
			this.selectedBranchId = xe3.RegId;
		}
	}

	getOffset() {
		let maxOffset = 0;
		// Recursively evaluate the deepest path amongst ALL parent tracks leading to this single merge point
		this.parentTrackIds.forEach(pId => {
			const pTrack = typeof d4 === 'function' ? d4(pId) : null;
			if (pTrack) {
				let trackOffset = pTrack.sequence.length + 1; // plus the cells + header
				const pChoice = typeof d5 === 'function' ? d5(pTrack.parentChoiceId) : null;
				if (pChoice) {
					trackOffset += pChoice.getOffset();
				}
				if (trackOffset > maxOffset) maxOffset = trackOffset;
			}
		});
		return maxOffset + 1; // Return the absolute deepest indentation + 1 structural gap
	}

	yieldElement() {
		var ttdd = document.createElement('td');
		ttdd.className = 'hyper-five-choice';
		ttdd.classList.add('jewel-amethyst'); // CSS class for glowing effect if it exists
		ttdd.style.backgroundColor = this.branchesColour;
		ttdd.style.border = '2px solid #c084fc';
		ttdd.style.borderRadius = '8px';
		ttdd.style.padding = '10px';
		ttdd.style.boxShadow = '0 0 10px rgba(139, 92, 246, 0.5)';

		ttdd.rowSpan = this.parentTrackIds.length; // Spans exactly its parents. Child branching operates securely on the next contiguous horizontal boundary!
		var container = document.createElement('div');
		container.className = 'choice-hub-container';

		var phraseInput = document.createElement('input');
		phraseInput.type = 'text';
		phraseInput.value = this.conditional_phrase;
		phraseInput.placeholder = 'condition for this merge.';
		phraseInput.onchange = (e) => { this.conditional_phrase = e.target.value; };
		container.appendChild(phraseInput);

		var mergeGroup = document.createElement('div');
		mergeGroup.className = 'merge-branches';
		mergeGroup.style.fontSize = '12px';
		mergeGroup.style.color = '#e2e8f0';
		mergeGroup.style.marginTop = '8px';

		var label = document.createElement('div');
		label.textContent = `Merging ${this.parentTrackIds.length} subcomponents:`;
		label.style.fontWeight = 'bold';
		label.style.marginBottom = '4px';
		label.style.color = '#fff';
		mergeGroup.appendChild(label);

		this.parentTrackIds.forEach(pId => {
			let pTrack = typeof d4 === 'function' ? d4(pId) : null;
			let name = pTrack ? pTrack.name : `Track ${pId}`;
			let item = document.createElement('div');
			item.textContent = `↳ ${name}`;
			mergeGroup.appendChild(item);
		});

		container.appendChild(mergeGroup);

		if (this.branches.length > 0) {
			var outGroup = document.createElement('div');
			outGroup.style.marginTop = '12px';
			outGroup.style.fontWeight = 'bold';
			outGroup.style.color = '#fff';
			outGroup.style.background = 'rgba(0,0,0,0.3)';
			outGroup.style.padding = '4px';
			outGroup.style.borderRadius = '4px';
			let outTrack = typeof d4 === 'function' ? d4(this.branches[0]) : null;
			let outName = outTrack ? outTrack.name : `Track ${this.branches[0]}`;
			outGroup.textContent = `Synthesizes ↑ into: ${outName}`;
			container.appendChild(outGroup);
		}

		ttdd.appendChild(container);
		return ttdd;
	}
}

export class Reverse_Five_Parallel extends Hyper_Five_Choice {
	constructor(conditionalphrase = "Synthesis Merge") {
		super(conditionalphrase);
	}

	yieldElement() {
		var ttdd = document.createElement('td');
		ttdd.className = 'reverse-five-parallel';
		ttdd.style.backgroundColor = this.branchesColour;

		ttdd.rowSpan = this.structuralHeight || this.parentTrackIds.length || 1;

		var container = document.createElement('div');
		container.className = 'choice-hub-container recomposition-merge-hub';

		var phraseInput = document.createElement('input');
		phraseInput.type = 'text';
		phraseInput.value = this.conditional_phrase;
		phraseInput.style.fontWeight = "bold";
		phraseInput.style.textAlign = "center";
		phraseInput.disabled = true;

		container.appendChild(phraseInput);

		var mergeLabels = document.createElement('div');
		mergeLabels.style.fontSize = "0.75rem";
		mergeLabels.style.color = "white";
		mergeLabels.textContent = `Merging ${this.parentTrackIds.length} tracks...`;
		container.appendChild(mergeLabels);

		ttdd.appendChild(container);
		return ttdd;
	}
}

export class Six_Plan {
	constructor(name = "") {
		this.id = getNextUID();
		this.name = name;
		this.tracks = [];
		this.steps = [];  // Holds Five_Choice array

		// Argument members (Onto27 adherence)
		this._name = name;
		this.conclusionId = null;
		this.nodes = {}; // { [hopRegId]: { id: hopRegId, deepInboundLinks: [], deepOutboundLinks: [] } }

		this.initializeDefaultPlan();

		SixPlanArray.push(this);
		this.RegId = SixPlanArray.length - 1;
	}

	addNode(hopRegId) {
		if (!this.nodes[hopRegId]) {
			this.nodes[hopRegId] = {
				id: hopRegId,
				deepInboundLinks: [],
				deepOutboundLinks: []
			};
		}
	}

	toOntoJson(config = {}) {
		const dehydratedNodes = [];
		for (const regId in this.nodes) {
			const nodeData = this.nodes[regId];
			const hop = dH(parseInt(regId, 10));
			if (hop) {
				dehydratedNodes.push({
					node: hop.toJson(),
					deepInboundLinks: nodeData.deepInboundLinks,
					deepOutboundLinks: nodeData.deepOutboundLinks
				});
			}
		}
		return {
			_type: 'Argument',
			name: this._name,
			conclusionId: this.conclusionId,
			nodes: dehydratedNodes
		};
	}


	getJSONstring() {
		var stepsData = this.steps.map(choiceRegId => JSON.parse(d5(choiceRegId).getJSONstring()));
		var data = {
			id: this.id,
			steps: stepsData
		};
		return JSON.stringify(data, null, 2);
	}



	static fromJSON(jsonString) {
		if (!jsonString || typeof jsonString !== 'string') {
			console.error('six_plan.fromJSON argument not string.');
			return new Six_Plan();
		}
		try {
			var datum = JSON.parse(jsonString);
			var newInstance = new Six_Plan();
			newInstance.steps = [];
			if (datum.steps && Array.isArray(datum.steps)) {
				datum.steps.forEach(choiceData => {
					var newChoiceInstance = Five_Choice.fromJSON(choiceData);
					newChoiceInstance.parentPlanId = newInstance.RegId;
					newInstance.steps.push(newChoiceInstance.RegId);
				});
			} else {
				console.log('import fail');
				newInstance.initializeDefaultPlan();
			}
			return newInstance;

		} catch (er) {
			console.error(`six-plan.fromJSON error =: ${er.message}`);
		}
	}

	reconnectParentPointers() {
		var traverse = (trackRegId) => {
			var track = d4(trackRegId);
			if (!track) return;
			if (track.terminatingChoice !== null) {
				var choice = d5(track.terminatingChoice);
				if (choice) {
					choice.parentTrackId = track.RegId;
					choice.branches.forEach(branchRegId => {
						d4(branchRegId).parentChoiceId = choice.RegId;
						traverse(branchRegId);
					});
				}
			}
		};
		this.steps.forEach(choiceRegId => {
			d5(choiceRegId).branches.forEach(branchRegId => {
				traverse(branchRegId);
			});
		});
	}


	initializeDefaultPlan() {
		this.steps = [];
		var firstChoice = new Five_Choice(`start${globalUID}`);
		firstChoice.parentPlanId = this.RegId;
		var baseTrack = new Four_Row("Start");
		baseTrack.addCell(); //add one empty knot to start with. 
		firstChoice.addBranch(baseTrack.RegId);
		this.steps.push(firstChoice.RegId);
	}


	parseJSONstring(str) {//delete this.
		var sp = JSON.parse(str);
		if (Array.isArray(sp.steps)) {
			console.log(` here it is${sp.steps.length} ${JSON.stringify(sp.steps[0])}`);

		}
	}



}

export function createModelSelector(selectedValue, onChangeCallback) {
	var modelz = document.createElement('select');
	modelz.className = 'cell-model-selector';
	//the global modeloptions at the DOMContentLoaded is the global repo
	for (var key in modeloptions) {
		if (modeloptions.hasOwnProperty(key)) {
			var opt1 = document.createElement('option');
			opt1.value = modeloptions[key].value;
			opt1.textContent = key;
			modelz.appendChild(opt1);
		}
	}
	modelz.value = selectedValue;
	modelz.onchange = onChangeCallback;
	return modelz;
}

export class Seven_Wish {
	constructor(name = "New Wish") {
		this.id = getNextUID();
		this.name = name;

		// Create default plans and summary knot
		const decPlan = new Six_Plan(`${name} Decomposition`);
		this.decomposition = decPlan.RegId;

		const recPlan = new Six_Plan(`${name} Recomposition`);
		this.recomposition = recPlan.RegId;

		SevenWishArray.push(this);
		this.RegId = SevenWishArray.length - 1;

		decPlan.parentWishId = this.RegId;
		recPlan.parentWishId = this.RegId;

		// Knot summary memory binding
		const sumKnot = typeof window !== 'undefined' && typeof window.Wish_Summary_Cell !== 'undefined' ? new window.Wish_Summary_Cell(this.RegId) : null;
		this.summary = sumKnot ? sumKnot.RegId : null;
	}

	getJSONstring() {
		const data = {
			id: this.id,
			RegId: this.RegId,
			name: this.name,
			decomposition: this.decomposition !== null && typeof d6 === 'function' && d6(this.decomposition) ? JSON.parse(d6(this.decomposition).getJSONstring()) : null,
			recomposition: this.recomposition !== null && typeof d6 === 'function' && d6(this.recomposition) ? JSON.parse(d6(this.recomposition).getJSONstring()) : null,
			summary: this.summary !== null && typeof k1 === 'function' && k1(this.summary) ? JSON.parse(k1(this.summary).getJSONstring()) : null
		};
		return JSON.stringify(data, null, 2);
	}

	exportTemporalNexusJSON() {
		const data = { nodes: [] };
		const visitedIds = new Set();

		if (typeof FourRowArray !== 'undefined') {
			FourRowArray.forEach(row => {
				if (row && row.knowledgeNode && !visitedIds.has(row.knowledgeNode.id)) {
					const kn = row.knowledgeNode;
					visitedIds.add(kn.id);
					data.nodes.push({
						id: kn.id,
						label: kn.label,
						data: { description: kn.description || "" },
						status: kn.isProcessed ? 'complete' : 'active',
						deps: (kn.rawJsonResponse && Array.isArray(kn.rawJsonResponse.subcomponents))
							? kn.rawJsonResponse.subcomponents.map(sub => sub.name)
							: kn.dependencies.map(d => d.name || d.label || d.id),
						commits: [],
						innovations: { nodes: [], edges: [] },
						tasks: []
					});
				}
			});
		}

		return JSON.stringify(data, null, 2);
	}

	static fromJSON(data) {
		const newInstance = new Seven_Wish(data.name);

		if (data.decomposition) {
			SixPlanArray.splice(newInstance.decomposition, 1);
			const dec = Six_Plan.fromJSON(data.decomposition);
			dec.parentWishId = newInstance.RegId;
			newInstance.decomposition = dec ? dec.RegId : null;
		}
		if (data.recomposition) {
			SixPlanArray.splice(newInstance.recomposition, 1);
			const rec = Six_Plan.fromJSON(data.recomposition);
			rec.parentWishId = newInstance.RegId;
			newInstance.recomposition = rec ? rec.RegId : null;
		}
		if (data.summary && typeof window !== 'undefined' && typeof window.KnotClass !== 'undefined') {
			if (newInstance.summary !== null && typeof k1 === 'function') { k1(newInstance.summary).destructor(); }
			const sum = window.KnotClass.fromJSON(JSON.stringify(data.summary));
			newInstance.summary = sum ? sum.RegId : null;
		}

		return newInstance;
	}
}

// ═══════════════════════════════════════════════════════════════
// Ontology Models (Onto27 Adherence)
// ═══════════════════════════════════════════════════════════════


export class Knot {
	constructor(parentTrackId = null) {
		// --- Core Data ---
		this.TC = new Three_Cell().RegId;

		// --- Behavioral Configuration (The Strategy) ---
		this.knotType = Knot_Type.USER_PROMPT_OWN_STRAND_HISTORY;

		// --- Referential and Positional Data ---
		this.parentTrackId = parentTrackId;
		const tc = d3(this.TC);
		if (tc) tc.parentTrackId = this.parentTrackId;

		// --- Source Configuration ---
		this.sourcePromptKnotIds = [];
		this.sourceContextKnotIds = [];
		this.promptTemplateId = "default";

		// --- processing function. 
		this.requestCallbackId = "none";
		this.responseCallbackId = "none";
		this.contextCallbackId = "none";
		this.forceJsonOutput = false;

		this.executionStatus = ExecutionStatus.PENDING;

		this._debug_finalPrompt = '';
		this._debug_contextMessages = [];
		this._debug_rawResponse = '';
		this.prompt_tokens = 0;
		this.response_tokens = 0;

		// --- Registry and Identification ---
		KnotArray.push(this);
		this.RegId = KnotArray.length - 1;
		this.id = `knot-${this.RegId}`;

		this.duration = 1;
		this.delay = -1;//undefined.
		this.start_of_duration = 0;
		this.end_of_duration = 0;
		this.start_of_delay = 0;
		this.end_of_delay = 0;
	}

	/**
	 * Creates a deep clone of this knot instance. 
	 * @returns {Knot} A new knot object with copied data. 
	 */
	clone() {
		//create a new knot. Its parentStrandId is temporary: it will be corrected by the strand.clone()
		const newKnot = new Knot(this.parentTrackId);
		//deep copy confirutaiton properties. 
		newKnot.knotType = this.knotType;
		newKnot.sourcePromptKnotIds = JSON.parse(JSON.stringify(this.sourcePromptKnotIds));
		newKnot.sourceContextKnotIds = JSON.parse(JSON.stringify(this.sourceContextKnotIds));
		newKnot.promptTemplateId = this.promptTemplateId;
		newKnot.requestCallbackId = this.requestCallbackId;
		newKnot.responseCallbackId = this.responseCallbackId;
		newKnot.forceJsonOutput = this.forceJsonOutput;
		newKnot.executionStatus = this.executionStatus;
		newKnot._debug_contextMessages = this._debug_contextMessages;
		newKnot._debug_finalPrompt = this._debug_finalPrompt;
		newKnot._debug_rawResponse = this._debug_rawResponse;
		newKnot.prompt_tokens = this.prompt_tokens;
		newKnot.response_tokens = this.response_tokens;
		//clone the associated three_cell by creating anew one.
		const originalThreeCell = d3(this.TC);
		const newThreeCell = d3(newKnot.TC);
		d2(newThreeCell.prompt).content = d2(originalThreeCell.prompt).content;
		d2(newThreeCell.response).content = d2(originalThreeCell.response).content;
		newThreeCell.model = originalThreeCell.model;
		return newKnot;
	}



	/**
	 * Helper function to manage the visibility of configuration fields based on the selected Knot_Type.
	 * @param {HTMLElement} container - The main container div for the Knot's UI.
	 */
	_updateConfigVisibility(container) {
		const promptSourceInput = container.querySelector('.prompt-source-input');
		const contextSourceInput = container.querySelector('.context-source-input');
		const templateSelector = container.querySelector('.prompt-template-selector');

		// Default to hiding all config-dependent fields
		promptSourceInput.style.display = 'none';
		contextSourceInput.style.display = 'none';
		templateSelector.style.display = 'none';

		// Fallback to empty string to prevent .includes crash if knotType is undefined
		const kType = this.knotType || '';

		// Show fields based on the Knot Type string
		if (kType.includes('SOURCE_KNOT') || kType.includes('MULTI_KNOT')) {
			promptSourceInput.style.display = 'block';
		}
		if (kType.includes('OTHER_KNOT_HISTORY')) { // CHANGED from OTHER_STRAND
			contextSourceInput.style.display = 'block';
		}
		if (kType.includes('WITH_TEMPLATE')) {
			templateSelector.style.display = 'block';
		}
	}

	getAddress() {
		let fourRowId = 'N/A', fiveChoiceId = 'N/A', sixPlanId = 'N/A', sevenWishId = 'N/A';
		if (this.parentTrackId !== null) {
			const fourRow = typeof d4 === 'function' ? d4(this.parentTrackId) : null;
			if (fourRow) {
				fourRowId = fourRow.RegId;
				fiveChoiceId = fourRow.parentChoiceId !== null ? fourRow.parentChoiceId : 'N/A';
				const fiveChoice = typeof d5 === 'function' ? d5(fourRow.parentChoiceId) : null;

				if (fiveChoice) {
					sixPlanId = fiveChoice.parentPlanId !== null ? fiveChoice.parentPlanId : 'N/A';
					const sixPlan = typeof d6 === 'function' ? d6(fiveChoice.parentPlanId) : null;
					if (sixPlan) {
						sevenWishId = (sixPlan.parentWishId !== undefined && sixPlan.parentWishId !== null) ? sixPlan.parentWishId : 'N/A';
					}
				}

				// --- Robust Search Fallbacks (if pointers are missing or broken) ---
				if (sixPlanId === 'N/A' && typeof SixPlanArray !== 'undefined' && fiveChoiceId !== 'N/A') {
					for (const plan of SixPlanArray) {
						if (plan && plan.steps && plan.steps.includes(fiveChoiceId)) {
							sixPlanId = plan.RegId;
							break;
						}
					}
				}
				if (sevenWishId === 'N/A' && sixPlanId !== 'N/A' && typeof SevenWishArray !== 'undefined') {
					for (const sw of SevenWishArray) {
						if (sw && (sw.decomposition === sixPlanId || sw.recomposition === sixPlanId)) {
							sevenWishId = sw.RegId;
							break;
						}
					}
				}
			}
		}
		return `[${sevenWishId}, ${sixPlanId}, ${fiveChoiceId}, ${fourRowId}, ${this.RegId}]`;
	}

	/**
	 * Renders the complete, interactive UI for this Knot, to be placed in a table cell.
	 */
	yieldElement() {
		const td = document.createElement('td');
		td.className = 'quipu-knot';

		const container = document.createElement('div');
		container.className = 'knot-container';
		container.id = this.id;


		switch (this.executionStatus) {
			case ExecutionStatus.WORKING:
				container.style.backgroundColor = 'rgba(255, 215, 0, 0.15)';
				container.classList.add('shimmering');
				container.style.boxShadow = '0 0 15px rgba(255, 215, 0, 0.3)';
				break;
			case ExecutionStatus.DONE:
				container.style.backgroundColor = 'rgba(80, 200, 120, 0.15)';
				container.style.boxShadow = '0 0 10px rgba(80, 200, 120, 0.2)';
				break;
			case ExecutionStatus.FAILED:
				container.style.backgroundColor = 'rgba(155, 17, 30, 0.15)';
				container.style.boxShadow = '0 0 10px rgba(155, 17, 30, 0.2)';
				break;
			case ExecutionStatus.PENDING:
			default:
				container.style.backgroundColor = 'transparent';
				break;
		}



		// --- 1. Knot Address Display ---
		const address = this.getAddress();
		const addressDiv = document.createElement('div');
		addressDiv.className = 'knot-address';
		addressDiv.textContent = `Addr: ${address}`;

		// --- 2. Knot Type Selector (The Strategy Chooser) ---
		const typeSelector = document.createElement('select');
		typeSelector.className = 'knot-type-selector';
		for (const type in Knot_Type) {
			const option = document.createElement('option');
			option.value = Knot_Type[type];
			option.textContent = type;
			typeSelector.appendChild(option);
		}
		typeSelector.value = this.knotType;
		typeSelector.onchange = (e) => {
			this.knotType = e.target.value;
			this._updateConfigVisibility(container); // Update UI visibility on change
			if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
		};

		// --- 3. Configuration Inputs (Initially hidden/shown by JS) ---
		const configContainer = document.createElement('div');
		configContainer.className = 'knot-config-container';

		// Prompt Source Input
		const promptSourceInput = document.createElement('input');
		promptSourceInput.type = 'text';
		const labelsrc = document.createElement('label');
		labelsrc.for = 'prompt-source-input';
		labelsrc.textContent = 'prmt srcs';
		promptSourceInput.className = 'prompt-source-input';
		promptSourceInput.placeholder = 'Source Knot Addr(s), e.g., [0,1]';
		promptSourceInput.value = reverseParseAddress(this.sourcePromptKnotIds);
		promptSourceInput.onchange = (e) => { this.sourcePromptKnotIds = parseAddressString(e.target.value); if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate(); };

		// Context Source Input
		const contextSourceInput = document.createElement('input');
		contextSourceInput.type = 'text';
		contextSourceInput.className = 'context-source-input';
		const labelctx = document.createElement('label');
		labelctx.for = 'context-source-input';
		labelctx.textContent = "ctx srcs:"
		contextSourceInput.placeholder = 'Context Knot Addr(s), e.g., [0,0],[0,1]'; // UPDATED placeholder
		contextSourceInput.value = reverseParseAddress(this.sourceContextKnotIds);
		contextSourceInput.onchange = (e) => { this.sourceContextKnotIds = parseAddressString(e.target.value); if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate(); };

		// Prompt Template Selector
		const templateSelector = document.createElement('select');
		templateSelector.className = 'prompt-template-selector';
		if (typeof Prompt_engines !== 'undefined') {
			for (const engine of Prompt_engines) {
				const option = document.createElement('option');
				option.value = engine.id;
				option.textContent = engine.name;
				templateSelector.appendChild(option);
			}
		}
		templateSelector.value = this.promptTemplateId;
		templateSelector.onchange = (e) => { this.promptTemplateId = e.target.value; };
		//forceJSON 
		const jsonFormatDiv = document.createElement('div');
		jsonFormatDiv.className = 'knot-json-toggle';
		const jsonCheckbox = document.createElement('input');
		jsonCheckbox.type = 'checkbox';
		jsonCheckbox.id = `json-toggle-${this.RegId}`;
		jsonCheckbox.checked = this.forceJsonOutput;
		jsonCheckbox.onchange = (e) => { this.forceJSONOutput = e.target.checked; if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate(); }
		const jsonLabel = document.createElement('label');
		jsonLabel.textContent = `Force JSON Output`;
		jsonLabel.htmlFor = `json-toggle-${this.RegId}`;//htmlFor ? 
		jsonFormatDiv.appendChild(jsonCheckbox); jsonFormatDiv.appendChild(jsonLabel);

		configContainer.appendChild(labelsrc);
		configContainer.appendChild(promptSourceInput);
		configContainer.appendChild(labelctx);
		configContainer.appendChild(contextSourceInput);
		configContainer.appendChild(templateSelector);
		configContainer.appendChild(jsonFormatDiv);

		// --- 4. The Standard Three_Cell UI ---
		const threeCellElement = d3(this.TC).yieldElement();

		const callbackContainer = document.createElement('div');
		//request callback selector
		const requestCallbackLabel = document.createElement('label');
		requestCallbackLabel.textContent = 'prompt func:';
		const requestCallbackSelector = document.createElement('select');
		for (const key in processingCallbacks) {
			const option = document.createElement('option');
			option.value = key;
			option.textContent = key;
			requestCallbackSelector.appendChild(option);
		}
		requestCallbackSelector.value = this.requestCallbackId;
		requestCallbackSelector.onchange = (e) => { this.requestCallbackId = e.target.value; if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate(); };
		//response callback selector. 
		const responseCallbackLabel = document.createElement('label');
		responseCallbackLabel.textContent = `response func:`;
		const responseCallbackSelector = document.createElement('select');
		for (const key in processingCallbacks) {
			const option = document.createElement('option');
			option.value = key;
			option.textContent = key;
			responseCallbackSelector.appendChild(option);
		} responseCallbackSelector.value = this.responseCallbackId;
		responseCallbackSelector.onchange = (e) => { this.responseCallbackId = e.target.value; if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate(); };
		const contextCallbackLabel = document.createElement('label');
		contextCallbackLabel.textContent = `context func:`;
		const contextCallbackSelector = document.createElement('select');
		for (const key in processingCallbacks) {
			const option = document.createElement('option');
			option.value = key;
			option.textContent = key;
			contextCallbackSelector.appendChild(option);
		}
		contextCallbackSelector.onchange = (e) => { this.contextCallbackId = e.target.value; };


		callbackContainer.appendChild(requestCallbackLabel);
		callbackContainer.appendChild(requestCallbackSelector);
		callbackContainer.appendChild(responseCallbackLabel);
		callbackContainer.appendChild(responseCallbackSelector);

		const debugDetails = document.createElement('details');
		const debugSummary = document.createElement('summary');
		debugSummary.textContent = 'Debug sandbox';
		debugDetails.appendChild(debugSummary);
		const sandboxDiv = document.createElement('div');
		sandboxDiv.className = 'knot-debug-sandbox';
		//textarea for finalprmpt.
		const labelFinalPrompt = document.createElement('label');
		labelFinalPrompt.textContent = 'final prompt (after callback):';
		sandboxDiv.appendChild(labelFinalPrompt);
		const finalPromptArea = document.createElement('textarea');
		finalPromptArea.readOnly = true;
		finalPromptArea.value = this._debug_finalPrompt;
		// --- Size persistence (same pattern as Two_Layer) ---
		const finalPromptId = `knot-debug-finalprompt-${this.RegId}`;
		finalPromptArea.id = finalPromptId;
		const savedFinalPrompt = textAreaSizeRegistry.get(finalPromptId);
		if (savedFinalPrompt) { finalPromptArea.style.width = savedFinalPrompt.width; finalPromptArea.style.height = savedFinalPrompt.height; }
		finalPromptArea.addEventListener('mouseup', () => textAreaSizeRegistry.set(finalPromptId, { width: finalPromptArea.style.width, height: finalPromptArea.style.height }));
		sandboxDiv.appendChild(finalPromptArea);

		//textareafor contextmessages.
		const labelContextMessages = document.createElement('label');
		labelContextMessages.textContent = 'context messages (sent to LLM):';
		sandboxDiv.appendChild(labelContextMessages);
		const contextMessagesArea = document.createElement('textarea');
		contextMessagesArea.readOnly = true;
		contextMessagesArea.value = typeof this._debug_contextMessages === 'string' ? this._debug_contextMessages : JSON.stringify(this._debug_contextMessages, null, 2);
		// --- Size persistence ---
		const contextMsgId = `knot-debug-contextmsg-${this.RegId}`;
		contextMessagesArea.id = contextMsgId;
		const savedCtx = textAreaSizeRegistry.get(contextMsgId);
		if (savedCtx) { contextMessagesArea.style.width = savedCtx.width; contextMessagesArea.style.height = savedCtx.height; }
		contextMessagesArea.addEventListener('mouseup', () => textAreaSizeRegistry.set(contextMsgId, { width: contextMessagesArea.style.width, height: contextMessagesArea.style.height }));
		sandboxDiv.appendChild(contextMessagesArea);

		const labelRawResponse = document.createElement('label');
		labelRawResponse.textContent = 'Row LLM Response (before callback):';
		sandboxDiv.appendChild(labelRawResponse);
		const rawResponseArea = document.createElement('textarea');
		rawResponseArea.readOnly = true;
		rawResponseArea.value = this._debug_rawResponse;
		// --- Size persistence ---
		const rawResponseId = `knot-debug-rawresponse-${this.RegId}`;
		rawResponseArea.id = rawResponseId;
		const savedRaw = textAreaSizeRegistry.get(rawResponseId);
		if (savedRaw) { rawResponseArea.style.width = savedRaw.width; rawResponseArea.style.height = savedRaw.height; }
		rawResponseArea.addEventListener('mouseup', () => textAreaSizeRegistry.set(rawResponseId, { width: rawResponseArea.style.width, height: rawResponseArea.style.height }));
		sandboxDiv.appendChild(rawResponseArea);

		debugDetails.appendChild(sandboxDiv);
		container.appendChild(debugDetails);
		var execAdHoc = document.createElement('button');
		execAdHoc.textContent = "Execute this Knot";
		execAdHoc.title = "execute only this specific knot."
		execAdHoc.onclick = () => {
			if (typeof handleExecuteSingleTurn === 'function') {
				handleExecuteSingleTurn(this.RegId);
			} else {
				console.error("handleExecuteSingleTurn not found in scope.");
			}
		};
		// --- Assemble the UI ---
		container.appendChild(addressDiv);
		container.appendChild(typeSelector);
		container.appendChild(configContainer);
		container.appendChild(callbackContainer);
		container.appendChild(threeCellElement);
		container.appendChild(execAdHoc);
		td.appendChild(container);

		// Initial setup of UI visibility
		this._updateConfigVisibility(container);

		return td;
	}

	/**
	 * Serializes this Knot into a JSON string.
	 * @returns {string} The JSON representation of this Knot's configuration and state.
	 */
	getJSONstring() {
		console.log(`INSIDE KNOT.getJSONstring ${this.forceJsonOutput} is a ${typeof this.forceJsonOutput}`);

		const data = {
			RegId: this.RegId,
			knotType: this.knotType,
			parentTrackId: this.parentTrackId,
			sourcePromptKnotIds: this.sourcePromptKnotIds,
			sourceContextKnotIds: this.sourceContextKnotIds,
			promptTemplateId: this.promptTemplateId,
			forceJsonOutput: this.forceJsonOutput,
			requestCallbackId: this.requestCallbackId,
			responseCallbackId: this.responseCallbackId,
			_debug_rawResponse: this._debug_rawResponse,
			prompt_tokens: this.prompt_tokens,
			response_tokens: this.response_tokens,
			TC: JSON.parse(d3(this.TC).getJSONstring())
		};
		return JSON.stringify(data);

	}

	/**
	 * Reconstructs a Knot instance from a JSON string.
	 * @param {string} jsonData - The serialized JSON string.
	 * @returns {Knot} A newly instantiated Knot populated with the parsed data.
	 */
	static fromJSON(jsonData) {
		const data = JSON.parse(jsonData);

		let newKnot;
		if (data.className === "Wish_Summary_Cell") {
			newKnot = new Wish_Summary_Cell(data.parentWishRegId);
		} else {
			newKnot = new Knot(data.parentTrackId);
		}

		const newThreeCell = Three_Cell.fromJSON((data.TC));
		newKnot.TC = newThreeCell.RegId;

		newKnot.knotType = data.knotType;
		newKnot.sourcePromptKnotIds = data.sourcePromptKnotIds || [];
		newKnot.sourceContextKnotIds = data.sourceContextKnotIds || [];
		newKnot.promptTemplateId = data.promptTemplateId;
		newKnot.forceJsonOutput = data.forceJsonOutput;
		newKnot.requestCallbackId = data.requestCallbackId;
		newKnot.responseCallbackId = data.responseCallbackId;
		newKnot.prompt_tokens = data.prompt_tokens || 0;
		newKnot.response_tokens = data.response_tokens || 0;

		return newKnot;
	}

	/**
	 * Recursively calculates the 'delay' (temporal depth) of this knot within a synchronous execution graph.
	 * @param {number} quipuRegId - The ID of the Quipu this Knot belongs to.
	 * @param {Set<number>} visited - A set of visited Knot IDs for cycle detection.
	 * @returns {number} The calculated delay (in ticks).
	 */
	calculateTemporalDepth(quipuRegId, visited = new Set()) {
		//1. memoization : if already calculated, return it. 
		if (this.delay !== -1) { return this.delay; }

		//2. cycle detection 
		if (visited.has(this.RegId)) {
			console.error(`circular path detected knot=${this.RegId}`);
			return 9999;
		}
		visited.add(this.RegId);

		let maxDependencyDelay = -1;
		//3. check context dependecies (OWN_STRAND or OTHER_HISTORY)
		if (this.knotType.includes('OWN_STRAND_HISTORY')) {
			//implicit dependency: the previous knot in this track/strand. 
			const parentTrack = d4(this.parentTrackId);
			if (parentTrack) {
				const myIndex = parentTrack.sequence.indexOf(this.RegId);
				if (myIndex > 0) {
					const prevKnotRegId = parentTrack.sequence[myIndex - 1];
					const prevKnot = k1(prevKnotRegId);
					if (prevKnot) {
						const a = prevKnot.calculateTemporalDepth(quipuRegId, visited);
						maxDependencyDelay = Math.max(maxDependencyDelay, a);
					}
				}
			}
		}
		else if (this.knotType.includes('OTHER_KNOT_HISTORY')) {
			//explicit dependencies from sourceContextKnotsIds
			this.sourceContextKnotIds.forEach(addr => {
				const depId = resolveKnotAddress(addr, this.RegId, quipuRegId);
				if (depId !== null) {
					const a = k1(depId).calculateTemporalDepth(quipuRegId, visited);
					maxDependencyDelay = Math.max(maxDependencyDelay, a);
				}
			});
		}

		//4. check prompt source dependencies
		if (this.sourcePromptKnotIds && this.sourcePromptKnotIds.length > 0) {
			this.sourcePromptKnotIds.forEach(addr => {
				const depId = resolveKnotAddress(addr, this.RegId, quipuRegId);
				if (depId !== null) {
					const a = k1(depId).calculateTemporalDepth(quipuRegId, visited);
					maxDependencyDelay = Math.max(maxDependencyDelay, a);
				}
			});
		}
		//5. calulate and store current delay = max(dependencies + 1; 
		this.delay = maxDependencyDelay + 1;
		visited.delete(this.RegId);
		return this.delay;
	}

	/**
	 * Calculates the completion progress of this knot given a current global time.
	 * @param {number} present_time - The current application tick time.
	 * @returns {number} A float between 0 and 1 representing the progress.
	 */
	get_progressDuration(present_time) {
		//Reuse logic from temporal thing. 
		if (present_time < this.start_of_duration) { return 0; }
		if (present_Time > this.end_of_duration) { return 1; }
		return (present_time - this.start_of_duration) / this.duration;
	}

	/**
	 * Implements the Temporal_Thing_5D interface, allowing the temporal engine to schedule the knot's execution.
	 * @param {number} cycle_start_time - The time the cycle begins.
	 * @param {number} compensated_delay - The accumulated delay offset.
	 */
	schedule_next_cycle(cycle_start_time, compensated_delay) {
		this.start_of_delay = cycle_start_time;
		this.end_of_delay = this.start_of_delay + Math.max(0, compensated_delay);
		this.start_of_duration = this.end_of_delay;
		this.end_of_duration = this.start_of_duration + this.duration;
	}

}


// --- Circular Dependency Bypass ---
window.KnotClass = Knot;

export class Hyper_Three_Cell extends Knot {
	constructor(parentTrackId = null) {
		super(parentTrackId);
	}
}
window.Hyper_Three_Cell = Hyper_Three_Cell;

export class Wish_Summary_Cell extends Hyper_Three_Cell {
	constructor(parentWishRegId) {
		super(null);
		this.className = "Wish_Summary_Cell";
		this.parentWishRegId = parentWishRegId;
		const tc = typeof d3 === 'function' ? d3(this.TC) : null;
		if (tc) {
			const p = typeof d2 === 'function' ? d2(tc.prompt) : null;
			if (p) p.content = "[Waiting for decomposition root phase...]";
			const r = typeof d2 === 'function' ? d2(tc.response) : null;
			if (r) r.content = "[Waiting for recomposition completion...]";
		}
	}

	getJSONstring() {
		let knotStr = super.getJSONstring();
		let obj = JSON.parse(knotStr);
		obj.className = this.className;
		obj.parentWishRegId = this.parentWishRegId;
		return JSON.stringify(obj);
	}

	yieldElement() {
		const wish = typeof SevenWishArray !== 'undefined' ? SevenWishArray[this.parentWishRegId] : null;
		const tc = typeof d3 === 'function' ? d3(this.TC) : null;

		if (wish && tc) {
			let firstKnot = null;
			if (wish.decomposition !== null && typeof d6 === 'function') {
				const plan = d6(wish.decomposition);
				if (plan && plan.steps.length > 0) {
					const rootChoice = typeof d5 === 'function' ? d5(plan.steps[0]) : null;
					if (rootChoice && rootChoice.branches && rootChoice.branches.length > 0) {
						const firstTrack = typeof d4 === 'function' ? d4(rootChoice.branches[0]) : null;
						if (firstTrack && firstTrack.sequence && firstTrack.sequence.length > 0) {
							firstKnot = typeof k1 === 'function' ? k1(firstTrack.sequence[0]) : null;
						}
					}
				}
			}

			let lastKnot = null;
			if (wish.recomposition !== null && typeof d6 === 'function') {
				const plan = d6(wish.recomposition);
				if (plan && plan.steps.length > 0) {
					const searchLastKnot = (choiceId) => {
						const choice = typeof d5 === 'function' ? d5(choiceId) : null;
						if (!choice || !choice.branches || choice.branches.length === 0) return;
						const track = typeof d4 === 'function' ? d4(choice.branches[0]) : null;
						if (!track) return;
						if (track.sequence && track.sequence.length > 0) {
							const tk = typeof k1 === 'function' ? k1(track.sequence[track.sequence.length - 1]) : null;
							if (tk) lastKnot = tk;
						}
						if (track.terminatingChoice !== null) {
							searchLastKnot(track.terminatingChoice);
						}
					};
					searchLastKnot(plan.steps[0]);
				}
			}

			if (firstKnot && d3(firstKnot.TC)) {
				tc.prompt = d3(firstKnot.TC).prompt;
			}
			if (lastKnot && d3(lastKnot.TC)) {
				tc.response = d3(lastKnot.TC).response;
			}
		}

		return super.yieldElement();
	}
}
window.Wish_Summary_Cell = Wish_Summary_Cell;

// ═══════════════════════════════════════════════════════════════
// Ontology Models (Onto27 Adherence)
// ═══════════════════════════════════════════════════════════════

export class Concept {
	constructor(name) {
		this.id = getNextUID();
		this.name = name;
		ConceptArray.push(this);
		this.RegId = ConceptArray.length - 1;
	}
	getDisplayName(config = {}) { return this.name; }
	toJson() { return this.name; }
}

export class TripletPredicate {
	constructor(name) {
		this.id = getNextUID();
		this.name = name;
		PredicateArray.push(this);
		this.RegId = PredicateArray.length - 1;
	}
	getDisplayName(config = {}) { return this.name; }
	toJson() { return this.name; }
}

export class Event {
	constructor(sourceRegId, predicateRegId, targetRegId) {
		this.id = getNextUID();
		this.triplet = { source: sourceRegId, predicate: predicateRegId, target: targetRegId };
		EventArray.push(this);
		this.RegId = EventArray.length - 1;
	}

	getDisplayName(config = {}) {
		const source = dC(this.triplet.source)?.getDisplayName() || `[C:${this.triplet.source}]`;
		const pred = dP(this.triplet.predicate)?.getDisplayName() || `[P:${this.triplet.predicate}]`;
		const target = dC(this.triplet.target)?.getDisplayName() || `[C:${this.triplet.target}]`;
		return `E: ${source} ${pred} ${target}`;
	}

	toJson(config = {}) {
		return {
			_type: 'Event',
			triplet: {
				source: this.triplet.source,
				predicate: this.triplet.predicate,
				target: this.triplet.target
			}
		};
	}
}

export class Hop {
	constructor(sourceNodeIds, predicate, targetNodeIds, metadata = {}) {
		this.id = getNextUID();
		this.sourceNodeIds = sourceNodeIds || []; // Array of Event RegIds
		this.predicate = predicate; // String or Predicate RegId
		this.targetNodeIds = targetNodeIds || []; // Array of Event RegIds
		this.metadata = metadata; // e.g. { mermaid: "..." }

		HopArray.push(this);
		this.RegId = HopArray.length - 1;
	}

	getDisplayName(config = {}) {
		const getName = (regId) => dE(regId)?.getDisplayName({ isRecursive: true }) || `[E:${regId}]`;
		const sourceNames = (this.sourceNodeIds || []).map(getName).join(' & ');
		const targetNames = (this.targetNodeIds || []).map(getName).join(' & ');
		return `H: (${sourceNames}) -> (${targetNames})`;
	}

	toJson(config = {}) {
		return {
			_type: 'Hop',
			sourceNodeIds: this.sourceNodeIds,
			predicate: this.predicate,
			targetNodeIds: this.targetNodeIds,
			metadata: this.metadata
		};
	}
}

export class Ontology {
	constructor(ontologyName, parents = [], concepts = [], predicates = [], graph = { events: [], hops: [], arguments: [] }) {
		this.id = getNextUID();
		this.ontologyName = ontologyName;
		this.parents = parents; // Array of RegIds
		this.concepts = concepts; // Array of RegIds
		this.predicates = { triplet: predicates }; // Array of RegIds
		this.graph = {
			events: graph.events,
			hops: graph.hops,
			arguments: graph.arguments
		};
	}

	addGraphElement(type, regId) {
		if (this.graph[type]) {
			this.graph[type].push(regId);
		}
	}

	toJson(config = {}) {
		return {
			_type: 'Ontology',
			ontologyName: this.ontologyName,
			parents: this.parents,
			concepts: this.concepts.map(id => dC(id)?.toJson()),
			predicates: { triplet: this.predicates.triplet.map(id => dP(id)?.toJson()) },
			graph: {
				events: this.graph.events.map(id => dE(id)?.toJson()),
				hops: this.graph.hops.map(id => dH(id)?.toJson()),
				arguments: this.graph.arguments.map(id => d6(id)?.toOntoJson())
			}
		};
	}
}
