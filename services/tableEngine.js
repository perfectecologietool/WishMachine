import { d2, d3, d4, k1, DynamicTableState } from '../core/state.js';
import { buildOllamaRequestData, coreOllamaRequest } from './api.js';
import { Prompt_engines, modeloptions } from '../core/constants.js';
import { truncateThinkingTags } from '../utils/helpers.js';
import { Four_Row, Three_Cell, Two_Layer } from '../models/WISH.js';

/**
 * Automatically gathers completed cell responses in a Four_Row and updates its summary Three_Cell.
 * @param {number} fourRowRegId
 */
export async function updateTrackSummary(fourRowRegId) {
	const fourRow = d4(fourRowRegId);
	if (!fourRow) return;

	let collated = "";
	for (const knotRegId of fourRow.sequence) {
		const knot = k1(knotRegId);
		const cell = knot ? d3(knot.TC) : null;
		if (!cell) continue;
		const resp = d2(cell.response);
		if (resp && resp.content && resp.content.trim() !== "" && resp.content !== "[Awaiting Response...]" && !resp.content.startsWith("[ERROR")) {
			collated += "---\n" + resp.content + "\n\n";
		}
	}

	if (collated.trim() === "") return;

	const summaryCell = d3(fourRow.summary);
	if (!summaryCell) return;

	// Build prompt from template
	const templateObj = Prompt_engines.find(e => e.name === "Summarization_of_Four_Row");
	if (!templateObj) {
		console.warn("[Summarizer] Template 'Summarization_of_Four_Row' not found.");
		return;
	}

	const promptText = templateObj.string.replace("{{COLLATED_RESPONSES}}", collated);
	d2(summaryCell.prompt).content = promptText;

	// Fire summarization
	const modelVal = document.getElementById('modelSel') ? document.getElementById('modelSel').value : 'llama3.2:3b';
	const requestData = buildOllamaRequestData(modelVal, [{ role: 'user', content: promptText }], false, {}, false);
	try {
		const response = await coreOllamaRequest(requestData);
		d2(summaryCell.response).content = response.content || "";
		console.log(`[Summarizer] Successfully updated summary for track ${fourRow.name}`);
	} catch (e) {
		console.warn(`[Summarizer] Failed to update track summary: ${e.message}`);
		d2(summaryCell.response).content = `[ERROR SUMMARIZING ${e.message}]`;
	}
}

export async function getSummary(textToSummarize, targetThreeCellRegId) {/* helper function 
helps with the process of collating and summarizing text. 
@param {string} textToSummarize - the collated text from the track. 
@param {number} targetThreeCellRegId - the three_Cell to store the summary. 
@returns {promise <boolean>}
*/
	const summaryCell = d3(targetThreeCellRegId);
	if (!summaryCell) throw new Error("SUMMARY CELL NOT FOUND");
	const prompt = `Summarize the following content into a concise description of its core theme or purpose: \n\n ${textToSummarize}`;
	d2(summaryCell.prompt).content = prompt;
	//use a simple, context-free request for summarization
	const modelVal = document.getElementById('modelSel') ? document.getElementById('modelSel').value : 'llama3.2:3b';
	const requestData = buildOllamaRequestData(modelVal, [{ role: 'user', content: prompt }], false, {}, false);
	try {
		const response = await coreOllamaRequest(requestData);
		d2(summaryCell.prompt).content = prompt;
		d2(summaryCell.response).content = response.content;
		return response.content || "";
	} catch (e) {
		const errorMessage = `[ERROR SUMMARZING ${e.message}]`;
		d2(summaryCell.response).content = errorMessage;
		throw new Error(errorMessage);
	}

}


/* calculate token counts on the prompt and response two_layer or complete three cell turn. */
//25jun25
export function calculateAndStoreFourRowTokens(fourRowReference, completedTurnIndex, finalChunkData) {
	const fourRowInstance = d4(fourRowReference);
	console.log(`XX98 inside calculateAnd4rowTokens ${JSON.stringify(finalChunkData)}`);
	if (!fourRowInstance || completedTurnIndex < 0 || !finalChunkData) {
		console.error("calculateAndStoreTokens invalid arguments."); return;
	}
	const promptEvalCount = finalChunkData.prompt_eval_count; //size of messages + response
	const evalCount = finalChunkData.eval_count; //size of response
	if (typeof promptEvalCount !== 'number' || typeof evalCount !== 'number') {
		console.warn("Token counts not available in final response chunk");
		return;
	}
	const completedKnot = k1(fourRowInstance.sequence[completedTurnIndex]);
	const completedTurnCell = completedKnot ? d3(completedKnot.TC) : null;
	if (!(completedTurnCell instanceof Three_Cell)) { console.log(`calculateandstore XX92  `); return; }

	const promptMessage = d2(completedTurnCell.prompt);
	const responseMessage = d2(completedTurnCell.response);
	if (!(promptMessage instanceof Two_Layer) || !(responseMessage instanceof Two_Layer)) {
		console.log(`calculateandstore XX93  `);
		console.log(`calculateandstore XX93   `); return;
	}


	//1. Set toekn counts for the turn's assistant's message. 
	//2. set token counts for the turn's prompt message. this requires deduction. 
	if (completedTurnIndex === 0) {
		//special case: for the very first turn, the prompt_eval_count is it. 
		if (promptMessage.individual_tokens === 0) { promptMessage.individual_tokens = promptEvalCount; }
		promptMessage.aggregate_tokens_at_this_point = promptMessage.individual_tokens;
		responseMessage.individual_tokens = evalCount;
		responseMessage.aggregate_tokens_at_this_point = promptEvalCount + evalCount;

	} else if (completedTurnIndex > 0) {  //completedTurnIndex > 1 
		//general case: for subsequent turns deduce the prompt's size.
		//get the turn before this one to find the previous aggregate total. 
		const prevKnot = k1(fourRowInstance.sequence[completedTurnIndex - 1]);
		const prevTurnCell = prevKnot ? d3(prevKnot.TC) : null;
		if (prevTurnCell instanceof Three_Cell) {
			const prevAggregateTokens = d2(prevTurnCell.response).aggregate_tokens_at_this_point;
			if (typeof prevAggregateTokens === `number`) {
				//the size of this turn's prompt context which includes user.prompt + tool responses.  
				//is the total prompt's Eval context ollama saw minus the aggregate from the previous turn
				promptMessage.individual_tokens = promptEvalCount - prevAggregateTokens;
			} else {
				console.warn("couldn't find previous aggregatetokens to calculate.");
				promptMessage.individual_tokens = 0;
			}
		}

		promptMessage.aggregate_tokens_at_this_point = promptEvalCount;
		//3. finalize the AGGREGATE token count for the assitant repsonse. 
		//this is the aggregate total from the prompt turn + the indivudal tokens. 
		if (typeof promptMessage.aggregate_tokens_at_this_point === 'number') {
			responseMessage.individual_tokens = evalCount;
			responseMessage.aggregate_tokens_at_this_point = promptMessage.aggregate_tokens_at_this_point + evalCount;
			/*
			for(let i = 0; i < completedTurnIndex; i++){
				let curpromind = d2(d3(fourRowInstance.sequence[i]).prompt).individual_tokens;
				let currespind = d2(d3(fourRowInstance.sequence[i]).response).individual_tokens;
			responseMessage.aggregate_tokens_at_this_point += curpromind;
			responseMessage.aggregate_tokens_at_this_point += currespind;
			promptMessage.aggregate_tokens_at_this_point += curpromind;
			promptMessage.aggregate_tokens_at_this_point += currespind;
			}		
			*/

		} else {
			responseMessage.aggregate_tokens_at_this_point = 0;
		}


	}

	console.log(`token updatated for turn at index ${completedTurnIndex}: -prompt:${promptMessage.id}): indivual=${promptMessage.individual_tokens}, aggregate=${promptMessage.aggregate_tokens_at_this_point}\n -response:${responseMessage.id}: individual=${responseMessage.individual_tokens} aggregate=${responseMessage.aggregate_tokens_at_this_point}`);
}


/*
Create the ChatRequest.messages[] array from a Four_Row instance. 
@param fourRowInstance is not coalescedPlan, but historicalRecord of recently sent (i.e: if play is pushed then fourRowInstance is new relative to push of play.) 
@returns array messagesForApi[]{role, content}  

IS FOR ? 
*/
//25jun25
export function reconstructMessagesFromFourRow(fourRowReference) {
	const fourRowInstance = d4(fourRowReference);
	const messagesForApi = [];
	if (!fourRowInstance || !(fourRowInstance instanceof Four_Row)) {
		console.error("invalid argument: a four_row instance is required.");
		return messagesForApi;
	}
	for (const knotRegId of fourRowInstance.sequence) {
		const knot = k1(knotRegId);
		const turn = knot ? d3(knot.TC) : null;
		if (!turn) continue;

		const promptMessage = d2(turn.prompt);
		const responseMessage = d2(turn.response);

		if (promptMessage && promptMessage.content && promptMessage.content !== "[Your turn]") {
			messagesForApi.push({ role: promptMessage.role, content: promptMessage.content });
		} else {
			break;
		}
		var respcontext = responseMessage.content;
		if (responseMessage && respcontext && respcontext !== "[Awaiting Response...]") {
			const modelch = turn.model;
			for (let keyin in modeloptions) {
				if (modeloptions[keyin].value === modelch) {
					if (modeloptions[keyin].doesThinking) {
						respcontext = truncateThinkingTags(respcontext);
					}
				}
			}
			messagesForApi.push({
				role: responseMessage.role,
				content: respcontext
			});
		} else {
			break;
		}
	}
	return messagesForApi;

}


export function logTurnToActiveHistory(knotRegId){
	const knot = k1(knotRegId);
	const originalCell = knot ? d3(knot.TC) : null;
	if(!originalCell){
		console.error(`logTurntoActiveHistory() could not find original cell for knot id ${knotRegId}`);
		return; // Prevent fatal crashes by explicitly returning
	}
	
	const originalPrompt = d2(originalCell.prompt);
	const originalResponse = d2(originalCell.response);
	
	if(!DynamicTableState.activeHistory) return;

	// Add an empty Knot to the active history track (this automatically creates a new Knot, TC, and TwoLayers)
	DynamicTableState.activeHistory.addCell();
	// Access the newly created knot at the end of the sequence
	const newKnotRegId = DynamicTableState.activeHistory.sequence[DynamicTableState.activeHistory.sequence.length - 1];
	const historyKnot = k1(newKnotRegId);
	const historyCell = d3(historyKnot.TC);

	// Synchronize content
	d2(historyCell.prompt).role = originalPrompt.role;
	d2(historyCell.prompt).content = originalPrompt.content;
	d2(historyCell.response).role = originalResponse.role;
	d2(historyCell.response).content = originalResponse.content;
	
	// Synchronize metadata
	historyCell.model = originalCell.model;
	d2(historyCell.prompt).individual_tokens = originalPrompt.individual_tokens;
	d2(historyCell.prompt).aggregate_tokens_at_this_point = originalPrompt.aggregate_tokens_at_this_point;
	d2(historyCell.response).individual_tokens = originalResponse.individual_tokens;
	d2(historyCell.response).aggregate_tokens_at_this_point = originalResponse.aggregate_tokens_at_this_point; // Was bugged to save prompt aggregates
}


/*
takes the current conversationHistory pushes it to archive, and calls render function to update log display.   
*/
export function archiveCurrentConversation(TableState = DynamicTableState) {
//only archive if history has content. 
	//if(ConversationHistory && ConversationHistory.sequence.length > 0){
		//ArchivedConversations.push(ConversationHistory);
		const logser = TableState.scenario.getJSONstring();
		TableState.archivedRuns.push(logser);
		//renderArchivedConversations();
//		TheScenario.parseJSONstring(logser);
	//}
}	