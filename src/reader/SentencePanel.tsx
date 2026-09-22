import { useEffect, useState } from 'react';
import type { KnownWord, Sentence, Token } from '../database/types';
import { chosen, type FoundConstruction, type SentenceAnalysis } from '../morphology/sentence';
import { I, IconBtn, Reveal } from '../ui/components';
import type { Settings } from '../database/settings';
import { aiEnabled, explainSentence, loadExplanation, saveExplanation, type AiExplanation } from '../ai/claude';
import { audioAvailable, speak } from '../audio/speech';
import { correctSentence } from '../database/analysis';

interface Props {
  sentence: Sentence;
  tokens: Token[];
  analysis: SentenceAnalysis;
  bookId: number;
  chapterId: number;
  statuses: Map<string, KnownWord>;
  settings: Settings;
  selectedToken?: number;
  correction?: { natural?: string; literal?: string; note?: string };
  onClose: () => void;
  onTapWord: (t: Token) => void;
  onHighlightConstruction: (c: FoundConstruction | null) => void;
  onCorrected: () => void;
}

const CONSTRUCTION_HEAD_TYPES = new Set(['aspect', 'motion', 'reflexive', 'impersonal', 'passive', 'modal']);

export function SentencePanel(p: Props) {
  const { sentence, tokens, analysis, settings } = p;
  const [showGrammar, setShowGrammar] = useState(true);
  const [showGloss, setShowGloss] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const [ai, setAi] = useState<AiExplanation | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [natural, setNatural] = useState(p.correction?.natural ?? '');
  const [literal, setLiteral] = useState(p.correction?.literal ?? '');
  const [ruSimple, setRuSimple] = useState(settings.explainLanguage === 'ru-simple');

  useEffect(() => {
    let alive = true;
    setAi(null);
    setAiErr(null);
    setEditing(false);
    setNatural(p.correction?.natural ?? '');
    setLiteral(p.correction?.literal ?? '');
    loadExplanation(sentence.id!).then((e) => alive && setAi(e)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [sentence.id, p.correction?.natural, p.correction?.literal]);

  const askAi = async () => {
    setAiBusy(true);
    setAiErr(null);
    try {
      const e = await explainSentence(sentence.text, analysis, { ruSimple });
      await saveExplanation(p.bookId, sentence.id!, e);
      setAi(e);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const headCs = analysis.constructions.filter((c) => CONSTRUCTION_HEAD_TYPES.has(c.type));
  const otherCs = analysis.constructions.filter((c) => !CONSTRUCTION_HEAD_TYPES.has(c.type));
  const tokAt = (i: number) => tokens[i];
  const naturalText = p.correction?.natural || ai?.natural;
  const literalText = p.correction?.literal || ai?.literal;

  return (
    <aside className="panel" aria-label="Sentence">
      <div className="panel__head">
        <span className="label">Sentence</span>
        {audioAvailable() && <IconBtn label="Play" onClick={() => speak(sentence.text, settings.speechRate)}>{I.sound}</IconBtn>}
        <IconBtn label="Close" onClick={p.onClose}>{I.close}</IconBtn>
      </div>
      <div className="smode__dv ru" lang="ru">
        {analysis.tokens.map((_at, i) => {
          const t = tokAt(i);
          if (!t) return null;
          const inHead = headCs.find((c) => c.tokens.includes(i));
          const cls = t.kind === 'word' ? `w${p.selectedToken === t.id ? ' sel' : ''}${inHead ? ' ph' : ''}` : 'punct';
          return (
            <span key={t.id}>
              {i > 0 && t.kind === 'word' ? ' ' : ''}
              <span className={cls} onClick={() => t.kind === 'word' && p.onTapWord(t)} role={t.kind === 'word' ? 'button' : undefined} tabIndex={t.kind === 'word' ? 0 : undefined}>{t.surface_original}</span>
            </span>
          );
        })}
      </div>

      {/* structure sketch: always available, deterministic */}
      <div className="smode__layer">
        <div className="label">Structure <small>deterministic</small></div>
        {analysis.clauses.length === 0 && <p className="card__text">No finite verb found — a fragment, a heading, or a nominal sentence.</p>}
        {analysis.clauses.map((cl, ci, arr) => (
          <div key={ci}>
            {arr.length > 1 && <div className="cons__label" style={{ marginTop: '0.6rem' }}>Clause {ci + 1} of {arr.length}: <span className="ru">{analysis.tokens.slice(cl.range?.[0] ?? 0, cl.range?.[1] ?? analysis.tokens.length).map((t) => t.text).join(' ')}</span></div>}
            {headCs.filter((c) => c.tokens.every((t) => t >= (cl.range?.[0] ?? 0) && t < (cl.range?.[1] ?? analysis.tokens.length))).map((c, i) => <ConstructionCard key={i} c={c} analysis={analysis} verb onHighlight={p.onHighlightConstruction} />)}
            {cl.aspect && (
              <div className="card__why">
                <b>Aspect.</b> {cl.aspect.explanation}
                {cl.aspect.contrast && <> <i>{cl.aspect.contrast}</i></>}
              </div>
            )}
            {cl.agreement && (
              <div className="card__why">
                <b>Agreement.</b> {cl.agreement.explanation}
                {cl.agreement.matches === false && <span className="card__err"> Mismatch flagged.</span>}
              </div>
            )}
            {cl.wordOrder && <div className="card__why"><b>Word order.</b> {cl.wordOrder}</div>}
            {cl.notes.map((n, i) => <div key={i} className="card__why">{n}</div>)}
          </div>
        ))}
      </div>

      <Reveal label="Grammar" hint="constructions · roles" open={showGrammar} onToggle={() => setShowGrammar(!showGrammar)} />
      {showGrammar && (
        <div>
          {otherCs.map((c, i) => <ConstructionCard key={i} c={c} analysis={analysis} onHighlight={p.onHighlightConstruction} />)}
          {analysis.clauses.map((cl, ci) => (
            <div key={ci}>
              {cl.subject !== undefined && <p className="card__text"><b>Subject:</b> <span className="ru">{analysis.tokens[cl.subject]!.text}</span></p>}
              {cl.experiencer !== undefined && <p className="card__text"><b>Dative experiencer:</b> <span className="ru">{analysis.tokens[cl.experiencer]!.text}</span></p>}
              {cl.possessor !== undefined && <p className="card__text"><b>Possessor (у + genitive):</b> <span className="ru">{analysis.tokens[cl.possessor]!.text}</span></p>}
              {cl.object !== undefined && <p className="card__text"><b>Object:</b> <span className="ru">{analysis.tokens[cl.object]!.text}</span></p>}
              {cl.indirectObject !== undefined && <p className="card__text"><b>Indirect object:</b> <span className="ru">{analysis.tokens[cl.indirectObject]!.text}</span></p>}
            </div>
          ))}
          <p className="muted-note">Word order is comparatively free in Russian; case endings, not position, mark the grammatical roles.</p>
        </div>
      )}

      <Reveal label="Word by word" hint="glosses" open={showGloss} onToggle={() => setShowGloss(!showGloss)} />
      {showGloss && (
        <div className="gloss-grid">
          {analysis.tokens.map((at, i) => {
            const t = tokAt(i);
            const c = chosen(at);
            if (!t || t.kind !== 'word' || !c) return null;
            const st = p.statuses.get(c.key)?.status;
            return (
              <span key={t.id} style={{ display: 'contents' }}>
                <span className="ru">{t.surface_original}</span>
                <span className={`g${st === 'known' || st === 'mastered' ? ' known' : ''}`}>{at.glossInContext ?? c.gloss}</span>
              </span>
            );
          })}
        </div>
      )}

      <Reveal label="Translation" hint={naturalText ? '' : aiEnabled() ? 'ask the model' : 'add a key in Settings, or write your own'} open={!!naturalText || editing} onToggle={() => (naturalText ? setEditing(!editing) : aiEnabled() ? void askAi() : setEditing(!editing))} />
      {naturalText && !editing && (
        <div>
          <p className="natural">{naturalText}</p>
          {literalText && <p className="literal">{literalText}</p>}
          {ai?.points && ai.points.length > 0 && !p.correction?.natural && (
            <div className="card__section">
              <span className="label">Points to notice (model)</span>
              {ai.points.map((pt, i) => <p key={i} className="card__text"><b>{pt.topic}.</b> {pt.text}</p>)}
              {ai.alternatives && ai.alternatives.length > 0 && <p className="card__text"><b>Two analyses are possible.</b> {ai.alternatives.join(' / ')}</p>}
              {ai.uncertainty && <p className="muted-note">Uncertainty: {ai.uncertainty}</p>}
              {ai.ru_simple && <p className="card__text ru" lang="ru" style={{ fontSize: '1.1rem' }}>{ai.ru_simple}</p>}
            </div>
          )}
          <div className="card__actions">
            <button className="btn btn--small" onClick={() => setEditing(true)}>Edit</button>
            {aiEnabled() && <button className="btn btn--small" onClick={() => void askAi()} disabled={aiBusy}>{aiBusy ? 'Asking…' : 'Ask again'}</button>}
            <label className="muted-note" style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}><input type="checkbox" checked={ruSimple} onChange={(e) => setRuSimple(e.target.checked)} /> simple Russian</label>
          </div>
          {p.correction?.natural && <p className="card__prov">Your translation. {ai ? 'A model translation exists underneath.' : ''}</p>}
          {!p.correction?.natural && ai && <p className="card__prov">Language-model rendering, generated from the deterministic analysis above; it cannot change the grammar.</p>}
        </div>
      )}
      {aiBusy && !naturalText && <p className="faint"><span className="spinner" /> Asking the model…</p>}
      {aiErr && <p className="card__err">{aiErr}</p>}
      {editing && (
        <div className="editable">
          <div className="field"><label htmlFor="sp-nat">Natural translation</label><textarea id="sp-nat" value={natural} onChange={(e) => setNatural(e.target.value)} /></div>
          <div className="field"><label htmlFor="sp-lit">Literal structure (optional)</label><textarea id="sp-lit" value={literal} onChange={(e) => setLiteral(e.target.value)} /></div>
          <div className="sheet__actions">
            <button className="btn btn--quiet btn--small" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn--primary btn--small" disabled={!natural.trim()} onClick={() => void correctSentence(p.bookId, p.chapterId, sentence.id!, { natural, literal }).then(() => { setEditing(false); p.onCorrected(); })}>Save</button>
          </div>
        </div>
      )}

      <Reveal label="Dependency sketch" hint="who depends on what" open={showTree} onToggle={() => setShowTree(!showTree)} />
      {showTree && <DependencyTree analysis={analysis} />}
      <p className="card__prov">Deterministic rules v{analysis.rulesVersion}. Relations carry confidences; clauses are split, not fully attached.</p>
    </aside>
  );
}

export function ConstructionCard({ c, analysis, verb, onHighlight }: { c: FoundConstruction; analysis: SentenceAnalysis; verb?: boolean; onHighlight: (c: FoundConstruction | null) => void }) {
  const [open, setOpen] = useState(!!verb);
  return (
    <div className={`cons${verb ? ' cons--verb' : ''}`}>
      <button style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => { setOpen(!open); onHighlight(open ? null : c); }} aria-expanded={open}>
        <div className="cons__head"><span className="ru">{c.tokens.map((k) => analysis.tokens[k]!.text).join(' ')}</span><span className="g">{c.gloss}</span></div>
        <div className="cons__label">{c.label}</div>
      </button>
      {open && (
        <>
          <div className="cons__parts">
            {c.tokens.map((k) => (
              <span key={k} style={{ display: 'contents' }}>
                <span className="ru">{analysis.tokens[k]!.text}</span>
                <span>{c.roles[k] ?? ''}{chosen(analysis.tokens[k]!) ? ` — ${chosen(analysis.tokens[k]!)!.lemma}${roleFeatures(analysis.tokens[k]!)}` : ''}</span>
              </span>
            ))}
          </div>
          <p className="cons__text">{c.explanation}</p>
          {c.features?.nuance && <p className="cons__text"><b>Nuance:</b> {c.features.nuance}</p>}
          {c.uncertain && <p className="muted-note">{c.uncertain}</p>}
        </>
      )}
    </div>
  );
}

function roleFeatures(t: SentenceAnalysis['tokens'][number]): string {
  const c = chosen(t);
  if (!c) return '';
  const f = c.features;
  const bits = [f.verb_form?.replace(/-/g, ' '), f.gender ?? '', f.number, f.case, f.person ? `${f.person}p` : ''].filter(Boolean);
  return bits.length ? ` (${bits.join(' ')})` : '';
}

function DependencyTree({ analysis }: { analysis: SentenceAnalysis }) {
  const deps = analysis.dependencies;
  const roots = deps.filter((d) => d.head === null).map((d) => d.dependent);
  const children = (h: number) => deps.filter((d) => d.head === h && d.dependent !== h);
  const seen = new Set<number>();
  const Node = ({ i, rel, depth }: { i: number; rel: string; depth: number }) => {
    if (seen.has(i) || depth > 6) return null;
    seen.add(i);
    const kids = children(i);
    return (
      <div>
        <div className="tree__node"><span className="tree__rel">{rel}</span><span className="ru">{analysis.tokens[i]!.text}</span><span className="faint" style={{ fontSize: '0.85rem' }}>{chosen(analysis.tokens[i]!)?.gloss}</span></div>
        {kids.length > 0 && <div className="tree__children">{kids.map((k) => <Node key={k.dependent} i={k.dependent} rel={k.relation} depth={depth + 1} />)}</div>}
      </div>
    );
  };
  if (!roots.length) return <p className="card__text">No dependency sketch for this sentence.</p>;
  return (
    <div className="tree">
      {roots.map((r) => <Node key={r} i={r} rel="root" depth={0} />)}
      <div className="deps" style={{ marginTop: '0.6rem' }}>
        {deps.filter((d) => d.explanation && d.relation !== 'agreement-target').slice(0, 8).map((d, i) => (
          <div key={i} className="dep"><span className="ru">{analysis.tokens[d.dependent]!.text}</span><span className="rel">{d.relation}</span><span className="head">{d.head == null ? 'ROOT' : <span className="ru">{analysis.tokens[d.head]!.text}</span>} <small className="faint">{d.explanation}</small></span></div>
        ))}
      </div>
    </div>
  );
}
