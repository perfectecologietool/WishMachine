import { ActiveKeychain, setGlobalSuccessSignalFlag } from '../core/state.js';
import { Keychain } from '../models/QuipuModels.js';

export function renderActiveQuipu() {
    setGlobalSuccessSignalFlag(false);
    if (ActiveKeychain) {
        ActiveKeychain.yieldElement('keychain-container');
        if (typeof qdlShadowUpdate === 'function') qdlShadowUpdate();
    } else {
        console.error("Cannot render: window.ActiveKeychain is not defined.");
    }
}

export function saveKeychain() {
    if (ActiveKeychain) {
        document.getElementById('quipu-save-load-area').value = ActiveKeychain.getJSONstring();
    }
}

export function loadKeychain() {
    if (ActiveKeychain) {
        const xd3 = document.getElementById('quipu-save-load-area').value;
        const newKeychain = Keychain.fromJSON(xd3);
        // Note: You need a setter in main/state to update the global ActiveKeychain reference safely
        window.ActiveKeychain = newKeychain; 
        renderActiveQuipu();
    }
}

export function downloadKeychain() {
	if (!window.ActiveKeychain) {
		alert('No ActiveKeychain to download.');
		return;
	}
	const jsonStr = window.ActiveKeychain.getJSONstring();
	const blob = new Blob([jsonStr], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `Keychain_${Date.now()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	console.log(`[downloadKeychain] Downloaded as ${a.download}`);
}	