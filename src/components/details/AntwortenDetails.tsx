import type { Antworten, Umfragen, Terminvorschlaege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';

export interface AntwortenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Antworten;
  /** N:1-Ziel „Umfragen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  umfragenList: Umfragen[];
  /** Klick auf die Umfragen-Relation → overlay.push auf dessen Detail. */
  onOpenUmfragen?: (record: Umfragen) => void;
  /** N:1-Ziel „Terminvorschlaege": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  terminvorschlaegeList: Terminvorschlaege[];
  /** Klick auf die Terminvorschlaege-Relation → overlay.push auf dessen Detail. */
  onOpenTerminvorschlaege?: (record: Terminvorschlaege) => void;
}

export function AntwortenDetails({
  record,
  umfragenList,
  onOpenUmfragen,
  terminvorschlaegeList,
  onOpenTerminvorschlaege,
}: AntwortenDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const umfrageTarget = umfragenList.find(r => r.record_id === extractRecordId(record.fields.umfrage));
  const termin_1Target = terminvorschlaegeList.find(r => r.record_id === extractRecordId(record.fields.termin_1));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('antworten', 'zeilen_kennung')} value={record.fields.zeilen_kennung} format="text" />
        <RecordField label={fieldLabel('antworten', 'teilnehmer_vorname')} value={record.fields.teilnehmer_vorname} format="text" />
        <RecordField label={fieldLabel('antworten', 'teilnehmer_nachname')} value={record.fields.teilnehmer_nachname} format="text" />
        <RecordField label={fieldLabel('antworten', 'antwort_1')} value={record.fields.antwort_1} format="pill" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('antworten', 'umfrage')}
          name={umfrageTarget?.fields.ort ?? '—'}
          meta={[umfrageTarget?.fields.titel].filter(Boolean).join(' · ') || undefined}
          onClick={umfrageTarget && onOpenUmfragen ? () => onOpenUmfragen!(umfrageTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('antworten', 'termin_1')}
          name={termin_1Target?.fields.beginn ?? '—'}
          meta={undefined}
          onClick={termin_1Target && onOpenTerminvorschlaege ? () => onOpenTerminvorschlaege!(termin_1Target!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.ANTWORTEN} recordId={record.record_id} readOnly={!perms.canWrite('antworten')} />
    </>
  );
}
