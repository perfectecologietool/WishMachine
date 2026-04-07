<?php
// DataModels.php

/**
 * Registry to simulate the global JS arrays mapped by RegId.
 */
class Registry {
    public static $KnotArray = [];
    public static $StrandArray = [];
    public static $QuipuArray = [];
    public static $KeychainArray = [];
    public static $TwoLayerArray = [];
    public static $ThreeCellArray = [];
    public static $FourRowArray = [];
    public static $FiveChoiceArray = [];
    public static $SixPlanArray = [];
    public static $uidCounter = 0;

    public static function getNextUID() {
        return "uid_" . (self::$uidCounter++);
    }

    public static function clear() {
        self::$KnotArray = [];
        self::$StrandArray = [];
        self::$QuipuArray = [];
        self::$KeychainArray = [];
        self::$TwoLayerArray = [];
        self::$ThreeCellArray = [];
        self::$FourRowArray = [];
        self::$FiveChoiceArray = [];
        self::$SixPlanArray = [];
        self::$uidCounter = 0;
    }
    
    // Helper accessors
    public static function d2($id) { return self::$TwoLayerArray[$id] ?? null; }
    public static function d3($id) { return self::$ThreeCellArray[$id] ?? null; }
    public static function d4($id) { return self::$FourRowArray[$id] ?? null; }
    public static function d5($id) { return self::$FiveChoiceArray[$id] ?? null; }
    public static function k1($id) { return self::$KnotArray[$id] ?? null; }
    public static function s1($id) { return self::$StrandArray[$id] ?? null; }
    public static function q1($id) { return self::$QuipuArray[$id] ?? null; }
}

class Two_Layer {
    public $id;
    public $role;
    public $content;
    public $individual_tokens;
    public $aggregate_tokens_at_this_point;
    public $RegId;

    public function __construct($r = "", $m = "") {
        $this->id = Registry::getNextUID();
        $this->role = $r;
        $this->content = $m;
        $this->individual_tokens = 0;
        $this->aggregate_tokens_at_this_point = 0;
        
        $this->RegId = count(Registry::$TwoLayerArray);
        Registry::$TwoLayerArray[] = $this;
    }

    public static function fromJSON($data) {
        if (is_string($data)) $data = json_decode($data, true);
        $new = new Two_Layer($data['role'] ?? '', $data['content'] ?? '');
        $new->individual_tokens = $data['individual_tokens'] ?? 0;
        $new->aggregate_tokens_at_this_point = $data['aggregate_tokens_at_this_point'] ?? 0;
        return $new;
    }
}

class Three_Cell {
    public $id;
    public $prompt;
    public $response;
    public $RegId;
    public $originalCellId = null;
    public $originalRowId = null;
    public $individual_tokens = 0;
    public $aggregate_tokens = 0;
    public $parentTrackId = null;
    public $model = "glm-5"; 

    public function __construct($p_role = "user", $p_content = "", $r_role = "assistant", $r_content = "") {
        $this->id = Registry::getNextUID();
        
        $p = new Two_Layer($p_role, $p_content);
        $this->prompt = $p->RegId;
        
        $r = new Two_Layer($r_role, $r_content);
        $this->response = $r->RegId;
        
        $this->RegId = count(Registry::$ThreeCellArray);
        Registry::$ThreeCellArray[] = $this;
    }

    public static function fromJSON($data) {
        if (is_string($data)) $data = json_decode($data, true);
        $new = new Three_Cell();
        $p = Two_Layer::fromJSON($data['prompt']);
        $r = Two_Layer::fromJSON($data['response']);
        $new->prompt = $p->RegId;
        $new->response = $r->RegId;
        $new->model = $data['model'] ?? "glm-5";
        $new->parentTrackId = $data['parentTrackId'] ?? null;
        $new->individual_tokens = $data['individual_tokens'] ?? 0;
        $new->aggregate_tokens = $data['aggregate_tokens'] ?? 0;
        return $new;
    }
}

class Knot {
    public $TC;
    public $knotType;
    public $parentStrandId;
    public $strandIndex;
    public $sourcePromptKnotIds = [];
    public $sourceContextKnotIds = [];
    public $promptTemplateId = "default";
    public $requestCallbackId = "none";
    public $responseCallbackId = "none";
    public $contextCallbackId = "none";
    public $forceJsonOutput = false;
    public $executionStatus = "PENDING";
    public $_debug_finalPrompt = '';
    public $_debug_contextMessages = [];
    public $_debug_rawResponse = '';
    public $prompt_tokens = 0;
    public $response_tokens = 0;
    public $RegId;
    public $id;

    public function __construct($parentStrandId = null, $strandIndex = 0) {
        $cell = new Three_Cell();
        $this->TC = $cell->RegId;
        $this->knotType = "USER_PROMPT_OWN_STRAND_HISTORY";
        $this->parentStrandId = $parentStrandId;
        $this->strandIndex = $strandIndex;

        $this->RegId = count(Registry::$KnotArray);
        Registry::$KnotArray[] = $this;
        $this->id = "knot-" . $this->RegId;
    }

    public static function fromJSON($data) {
        if (is_string($data)) $data = json_decode($data, true);
        $new = new Knot($data['parentStrandId'] ?? null, $data['strandIndex'] ?? 0);
        $newThreeCell = Three_Cell::fromJSON($data['TC']);
        $new->TC = $newThreeCell->RegId;
        $new->knotType = $data['knotType'] ?? "USER_PROMPT_OWN_STRAND_HISTORY";
        $new->sourcePromptKnotIds = $data['sourcePromptKnotIds'] ?? [];
        $new->sourceContextKnotIds = $data['sourceContextKnotIds'] ?? [];
        $new->promptTemplateId = $data['promptTemplateId'] ?? "default";
        $new->forceJsonOutput = $data['forceJsonOutput'] ?? false;
        $new->requestCallbackId = $data['requestCallbackId'] ?? "none";
        $new->responseCallbackId = $data['responseCallbackId'] ?? "none";
        $new->contextCallbackId = $data['contextCallbackId'] ?? "none";
        $new->prompt_tokens = $data['prompt_tokens'] ?? 0;
        $new->response_tokens = $data['response_tokens'] ?? 0;
        $new->executionStatus = $data['executionStatus'] ?? "PENDING";
        
        $new->_debug_finalPrompt = $data['_debug_finalPrompt'] ?? '';
        $new->_debug_contextMessages = $data['_debug_contextMessages'] ?? [];
        $new->_debug_rawResponse = $data['_debug_rawResponse'] ?? '';
        return $new;
    }
}

class Strand {
    public $name;
    public $knots = [];
    public $positionOnQuipu;
    public $parentQuipuId;
    public $workbitmap = [];
    public $RegId;
    public $id;

    public function __construct($positionOnQuipu = 0, $name = "New Strand", $parentQuipuId = null) {
        $this->name = $name;
        $this->positionOnQuipu = $positionOnQuipu;
        $this->parentQuipuId = $parentQuipuId;
        
        $this->RegId = count(Registry::$StrandArray);
        Registry::$StrandArray[] = $this;
        $this->id = "strand-" . $this->RegId;
    }

    public function popKnot() {
        if (count($this->knots) > 0) {
            array_pop($this->knots);
            array_pop($this->workbitmap);
        }
    }

    public function addKnot() {
        $k = new Knot($this->RegId, count($this->knots));
        $this->knots[] = $k->RegId;
        $this->workbitmap[] = false;
        return $k->RegId;
    }

    public static function fromJSON($data) {
        if (is_string($data)) $data = json_decode($data, true);
        $new = new Strand($data['positionOnQuipu'] ?? 0, $data['name'] ?? "New Strand", $data['parentQuipuId'] ?? null);
        
        if (isset($data['knots']) && is_array($data['knots'])) {
            foreach ($data['knots'] as $knotData) {
                $knot = Knot::fromJSON($knotData);
                $knot->parentStrandId = $new->RegId;
                $new->knots[] = $knot->RegId;
                $new->workbitmap[] = false;
            }
        }
        return $new;
    }
}

class Quipu {
    public $name;
    public $strands = [];
    public $executionStrategy;
    public $startKnotAddress = [0, 0];
    public $RegId;
    public $id;

    public function __construct($projectName = "New Quipu") {
        $this->name = $projectName;
        $this->executionStrategy = "SEQUENTIAL";
        
        $this->RegId = count(Registry::$QuipuArray);
        Registry::$QuipuArray[] = $this;
        $this->id = "quipu-" . $this->RegId;
    }

    public function pushStrand() {
        $s = new Strand(count($this->strands), "Strand " . count($this->strands), $this->RegId);
        $summ = new Two_Layer("summary", "[Summary for Strand " . $s->RegId . "]");
        $this->strands[] = array(
            "strandRegId" => $s->RegId,
            "summaryTwoLayerId" => $summ->RegId
        );
        $s->addKnot();
        return $s->RegId;
    }

    public static function fromJSON($data) {
        if (is_string($data)) $data = json_decode($data, true);
        $new = new Quipu($data['name'] ?? "New Quipu");
        $new->startKnotAddress = $data['startKnotAddress'] ?? [0, 0];
        $new->executionStrategy = $data['executionStrategy'] ?? "SEQUENTIAL";
        
        $new->strands = [];
        if (isset($data['strands']) && is_array($data['strands'])) {
            foreach ($data['strands'] as $sInfo) {
                // Determine if we're dealing with raw strand info or packed data.
                $strandData = $sInfo['strandData'] ?? $sInfo; 
                $strand = Strand::fromJSON($strandData);
                $strand->parentQuipuId = $new->RegId;
                
                $summary = new Two_Layer("summary", "");
                $new->strands[] = array(
                    "strandRegId" => $strand->RegId,
                    "summaryTwoLayerId" => $summary->RegId
                );
            }
        }
        return $new;
    }
}

class Keychain {
    public $name;
    public $quipus = [];
    public $templateQuipuId = null;
    public $visibleQuipuIndex = 0;

    public function __construct($name = "new keychain") {
        $this->name = $name;
    }

    public function setTemplateQuipu() {
        $q = new Quipu($this->name . " - primary template");
        $this->templateQuipuId = $q->RegId;
        $this->quipus[] = $q->RegId;
        return $q->RegId;
    }

    public static function fromJSON($data) {
        if (is_string($data)) $data = json_decode($data, true);
        $new = new Keychain($data['name'] ?? "new keychain");
        
        if (isset($data['quipus']) && is_array($data['quipus'])) {
            foreach ($data['quipus'] as $idx => $qData) {
                if ($qData) {
                    $quipu = Quipu::fromJSON($qData);
                    $new->quipus[] = $quipu->RegId;
                }
            }
        }
        $new->templateQuipuId = $data['templateQuipuId'] ?? null;
        return $new;
    }

    // Since PHP resets statics on each runtime request, sending state back and forth is needed. 
    // We can export the full context of the active Keychain & Registry into a master JSON blob.
    public function getJSONstring() {
        $qData = [];
        foreach ($this->quipus as $qId) {
            $q = Registry::q1($qId);
            if ($q) {
                // Recursive structure building...
                $qArr = [
                    "RegId" => $q->RegId,
                    "name" => $q->name,
                    "startKnotAddress" => $q->startKnotAddress,
                    "executionStrategy" => $q->executionStrategy,
                    "strands" => []
                ];
                foreach ($q->strands as $sInfo) {
                    $s = Registry::s1($sInfo['strandRegId']);
                    if (!$s) continue;
                    $sArr = [
                        "RegId" => $s->RegId,
                        "name" => $s->name,
                        "positionOnQuipu" => $s->positionOnQuipu,
                        "parentQuipuId" => $s->parentQuipuId,
                        "knots" => []
                    ];
                    foreach ($s->knots as $knotId) {
                        $k = Registry::k1($knotId);
                        if (!$k) continue;
                        $tc = Registry::d3($k->TC);
                        $tcArr = [];
                        if ($tc) {
                            $pr = Registry::d2($tc->prompt);
                            $re = Registry::d2($tc->response);
                            $tcArr = [
                                "RegId" => $tc->RegId,
                                "model" => $tc->model,
                                "prompt" => $pr ? ["role" => $pr->role, "content" => $pr->content] : [],
                                "response" => $re ? ["role" => $re->role, "content" => $re->content] : []
                            ];
                        }
                        $sArr['knots'][] = [
                            "RegId" => $k->RegId,
                            "knotType" => $k->knotType,
                            "parentStrandId" => $k->parentStrandId,
                            "strandIndex" => $k->strandIndex,
                            "sourcePromptKnotIds" => $k->sourcePromptKnotIds,
                            "sourceContextKnotIds" => $k->sourceContextKnotIds,
                            "promptTemplateId" => $k->promptTemplateId,
                            "forceJsonOutput" => $k->forceJsonOutput,
                            "requestCallbackId" => $k->requestCallbackId,
                            "responseCallbackId" => $k->responseCallbackId,
                            "TC" => $tcArr
                        ];
                    }
                    $qArr['strands'][] = [
                        "strandRegId" => $sInfo['strandRegId'],
                        "summaryTwoLayerId" => $sInfo['summaryTwoLayerId'],
                        "strandData" => $sArr
                    ];
                }
                $qData[] = $qArr;
            }
        }

        return json_encode([
            "name" => $this->name,
            "templateQuipuId" => $this->templateQuipuId,
            "quipus" => $qData
        ]);
    }
}
?>
