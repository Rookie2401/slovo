import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { KnownWord, LearningStatus, MorphFeatures, Sentence, Token } from '../database/types';
import type { Candidate } from '../morphology/candidate';
import { chosen, type AnalyzedToken, type FoundConstruction, type SentenceAnalysis } from '../morphology/sentence';
import { pronounce } from '../pronunciation';
import { withAcute } from '../dictionary/accent';
import { audioAvailable, speak } from '../audio/speech';
import { I, IconBtn, Reveal, SOURCE_LABEL, confidenceLabel } from '../ui/components';
import type { Settings } from '../database/settings';
import { Paradigm } from './Paradigm';
import { lexeme } from '../dictionary';
import type { DictLexeme } from '../dictionary/types';
import { STATUS_ORDER, STATUS_LABEL, lexemeStats, type LexemeStats } from '../vocabulary';
import { CorrectForm } from './CorrectForm';
import { LetterStrip } from './LetterDetail';

const CASE_LABEL: Record<string, string> = { nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', inst: 'instrumental', prep: 'prepositional', loc: 'second locative', part: 'partitive', voc: 'vocative' };

export function featureWords(f: MorphFeatures, pos: string): string[] {
  const out: string[] = [];
  if (f.gender) out.push(f.gender === 'm' ? 'masculine' : f.gender === 'f' ? 'feminine' : f.gender === 'n' ? 'neuter' : 'common');
  if (f.number) out.push(f.number === 'sg' ? 'singular' : 'plural');
  if (f.case) out.push(CASE_LABEL[f.case] ?? f.case);
  if (f.person) out.push(`${f.person}${f.person === 1 ? 'st' : f.person === 2 ? 'nd' : 'rd'} person`);
  if (f.animacy && pos === 'noun') out.push(f.animacy === 'anim' ? 'animate' : 'inanimate');
  if (f.aspect) out.push(f.aspect === 'perfective' ? 'perfective' : f.aspect === 'imperfective' ? 'imperfective' : 'biaspectual');
  if (f.verb_form) out.push(f.verb_form.replace(/-/g, ' '));
  // the tense is implicit in the past form and in a participle/gerund label; say it only for present-future
  if (f.tense && pos === 'verb' && f.verb_form === 'present-future') out.push(f.tense);
  if (f.mood && f.mood !== 'indicative') out.push(f.mood);
  if (f.degree && f.degree !== 'positive') out.push(f.degree);
  if (f.reflexive) out.push('reflexive (-ся)');
  return out;
}

const POS_LABEL: Record<string, string> = { noun: 'noun', proper: 'proper noun', pronoun: 'pronoun', adjective: 'adjective', verb: 'verb', adverb: 'adverb', preposition: 'preposition', conjunction: 'conjunction', particle: 'particle', interjection: 'interjection', numeral: 'numeral', predicative: 'predicative', unknown: 'unknown' };

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
  const { token, at, analysis, settings, status, known } = p;
  const c = chosen(at);
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [stats, setStats] = useState<LexemeStats | null>(null);
  const [entry, setEntry] = useState<DictLexeme | undefined>(undefined);
  const [correcting, setCorrecting] = useState(false);
  const [pick, setPick] = useState<number>(at.chosen);
  const [letterOpen, setLetterOpen] = useState<number | null>(null);
  useEffect(() => {
    setLevel(1);
    setCorrecting(false);
    setPick(at.chosen);
    setLetterOpen(null);
  }, [token.id, at.chosen]);
  useEffect(() => {
    let alive = true;
    if (!c) return;
    lexemeStats(c.key).then((s) => alive && setStats(s)).catch(() => {});
    lexeme(c.key).then((e) => alive && setEntry(e)).catch(() => alive && setEntry(undefined));
    return () => {
      alive = false;
    };
  }, [c?.key, token.id, status?.updated_at]);
  if (!c) return null;
  const cand: Candidate = at.candidates[pick] ?? c;
  const stressIdx = cand.features.stress != null && cand.features.stress >= 0 ? cand.features.stress : -1;
  const pron = pronounce(token.surface_normalized, stressIdx);
  const showTranslit = settings.translitMode !== 'never';
  const cons = analysis.constructions.filter((x) => x.tokens.includes(at.i));
  const feats = featureWords(cand.features, cand.pos);
  const glossCtx = at.glossInContext;
  const isGuess = cand.key.startsWith('?');
  const accentedLemma = cand.lemmaAccented ?? cand.lemma;
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
      <div className="card__surface ru">{stressIdx >= 0 ? withAcute(token.surface_normalized, stressIdx) : token.surface_original}</div>
      {showTranslit && <div className="card__translit">{pron.translit}{pron.confidence < 0.8 && <span title="pronunciation less certain"> ?</span>}</div>}
      {glossCtx && <div className="card__gloss card__gloss--ctx">{glossCtx}</div>}
      <div className="card__gloss">{cand.gloss}</div>
      <div className="card__line"><span className="k">lemma</span><span className="ru">{accentedLemma}</span></div>
      <div className="card__line"><span className="k">form</span><span>{POS_LABEL[cand.pos] ?? cand.pos}{feats.length ? ' · ' + feats.join(' · ') : ''}</span></div>
      {isGuess && <p className="card__err">Not in the dictionary — the reading above is a pattern guess ({confidenceLabel(cand.confidence)}).</p>}
      {cand.variant && <p className="muted-note">A spelling variant (ё/е, pre-reform orthography) of the same word.</p>}
      {at.ambiguous && !isGuess && <p className="muted-note">Two analyses are possible; see alternatives below.</p>}
      {at.notes.slice(0, 2).map((n, i) => <div key={i} className="card__why">{n}</div>)}

      <StatusPicker lexemeKey={c.key} form={token.key} status={status} onStatus={p.onStatus} />

      <Reveal label="More" hint="morphology · why this form" open={level >= 2} onToggle={() => setLevel(level >= 2 ? 1 : 2)} />
      {level >= 2 && (
        <div>
          <div className="morphs">
            {cand.morphemes.map((m, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i > 0 && <span className="morph__plus">+</span>}
                <span className={`morph morph--${m.role}`}><span className="morph__form ru">{m.text || '∅'}</span><span className="morph__kind">{m.role}</span><span className="morph__gloss">{m.gloss}</span></span>
              </span>
            ))}
          </div>
          {at.notes.length > 0 && (
            <div className="card__section">
              <span className="label">Why this form</span>
              {at.notes.map((n, i) => <p key={i} className="card__text">{n}</p>)}
            </div>
          )}
          {cand.partner && (
            <p className="card__text"><b>Aspect partner:</b> <Link className="ru" to={`/word/${encodeURIComponent(cand.partner)}`}>{cand.partner.split(':')[1]}</Link></p>
          )}
          <div className="card__section">
            <span className="label">Letters</span>
            <LetterStrip word={token.surface_original} stressIndex={stressIdx} known={known} selected={letterOpen} onSelect={setLetterOpen} />
          </div>
          {cons.length > 0 && (
            <div className="card__section">
              <span className="label">Part of a construction</span>
              {cons.map((x, i) => (
                <button key={i} className="cons cons--verb" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => p.onHighlightConstruction(x)}>
                  <div className="cons__head"><span className="ru">{x.tokens.map((k) => analysis.tokens[k]!.text).join(' ')}</span><span className="g">{x.gloss}</span></div>
                  <div className="cons__label">{x.label}{x.roles[at.i] ? ` · this word: ${x.roles[at.i]}` : ''}</div>
                </button>
              ))}
            </div>
          )}
          {alternatives.length > 0 && (
            <div className="card__section">
              <span className="label">Other readings</span>
              <div className="chips">
                {alternatives.map((x, i) => (
                  <button key={i} className={`chip chip--btn${at.candidates.indexOf(x) === pick ? ' chip--on' : ''}`} onClick={() => setPick(at.candidates.indexOf(x) === pick ? at.chosen : at.candidates.indexOf(x))}>
                    <span className="ru">{x.lemma}</span> {POS_LABEL[x.pos] ?? x.pos} · {featureWords(x.features, x.pos).join(' ') || x.gloss}
                  </button>
                ))}
              </div>
              {pick !== at.chosen && <p className="muted-note">Showing an alternative reading. Use “Correct” below to make it permanent for this word.</p>}
            </div>
          )}
        </div>
      )}

      <Reveal label="Deeper" hint="paradigm · pronunciation · frequency" open={level >= 3} onToggle={() => setLevel(level >= 3 ? 2 : 3)} />
      {level >= 3 && (
        <div>
          <div className="encoding">
            <span className="k">lemma</span><span className="t"><span className="ru">{accentedLemma}</span></span>
            <span className="k">part of speech</span><span className="t">{POS_LABEL[cand.pos] ?? cand.pos}</span>
            {cand.features.gender && <><span className="k">gender</span><span className="t">{cand.features.gender === 'm' ? 'masculine' : cand.features.gender === 'f' ? 'feminine' : cand.features.gender === 'n' ? 'neuter' : 'common'}</span></>}
            {cand.features.number && <><span className="k">number</span><span className="t">{cand.features.number === 'sg' ? 'singular' : 'plural'}</span></>}
            {cand.features.case && <><span className="k">case</span><span className="t">{CASE_LABEL[cand.features.case] ?? cand.features.case}</span></>}
            {cand.features.aspect && <><span className="k">aspect</span><span className="t">{cand.features.aspect}</span></>}
            {cand.features.verb_form && <><span className="k">verb form</span><span className="t">{cand.features.verb_form.replace(/-/g, ' ')}</span></>}
            {cand.features.paradigm && <><span className="k">paradigm</span><span className="t">{cand.features.paradigm}</span></>}
            <span className="k">pronunciation</span><span className="t">{pron.ipa} → {pron.translit} <span className="faint">({confidenceLabel(pron.confidence)})</span></span>
            {entry?.senses && entry.senses.length > 0 && <><span className="k">senses</span><span className="t">{entry.senses.join('; ')}</span></>}
            {entry?.rank && <><span className="k">frequency</span><span className="t">#{entry.rank} of 50,000</span></>}
            {stats && <><span className="k">encounters</span><span className="t">{stats.encounters} read · {stats.lookups} looked up{stats.forms.length ? ` · forms: ${stats.forms.slice(0, 6).map((f) => `${f.form} ×${f.count}`).join(', ')}` : ''}</span></>}
          </div>
          {pron.notes.length > 0 && <p className="muted-note">{pron.notes.join(' · ')}</p>}
          {entry?.paradigm && <Paradigm paradigm={entry.paradigm} currentForm={token.surface_normalized} />}
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
