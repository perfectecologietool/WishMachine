export const ExecutionStatus = {
	PENDING: 'PENDING', WORKING: 'WORKING', DONE: 'DONE', FAILED: 'FAILED'
};

export const Knot_Type = {
	USER_PROMPT_NO_CONTEXT: 'USER_PROMPT_NO_CONTEXT',
	USER_PROMPT_OWN_STRAND_HISTORY: 'USER_PROMPT_OWN_STRAND_HISTORY',
	USER_PROMPT_OTHER_KNOT_HISTORY: 'USER_PROMPT_OTHER_KNOT_HISTORY',
	SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_NO_CONTEXT: 'SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_NO_CONTEXT',
	SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_OWN_STRAND_HISTORY: 'SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_OWN_STRAND_HISTORY',
	SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_OTHER_KNOT_HISTORY: 'SOURCE_KNOT_RESPONSE_WITH_TEMPLATE_OTHER_KNOT_HISTORY',
	MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_NO_CONTEXT: 'MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_NO_CONTEXT',
	MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OWN_STRAND_HISTORY: 'MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OWN_STRAND_HISTORY',
	MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OTHER_KNOT_HISTORY: 'MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OTHER_KNOT_HISTORY',
	DYNAMIC_KNOT_GENERATOR: 'DYNAMIC_KNOT_GENERATOR',
	REGISTER: 'REGISTER',
};

export const ExecutionStrategy = {
	SEQUENTIAL: 'SEQUENTIAL', DEPENDENCY: 'DEPENDENCY', MODEL_AFFINITY: 'MODEL_AFFINITY'
};

export const StrategyOptions = `
            <option value="SEQUENTIAL">Sequential (Waterfall)</option>
            <option value="DEPENDENCY_AWARE">Dependency Aware (Graph)</option>
			<option value="MODEL_AFFINITY">batch models</option>
			<option value="TEMPORAL_PARALLEL">Temporal Parallel (Async Bridge)</option> 
`;

export const QDLTokenType = {
	// Keywords
	KW_QUIPU: "KW_QUIPU",
	KW_STRAND: "KW_STRAND",
	KW_KNOT: "KW_KNOT",

	KW_MODEL: "KW_MODEL",
	KW_TYPE: "KW_TYPE",
	KW_CONTEXT: "KW_CONTEXT",
	KW_CONTEXT_FN: "KW_CONTEXT_FN",
	KW_PROMPT_SOURCES: "KW_PROMPT_SOURCES",
	KW_PROMPT_FN: "KW_PROMPT_FN",
	KW_RESPONSE_FN: "KW_RESPONSE_FN",
	KW_FORCE_JSON: "KW_FORCE_JSON",
	KW_STRATEGY: "KW_STRATEGY",

	KW_TRUE: "KW_TRUE",
	KW_FALSE: "KW_FALSE",

	KW_SENDS_RESPONSE_TO: "KW_SENDS_RESPONSE_TO",
	KW_GETS_CONTEXT_FROM: "KW_GETS_CONTEXT_FROM",
	KW_USES_FN_PROMPT: "KW_USES_FN_PROMPT",
	KW_USES_FN_CONTEXT: "KW_USES_FN_CONTEXT",
	KW_USES_FN_RESPONSE: "KW_USES_FN_RESPONSE",
	KW_FOR: "KW_FOR",

	// Punctuation
	LBRACE: "LBRACE",
	RBRACE: "RBRACE",
	COLON: "COLON",
	SEMICOLON: "SEMICOLON",
	COMMA: "COMMA",
	STAR: "STAR",

	// Literals
	INTEGER: "INTEGER",
	IDENTIFIER: "IDENTIFIER",
	STRING: "STRING",

	EOF: "EOF"
};


export const Prompt_engines = [
	{ name: "Question", string: "Provide detailed answer for the question: \n context:" },
	{ name: "Step Coder", string: "Goal: \n Language: \n name: \n purpose: \n Process: \n dependencies: \n Example: \n Hints:\n Only code the particular component described, and do not provide peripheries, nor hypernyms nor hyponyms." },
	{ name: "Horizontal Coder", string: "expert Javascript programmer perform code integration to integrate this new piece of code into other code. The existing code context is provided. A new isolated code snippet is: ```{{CODE_SNIPPET}}``` . Task: Seamlessly integrate, refactor and combine the new snippet with the existing code to ensure they are compatible and work together. Output: only a large complete code block. " },
	{ name: "defunct Dependency Pilot", string: "Objective: Provide a structured systems-level analysis of the Feedforward Neural Network.\nEpistemic Constraints:\nUse domain-consensus knowledge.\nDistinguish established knowledge from inference.\nDo not speculate beyond widely supported understanding.\nIf uncertainty exists, label it explicitly.\nDecomposition Rules:\n1. Define the Feedforward Neural Network, clearly within its usage.\n2. Identify primary components.\n3. For each component: Describe its role.\nIdentify Inputs.\nIdentify Outputs.\nIdentify State variables.\nIdentify functional transformations.\nIdentify dependencies on other components.\n\nSynchronous Behaviour:\nModel how components operate simultaneously.\nDescribe coordination, sequencing, or parallelism.\nIdentify feedback mechanisms.\nBoundary Conditions:\nDefine system limits.\nDefine environmental interfaces.\nOutput Format:\nReturn ONLY Valid JSON.\n{'noun': 'string', 'definition': 'string', 'domain': 'string', 'boundary_conditions': 'string', 'components': [{'name': 'string', 'description': 'string', 'type': 'physical | abstract | process | hybrid', 'subcomponents': [], 'inputs': [], 'outputs': [], 'state_variables': [], 'functions': [], 'dependencies': [], 'uncertainty_notes': 'string'}], 'system_level_behaviour': {'synchronous_interactions': [], 'emergent_properties': [], 'feedback_loops': []}, 'external_interfaces': {'inputs_from_environment': [], 'outputs_to_environment': []}, 'assumptions': [], 'known_limitations': []}" },
	{ name: "RECURSIVE_DECOMPOSITION_PROMPT_TEMPLATE", string: "Objective: Provide a high-trust internal systems analysis of the component '{{COMPONENT_NAME}}' within '{{PARENT_SYSTEM}}'\nRules: Treat this component as a bounded system.\nDecompose into subcomponents.\nDefine inputs, outputs, state variables. Describe synchronous internal behaviour.\nIdentify feedback and constraints.\nDo not speculate beyond domain consensus.\nReturn only valid JSON.\n{'component_name': 'string', 'parent_system': 'string', 'definition': 'string', 'type': 'physical | abstract | process | hybrid', 'boundary_conditions': {'included': [], 'excluded': []}, 'subcomponents': [{'name': 'string', 'type': 'physical | abstract | process | hybrid', 'role': 'string'}], 'internal_behaviour': {'inputs': [], 'outputs': [], 'state_variables': [], 'functions': [], 'Dependencies': []}, 'synchronous_interactions': [{'participants': [], 'interaction_type': 'exchange | transformation | constraint | feedback', 'description': 'string'}], 'emergent_properties': [], 'failure_modes': [], 'metrics': {'measurable_variables': [], 'units': []}, 'assumptions': [], 'uncertainty_notes': []}" },
	{ name: "defunct Dependency Miner", string: "Objective: Provide a high-trust internal systems analysis of the component {{COMPONENT_NAME}} within {{PARENT_SYSTEM}}\n{{COMPONENT_NAME}} does {{COMPONENT_ROLE}}\n{{PARENT_SYSTEM}} has boundaries of {{PARENT_BOUNDARY}}\n\nRules: Treat this component as a bounded system.\nDecompose into subcomponents.\nDefine inputs, outputs, state variables. Describe synchronous internal behaviour.\nIdentify feedback and constraints.\nDo not speculate beyond domain consensus.\nReturn only valid JSON.\n{'component_name': 'string', 'parent_system': 'string', 'definition': 'string', 'type': 'physical | abstract | process | hybrid', 'boundary_conditions': {'included': [], 'excluded': []}, 'subcomponents': [{'name': 'string', 'type': 'physical | abstract | process | hybrid', 'role': 'string'}], 'internal_behaviour': {'inputs': [], 'outputs': [], 'state_variables': [], 'functions': [], 'Dependencies': []}, 'synchronous_interactions': [{'participants': [], 'interaction_type': 'exchange | transformation | constraint | feedback', 'description': 'string'}], 'emergent_properties': [], 'failure_modes': [], 'metrics': {'measurable_variables': [], 'units': []}, 'assumptions': [], 'uncertainty_notes': []}" },
	{ name: "SENSIBLE_DECOMPOSITION_PROMPT_TEMPLATE", string: "Objective: Provide a high-trust internal systems analysis of the component '{{COMPONENT_NAME}}' within '{{PARENT_SYSTEM}}'\n{{COMPONENT_NAME}} does {{COMPONENT_ROLE}}\n{{PARENT_SYSTEM}} has boundaries of {{PARENT_BOUNDARY}}\n\nRules: Treat this component as a bounded system.\nDecompose into subcomponents.\nDefine inputs, outputs, state variables. Describe synchronous internal behaviour.\nIdentify feedback and constraints.\nDo not speculate beyond domain consensus.\n\nClassification Rule:\nFor each subcomponent, set 'is_implementable' to true or false.\n- true: This component can be directly realized as a software artifact (a class, function, algorithm, equation, formula, schema, static constant, or data structure) in approx 100 lines of code or 2000 tokens.\n- false: This component is complex object, a system, an abstract concept, paradigm, or architectural pattern that requires further decomposition into concrete parts.\n\nReturn only valid JSON.\n{'component_name': 'string', 'parent_system': 'string', 'definition': 'string', 'type': 'physical | abstract | process | hybrid', 'boundary_conditions': {'included': [], 'excluded': []}, 'subcomponents': [{'name': 'string', 'is_implementable': false, 'type': 'physical | abstract | process | hybrid', 'role': 'string'}], 'internal_behaviour': {'inputs': [], 'outputs': [], 'state_variables': [], 'functions': [], 'Dependencies': []}, 'synchronous_interactions': [{'participants': [], 'interaction_type': 'exchange | transformation | constraint | feedback', 'description': 'string'}], 'emergent_properties': [], 'failure_modes': [], 'metrics': {'measurable_variables': [], 'units': []}, 'assumptions': [], 'uncertainty_notes': []}" },
		{ name: "EXPOUND_WISH_PROMPT_TEMPLATE", string: "Objective: Expand, clarify, and formulate the raw wish or system topic into a highly actionable, high-fidelity engineering goal.\nTask: Rephrase the provided wish, expounding on implicit requirements, context, and structural ambitions.\n\nRaw Topic: '{{TOPIC_NAME}}'\n\nReturn your response ONLY AS JSON strictly matching this format:\n{'original_wish': 'string', 'expounded_wish': 'string', 'refined_goal': 'string'}" },
	{ name: "MORAL_VERIFICATION_PROMPT_TEMPLATE", string: "Objective: Verify the following system decomposition according to moral law.\n\nSystem Ancestry Path (From Core Topic down to Parent System):\n{{ANCESTRAL_PATH}}\n\nParent System: '{{PARENT_SYSTEM}}'\n\nProposed Subcomponents:\n{{SUBCOMPONENT_LIST}}\n\nStandard of Verification:\n- \"Love one another as I have loved you\" (John 13:34)\n- \"Do unto others as you would have them do unto you\" (Matthew 7:12)\n\nTask: For each subcomponent, determine if its purpose and boundaries respect human agency, love, safety, and dignity within the context of the entire System Ancestry.\n\nReturn ONLY valid JSON:\n{\"subcomponents\": [{\"name\": \"string\", \"verdict\": true}]}" },
	// ── Phase 2 Recomposition Templates ─────────────────────────────────────────
	/* LEAF_NODE_RECOMPOSITION_PROMPT_TEMPLATE
	   Used by buildRecompositionQuipu() for leaf nodes (is_implementable === true).
	   The LLM receives decomposition analysis as context and produces a concrete spec. */
	{ name: "LEAF_NODE_RECOMPOSITION_PROMPT_TEMPLATE", string: "You are a senior software architect performing the IMPLEMENTATION PHASE of a structured system build.\n\nComponent: {{COMPONENT_NAME}}\nRole within {{PARENT_SYSTEM}}: {{COMPONENT_ROLE}}\n\nThe decomposition analysis for this component is provided in your conversation context.\n\nTask: Write a complete, concrete implementation specification for '{{COMPONENT_NAME}}'. This is a leaf-level, directly-implementable software artifact.\n\nYour specification MUST include:\n1. Chosen implementation construct (class / function / schema / algorithm / constant).\n2. Full interface definition: inputs, outputs, return types, error states.\n3. Step-by-step internal logic or pseudocode.\n4. Key dependencies on other components (by name).\n5. Test acceptance criteria: at least 3 concrete, verifiable conditions.\n6. Edge cases and failure modes to handle.\n\nDo NOT decompose further. This is a terminal implementation node. Be precise and actionable." },

	/* PARENT_NODE_SYNTHESIS_PROMPT_TEMPLATE
	   Used by buildRecompositionQuipu() for non-leaf nodes.
	   The LLM receives completed child specs as aggregated prompt sources and synthesises them. */
	{ name: "PARENT_NODE_SYNTHESIS_PROMPT_TEMPLATE", string: "You are a senior software architect performing the SYNTHESIS PHASE of a structured system build.\n\nParent Component: {{COMPONENT_NAME}}\nRole within {{PARENT_SYSTEM}}: {{COMPONENT_ROLE}}\n\nThe implementation specifications for all direct sub-components of '{{COMPONENT_NAME}}' are provided above.\n\nTask: Synthesise a unified ARCHITECTURE DOCUMENT for '{{COMPONENT_NAME}}' that integrates and coordinates all sub-components.\n\nYour architecture document MUST include:\n1. Executive summary: what '{{COMPONENT_NAME}}' does and its boundaries.\n2. Integration map: how each sub-component connects (data flow, control flow, callbacks).\n3. Shared interfaces: contracts, shared data structures, or protocols sub-components must agree on.\n4. Orchestration logic: initialisation order, runtime coordination, shutdown/teardown.\n5. Cross-cutting concerns: error propagation, logging, performance, and async safety.\n6. Open questions or design risks requiring further decision-making.\n\nReference sub-components by name. Do not repeat their full detail; synthesise at the coordination level." },

	// ── Running Summarization Template ────────────────────────────────────────
	{ name: "Summarization_of_Four_Row", string: "You are a concise summarizer. Below are the completed responses from a multi-turn workflow track. Provide a running summary that captures the core themes, decisions, and outputs produced so far. Be concise but thorough.\n\nCompleted responses:\n{{COLLATED_RESPONSES}}" },
];



export let modeloptions = {
	"Q2 draft": {
		supportstools: "true",
		hardmaxctx: "32000",
		value: "qwen2.5-coder:0.5b",
		doesThinking: "false",
	},
	"JSON structure": {
		supportstools: "true",
		hardmaxctx: "58000",
		value: "Osmosis/Osmosis-Structure-0.6B:latest",
		doesThinking: "false",
	},
	"MD convert": {
		supportstools: "true",
		hardmaxctx: "228000",
		value: "reader-lm:1.5b",
		doesThinking: "false",
	},
	"languageSupport": {
		supportstools: "true",
		hardmaxctx: "8000",
		value: "command-r7b:7b",
		doesThinking: "false",
	},
	"Coder": {
		supportstools: "true",
		hardmaxctx: "128000",
		value: "qwen2.5-coder:7b",
		doesThinking: "false",
	},
	"GeNowledge": {
		supportstools: "true",
		hardmaxctx: "32000",
		value: "falcon3:10b",
		doesThinking: "false",
	},
	"DeeKoder": {
		supportstools: "true",
		hardmaxctx: "128000",
		value: "deepcoder:14b",
		doesThinking: "false",
	},
	"r1-Planner": {
		supportstools: "true",
		hardmaxctx: "8000",
		value: "deepseek-R1:14b",
		doesThinking: "true",
	},
	"q2.5-Maths": {
		supportstools: "true",
		hardmaxctx: "128000",
		value: "qwen2.5-coder:32b",
		doesThinking: "false",
	},

	"Dal coder": {
		supportstools: "true",
		hardmaxctx: "128000",
		value: "devstral:24b",
		doesThinking: "false",
	},

	"q3a3-Frayer": {
		supportstools: "true",
		hardmaxctx: "40000",
		value: "qwen3:30b-a3b",
		doesThinking: "true",
	},
	"Orchestrator": {
		supportstools: "true",
		hardmaxctx: "8000",
		value: "deepseek-R1:32b",
		doesThinking: "true",
	}
};



export const setModelOptions = (newOptions) => { modeloptions = newOptions; };