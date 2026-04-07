import { ExecutionStatus, modeloptions, setModelOptions } from '../core/constants.js';
import { truncateThinkingTags, extractJsonObject } from '../utils/helpers.js';
import { d2, d3, d4, k1, d5, d6, d7, DynamicTableState } from '../core/state.js';
import { getDefinedTools } from '../renderers/toolsUI.js';
import { Three_Cell, Two_Layer, Four_Row, Knot, Hyper_Three_Cell } from '../models/WISH.js';
import { reconstructMessagesFromFourRow, logTurnToActiveHistory, calculateAndStoreFourRowTokens, updateTrackSummary } from './tableEngine.js';
import { processingCallbacks, applyResponseCallback, wdl_getHTCaddr } from './wdlEngine.js';

export function inlineWDLResolver(sourceAddr) {
	if (sourceAddr === null || sourceAddr === undefined) return null;

	if (typeof sourceAddr === 'number') return sourceAddr;

	if (Array.isArray(sourceAddr)) {
		if (sourceAddr.length > 0 && !isNaN(sourceAddr[sourceAddr.length - 1])) {
			return sourceAddr[sourceAddr.length - 1];
		}
		return null;
	}

	if (typeof sourceAddr === 'string') {
		if (sourceAddr.startsWith("@HTC:")) {
			return parseInt(sourceAddr.split(':')[1], 10);
		} else if (sourceAddr.startsWith("@PREV")) {
			if (DynamicTableState.activeHistory.sequence.length > 1) {
				return DynamicTableState.activeHistory.sequence[DynamicTableState.activeHistory.sequence.length - 2];
			}
			return null;
		}
		const parts = sourceAddr.split(',').map(n => parseInt(n.trim(), 10));
		if (parts.length > 0 && !isNaN(parts[parts.length - 1])) {
			return parts[parts.length - 1];
		}
	}

	return null;
}


async function executeToolSafely(toolDefinition, functionArgs, functionName) {
	if (toolDefinition && toolDefinition.function.code) {
		try {
			const codeToRun = toolDefinition.function.code;
			const isAsync = codeToRun.trim().startsWith('async');
			const funcConstructor = isAsync ? Object.getPrototypeOf(async function () { }).constructor : Function;
			const definedParamNames = Object.keys(toolDefinition.function.parameters.properties);
			const callArgValues = definedParamNames.map(pName => functionArgs[pName]);
			console.log(`Executing ${functionName} with ordered args:`, callArgValues);
			const func = new funcConstructor(...definedParamNames, codeToRun);
			const output = await func.apply(null, callArgValues);
			return JSON.stringify(output);
		} catch (ex_er) {
			console.error(`Error executing tool ${functionName}:`, ex_er);
			return JSON.stringify({ error: `Error executing tool ${functionName}: ${ex_er.message}` });
		}
	}
	return JSON.stringify({ error: `Tool function "${functionName}" not defined locally.` });
}

export function buildOllamaRequestData(model, messages, toolCapable, availableTools, forceJSON = false) {
	//immutable function (UI independent.) 
	//@param model {string} - the name of the model. i.e: 'ollama run model'
	//@param messages []{types.go/messages struct} - from reconstructMessages_*()
	//@param toolCapable {bool} - necessary because if tools sent to incapable model = fail. (in modelinputs) 
	//@param availableTools {JSON} - see "Tool Definition Functions" , namely handleImportTools() .  
	//prepare the tools array suitable for the API (filtering out code
	//this logic remains important for preparing the tools parameter. 
	const toolsForApi = Object.values(availableTools).map(tool => {
		if (!tool?.function) { return null; }
		const { code, ...definition } = tool.function;
		return { type: tool.type, function: definition };
	}).filter(tool => tool !== null);

	// let topkselec = parseInt(topkSlide.value, 10);
	//let  tempselec = parseFloat(tempSlide.value, 10);

	const numCtxDom = document.getElementById('numCtxSlider');
	let contextSize = numCtxDom ? parseInt(numCtxDom.value, 10) : 4096;

	// Always default to the server's mathematically defined max context window for the selected model.
	const modelDetails = Object.values(modeloptions).find(opt => opt.value === model);
	if (modelDetails && (modelDetails.hardmaxctx || modelDetails.ctx_num)) {
		contextSize = parseInt(modelDetails.hardmaxctx || modelDetails.ctx_num, 10);
		console.log(`Using server-defined max context size for ${model}: ${contextSize}`);
	} else {
		console.warn(`Fallback: Couldn't find max context size for ${model} in modeloptions, using ${contextSize}.`);
	}

	const tempDom = document.getElementById('tempslider');
	const topKDom = document.getElementById('topkslider');
	const temperatureVal = tempDom ? parseFloat(tempDom.value) : 0.7;
	const topKVal = topKDom ? parseInt(topKDom.value, 10) : 40;

	const requestData = {
		model: model,
		messages: messages,
		stream: true,
		options: {
			num_ctx: contextSize,
			temperature: temperatureVal,
			top_k: topKVal
		}
	};
	if (forceJSON) { requestData.format = "json"; }
	if (toolCapable && toolsForApi.length > 0) {
		requestData.tools = toolsForApi;
	}
	/*important: check ollama documnetation for whether num_ctx should be top level , or inside options. assuming options for now as in common. adjust if needed. 
	if num_ctx shuld be top-level; requestData.num_ctx = numCtx; and deetel requestdata.options. */
	return requestData;
}


/**
 * Sends a request to the Ollama API via the proxy and returns the
 * complete, accumulated assistant response object OR throws an error.
 * Handles fetch, HTTP errors, and stream processing internally.
 * Does NOT interact with UI or messageHistory.
 *
 * @param {object} requestData - The data payload for the Ollama API
 * (e.g., { model, messages, tools?, stream: true })
 * @returns {Promise<object>} A promise that resolves to the final assistant
 * message object (e.g., { role: 'assistant', content: '...', tool_calls: [...] })
 * or rejects with an error.
 */
export async function coreOllamaRequest(requestData) { // only called through handleSendPrompt()
	//@param {object} object created by buildOllamaRequestData(z,z,z,z )
	//@returns structure of object, not stringified. 


	let finalAssistantMessage = { role: 'assistant', content: '', tool_calls: [] };
	try {
		const response = await fetch('/api/chat.php', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestData),
		});

		if (response.status === 202) {
			// Silently queue (HTTP 202 is a 2xx success code, no red browser error)
			await new Promise(resolve => setTimeout(resolve, 3000));
			return await coreOllamaRequest(requestData);
		}

		if (!response.ok) {
			if (response.status === 429) {
				console.log("[api.js] Received 429 native overload. Waiting 10s then retrying...");
				await new Promise(resolve => setTimeout(resolve, 10000));
				return await coreOllamaRequest(requestData);
			}
			// Attempt to get error details from response body
			let errorBody = `(Status: ${response.status})`;
			try {
				errorBody = await response.text();
			} catch (_) { /* Ignore error reading body */ }
			console.error(`CoreOllamaRequest HTTP Error: ${response.status}`, errorBody);
			throw new Error(`Ollama API request failed: ${response.status} - ${errorBody}`);
		}

		if (!response.body) {
			throw new Error('Ollama API response body is null.');
		}

		// Process the stream internally to accumulate the result
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let streamDone = false;
		let receivedContent = ""; // Accumulator for content
		let receivedToolCalls = []; // Accumulator for tool calls
		let finalPromptEvalCount = null;
		let finalEvalCount = null;
		let finalchunk = null;
		let buffer = '';
		while (!streamDone) {
			const { done, value } = await reader.read();
			if (done) {
				if (buffer) {
					try {
						let parsedLine = JSON.parse(buffer);

						// Accumulate content
						if (parsedLine.message?.content) {

							console.log(`the BUFFER's line ${parsedLine.message.content}`);
							receivedContent += parsedLine.message.content;
						}
						// Accumulate tool calls
						if (Array.isArray(parsedLine.message?.tool_calls)) {
							receivedToolCalls.push(...parsedLine.message.tool_calls);
						} else if (Array.isArray(parsedLine.tool_calls)) {
							receivedToolCalls.push(...parsedLine.tool_calls);
						}
						// Check for Ollama's explicit done flag
						if (parsedLine.done === true) {
							streamDone = true;
							finalPromptEvalCount = parsedLine.prompt_eval_count ?? null;
							finalEvalCount = parsedLine.eval_count ?? null;
							finalchunk = parsedLine;
						}
					} catch (e) {
						console.warn("stream ended with imcomplete buffer", buffer);
					}
					streamDone = true;
					break;
				}
			}

			const chunkText = decoder.decode(value, { stream: true });
			buffer += chunkText;
			const lines = buffer.split('\n');//.filter(line => line.trim() !== '');
			buffer = lines.pop();
			//let bugspare = ""; let falt = false;
			//for(let i3 = 0; i3 < lines.length; i3++){	let line = lines[i3];
			lines.forEach(line => {
				let parsedLine;
				try {
					if (!line.trim() || !line.trim().startsWith('{')) return;
					parsedLine = JSON.parse(line);

					// Accumulate content
					if (parsedLine.message?.content) {
						//console.log(`chunk line ${parsedLine.message.content}`);
						receivedContent += parsedLine.message.content;
					}
					// Accumulate tool calls
					if (Array.isArray(parsedLine.message?.tool_calls)) {
						receivedToolCalls.push(...parsedLine.message.tool_calls);
					} else if (Array.isArray(parsedLine.tool_calls)) {
						receivedToolCalls.push(...parsedLine.tool_calls);
					}
					// Check for Ollama's explicit done flag
					if (parsedLine.done === true) {
						streamDone = true;
						finalPromptEvalCount = parsedLine.prompt_eval_count ?? null;
						finalEvalCount = parsedLine.eval_count ?? null;
						finalchunk = parsedLine;
					}

				} catch (e) {
					//	   falt = true; bugspare = line;
					console.warn("CoreOllamaRequest: Could not parse JSON line:", line, e);
				}


				//}              
			});
		} // End while loop

		// Construct the final message object
		finalAssistantMessage.content = receivedContent;
		finalAssistantMessage.tool_calls = receivedToolCalls;
		// Handle Ollama's convention for null content when only tool calls are present
		if (finalAssistantMessage.tool_calls.length > 0 && finalAssistantMessage.content === "") {
			finalAssistantMessage.content = null;
		}
		finalAssistantMessage.promptTokensForTurn = finalPromptEvalCount;
		finalAssistantMessage.responseTokens = finalEvalCount;

		//XXX5 console.log("CoreOllamaRequest :", finalAssistantMessage); 
		return finalAssistantMessage;
		// Return the complete message object
	} catch (error) {
		// Log and re-throw network or parsing errors for the caller to handle
		console.error("Error in coreOllamaRequest:", error);
		// Ensure the error is propagated
		throw error; // Re-throw the error after logging
	}
}



/* executes special two pass request for a single turn. 
@param {number} threeCellReferenceId 
@returns {bool} promise that resolves to true upon success. */
export async function coreTwoPassRequest(knotReference) {
	const knotInstance = k1(knotReference);
	if (!knotInstance) return false;
	const threeCellInstance = d3(knotInstance.TC);
	if (!(threeCellInstance instanceof Three_Cell)) { return false; }
	const promptMessage = d2(threeCellInstance.prompt);
	if (!(promptMessage instanceof Two_Layer)) { return false; }
	const originalPromptContent = promptMessage.content;
	const modelToUse = threeCellInstance.model || modelInput.value;

	//Pass 1 - deterministic. 
	const originalTemp = document.getElementById('tempslider').value; const originalTopK = document.getElementById('topkslider').value;
	const focusedOptions = { num_ctx: parseInt(document.getElementById('numCtxSlider').value, 10), temperature: 0.0, top_k: 1, };
	const requestData1 = buildOllamaRequestData(modelToUse, [{ role: promptMessage.role, content: originalPromptContent }], false, {});
	requestData1.options = focusedOptions;
	let response1_obj;
	try {
		response1_obj = await coreOllamaRequest(requestData1);
	} finally {
		tempSlide.value = originalTemp; topkSlide.value = originalTopK;
		handletempinput(); handletopkinput();
	}
	const focusedprompttokens = response1_obj.promptTokensForTurn;

	//Pass 2 - Creative
	const prompt2 = `${originalPromptContent}\n${response1_obj.content}`;
	const messageHistoryForContext = reconstructMessagesFromFourRow(DynamicTableState.activeHistory.RegId);
	messageHistoryForContext.push({ role: 'user', content: prompt2 });
	const requestData2 = buildOllamaRequestData(modelToUse, messageHistoryForContext, true, getDefinedTools());
	const response2_obj = await coreOllamaRequest(requestData2);
	//update cell 
	console.log(`inside 2pass after request 2nd pass- ${JSON.stringify(response2_obj)}`);
	d2(threeCellInstance.prompt).setContent(originalPromptContent);
	d2(threeCellInstance.response).setContent(response2_obj.content);
	//manually set token count without calling calculateAndStore (which may be wrong algorithm).
	if (focusedprompttokens) {//XX34 
		console.log(`HERE IN TWO PASS: prompt individual token`);
		d2(threeCellInstance.prompt).individual_tokens = focusedprompttokens;
	} else {
		console.log("here in two pass, individual fail");
	}
	if (response2_obj.responseTokens) {
		console.log(`HERE IN 2 PASS: RESPONSE individual token`);
		d2(threeCellInstance.response).individual_tokens = response2_obj.responseTokens;

	} else {
		console.log("response token fail");
	}
	//history
	logTurnToActiveHistory(knotReference);
	//	calculateTokensFromHistory(DynamicTableState.activeHistory.RegId);
	return true;
}


/*
@param {number} threeCellReference the RegId of the Threecell to process. 
@param {boolean} [skipHistoryUpdate = false] if true this execution will not be added to the active history.
@param [number} override promptRegId=null] if provgided this prompt will be used for history logging instead of the one in the cell.
@return {promise<boolean>} resolves to true on success.
*/
export async function coreOllamaRequestTC(knotReference, skipHistoryUpdate = false, overridePromptRegId = null, performCallbacks = true) {
	return coreOllamaRequestHTC(knotReference, skipHistoryUpdate, overridePromptRegId, performCallbacks);
}

export async function coreOllamaRequestHTC(knotReference, skipHistoryUpdate = false, overridePromptRegId = null, performCallbacks = true) {
	//called by only 
	const knotInstance = k1(knotReference);
	if (!knotInstance) {
		console.error("coreOllamaRequest: Invalid parameter. a Knot instance is required.");
		return false;
	}
	const threeCellInstance = d3(knotInstance.TC);

	const parentTrack = d4(knotInstance.parentTrackId);
	const is1ContextFree = (knotInstance.knotType && knotInstance.knotType.includes('NO_CONTEXT'));	

	//getmodel and context
	let globalModel = document.getElementById('modelSel') ? document.getElementById('modelSel').value : 'llama3.2:3b';
	if (!globalModel || globalModel.trim() === '') globalModel = 'glm-5';
	let modelch = threeCellInstance.model || globalModel;
	if (!modelch || modelch.trim() === '') modelch = 'glm-5';
	//model callbacks
	let rules = null;
	for (let keyin in modeloptions) {
		if (modeloptions[keyin].value === modelch) {
			rules = modeloptions[keyin];
		}
	}
	const sliderDom = document.getElementById('numCtxSlider');
	const cntch = (rules && rules.ctx_num) ? rules.ctx_num : (sliderDom ? parseInt(sliderDom.value, 10) : 4096);

	//1. prepare request data
	//dereference the prompt's two layer object using its RegId
	const promptMessage = d2(threeCellInstance.prompt);
	if (!promptMessage || !promptMessage.content) {
		console.error(`coreOllamaRequest ${threeCellInstance.id} is empty.`); return false;
	}

	//XX34construct messages[] from DynamicTableState.activeHistory 	
	//	const messagehist = reconstructMessagesFromFourRow(DynamicTableState.activeHistory.RegId);
	//const parentTrack = d4(threeCellInstance.parentTrackId);
	let messagehist = [];

	if (knotInstance.knotType && knotInstance.knotType.includes('OTHER_KNOT_HISTORY') && knotInstance.sourceContextKnotIds) {
		console.log(`Executing with OTHER_KNOT_HISTORY context for cell ${threeCellInstance.RegId}`);
		let aggregated_tokens = 0;
		const safe_ctx_limit = Math.max(0, cntch - 1000);
		let keptHistoryKnots = [];
		for (let i = knotInstance.sourceContextKnotIds.length - 1; i >= 0; i--) {
			const sourceAddr = knotInstance.sourceContextKnotIds[i];
			const resolvedId = inlineWDLResolver(sourceAddr);
			if (resolvedId !== null && typeof k1 === 'function') {
				const historyKnot = k1(resolvedId);
				if (!historyKnot) continue;
				const knot_total_tokens = (historyKnot.prompt_tokens || 0) + (historyKnot.response_tokens || 0);
				if ((aggregated_tokens + knot_total_tokens) >= safe_ctx_limit) break;
				aggregated_tokens += knot_total_tokens;
				keptHistoryKnots.unshift(historyKnot);
			}
		}
		for (const historyKnot of keptHistoryKnots) {
			const pt = d2(d3(historyKnot.TC).prompt);
			const rt = d2(d3(historyKnot.TC).response);
			if (pt && pt.content && pt.content.trim() !== "") messagehist.push({ role: pt.role, content: pt.content });
			if (rt && rt.content && rt.content.trim() !== "") {
				let finalContextSegment = rt.content;
				if (historyKnot.contextCallbackId && historyKnot.contextCallbackId !== "none" && processingCallbacks[historyKnot.contextCallbackId]) {
					try { finalContextSegment = processingCallbacks[historyKnot.contextCallbackId](rt.content, {}, { knot: knotReference }); } catch (e) { }
				}
				messagehist.push({ role: rt.role, content: finalContextSegment });
			}
		}
	} else if (is1ContextFree) {
		console.log(`Executing CONTEXT FREE for cell ${threeCellInstance.RegId} in track ${parentTrack ? parentTrack.RegId : "n/a"}`);
	} else {
		//for normal tracks, build history as usual.
		console.log(`Executing with native track context for cell ${threeCellInstance.RegId} in track ${parentTrack ? parentTrack.RegId : "n/a"}`);
		messagehist = reconstructMessagesFromFourRow(DynamicTableState.activeHistory.RegId);
	}

	let finalpromptMessage = promptMessage.content;

	if (knotInstance.knotType && (knotInstance.knotType.includes('SOURCE_KNOT') || knotInstance.knotType.includes('MULTI_KNOT'))) {
		for (let i = 0; i < knotInstance.sourcePromptKnotIds.length; i++) {
			const sourceAddr = knotInstance.sourcePromptKnotIds[i];
			const resolvedKnotId = inlineWDLResolver(sourceAddr);

			if (resolvedKnotId !== null && typeof k1 === 'function') {
				const sourceKnot = k1(resolvedKnotId);
				if (sourceKnot && sourceKnot.TC) {
					const sourceResponseContent = d2(d3(sourceKnot.TC).response).content;

					if (knotInstance.requestCallbackId && knotInstance.requestCallbackId !== "none" && processingCallbacks[knotInstance.requestCallbackId]) {
						try {
							finalpromptMessage = applyResponseCallback(finalpromptMessage, sourceResponseContent, { knot: knotReference }, knotInstance.requestCallbackId);
						} catch (e) {
							if (typeof processingCallbacks[knotInstance.requestCallbackId] === 'function') {
								finalpromptMessage = processingCallbacks[knotInstance.requestCallbackId](finalpromptMessage, sourceResponseContent, { knot: knotReference });
							} else {
								finalpromptMessage += "\n\n" + sourceResponseContent;
							}
						}
					} else {
						finalpromptMessage += "\n\n" + sourceResponseContent;
					}
				}
			}
		}
	} else if (knotInstance.knotType && knotInstance.knotType.startsWith('USER_PROMPT')) {
		if (knotInstance.requestCallbackId && knotInstance.requestCallbackId !== "none" && processingCallbacks[knotInstance.requestCallbackId]) {
			try { finalpromptMessage = processingCallbacks[knotInstance.requestCallbackId](finalpromptMessage, {}, { knot: knotReference }); } catch (e) { }
		}
	} else {
		if (rules && rules.hasRequestCallback && processingCallbacks[rules.requestCallback] && performCallbacks) {
			const requestProcessor = processingCallbacks[rules.requestCallback];
			finalpromptMessage = requestProcessor(finalpromptMessage);
		}
	}

	//XX34push prompt to messages[] 
	messagehist.push({ role: promptMessage.role, content: finalpromptMessage });

	const isToolCapable = rules ? (rules.supportstools === "true" || rules.supportstools === true) : true;
	const requestData = buildOllamaRequestData(modelch, messagehist, isToolCapable, getDefinedTools());

	//2. Process the Request and stream response ---
	knotInstance.executionStatus = ExecutionStatus.WORKING;
	let finalChunkData = null; //stores the final chunk done=true 
	try {
		//reset the call's response content before streaming. 
		//XX34fetch response 
		const responseMessage = d2(threeCellInstance.response);
		responseMessage.content = "";

		const payloadString = JSON.stringify(requestData);
		// console.log(`[coreOllamaRequestHTC] 📨 Dispatching fetch for Knot ${knotReference}`);
		// console.log(`[coreOllamaRequestHTC] 📏 Payload Size: ${payloadString.length} chars. Total Messages: ${requestData.messages.length}`);
		// console.log(`[coreOllamaRequestHTC] 📦 Raw Payload Object:`, requestData);

		const response = await fetch('/api/chat.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payloadString });
		//XXX /api/chat.php for natively routed Apache deployments
		if (response.status === 202) {
			// Wait 3 seconds gracefully if proxy token queue is fully saturated
			await new Promise(resolve => setTimeout(resolve, 3000));
			return await coreOllamaRequestHTC(knotReference, skipHistoryUpdate, overridePromptRegId, performCallbacks);
		}

		if (!response.ok) {
			if (response.status === 429) {
				console.log("[api.js] Received 429 native overload inside HTC. Waiting 10s then retrying...");
				await new Promise(resolve => setTimeout(resolve, 10000));
				return await coreOllamaRequestHTC(knotReference, skipHistoryUpdate, overridePromptRegId, performCallbacks);
			}
			const errorText = await response.text();
			throw new Error(`CORXXX1 Ollama API request failed: ${response.status} - ${errorText}`);
		}
		if (!response.body) {
			throw new Error('CORXXX1 ollama API response body is null.');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let streamDone = false;
		let buffer = '';
		let receivedToolCalls = [];
		while (!streamDone) {
			const { done, value } = await reader.read();
			if (done) {
				if (buffer != '') {
					try {
						let parsedLine = JSON.parse(buffer);
						if (parsedLine.message?.content) {
							receivedContent += parsedLine.message.content;
						}


						if (Array.isArray(parsedLine.message?.tool_calls)) {
							receivedToolCalls.push(...parsedLine.message.tool_calls);
						} else if (Array.isArray(parsedLine.tool_calls)) {
							receivedToolCalls.push(...parsedLine.tool_calls);
						}


						if (parsedLine.done === true) {
							streamDone = true;
							finalChunkData = parsedLine;
						}
					} catch (e) {
						console.warn(`stream in coreRequestTC imcomplete=${buffer}`);
					}
				}
				streamDone = true;
				break;
			}

			const chunkText = decoder.decode(value, { stream: true });
			buffer += chunkText;
			const lines = buffer.split('\n');
			buffer = lines.pop();

			lines.forEach(line => {
				if (!line.trim() || !line.trim().startsWith('{')) return;
				try {
					const parsedLine = JSON.parse(line);
					if (parsedLine.message?.content) {
						//stream response directly into the three cell response object
						responseMessage.content += parsedLine.message.content;
					}
					//capture the final data chunk when done is true
					if (parsedLine.done === true) {
						finalChunkData = parsedLine;
					}
				} catch (e) {
					console.warn("coreOllamaRequestTC: couldn't not parse JSON line", line, e);
				}
			});
			//plaseholder for UI updata during streaming if needed. 
		}//end whlie loop.

		//3. finalize turn and calculate tokens --- 

		if (!skipHistoryUpdate && finalChunkData && DynamicTableState.activeHistory) {
			logTurnToActiveHistory(knotReference);
			const historyTrack = DynamicTableState.activeHistory;
			const lastIndex = historyTrack.sequence.length - 1;

			if (lastIndex >= 0) {
				calculateAndStoreFourRowTokens(historyTrack.RegId, lastIndex, finalChunkData);

				// Handle prompt override in history
				if (overridePromptRegId !== null) {
					const historyKnot = k1(historyTrack.sequence[lastIndex]);
					const hCell = d3(historyKnot.TC);
					const overP = d2(overridePromptRegId);
					const hp = d2(hCell.prompt);
					if (hCell && hp && overP) {
						hp.role = overP.role;
						hp.content = overP.content;
					}
				}
			}
		} else if (finalChunkData) {
			// Internal update for the scenario knot itself if not logging to history
			calculateAndStoreFourRowTokens(knotInstance.parentTrackId, knotInstance.parentRowIndex || 0, finalChunkData);
		}

		let finalContent = responseMessage.content;
		let parsedJson = {};
		try {
			// Leverage existing helper to find JSON in potential markdown/chatter
			const extracted = extractJsonObject(finalContent);
			if (extracted && extracted.length > 0) parsedJson = extracted[0];
		} catch (e) {
			console.warn("[api.js] Failed to extract JSON from response:", e);
		}

		// Determine which callback to use (Knot-specific has precedence over Model-global)
		const callbackId = (knotInstance.responseCallbackId && knotInstance.responseCallbackId !== "none")
			? knotInstance.responseCallbackId
			: (rules && rules.hasResponseCallback) ? rules.responseCallback : null;

		if (callbackId && processingCallbacks[callbackId] && performCallbacks) {
			// console.log(`[api.js] 🔍 DEBUG: Triggering response callback: ${callbackId} for Knot: ${knotReference} \n [api.js] 🔍 DEBUG: Parsed JSON available: ${!!parsedJson}`);
			try {
				const contextObj = { knot: knotReference, htcAddr: wdl_getHTCaddr(knotReference) };
				finalContent = processingCallbacks[callbackId](finalContent, parsedJson, contextObj);
				// console.log(`[api.js] 🔍 DEBUG: Callback "${callbackId}" finished.`);
				responseMessage.content = finalContent;

				// Re-render UI block to show post-processed changes
				const mdparser2 = new DOMParser();
				const responseContentDom2 = document.getElementById(`content-${threeCellInstance.id}-response`);
				if (responseContentDom2 && typeof md !== "undefined") {
					responseContentDom2.innerHTML = mdparser2.parseFromString(md.render(finalContent), 'text/html').body.innerHTML;
				}
			} catch (e) {
				console.error(`[WDL Callback Engine] Error executing callback ${callbackId}`, e);
			}
		}

		if (typeof window.recoalesceAndRenderAll === 'function') { window.recoalesceAndRenderAll(); }

		// Trigger running summarization for the parent track (fire-and-forget)
		if (parentTrack && typeof updateTrackSummary === 'function') {
			updateTrackSummary(parentTrack.RegId).catch(e => console.warn('[Summarizer]', e.message));
		}

		// TOOL EXECUTION RECURSION
		if (receivedToolCalls && receivedToolCalls.length > 0) {
			console.log("Tools requested by model. Resolving natively...");
			messagehist.push({ role: 'assistant', content: finalChunkData.message?.content || "", tool_calls: receivedToolCalls });
			responseMessage.content += `\n\n[EXECUTING ${receivedToolCalls.length} TOOLS...]\n`;
			if (typeof window.recoalesceAndRenderAll === 'function') { window.recoalesceAndRenderAll(); }

			let toolResults = [];
			for (const tc of receivedToolCalls) {
				const funcName = tc.function?.name;
				const funcArgs = tc.function?.arguments || {};
				const toolDef = getDefinedTools()[funcName];
				const resStr = await executeToolSafely(toolDef, funcArgs, funcName);
				toolResults.push({ role: 'tool', content: resStr });
				responseMessage.content += `[Tool ${funcName} Output]: ${resStr}\n`;
			}
			if (typeof window.recoalesceAndRenderAll === 'function') { window.recoalesceAndRenderAll(); }

			messagehist.push(...toolResults);

			// Recurse to pass tool results back to LLM
			console.log("Tool execution finished, passing results back to LLM.");
			responseMessage.content += "\n[Awaiting Model Synthesis...]\n";
			const recursionData = buildOllamaRequestData(modelch, messagehist, isToolCapable, getDefinedTools());
			const subsequentResponse = await coreOllamaRequestKTC(knotInstance.TC, recursionData);
			// KTC helper automatically appended content into responseMessage.content for us

		}

		knotInstance.executionStatus = ExecutionStatus.DONE;
		return true;
	} catch (error) {
		knotInstance.executionStatus = ExecutionStatus.FAILED;
		console.error("error in coreOllama request", error);
		const responseMessage = d2(threeCellInstance.response);
		responseMessage.content = `[error ${error.message}]`;
		return false;
	}

}


/**
 * The pure plainjane core request function for a single knot's turn. Its only job is to take prepared request data, send it to the ollma API, 
 * stream the response into the target THreeCell's response object. 
 * and return the final complete response from the API. 
 * @param {number} targetThreeCellId - the regid of the three_Cell to stream the response into. 
 * @param {object} requestData - the complete data payload for the Ollama API
 * @param {AbortSignal} signal - optional AbortSignal for early cancellation
 * @returns {Promise<object>} a promise that resolves to the final assistant message object from the API. 
 */

export async function coreOllamaRequestKTC(targetThreeCellId, requestData, signal = null) {
	const threeCellInstance = d3(targetThreeCellId);

	if (!threeCellInstance) {
		throw new Error(`KTC coreollamarequestKTC fail no 3cell found ${targetThreeCellId}`);
	}
	let finalResponseObject = null;
	try {
		const responseMessage = d2(threeCellInstance.response);
		responseMessage.content = "";
		//23/feb/2026
		const fetchOptions = {
			method: 'POST',
			headers: { 'Content-Type': 'application/JSON' },
			body: JSON.stringify(requestData)
		};
		if (signal) fetchOptions.signal = signal;

		const response = await fetch('/api/chat.php', fetchOptions);

		if (response.status === 202) {
			await new Promise(resolve => setTimeout(resolve, 3000));
			return await coreOllamaRequestKTC(targetThreeCellId, requestData, signal);
		}

		if (!response.ok) {
			if (response.status === 429) {
				console.log("[api.js] Received 429 native overload inside KTC. Waiting 10s then retrying...");
				await new Promise(resolve => setTimeout(resolve, 10000));
				return await coreOllamaRequestKTC(targetThreeCellId, requestData, signal);
			}
			const errorText = await response.text();
			throw new Error(`Ollama API request failed ${response.status} = ${errorText}`);
		}
		if (!response.body) {
			throw new Error(`ollama API response body is null.`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let streamDone = false;

		while (!streamDone) {
			const { done, value } = await reader.read();
			if (done) {
				streamDone = true;
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop();

			lines.forEach(line => { // thing function here 
				if (!line.trim() || !line.trim().startsWith('{')) return;
				try {
					const parsedLine = JSON.parse(line);
					if (parsedLine.message?.content) {
						responseMessage.content += parsedLine.message.content;
					}
					if (parsedLine.done === true) {
						//the final chunk contains the full response object and metrics
						finalResponseObject = {
							role: 'assistant',
							content: responseMessage.content,
							//
							prompt_tokens: parsedLine.prompt_eval_count,
							response_tokens: parsedLine.eval_count
						};
					}
				} catch (e) {
					console.warn("KTC coreOllamarequestKTC could not parse JSON line: ", line, e);
				}
			});
		}
		if (!finalResponseObject) {
			finalResponseObject = { role: 'assistant', content: responseMessage.content };
		}
		return finalResponseObject;
	} catch (err) {
		console.error("error in core Ollama request TC:", err);
		d2(threeCellInstance.response).content = `[CORE_ERROR: ${err.message}]`;
		throw err;//rethrow err for caller quechuy. 
	}
}


// Main function to populate modeloptions
export async function populateModelOptions() {
	try {
		const CACHE_KEY = "modeloptions_cache";
		const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000; // 6 hours

		// 1. Check Cache First
		const cachedDataStr = localStorage.getItem(CACHE_KEY);
		if (cachedDataStr) {
			try {
				const cachedData = JSON.parse(cachedDataStr);
				const now = Date.now();
				if (cachedData.Recent_Time && (now - cachedData.Recent_Time < CACHE_EXPIRY_MS) && cachedData.modeloptions) {
					console.log(`[populateModelOptions] Loading from cache (age: ${Math.round((now - cachedData.Recent_Time) / 60000)} mins)`);
					setModelOptions(cachedData.modeloptions);
					updateModelDOM(cachedData.modeloptions);
					return modeloptions;
				} else {
					console.log(`[populateModelOptions] Cache expired. Fetching fresh data.`);
				}
			} catch (e) {
				console.warn(`[populateModelOptions] Cache parse error, bypassing cache.`, e);
			}
		}

		//2. Network Fetch (If cache miss or expired)
		const tagsResponse = await fetch("/api/tags.php");
		if (!tagsResponse.ok) {
			console.warn("tags failed:", tagsResponse.status);
			return modeloptions; // return existing if fetch fails
		}
		const input = await tagsResponse.text();
		console.log(`from populateModelOptions ${typeof input} is ${input}`);
		const modells = JSON.parse(input);

		// Build a fresh object to replace the hardcoded defaults entirely
		var freshModelOptions = {};

		for (const model of modells.models) {
			let ctxNum = model.ctx_num || 4096; // Retrieve the server-augmented context integer using the newly structured PHP Cache.

			freshModelOptions[model.name] = {
				value: `${model.name}`,
				hardmaxctx: `${ctxNum}`,
				supportstools: "true",
				doesThinking: "false",
				ctx_num: ctxNum
			};
		}

		// Replace global with server truth (no duplicates)
		setModelOptions(freshModelOptions);
		console.log(`populateModelOptions: replaced with ${Object.keys(freshModelOptions).length} models`);

		// 3. Save to Cache
		try {
			const cacheObj = {
				Recent_Time: Date.now(),
				modeloptions: freshModelOptions
			};
			localStorage.setItem(CACHE_KEY, JSON.stringify(cacheObj));
		} catch (e) {
			console.warn(`[populateModelOptions] Failed to save to localStorage cache:`, e);
		}

		// Update DOM
		updateModelDOM(freshModelOptions);

		return modeloptions;
	} catch (error) {
		console.error("❌ Critical error:", error);
		return modeloptions;
	}
}

// Helper to update the UI dropdown
function updateModelDOM(optionsObj) {
	const modelInput = document.getElementById('modelSel');
	if (modelInput) {
		modelInput.innerHTML = '';
		for (var k3y in optionsObj) {
			if (optionsObj.hasOwnProperty(k3y)) {
				var option = document.createElement('option');
				option.value = optionsObj[k3y].value;
				option.textContent = k3y;
				option.setAttribute('data-supports-tools', optionsObj[k3y].supportstools || "true");
				option.setAttribute('data-hardmaxctx', optionsObj[k3y].hardmaxctx || "4096");
				modelInput.appendChild(option);
			}
		}
		// Trigger change to update UI state dependent on model
		modelInput.dispatchEvent(new Event('change'));
	}

	// Broadcast options to all dynamically spawned knot selectors
	const allSelectors = document.querySelectorAll('.cell-model-selector');
	allSelectors.forEach(select => {
		const currentVal = select.value || (modelInput ? modelInput.value : '');
		select.innerHTML = '';
		for (var key in optionsObj) {
			if (optionsObj.hasOwnProperty(key)) {
				var opt = document.createElement('option');
				opt.value = optionsObj[key].value;
				opt.textContent = key;
				select.appendChild(opt);
			}
		}
		select.value = currentVal;
	});
}

