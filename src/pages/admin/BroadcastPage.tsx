import { useCallback, useEffect, useState } from 'react'
import { Megaphone, Radio, Send, Users } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatCount, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { createBroadcast, listBroadcasts, processBroadcast, type BroadcastRecord } from '@/services/broadcast.service'

type Audience = 'all_users' | 'channel'
const inputClass = 'mt-1.5 w-full rounded-xl border border-tg-separator bg-tg-bg px-3 py-2.5 text-[13px] text-tg-text outline-none focus:border-brand-500'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'خطای ناشناخته رخ داد.'

export default function BroadcastPage() {
  const [audience, setAudience] = useState<Audience>('all_users')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [buttonLabel, setButtonLabel] = useState('')
  const [buttonUrl, setButtonUrl] = useState('')
  const [records, setRecords] = useState<BroadcastRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setLoading(true)
    try { setRecords(await listBroadcasts()); setHistoryError(null) } catch (err) { setHistoryError(errorMessage(err)) } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    void listBroadcasts().then((data) => { if (active) { setRecords(data); setHistoryError(null) } }).catch((err: unknown) => { if (active) setHistoryError(errorMessage(err)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const update = (record: BroadcastRecord) => setRecords((old) => [record, ...old.filter((item) => item.id !== record.id)])
  const run = async (record: BroadcastRecord) => {
    let current = record
    while (current.pending > 0) {
      const result = await processBroadcast(current.id)
      current = result.data
      update(current)
      if (current.pending > 0) await new Promise((resolve) => setTimeout(resolve, (result.retryAfter || 1) * 1000))
    }
  }
  const send = async () => {
    setError(null)
    if (!message.trim()) { setError('متن پیام را وارد کنید.'); return }
    if (audience === 'channel' && !target.trim()) { setError('شناسه کانال یا گروه را وارد کنید.'); return }
    if (!!buttonLabel.trim() !== !!buttonUrl.trim()) { setError('عنوان و آدرس دکمه را با هم وارد کنید.'); return }
    if (!window.confirm('پیام واقعاً از طریق ربات تلگرام ارسال شود؟')) return
    setBusy(true)
    try {
      const record = await createBroadcast({ message, audience, target, photoUrl, buttonLabel, buttonUrl })
      update(record)
      await run(record)
    } catch (err) { setError(`${errorMessage(err)} تاریخچه را بررسی کنید؛ ارسال مجدد ممکن است تکراری باشد.`); await refresh() } finally { setBusy(false) }
  }
  const resume = async (record: BroadcastRecord) => {
    setError(null); setBusy(true)
    try { await run(record) } catch (err) { setError(errorMessage(err)); await refresh() } finally { setBusy(false) }
  }
  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="ارتباطات" title="پیام انبوه" description="ارسال واقعی به کاربران ثبت‌شده یا یک کانال و گروه تلگرام." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="space-y-4">
          <div><p className="text-[13px] font-medium text-tg-hint">مخاطبان</p><div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([{ value: 'all_users', label: 'همه کاربران ثبت‌شده', icon: Users }, { value: 'channel', label: 'کانال یا گروه', icon: Radio }] as const).map((item) => <button key={item.value} type="button" disabled={busy} aria-pressed={audience === item.value} onClick={() => setAudience(item.value)} className={cn('flex items-center gap-2 rounded-2xl border p-3 text-start text-[13px]', audience === item.value ? 'border-brand-500 bg-brand-500/[0.08]' : 'border-tg-separator bg-tg-bg')}><item.icon className="size-4" aria-hidden />{item.label}</button>)}
          </div></div>
          {audience === 'channel' && <label className="block text-[13px] text-tg-hint">شناسه عددی یا @username کانال/گروه<input className={inputClass} dir="ltr" value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy} placeholder="@channel_name یا -100..." /></label>}
          <label className="block text-[13px] text-tg-hint">متن پیام<textarea className={cn(inputClass, 'resize-y leading-relaxed')} rows={5} value={message} maxLength={photoUrl.trim() ? 1024 : 4096} onChange={(e) => setMessage(e.target.value)} disabled={busy} /></label>
          <p className="text-[11px] text-tg-hint">{formatCount(message.length)} / {formatCount(photoUrl.trim() ? 1024 : 4096)}</p>
          <label className="block text-[13px] text-tg-hint">آدرس HTTPS تصویر (اختیاری)<input className={inputClass} dir="ltr" type="url" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} disabled={busy} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[13px] text-tg-hint">عنوان دکمه (اختیاری)<input className={inputClass} value={buttonLabel} maxLength={64} onChange={(e) => setButtonLabel(e.target.value)} disabled={busy} /></label><label className="block text-[13px] text-tg-hint">آدرس HTTPS دکمه<input className={inputClass} dir="ltr" type="url" value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} disabled={busy} /></label></div>
          <div className="rounded-2xl border border-tg-separator bg-tg-secondary-bg/60 p-3"><p className="flex items-center gap-1.5 text-[11px] text-tg-hint"><Megaphone className="size-4" /> پیش‌نمایش متن</p><p className="mt-2 whitespace-pre-wrap text-[13px] text-tg-text">{message.trim() || 'متن پیام اینجا نمایش داده می‌شود.'}</p>{buttonLabel && <p className="mt-2 text-[12px] text-tg-button">{buttonLabel}</p>}</div>
          {error && <p role="alert" className="text-[12px] text-tg-destructive">{error}</p>}
          <div className="flex items-center justify-between gap-3"><p className="text-[11px] text-tg-hint">تا پایان ارسال این صفحه را باز نگه دارید؛ ارسال‌های باقی‌مانده قابل ادامه هستند.</p><Button onClick={() => void send()} loading={busy} disabled={!message.trim()} leftIcon={<Send className="size-4" />}>ارسال پیام</Button></div>
        </Card>
        <Card padded={false} className="overflow-hidden"><div className="border-b border-tg-separator px-4 py-3"><h2 className="text-[14px] font-semibold text-tg-text">ارسال‌های اخیر</h2><p className="mt-1 text-[11px] text-tg-hint">موفق یعنی تلگرام پیام را پذیرفته است، نه اینکه کاربر آن را دیده باشد.</p></div>
          {loading ? <p className="p-4 text-[12px] text-tg-hint">در حال دریافت تاریخچه...</p> : historyError ? <div className="p-4"><p role="alert" className="text-[12px] text-tg-destructive">{historyError}</p><Button size="sm" variant="secondary" onClick={() => void refresh()}>تلاش دوباره</Button></div> : records.length === 0 ? <p className="p-4 text-[12px] text-tg-hint">هنوز پیامی ثبت نشده است.</p> : <ul className="max-h-[70dvh] divide-y divide-tg-separator overflow-y-auto">{records.map((record) => <li key={record.id} className="space-y-2 px-4 py-3"><div className="flex justify-between gap-2"><Badge tone="neutral" size="sm">{record.audience === 'channel' ? `کانال/گروه ${record.target}` : 'همه کاربران'}</Badge><span className="text-[10px] text-tg-hint">{formatDateTime(record.created_at)}</span></div><p className="whitespace-pre-wrap break-words text-[12px] text-tg-text">{record.message}</p><p className="text-[11px] text-tg-hint">کل: {formatCount(record.total)}، موفق: {formatCount(record.sent)}، ناموفق: {formatCount(record.failed)}، باقی‌مانده: {formatCount(record.pending)}، نامشخص/در حال پردازش: {formatCount(record.unknown + record.sending)}</p>{record.pending > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void resume(record)}>ادامه ارسال</Button>}{record.unknown + record.sending > 0 && <p className="text-[11px] text-tg-destructive">نتیجه برخی ارسال‌ها نامشخص است و برای جلوگیری از تکرار خودکار ارسال نمی‌شوند.</p>}</li>)}</ul>}
        </Card>
      </div>
    </div>
  )
}
