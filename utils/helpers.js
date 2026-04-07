/**
 * A simple templating function to inject data into prompt templates.
 * @param {string} templateString - The template, e.g., "Combine this: {{INPUT_A}} and {{INPUT_B}}".
 * @param {object} dataObject - The data, e.g., { INPUT_A: "text1", INPUT_B: "text2" }.
 * @returns {string} The interpolated string.
 */
export function interpolatePrompt(templateString, dataObject) {
	let result = { "INPUT": templateString };

	for (const key in dataObject) {
		result.INPUT = result.INPUT.replace(new RegExp(`{{${key}}}`, 'g'), dataObject[key]);
	}
	return result.INPUT;
}



/**
 * Extracts and returns only the code blocks fenced by triple backticks (```).
 * @param {string} text - The input text containing Markdown code blocks.
 * @returns {string} The collected code snippets joined by double newlines.
 */
export function extractCodeBlocks(text) {
	if (typeof text !== 'string' || !text) { return ""; }
	//regex = between ``` and ```, optionally skipping a language hint on the first line
	var regex1 = /```(?:[^\n]*?\n)?([\s\S]*?)```/gs;
	var matches = text.matchAll(regex1);
	var codeSnippets = [];
	for (const match of matches) {
		if (match[1]) {
			codeSnippets.push(match[1].trim());
		}
	}
	
	if (codeSnippets.length === 0) {
		return truncateThinkingTags(text);
	}
	
	return codeSnippets.join("\n\n");
}

/**
 * Parses a string to find and remove all <think> tags and their inner text.
 * Designed to clean up the model's response before it is used in context.
 *
 * @param {string} text - The input string which may contain one or more thinking tags.
 * @returns {string} The string with all think blocks and content removed.
 */
export function truncateThinkingTags(text) {
	//1. perform defensive check? 
	if (typeof text !== 'string' || !text) { return `${typeof text}=${JSON.stringify(text)}`; }
	//2. regex is core of function .  *? makes the match 'non-greedy' 
	const reg3x = /<think>[\s\S]*?<\/think>/g;
	var xd3 = text.replace(reg3x, '').trim();
	//the replace  method. 
	return xd3;
}


/**
 * Extracts and parses ALL valid json objects found sequentially within the string. 
 * Supports fallback regex correction for malformed single quotes if parsing fails initially.
 *
 * @param {string} str - The input string containing JSON structures to extract.
 * @returns {Array<object>} An array of parsed JSON objects.
 */
export function extractJsonObject(str) {
	const jsonObjects = [];
	let openBrackets = 0;
	let startIndex = -1;
	for (let i = 0; i < str.length; i++) {
		const char = str[i];
		if (char === '{') {
			if (openBrackets === 0) {
				startIndex = i;
			}
			openBrackets++;
		} else if (char === '}') {
			if (openBrackets > 0) {
				openBrackets--;
			}
			if (openBrackets === 0 && startIndex !== -1) {
				const potentialJson = str.substring(startIndex, i + 1);
				try {
					// First, try parsing the raw extracted JSON (it might already be perfectly valid)
					jsonObjects.push(JSON.parse(potentialJson));
				} catch (err1) {
					try {
						// Fallback: Attempt to fix malformed JSON (unquoted keys or single quotes)
						// Note: this replace can break valid strings containing apostrophes, hence we try raw first.
						const fixedJson = potentialJson.replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
						jsonObjects.push(JSON.parse(fixedJson));
					} catch (err2) {
						// Both attempts failed, ignore this block
					}
				}
				startIndex = -1;
			}
		}
	}


	return jsonObjects;
}


export function parseAddressString(inputString) {
	if (!inputString || typeof inputString !== 'string') return [];
	return inputString.split(';').map(addr => addr.trim()).filter(addr => addr.length > 0);
}

export function reverseParseAddress(addrArray) {
	let retval = "";
	if (Array.isArray(addrArray)) {
		addrArray.forEach(eleArray => { retval += `${eleArray};`; });
	}
	return retval;
}