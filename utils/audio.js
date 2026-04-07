
// ═══════════════════════════════════════════════════════════════
// 7 Major Arpeggios (A B C D E F G) — file-global scope
// Each object: { name, notes[], count }
// ═══════════════════════════════════════════════════════════════

export const Arpeggio_A = { name: 'A Major', notes: ['A4', 'C#5', 'E5', 'A5', 'E5', 'C#5', 'A4'], count: 7 };
export const Arpeggio_B = { name: 'B Major', notes: ['B4', 'D#5', 'F#5', 'B5', 'F#5', 'D#5', 'B4'], count: 7 };
export const Arpeggio_C = { name: 'C Major', notes: ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4'], count: 7 };
export const Arpeggio_D = { name: 'D Major', notes: ['D4', 'F#4', 'A4', 'D5', 'A4', 'F#4', 'D4'], count: 7 };
export const Arpeggio_E = { name: 'E Major', notes: ['E4', 'G#4', 'B4', 'E5', 'B4', 'G#4', 'E4'], count: 7 };
export const Arpeggio_F = { name: 'F Major', notes: ['F4', 'A4', 'C5', 'F5', 'C5', 'A4', 'F4'], count: 7 };
export const Arpeggio_G = { name: 'G Major', notes: ['G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4'], count: 7 };

// ═══════════════════════════════════════════════════════════════
// Abstract playSound — plays any arpeggio object
// ═══════════════════════════════════════════════════════════════

/**
 * Plays a given arpeggio object through Tone.js.
 * @param {object} arpeggioObj - One of the 7 arpeggio objects above (or any { notes, count } shape).
 * @param {string} noteDuration - Tone.js duration per note, default "8n".
 * @param {string} stepInterval - Tone.js interval between sequence steps, default "4n".
 */
export function playSound(arpeggioObj, noteDuration = "8n", stepInterval = "4n") {
	if (typeof Tone === 'undefined') {
		console.warn('[audio] Tone.js not loaded');
		return;
	}

	const synth = new Tone.Synth().toDestination();
	const arpegSeq = new Tone.Sequence((time, note) => {
		synth.triggerAttackRelease(note, noteDuration, time);
	}, arpeggioObj.notes, stepInterval);

	arpegSeq.loop = false;
	Tone.Transport.loop = false;

	if (Tone.Transport.state === 'stopped') {
		Tone.Transport.position = 0;
	}

	Tone.Transport.start();
	arpegSeq.start();
	arpegSeq.onstop = () => {
		Tone.Transport.stop();
	};
}

// ═══════════════════════════════════════════════════════════════
// Legacy wrapper — preserves existing callsites
// ═══════════════════════════════════════════════════════════════

export function playCompletionSound(status = 'success') {
	if (typeof Tone === 'undefined') {
		console.warn('tone.js not loaded');
		return;
	}

	if (status === 'success') {
		playSound(Arpeggio_A);
	} else {
		const synth = new Tone.Synth().toDestination();
		const now = Tone.now();
		synth.triggerAttackRelease("C3", "8n", now);
		synth.triggerAttackRelease("A5", "8n", now);
	}
}