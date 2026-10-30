import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { Section, Row, TextField, TextArea, Button } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'
import { fmtDate, fmtNum } from '../lib/format.js'
import { gt, gymError, saveDiet, copyDiet, addNote, removeNote, listClients, localDay } from './api.js'
import './gym.css'

// A trainer's diet chart and notes for a client (M5, api/gym/coaching.js). The member reads the
// diet chart; the notes are the trainer's alone.

const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']]
const day = ts => (localDay(ts) ? fmtDate(localDay(ts), true) : '–')

/** "2,200 kcal · 120 g protein · 3 L water", the targets that are set. */
export function targetsLine(d) {
  return [d.calories != null && gt('{0} kcal', fmtNum(d.calories)), d.protein != null && gt('{0} g protein', fmtNum(d.protein)),
    d.water != null && gt('{0} L water', fmtNum(d.water))].filter(Boolean).join(' · ')
}

/** A diet chart, read-only: the targets, each meal, the notes. */
function DietRows({ d }) {
  const t = targetsLine(d)
  return <>
    {t && <Row icon="target" iconTint="var(--acc)" title={t} />}
    {MEALS.filter(([k]) => d.meals?.[k]).map(([k, l]) => <Row key={k} title={gt(l)} subtitle={<span className="gym-pre">{d.meals[k]}</span>} />)}
    {d.notes && <Row icon="note" iconTint="var(--grey)" title={gt('Notes')} subtitle={<span className="gym-pre">{d.notes}</span>} />}
  </>
}

/** The trainer's diet chart editor. */
function DietSheet({ client, diet, close, onDone }) {
  const toast = useUI(s => s.toast)
  const [f, setF] = useState(() => ({
    calories: diet?.calories ?? '', protein: diet?.protein ?? '', water: diet?.water ?? '',
    meals: Object.fromEntries(MEALS.map(([k]) => [k, diet?.meals?.[k] || ''])), notes: diet?.notes || '',
  }))
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = () => {
    setBusy(true)
    saveDiet(client.id, f).then(r => { onDone(r.diet); toast(gt('Diet chart saved for {0}', client.name)); close() })
      .catch(e => toast(gymError(e))).finally(() => setBusy(false))
  }
  return <>
    <h3 style={{ marginTop: 0 }}>{gt('Diet chart for {0}', client.name)}</h3>
    <div className="small muted" style={{ marginBottom: 12 }}>{gt('{0} reads it in My trainer. Leave out anything you don’t set.', client.name)}</div>
    <Section title={gt('Daily targets')}>
      <div className="gym-targets">
        <label><span>{gt('Calories')}</span><TextField inputMode="numeric" value={f.calories} onChange={e => set('calories', e.target.value)} placeholder="2200" aria-label={gt('Calories (kcal)')} /><small>kcal</small></label>
        <label><span>{gt('Protein')}</span><TextField inputMode="numeric" value={f.protein} onChange={e => set('protein', e.target.value)} placeholder="120" aria-label={gt('Protein (g)')} /><small>g</small></label>
        <label><span>{gt('Water')}</span><TextField inputMode="decimal" value={f.water} onChange={e => set('water', e.target.value)} placeholder="3" aria-label={gt('Water (litres)')} /><small>L</small></label>
      </div>
    </Section>
    {MEALS.map(([k, l]) => <Section key={k} title={gt(l)}>
      <div className="lrow"><TextArea rows={2} maxLength={600} value={f.meals[k]} onChange={e => setF(x => ({ ...x, meals: { ...x.meals, [k]: e.target.value } }))}
        placeholder={k === 'breakfast' ? gt('e.g. Oats with milk, 4 egg whites') : ''} aria-label={gt(l)} style={{ flex: 1 }} /></div>
    </Section>)}
    <Section title={gt('Notes')}>
      <div className="lrow"><TextArea rows={2} maxLength={1000} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder={gt('e.g. No sugar after 6 pm')} aria-label={gt('Diet notes')} style={{ flex: 1 }} /></div>
    </Section>
    <Button variant="primary" disabled={busy} onClick={save}>{busy ? gt('Saving…') : gt('Save diet chart')}</Button>
    <div style={{ height: 8 }} />
    <Button onClick={close}>{gt('Cancel')}</Button>
  </>
}

/** Pick another client whose chart to copy. */
function CopySheet({ client, close, onDone }) {
  const toast = useUI(s => s.toast)
  const [list, setList] = useState(null)
  useEffect(() => { listClients().then(r => setList(r.clients.filter(c => c.id !== client.id && c.hasDiet))).catch(() => setList([])) }, [])
  const copy = c => copyDiet(client.id, c.id).then(r => { onDone(r.diet); toast(gt('{0}’s diet chart copied', c.name)); close() }).catch(e => toast(gymError(e)))
  return <>
    <h3 style={{ marginTop: 0 }}>{gt('Copy a diet chart')}</h3>
    <Section footer={gt('{0} gets a copy; you can change it after.', client.name)}>
      {!list ? <Row title={gt('Loading…')} /> : !list.length ? <Row title={gt('None of your other clients has a diet chart yet.')} />
        : list.map(c => <Row key={c.id} icon="person" iconTint="var(--acc)" title={c.name} accessory="chevron" onClick={() => copy(c)} />)}
    </Section>
    <Button onClick={close}>{gt('Cancel')}</Button>
  </>
}

/** On the trainer's client page: the diet chart, to add, change, copy or remove. */
export function TrainerDiet({ client, diet, onChange }) {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const edit = () => openSheet(close => <DietSheet client={client} diet={diet} close={close} onDone={onChange} />)
  const copy = () => openSheet(close => <CopySheet client={client} close={close} onDone={onChange} />)
  const remove = () => confirmSheet({
    title: gt('Remove {0}’s diet chart?', client.name), message: gt('It leaves My trainer on their phone.'),
    confirmText: gt('Remove diet chart'), danger: true,
    onConfirm: () => saveDiet(client.id, null).then(() => { onChange(null); toast(gt('Diet chart removed')) }).catch(e => toast(gymError(e))),
  })
  if (!diet) return <Section title={gt('Diet chart')} footer={gt('Targets and meals {0} reads in My trainer.', client.name)}>
    <Row icon="plusCircle" iconTint="var(--acc)" title={gt('Add diet chart')} accessory="chevron" onClick={edit} />
    <Row icon="copy" iconTint="var(--acc)" title={gt('Copy from another client')} accessory="chevron" onClick={copy} />
  </Section>
  return <Section title={gt('Diet chart')} footer={gt('Updated {0}{1}.', day(diet.updatedAt), diet.trainerName ? ' ' + gt('by {0}', diet.trainerName) : '')}>
    <DietRows d={diet} />
    <Row icon="pencil" title={gt('Change diet chart')} accessory="chevron" onClick={edit} />
    <Row icon="xmark" iconTint="var(--red)" title={gt('Remove diet chart')} danger onClick={remove} />
  </Section>
}

/** In the member's My trainer: the chart their trainer set, read-only. */
export function MemberDiet({ diet }) {
  if (!diet) return null
  return <Section title={gt('Diet chart')}
    footer={diet.current ? gt('From {0} · updated {1}.', diet.trainerName || gt('your trainer'), day(diet.updatedAt))
      : gt('From {0}, no longer updated: you stopped sharing.', diet.trainerName || gt('your trainer'))}>
    <DietRows d={diet} />
  </Section>
}

/** On the trainer's client page: their own notes, which nobody else reads. */
export function TrainerNotes({ client, notes, onChange }) {
  const toast = useUI(s => s.toast)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const add = () => {
    if (!text.trim()) return
    setBusy(true)
    addNote(client.id, text).then(r => { onChange(r.notes); setText('') }).catch(e => toast(gymError(e))).finally(() => setBusy(false))
  }
  const remove = n => confirmSheet({
    title: gt('Delete this note?'), message: n.text, confirmText: gt('Delete note'), danger: true,
    onConfirm: () => removeNote(n.id).then(r => onChange(r.notes)).catch(e => toast(gymError(e))),
  })
  return <Section title={gt('Your notes')} footer={gt('Only you see these: not {0}, not the owner. They are deleted if {0} stops sharing with you.', client.name)}>
    <div className="lrow" style={{ gap: 8 }}>
      <TextArea rows={2} maxLength={500} value={text} onChange={e => setText(e.target.value)} placeholder={gt('e.g. Knee pain, avoid lunges')} aria-label={gt('New note')} style={{ flex: 1 }} />
      <button type="button" className="gym-act" disabled={busy || !text.trim()} onClick={add}>{gt('Add')}</button>
    </div>
    {(notes || []).map(n => <Row key={n.id} title={<span className="gym-pre">{n.text}</span>} subtitle={day(n.at)}>
      <button type="button" className="gym-act danger" onClick={() => remove(n)}>{gt('Delete')}</button>
    </Row>)}
  </Section>
}
