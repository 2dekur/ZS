import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Sparkles, RotateCw, Download, LoaderCircle } from 'lucide-react'
import {
  settingsAtom, streamMetaAtom, EQ_BANDS, EQ_PRESETS, appInfoAtom, updateStateAtom,
} from '../store/player'
import { Toggle } from './ui'
import { useT, langAtom, LANGS, type Key } from '../i18n'
import type { Quality } from '../types'

const QUALITIES: Quality[] = ['low', 'normal', 'high', 'zs']

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5">
      <h2 className="text-base font-semibold text-zs-text">{title}</h2>
      {desc && <p className="text-xs text-zs-muted mt-1 mb-4">{desc}</p>}
      {!desc && <div className="h-2" />}
      {children}
    </section>
  )
}

function Line({ label, desc, children }: { label: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2">
      <div>
        <div className="text-sm text-zs-text">{label}</div>
        <div className="text-xs text-zs-muted mt-0.5 leading-relaxed">{desc}</div>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  )
}

function Updates() {
  const info = useAtomValue(appInfoAtom)
  const state = useAtomValue(updateStateAtom)
  const t = useT()
  if (!info) return null
  if (!info.packaged) return <p className="text-xs text-zs-muted">{t('upd.devOnly')}</p>
  const s = state.status
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-zs-text">
        {t('upd.current', { v: info.version })}
        <div className="text-xs text-zs-muted mt-0.5">
          {s === 'checking' && t('upd.checking')}
          {s === 'latest' && t('upd.latest')}
          {s === 'available' && t('upd.available', { v: state.version })}
          {s === 'downloading' && t('upd.downloading', { p: state.percent })}
          {s === 'error' && t('upd.error', { e: state.message })}
        </div>
      </div>
      {s === 'available' ? (
        <button type="button" onClick={() => window.zsound.downloadUpdate()} className="btn-primary px-4 h-9 gap-2 text-sm">
          <Download className="w-4 h-4" />{t('upd.download')}
        </button>
      ) : s === 'ready' ? (
        <button type="button" onClick={() => window.zsound.installUpdate()} className="btn-primary px-4 h-9 gap-2 text-sm">
          <RotateCw className="w-4 h-4" />{t('upd.restart')}
        </button>
      ) : (
        <button type="button" disabled={s === 'checking' || s === 'downloading'} onClick={() => window.zsound.checkUpdate()} className="chip h-9 px-4 text-sm flex items-center gap-2 disabled:opacity-50">
          {(s === 'checking' || s === 'downloading') && <LoaderCircle className="w-4 h-4 animate-spin" />}
          {t('upd.check')}
        </button>
      )}
    </div>
  )
}

export default function SettingsView() {
  const [s, setS] = useAtom(settingsAtom)
  const [lang, setLang] = useAtom(langAtom)
  const meta = useAtomValue(streamMetaAtom)
  const [info, setInfo] = useAtom(appInfoAtom)
  const [discord, setDiscord] = useState(false)
  useEffect(() => { window.zsound.discordAvailable().then(setDiscord) }, [])
  const t = useT()
  const patch = (p: Partial<typeof s>) => setS((prev) => ({ ...prev, ...p }))
  const preset = (Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[]).find((k) => EQ_PRESETS[k].every((v, i) => v === s.eq[i]))
  const hwPending = info && info.hardwareAcceleration !== info.hardwareAccelerationPref

  const setHw = async (on: boolean) => {
    await window.zsound.setHardwareAcceleration(on)
    if (info) setInfo({ ...info, hardwareAccelerationPref: on })
  }

  return (
    <div className="p-6 max-w-3xl space-y-4 view-in">
      <h1 className="text-4xl font-semibold text-zs-text mb-2">{t('set.title')}</h1>

      <Section title={t('set.language')} desc={t('set.languageDesc')}>
        <div className="flex gap-2">
          {LANGS.map((l) => (
            <button key={l.id} type="button" onClick={() => setLang(l.id)} className={`chip h-9 px-4 text-sm ${lang === l.id ? 'on' : ''}`}>{l.label}</button>
          ))}
        </div>
      </Section>

      <Section title={t('set.quality')} desc={t('set.qualityDesc')}>
        <div className="grid grid-cols-2 gap-3">
          {QUALITIES.map((id) => {
            const on = s.quality === id
            const zs = id === 'zs'
            return (
              <button
                key={id}
                type="button"
                onClick={() => patch({ quality: id })}
                className={`lift relative text-left p-4 rounded-2xl border transition-colors ${on ? 'border-[rgba(143,176,255,0.4)]' : 'border-white/10 hover:border-white/20'}`}
                style={{ background: on ? 'var(--glass-blue)' : 'var(--glass)', boxShadow: 'var(--shine)' }}
              >
                {on && <Check className="absolute top-3 right-3 w-4 h-4 text-zs-accent-light" />}
                <div className={`text-sm font-semibold flex items-center gap-1.5 ${zs ? 'zs-badge' : 'text-zs-text'}`}>
                  {zs && <Sparkles className="w-4 h-4" />}{t(`q.${id}` as Key)}
                </div>
                <div className="text-xs text-zs-muted mt-1 leading-relaxed">{t(`q.${id}.spec` as Key)}</div>
                {zs && <div className="text-xs text-zs-muted leading-relaxed">{t('q.zsPlus')}</div>}
                {zs && <div className="text-[11px] mt-2 zs-badge">{t('q.zsOnly')}</div>}
              </button>
            )
          })}
        </div>
        <p className="text-xs mt-3 text-zs-muted">
          {t('set.nowStreaming')} :{' '}
          <span className="text-zs-accent-light font-medium">
            {meta ? `${t(`q.${meta.quality}` as Key)} · ${meta.codec} ${meta.kbps} kbps${meta.sampleRate ? ` · ${meta.sampleRate / 1000} kHz` : ''} · ${meta.engine === 'zs' ? 'ZS Engine' : 'fallback'}` : t('set.nothing')}
          </span>
        </p>
      </Section>

      <Section title={t('set.playback')}>
        <Line label={t('set.zsLoudness')} desc={t('set.zsLoudnessDesc')}>
          <Toggle label={t('set.zsLoudness')} on={s.zsLoudness !== false} onChange={(v) => patch({ zsLoudness: v })} />
        </Line>
        <Line label={t('set.normalize')} desc={t('set.normalizeDesc')}>
          <Toggle label={t('set.normalize')} on={s.normalize} onChange={(v) => patch({ normalize: v })} />
        </Line>
        <Line label={t('set.autoplay')} desc={t('set.autoplayDesc')}>
          <Toggle label={t('set.autoplay')} on={s.autoplay} onChange={(v) => patch({ autoplay: v })} />
        </Line>
        <Line label={t('set.crossfade')} desc={t('set.crossfadeDesc')}>
          <div className="flex items-center gap-3 w-44">
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={s.crossfade ?? 0}
              aria-label={t('set.crossfade')}
              onChange={(e) => patch({ crossfade: Number(e.target.value) })}
              className="zs-range flex-1"
              style={{ ['--fill' as string]: `${((s.crossfade ?? 0) / 12) * 100}%` }}
            />
            <span className="text-xs text-zs-text tabular-nums w-14 text-right">{s.crossfade ? `${s.crossfade} s` : t('set.crossfadeOff')}</span>
          </div>
        </Line>
      </Section>

      <Section title={t('set.algo')} desc={t('set.algoDesc')}>
        <div className="grid grid-cols-3 gap-3">
          {(['style', 'balanced', 'discover'] as const).map((m) => {
            const on = (s.algoMode ?? 'balanced') === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => patch({ algoMode: m })}
                className={`lift relative text-left p-4 rounded-2xl border transition-colors ${on ? 'border-[rgba(143,176,255,0.4)]' : 'border-white/10 hover:border-white/20'}`}
                style={{ background: on ? 'var(--glass-blue)' : 'var(--glass)', boxShadow: 'var(--shine)' }}
              >
                {on && <Check className="absolute top-3 right-3 w-4 h-4 text-zs-accent-light" />}
                <div className="text-sm font-semibold text-zs-text">{t(`algo.${m}` as Key)}</div>
                <div className="text-xs text-zs-muted mt-1 leading-relaxed">{t(`algo.${m}.desc` as Key)}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title={t('set.eq')} desc={t('set.eqDesc')}>
        <Line label={t('set.eqEnable')} desc={s.eqEnabled ? t('set.preset', { p: preset ? t(`eq.${preset}` as Key) : t('set.custom') }) : t('set.off')}>
          <Toggle label={t('set.eqEnable')} on={s.eqEnabled} onChange={(v) => patch({ eqEnabled: v })} />
        </Line>
        <div className={`transition-opacity ${s.eqEnabled ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-wrap gap-2 my-3">
            {(Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[]).map((k) => (
              <button key={k} type="button" onClick={() => patch({ eq: [...EQ_PRESETS[k]] })} className={`chip ${preset === k ? 'on' : ''}`}>
                {t(`eq.${k}` as Key)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-4">
            {EQ_BANDS.map((f, i) => (
              <label key={f} className="flex flex-col items-center gap-2">
                <span className="text-xs text-zs-text tabular-nums">{s.eq[i] > 0 ? '+' : ''}{s.eq[i]} dB</span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={s.eq[i]}
                  aria-label={`${f} Hz`}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setS((prev) => ({ ...prev, eq: prev.eq.map((g, j) => (j === i ? v : g)) }))
                  }}
                  className="zs-range w-full"
                  style={{ ['--fill' as string]: `${((s.eq[i] + 12) / 24) * 100}%` }}
                />
                <span className="text-[11px] text-zs-muted">{f >= 1000 ? `${f / 1000}k` : f} Hz</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('set.perf')}>
        <Line label={t('set.tray')} desc={t('set.trayDesc')}>
          <Toggle label={t('set.tray')} on={s.closeToTray !== false} onChange={(v) => patch({ closeToTray: v })} />
        </Line>
        <Line label={t('set.dyn')} desc={t('set.dynDesc')}>
          <Toggle label={t('set.dyn')} on={s.dynamicColor !== false} onChange={(v) => patch({ dynamicColor: v })} />
        </Line>
        {discord && (
          <Line label={t('set.discord')} desc={t('set.discordDesc')}>
            <Toggle label={t('set.discord')} on={s.discord === true} onChange={(v) => patch({ discord: v })} />
          </Line>
        )}
        {info && (
          <Line
            label={t('set.hw')}
            desc={
              <>
                {t(info.hardwareAccelerationPref ? 'set.hwOn' : 'set.hwOff')}
                <br />
                {t('set.hwAudio')}
                {hwPending && <span className="block mt-2 text-zs-accent-light">{t('set.hwPending')}</span>}
              </>
            }
          >
            <div className="flex flex-col items-end gap-2">
              <Toggle label={t('set.hw')} on={info.hardwareAccelerationPref} onChange={setHw} />
              {hwPending && (
                <button type="button" onClick={() => window.zsound.relaunch()} className="btn-primary px-3 h-8 gap-1.5 text-xs whitespace-nowrap">
                  <RotateCw className="w-3.5 h-3.5" />{t('set.hwRestart')}
                </button>
              )}
            </div>
          </Line>
        )}
      </Section>

      <Section title={t('upd.title')}>
        <Updates />
      </Section>

      <Section title={t('set.shortcuts')}>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          {([
            ['set.sc.play', 'Space'],
            ['set.sc.skip', 'Ctrl + → / ←'],
            ['set.sc.seek', '→ / ←'],
            ['set.sc.volume', 'Ctrl + ↑ / ↓'],
            ['set.sc.mute', 'M'],
            ['set.sc.search', 'Ctrl + K'],
          ] as [Key, string][]).map(([k, keys]) => (
            <div key={k} className="contents">
              <span className="text-zs-muted">{t(k)}</span>
              <kbd className="text-zs-text font-mono text-xs justify-self-end">{keys}</kbd>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-xs text-zs-muted px-1">{t('set.footer', { v: info?.version ?? '' })}</p>
    </div>
  )
}
