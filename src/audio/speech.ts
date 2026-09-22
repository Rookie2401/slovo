/**
 * Audio via the Web Speech API. Quality depends on the device's Russian voice
 * (Windows, Android and iOS ship one; some browsers have none). The UI only
 * offers audio when a Russian voice exists, and never presents synthesized
 * speech as authoritative pronunciation — pronunciation.pronounce() (package
 * C) with its confidence is the authority; this is a convenience only.
 */
let voices: SpeechSynthesisVoice[] = [];

function refresh(): void {
  if (typeof speechSynthesis === 'undefined') return;
  voices = speechSynthesis.getVoices();
}
if (typeof speechSynthesis !== 'undefined') {
  refresh();
  speechSynthesis.addEventListener?.('voiceschanged', refresh);
}

export function russianVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  if (!voices.length) refresh();
  return voices.find((v) => /^ru([-_]|$)/i.test(v.lang)) ?? voices.find((v) => /russian|русск/i.test(v.name)) ?? null;
}

export function audioAvailable(): boolean {
  return russianVoice() !== null;
}

export function speak(text: string, rate = 0.95): boolean {
  const v = russianVoice();
  if (!v) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  u.rate = rate;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
