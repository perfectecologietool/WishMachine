<?php
// QuipuEngine.php
// Handles the asynchronous-like execution of the Quipu graph in PHP.
require_once 'DataModels.php';
require_once 'api.php';

class QuipuEngine {
    
    /**
     * Executes a Quipu, tracking dependencies.
     * In PHP, doing this synchronously might block the server for hours if run directly.
     * The script must be allowed to run indefinitely, or ideally triggered via CLI/background worker.
     */
    public static function executeQuipu($quipuRegId) {
        set_time_limit(0); // Allow long execution

        $quipu = Registry::q1($quipuRegId);
        if (!$quipu) {
            error_log("ExecuteQuipu failed: Quipu $quipuRegId not found.");
            return;
        }

        error_log("Executing Quipu: " . $quipu->name);

        if ($quipu->executionStrategy === "DEPENDENCY_AWARE") {
            self::executeWithDependencies($quipu);
        } else {
            self::executeSequential($quipu);
        }
    }

    private static function executeSequential($quipu) {
        foreach ($quipu->strands as $strandInfo) {
            $strand = Registry::s1($strandInfo['strandRegId']);
            if (!$strand) continue;

            foreach ($strand->knots as $knotRegId) {
                $knot = Registry::k1($knotRegId);
                if (!$knot || $knot->executionStatus === "DONE") continue;
                
                self::executeSingleKnot($knotRegId, $strand->RegId, $quipu->RegId);
            }
        }
    }

    private static function executeWithDependencies($quipu) {
        // Loop until all done or stalled
        $working = true;
        while ($working) {
            $working = false;
            $progressMade = false;

            // Rebuild the dynamic graph every tick, because Decomposition callbacks add new knots!
            $knotList = [];
            $dependencies = []; 

            $quipuFresh = Registry::q1($quipu->RegId);
            foreach ($quipuFresh->strands as $strandInfo) {
                $strand = Registry::s1($strandInfo['strandRegId']);
                if (!$strand) continue;
                foreach ($strand->knots as $knotRegId) {
                    $knotList[] = $knotRegId;
                    $dependencies[$knotRegId] = self::resolveDependencies($knotRegId, $quipu->RegId);
                }
            }

            foreach ($knotList as $knotRegId) {
                $knot = Registry::k1($knotRegId);
                if (!$knot || $knot->executionStatus === "DONE" || $knot->executionStatus === "FAILED") continue;

                $working = true;
                $depsMet = true;
                
                foreach ($dependencies[$knotRegId] as $depKnotId) {
                    $depKnot = Registry::k1($depKnotId);
                    if ($depKnot && $depKnot->executionStatus !== "DONE") {
                        $depsMet = false;
                        break;
                    }
                }

                if ($depsMet) {
                    self::executeSingleKnot($knotRegId, $knot->parentStrandId, $quipu->RegId);
                    $progressMade = true;
                }
            }

            if ($working && !$progressMade) {
                error_log("Dependency deadlock in executeWithDependencies");
                break;
            }
        }
    }

    private static function resolveDependencies($knotRegId, $quipuRegId) {
        $deps = [];
        $knot = Registry::k1($knotRegId);
        if (!$knot) return $deps;

        if (strpos($knot->knotType, 'OWN_STRAND_HISTORY') !== false && $knot->strandIndex > 0) {
            $strand = Registry::s1($knot->parentStrandId);
            if ($strand) {
                $deps[] = $strand->knots[$knot->strandIndex - 1];
            }
        }

        if (strpos($knot->knotType, 'OTHER_KNOT_HISTORY') !== false) {
            foreach ($knot->sourceContextKnotIds as $addr) {
                $id = self::resolveAddress($addr, $knotRegId, $quipuRegId);
                if ($id !== null) $deps[] = $id;
            }
        }

        foreach ($knot->sourcePromptKnotIds as $addr) {
            $id = self::resolveAddress($addr, $knotRegId, $quipuRegId);
            if ($id !== null) $deps[] = $id;
        }

        return $deps;
    }

    public static function resolveAddress($addrStr, $relativeKnotRegId, $quipuRegId) {
        // Example addr: [knotIndex, strandIndex, quipuIndex]
        $addrStr = trim($addrStr, " []");
        $parts = explode(",", $addrStr);
        if (count($parts) < 2) return null;

        $knotIdx = intval($parts[0]);
        $strandPos = intval($parts[1]);

        $quipu = Registry::q1($quipuRegId);
        if (!$quipu) return null;

        foreach ($quipu->strands as $sInfo) {
            $strand = Registry::s1($sInfo['strandRegId']);
            if ($strand && $strand->positionOnQuipu === $strandPos) {
                return $strand->knots[$knotIdx] ?? null;
            }
        }
        return null;
    }

    public static function executeSingleKnot($knotRegId, $strandRegId, $quipuRegId) {
        $knot = Registry::k1($knotRegId);
        if (!$knot) return;

        $knot->executionStatus = "WORKING";
        $tc = Registry::d3($knot->TC);
        $promptCell = Registry::d2($tc->prompt);
        $responseCell = Registry::d2($tc->response);

        // 1. Gather Context
        $messages = [];
        $dependencies = self::resolveDependencies($knotRegId, $quipuRegId);
        foreach ($dependencies as $depId) {
            $dKnot = Registry::k1($depId);
            if ($dKnot) {
                $dTC = Registry::d3($dKnot->TC);
                $dp = Registry::d2($dTC->prompt);
                $dr = Registry::d2($dTC->response);
                if ($dp && $dp->content) $messages[] = ["role" => $dp->role, "content" => $dp->content];
                if ($dr && $dr->content) $messages[] = ["role" => $dr->role, "content" => $dr->content];
            }
        }

        // 2. Assemble Prompt
        $finalPrompt = $promptCell->content;

        // Apply aggregation from sourcePromptKnotIds if it's a MULTI_KNOT
        if (strpos($knot->knotType, 'MULTI_KNOT') !== false) {
            foreach ($knot->sourcePromptKnotIds as $addr) {
                $srcId = self::resolveAddress($addr, $knotRegId, $quipuRegId);
                if ($srcId !== null) {
                    $sKnot = Registry::k1($srcId);
                    $sTC = Registry::d3($sKnot->TC);
                    $sResp = Registry::d2($sTC->response)->content;
                    
                    // Call 'requestCallback' (e.g. concat_child_code)
                    if ($knot->requestCallbackId === 'concat_child_code') {
                        $code = self::extractCodeBlocks($sResp);
                        $finalPrompt .= "\n\n<Component snippet>\n```\n$code\n```\n</Component>";
                    } else {
                        $finalPrompt .= "\n\n[Context from Aggregation]:\n" . $sResp;
                    }
                }
            }
        }

        $messages[] = ["role" => $promptCell->role, "content" => $finalPrompt];
        $knot->_debug_finalPrompt = $finalPrompt;
        $knot->_debug_contextMessages = $messages;

        // 3. Call Ollama
        try {
            $availableModels = OllamaAPI::getAvailableModels();
            if (!empty($availableModels) && !in_array($tc->model, $availableModels)) {
                error_log("Model {$tc->model} not found in /api/tags, falling back to " . $availableModels[0]);
                $tc->model = $availableModels[0];
            }
            
            error_log("Calling Ollama for knot $knotRegId with model " . $tc->model);
            $response = OllamaAPI::chat($tc->model, $messages, [], $knot->forceJsonOutput ? "json" : null);

            $responseContent = $response['message']['content'] ?? "";
            
            $knot->_debug_rawResponse = $responseContent;
            $responseCell->content = $responseContent;
            
            // Invoke Response Callback (sensibleRecursiveDecomposition, extractCodeBlocks, etc)
            self::invokeResponseCallback($knot->responseCallbackId, $responseContent, [
                "knot" => $knotRegId,
                "quipu" => $quipuRegId
            ]);
            
            $knot->executionStatus = "DONE";
        } catch (Exception $e) {
            error_log("LLM Call Failed for Knot $knotRegId: " . $e->getMessage());
            $knot->_debug_rawResponse = "EXCEPTION: " . $e->getMessage();
            $knot->executionStatus = "FAILED";
        }
    }

    private static function invokeResponseCallback($callbackId, $responseText, $contextObj) {
        if ($callbackId === "none" || empty($callbackId)) return;

        if ($callbackId === "sensibleRecursiveDecomposition") {
            // Need to port sensibleRecursiveDecomposition logic
            require_once 'DecompEngine.php';
            
            // Attempt to extract JSON from response
            $jsonDocs = self::extractJsonObjects($responseText);
            if (empty($jsonDocs)) {
                error_log("Failed to extract JSON for decomposition.");
                return;
            }
            // Usually returns array of objects, take first.
            DecompEngine::sensibleRecursiveDecomposition($responseText, $jsonDocs[0], $contextObj);
        }
        else if ($callbackId === "extractCodeBlocks") {
            $knot = Registry::k1($contextObj['knot']);
            if ($knot) {
                $tc = Registry::d3($knot->TC);
                $resp = Registry::d2($tc->response);
                $resp->content = self::extractCodeBlocks($responseText) ?: $responseText;
            }
        }
    }

    private static function extractJsonObjects($text) {
        // Quick regex to find JSON blocks
        preg_match_all('/\{(?:[^{}]|(?R))*\}/x', $text, $matches);
        $objs = [];
        foreach ($matches[0] as $match) {
            $decoded = json_decode($match, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $objs[] = $decoded;
            }
        }
        return $objs;
    }

    private static function extractCodeBlocks($text) {
        preg_match_all('/```[\w-]*\n([\s\S]*?)```/', $text, $matches);
        if (!empty($matches[1])) {
            return implode("\n\n", $matches[1]);
        }
        return false;
    }
}
