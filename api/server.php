<?php
// server.php
ini_set('display_errors', '0'); // Crucial: prevents warnings from breaking the JSON response

// Acts as the primary backend endpoint for the Decomp-Recomp Console.
// It receives a single prompt (the seed), runs the full decomposition and recomposition pipeline,
// and returns the final generated response (the assembled system).
// Note: In a production environment, this should ideally be handled via WebSockets
// or background jobs with polling, as LLM requests can take hours. 
// For this architecture port, we increase the time limit and execute synchronously.

require_once 'DataModels.php';
require_once 'QuipuEngine.php';
require_once 'DecompEngine.php';

header('Content-Type: application/json');

// Handle preflight CORS requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["status" => "error", "message" => "Only POST requests are allowed"]);
    exit;
}

$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

// We expect a JSON payload with at least 'prompt'. 'model' is optional.
$prompt = $input['prompt'] ?? '';
$model = $input['model'] ?? 'glm-5';
$ollamaUrl = $input['ollamaUrl'] ?? 'https://www.ollama.com';

if (empty($prompt)) {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Seed prompt is required"]);
    exit;
}

// OllamaAPI now defaults to https://www.ollama.com with bearer token auth.
// No need to set serverURL from client input.

// Execute the pipeline
try {
    error_log("Starting Full Pipeline for Prompt: " . substr($prompt, 0, 50) . "...");
    $finalQuipuId = DecompEngine::executeFullPipeline($prompt, $model);
    
    if ($finalQuipuId !== null) {
        $recompQuipu = Registry::q1($finalQuipuId);
        
        // Find the root synthesizer knot.
        // It's typically the last knot evaluated in the bottom-up synthesis.
        $finalOutput = "Error: Could not determine final synthesis output.";
        
        if (!empty($recompQuipu->strands)) {
            // Get the last strand (which contains the root parent)
            $lastStrandInfo = end($recompQuipu->strands);
            $lastStrand = Registry::s1($lastStrandInfo['strandRegId']);
            
            if ($lastStrand && !empty($lastStrand->knots)) {
                // Get the last knot in that strand (the synthesizer knot)
                $lastKnotId = end($lastStrand->knots);
                $lastKnot = Registry::k1($lastKnotId);
                
                $tc = Registry::d3($lastKnot->TC);
                $responseCell = Registry::d2($tc->response);
                
                if ($responseCell && !empty($responseCell->content)) {
                    $finalOutput = $responseCell->content;
                }
            }
        }

        echo json_encode([
            "status" => "success",
            "message" => "Pipeline completed successfully",
            "final_output" => $finalOutput,
            "debug_registry" => [
                "knots" => Registry::$KnotArray,
                "strands" => Registry::$StrandArray,
                "quipus" => Registry::$QuipuArray,
                "tc" => Registry::$ThreeCellArray,
                "layer" => Registry::$TwoLayerArray
            ]
        ]);
        
    } else {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Pipeline failed during execution."]);
    }
} catch (Exception $e) {
    error_log("Pipeline Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>
