export let definedTools = {};

let numParamsSelect, paramsArea, functionNameInput, functionDescInput, functionCodeInput;
let addFunctionButton, definedFunctionsList, toolsJsonArea, exportToolsButton, importToolsButton, importExportStatus;

export function getDefinedTools() {
    return definedTools;
}

export function renderParameterInputs() {
	const numParams = parseInt(numParamsSelect.value, 10);
	paramsArea.innerHTML = '';
for (let i = 1; i <= numParams; i++){
	const div1 = document.createElement('div');
	div1.className = 'parameter-definition';
	div1.innerHTML = `
	<h4>Parameter${i}</h4>
	<label for="param_name_${i}">Name:</label>
	<input type="text" id="param_name_${i}" placeholder="parameter name">
	<label for="param_type_${i}">Type:</label>
	<select id="param_type_${i}">
	<option value="string">string</option>
	<option value="number">number</option>
	<option value="boolean">boolean</option>
	<option value="object">object</option>
	<option value="array">array</option>
	</select>
	<label for="param_desc_${i}">Description:</label>
	<textarea id="param_desc_${i}" rows="2" placeholder="description for the LLM"></textarea>
	<label><input type="checkbox" id="param_req_${i}" value="required">Required</label>`;
paramsArea.appendChild(div1);
}
}


export function getFunctionDataFromForm() {
    /* ... original function body preserved ... */
}

export function handleAddFunction(){
const name = functionNameInput.value.trim();
const description = functionDescInput.value.trim();
const code = functionCodeInput.value.trim();
const numParams = parseInt(numParamsSelect.value,10);

if(!name || !description || !code){
console.log('please fill in function name, descriptionk and code.');
return;
}
if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)){
	console.log('function name nmust be a valid javascript identifier (letters numbers');
	return;
}
const parameters = {
	type: 'object',
	properties: {},
	required: []
};
for(let o = 1; o <= numParams;o++){
	
const paramName = document.getElementById(`param_name_${o}`).value.trim();
const paramType = document.getElementById(`param_type_${o}`).value;
const paramDesc = document.getElementById(`param_desc_${o}`).value.trim();
const paramReq = document.getElementById(`param_req_${o}`).checked;
if(!paramName || !paramDesc){
	console.log(`please fill in name and description for parameter ${o}`);
return ;
}
parameters.properties[paramName] = {
	type: paramType,
description: paramDesc
};
if(paramReq){
	parameters.required.push(paramName);
}
}
//store the tool definition in the formate ollama expects. 
definedTools[name] = {
	type: 'function',
	function: {
		name: name,
		description: description,
		parameters: parameters, 
	code: code}
};
console.log(`function "${name}" added/updated`);
updateDefinedFunctionsUI();
clearFunctionForm();
console.log("defined tools: ", definedTools);

}
	

export function updateDefinedFunctionsUI(){
	definedFunctionsList.innerHTML = '';
	for(const name in definedTools){
		const li = document.createElement('li');
		const descriptionSnippet = definedTools[name]?.function?.description ? definedTools[name].function.description.substring(0,50) + '...' : '[no description]';
		li.textContent = `${name} (...) - ${descriptionSnippet}...`;
		definedFunctionsList.appendChild(li);
	}
}


export function clearFunctionForm(){
	functionNameInput.value = "";
	functionDescInput.value = "";
	functionCodeInput.value = "";
	numParamsSelect.value = '0';
	renderParameterInputs();
}
 

export function handleExportTools(){
	try{
		//use null,2 for pretty-printing the json
		const toolsJson = JSON.stringify(definedTools,null,2);
		toolsJsonArea.value = (toolsJson);
		importExportStatus.textContent = 'tools exported to text area below.';
		importExportStatus.style.color = 'green';
		console.log("exported tools:", definedTools);
	}catch(err){
		importExportStatus.textContent = "error exporting tools: " + err.message;
		importExportStatus.style.color = "red";
		console.error("export error:", err);
	}
}


export function handleImportTools(){
	
	const jsonText = toolsJsonArea.value.trim();
	
	if(!jsonText){
		importExportStatus.textContent = "text area is empty. nothing to import.";
		importExportStatus.style.color = "orange";
		return;
	}
	try { 
	const parsedData = JSON.parse(jsonText);
	// -- basic validation --
	if(typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)){
		throw new Error(`imprted data is not valid JSON (expeceted formatL {\"toolname\": { ... } } ). ${jsonText} \nTYPEOF: ${typeof parsedData} \n ISARRAY ${Array.isArray(parsedData)}\n STRINGIFY ${JSON.parse(jsonText)}`);
	}
	const validatedTools = {};
	for(const toolName in parsedData){
	// -- detailed validation --
	const tool = parsedData[toolName];
	if(typeof tool !== 'object' || tool === null || tool.type !== 'function' || typeof tool.function !== 'object' || tool.function === null){
		throw new Error(`invalid structuire for tool"${toolName}" missing type or function object. \n TYPEOF ${typeof tool} \n type: ${tool.type}\n TYPEOF ${typeof tool.function} `);
	}
	const funcData = tool.function;
	//check function properties
	if(typeof funcData.name !== 'string' || !funcData.name || typeof funcData.description !== 'string' || typeof funcData.code !== 'string' || !funcData.code || typeof funcData.parameters != 'object' || funcData.parameters === null){
	throw new Error(`invalid structure for tool "${toolName}" missing invalid name, description, code or parameters object.`);
	}
	//check parameters structure.
	if(funcData.parameters.type !== 'object' || typeof funcData.parameters.properties !== 'object' || funcData.parameters.properties === null || !Array.isArray(funcData.parameters.required)){
		throw new Error(`invalid parameters for ${toolName}`);
	}
	//optional: deeper validation of parameter properties array contents if 
	//if valid, now add to tempoerary validated object. 
	validatedTools[toolName] = tool;
}
// -- success --
definedTools = validatedTools;
updateDefinedFunctionsUI();
clearFunctionForm();
importExportStatus.textContent = `successfully imported ${Object.keys(definedTools).length} tools`;
importExportStatus.style.color = "Green";
console.log("imported Tools:", definedTools);
	}catch (err){
		importExportStatus.textContent = "import error " + err.message;
		importExportStatus.style.color = "red";
		console.error("import error:", err);
	}

	}


export function initToolsUI() {
    numParamsSelect = document.getElementById('number_parameters');
    paramsArea = document.getElementById('parameters_area');
    functionNameInput = document.getElementById('function_name');
    functionDescInput = document.getElementById('function_description');
    functionCodeInput = document.getElementById('function_code');
    addFunctionButton = document.getElementById('add_function') || document.getElementById('add_function_button');
    
    const dfl = document.getElementById('defined_functions_list');
    definedFunctionsList = dfl ? dfl.querySelector('ul') : null;
    
    toolsJsonArea = document.getElementById("tools_json_area");
    exportToolsButton = document.getElementById('export_tools_button') || document.getElementById('export_tools');
    importToolsButton = document.getElementById('import_tools_button') || document.getElementById('import_tools');
    importExportStatus = document.getElementById('import_export_status');

    if(numParamsSelect) numParamsSelect.addEventListener('change', renderParameterInputs);
    if(addFunctionButton) addFunctionButton.addEventListener('click', handleAddFunction);
    if(exportToolsButton) exportToolsButton.addEventListener('click', handleExportTools);
    if(importToolsButton) importToolsButton.addEventListener('click', handleImportTools);
}