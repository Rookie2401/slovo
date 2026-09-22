import { splitAccent, withAcute } from '../dictionary/accent';
import type { Paradigm as DictParadigm } from '../dictionary/types';
import { looseKey } from '../tokenizer/cyrillic';

/** Full paradigm table for level 3 of the Word panel / lexeme page, accented cells. */
export function Paradigm({ paradigm, currentForm }: { paradigm: DictParadigm; currentForm: string }) {
  const curKey = looseKey(currentForm);
  const cell = (acc: string | undefined) => {
    if (!acc) return <span className="pd__cell pd__cell--empty">—</span>;
    const { plain, stress } = splitAccent(acc);
    const shown = stress >= 0 ? withAcute(plain, stress) : plain;
    const on = looseKey(plain) === curKey;
    return <span className={`pd__cell${on ? ' pd__cell--on' : ''}`}><span className="ru">{shown}</span></span>;
  };

  if (paradigm.kind === 'noun') {
    const p = paradigm;
    const cases: Array<['nom' | 'gen' | 'dat' | 'acc' | 'inst' | 'prep' | 'loc' | 'part' | 'voc', string]> = [
      ['nom', 'им.'], ['gen', 'род.'], ['dat', 'дат.'], ['acc', 'вин.'], ['inst', 'твор.'], ['prep', 'предл.'],
    ];
    const extra: Array<['loc' | 'part' | 'voc', string]> = [['loc', 'местн.'], ['part', 'парт.'], ['voc', 'зват.']];
    return (
      <div className="card__section">
        <span className="label">Склонение</span>
        <table className="pd__table">
          <tbody>
            <tr><th className="pd__th" /><th className="pd__th">ед. ч.</th><th className="pd__th">мн. ч.</th></tr>
            {cases.map(([c, label]) => (
              <tr key={c}><th className="pd__th">{label}</th><td>{cell(p.sg?.[c])}</td><td>{cell(p.pl?.[c])}</td></tr>
            ))}
            {extra.filter(([c]) => p.sg?.[c] || p.pl?.[c]).map(([c, label]) => (
              <tr key={c}><th className="pd__th">{label}</th><td>{cell(p.sg?.[c])}</td><td>{cell(p.pl?.[c])}</td></tr>
            ))}
          </tbody>
        </table>
        {(p.sg_only || p.pl_only) && <p className="muted-note">{p.sg_only ? 'Только единственное число.' : 'Только множественное число.'}</p>}
      </div>
    );
  }

  if (paradigm.kind === 'adjective') {
    const p = paradigm;
    const cases: Array<['nom' | 'gen' | 'dat' | 'acc' | 'inst' | 'prep', string]> = [
      ['nom', 'им.'], ['gen', 'род.'], ['dat', 'дат.'], ['acc', 'вин.'], ['inst', 'твор.'], ['prep', 'предл.'],
    ];
    return (
      <div className="card__section">
        <span className="label">Склонение (полная форма)</span>
        <table className="pd__table">
          <tbody>
            <tr><th className="pd__th" /><th className="pd__th">м. р.</th><th className="pd__th">ж. р.</th><th className="pd__th">ср. р.</th><th className="pd__th">мн. ч.</th></tr>
            {cases.map(([c, label]) => (
              <tr key={c}><th className="pd__th">{label}</th><td>{cell(p.m?.[c])}</td><td>{cell(p.f?.[c])}</td><td>{cell(p.n?.[c])}</td><td>{cell(p.pl?.[c])}</td></tr>
            ))}
          </tbody>
        </table>
        {p.short && (p.short.m || p.short.f || p.short.n || p.short.pl) && (
          <table className="pd__table" style={{ marginTop: '0.5rem' }}>
            <tbody>
              <tr><th className="pd__th">кратк.</th><td>{cell(p.short.m)}</td><td>{cell(p.short.f)}</td><td>{cell(p.short.n)}</td><td>{cell(p.short.pl)}</td></tr>
            </tbody>
          </table>
        )}
        {(p.comparative || p.superlative) && (
          <p className="card__text">
            {p.comparative && <>сравнит.: {cell(p.comparative)} </>}
            {p.superlative && <>превосх.: {cell(p.superlative)}</>}
          </p>
        )}
      </div>
    );
  }

  // verb
  const p = paradigm;
  return (
    <div className="card__section">
      <span className="label">Спряжение</span>
      <table className="pd__table">
        <tbody>
          <tr><th className="pd__th">инф.</th><td>{cell(p.infinitive)}</td></tr>
          {p.presfut && (p.presfut.sg1 || p.presfut.sg2 || p.presfut.sg3 || p.presfut.pl1 || p.presfut.pl2 || p.presfut.pl3) && (
            <>
              <tr><th className="pd__th">я</th><td>{cell(p.presfut.sg1)}</td></tr>
              <tr><th className="pd__th">ты</th><td>{cell(p.presfut.sg2)}</td></tr>
              <tr><th className="pd__th">он/она</th><td>{cell(p.presfut.sg3)}</td></tr>
              <tr><th className="pd__th">мы</th><td>{cell(p.presfut.pl1)}</td></tr>
              <tr><th className="pd__th">вы</th><td>{cell(p.presfut.pl2)}</td></tr>
              <tr><th className="pd__th">они</th><td>{cell(p.presfut.pl3)}</td></tr>
            </>
          )}
          {p.past && (p.past.m || p.past.f || p.past.n || p.past.pl) && (
            <tr><th className="pd__th">прош.</th><td>{cell(p.past.m)} {cell(p.past.f)} {cell(p.past.n)} {cell(p.past.pl)}</td></tr>
          )}
          {p.imperative && (p.imperative.sg || p.imperative.pl) && (
            <tr><th className="pd__th">повел.</th><td>{cell(p.imperative.sg)} {cell(p.imperative.pl)}</td></tr>
          )}
        </tbody>
      </table>
      <p className="muted-note">Причастия и деепричастия образуются по правилу от этих основ (см. «Подробнее» выше).</p>
    </div>
  );
}
