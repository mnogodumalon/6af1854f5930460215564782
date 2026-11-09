import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { IconCopy, IconExternalLink, IconQrcode, IconTrophy, IconPlus, IconCircleCheck } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor, countOf } from '@/config/plan';
import type { EnrichedUmfragen } from '@/types/enriched';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { useClock, gruss, namen } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { Button } from '@/components/ui/button';
import { qrSvgString } from '@/components/widgets/QrCode';
import { usePublicPageLink } from '@/components/widgets/PublicPageQr';

const esc = (v: string) => v.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function openQrTab(title: string, link: string, labels: { png: string; svg: string }) {
  const svg = qrSvgString(link, { margin: 4 });
  const file = (title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'qr-code').slice(0, 60);
  /* i18n-exempt */
  const html = tx`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#fff;color:#111}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2vh;padding:2vh 4vw;box-sizing:border-box;text-align:center}
h1{margin:0;font-size:clamp(1.5rem,4vw,3rem)}#qr{height:62vh;width:62vh;max-width:90vw;max-height:90vw}#qr svg{width:100%;height:100%}
p{margin:0;word-break:break-all;font-size:clamp(.9rem,1.6vw,1.3rem);color:#444}
.b{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}button{font:inherit;padding:.6em 1.2em;border-radius:8px;border:1px solid #888;background:#f4f4f4;cursor:pointer}@media print{.b{display:none}}</style></head>
<body><h1>${esc(title)}</h1><div id="qr">${svg}</div><p>${esc(link)}</p>
<div class="b"><button id="png">${esc(labels.png)}</button><button id="svg">${esc(labels.svg)}</button></div>
<script>
var F=${JSON.stringify(file)};
function dl(u,n){var a=document.createElement('a');a.href=u;a.download=n;document.body.appendChild(a);a.click();a.remove();}
function src(){return document.querySelector('#qr svg').outerHTML;}
document.getElementById('svg').onclick=function(){var u=URL.createObjectURL(new Blob([src()],{type:'image/svg+xml'}));dl(u,F+'.svg');setTimeout(function(){URL.revokeObjectURL(u)},1000);};
document.getElementById('png').onclick=function(){var u=URL.createObjectURL(new Blob([src()],{type:'image/svg+xml'}));var i=new Image();i.onload=function(){var c=document.createElement('canvas');c.width=c.height=1024;var x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#fff';x.fillRect(0,0,1024,1024);x.drawImage(i,0,0,1024,1024);c.toBlob(function(b){var p=URL.createObjectURL(b);dl(p,F+'.png');setTimeout(function(){URL.revokeObjectURL(p)},1000);},'image/png');URL.revokeObjectURL(u);};i.src=u;};
</script></body></html>`;
  const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
  if (!w) toast.error(tx('Der Browser hat den neuen Tab blockiert.'));
}

type Filter = 'all' | 'offen' | 'ohneFinal';

interface SlotStat { id: string; beginn?: string; ende?: string; ja: number; vielleicht: number }

function fmtSlot(beginn?: string, ende?: string): string {
  if (!beginn) return '—';
  const loc = { locale: dateFnsLocale() };
  const b = new Date(beginn);
  let s = format(b, 'EEE, dd.MM.yyyy, HH:mm', loc);
  if (ende) {
    const e = new Date(ende);
    s += format(b, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd') ? `–${format(e, 'HH:mm')}` : ` – ${format(e, 'dd.MM. HH:mm')}`;
  }
  return s;
}

function SurveyCard({ u, slots, answers, onOpen, onFinal, onClose, finalLabel, finalText }: {
  u: EnrichedUmfragen;
  slots: SlotStat[];
  answers: number;
  onOpen: () => void;
  onFinal: (() => void) | null;
  onClose: (() => void) | null;
  finalLabel: string;
  finalText?: string;
}) {
  const { link } = usePublicPageLink('umfragen', u.record_id);
  const closed = lookupKey(u.fields.status) === 'geschlossen';
  const best = slots.length > 0 ? [...slots].sort((a, b) => b.ja - a.ja || a.vielleicht - b.vielleicht)[0] : undefined;
  const hasBest = !!best && best.ja > 0;
  const copy = () => {
    if (!link) return;
    void navigator.clipboard?.writeText(link).then(() => toast.success(tx('Link kopiert')));
  };
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onOpen} className="min-w-0 text-left">
            <div className="font-semibold truncate">{u.fields.titel ?? '—'}</div>
            <div className="text-sm text-muted-foreground truncate">
              {u.fields.ort ? `${u.fields.ort} · ` : ''}{countOf('antworten', answers, appLabel('antworten'))}
            </div>
          </button>
          <span className={`shrink-0 text-xs font-medium ${closed ? 'text-muted-foreground' : 'text-emerald-600'}`}>
            {u.fields.status?.label ?? ''}
          </span>
        </div>

        {u.finaler_terminName || finalText ? (
          <div className="flex items-center gap-2 text-sm font-medium min-w-0">
            <IconCircleCheck size={16} className="shrink-0 text-emerald-600" />
            <span className="truncate">{tx('Finaler Termin')}: {finalText ?? u.finaler_terminName}</span>
          </div>
        ) : hasBest ? (
          <div className="flex items-center gap-2 text-sm min-w-0">
            <IconTrophy size={16} className="shrink-0 text-amber-600" />
            <span className="truncate">{tx`Meiste Ja: ${fmtSlot(best!.beginn, best!.ende)} (${best!.ja})`}</span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {slots.length === 0 ? tx('Noch keine Terminvorschläge') : tx('Noch keine Ja-Antworten')}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copy} disabled={!link}>
            <IconCopy size={16} className="shrink-0" /> {tx('Link kopieren')}
          </Button>
          <Button size="sm" variant="outline" disabled={!link} onClick={() => link && window.open(link, '_blank', 'noopener')}>
            <IconExternalLink size={16} className="shrink-0" /> {tx('Öffnen')}
          </Button>
          <Button size="sm" variant="outline" disabled={!link} onClick={() => link && openQrTab(u.fields.titel ?? '', link, { png: tx('Als PNG herunterladen'), svg: tx('Als SVG herunterladen') })}>
            <IconQrcode size={16} className="shrink-0" /> {tx('QR-Code')}
          </Button>
          {!closed && onFinal && (
            <Button size="sm" onClick={onFinal}>{finalLabel}</Button>
          )}
          {!closed && !onFinal && onClose && (
            <Button size="sm" onClick={onClose}>{tx('Umfrage schließen')}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { umfragen, terminvorschlaege, antworten } = data;
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('all');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type !== 'umfragen') return undefined;
      const go = flowActionFor('umfragen', 'status', top.record.record_id, 'geschlossen');
      return go ? { label: tx('Umfrage schließen'), onClick: go } : undefined;
    },
  });
  const enrichedUmfragen = crud.enriched.umfragen;

  const stats = useMemo(() => {
    const slotsBy = new Map<string, SlotStat[]>();
    const answersBy = new Map<string, Set<string>>();
    const byTermin = new Map<string, { ja: number; vielleicht: number }>();
    for (const a of antworten) {
      const uid = extractRecordId(a.fields.umfrage);
      if (uid) {
        const set = answersBy.get(uid) ?? new Set<string>();
        set.add(a.fields.zeilen_kennung || `${a.fields.teilnehmer_vorname ?? ''} ${a.fields.teilnehmer_nachname ?? ''}`.trim() || a.record_id);
        answersBy.set(uid, set);
      }
      const tid = extractRecordId(a.fields.termin_1);
      if (!tid) continue;
      const c = byTermin.get(tid) ?? { ja: 0, vielleicht: 0 };
      const k = lookupKey(a.fields.antwort_1);
      if (k === 'ja') c.ja++;
      else if (k === 'vielleicht') c.vielleicht++;
      byTermin.set(tid, c);
    }
    for (const t of terminvorschlaege) {
      const uid = extractRecordId(t.fields.umfrage);
      if (!uid) continue;
      const c = byTermin.get(t.record_id) ?? { ja: 0, vielleicht: 0 };
      const list = slotsBy.get(uid) ?? [];
      list.push({ id: t.record_id, beginn: t.fields.beginn, ende: t.fields.ende, ...c });
      slotsBy.set(uid, list);
    }
    return { slotsBy, answersBy };
  }, [antworten, terminvorschlaege]);

  const isOpen = (u: EnrichedUmfragen) => lookupKey(u.fields.status) !== 'geschlossen';
  const hasFinal = (u: EnrichedUmfragen) => !!extractRecordId(u.fields.finaler_termin);
  const offene = enrichedUmfragen.filter(isOpen);
  const ohneFinal = enrichedUmfragen.filter(u => isOpen(u) && !hasFinal(u));

  const shown = [...(filter === 'offen' ? offene : filter === 'ohneFinal' ? ohneFinal : enrichedUmfragen)]
    .sort((a, b) => Number(isOpen(b)) - Number(isOpen(a)) || (b.createdat ?? '').localeCompare(a.createdat ?? ''));

  const bestOf = (id: string): SlotStat | undefined => {
    const s = stats.slotsBy.get(id) ?? [];
    return [...s].sort((a, b) => b.ja - a.ja || a.vielleicht - b.vielleicht)[0];
  };

  const todayKey = format(clock, 'yyyy-MM-dd');
  const upcoming = terminvorschlaege
    .filter(t => {
      const uid = extractRecordId(t.fields.umfrage);
      const u = uid ? enrichedUmfragen.find(x => x.record_id === uid) : undefined;
      return !!u && isOpen(u) && !!t.fields.beginn && t.fields.beginn.slice(0, 10) >= todayKey;
    })
    .sort((a, b) => (a.fields.beginn ?? '').localeCompare(b.fields.beginn ?? ''));

  const titles = offene.map(u => u.fields.titel ?? '').filter(Boolean);
  const context = enrichedUmfragen.length === 0
    ? tx('Lege deine erste Umfrage an und teile den Link.')
    : ohneFinal.length > 0
      ? tx`Noch ohne finalen Termin: ${namen(ohneFinal.map(u => u.fields.titel ?? ''), 3)}.`
      : offene.length > 0
        ? tx`Offen: ${namen(titles, 3)}.`
        : tx('Alle Umfragen sind abgeschlossen.');

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground">{context}</p>
        </div>
        {crud.umfragen.canWrite && (
          <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>
            <IconPlus size={16} className="shrink-0" /> {tx('Neue Umfrage')}
          </Button>
        )}
      </div>

      <DashboardGrid
        variant="split"
        kpis={enrichedUmfragen.length > 0 ? (
          <StatStrip>
            <StatStripItem
              title={tx('Offene Umfragen')}
              value={offene.length}
              onClick={() => setFilter(f => f === 'offen' ? 'all' : 'offen')}
              active={filter === 'offen'}
            />
            <StatStripItem
              title={tx('Ohne finalen Termin')}
              value={ohneFinal.length}
              tone={ohneFinal.length > 0 ? 'warning' : 'default'}
              onClick={() => setFilter(f => f === 'ohneFinal' ? 'all' : 'ohneFinal')}
              active={filter === 'ohneFinal'}
            />
          </StatStrip>
        ) : undefined}
        primary={
          <div className="space-y-3">
            <h2 className="font-semibold">{appLabel('umfragen')}</h2>
            {shown.length === 0 ? (
              <div className="rounded-xl border bg-card p-6 text-center space-y-3">
                <p className="text-muted-foreground">{tx('Keine Umfragen in dieser Ansicht.')}</p>
                {crud.umfragen.canWrite && (
                  <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>{tx('Umfrage anlegen')}</Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                {shown.map(u => {
                  const best = bestOf(u.record_id);
                  const hasBest = !!best && best.ja > 0;
                  const goFinal = hasBest ? flowActionFor('umfragen', 'finaler_termin', u.record_id, best!.id) : null;
                  const goClose = flowActionFor('umfragen', 'status', u.record_id, 'geschlossen');
                  return (
                    <SurveyCard
                      key={u.record_id}
                      u={u}
                      slots={stats.slotsBy.get(u.record_id) ?? []}
                      answers={stats.answersBy.get(u.record_id)?.size ?? 0}
                      onOpen={() => crud.umfragen.openDetail(u)}
                      onFinal={hasFinal(u) ? null : goFinal}
                      onClose={goClose}
                      finalLabel={tx('Besten Termin festlegen')}
                      finalText={(() => {
                        const fid = extractRecordId(u.fields.finaler_termin);
                        const ft = fid ? (stats.slotsBy.get(u.record_id) ?? []).find(x => x.id === fid) ?? terminvorschlaege.find(x => x.record_id === fid) : undefined;
                        if (!ft) return undefined;
                        return 'fields' in ft ? fmtSlot(ft.fields.beginn, ft.fields.ende) : fmtSlot(ft.beginn, ft.ende);
                      })()}
                    />
                  );
                })}
              </div>
            )}
          </div>
        }
        aside={
          <WorkList
            title={tx('Nächste Terminvorschläge')}
            items={upcoming.map(t => {
              const uid = extractRecordId(t.fields.umfrage) ?? '';
              const u = enrichedUmfragen.find(x => x.record_id === uid);
              const st = (stats.slotsBy.get(uid) ?? []).find(s => s.id === t.record_id);
              return {
                id: t.record_id,
                title: fmtSlot(t.fields.beginn, t.fields.ende),
                secondLine: (
                  <>
                    <span className="font-medium text-emerald-600">{tx`${st?.ja ?? 0} Ja`}</span>
                    <span className="text-muted-foreground"> · {tx`${st?.vielleicht ?? 0} Vielleicht`} · {u?.fields.titel ?? ''}</span>
                  </>
                ),
              };
            })}
            onItemClick={id => {
              const t = terminvorschlaege.find(x => x.record_id === id);
              if (t) crud.terminvorschlaege.openDetail(t);
            }}
            empty={{ text: tx('Keine anstehenden Terminvorschläge in offenen Umfragen.') }}
          />
        }
      />
      {crud.surfaces}
    </div>
  );
}
