import type { Terminvorschlaege, Umfragen, Antworten } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';
import { usePermissions } from '@/lib/permissions';

export interface TerminvorschlaegeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Terminvorschlaege;
  /** N:1-Ziel „Umfragen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  umfragenList: Umfragen[];
  /** Klick auf die Umfragen-Relation → overlay.push auf dessen Detail. */
  onOpenUmfragen?: (record: Umfragen) => void;
  /** 1:N „Umfragen" (finaler_termin): VOLLE Liste — der Block filtert auf diesen Record. */
  umfragenFinalerTerminList: Umfragen[];
  /** Zeilen-Klick → overlay.push auf das Umfragen-Detail (nie der Edit-Dialog). */
  onOpenUmfragenFinalerTermin: (record: Umfragen) => void;
  /** Kontextuelles „+": öffnet den Umfragen-Dialog mit diesem Record vorgesetzt. */
  onAddUmfragenFinalerTermin?: () => void;
  /** 1:N „Antworten" (termin_1): VOLLE Liste — der Block filtert auf diesen Record. */
  antwortenList: Antworten[];
  /** Zeilen-Klick → overlay.push auf das Antworten-Detail (nie der Edit-Dialog). */
  onOpenAntworten: (record: Antworten) => void;
  /** Kontextuelles „+": öffnet den Antworten-Dialog mit diesem Record vorgesetzt. */
  onAddAntworten?: () => void;
}

export function TerminvorschlaegeDetails({
  record,
  umfragenList,
  onOpenUmfragen,
  umfragenFinalerTerminList,
  onOpenUmfragenFinalerTermin,
  onAddUmfragenFinalerTermin,
  antwortenList,
  onOpenAntworten,
  onAddAntworten,
}: TerminvorschlaegeDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const umfrageTarget = umfragenList.find(r => r.record_id === extractRecordId(record.fields.umfrage));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('terminvorschlaege', 'beginn')} value={record.fields.beginn} format="datetime" />
        <RecordField label={fieldLabel('terminvorschlaege', 'ende')} value={record.fields.ende} format="datetime" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('terminvorschlaege', 'umfrage')}
          name={umfrageTarget?.fields.ort ?? '—'}
          meta={[umfrageTarget?.fields.titel].filter(Boolean).join(' · ') || undefined}
          onClick={umfrageTarget && onOpenUmfragen ? () => onOpenUmfragen!(umfrageTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={`${appLabel('umfragen')} · ${fieldLabel('umfragen', 'finaler_termin')}`}
        items={umfragenFinalerTerminList.filter(r => extractRecordId(r.fields.finaler_termin) === record.record_id)}
        map={r => ({ name: r.fields.ort ?? appLabel('umfragen'), meta: undefined })}
        onOpen={onOpenUmfragenFinalerTermin}
        onAdd={onAddUmfragenFinalerTermin}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('antworten')}
        items={antwortenList.filter(r => extractRecordId(r.fields.termin_1) === record.record_id)}
        map={r => ({ name: r.fields.zeilen_kennung ?? appLabel('antworten'), meta: undefined })}
        onOpen={onOpenAntworten}
        onAdd={onAddAntworten}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TERMINVORSCHLAEGE} recordId={record.record_id} readOnly={!perms.canWrite('terminvorschlaege')} />
    </>
  );
}
