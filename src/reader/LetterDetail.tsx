import { Link } from 'react-router-dom';
import { symbolInfo } from '../alphabet/inventory';
import { lettersOf } from '../tokenizer/cyrillic';
import { pronounce } from '../pronunciation';
import { audioAvailable, speak } from '../audio/speech';
import { I } from '../ui/components';

/**
 * Word → letter → sound. Tapping a letter shows its IPA sound in this word
 * (hard/soft, voiced/devoiced as pronounce() actually resolved it), with a
 * link to the letter's own page. Unlike the Hindi reader's akshara strip,
 * Russian has no conjuncts/ligatures to decompose — each letter stands alone.
 */
export function LetterStrip({ word, stressIndex, known, selected, onSelect }: { word: string; stressIndex?: number; known: Set<string>; selected: number | null; onSelect: (i: number | null) => void }) {
  const uses = lettersOf(word);
  const pron = pronounce(word, stressIndex ?? -1);
  return (
    <>
      <div className="aks" role="list">
        {uses.map((u, i) => {
          const upper = u.lower.toUpperCase();
          const unknown = !known.has(upper) && !known.has(u.lower);
          const isStress = stressIndex !== undefined && stressIndex >= 0 && u.index === stressIndex;
          return (
            <button key={i} role="listitem" className={`ak${selected === i ? ' ak--on' : ''}${unknown ? ' ak--unknown' : ''}`} onClick={() => onSelect(selected === i ? null : i)} aria-pressed={selected === i}>
              <span className="ak__form">
                {u.letter}
                {isStress && (
                  <span aria-hidden>{'́'}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {selected !== null && uses[selected] && <LetterParts letter={uses[selected]!.letter} word={word} pronunciation={pron} known={known} />}
    </>
  );
}

/** Detail for one letter as it occurs in a specific word: its sound, softness/voicing as resolved, and a link to the letter page. */
export function LetterParts({ letter, word, pronunciation, known }: { letter: string; word: string; pronunciation: ReturnType<typeof pronounce>; known: Set<string> }) {
  const info = symbolInfo(letter);
  if (!info) return null;
  const upper = letter.toUpperCase();
  return (
    <div className="card__why">
      <div className="ak__parts">
        <Link className="ak__part" to={`/alphabet/letter/${encodeURIComponent(upper)}`} title={info.name}>
          <span>{letter}</span>
          <small>
            {info.ipa[0]}
            {!known.has(upper) ? ' · new' : ''}
          </small>
        </Link>
        <span className="ak__eq">in</span>
        <span className="ak__part">
          <span>{word}</span>
          <small>{pronunciation.translit}</small>
        </span>
        {audioAvailable() && (
          <button className="iconbtn" aria-label="Play" onClick={() => speak(word)}>
            {I.sound}
          </button>
        )}
      </div>
      <p className="card__text" style={{ marginTop: '0.4rem' }}>
        {info.symbol} ({info.name}) — {info.articulation}
        {info.hardness === 'paired' ? ' It is written the same whether hard or soft; a following ь, or е/ё/и/ю/я, softens it.' : ''}
      </p>
      {pronunciation.notes.length > 0 && (
        <p className="muted-note">
          In {word}: {pronunciation.notes.join('; ')}.
        </p>
      )}
    </div>
  );
}
