import { BayesianGraph } from '../models/BayesianGraph.js';

export let globalUID = 0;
export const getNextUID = () => `${globalUID++}`;

export const textAreaSizeRegistry = new Map();
export let globalSuccessSignalFlag = false;
export const setGlobalSuccessSignalFlag = (val) => { globalSuccessSignalFlag = val; };

// Quipu Arrays & Dereferencers
export const KnotArray = [];
export const StrandArray = [];
export const QuipuArray = [];
export const KeychainArray = [];

export const k1 = (ind) => (ind >= 0 && KnotArray.length > ind) ? KnotArray[ind] : null;
export const s1 = (ind) => (ind >= 0 && StrandArray.length > ind) ? StrandArray[ind] : null;
export const q1 = (ind) => (ind >= 0 && QuipuArray.length > ind) ? QuipuArray[ind] : null;
export const kc1 = (ind) => (ind >= 0 && KeychainArray.length > ind) ? KeychainArray[ind] : null;

// Table Arrays & Dereferencers
export const TwoLayerArray = [];
export const ThreeCellArray = [];
export const FourRowArray = [];
export const FiveChoiceArray = [];
export const SixPlanArray = [];
export const SevenWishArray = [];
export const EventArray = [];
export const HopArray = [];
export const ConceptArray = [];
export const PredicateArray = [];

export const d2 = (ind) => (ind >= 0 && TwoLayerArray.length > ind) ? TwoLayerArray[ind] : null;
export const d3 = (ind) => (ind >= 0 && ThreeCellArray.length > ind) ? ThreeCellArray[ind] : null;
export const d4 = (ind) => (ind >= 0 && FourRowArray.length > ind) ? FourRowArray[ind] : null;
export const d5 = (ind) => (ind >= 0 && FiveChoiceArray.length > ind) ? FiveChoiceArray[ind] : null;
export const d6 = (ind) => (ind >= 0 && SixPlanArray.length > ind) ? SixPlanArray[ind] : null;
export const d7 = (ind) => (ind >= 0 && SevenWishArray.length > ind) ? SevenWishArray[ind] : null;

export const dE = (ind) => (ind >= 0 && EventArray.length > ind) ? EventArray[ind] : null;
export const dH = (ind) => (ind >= 0 && HopArray.length > ind) ? HopArray[ind] : null;
export const dC = (ind) => (ind >= 0 && ConceptArray.length > ind) ? ConceptArray[ind] : null;

export const dP = (ind) => (ind >= 0 && PredicateArray.length > ind) ? PredicateArray[ind] : null;

// Application State Managers
export let ActiveKeychain = null;
export const setActiveKeychain = (kc) => { ActiveKeychain = kc; };

export const DynamicTableState = {
    scenario: null, // Initialized in main.js
    activeHistory: null, // Initialized in main.js
    currentView: "DECOMPOSITION", // "DECOMPOSITION" or "RECOMPOSITION"
    archivedRuns: [],
    loadScenarioFromJSON: function(stri) { this.scenario = typeof window.Seven_Wish !== 'undefined' ? window.Seven_Wish.fromJSON(stri) : null; },
    archiveCurrentHistory: function() { /* handled in tableEngine */ },
    getScenario: function() { return this.scenario; }
};

export let CoalescedPlan = null; // Initialized in main.js
export const setCoalescedPlan = (plan) => { CoalescedPlan = plan; };

export let ActiveDecompRecompState = null;
export const setActiveDecompRecompState = (state) => { ActiveDecompRecompState = state; };

export let CoSy = null;
export const setCoSy = (cosy) => { CoSy = cosy; };

// Bayesian Graphs
export let GlobalDependencyBayesianGraph = new BayesianGraph("dependency");
export let GlobalDependentBayesianGraph = new BayesianGraph("dependent");

try {
    if (typeof localStorage !== 'undefined') {
        const depJson = localStorage.getItem('bayesian_code_graph_dependency');
        const dptJson = localStorage.getItem('bayesian_code_graph_dependent');
        if (depJson) GlobalDependencyBayesianGraph = BayesianGraph.fromJSON(depJson);
        if (dptJson) GlobalDependentBayesianGraph = BayesianGraph.fromJSON(dptJson);
    }
} catch (e) {
    console.warn("Failed to load Bayesian graphs from localStorage:", e);
}

export const setGlobalDependencyBayesianGraph = (g) => { GlobalDependencyBayesianGraph = g; };
export const setGlobalDependentBayesianGraph = (g) => { GlobalDependentBayesianGraph = g; };
