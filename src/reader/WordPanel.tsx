import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KnownWord, LearningStatus, MorphFeatures, Sentence, Token } from '../database/types';
import type { Candidate } from '../lexicon';
import { chosen, type AnalyzedToken, type FoundConstruction, type SentenceAnalysis } from '../morphology/sentence';
import { pronounce, practical } from '../pronunciation/translit';
import { audioAvailable, speak } from '../audio/speech';
import { I, IconBtn, Reveal, SOURCE_LABEL, confidenceLabel } from '../ui/components';
import type { Settings } from '../database/settings';
import { AksharaStrip } from './AksharaDetail';
import { Paradigm } from './Paradigm';
import { STATUS_ORDER, STATUS_LABEL, lexemeStats, type LexemeStats } from '../vocabulary';
import { NOUN_CLASS_LABEL } from '../morphology/nouns';
import { CorrectForm } from './CorrectForm';

export function featureWords(f: MorphFeatures, pos: string): string[] {
  const out: string[] = [];
  if (f.gender) out.push(f.gender === 'm' ? 'masculine' : 'feminine');
  if (f.number) out.push(f.number === 'sg' ? 'singular' : 'plural');
  if (f.case) out.push(f.case);
  if (f.person) out.push(`${f.person}${f.person === 1 ? 'st' : f.person === 2 ? 'nd' : 'rd'} person`);
  if (f.honorific) out.push(f.honorific);
  if (f.verb_form) out.push(f.verb_form.replace(/-/g, ' '));
  if (f.tense && pos === 'verb' && !f.verb_form?.includes('aux')) out.push(f.tense);
  if (f.mood && f.mood !== 'indicative' && !f.verb_form) out.push(f.mood);
  if (f.fused_postposition) out.push(`+ ${f.fused_postposition}`);
  return out;
}

const POS_LABEL: Record<string, string> = { noun: 'noun', proper: 'proper noun', pronoun: 'pronoun', adjective: 'adjective', verb: 'verb', adverb: 'adverb', postposition: 'postposition', conjunction: 'conjunction', particle: 'particle', interjection: 'interjection', number: 'numeral', determiner: 'determiner', auxiliary: 'auxiliary', unknown: 'unknown' };

interface Props {
  token: Token;
  sentence: Sentence;
  analysis: SentenceAnalysis;
  at: AnalyzedToken;
  bookId: number;
  chapterId: number;
  status?: KnownWord;
  settings: Settings;
  known: Set<string>;
  onClose: () => void;
  onOpenSentence: () => void;
  onHighlightConstruction: (c: FoundConstruction | null) => void;
  onStatus: (key: string, status: LearningStatus) => void;
  onCorrected: () => void;
}

export function WordPanel(p: Props) {
  const { token, at, analysis, settings, known, status } = p;
  const c = chosen(at);
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [akOpen, setAkOpen] = useState<number | null>(null);
  const [stats, setStats] = useState<LexemeStats | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [pick, setPick] = useState<number>(at.chosen);
  useEffect(() => {
    setLevel(1);
    setAkOpen(null);
    setCorrecting(false);
    setPick(at.chosen);
  }, [token.id, at.chosen]);
  useEffect(() => {
    let alive = true;
    if (!c) return;
    lexemeStats(c.key).then((s) => alive && setStats(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [c?.key, token.id, status?.updated_at]);
  if (!c) return null;
  const cand: Candidate = at.candidates[pick] ?? c;
  const pron = pronounce(token.surface_normalized, cand.entry?.pron);
  const showTranslit = settings.translit !== 'never';
  const cons = analysis.constructions.filter((x) => x.tokens.includes(at.i));
  const beginner = settings.scriptLevel === 'none' || settings.scriptLevel === 'some';
  const feats = featureWords(cand.features, cand.pos);
  const glossCtx = at.glossInContext;
  const isGuess = cand.key.startsWith('?');
  const alternatives = at.candidates.filter((x, i) => i !== at.chosen && (x.lemma !== c.lemma || x.pos !== c.pos || JSON.stringify(x.features) !== JSON.stringify(c.features))).slice(0, 4);

  return (
    <aside className="panel" aria-label="Word">
      <div className="panel__head">
        <span className="label">Word</span>
        {audioAvailable() && <IconBtn label="Play" onClick={() => speak(token.surface_original, settings.speechRate)}>{I.sound}</IconBtn>}
        <IconBtn label="Sentence" onClick={p.onOpenSentence}>{I.sentence}</IconBtn>
        <IconBtn label="Close" onClick={p.onClose}>{I.close}</IconBtn>
      </div>

      {/* Level 1 — immediate meaning */}
      <div className="card__surface dv">{token.surface_original}</div>
      {showTranslit && <div className="card__translit">{settings.translitStyle === 'practical' ? practical(pron.pronunciation) : pron.pronunciation}{pron.confidence < 0.8 && <span title="pronunciation less certain"> ?</span>}</div>}
      {glossCtx && <div className="card__gloss card__gloss--ctx">{glossCtx}</div>}
      <div className="card__gloss">{cand.gloss}</div>
      <div className="card__line"><span className="k">lemma</span><span className="dv">{cand.lemma}</span><span className="soft">· {cand.entry?.gloss ?? cand.gloss}</span></div>
      <div className="card__line"><span className="k">form</span><span>{POS_LABEL[cand.pos] ?? cand.pos}{feats.length ? ' · ' + feats.join(' · ') : ''}</span></div>
      {isGuess && <p className="card__err">Not in the lexicon — the reading above is a guess from the ending ({confidenceLabel(cand.confidence)}).</p>}
      {at.ambiguous && !isGuess && <p className="muted-note">Two analyses are possible; see alternatives below.</p>}
      {at.notes.filter((n) => /oblique|agrees|construction|vocative|read as|plural|fused/.test(n)).slice(0, 2).map((n, i) => <div key={i} className="card__why">{n}</div>)}

      {beginner && (
        <div className="card__section">
          <span className="label">Script</span>
          <AksharaStrip word={token.surface_original} known={known} selected={akOpen} onSelect={setAkOpen} />
        </div>
      )}

      <StatusPicker lexemeKey={c.key} form={token.key} status={status} onStatus={p.onStatus} />

      <Reveal label="More" hint="morphology · why this form" open={level >= 2} onToggle={() => setLevel(level >= 2 ? 1 : 2)} />
      {level >= 2 && (
        <div>
          <div className="morphs">
            {cand.morphemes.map((m, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="morph__plus">+</span>}
                <span className={`morph morph--${m.role}`}><span className="morph__form">{m.text || '∅'}</span><span className="morph__kind">{m.role}</span><span className="morph__gloss">{m.gloss}</span></span>
              </span>
            ))}
          </div>
          {at.notes.length > 0 && (
            <div className="card__section">
              <span className="label">Why this form</span>
              {at.notes.map((n, i) => <p key={i} className="card__text">{n}</p>)}
            </div>
          )}
          {cons.length > 0 && (
            <div className="card__section">
              <span className="label">Part of a construction</span>
              {cons.map((x, i) => (
                <button key={i} className="cons cons--verb" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => p.onHighlightConstruction(x)}>
                  <div className="cons__head"><span className="dv">{x.tokens.map((k) => analysis.tokens[k]!.text).join(' ')}</span><span className="g">{x.gloss}</span></div>
                  <div className="cons__label">{x.label}{x.roles[at.i] ? ` · this word: ${x.roles[at.i]}` : ''}</div>
                </button>
              ))}
            </div>
          )}
          {!beginner && (
            <div className="card__section">
              <span className="label">Script</span>
              <AksharaStrip word={token.surface_original} known={known} selected={akOpen} onSelect={setAkOpen} />
            </div>
          )}
          {alternatives.length > 0 && (
            <div className="card__section">
              <span className="label">Other readings</span>
              <div className="chips">
                {alternatives.map((x, i) => (
                  <button key={i} className={`chip chip--btn${at.candidates.indexOf(x) === pick ? ' chip--on' : ''}`} onClick={() => setPick(at.candidates.indexOf(x) === pick ? at.chosen : at.candidates.indexOf(x))}>
                    <span className="dv">{x.lemma}</span> {POS_LABEL[x.pos] ?? x.pos} · {featureWords(x.features, x.pos).join(' ') || x.gloss}
                  </button>
                ))}
              </div>
              {pick !== at.chosen && <p className="muted-note">Showing an alternative reading. Use “Correct” below to make it permanent for this word.</p>}
            </div>
          )}
        </div>
      )}

      <Reveal label="Deeper" hint="paradigm · pronunciation · history" open={level >= 3} onToggle={() => setLevel(level >= 3 ? 2 : 3)} />
      {level >= 3 && (
        <div>
          <div className="encoding">
            <span className="k">lemma</span><span className="t"><span className="dv">{cand.lemma}</span></span>
            <span className="k">part of speech</span><span className="t">{POS_LABEL[cand.pos] ?? cand.pos}</span>
            {cand.features.gender && <><span className="k">gender</span><span className="t">{cand.features.gender === 'm' ? 'masculine' : 'feminine'}</span></>}
            {cand.features.number && <><span className="k">number</span><span className="t">{cand.features.number === 'sg' ? 'singular' : 'plural'}</span></>}
            {cand.features.case && <><span className="k">case</span><span className="t">{cand.features.case}</span></>}
            {cand.features.verb_form && <><span className="k">verb form</span><span className="t">{cand.features.verb_form.replace(/-/g, ' ')}</span></>}
            {cand.features.paradigm && <><span className="k">paradigm</span><span className="t">{cand.features.paradigm}</span></>}
            {cand.entry?.cls && <><span className="k">class</span><span className="t">{NOUN_CLASS_LABEL[cand.entry.cls]}</span></>}
            {cand.entry?.trans !== undefined && <><span className="k">valency</span><span className="t">{cand.entry.trans ? 'transitive' : 'intransitive'}{cand.entry.ne ? ` · ने: ${cand.entry.ne}` : ''}</span></>}
            {cand.entry?.inflects !== undefined && cand.pos === 'adjective' && <><span className="k">inflection</span><span className="t">{cand.entry.inflects ? 'inflecting (-ā / -e / -ī)' : 'indeclinable'}</span></>}
            <span className="k">pronunciation</span><span className="t">{pron.transliteration}{pron.pronunciation !== pron.transliteration ? ` → ${pron.pronunciation}` : ''} <span className="faint">({confidenceLabel(pron.confidence)}{pron.source === 'lexicon' ? ', hand-checked' : ''})</span></span>
            {cand.entry?.ety && <><span className="k">origin</span><span className="t">{cand.entry.ety}</span></>}
            {cand.entry?.senses && <><span className="k">senses</span><span className="t">{cand.entry.senses.join('; ')}</span></>}
            {cand.entry?.notes && <><span className="k">notes</span><span className="t">{cand.entry.notes}</span></>}
            {stats && <><span className="k">encounters</span><span className="t">{stats.encounters} read · {stats.lookups} looked up{stats.forms.length ? ` · forms: ${stats.forms.slice(0, 6).map((f) => `${f.form} ×${f.count}`).join(', ')}` : ''}</span></>}
          </div>
          {pron.notes.length > 0 && <p className="muted-note">{pron.notes.join(' · ')}</p>}
          <Paradigm cand={cand} surface={token.surface_normalized} />
          <div className="card__actions">
            <Link className="btn btn--small" to={`/word/${encodeURIComponent(c.key)}`}>Lexeme page</Link>
            <button className="btn btn--small" onClick={() => setCorrecting(!correcting)}>{correcting ? 'Cancel' : 'Correct'}</button>
          </div>
          {correcting && <CorrectForm bookId={p.bookId} chapterId={p.chapterId} token={token} cand={cand} onDone={() => { setCorrecting(false); p.onCorrected(); }} />}
          <p className="card__prov">Source: {SOURCE_LABEL[cand.source] ?? cand.source} · {confidenceLabel(cand.confidence)} · rules v{analysis.rulesVersion}</p>
        </div>
      )}
    </aside>
  );
}

export function StatusPicker({ lexemeKey, form, status, onStatus }: { lexemeKey: string; form: string; status?: KnownWord; onStatus: (key: string, s: LearningStatus) => void }) {
  const cur = status?.status ?? 'new';
  const formStatus = status?.form_status?.[form];
  return (
    <div className="status" role="group" aria-label="Learning status">
      {STATUS_ORDER.map((s) => (
        <button key={s} className="status__dot" aria-pressed={cur === s} aria-label={STATUS_LABEL[s]} title={STATUS_LABEL[s]} onClick={() => onStatus(lexemeKey, s)}>•</button>
      ))}
      <span className="status__name">{STATUS_LABEL[cur]}{formStatus ? <span className="status__form">· this form: {formStatus}</span> : null}</span>
      <button className="status__dot" aria-pressed={cur === 'ignored'} title="ignore (name, number…)" aria-label="ignore" onClick={() => onStatus(lexemeKey, 'ignored')} style={{ marginLeft: '0.4rem' }}>×</button>
    </div>
  );
}
