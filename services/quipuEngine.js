/**
 * @deprecated THIS MODULE IS DEPRECATED AND KEPT FOR REFERENCE ONLY.
 * The active architectural decomposition logic has been moved to services/wdlEngine.js.
 */
import { d2, d3, d4, d5, d6, d7, k1, s1, q1, ActiveKeychain, setGlobalSuccessSignalFlag, KnotArray } from '../core/state.js';
import { Knot_Type, ExecutionStatus, Prompt_engines } from '../core/constants.js';
import { extractCodeBlocks, truncateThinkingTags, extractJsonObject, interpolatePrompt } from '../utils/helpers.js';
import { playCompletionSound } from '../utils/audio.js';
import { buildOllamaRequestData, coreOllamaRequestKTC } from './api.js';
import { renderActiveQuipu } from '../renderers/quipuRenderer.js';
import { ArchNode } from '../models/ArchModels.js';
import { qdlw_addStrand, qdlw_addKnotToStrand, qdlw_wireContext } from './qdlEngine.js';
import { wdl_terminateRowWithChoice, wdl_addBranchWithKnot, wdl_getHTCaddr, processingCallbacks } from './wdlEngine.js';
 
 


/**
 * Renders a full structured code-generation prompt from a decomposition JSON spec.
 * Covers all 11 sections: header, scalars, boundary conditions, subcomponents,
 * internal behaviour, synchronous interactions, emergent properties, failure modes,
 * metrics, assumptions/uncertainty, and output contract.
 * @param {object} jsonObject    - Parsed JSON spec from the decomposition phase.
 * @param {string} targetLanguage - e.g. "JavaScript", "Python", "TypeScript".
 * @returns {string} The fully rendered prompt string.
 */
export function buildCodeGenerationPrompt(jsonObject, targetLanguage) {
	const lines = [];

	// Safe accessor with fallback to empty array
	const arr = (v) => (Array.isArray(v) ? v : []);

	// ────────────────────────
	// 1. PROMPT HEADER
	// ────────────────────────
	lines.push(`Role:\nAct as a junior software engineer tasked with implementing a concrete software component from a formal system specification.\n`);
	lines.push(`Your goal:\nTranslate the structured JSON specification into clean, working, production-quality code.\n`);
	lines.push(`Constraints:\n- Do not invent features outside the JSON boundary_conditions.included.\n- Do not implement anything listed under boundary_conditions.excluded.\n- Use only the declared inputs, outputs, state_variables, and functions.\n- Ensure failure_modes are handled defensively where applicable.\n- Code must be internally consistent and runnable.\n- No explanatory prose outside code.\n- Include minimal comments explaining how each JSON field influenced implementation.\n- Target language: ${targetLanguage}\n`);
	lines.push(`Provide type-safe documentation about function parameters.\n`);
	lines.push(`SPECIFICATION INTERPRETATION WITH VALUES\n`);

	// ────────────────────────
	// 2. SCALAR FIELDS
	// ────────────────────────
	lines.push(`component_name:\nDefines the class or module name.\nVALUE: ${jsonObject.component_name || ''}\n`);
	lines.push(`parent_system:\nDefines contextual naming but must not introduce additional features.\nVALUE: ${jsonObject.parent_system || ''}\n`);
	lines.push(`definition:\nDefines the core responsibility. Implementation must strictly align with this definition.\nVALUE: ${jsonObject.definition || ''}\n`);
	lines.push(`type:\nIndicates whether this is storage or process logic.\nVALUE: ${jsonObject.type || ''}\n`);

	// ────────────────────────
	// 3. BOUNDARY CONDITIONS
	// ────────────────────────
	const bc = jsonObject.boundary_conditions || {};
	lines.push(`boundary_conditions.included:\nThese responsibilities must be implemented.\nVALUE:`);
	arr(bc.included).forEach(item => lines.push(`- ${item}`));
	lines.push(``);

	lines.push(`boundary_conditions.excluded:\nThese features are forbidden and must NOT be implemented.\nVALUE:`);
	arr(bc.excluded).forEach(item => lines.push(`- ${item}`));
	lines.push(``);

	// ────────────────────────
	// 4. SUBCOMPONENTS
	// ────────────────────────
	lines.push(`subcomponents:\nEach implementable subcomponent must map to private fields, helper classes, or structured sections.\n`);
	arr(jsonObject.subcomponents).forEach(comp => {
		lines.push(`Subcomponent:\nName: ${comp.name || ''}\nType: ${comp.type || ''}\nRole: ${comp.role || ''}\nImplementable: ${comp.is_implementable}\n`);
	});

	// ────────────────────────
	// 5. INTERNAL BEHAVIOUR
	// ────────────────────────
	const ib = jsonObject.internal_behaviour || {};

	lines.push(`internal_behaviour.inputs:\nThese define method parameters.\nVALUE:`);
	arr(ib.inputs).forEach(i => lines.push(`- ${i}`));
	lines.push(``);

	lines.push(`internal_behaviour.outputs:\nThese define return values.\nVALUE:`);
	arr(ib.outputs).forEach(o => lines.push(`- ${o}`));
	lines.push(``);

	lines.push(`internal_behaviour.state_variables:\nThese define private member variables.\nVALUE:`);
	arr(ib.state_variables).forEach(s => lines.push(`- ${s}`));
	lines.push(``);

	lines.push(`internal_behaviour.functions:\nThese define public methods.\nVALUE:`);
	arr(ib.functions).forEach(f => lines.push(`- ${f}`));
	lines.push(``);

	lines.push(`internal_behaviour.dependencies:\nThese must influence implementation techniques.\nVALUE:`);
	arr(ib.Dependencies || ib.dependencies).forEach(d => lines.push(`- ${d}`));
	lines.push(``);

	// ────────────────────────
	// 6. SYNCHRONOUS INTERACTIONS
	// ────────────────────────
	lines.push(`synchronous_interactions:\nGuide coordination between internal structures.\n`);
	arr(jsonObject.synchronous_interactions).forEach(si => {
		lines.push(`Participants: ${arr(si.participants).join(', ')}\nType: ${si.interaction_type || ''}\nDescription: ${si.description || ''}\n`);
	});

	// ────────────────────────
	// 7. EMERGENT PROPERTIES
	// ────────────────────────
	lines.push(`emergent_properties:\nThese influence performance decisions only.\nVALUE:`);
	arr(jsonObject.emergent_properties).forEach(ep => lines.push(`- ${ep}`));
	lines.push(``);

	// ────────────────────────
	// 8. FAILURE MODES
	// ────────────────────────
	lines.push(`failure_modes:\nThese must be defensively handled.\nVALUE:`);
	arr(jsonObject.failure_modes).forEach(fm => lines.push(`- ${fm}`));
	lines.push(``);

	// ────────────────────────
	// 9. METRICS
	// ────────────────────────
	const met = jsonObject.metrics || {};
	lines.push(`metrics:\nOptional instrumentation hooks.\n`);
	lines.push(`Measurable Variables:`);
	arr(met.measurable_variables).forEach(mv => lines.push(`- ${mv}`));
	lines.push(`Units:`);
	arr(met.units).forEach(u => lines.push(`- ${u}`));
	lines.push(``);

	// ────────────────────────
	// 10. ASSUMPTIONS & UNCERTAINTY
	// ────────────────────────
	lines.push(`assumptions:\nMay be asserted or validated.\nVALUE:`);
	arr(jsonObject.assumptions).forEach(a => lines.push(`- ${a}`));
	lines.push(``);

	lines.push(`uncertainty_notes:\nDo not speculate beyond these.\nVALUE:`);
	arr(jsonObject.uncertainty_notes).forEach(u => lines.push(`- ${u}`));
	lines.push(``);

	// ────────────────────────
	// 11. FINAL OUTPUT INSTRUCTION
	// ────────────────────────
	lines.push(`────────────────────────\nOUTPUT CONTRACT\n\nReturn only valid ${targetLanguage} code.\nNo markdown.\nNo explanation outside code.\nInclude concise inline comments referencing JSON field names where relevant.`);

	return lines.join('\n');
}

/**
 * Builds the initial prompt for decomposing a subsystem by injecting the component data into the SENSIBLE_DECOMPOSITION template.
 * @param {object} component             - the child component JSON definition
 * @param {string} parentSystemName      - name of the parent resolving this component
 * @param {string} boundaries_of_system  - restrictions/boundaries from the parent context
 * @returns {string} The fully formed decomposition prompt
 */
export function buildDecompositionPrompt(component, parentSystemName, boundaries_of_system) {
	const compName = component.name || component.component_name || `Component`;
	const compRole = component.role || "";

	const templateEntry = Prompt_engines.find(e => e.name === "SENSIBLE_DECOMPOSITION_PROMPT_TEMPLATE");
	if (!templateEntry) {
		console.error("[buildDecompositionPrompt] SENSIBLE_DECOMPOSITION_PROMPT_TEMPLATE not found in Prompt_engines!");
		return `Decompose ${compName} within ${parentSystemName}.`;
	}
	return templateEntry.string
		.replace(/\{\{COMPONENT_NAME\}\}/g, compName)
		.replace(/\{\{COMPONENT_ROLE\}\}/g, compRole)
		.replace(/\{\{PARENT_BOUNDARY\}\}/g, boundaries_of_system || "implicit bounds")
		.replace(/\{\{PARENT_SYSTEM\}\}/g, parentSystemName);
}


/**
 * Renders a full structured system architect prompt from a decomposition JSON spec.
 * Used for Phase 2 parent nodes that must orchestrate their children.
 * @param {object} jsonObject    - Parsed JSON spec of the parent system. 
 * @param {string} targetLanguage - e.g. "JavaScript", "Python", "TypeScript".
 * @returns {string} The fully rendered prompt string.
 */
export function buildSystemArchitectPrompt(jsonObject, targetLanguage) {
	const lines = [];
	console.log(`in buildSystemArchitectPrompt ${typeof jsonObject}`);
	const arr = (v) => (Array.isArray(v) ? v : []);

	lines.push(`Role:\nAct as a senior software architect responsible for integrating multiple implemented components into a unified, production-grade system.\n`);
	lines.push(`Your objective:\nPlan the best way to amalgamate the provided child component implementations into a single coherent system that strictly conforms to the parent system JSON specification.\n\nYou are not rewriting the child components.\nYou are architecting their composition.\n`);

	lines.push(`Constraints:\n\nDo not modify the functional intent of child components.\n\nDo not introduce features not declared in the parent system JSON.\n\nAll integration logic must derive from declared interfaces, dependencies, and system-level behavior.\n\nRespect all boundary_conditions of the parent system.\n\nRespect all boundary_conditions of each child.\n\nEnsure failure_modes at the system level are defensively handled.\n\nProduce internally consistent, runnable code.\n\nNo explanatory prose outside code.\n\nInclude minimal inline comments referencing which JSON field drove each architectural decision.\n\nTarget language: ${targetLanguage}\n`);

	lines.push(`────────────────────────\nSYSTEM-LEVEL ARCHITECTURAL INTERPRETATION RULES\n\nYou must interpret the parent system JSON as the authoritative integration contract.\n\nThe following explains how each parent JSON field influences system construction:\n`);

	lines.push(`component_name:\nDefines the name of the unified system class or module.\nVALUE: ${jsonObject.component_name || ''}\n`);
	lines.push(`definition:\nDefines the overall responsibility of the integrated system.\nAll integration logic must align strictly with this.\nVALUE: ${jsonObject.definition || ''}\n`);
	if (jsonObject.boundary_conditions) {
		const bc = jsonObject.boundary_conditions || {};
		lines.push(`boundary_conditions.included:\nDefines required system-level capabilities.\nIntegration must expose these.\nVALUE:`);
		arr(bc.included).forEach(item => lines.push(`- ${item}`));
		lines.push(``);

		lines.push(`boundary_conditions.excluded:\nDefines prohibited system behaviors.\nThese must not emerge accidentally through composition.\nVALUE:`);
		arr(bc.excluded).forEach(item => lines.push(`- ${item}`));
		lines.push(``);
	}
	lines.push(`subcomponents:\nEach listed subcomponent must correspond directly to one provided child implementation.\nThey must be instantiated, composed, or orchestrated.\n`);

	arr(jsonObject.subcomponents).forEach(comp => {
		lines.push(`Subcomponent:\nName: ${comp.name || ''}\nType: ${comp.type || ''}\nRole: ${comp.role || ''}\nImplementable: ${comp.is_implementable}\n 
			Code: {{CODE_SNIPPET}}
			` );
	});

	const ib = jsonObject.internal_behaviour || {};
	lines.push(`internal_behaviour.inputs:\nDefine the public interface of the parent system.\nVALUE:`);
	arr(ib.inputs).forEach(i => lines.push(`- ${i}`));
	lines.push(``);

	lines.push(`internal_behaviour.outputs:\nDefine the system return values or external emissions.\nVALUE:`);
	arr(ib.outputs).forEach(o => lines.push(`- ${o}`));
	lines.push(``);

	lines.push(`internal_behaviour.state_variables:\nDefine system-level coordination state only.\nDo not duplicate child internal state.\nVALUE:`);
	arr(ib.state_variables).forEach(s => lines.push(`- ${s}`));
	lines.push(``);

	lines.push(`internal_behaviour.functions:\nDefine system-level orchestration methods.\nThese coordinate children.\nVALUE:`);
	arr(ib.functions).forEach(f => lines.push(`- ${f}`));
	lines.push(``);

	lines.push(`internal_behaviour.dependencies:\nMust guide dependency injection, composition strategy, and coupling constraints.\nVALUE:`);
	arr(ib.Dependencies || ib.dependencies).forEach(d => lines.push(`- ${d}`));
	lines.push(``);

	lines.push(`synchronous_interactions:\nDefine how child components must coordinate at runtime.\nThese interactions must be explicitly implemented in orchestration logic.\n`);
	arr(jsonObject.synchronous_interactions).forEach(si => {
		lines.push(`Participants: ${arr(si.participants).join(', ')}\nType: ${si.interaction_type || ''}\nDescription: ${si.description || ''}\n`);
	});

	lines.push(`emergent_properties:\nInfluence architectural decisions such as caching, performance ordering, and encapsulation strategy.\nDo not introduce new behavior.\nVALUE:`);
	arr(jsonObject.emergent_properties).forEach(ep => lines.push(`- ${ep}`));
	lines.push(``);

	lines.push(`failure_modes:\nMust be handled at integration level when cross-component interactions create new risks.\nVALUE:`);
	arr(jsonObject.failure_modes).forEach(fm => lines.push(`- ${fm}`));
	lines.push(``);

	const met = jsonObject.metrics || {};
	lines.push(`metrics:\nOptional instrumentation may be added at system boundary level only.\n`);
	lines.push(`Measurable Variables:`);
	arr(met.measurable_variables).forEach(mv => lines.push(`- ${mv}`));
	lines.push(`Units:`);
	arr(met.units).forEach(u => lines.push(`- ${u}`));
	lines.push(``);

	lines.push(`assumptions:\nMay be validated at system initialization.\nVALUE:`);
	arr(jsonObject.assumptions).forEach(a => lines.push(`- ${a}`));
	lines.push(``);

	lines.push(`uncertainty_notes:\nDo not speculate beyond these.\nVALUE:`);
	arr(jsonObject.uncertainty_notes).forEach(u => lines.push(`- ${u}`));
	lines.push(``);

	lines.push(`───────────\nThe child implementations are appended below via <Component> xml tags:\n`);

	// The children implementations will be dynamically appended here by the Quipu engine via concat_child_code callback.
	return lines.join('\n');
}

/**
 * Renders a full structured system synthesizer prompt from a decomposition JSON spec.
 * Used for Phase 2 parent nodes that must synthesize the actual code of their children.
 * @param {object} jsonObject    - Parsed JSON spec of the parent system. 
 * @param {string} targetLanguage - e.g. "JavaScript", "Python", "TypeScript".
 * @returns {string} The fully rendered prompt string.
 */
export function buildSystemSynthesizerPrompt(jsonObject, targetLanguage) {
	const lines = [];
	const arr = (v) => (Array.isArray(v) ? v : []);

	lines.push(`Role:\nAct as a senior software developer responsible for integrating multiple implemented components into a unified, production-grade system.\n`);
	lines.push(`Your objective:\nWrite the complete, combined source code that amalgamates the provided child component implementations into a single coherent system that strictly conforms to the parent system JSON specification.\n\nYou are not rewriting the child components. You are integrating them into the final file structure.\n`);

	lines.push(`Constraints:\n\nDo not modify the functional intent of child components.\n\nDo not introduce features not declared in the parent system JSON.\n\nRespect all boundary_conditions of the parent system.\n\nRespect all boundary_conditions of each child.\n\nEnsure failure_modes at the system level are defensively handled.\n\nProduce internally consistent, runnable code.\n\nOutput the final, combined code as a single implementation block. No explanatory prose outside code.\n\nTarget language: ${targetLanguage}\n`);

	lines.push(`────────────────────────\nSYSTEM-LEVEL ARCHITECTURAL INTERPRETATION RULES\n`);

	lines.push(`component_name:\nDefines the name of the unified system class or module.\nVALUE: ${jsonObject.component_name || ''}\n`);
	lines.push(`definition:\n${jsonObject.definition || ''}\n`);
	if (jsonObject.boundary_conditions) {
		const bc = jsonObject.boundary_conditions || {};
		lines.push(`boundary_conditions.included:\nVALUE:`);
		arr(bc.included).forEach(item => lines.push(`- ${item}`));
	}
	lines.push(`subcomponents:\nEach listed subcomponent must correspond directly to one provided child implementation.\n`);
	arr(jsonObject.subcomponents).forEach(comp => {
		lines.push(`Subcomponent: Name: ${comp.name || ''}, Role: ${comp.role || ''}, Implementable: ${comp.is_implementable}`);
	});

	const ib = jsonObject.internal_behaviour || {};
	lines.push(`internal_behaviour.inputs:\nVALUE:`);
	arr(ib.inputs).forEach(i => lines.push(`- ${i}`));
	lines.push(`internal_behaviour.outputs:\nVALUE:`);
	arr(ib.outputs).forEach(o => lines.push(`- ${o}`));
	lines.push(`internal_behaviour.functions:\nVALUE:`);
	arr(ib.functions).forEach(f => lines.push(`- ${f}`));
	lines.push(`internal_behaviour.dependencies:\nVALUE:`);
	arr(ib.Dependencies || ib.dependencies).forEach(d => lines.push(`- ${d}`));

	lines.push(`synchronous_interactions:\n`);
	arr(jsonObject.synchronous_interactions).forEach(si => {
		lines.push(`Participants: ${arr(si.participants).join(', ')}\nType: ${si.interaction_type || ''}\nDescription: ${si.description || ''}\n`);
	});

	lines.push(`───────────\nThe architect's comments and the child implementations are appended below via <Component> xml tags:\n`);
	return lines.join('\n');
}



/**
 * Reads a Knot's configuration and prepares a complete, ready-to-send ChatRequest object.
 * @param {number} knotRegId - The RegId of the Knot to prepare.
 * @returns {Promise<object|null>} A promise that resolves to the request data or null on failure.
 */
export async function Quipucamayoc_prepareKnotForExecution(knotRegId, quipuRegId) {
	const knot = k1(knotRegId);
	if (!knot) {
		console.error(`Quipucamayoc failed: Knot with RegId ${knotRegId} not found.`);
		return null;
	}

	const quipu = q1(quipuRegId);//window.ActiveQuipu;
	if (!quipu) {
		console.error("Quipucamayoc failed: No ActiveQuipu found.");
		return null;
	}

	let messages = [];
	const knotType = knot.knotType;

	// Retrieve model and its specific context window
	const modelId = d3(knot.TC).model || 'lglm-5';
	let num_ctx = 4096; // fallback default

	// Fall back to slider ONLY if modeloptions is somehow missing or model isn't in it
	if (typeof modeloptions !== 'undefined' && modeloptions[modelId]) {
		// Prefer the exact ctx_num if parsed, otherwise fallback to hardmaxctx, otherwise 4096
		num_ctx = parseInt(modeloptions[modelId].ctx_num) || parseInt(modeloptions[modelId].hardmaxctx) || 4096;
	} else {
		const slider = document.getElementById('numCtxSlider');
		if (slider) num_ctx = parseInt(slider.value, 10);
	}

	let aggregated_tokens = 0;



	// 1. Resolve Context History (Rebuilt Logic) 
	let contextKnotIds = [];
	// If type is OWN_STRAND_HISTORY, build the context from its own strand predecessors
	if (knotType.includes('OWN_STRAND_HISTORY')) {
		const parentStrand = s1(knot.parentStrandId);
		if (parentStrand) {
			for (let i = 0; i < knot.strandIndex; i++) {
				contextKnotIds.push(parentStrand.knots[i]);
			}
		}
	} else if (knotType.includes('OTHER_KNOT_HISTORY')) {
		//1.1 If type is OTHER_KNOT_HISTORY, use the user-specified list
		for (const address of knot.sourceContextKnotIds) {
			const resolvedId = resolveKnotAddress(address, knot.RegId, quipu.RegId);
			if (resolvedId !== null) {
				contextKnotIds.push(resolvedId);
			} else {
				console.warn(`Could not resolve context knot address: "${address}" for Knot ${knot.RegId}. Skipping.`);
			}
		}
	}

	//1.2 Now, build the messages array from the collected knot IDs
	// Iterate backwards to keep the most recent context, dropping the earliest if we hit the limit
	const safe_ctx_limit = Math.max(0, num_ctx - 1000); // 1000 token safety buffer for prompt & response
	let keptHistoryKnots = [];

	for (let i = contextKnotIds.length - 1; i >= 0; i--) {
		const historyKnotRegId = contextKnotIds[i];
		if (historyKnotRegId >= KnotArray.length) {
			console.warn(`Invalid context Knot RegId ${historyKnotRegId} is out of bounds. Halting context build.`);
			continue; // Just skip invalid and keep trying others
		}
		const historyKnot = k1(historyKnotRegId);
		if (!historyKnot) continue;

		const knot_total_tokens = historyKnot.prompt_tokens + historyKnot.response_tokens;

		if ((aggregated_tokens + knot_total_tokens) >= safe_ctx_limit) {
			console.warn(`Context safety limit reached at ${aggregated_tokens} tokens. Dropping earlier knots.`);
			break;
		}
		aggregated_tokens += knot_total_tokens;
		// Unshift to maintain chronological order in the final array
		keptHistoryKnots.unshift(historyKnot);
	}

	for (const historyKnot of keptHistoryKnots) {
		const prompt = d2(d3(historyKnot.TC).prompt);
		const response = d2(d3(historyKnot.TC).response);

		if (prompt && prompt.content && prompt.content.trim() !== "") {
			messages.push({ role: prompt.role, content: prompt.content });
		}

		if (response && response.content && response.content.trim() !== "") {
			let finalContextSegment = response.content;
			if (historyKnot.contextCallbackId && historyKnot.contextCallbackId !== "none" && processingCallbacks[historyKnot.contextCallbackId]) {
				try {
					finalContextSegment = processingCallbacks[historyKnot.contextCallbackId](response.content, {}, { knot: knotRegId, quipu: quipuRegId });
				} catch (e) { }
			}
			messages.push({ role: response.role, content: finalContextSegment });
		}
	}



	// 2. Resolve Prompt Content

	const ownPromptCell = d2(d3(knot.TC).prompt);
	let templateString = ownPromptCell.content;
	let finalPromptContent = "";
	let sourceContent = {};
	if (knotType.startsWith('USER_PROMPT')) {
		finalPromptContent = ownPromptCell.content;
		if (knot.requestCallbackId && knot.requestCallbackId !== "none" && processingCallbacks[knot.requestCallbackId]) {
			try {
				finalPromptContent = processingCallbacks[knot.requestCallbackId](templateString, {}, { knot: knotRegId, quipu: quipuRegId });
			} catch (e) {
			}
		}

	} else if (knotType.includes('SOURCE_KNOT') || knotType.includes('MULTI_KNOT')) {
		finalPromptContent = ownPromptCell.content;
		for (let i = 0; i < knot.sourcePromptKnotIds.length; i++) {
			const sourceKnotAddress = knot.sourcePromptKnotIds[i];
			const sourceKnotId = resolveKnotAddress(sourceKnotAddress, knot.RegId, quipu.RegId);

			if (sourceKnotId !== null) {
				const sourceKnot = k1(sourceKnotId);
				const sourceResponse = d2(d3(sourceKnot.TC).response);
				if (s1(sourceKnot.parentStrandId).workbitmap[sourceKnot.strandIndex]) {
					if (knot.requestCallbackId && knot.requestCallbackId !== "none" && processingCallbacks[knot.requestCallbackId]) {
						try {
							templateString = applyResponseCallback(templateString, sourceResponse.content, { knot: knotRegId, quipu: quipuRegId, sourceKnotAddress }, knot.requestCallbackId);

						} catch (e) { // not a json string, let's gracefully fall back to string-to-string callback
							if (typeof processingCallbacks[knot.requestCallbackId] === 'function') {
								templateString = processingCallbacks[knot.requestCallbackId](templateString, sourceResponse.content, { knot: knotRegId, quipu: quipuRegId, sourceKnotAddress });
							} else {
								templateString += "\n\n" + sourceResponse.content;
							}
						}
					} else {
						templateString += "\n\n" + sourceResponse.content;
					}
				} else {
					console.error(`Dependency not met: Source Knot ${sourceKnotAddress} has not been executed.`);
					return null;
				}
			} else {
				console.error(`Could not resolve prompt source address: "${sourceKnotAddress}"`);
				return null; // Hard failure if prompt dependency is missing
			}
		}
		finalPromptContent = templateString;
	}
	//knot processingcallback 


	knot._debug_finalPrompt = finalPromptContent;
	const finalMessages = [...messages, { role: 'user', content: finalPromptContent }];

	knot._debug_contextMessages = JSON.stringify(finalMessages);
	renderActiveQuipu();


	// 3. Assemble Final Request Data
	const model = d3(knot.TC).model;
	const requestData = buildOllamaRequestData(model, finalMessages, false, {}, knot.forceJsonOutput);

	return {
		requestData: requestData,
		targetThreeCellId: knot.TC
	};
}




/**
 * The main dispatcher for executing a Quipu.
 * It reads the Quipu's chosen strategy and calls the appropriate execution function.
 * @param {number} quipuRegId - The RegId of the Quipu to execute.
 */
export async function Quechuy_executeQuipu(quipuRegId) {
	const quipu = q1(quipuRegId);
	if (!quipu) {
		console.error(`Quechuy failed: Quipu with RegId ${quipuRegId} not found.`);
		return;
	}

	console.log(`--- Starting Execution of Quipu: ${quipu.name} with Strategy: ${quipu.executionStrategy} ---`);
	const statusDivLocal = document.getElementById('status');
	if (statusDivLocal) statusDivLocal.textContent = `Executing Quipu: ${quipu.name}...`;
	document.querySelectorAll('.quipu-controls button, .quipu-controls select').forEach(b => b.disabled = true);

	// Reset workbitmaps and UI for a fresh run
	quipu.strands.forEach(sInfo => {
		const strand = s1(sInfo.strandRegId);
		strand.workbitmap.fill(false);
		strand.knots.forEach(kRegId => {
			const knotUI = document.getElementById(k1(kRegId).id);
			if (knotUI) knotUI.style.backgroundColor = 'transparent';
		});
	});

	let success = false;
	if (quipu.executionStrategy === 'DEPENDENCY_AWARE') {
		success = await executeWithDependencies(quipuRegId);
	} else if (quipu.executionStrategy === 'MODEL_AFFINITY') {
		success = await Quechuy_executeWithModelAffinity(quipuRegId);
	} else if (quipu.executionStrategy === 'TEMPORAL_PARALLEL') {
		// --- CORRECTED INSTANTIATION ---
		// We create the bridge which IS the engine
		const bridge = new QuipuTemporalEngine(quipuRegId);

		// We await its start() method which returns a Promise that resolves when the whole graph is done
		success = await bridge.start();
	} else {
		success = await executeSequentially(quipuRegId);
	}

	if (success) {
		setGlobalSuccessSignalFlag(true);
		playCompletionSound('success');
		statusDiv.textContent = `Quipu execution finished successfully.`;
		console.log(`--- Finished Execution of Quipu: ${quipu.name} ---`);
	} else {
		playCompletionSound('failure');
		statusDiv.textContent = `Quipu execution failed or was halted.`;
		console.log(`--- Halted Execution of Quipu: ${quipu.name} ---`);
	}

	document.querySelectorAll('.quipu-controls button, .quipu-controls select').forEach(b => b.disabled = false);

	// Final full UI refresh after any execution strategy completes
	if (typeof window.GlobalUIRefresh === 'function') {
		window.GlobalUIRefresh();
	}
}



/**
 * Checks if a given knot has all its declared prompt and context dependencies met.
 * It returns true if the knot is ready to run, false if it is waiting on other knots.
 * @param {number} knotRegId - The ID of the Knot.
 * @param {number} quipuRegId - The ID of its parent Quipu.
 * @returns {boolean} True if all dependencies are satisfied.
 */
export function areDependenciesMet(knotRegId, quipuRegId) {
	//Note: the purpose here is to create a single flat list of all the addresses
	//this knot depends on the '...' is the spread syntax, which elegantly merges
	//the two source arrays (one for prompt and one for context) into one master list. 
	//this approach correctly treats all dependencies - whether for prompt data or historical context
	//as equally important prerequisites for execution. 	
	const knot = k1(knotRegId);
	const allSourceIds = [...knot.sourcePromptKnotIds, ...knot.sourceContextKnotIds];
	//Note: this loop iterates through every address string (e.g. "@prev", "0,1,0") 
	// that the current knot has listed as a dependency in its configuration. 
	for (const address of allSourceIds) {
		//Note: for each address string, we call our resolver function. This is a crucial step
		//that translates the user friendly string into a concrete, numerical regId. 
		//that points to the specific knot in our system. This abstracts the 
		//complexity of parsing different address formats. 
		const resolvedId = resolveKnotAddress(address, knotRegId, quipuRegId);
		//Note: it is possible an address is invalid (e.g: a type) or points nowhere. 
		//where only proceed to check the status if the resolver successfully found a real knot. 
		//an unresolvable address does not block execution; its treated as an ignored dependency. 
		if (resolvedId !== null) {
			//Note: we get the actual knot object using its resolved RegId.	
			const sourceKnot = k1(resolvedId);
			//Note: From the source knot, we find its parent strand object. 
			//The strand is what holds the state information, our single source of truth for all its child knots. 
			const sourceStrand = s1(sourceKnot.parentStrandId);
			//Note: this is the most critical check. The 'workbitmap' is an array of booleans. 
			//on the strand that tracks the execution status of its knots, we use the 
			//source knot's own index (strandIndex)to look up its status in the bitmap. 
			if (!sourceStrand.workbitmap[sourceKnot.strandIndex]) {
				//note: if the bitmap at that position is false it means this dependency has NOT been met. 
				//This is a short-circuit evaluation; the moment we find a single unmet dependency we know
				//the knot cannot run. there's no ppoint in checking the others, 
				//so we immediately exit and report that this not is not ready. 
				return false;
			}
		}
	}
	//Note: if the loop completes without ever returning false it signifies that every single dependency was checked and found to be true in its respective workbitmap. This knot's inputs are all available, and it is now confirmed to be in a runnable state for the current execution pass. 
	return true;
}

/**
 * Executes a Quipu utilizing a "model affinity" strategy to batch API calls.
 * Knots sharing the same chosen Ollama model are fired during the same execution loop,
 * minimizing model thrashing on the server.
 * @param {number} quipu - The ID of the Quipu to execute.
 * @returns {Promise<boolean>} Resolves false on total failure/abort.
 */
export async function Quechuy_executeWithModelAffinity(quipu) {
	//Note: first we get a flat list of all knot objects in the entire quipu. This simplifies the logic significantly by allowing us to iterate over a single collection rather than dealing with nested loops through strands and knots repeatedly. 
	const allKnots = q1(quipu).strands.flatMap(sInfo => s1(sInfo.strandRegId).knots.map(kId => k1(kId)));
	//Note: This variable will track our progress. When it reaches zero, the execution is complete. 
	let remainingKnots = allKnots.length;
	//Note: This is a crucial safety measure. to prevent an infinite loop in case of a logic error or an impossible dependency graph (e.g: a circular reference created by the user) we cap the number of passes the executor can make. If it runs more times than there are knots, it implies a deadlock and execution must b e halted
	let safetyCounter = 0;
	//Note: This is the main execution loop. its functions as a pass-based scheduler. In each pass, it attempts to execute as many knots as possible. It will continue to run as long as there are knots left to proces and we havent hit our safety limit. 
	const aklsq = allKnots.length * allKnots.length;
	while ((remainingKnots > 0) && (safetyCounter < (aklsq))) {
		if (!window.isExecutingQuipu) {
			console.log("Execution halted by user in Quechuy_executeWithModelAffinity.");
			return false;
		}
		//this section is the brain of the scheduler. 
		//Note: In each pass, we first find all knots that have not yet been completed by checking their 'workbitmap' status. This gives us the pool of all pending tasks. 

		//XXX is pendingKNots holding RegId or [Object objects]? should be regid
		const pendingKnots = allKnots.filter(k => !s1(k.parentStrandId).workbitmap[k.strandIndex]);
		//Note: From the list of pending knots, we filter it down further to find only those whose dependencies have been met by calling our helper function. This second filter identifies the "execution frontier" the exact set of all knots that are valid to run *right now*. 
		const readyKnots = pendingKnots.filter(k => areDependenciesMet(k, quipu));
		//Note: this is a critical error check. If there are still knots pending but none of them are ready to be executed it means we have a logical deadlock. This is most likely caused by a circular dependecy in the user's design (e.g., Knot A depends on B, and Knot B depends on A) . 
		//We must stop execution to prevent an infinite loop. 
		if (readyKnots.length === 0) {
			throw new Error("execution stalled: no knots are ready to run. check for circular dependcies.");
		}

		//this section handles the model affinity grouping. 
		//Note: this is the core of the 'model affinity' strategy. we use the reduce method to transform the flat list of readyKnots into an object where keys are model names, and values are arrays of knot objects that use the model. 
		//this is an efficient way to implement a group by pattern. 
		const modelGroups = readyKnots.reduce((acc, knot) => {
			const model = d3(k1(knot).TC).model;
			//get the model name from the knot's three_cell. 
			if (!acc[model]) acc[model] = [];
			// if we haven't seen this model before, create an empty array for it 
			acc[model].push(knot);//add the current knot to its model's group.
			return acc;//return the accumulator for the next iteration.
		}, {});
		// this section executes the batches. 

		//note: this will track how many knots we successfully execute in this pass of the while loop. 
		let executedInPass = 0;
		//Note: we now loop through the 'modelGroups' object (e.g.: for "model A" , then "model B").
		//this allows us to process all ready knots for one model before moving to the next. 
		for (const model in modelGroups) {
			//Note: we can now execute all knots in this batch. white this implementation processes them sequentially with 'await' the data structure is perfectly suited for future parallelization. one could replace this loop with 'promise.all' to send all requests for this batch to the API concurrently, significantly speeding up execution. 
			for (const kn0t of batch) {
				//Note: Update the UI to show this knot is being woked on. 
				const kn1t = k1(kn0t);
				const knotUI = document.getElemenetById(kn1t.id);
				if (knotUI) knotUI.style.backgroundColor = 'rgba(255, 229,100,0.5)';//yelw
				//note: call the quipucamayoc to prepare the final prompt and context for this specific knot. 
				const preparedRequest = await Quipucamayoc_prepareKnotForExecution(kn0t, quipu);
				//Note: error handling in case the preparation fails (e.g.: a d dependency was somewhow missed)
				if (!preparedRequest) {
					if (knotUI) knotUI.style.backgroundColor = 'rgba(255, 107, 107, 0.5)';//red 
					throw new Error(`Preparation failed for Knot ${kn0t}`);
				}
				//Note: the actual call to the Ollama API via our core service function. 
				await coreOllamaRequestTC(preparedRequest.targetThreeCellId, true);
				//Note: CRITICAL STATE UPDATE. we mark this knot as 'true' completed in its strand's workbitmap. 
				//this state change is what advances the entire dependcy graph, as it will allow other knots that depend on this one to become 'ready' in the next pass of the 'while loop. 
				s1(kn1t.parentStrandId).workbitmap[kn1t.strandIndex] = true;
				//Note: update UI here to show knot is finished successfully
				if (knotUI) knotUI.style.backgroundColor = 'rgba(139, 233, 139, 0.5)';//green
				renderActiveQuipu(); //beating hedonic adaptation, means looking for the yellow, not the green. 
				executedInPass++;
			}
		}
		//note: update the main loop's counter to reflect the progress made in this pass. 
		remainingKNots -= executedInPass;
		//Note: increment the safety counter for each completed pass; 
		safetyCounter++;
	}
	//Note: Final check after the loop has finished. If there are still knots 
	//remaining, it means the safety counter was triggered, and we failed to complete. 
	//this indicates a fundamental flaw in the dependency graph that the deadlock check missed. 
	if (remainingKnots > 0) {
		throw new Error("execution failed to complete. some knots were knot processed.");
	}
}


/**
 * Executes the Quipu in a simple, top-to-bottom, left-to-right "waterfall" order.
 * @param {Quipu} quipu - The Quipu object to execute.
 * @returns {Promise<boolean>} True if successful, false if failed.
 */
export async function executeSequentially(quipuRegId) {
	const quipu = q1(quipuRegId);
	if (!quipu) { return false; }
	for (const strandInfo of quipu.strands) {
		const strand = s1(strandInfo.strandRegId);
		for (const knotRegId of strand.knots) {
			if (!window.isExecutingQuipu) {
				console.log("Execution halted by user in executeSequentially.");
				return false;
			}
			const success = await executeSingleKnot(knotRegId, strand.RegId, quipuRegId);
			renderActiveQuipu();
			if (!success) return false; // Halt on failure

		}
	}
	return true;
}

/**
 * Executes the Quipu by resolving a dependency graph.
 * @param {Quipu} quipu - The Quipu object to execute.
 * @returns {Promise<boolean>} True if successful, false if failed.
 */
export async function executeWithDependencies(quipuRegId) {
	const quipu = q1(quipuRegId);
	if (!quipu) { return false; }

	const allKnots = quipu.strands.flatMap(sInfo => s1(sInfo.strandRegId).knots);

	// Map to hold ArchNodes for dependency tracking
	const nodeMap = new Map();

	// Pass 1: Create an ArchNode for each knot
	for (const knotRegId of allKnots) {
		const knot = k1(knotRegId);
		const node = new ArchNode(knotRegId, `Knot ${knotRegId}`);
		nodeMap.set(knotRegId, node);
	}

	// Pass 2: Connect dependencies
	for (const knotRegId of allKnots) {
		const knot = k1(knotRegId);
		const currentNode = nodeMap.get(knotRegId);

		const dependencies = [...knot.sourcePromptKnotIds, ...knot.sourceContextKnotIds];
		for (const depAddress of dependencies) {
			if (!depAddress) continue;
			const depKnotId = resolveKnotAddress(depAddress, knot.RegId, quipuRegId);
			if (depKnotId !== null && nodeMap.has(depKnotId)) {
				const depNode = nodeMap.get(depKnotId);
				currentNode.addDependency(depNode);
			}
		}
	}

	// Pass 3: Topological sort (Bottom-Up: Leaves first, Root last)
	const adjList = new Map();
	const inDegree = new Map();

	for (const [id, node] of nodeMap.entries()) {
		adjList.set(id, []);
		inDegree.set(id, 0); // Tracking in-degree for BOTTOM-UP sort (Child -> Parent)
	}

	for (const [id, node] of nodeMap.entries()) {
		const kn = node.knowledgeNode || node;
		for (const depNode of kn.dependencies) {
			// Invert edges: depNode -> currentNode
			adjList.get(depNode.id).push(node.id);
			inDegree.set(node.id, inDegree.get(node.id) + 1);
		}
	}

	const queue = [];
	for (const [id, degree] of inDegree.entries()) {
		if (degree === 0) {
			queue.push(id);
		}
	}

	const sortedKnotIds = [];
	while (queue.length > 0) {
		const currentId = queue.shift();
		sortedKnotIds.push(currentId);

		const neighbors = adjList.get(currentId) || [];
		for (const neighbor of neighbors) {
			const currentInDegree = inDegree.get(neighbor) - 1;
			inDegree.set(neighbor, currentInDegree);
			if (currentInDegree === 0) {
				queue.push(neighbor);
			}
		}
	}

	if (sortedKnotIds.length !== allKnots.length) {
		console.error("Execution halted: Circular dependency detected (Topological sort failed).");
		if (typeof statusDiv !== 'undefined') statusDiv.textContent = "Error: Circular dependency detected!";
		return false;
	}

	// Pass 4: Execute in order
	for (const knotRegId of sortedKnotIds) {
		if (!window.isExecutingQuipu) {
			console.log("Execution halted by user in executeWithDependencies.");
			return false;
		}

		const knot = k1(knotRegId);
		const strand = s1(knot.parentStrandId);

		if (strand.workbitmap[knot.strandIndex]) {
			continue; // Already done
		}

		const success = await executeSingleKnot(knotRegId, strand.RegId, quipuRegId);
		if (!success) return false; // Halt on failure
	}

	return true;
}

/**
 * A helper function to prepare and execute a single Knot.
 * @param {number} knotRegId - The ID of the knot to execute.
 * @param {Strand} strand - The parent strand of the knot.
 * @returns {Promise<boolean>} True if execution was successful.
 */
export async function executeSingleKnot(knotRegId, strandRegId, quipuRegId) {
	const strand = s1(strandRegId);
	const knot = k1(knotRegId);
	const knotUI = document.getElementById(knot.id);

	if (knot.executionStatus === ExecutionStatus.WORKING) {
		console.log(`[executeSingleKnot] Knot ${knotRegId} is already WORKING. Aborting previous execution.`);
		if (knot.abortController) {
			knot.abortController.abort();
		}
	}
	knot.abortController = new AbortController();

	// Update UI and status
	knot.executionStatus = ExecutionStatus.WORKING;
	renderActiveQuipu();

	// Call the weaver to prepare the request
	try {
		const preparedRequest = await Quipucamayoc_prepareKnotForExecution(knotRegId, quipuRegId);

		if (!preparedRequest) {
			knot.executionStatus = ExecutionStatus.FAILED;
			if (typeof renderActiveQuipu === 'function') renderActiveQuipu();
			console.error(`quipucamayoc failed for knot ${knot.RegId}`);
			return false;
			//SHOULD KNOT contain its special ADDRESS as a string z,z,z  
		}

		const fullResponse = await coreOllamaRequestKTC(preparedRequest.targetThreeCellId, preparedRequest.requestData, knot.abortController.signal);

		knot.prompt_tokens = fullResponse.prompt_tokens || 0;
		knot.response_tokens = fullResponse.response_tokens || 0;

		knot._debug_rawResponse = fullResponse.content;

		let finalContent = applyResponseCallback(fullResponse.content, fullResponse.content, { knot: knotRegId, quipu: quipuRegId }, knot.responseCallbackId);
		d2(d3(knot.TC).response).content = finalContent;

		strand.workbitmap[knot.strandIndex] = true;
		knot.executionStatus = ExecutionStatus.DONE;

		if (typeof window.GlobalUIRefresh === 'function') {
			window.GlobalUIRefresh();
		}

		return true;
	} catch (e) {
		if (e.name === 'AbortError') {
			console.log(`[executeSingleKnot] Execution aborted for knot ${knot.RegId}`);
			knot.executionStatus = ExecutionStatus.FAILED;
		} else {
			console.error(`executeSingleKnot failed for knot ${knot.RegId}:`, e);
			knot.executionStatus = ExecutionStatus.FAILED;
		}
		if (typeof renderActiveQuipu === 'function') renderActiveQuipu();
		return false;
	}
}


/**
 * Resolves a string address (e.g., "[0,1]", "@prev") to a Knot RegId.
 * @param {string} address - The address string to resolve.
 * @param {Knot} currentKnot - The knot from which the reference is being made.
 * @param {Quipu} quipu - The active Quipu object.
 * @returns {number|null} The RegId of the resolved Knot, or null if not found.
 */
export function resolveKnotAddress(addressToken, currot, currentQuipu) {
	const currentKnot = k1(currot);

	if (!addressToken) {
		return null;
	}
	const keychain = window.ActiveKeychain;
	if (!keychain) {
		console.error("resolveKnotAddress failed");
		return null;
	}
	if (addressToken === '@prev') {
		const parentStrand = s1(currentKnot.parentStrandId);
		if (parentStrand && currentKnot.strandIndex > 0) {
			return parentStrand.knots[currentKnot.strandIndex - 1];
		}
		return null;
	}

	const parts = addressToken.split(',').map(num => parseInt(num.trim(), 10));

	if (parts.some(isNaN)) {
		console.error(`invliad address format "${addressToken}" contains non numeric parts.`);
		return null;
	}

	let knotIdx, strandIdx, quipuIdx;
	let targetQuipu = q1(currentQuipu);

	if (parts.length === 3) {
		[knotIdx, strandIdx, quipuIdx] = parts;
		const targetQuipuRegId = keychain.quipus[quipuIdx];
		if (targetQuipuRegId === undefined) return null;
		targetQuipu = q1(targetQuipuRegId);
	} else if (parts.length === 2) {

		[knotIdx, strandIdx] = parts;
		quipuIdx = keychain.quipus.indexOf(currentQuipu);
	} else {
		return null;
	}
	if (strandIdx < 0 || knotIdx < 0 || quipuIdx < 0) { return null; }

	if (targetQuipu) {

		const strandInfo = targetQuipu.strands[strandIdx];

		if (strandInfo) {

			const strand = s1(strandInfo.strandRegId);


			const knotforsale = k1(strand.knots[knotIdx]);
			if (strand && knotforsale) {
				const currentQuipuIndex = keychain.quipus.indexOf(currentQuipu);
				const currentStrand = s1(currentKnot.parentStrandId);

				const isPriorQuipu = quipuIdx < currentQuipuIndex;
				const isSameQuipu = quipuIdx === currentQuipuIndex;
				const isPriorStrand = strand.positionOnQuipu < currentStrand.positionOnQuipu;
				const isSameStrand = strand.positionOnQuipu === currentStrand.positionOnQuipu;
				const isPriorKnotInSameStrand = isSameStrand && knotIdx < currentKnot.strandIndex;

				// DAG dependency execution does not require knots to be physically laid out sequentially
				if (q1(currentQuipu).executionStrategy === 'DEPENDENCY_AWARE' || targetQuipu.executionStrategy === 'TEMPORAL_PARALLEL') {
					return strand.knots[knotIdx];
				}

				if (isPriorQuipu || (isSameQuipu && isPriorStrand) || (isSameQuipu && isPriorKnotInSameStrand)) {
					return strand.knots[knotIdx];
				} else {
					console.error(`invalid forward reference: current knot at ${currentKnot.strandIndex},${currentStrand.positionOnQuipu},${currentQuipuIndex} cannot reference ${knotIdx},${strandIdx},${quipuIdx}`);
					return null;
				}
			}
		}
	}
	return null;


}
