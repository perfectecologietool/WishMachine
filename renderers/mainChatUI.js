import { modeloptions } from '../core/constants.js';
import { buildOllamaRequestData, coreOllamaRequest } from '../services/api.js';
import { getDefinedTools } from './toolsUI.js';

let messageHistory = [];

// DOM References
const getPromptInput = () => document.getElementById('prompt');
const getSendButton = () => document.getElementById('send');
const getResponseDiv = () => document.getElementById('response');
const getMessageHistoryStackDiv = () => document.getElementById('messageHistoryStack');
const getModelInput = () => document.getElementById('modelSel');
const getNumCtxSlider = () => document.getElementById('numCtxSlider');
const getToolOutputArea = () => document.getElementById('tool_output_area');
const getStatusDiv = () => document.getElementById('status');

export function reconstructMessagesFromStack(){
	const messagesToSend = [];
	const messageHistoryStackDiv = getMessageHistoryStackDiv();
	// console.log("reconstructing messages for sending. current canonical history");
	for(let i = 0; i < messageHistory.length; i++){
		const originalMessage = messageHistory[i];
		const textareaElement = messageHistoryStackDiv ? messageHistoryStackDiv.querySelector(`textarea[data-message-index="${i}"]`) : null;
 		let currentContent = originalMessage.content;
		if(textareaElement){
			currentContent = textareaElement.value; 
		} else if (originalMessage.role !== 'system'){
			console.warn(`textarea not found for message index ${i} role${originalMessage.role}. `);
	    }
	    let cont3; 
	    if (originalMessage.role === 'assistant' && Array.isArray(originalMessage.tool_calls) && originalMessage.tool_calls.length > 0 && currentContent === "") {
		    cont3 = null;
	    } else { cont3 = currentContent;}
	
	    const messageForApi = {
		    role: originalMessage.role, 
	        content: cont3 
        };
	    if(originalMessage.role === 'assistant' && Array.isArray(originalMessage.tool_calls) && originalMessage.tool_calls.length > 0) {
		    messageForApi.tool_calls = originalMessage.tool_calls;
	    }
	    messagesToSend.push(messageForApi);
	}
	return messagesToSend;
}

async function handleSendPrompt( ){ 
    // console.log("handleSendPrompt #1");
    const modelInput = getModelInput();
    const promptInput = getPromptInput();
    const numCtxSlider = getNumCtxSlider();
    const toolOutputArea = getToolOutputArea();
    const statusDiv = getStatusDiv();
    const sendButton = getSendButton();

    const selectedOption = modelInput.options[modelInput.selectedIndex]; 
    const model = modelInput.value.trim();
    const toolCapable = selectedOption && selectedOption.dataset.supportsTools === 'true';
    const userPrompt = promptInput.value.trim();
    const numCtx = numCtxSlider ? parseInt(numCtxSlider.value, 10) : 4096;

    if (!model || !userPrompt){
	    // console.log('handleSendPrompt() ERROR =please enter borht a model name and a prompt.');
	    return;
	}
	let newUserMessage;
	if (userPrompt){
		newUserMessage = {role: 'user', content: userPrompt, individual_tokens: null, aggregate_tokens: null };
		promptInput.value = '';
	} else if (messageHistory.length === 0){
		// console.log("cannot send empty prompt with no history;");
		return;
	}
	if (toolOutputArea) toolOutputArea.textContent = '';
	if (statusDiv) statusDiv.textContent = "preparing history and sending to ollama";
	if (sendButton) sendButton.disabled = true;
	
	// console.log("reconstructmessagesfromstack");
	const messagesToSend = reconstructMessagesFromStack();
	await sendMessagesToOllama(model, messagesToSend, toolCapable , newUserMessage );
}

async function SaveMessageHistory(messageHist = {}){ 
    try{
	    const historyJsonString = JSON.stringify(messageHistory, null, 2);
	    const response = await fetch('/saveHistory', {
		    method: 'POST', 
		    headers: {'Content-Type': 'application/json',},
		    body: historyJsonString,
	    });
	    if(response.ok){
		    // console.log("save history successful");
	    } else {
		    // console.log('error saving history');
	    }
    } catch(err){
		// console.log('error in SAVEHistory');
    }
}
	
export async function handleSaveHistory(){
	const statusDiv = getStatusDiv();
    const saveHistoryBut = document.getElementById('saveHistoryButton');
	if(messageHistory.length === 0 ){
		if (statusDiv) statusDiv.textContent = "conversationHistory is empty. nothing to save.";
		return;
	}
	if (statusDiv) statusDiv.textContent = "MainChat: saving conversationhistory"
	if (saveHistoryBut) saveHistoryBut.disabled = true;
	try {
		await SaveMessageHistory(messageHistory);
	} catch (err) {
		// console.log(` error saving conversation history ${err.message}`);
	} finally {
		if (saveHistoryBut) saveHistoryBut.disabled = false;
	}  
}

export function initMainChatUI() {
    const sendBtn = getSendButton();
    const saveBtn = document.getElementById('saveHistoryButton');
    
    if (sendBtn) sendBtn.addEventListener('click', handleSendPrompt);
    if (saveBtn) saveBtn.addEventListener('click', handleSaveHistory);
}

