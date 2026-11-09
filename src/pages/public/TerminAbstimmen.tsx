import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconCheck, IconQuestionMark, IconX, IconTrophy } from '@tabler/icons-react';
import { PublicShell } from '@/components/PublicShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import {
  loadPublicPagesConfig, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import {
  useLiveList, useJourneySubmit, fieldRef, fieldText, fieldDate, fieldLookup,
  type PlanStep, type JourneyRecord,
} from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'termin-abstimmen';
type Answer = 'ja' | 'vielleicht' | 'nein';

function newRowId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const ANSWER_STYLE: Record<Answer, string> = {
  ja: 'bg-emerald-500 text-white border-emerald-500',
  vielleicht: 'bg-amber-400 text-white border-amber-400',
  nein: 'bg-rose-500 text-white border-rose-500',
};

// Fixed first column: names only, at most 35 % of the screen and 9rem, text may wrap.
const NAME_COL = 'sticky left-0 z-10 p-2 break-words align-middle';
const NAME_COL_STYLE = { width: 'min(35vw, 9rem)', maxWidth: 'min(35vw, 9rem)' } as const;

function AnswerIcon({ a, size = 16 }: { a: Answer; size?: number }) {
  if (a === 'ja') return <IconCheck size={size} />;
  if (a === 'vielleicht') return <IconQuestionMark size={size} />;
  return <IconX size={size} />;
}

export default function TerminAbstimmen() {
  const [params] = useSearchParams();
  const linkedId = params.get('umfrage');
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [rowId, setRowId] = useState(newRowId);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(e => {
        if (e instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);
  const umfragen = useLiveList(port, 'umfragen', { intervalMs: 0 });
  const termineLive = useLiveList(port, 'terminvorschlaege', { intervalMs: 30_000 });
  const antwortenLive = useLiveList(port, 'antworten', { intervalMs: 30_000 });

  const umfrage = linkedId ? umfragen.records.find(r => r.id === linkedId) ?? null : null;
  const termine = useMemo(
    () =>
      termineLive.records
        .filter(r => linkedId !== null && fieldRef(r, 'umfrage') === linkedId)
        .sort((a, b) => (fieldDate(a, 'beginn') ?? '').localeCompare(fieldDate(b, 'beginn') ?? '')),
    [termineLive.records, linkedId],
  );
  const antworten = useMemo(
    () => antwortenLive.records.filter(r => linkedId !== null && fieldRef(r, 'umfrage') === linkedId),
    [antwortenLive.records, linkedId],
  );

  // One participant row = all answer records sharing the row id.
  const rows = useMemo(() => {
    const map = new Map<string, { id: string; name: string; at: string; byTermin: Record<string, Answer> }>();
    for (const r of antworten) {
      const key = fieldText(r, 'zeilen_kennung') || r.id;
      let row = map.get(key);
      if (!row) {
        row = {
          id: key,
          name: `${fieldText(r, 'teilnehmer_vorname')} ${fieldText(r, 'teilnehmer_nachname')}`.trim(),
          at: r.createdAt ?? '',
          byTermin: {},
        };
        map.set(key, row);
      }
      const t = fieldRef(r, 'termin_1');
      const a = fieldLookup(r, 'antwort_1')?.key as Answer | undefined;
      if (t && a) row.byTermin[t] = a;
    }
    return Array.from(map.values()).sort((a, b) => a.at.localeCompare(b.at));
  }, [antworten]);

  const counts = useMemo(() => {
    const c: Record<string, { ja: number; vielleicht: number }> = {};
    for (const t of termine) c[t.id] = { ja: 0, vielleicht: 0 };
    for (const row of rows) {
      for (const [tid, a] of Object.entries(row.byTermin)) {
        if (!c[tid]) continue;
        if (a === 'ja') c[tid].ja += 1;
        if (a === 'vielleicht') c[tid].vielleicht += 1;
      }
    }
    return c;
  }, [termine, rows]);
  const maxJa = Math.max(0, ...Object.values(counts).map(c => c.ja));

  const closed = umfrage ? fieldLookup(umfrage, 'status')?.key === 'geschlossen' : false;
  const finalId = umfrage ? fieldRef(umfrage, 'finaler_termin') : null;
  const finalTermin = finalId ? termine.find(t => t.id === finalId) ?? null : null;

  const plan: PlanStep[] = useMemo(
    () =>
      termine
        .filter(t => answers[t.id])
        .map(t => ({
          key: `antwort-${t.id}`,
          entity: 'antworten' as const,
          primary: false,
          values: {
            zeilen_kennung: rowId,
            teilnehmer_vorname: vorname.trim(),
            teilnehmer_nachname: nachname.trim(),
            antwort_1: answers[t.id],
            umfrage: linkedId,
            termin_1: t.id,
          },
        })),
    [termine, answers, rowId, vorname, nachname, linkedId],
  );

  const submit = useJourneySubmit(
    port ?? (null as never),
    plan,
    {
      draftKey: `termin-abstimmen-${linkedId ?? 'x'}`,
      check: async () => {
        if (!port || !linkedId) return tx('Dieser Link passt zu keiner Umfrage.');
        const fresh = await port.get('umfragen', linkedId);
        if (!fresh) return tx('Dieser Link passt zu keiner Umfrage.');
        if (fieldLookup(fresh, 'status')?.key === 'geschlossen') return tx('Die Umfrage ist inzwischen geschlossen.');
        return null;
      },
      onSuccess: () => {
        setSent(true);
        setVorname('');
        setNachname('');
        setAnswers({});
        setRowId(newRowId());
        void antwortenLive.reload();
      },
    },
  );

  const onSend = async () => {
    setMessage(null);
    if (!vorname.trim() || !nachname.trim()) {
      setMessage(tx('Bitte trage Vor- und Nachname ein.'));
      return;
    }
    if (plan.length === 0) {
      setMessage(tx('Bitte wähle für mindestens einen Termin eine Antwort.'));
      return;
    }
    setSent(false);
    const res = await submit.run();
    if (res) submit.reset();
  };

  if (loading || !cfg || !page || !port) {
    return <PublicShell loading={loading} unavailable={!loading || unavailable} />;
  }
  if (!linkedId) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Bitte öffne den Link zu deiner Umfrage. Diese Seite zeigt immer genau eine Umfrage.')}
        </p>
      </PublicShell>
    );
  }
  if (!umfragen.loaded && umfragen.error) {
    return <PublicShell title={page.title}><LoadProblem onRetry={umfragen.reload} /></PublicShell>;
  }
  if (!umfragen.loaded) return <PublicShell loading />;
  if (!umfrage) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link passt zu keiner Umfrage. Scanne bitte den QR-Code noch einmal.')}
        </p>
      </PublicShell>
    );
  }

  const beschreibung = fieldText(umfrage, 'beschreibung');
  const ort = fieldText(umfrage, 'ort');
  const terminLabel = (t: JourneyRecord) => `${fieldText(t, 'beginn')} – ${fieldText(t, 'ende')}`;

  return (
    <PublicShell title={fieldText(umfrage, 'titel')} description={beschreibung || undefined} wide>
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground" data-key="umfrage">
          {tx('Umfrage')}: <span className="font-medium text-foreground">{fieldText(umfrage, 'titel')}</span>
        </p>
        {ort && <p className="text-sm text-muted-foreground">{tx('Ort')}: <span className="font-medium text-foreground">{ort}</span></p>}

        {closed && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm">
            <p className="font-semibold text-emerald-800">{tx('Die Umfrage ist geschlossen.')}</p>
            <p className="mt-1 text-emerald-900">
              {finalTermin ? tx`Finaler Termin: ${terminLabel(finalTermin)}` : tx('Der finale Termin steht noch nicht fest.')}
            </p>
          </div>
        )}

        {!closed && termine.length > 0 && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2">
            <Input
              value={vorname}
              onChange={e => setVorname(e.target.value)}
              placeholder={tx('Vorname')}
              aria-label={tx('Vorname')}
              autoComplete="given-name"
              maxLength={200}
              className="w-full"
            />
            <Input
              value={nachname}
              onChange={e => setNachname(e.target.value)}
              placeholder={tx('Nachname')}
              aria-label={tx('Nachname')}
              autoComplete="family-name"
              maxLength={200}
              className="w-full"
            />
          </div>
        )}

        {termine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx('Noch keine Terminvorschläge.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className={`${NAME_COL} bg-muted text-left font-medium`} style={NAME_COL_STYLE}>{tx('Name')}</th>
                  {termine.map(t => {
                    const best = !closed && maxJa > 0 && counts[t.id].ja === maxJa;
                    const isFinal = closed && t.id === finalId;
                    return (
                      <th
                        key={t.id}
                        className={`min-w-[9rem] p-2 text-center font-medium ${best || isFinal ? 'bg-emerald-100 text-emerald-900' : ''}`}
                      >
                        <div>{fieldText(t, 'beginn')}</div>
                        <div className="text-xs font-normal text-muted-foreground">{tx('bis')} {fieldText(t, 'ende')}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t">
                    <td className={`${NAME_COL} bg-background font-medium`} style={NAME_COL_STYLE}>{row.name}</td>
                    {termine.map(t => {
                      const a = row.byTermin[t.id];
                      return (
                        <td key={t.id} className="p-2 text-center">
                          {a ? (
                            <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${ANSWER_STYLE[a]}`}>
                              <AnswerIcon a={a} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">–</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!closed && (
                  <tr className="border-t-2 bg-muted/20 align-top">
                    <td className={`${NAME_COL} bg-muted font-medium`} style={NAME_COL_STYLE}>
                      {`${vorname} ${nachname}`.trim() || tx('Du')}
                    </td>
                    {termine.map(t => (
                      <td key={t.id} className="p-2 text-center" data-key="termin_1">
                        <div className="inline-flex gap-1" role="radiogroup" data-key="antwort_1" aria-label={terminLabel(t)}>
                          {(['ja', 'vielleicht', 'nein'] as Answer[]).map(a => {
                            const on = answers[t.id] === a;
                            return (
                              <button
                                key={a}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                aria-label={a === 'ja' ? tx('Ja') : a === 'vielleicht' ? tx('Vielleicht') : tx('Nein')}
                                onClick={() => setAnswers(prev => ({ ...prev, [t.id]: a }))}
                                className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${on ? ANSWER_STYLE[a] : 'bg-background text-muted-foreground'}`}
                              >
                                <AnswerIcon a={a} />
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30 text-xs">
                  <td className={`${NAME_COL} bg-muted font-medium`} style={NAME_COL_STYLE}>{tx('Summe')}</td>
                  {termine.map(t => {
                    const best = !closed && maxJa > 0 && counts[t.id].ja === maxJa;
                    return (
                      <td key={t.id} className={`p-2 text-center ${best ? 'bg-emerald-100 text-emerald-900' : ''}`}>
                        <div className="flex items-center justify-center gap-1 font-semibold">
                          {best && <IconTrophy size={14} />}
                          {tx`${counts[t.id].ja} Ja`}
                        </div>
                        <div className="text-muted-foreground">{tx`${counts[t.id].vielleicht} Vielleicht`}</div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!closed && termine.length > 0 && (
          <div className="space-y-2">
            {(message || submit.error) && (
              <p role="alert" className="text-sm text-destructive">
                {message ?? (submit.offline ? tx('Keine Verbindung — deine Eingaben sind gesichert.') : tx('Das Speichern hat nicht geklappt. Bitte versuche es noch einmal.'))}
              </p>
            )}
            {sent && !submit.error && (
              <p role="status" className="text-sm font-medium text-emerald-700">{tx('Danke, deine Antwort ist gespeichert.')}</p>
            )}
            <p className="text-xs text-muted-foreground" data-key="zeilen_kennung">
              {tx('Eindeutige Kennung der Zeile')}: <span className="font-mono">{rowId}</span>
            </p>
            <Button type="button" className="w-full sm:w-auto" disabled={submit.submitting} onClick={() => void onSend()}>
              {submit.submitting ? tx('Wird gespeichert …') : tx('Antwort speichern')}
            </Button>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
