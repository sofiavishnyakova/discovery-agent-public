// Meridian Mail: the shared AP mailbox (Outlook-style).
import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DocView } from '../../components/DocView'
import { COMPANY } from '../../data/company'
import { CONTACTS } from '../../data/emails'
import type { Email } from '../../data/types'
import { scheduleReplies } from '../../lib/replies'
import { newId, nowClock, update, useWorld } from '../../lib/store'
import { useTitle } from '../../lib/useTitle'

export default function MailApp() {
  const w = useWorld()
  const unread = w.emails.filter((e) => e.folder === 'inbox' && !e.read).length
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  return (
    <div className="app mail" data-app="mail">
      <header className="mail-top">
        <div className="mail-logo">✉ Meridian Mail</div>
        <input
          className="mail-search" placeholder="Search mail" data-field="mail-search"
          value={params.get('q') ?? ''}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
        />
        <div className="mail-account">{COMPANY.apEmail}</div>
      </header>
      <div className="mail-body">
        <nav className="mail-nav">
          <button className="btn primary" data-action="new-mail" onClick={() => navigate('/mail/compose')}>New mail</button>
          <NavLink to="/mail/inbox" data-action="folder-inbox">Inbox {unread > 0 && <span className="badge">{unread}</span>}</NavLink>
          <NavLink to="/mail/sent" data-action="folder-sent">Sent items</NavLink>
          <div className="mail-nav-sep" />
          <div className="mail-nav-label">Downloads</div>
          {w.downloads.length === 0 && <div className="mail-nav-muted">No files yet</div>}
          {w.downloads.map((id) => {
            const d = w.docs.find((x) => x.id === id)
            return d ? <Link key={id} to={`/mail/doc/${id}`} className="mail-dl">📄 {d.filename}</Link> : null
          })}
        </nav>
        <main className="mail-main">
          <Routes>
            <Route path="compose" element={<Compose />} />
            <Route path="doc/:docId" element={<DocPage />} />
            <Route path=":folder/:id?" element={<Folder />} />
            <Route path="*" element={<Folder />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Folder() {
  const { folder = 'inbox', id } = useParams()
  const w = useWorld()
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').toLowerCase()
  const list = useMemo(
    () =>
      w.emails
        .filter((e) => e.folder === folder)
        .filter((e) => !q || `${e.subject} ${e.body} ${e.fromName} ${e.to}`.toLowerCase().includes(q))
        .sort((a, b) => b.sortKey - a.sortKey),
    [w.emails, folder, q],
  )
  const selected = w.emails.find((e) => e.id === id)
  useTitle(`${folder === 'sent' ? 'Sent items' : 'Inbox'} – Meridian Mail`)

  useEffect(() => {
    if (selected && !selected.read) {
      update((d) => {
        const e = d.emails.find((x) => x.id === selected.id)
        if (e) e.read = true
      })
    }
  }, [selected])

  return (
    <div className="mail-split" data-screen={`mail-${folder}`}>
      <ul className="mail-list">
        {list.length === 0 && <li className="mail-empty">No messages</li>}
        {list.map((e) => (
          <li key={e.id}>
            <Link
              to={`/mail/${folder}/${e.id}${q ? `?q=${encodeURIComponent(q)}` : ''}`}
              className={`mail-item ${e.read ? '' : 'unread'} ${e.id === id ? 'active' : ''}`}
              data-action="open-email" data-email-id={e.id}
            >
              <div className="mail-item-row">
                <span className="mail-from">{folder === 'sent' ? `To: ${e.to}` : e.fromName}</span>
                <span className="mail-time">{e.time}</span>
              </div>
              <div className="mail-subject">{e.attachments.length > 0 && '📎 '}{e.subject}</div>
              <div className="mail-preview">{e.body.split('\n').find((l) => l.trim() && !/^(hi|hello|dear|good)/i.test(l.trim())) ?? ''}</div>
            </Link>
          </li>
        ))}
      </ul>
      <section className="mail-read">
        {selected ? <Message email={selected} /> : <div className="mail-placeholder">Select an email to read</div>}
      </section>
    </div>
  )
}

function Message({ email }: { email: Email }) {
  const w = useWorld()
  const navigate = useNavigate()
  return (
    <article className="msg" data-email-id={email.id}>
      <h2 className="msg-subject">{email.subject}</h2>
      <div className="msg-meta">
        <div className="avatar">{email.fromName.slice(0, 1)}</div>
        <div>
          <div><strong>{email.fromName}</strong> &lt;{email.fromEmail}&gt;</div>
          <div className="muted">To: {email.to} · {email.time}</div>
        </div>
        <div className="msg-actions">
          <button className="btn" data-action="reply" onClick={() => navigate(`/mail/compose?replyTo=${email.id}`)}>↩ Reply</button>
          <button className="btn" data-action="forward" onClick={() => navigate(`/mail/compose?forward=${email.id}`)}>↪ Forward</button>
        </div>
      </div>
      {email.attachments.length > 0 && (
        <div className="msg-attachments">
          {email.attachments.map((aid) => {
            const d = w.docs.find((x) => x.id === aid)
            if (!d) return null
            const saved = w.downloads.includes(aid)
            return (
              <Link key={aid} to={`/mail/doc/${aid}?from=${email.id}`} className="attachment" data-action="open-attachment" data-doc-id={aid}>
                <span className="att-icon">PDF</span>
                <span>{d.filename}</span>
                {saved && <span className="att-saved">✓ downloaded</span>}
              </Link>
            )
          })}
        </div>
      )}
      <div className="msg-body">{email.body}</div>
    </article>
  )
}

function DocPage() {
  const { docId } = useParams()
  const [params] = useSearchParams()
  const w = useWorld()
  const navigate = useNavigate()
  const doc = w.docs.find((d) => d.id === docId)
  const from = params.get('from')
  const fromEmail = w.emails.find((e) => e.id === from)
  useTitle(`${doc?.filename ?? 'Document'} – Meridian Mail`)
  if (!doc) return <div className="mail-placeholder">Document not found</div>
  const saved = w.downloads.includes(doc.id)
  return (
    <div className="docpage" data-screen="mail-document" data-doc-id={doc.id}>
      <div className="doc-toolbar">
        <button className="btn" data-action="back-to-email" onClick={() => (fromEmail ? navigate(`/mail/${fromEmail.folder}/${fromEmail.id}`) : navigate(-1))}>← Back</button>
        <span className="doc-name">{doc.filename}</span>
        <button
          className={`btn ${saved ? '' : 'primary'}`} data-action="download-attachment" data-doc-id={doc.id}
          onClick={() => update((d) => { if (!d.downloads.includes(doc.id)) d.downloads.push(doc.id) })}
        >
          {saved ? '✓ Saved to Downloads' : '⬇ Download'}
        </button>
      </div>
      <div className="doc-scroll"><DocView doc={doc} /></div>
    </div>
  )
}

function Compose() {
  const [params] = useSearchParams()
  const w = useWorld()
  const navigate = useNavigate()
  const replyTo = w.emails.find((e) => e.id === params.get('replyTo'))
  const forward = w.emails.find((e) => e.id === params.get('forward'))
  const [to, setTo] = useState(replyTo ? replyTo.fromEmail : '')
  const [subject, setSubject] = useState(
    replyTo ? (/^re:/i.test(replyTo.subject) ? replyTo.subject : `RE: ${replyTo.subject}`) : forward ? `FW: ${forward.subject}` : '',
  )
  const [body, setBody] = useState(
    replyTo || forward
      ? `\n\nBest regards,\nAP Team\nMeridian Advisory LLC\n\n-----\nFrom: ${(replyTo ?? forward)!.fromName} <${(replyTo ?? forward)!.fromEmail}>\nSubject: ${(replyTo ?? forward)!.subject}\n\n${(replyTo ?? forward)!.body}`
      : '\n\nBest regards,\nAP Team\nMeridian Advisory LLC',
  )
  const [attach, setAttach] = useState<string[]>(forward ? forward.attachments : [])
  const [error, setError] = useState('')
  useTitle('New message – Meridian Mail')

  const send = () => {
    const recipients = to.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    if (!recipients.length) return setError('Please add at least one recipient.')
    if (recipients.some((r) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r))) return setError('One of the email addresses looks wrong.')
    if (!subject.trim()) return setError('Please add a subject.')
    const sent: Email = {
      id: newId('s'), folder: 'sent', fromName: 'AP Team', fromEmail: COMPANY.apEmail, to: recipients.join('; '),
      subject, body, time: nowClock(), sortKey: 1000 + (Date.now() - w.sessionStartedAt) / 1000, read: true,
      attachments: attach, inReplyTo: replyTo?.id,
    }
    update((d) => {
      d.emails.push(sent)
      scheduleReplies(d, sent)
    })
    navigate(replyTo ? `/mail/${replyTo.folder}/${replyTo.id}` : '/mail/sent')
  }

  const attachable = Array.from(new Set([...w.downloads, ...attach]))
  return (
    <div className="compose" data-screen="mail-compose">
      <h2>{replyTo ? 'Reply' : forward ? 'Forward' : 'New message'}</h2>
      <label>To
        <input list="contacts" value={to} onChange={(e) => setTo(e.target.value)} data-field="to" placeholder="name@company.ae" />
        <datalist id="contacts">{CONTACTS.map((c) => <option key={c.email} value={c.email}>{c.name}</option>)}</datalist>
      </label>
      <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} data-field="subject" /></label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} data-field="body" rows={14} />
      <div className="compose-attach">
        <div className="muted">Attach from Downloads:</div>
        {attachable.length === 0 && <div className="muted">— nothing downloaded yet —</div>}
        {attachable.map((id) => {
          const d = w.docs.find((x) => x.id === id)
          return d ? (
            <label key={id} className="check">
              <input type="checkbox" checked={attach.includes(id)} data-field="attach" data-doc-id={id}
                onChange={(e) => setAttach(e.target.checked ? [...attach, id] : attach.filter((a) => a !== id))} />
              {d.filename}
            </label>
          ) : null
        })}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="compose-actions">
        <button className="btn primary" data-action="send-email" onClick={send}>Send</button>
        <button className="btn" data-action="discard-email" onClick={() => navigate(-1)}>Discard</button>
      </div>
    </div>
  )
}
