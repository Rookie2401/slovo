import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { db } from '../database/db';
import { getSettings } from '../database/settings';
import { chosen, type SentenceAnalysis } from '../morphology/sentence';

/**
 * Optional language-model layer. It receives the deterministic analysis and
 * may only phrase, explain, compare and translate. It may NOT change lemma,
 * gender, morphology, pronunciation or the text; the schema below has no
 * fields for those, and the result is stored as `analysis_source: 'ai'` with
 * a low priority, beneath every deterministic layer and every correction.
 * The API key is entered by the reader in Settings and used only for a
 * direct browser → Anthropic request; this app never sees or stores it
 * anywhere else.
 */

const ExplanationSchema = z.object({
  natural: z.string().min(1),
  literal: z.string().min(1),
  points: z.array(z.object({ topic: z.string(), text: z.string() })).max(10),
  alternatives: z.array(z.string()).max(4).optional(),
  ru_simple: z.string().optional(),
  uncertainty: z.string().optional(),
});
export type AiExplanation = z.infer<typeof ExplanationSchema>;

function describeAnalysis(a: SentenceAnalysis): string {
  const lines: string[] = [];
  for (const t of a.tokens) {
    const c = chosen(t);
    if (!c || t.kind !== 'word') continue;
    lines.push(`${t.text}: ${c.lemma} (${c.pos}) ${JSON.stringify(c.features)} gloss="${c.gloss}"${t.glossInContext ? ' in-context=' + t.glossInContext : ''}${t.notes.length ? ' notes=' + t.notes.join('; ') : ''}${t.ambiguous ? ' [AMBIGUOUS]' : ''}`);
  }
  for (const c of a.constructions) lines.push(`CONSTRUCTION ${c.type} ${c.pattern}: "${c.tokens.map((i) => a.tokens[i]!.text).join(' ')}" = ${c.gloss}. ${c.explanation}`);
  for (const cl of a.clauses) {
    if (cl.agreement) lines.push(`AGREEMENT: ${cl.agreement.explanation}`);
    if (cl.aspect) lines.push(`ASPECT: ${cl.aspect.explanation} ${cl.aspect.contrast ?? ''}`);
    if (cl.wordOrder) lines.push(`WORD ORDER: ${cl.wordOrder}`);
  }
  return lines.join('\n');
}

const SYSTEM = `You are the explanation layer of a Russian reading app ("Слово"). You receive a Russian sentence (Dostoevsky, Tolstoy or one of Tolstoy's graded readers) and a DETERMINISTIC linguistic analysis produced by rule-based engines. Your job is to help a learner understand the sentence.

Rules you must follow:
- Do not change or dispute the given morphology (lemma, gender, number, case, aspect, verb form) unless it is marked [AMBIGUOUS]; then say "Two analyses are possible" and describe both briefly in the "alternatives" field.
- Never invent a root, a gender, a stress position or an etymology. Never alter the Russian text.
- Explain WHY the grammar works as it does (case government, aspect choice, agreement, word order, reflexive -ся, impersonal constructions) in plain language, using the given notes.
- "natural": a smooth English rendering. "literal": a structurally transparent rendering that keeps the Russian word order and shows cases/aspect, e.g. "I-NOM saw-PFV him-ACC".
- "points": 3–7 short grammar points a learner should notice, each with a topic (subject, aspect, case, agreement, word order, idiom, construction).
- If asked for a simple-Russian paraphrase, put it in "ru_simple".
- If anything is uncertain, say so in "uncertainty".
Respond with JSON only.`;

export function aiEnabled(): boolean {
  return getSettings().claudeKey.trim().length > 10;
}

export async function explainSentence(text: string, a: SentenceAnalysis, opts: { ruSimple?: boolean } = {}): Promise<AiExplanation> {
  const s = getSettings();
  if (!s.claudeKey) throw new Error('No Claude API key set in Settings.');
  const client = new Anthropic({ apiKey: s.claudeKey, dangerouslyAllowBrowser: true });
  const res = await client.messages.create({
    model: s.claudeModel || 'claude-opus-5',
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Sentence: ${text}\n\nAnalysis:\n${describeAnalysis(a)}\n\n${opts.ruSimple ? 'Also provide ru_simple.' : ''}\nReturn JSON with keys natural, literal, points, alternatives?, ru_simple?, uncertainty?.` }],
  });
  const raw = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const parsed = ExplanationSchema.safeParse(JSON.parse(jsonText));
  if (!parsed.success) throw new Error('The model returned an unexpected shape.');
  return parsed.data;
}

export async function saveExplanation(bookId: number, sentenceId: number, e: AiExplanation): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.translations, db.explanations], async () => {
    const olderT = await db.translations.where('sentence_id').equals(sentenceId).filter((r) => !r.superseded).toArray();
    for (const t of olderT) await db.translations.update(t.id!, { superseded: true, review_status: 'superseded' });
    await db.translations.add({ book_id: bookId, sentence_id: sentenceId, natural: e.natural, literal: e.literal, analysis_version: 0, engine_version: 'ai', analysis_source: 'ai', confidence: 0.6, review_status: 'unreviewed', created_at: now });
    const olderE = await db.explanations.where('[target_type+target_id]').equals(['sentence', sentenceId]).filter((r) => !r.superseded).toArray();
    for (const x of olderE) await db.explanations.update(x.id!, { superseded: true, review_status: 'superseded' });
    await db.explanations.add({ book_id: bookId, target_type: 'sentence', target_id: sentenceId, language: 'en', text: e.uncertainty ? `Uncertainty: ${e.uncertainty}` : '', points: e.points, analysis_version: 0, engine_version: 'ai', analysis_source: 'ai', confidence: 0.6, review_status: 'unreviewed', created_at: now });
    if (e.ru_simple) await db.explanations.add({ book_id: bookId, target_type: 'sentence', target_id: sentenceId, language: 'ru-simple', text: e.ru_simple, analysis_version: 0, engine_version: 'ai', analysis_source: 'ai', confidence: 0.6, review_status: 'unreviewed', created_at: now });
  });
}

export async function loadExplanation(sentenceId: number): Promise<AiExplanation | null> {
  const t = await db.translations.where('sentence_id').equals(sentenceId).filter((r) => !r.superseded).first();
  if (!t) return null;
  const es = await db.explanations.where('[target_type+target_id]').equals(['sentence', sentenceId]).filter((r) => !r.superseded).toArray();
  const en = es.find((e) => e.language === 'en');
  const ru = es.find((e) => e.language === 'ru-simple');
  return { natural: t.natural, literal: t.literal, points: en?.points ?? [], ru_simple: ru?.text, uncertainty: en?.text?.replace(/^Uncertainty: /, '') || undefined };
}
