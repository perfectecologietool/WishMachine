<?php
// DecompEngine.php
// Handles the dynamic Decomposition (growing the Quipu graph) and Recomposition (collapsing it bottom-up).
require_once 'DataModels.php';
require_once 'QuipuEngine.php';

class DecompEngine {
    
    public static function sensibleRecursiveDecomposition($responseText, $parsedJsonObj, $contextObj) {
        $knotRegId = $contextObj['knot'];
        $quipuRegId = $contextObj['quipu'];

        $originKnot = Registry::k1($knotRegId);
        if (!$originKnot) return;

        $originStrand = Registry::s1($originKnot->parentStrandId);
        $originQuipu = Registry::q1($originStrand->parentQuipuId);

        // Find components
        $components = $parsedJsonObj['components'] 
            ?? $parsedJsonObj['subcomponents'] 
            ?? ($parsedJsonObj['internal_behaviour'] ? $parsedJsonObj['internal_behaviour']['subcomponents'] : []) 
            ?? [];

        if (empty($components)) {
            return; // Base case
        }

        $parentSystemName = $parsedJsonObj['noun'] 
            ?? $parsedJsonObj['component_name'] 
            ?? $parsedJsonObj['name'] 
            ?? "Unknown System";

        $boundaries = $parsedJsonObj['boundary_conditions'] ?? "";

        // Create new Strand
        $newStrandRegId = $originQuipu->pushStrand();
        $newStrand = Registry::s1($newStrandRegId);
        $newStrand->name = "SensDecomp: " . $parentSystemName;

        // Note: For a true PHP backend, we might want to track a 'ConceptRegister' in the session / DB 
        // to prevent deep duplicate recursion. Since this runs per-request or in CLI, we need a mechanism.
        // For now, we will assume standard recursion limits:
        $maxDepth = 10;
        if ($newStrand->positionOnQuipu >= $maxDepth) {
            error_log("Max decomposition depth reached.");
            return;
        }

        // Parent address 
        // Real implementation requires $quipuIndex instead of 0
        $parentAddress = "{$originKnot->strandIndex},{$originStrand->positionOnQuipu},0";
        $ancestorAddresses = $originKnot->sourceContextKnotIds;
        $ancestorAddresses[] = $parentAddress;

        foreach ($components as $index => $component) {
            $compName = $component['name'] ?? $component['component_name'] ?? "Component $index";
            
            // Check terminal condition
            $isExplicitlyImplementable = isset($component['is_implementable']) && ($component['is_implementable'] === true || $component['is_implementable'] === "true");
            $isPhysicalType = isset($component['type']) && strtolower($component['type']) === "physical";
            
            $hasAbstract = false;
            if (isset($component['subcomponents']) && is_array($component['subcomponents'])) {
                foreach ($component['subcomponents'] as $sub) {
                    if (isset($sub['is_implementable']) && ($sub['is_implementable'] === false || $sub['is_implementable'] === "false")) {
                        $hasAbstract = true;
                        break;
                    }
                }
            }

            $isLeaf = ($isExplicitlyImplementable && $isPhysicalType && !$hasAbstract);

            // Build Prompt - for simplicity skipping the full template string replace
            $prompt = json_encode($component) . "\n\nDecompose $compName within $parentSystemName.";

            $newKnotRegId = null;
            if ($index === 0) {
                $newKnotRegId = $newStrand->knots[0];
                $firstKnot = Registry::k1($newKnotRegId);
                $firstKnot->knotType = "USER_PROMPT_OTHER_KNOT_HISTORY";
                $firstKnot->responseCallbackId = $isLeaf ? "none" : "sensibleRecursiveDecomposition";
                
                $tc = Registry::d3($firstKnot->TC);
                Registry::d2($tc->prompt)->content = $prompt;
            } else {
                $newKnotRegId = $newStrand->addKnot();
                $newKnot = Registry::k1($newKnotRegId);
                $newKnot->knotType = "USER_PROMPT_OTHER_KNOT_HISTORY";
                $newKnot->responseCallbackId = $isLeaf ? "none" : "sensibleRecursiveDecomposition";
                
                $tc = Registry::d3($newKnot->TC);
                Registry::d2($tc->prompt)->content = $prompt;
            }

            $knot = Registry::k1($newKnotRegId);
            $knot->sourceContextKnotIds = $ancestorAddresses;
        }
    }

    /**
     * Executes the Phase 1 Decomposition completely on the backend.
     */
    public static function Quechuy_DecompositionPhase($initialPrompt, $model) {
        $quipu = new Quipu("Decomposition");
        $quipu->executionStrategy = "DEPENDENCY_AWARE";

        $strandId = $quipu->pushStrand();
        $strand = Registry::s1($strandId);
        $knotId = $strand->knots[0];
        
        $knot = Registry::k1($knotId);
        $knot->responseCallbackId = "sensibleRecursiveDecomposition";
        
        $tc = Registry::d3($knot->TC);
        $tc->model = $model;
        
        $systemPrompt = "You are a system architect. Respond ONLY with a valid JSON object. Do not include markdown formatting or explanations. The JSON must contain a 'components' array. Each component object must have 'name', 'type' (physical or conceptual), 'is_implementable' (boolean), and 'internal_behaviour' (string).";
        $fullPrompt = $systemPrompt . "\n\nDecompose the following system into its high-level components:\n" . $initialPrompt;
        
        Registry::d2($tc->prompt)->content = $fullPrompt;

        // Create the Keychain (wrapper)
        $keychain = new Keychain("Backend Execution");
        $keychain->quipus[] = $quipu->RegId;

        // Blocking execute (in a real scenario, this would run async)
        QuipuEngine::executeQuipu($quipu->RegId);
        
        return $quipu->RegId;
    }
    
    // We will inject the topological sort and buildRecompositionQuipu logic here:
    
    /**
     * Walks a Decomposition Quipu to build an implied generic dependency graph (since we don't have the JS CoSy object here directly).
     * In the JS version, CoSy ArchNodes are used. Here, we can derive the tree from the knot links 
     * (`sourceContextKnotIds` where the parent was passed as context).
     */
    public static function buildRecompositionQuipu($decompQuipuRegId) {
        $decompQuipu = Registry::q1($decompQuipuRegId);
        if (!$decompQuipu) return null;

        $recompQuipu = new Quipu("Phase 2: Synthesis");
        $recompQuipu->executionStrategy = "DEPENDENCY_AWARE";

        // Identify Leaves vs Parents
        // A Knot is a parent if another Knot lists it in its sourceContextKnotIds
        $parentToChildren = [];
        $allKnots = [];
        
        foreach ($decompQuipu->strands as $strInfo) {
            $strand = Registry::s1($strInfo['strandRegId']);
            if (!$strand) continue;
            foreach ($strand->knots as $kId) {
                $allKnots[] = $kId;
                $knot = Registry::k1($kId);
                // The JS version pushed the parent address into sourceContextKnotIds of the child.
                // We find the immediate parent (the last one in the context array).
                if (!empty($knot->sourceContextKnotIds)) {
                    $parentAddr = end($knot->sourceContextKnotIds);
                    $parentId = QuipuEngine::resolveAddress($parentAddr, $kId, $decompQuipuRegId);
                    if ($parentId !== null) {
                        $parentToChildren[$parentId][] = $kId;
                    }
                }
            }
        }

        $leaves = [];
        $parents = [];
        foreach ($allKnots as $kId) {
            if (empty($parentToChildren[$kId])) {
                $leaves[] = $kId;
            } else {
                $parents[] = $kId;
            }
        }

        // We process leaves first, then parents (bottom-up).
        $topoOrder = array_merge($leaves, $parents);
        $recompMap = []; // decompKnotId => recompKnotId (the primary synthesizer knot)

        foreach ($topoOrder as $decompKnotId) {
            $decompKnot = Registry::k1($decompKnotId);
            $isLeaf = in_array($decompKnotId, $leaves);

            $strandRegId = $recompQuipu->pushStrand();
            $strand = Registry::s1($strandRegId);
            $strand->name = $isLeaf ? "Synth Leaf" : "Synth Parent";

            if ($isLeaf) {
                $leafKnotId = $strand->knots[0];
                $leafKnot = Registry::k1($leafKnotId);
                $leafKnot->knotType = "USER_PROMPT_NO_CONTEXT";
                $leafKnot->responseCallbackId = "extractCodeBlocks";
                
                $tc = Registry::d3($leafKnot->TC);
                $tc->model = "llama3.2:3b";
                
                // Fetch decomp response to pass to the prompt
                $decompResponse = Registry::d2(Registry::d3($decompKnot->TC)->response)->content;
                Registry::d2($tc->prompt)->content = "Implement this JSON spec:\n" . $decompResponse;
                
                $recompMap[$decompKnotId] = $leafKnotId;
            } else {
                // Parent: Evaluator + Synthesizer
                // 1. Evaluator
                $evalKnotId = $strand->knots[0];
                $evalKnot = Registry::k1($evalKnotId);
                $evalKnot->knotType = "USER_PROMPT_NO_CONTEXT";
                $tcEval = Registry::d3($evalKnot->TC);
                
                $decompResponse = Registry::d2(Registry::d3($decompKnot->TC)->response)->content;
                Registry::d2($tcEval->prompt)->content = "Architect this system:\n" . $decompResponse;

                // 2. Synthesizer
                $synthKnotId = $strand->addKnot();
                $synthKnot = Registry::k1($synthKnotId);
                $synthKnot->knotType = "MULTI_KNOT_AGGREGATION_WITH_TEMPLATE_OTHER_KNOT_HISTORY";
                $synthKnot->requestCallbackId = "concat_child_code";
                
                $tcSynth = Registry::d3($synthKnot->TC);
                Registry::d2($tcSynth->prompt)->content = "Combine the children for:\n" . $decompResponse;

                // Wire children limits
                if (isset($parentToChildren[$decompKnotId])) {
                    $synthKnot->sourcePromptKnotIds = [];
                    foreach ($parentToChildren[$decompKnotId] as $childDecompId) {
                        if (isset($recompMap[$childDecompId])) {
                            $childRecompId = $recompMap[$childDecompId];
                            $childRecompKnot = Registry::k1($childRecompId);
                            $childStrand = Registry::s1($childRecompKnot->parentStrandId);
                            // Fake quipu index 0 for now as it's isolated
                            $addr = "{$childRecompKnot->strandIndex},{$childStrand->positionOnQuipu},0";
                            $synthKnot->sourcePromptKnotIds[] = $addr;
                        }
                    }
                }
                
                $recompMap[$decompKnotId] = $synthKnotId;
            }
        }

        return $recompQuipu->RegId;
    }

    public static function executeFullPipeline($initialPrompt, $model) {
        $decompQuipuId = self::Quechuy_DecompositionPhase($initialPrompt, $model);
        
        $recompQuipuId = self::buildRecompositionQuipu($decompQuipuId);
        if ($recompQuipuId !== null) {
            QuipuEngine::executeQuipu($recompQuipuId);
            return $recompQuipuId; // return final quipu for client fetching
        }
        return null;
    }
}
