/**
 * Audio via the Web Speech API. Quality depends on the device's Hindi voice
 * (Windows, Android and iOS ship one; some browsers have none). The UI only
 * offers audio when a Hindi voice exists, and never presents synthesized
 * speech as authoritative pronunciation.
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

export function hindiVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  if (!voices.length) refresh();
  return voices.find((v) => /^hi([-_]|$)/i.test(v.lang)) ?? voices.find((v) => /hindi/i.test(v.name)) ?? null;
}

export function audioAvailable(): boolean {
  return hindiVoice() !== null;
}

export function speak(text: string, rate = 0.9): boolean {
  const v = hindiVoice();
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
