// ============================================================================
// MOTOR PURO — ESTEIRA CONTÍNUA DE TREINO CLÍNICO v3.1
// Regras 100% puras: nenhuma função lê o relógio (todayIso sempre explícito).
// ============================================================================

import {
  ARQUETIPOS_E3,
  CENARIOS_E4,
  FERIAS_CALENDARIO,
  FERIAS_DIA_BY_ISO,
  FRASE_BASE_SERVICO,
  HAB_UNIVERSAIS,
  PILOTO_PASSOS,
  QUEIXAS_E1,
  RODIZIOS_TREINO,
  TEMPLATE_PROMPT_A,
  TEMPLATE_PROMPT_B,
  TEMPLATE_PROMPT_C,
  TEMPLATE_PROMPT_D1,
  TEMPLATE_PROMPT_D2,
  type AmbienteE1,
  type AmbienteE3,
  type AmbienteE4,
  type ArquetipoE3,
  type BlocoMacro,
  type CenarioE4,
  type Eixo,
  type FeriasWeekId,
  type FonteTipo,
  type HabId,
  type NaoPodePassarItem,
  type Passo,
  type Pemc,
  type QueixaE1,
  type RodizioTreinoDef,
  type Score,
  type SN,
  type TipoLog,
  type TreinoClinicoState,
  type TreinoLogEntry,
  type Veredito,
  type VisualTipo,
} from '../data/treino_clinico_data.ts';
import type { Central6AnoState } from '../data/central6ano_data.ts';
import { sanitizePiiText } from '../utils/piiGuard.ts';

// ── Índices rápidos ─────────────────────────────────────────────────────────
export const E1_BY_SLUG = new Map<string, QueixaE1>(QUEIXAS_E1.map((q) => [q.slug, q]));
export const E3_BY_SLUG = new Map<string, ArquetipoE3>(ARQUETIPOS_E3.map((a) => [a.slug, a]));
export const E4_BY_SLUG = new Map<string, CenarioE4>(CENARIOS_E4.map((c) => [c.slug, c]));

export function findCatalogItem(slug: string): QueixaE1 | ArquetipoE3 | CenarioE4 | null {
  return E1_BY_SLUG.get(slug) || E3_BY_SLUG.get(slug) || E4_BY_SLUG.get(slug) || null;
}

export function formatTargetLabel(slug: string): string {
  const e1 = E1_BY_SLUG.get(slug);
  if (e1) return `#${String(e1.num).padStart(2, '0')} ${e1.nome}`;
  const e3 = E3_BY_SLUG.get(slug);
  if (e3) return `E3 #${e3.num} · ${e3.nome}`;
  const e4 = E4_BY_SLUG.get(slug);
  if (e4) return `E4 #${e4.num} · ${e4.nome}`;
  return slug;
}

export function recalculateTreinoDerivedState(
  state: TreinoClinicoState,
  affectedDateIso?: string
): TreinoClinicoState {
  // Se a alteração não tocou na janela de contingência (<= 2027-01-17), preserva snapshot existente
  if (affectedDateIso && affectedDateIso > '2027-01-17') {
    return state;
  }
  const preFreezeDates = state.logs
    .map((l) => l.dateIso)
    .filter((d) => d <= '2027-01-17')
    .sort();
  if (preFreezeDates.length === 0) {
    return {
      ...state,
      contingencia10jan: undefined,
      metas: {
        ...state.metas,
        primeiraPassadaCedeu: false,
      },
    };
  }
  const latestPreFreeze = preFreezeDates[preFreezeDates.length - 1];
  const freshBase: TreinoClinicoState = { ...state, contingencia10jan: undefined };
  const snap = computeContingencia10Jan(freshBase, latestPreFreeze);
  return {
    ...state,
    contingencia10jan: snap,
    metas: {
      ...state.metas,
      primeiraPassadaCedeu: latestPreFreeze >= '2027-01-10' ? snap.disparou : false,
    },
  };
}

export function habIdsDe(item: { eixo: Eixo; relatedHabIds: HabId[] }): HabId[] {
  const seen = new Set<HabId>();
  const out: HabId[] = [];
  for (const id of [...item.relatedHabIds, ...HAB_UNIVERSAIS[item.eixo]]) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ── Datas puras (YYYY-MM-DD, fuso local só no helper de UI) ─────────────────
function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}

function formatUtcIso(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, deltaDays: number): string {
  const dt = parseIsoUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return formatUtcIso(dt);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const a = parseIsoUtc(fromIso).getTime();
  const b = parseIsoUtc(toIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 0 = domingo, 1 = segunda ... 6 = sábado */
export function dayOfWeekIso(iso: string): number {
  return parseIsoUtc(iso).getUTCDay();
}

/** Segunda-feira da semana (seg..dom) em YYYY-MM-DD */
export function weekIsoOf(iso: string): string {
  const dow = dayOfWeekIso(iso);
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, diffToMon);
}

export function formatDateDDMM(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d || '01'}/${m || '01'}`;
}

export function formatDateDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d || '01'}/${m || '01'}/${y || '2026'}`;
}

// ── Estado inicial e migração defensiva ─────────────────────────────────────
export function createInitialTreinoClinicoState(): TreinoClinicoState {
  return {
    schemaVersion: 31,
    logs: [],
    naoPodePassar: [],
    visual: {},
    piloto: { naoRealizados: [] },
    baselineInvalida: false,
    metas: { primeiraPassadaCedeu: false },
    internato: {
      posPlantaoByDate: {},
      semanaPesadaByWeek: {},
      diaLivreByDate: {},
      casoRealByDate: {},
      semPacienteNovoSeg: {},
    },
    rituais: {},
  };
}

function isPlainObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function boolMap(v: unknown): Record<string, boolean> {
  if (!isPlainObj(v)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'boolean') out[k] = val;
  }
  return out;
}

export function migrateTreinoClinicoState(raw: unknown): TreinoClinicoState {
  const base = createInitialTreinoClinicoState();
  if (!isPlainObj(raw) || raw.schemaVersion !== 31) return base;

  const logs = Array.isArray(raw.logs)
    ? (raw.logs.filter((l) => isPlainObj(l) && typeof l.id === 'string' && typeof l.dateIso === 'string') as unknown as TreinoLogEntry[])
    : [];

  const naoPodePassar = Array.isArray(raw.naoPodePassar)
    ? (raw.naoPodePassar.filter(
        (n) => isPlainObj(n) && typeof n.id === 'string' && typeof n.slug === 'string' && typeof n.texto === 'string'
      ) as unknown as NaoPodePassarItem[])
    : [];

  const visual: Record<string, { feitoEm: string }> = {};
  if (isPlainObj(raw.visual)) {
    for (const [slug, val] of Object.entries(raw.visual)) {
      if (isPlainObj(val) && typeof val.feitoEm === 'string') {
        visual[slug] = { feitoEm: val.feitoEm };
      }
    }
  }

  const pilotoRaw = isPlainObj(raw.piloto) ? raw.piloto : {};
  const internatoRaw = isPlainObj(raw.internato) ? raw.internato : {};
  const rituais: Record<string, { efFamiliar?: boolean }> = {};
  if (isPlainObj(raw.rituais)) {
    for (const [wk, val] of Object.entries(raw.rituais)) {
      if (isPlainObj(val)) {
        rituais[wk] = { efFamiliar: Boolean(val.efFamiliar) };
      }
    }
  }

  let contingencia10jan: TreinoClinicoState['contingencia10jan'];
  if (
    isPlainObj(raw.contingencia10jan) &&
    typeof raw.contingencia10jan.num === 'number' &&
    typeof raw.contingencia10jan.den === 'number' &&
    typeof raw.contingencia10jan.disparou === 'boolean' &&
    typeof raw.contingencia10jan.calculadoEm === 'string'
  ) {
    contingencia10jan = {
      num: raw.contingencia10jan.num,
      den: raw.contingencia10jan.den,
      disparou: raw.contingencia10jan.disparou,
      calculadoEm: raw.contingencia10jan.calculadoEm,
    };
  }

  return {
    schemaVersion: 31,
    logs,
    naoPodePassar,
    visual,
    piloto: {
      auditoriaEm: typeof pilotoRaw.auditoriaEm === 'string' ? pilotoRaw.auditoriaEm : undefined,
      naoRealizados: Array.isArray(pilotoRaw.naoRealizados)
        ? pilotoRaw.naoRealizados.filter((x): x is string => typeof x === 'string')
        : [],
    },
    baselineInvalida: Boolean(raw.baselineInvalida),
    contingencia10jan,
    metas: {
      primeiraPassadaCedeu: isPlainObj(raw.metas) ? Boolean(raw.metas.primeiraPassadaCedeu) : false,
    },
    internato: {
      posPlantaoByDate: boolMap(internatoRaw.posPlantaoByDate),
      semanaPesadaByWeek: boolMap(internatoRaw.semanaPesadaByWeek),
      diaLivreByDate: boolMap(internatoRaw.diaLivreByDate),
      casoRealByDate: boolMap(internatoRaw.casoRealByDate),
      semPacienteNovoSeg: boolMap(internatoRaw.semPacienteNovoSeg),
    },
    rituais,
  };
}

// ── Normalização, ordenação e veredito (§3.1 – §3.2) ────────────────────────
export const MECANISMO_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeMecanismo(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function sortLogsChrono(logs: TreinoLogEntry[]): TreinoLogEntry[] {
  return [...logs].sort((a, b) => {
    if (a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
    if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function computeVeredito(entry: Pick<TreinoLogEntry, 'tipo' | 'avaliavel' | 'h3Bloco' | 'pemc' | 'baselineFase' | 'score' | 'erroCritico'>): Veredito {
  if (entry.tipo === 'Micro' || entry.tipo === 'SERVIÇO' || entry.tipo === 'GRAVAÇÃO') {
    return 'NA';
  }
  if (!entry.avaliavel) return 'Repetir';

  if (entry.tipo === 'Nova' || entry.tipo === 'Var') {
    return entry.h3Bloco === 'S' && entry.pemc.kind === 'nenhuma' ? 'Limpo' : 'Repetir';
  }
  if (entry.tipo === 'BASELINE') {
    if (entry.baselineFase === 'A') {
      return entry.h3Bloco === 'S' && entry.pemc.kind === 'baselineSN' && entry.pemc.valor === 'N'
        ? 'Limpo'
        : 'Repetir';
    }
    return entry.h3Bloco === 'S' && entry.pemc.kind === 'nenhuma' ? 'Limpo' : 'Repetir';
  }
  // E3 | E4
  return entry.score.kind === 'rubrica' && entry.score.valor === 4 && !entry.erroCritico
    ? 'Limpo'
    : 'Repetir';
}

// ── Validações (§3.5) ───────────────────────────────────────────────────────
export type LogValidationCode =
  | 'CAMPO_OBRIGATORIO'
  | 'SLUG_INVALIDO_PARA_TIPO'
  | 'MECANISMO_FORMATO'
  | 'SCORE_4_COM_ERRO_CRITICO'
  | 'BASELINE_FASE'
  | 'BASELINE_PEMC_FORMATO'
  | 'MIN_FORA_FAIXA'
  | 'ORIGEM_REFERENCIADA';

export interface LogValidationResult {
  ok: boolean;
  errorCode?: LogValidationCode;
  errorMessage?: string;
  warnings: string[];
}

export function validateLogEntry(
  entry: TreinoLogEntry,
  existingLogs: TreinoLogEntry[]
): LogValidationResult {
  const warnings: string[] = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dateIso)) {
    return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Data inválida (use YYYY-MM-DD).', warnings };
  }

  // Min
  if (entry.tipo === 'Micro') {
    if (entry.min !== null && (!Number.isInteger(entry.min) || entry.min < 1 || entry.min > 180)) {
      return { ok: false, errorCode: 'MIN_FORA_FAIXA', errorMessage: 'Minutos devem estar entre 1 e 180.', warnings };
    }
  } else {
    if (entry.min === null || !Number.isInteger(entry.min) || entry.min < 1 || entry.min > 180) {
      return { ok: false, errorCode: 'MIN_FORA_FAIXA', errorMessage: 'Minutos obrigatórios (1 a 180).', warnings };
    }
  }

  // Slug válido por tipo + unlockAfter
  if (entry.tipo === 'Nova' || entry.tipo === 'Var') {
    const q = E1_BY_SLUG.get(entry.slug);
    if (!q) {
      return { ok: false, errorCode: 'SLUG_INVALIDO_PARA_TIPO', errorMessage: 'Slug não pertence ao E1.', warnings };
    }
    if (q.unlockAfter && entry.dateIso <= q.unlockAfter) {
      return {
        ok: false,
        errorCode: 'SLUG_INVALIDO_PARA_TIPO',
        errorMessage: `Queixa ${q.slug} reservada ao BASELINE até ${formatDateDDMMYYYY(q.unlockAfter)}.`,
        warnings,
      };
    }
    if (!entry.mecanismo || !MECANISMO_RE.test(entry.mecanismo)) {
      return {
        ok: false,
        errorCode: 'MECANISMO_FORMATO',
        errorMessage: 'Mecanismo obrigatório em minúsculas (ex.: iamcsst, tep-submacico).',
        warnings,
      };
    }
    if (entry.h3Bloco !== 'S' && entry.h3Bloco !== 'N') {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: '3H_bloco deve ser S ou N.', warnings };
    }
    if (entry.pemc.kind !== 'nenhuma' && entry.pemc.kind !== 'omissao') {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'PEMC inválido para Nova/Var.', warnings };
    }
    if (entry.score.kind !== 'rubrica') {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Score E2 (0–4) obrigatório.', warnings };
    }
    if (entry.iaPista === null) {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'IA_Pista? (S/N) obrigatório.', warnings };
    }
    const prevMecs = existingLogs
      .filter((l) => l.id !== entry.id && (l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === entry.slug && l.mecanismo)
      .map((l) => l.mecanismo);
    if (prevMecs.includes(entry.mecanismo)) {
      warnings.push(`Mecanismo "${entry.mecanismo}" já usado antes em ${entry.slug}: esta linha não conta para domínio.`);
    }
  } else if (entry.tipo === 'BASELINE') {
    if (entry.slug !== 'sensorio-focal-glicemia') {
      return { ok: false, errorCode: 'SLUG_INVALIDO_PARA_TIPO', errorMessage: 'BASELINE exige slug sensorio-focal-glicemia.', warnings };
    }
    if (entry.baselineFase !== 'A' && entry.baselineFase !== 'B') {
      return { ok: false, errorCode: 'BASELINE_FASE', errorMessage: 'Informe a fase do BASELINE (A ou B).', warnings };
    }
    if (existingLogs.some((l) => l.id !== entry.id && l.tipo === 'BASELINE' && l.baselineFase === entry.baselineFase)) {
      return { ok: false, errorCode: 'BASELINE_FASE', errorMessage: `Já existe linha de BASELINE-${entry.baselineFase}.`, warnings };
    }
    if (entry.baselineFase === 'A' && entry.pemc.kind !== 'baselineSN') {
      return { ok: false, errorCode: 'BASELINE_PEMC_FORMATO', errorMessage: 'BASELINE-A exige PEMC apenas S ou N.', warnings };
    }
    if (entry.baselineFase === 'B' && entry.pemc.kind !== 'nenhuma' && entry.pemc.kind !== 'omissao') {
      return { ok: false, errorCode: 'BASELINE_PEMC_FORMATO', errorMessage: 'BASELINE-B exige PEMC "nenhuma" ou descrição.', warnings };
    }
    if (entry.h3Bloco !== 'S' && entry.h3Bloco !== 'N') {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: '3H_bloco deve ser S ou N.', warnings };
    }
    if (entry.score.kind !== 'rubrica' || entry.iaPista === null) {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Score e IA_Pista? são obrigatórios no BASELINE.', warnings };
    }
  } else if (entry.tipo === 'E3') {
    const a = E3_BY_SLUG.get(entry.slug);
    if (!a) {
      return { ok: false, errorCode: 'SLUG_INVALIDO_PARA_TIPO', errorMessage: 'Slug não pertence ao E3.', warnings };
    }
    if (a.unlockAfter && entry.dateIso <= a.unlockAfter) {
      return {
        ok: false,
        errorCode: 'SLUG_INVALIDO_PARA_TIPO',
        errorMessage: `${a.slug} só libera após ${formatDateDDMMYYYY(a.unlockAfter)}.`,
        warnings,
      };
    }
    if (!entry.ambiente) {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Ambiente obrigatório para E3.', warnings };
    }
    if (entry.score.kind !== 'rubrica' || entry.iaPista === null) {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Score (0–4) e IA_Pista? são obrigatórios em E3.', warnings };
    }
    if (entry.erroCritico && entry.score.valor === 4) {
      return { ok: false, errorCode: 'SCORE_4_COM_ERRO_CRITICO', errorMessage: 'Erro ou atraso crítico impede nota 4/4.', warnings };
    }
  } else if (entry.tipo === 'E4') {
    if (!E4_BY_SLUG.has(entry.slug)) {
      return { ok: false, errorCode: 'SLUG_INVALIDO_PARA_TIPO', errorMessage: 'Slug não pertence ao E4.', warnings };
    }
    if (!entry.ambiente) {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Ambiente obrigatório para E4.', warnings };
    }
    if (entry.score.kind !== 'rubrica' || entry.iaPista === null) {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'Score (0–4) e IA_Pista? são obrigatórios em E4.', warnings };
    }
    if (entry.erroCritico && entry.score.valor === 4) {
      return { ok: false, errorCode: 'SCORE_4_COM_ERRO_CRITICO', errorMessage: 'Erro ou atraso crítico impede nota 4/4.', warnings };
    }
  } else if (entry.tipo === 'Micro' || entry.tipo === 'SERVIÇO' || entry.tipo === 'GRAVAÇÃO') {
    if (!findCatalogItem(entry.slug)) {
      return { ok: false, errorCode: 'SLUG_INVALIDO_PARA_TIPO', errorMessage: 'Slug não existe no catálogo.', warnings };
    }
    if (entry.tipo === 'GRAVAÇÃO' && entry.score.kind !== 'muletas') {
      return { ok: false, errorCode: 'CAMPO_OBRIGATORIO', errorMessage: 'GRAVAÇÃO exige contagem de muletas.', warnings };
    }
  }

  const calcVeredito = computeVeredito(entry);
  if (entry.vereditoIA && entry.vereditoIA !== calcVeredito) {
    warnings.push(`Divergência de veredito: IA ditou "${entry.vereditoIA}", regra objetiva calculou "${calcVeredito}".`);
  }

  return { ok: true, warnings };
}

export function canDeleteLogEntry(logId: string, nppItems: NaoPodePassarItem[]): { ok: boolean; errorCode?: LogValidationCode; errorMessage?: string } {
  const linked = nppItems.filter((item) => item.origemLogId === logId);
  if (linked.length > 0) {
    return {
      ok: false,
      errorCode: 'ORIGEM_REFERENCIADA',
      errorMessage: `Esta linha origina ${linked.length} item(ns) em "Não Pode Passar". Exclua ou realoque antes.`,
    };
  }
  return { ok: true };
}

// ── Avaliabilidade, sequências e domínio (§3.3 – §3.4) ──────────────────────
export function mecanismosUsadosDe(slug: string, logs: TreinoLogEntry[]): string[] {
  const ordered = sortLogsChrono(logs);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of ordered) {
    if ((l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === slug && l.mecanismo) {
      if (!seen.has(l.mecanismo)) {
        seen.add(l.mecanismo);
        out.push(l.mecanismo);
      }
    }
  }
  return out;
}

/** Retorna as linhas avaliáveis para domínio de um slug E1 (em ordem cronológica) */
export function seqE1(slug: string, logs: TreinoLogEntry[]): TreinoLogEntry[] {
  const ordered = sortLogsChrono(logs);
  const seenMecs = new Set<string>();
  const seq: TreinoLogEntry[] = [];
  for (const l of ordered) {
    if ((l.tipo !== 'Nova' && l.tipo !== 'Var') || l.slug !== slug) continue;
    const mec = l.mecanismo || '';
    const isInedita = mec.length > 0 && !seenMecs.has(mec);
    if (mec) seenMecs.add(mec);
    if (l.avaliavel && l.iaPista === false && isInedita) {
      seq.push(l);
    }
  }
  return seq;
}

export function seqE3E4(tipo: 'E3' | 'E4', slug: string, logs: TreinoLogEntry[]): TreinoLogEntry[] {
  return sortLogsChrono(logs).filter(
    (l) => l.tipo === tipo && l.slug === slug && l.avaliavel && l.iaPista === false
  );
}

export interface DominioE1Info {
  dominada: boolean;
  dominadaDesde: string | null;
  manutencaoVencida: boolean;
  diasDesdeUltima: number | null;
  status: 'pendente' | 'em_treino' | 'com_pemc' | 'dominada' | 'revisar';
  seq: TreinoLogEntry[];
}

export function computeDominioE1(slug: string, logs: TreinoLogEntry[], todayIso: string): DominioE1Info {
  const allSlugLogs = logs.filter((l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === slug);
  const seq = seqE1(slug, logs);

  let dominadaDesde: string | null = null;
  let lastPairIdx = -1;

  for (let i = 1; i < seq.length; i += 1) {
    const p = seq[i - 1];
    const c = seq[i];
    if (
      p.veredito === 'Limpo' &&
      c.veredito === 'Limpo' &&
      p.dateIso < c.dateIso &&
      c.tipo === 'Var'
    ) {
      dominadaDesde = c.dateIso;
      lastPairIdx = i;
    }
  }

  let dominada = lastPairIdx >= 0;
  if (dominada) {
    for (let j = lastPairIdx + 1; j < seq.length; j += 1) {
      if (seq[j].veredito === 'Repetir') {
        dominada = false;
        dominadaDesde = null;
        break;
      }
    }
  }

  const ultimaSeq = seq.length > 0 ? seq[seq.length - 1] : null;
  const diasDesdeUltima = ultimaSeq ? diffDaysIso(ultimaSeq.dateIso, todayIso) : null;
  const manutencaoVencida = Boolean(dominada && diasDesdeUltima !== null && diasDesdeUltima >= 21);

  let status: DominioE1Info['status'];
  if (allSlugLogs.length === 0) {
    status = 'pendente';
  } else if (dominada && manutencaoVencida) {
    status = 'revisar';
  } else if (dominada) {
    status = 'dominada';
  } else if (ultimaSeq && ultimaSeq.pemc.kind === 'omissao') {
    status = 'com_pemc';
  } else {
    status = 'em_treino';
  }

  return { dominada, dominadaDesde, manutencaoVencida, diasDesdeUltima, status, seq };
}

export interface DominioE3E4Info {
  dominada: boolean;
  dominadaDesde: string | null;
  ambientesNoPar: string[];
  temUpaEPaNoPar: boolean;
  seq: TreinoLogEntry[];
}

export function computeDominioE3E4(tipo: 'E3' | 'E4', slug: string, logs: TreinoLogEntry[]): DominioE3E4Info {
  const seq = seqE3E4(tipo, slug, logs);
  let dominadaDesde: string | null = null;
  let lastPairIdx = -1;
  let ambientesNoPar: string[] = [];

  for (let i = 1; i < seq.length; i += 1) {
    const p = seq[i - 1];
    const c = seq[i];
    if (p.veredito === 'Limpo' && c.veredito === 'Limpo') {
      dominadaDesde = c.dateIso;
      lastPairIdx = i;
      ambientesNoPar = [p.ambiente || '', c.ambiente || ''].filter(Boolean);
    }
  }

  let dominada = lastPairIdx >= 0;
  if (dominada) {
    for (let j = lastPairIdx + 1; j < seq.length; j += 1) {
      if (seq[j].veredito === 'Repetir') {
        dominada = false;
        dominadaDesde = null;
        ambientesNoPar = [];
        break;
      }
    }
  }

  const temUpa = ambientesNoPar.some((a) => a.toLowerCase().includes('upa'));
  const temPa = ambientesNoPar.some((a) => a.toLowerCase().includes('pa de cidade pequena'));

  return {
    dominada,
    dominadaDesde,
    ambientesNoPar,
    temUpaEPaNoPar: temUpa && temPa,
    seq,
  };
}

// ── Métricas (§3.6) ─────────────────────────────────────────────────────────
export interface TreinoMetrics {
  h3Num: number;
  h3Den: number;
  h3Pct: number | null;
  pemcNum: number;
  pemcDen: number;
  pemcPct: number | null;
  dominadasE1: number;
  totalAlvoE1: number;
  primeiraPassadaE1: number;
  primeiraPassadaE3Porta: number;
  primeiraPassadaE4: number;
  iaPistaNum: number;
  iaPistaDen: number;
  gatilhoClaudeIaPista: boolean;
  pendentesChecar: number;
  divergenciasVeredito: number;
}

export function computeTreinoMetrics(state: TreinoClinicoState, todayIso: string): TreinoMetrics {
  const ordered = sortLogsChrono(state.logs);
  const e1Avaliaveis = ordered.filter(
    (l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.avaliavel && l.iaPista === false
  );

  const h3Num = e1Avaliaveis.filter((l) => l.h3Bloco === 'S').length;
  const h3Den = e1Avaliaveis.length;
  const pemcNum = e1Avaliaveis.filter((l) => l.pemc.kind === 'omissao').length;
  const pemcDen = e1Avaliaveis.length;

  const totalAlvoE1 = todayIso <= '2027-01-24' ? 19 : 20;
  const queixasContadas = QUEIXAS_E1.filter((q) => !q.unlockAfter || todayIso > q.unlockAfter);
  const dominadasE1 = queixasContadas.filter((q) => computeDominioE1(q.slug, state.logs, todayIso).dominada).length;

  const primeiraPassadaE1 = QUEIXAS_E1.filter(
    (q) => !q.reservedBaseline && state.logs.some((l) => l.tipo === 'Nova' && l.slug === q.slug)
  ).length;
  const primeiraPassadaE3Porta = ARQUETIPOS_E3.filter(
    (a) => a.rubrica === 'E3-Porta' && state.logs.some((l) => l.tipo === 'E3' && l.slug === a.slug)
  ).length;
  const primeiraPassadaE4 = CENARIOS_E4.filter((c) =>
    state.logs.some((l) => l.tipo === 'E4' && l.slug === c.slug)
  ).length;

  const comIaPista = ordered.filter((l) => l.iaPista !== null);
  const iaPistaNum = comIaPista.filter((l) => l.iaPista === true).length;
  const iaPistaDen = comIaPista.length;
  const ultimas5 = comIaPista.slice(-5);
  const gatilhoClaudeIaPista = ultimas5.filter((l) => l.iaPista === true).length >= 2;

  const pendentesChecar = state.naoPodePassar.filter((n) => !n.checado).length;
  const divergenciasVeredito = ordered.filter((l) => l.vereditoIA && l.vereditoIA !== l.veredito).length;

  return {
    h3Num,
    h3Den,
    h3Pct: h3Den > 0 ? Math.round((h3Num / h3Den) * 100) : null,
    pemcNum,
    pemcDen,
    pemcPct: pemcDen > 0 ? Math.round((pemcNum / pemcDen) * 100) : null,
    dominadasE1,
    totalAlvoE1,
    primeiraPassadaE1,
    primeiraPassadaE3Porta,
    primeiraPassadaE4,
    iaPistaNum,
    iaPistaDen,
    gatilhoClaudeIaPista,
    pendentesChecar,
    divergenciasVeredito,
  };
}

// ── Rodízio ativo & Macro-Bloco (§1.5, §2.1) ───────────────────────────────
export function getBlocoMacro(todayIso: string): BlocoMacro {
  if (todayIso <= '2026-11-29') return 'BLOCO0_PILOTO';
  if (todayIso <= '2027-01-24') return 'BLOCO1_FERIAS';
  return 'BLOCO2_INTERNATO';
}

export function rodizioAtivo(
  todayIso: string,
  central6Ano?: Partial<Central6AnoState> | null
): RodizioTreinoDef | null {
  const manualId = central6Ano?.rodizioId;
  if (manualId && manualId in RODIZIOS_TREINO) {
    return RODIZIOS_TREINO[manualId];
  }
  if (manualId === 'sprint_r1') return null;
  if (todayIso >= '2027-01-25') {
    for (const def of Object.values(RODIZIOS_TREINO)) {
      if (todayIso >= def.de && todayIso <= def.ate) return def;
    }
  }
  return null;
}

// ── Filas puras e ambiente E3 (§2.1, §2.5.3) ───────────────────────────────
export function filaPrimeiraPassadaE1(todayIso: string, logs: TreinoLogEntry[]): QueixaE1[] {
  return QUEIXAS_E1.filter((q) => {
    if (q.reservedBaseline && q.unlockAfter && todayIso <= q.unlockAfter) return false;
    return !logs.some((l) => l.tipo === 'Nova' && l.slug === q.slug);
  });
}

export function filaPrimeiraPassadaE3(todayIso: string, logs: TreinoLogEntry[]): ArquetipoE3[] {
  return ARQUETIPOS_E3.filter((a) => {
    if (a.unlockAfter && todayIso <= a.unlockAfter) return false;
    return !logs.some((l) => l.tipo === 'E3' && l.slug === a.slug);
  });
}

export function filaPrimeiraPassadaE4(logs: TreinoLogEntry[]): CenarioE4[] {
  return CENARIOS_E4.filter((c) => !logs.some((l) => l.tipo === 'E4' && l.slug === c.slug));
}

export function sugerirAmbienteE3(slug: string, logs: TreinoLogEntry[]): AmbienteE3 {
  const arq = E3_BY_SLUG.get(slug);
  if (!arq) return 'UPA com retaguarda';
  if (slug === 'e3-regulacao-cross') return 'PA de cidade pequena sem lab';
  if (slug === 'e3-ubs-longitudinal') return 'UBS';
  const limpos = logs.filter((l) => l.tipo === 'E3' && l.slug === slug && l.veredito === 'Limpo');
  const temUpa = limpos.some((l) => l.ambiente === 'UPA com retaguarda');
  const temPa = limpos.some((l) => l.ambiente === 'PA de cidade pequena sem lab');
  if (temUpa && !temPa) return 'PA de cidade pequena sem lab';
  if (temPa && !temUpa) return 'UPA com retaguarda';
  return arq.ambientePadrao;
}

// ── Contingência de 10/jan (§2.3.5) ─────────────────────────────────────────
export interface ContingenciaSnapshot {
  num: number;
  den: number;
  disparou: boolean;
  calculadoEm: string;
}

export function computeContingencia10Jan(
  state: TreinoClinicoState,
  todayIso: string
): ContingenciaSnapshot {
  if (todayIso >= '2027-01-18' && state.contingencia10jan) {
    return state.contingencia10jan;
  }
  const ordered = sortLogsChrono(state.logs);
  const linhas10 = ordered.filter(
    (l) =>
      (l.tipo === 'Nova' || l.tipo === 'Var') &&
      l.avaliavel &&
      l.iaPista === false &&
      l.dateIso >= '2026-11-21' &&
      l.dateIso <= '2027-01-10'
  );
  const num = linhas10.filter((l) => l.h3Bloco === 'S').length;
  const den = linhas10.length;
  const disparou = den === 0 || num / den < 0.8;
  return { num, den, disparou, calculadoEm: todayIso };
}

export function isSaidaAntecipadaS7(logs: TreinoLogEntry[]): boolean {
  const avaliaveis = sortLogsChrono(logs).filter(
    (l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.avaliavel && l.iaPista === false
  );
  if (avaliaveis.length < 10) return false;
  const janela10 = avaliaveis.slice(-10);
  const sCount = janela10.filter((l) => l.h3Bloco === 'S').length;
  return sCount >= 8;
}

// ── Escolha dinâmica de D1 (§2.3.3 e §2.4.5) ───────────────────────────────
export function escolherD1(
  todayIso: string,
  logs: TreinoLogEntry[],
  excludeSlugs: string[],
  rodizioAlvos?: string[] | null,
  priorizarManutencao?: boolean
): { slug: string; origem: 'servico' | 'reteste' | 'confirmacao' | 'manutencao' | 'rodizio' | 'fallback' } | null {
  const excluded = new Set(excludeSlugs);
  const ordered = sortLogsChrono(logs);

  // Excluir qualquer slug que já tenha linha hoje
  for (const l of ordered) {
    if (l.dateIso === todayIso && (l.tipo === 'Nova' || l.tipo === 'Var')) {
      excluded.add(l.slug);
    }
  }

  const rodizioSet = new Set(rodizioAlvos || []);

  // Internato prioridade 0: SERVIÇO <= 7 dias com apontamento sem Var posterior
  if (priorizarManutencao) {
    const servicosRecentes = ordered
      .filter(
        (l) =>
          l.tipo === 'SERVIÇO' &&
          l.servicoResultado === 'apontamento' &&
          E1_BY_SLUG.has(l.slug) &&
          diffDaysIso(l.dateIso, todayIso) <= 7 &&
          diffDaysIso(l.dateIso, todayIso) >= 0 &&
          !excluded.has(l.slug)
      )
      .reverse();
    for (const s of servicosRecentes) {
      const temVarPosterior = ordered.some(
        (l) =>
          l.tipo === 'Var' &&
          l.slug === s.slug &&
          (l.dateIso > s.dateIso || (l.dateIso === s.dateIso && l.criadoEm > s.criadoEm))
      );
      if (!temVarPosterior) {
        return { slug: s.slug, origem: 'servico' };
      }
    }
  }

  const candidatos = QUEIXAS_E1.filter((q) => {
    if (q.reservedBaseline && q.unlockAfter && todayIso <= q.unlockAfter) return false;
    if (excluded.has(q.slug)) return false;
    return ordered.some((l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === q.slug);
  });

  if (candidatos.length === 0) return null;

  const infoBySlug = new Map(
    candidatos.map((q) => {
      const slugLogs = ordered.filter((l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === q.slug);
      const lastAny = slugLogs[slugLogs.length - 1];
      const dom = computeDominioE1(q.slug, logs, todayIso);
      const lastSeq = dom.seq[dom.seq.length - 1] || null;
      return [q.slug, { q, lastAny, dom, lastSeq }] as const;
    })
  );

  const byRodizioFirst = <T extends { q: QueixaE1 }>(arr: T[], cmp: (a: T, b: T) => number): T[] => {
    return [...arr].sort((a, b) => {
      if (rodizioSet.size > 0) {
        const aIn = rodizioSet.has(a.q.slug) ? 0 : 1;
        const bIn = rodizioSet.has(b.q.slug) ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
      }
      return cmp(a, b);
    });
  };

  // 1. Reteste: última linha Nova/Var é Repetir ou não avaliável (iaPista / !avaliavel)
  const reteste = candidatos
    .map((q) => infoBySlug.get(q.slug)!)
    .filter((i) => i.lastAny.veredito === 'Repetir' || !i.lastAny.avaliavel || i.lastAny.iaPista !== false);

  if (reteste.length > 0) {
    const sorted = byRodizioFirst(reteste, (a, b) => {
      if (a.lastAny.dateIso !== b.lastAny.dateIso) return a.lastAny.dateIso > b.lastAny.dateIso ? -1 : 1;
      return a.q.num - b.q.num;
    });
    return { slug: sorted[0].q.slug, origem: 'reteste' };
  }

  // Função auxiliar para confirmação e manutenção
  const confirmacao = candidatos
    .map((q) => infoBySlug.get(q.slug)!)
    .filter((i) => !i.dom.dominada && i.lastSeq && i.lastSeq.veredito === 'Limpo');

  const manutencao = candidatos
    .map((q) => infoBySlug.get(q.slug)!)
    .filter((i) => i.dom.manutencaoVencida);

  const pickConfirmacao = () => {
    if (confirmacao.length === 0) return null;
    const sorted = byRodizioFirst(confirmacao, (a, b) => {
      const da = a.lastSeq!.dateIso;
      const db = b.lastSeq!.dateIso;
      if (da !== db) return da < db ? -1 : 1;
      return a.q.num - b.q.num;
    });
    return { slug: sorted[0].q.slug, origem: 'confirmacao' as const };
  };

  const pickManutencao = () => {
    if (manutencao.length === 0) return null;
    const sorted = byRodizioFirst(manutencao, (a, b) => {
      const da = a.dom.diasDesdeUltima ?? 0;
      const db = b.dom.diasDesdeUltima ?? 0;
      if (da !== db) return db - da;
      return a.q.num - b.q.num;
    });
    return { slug: sorted[0].q.slug, origem: 'manutencao' as const };
  };

  if (priorizarManutencao) {
    const m = pickManutencao();
    if (m) return m;
    const c = pickConfirmacao();
    if (c) return c;
    if (rodizioSet.size > 0) {
      const rodCands = candidatos
        .map((q) => infoBySlug.get(q.slug)!)
        .filter((i) => rodizioSet.has(i.q.slug));
      if (rodCands.length > 0) {
        rodCands.sort((a, b) => a.dom.seq.length - b.dom.seq.length || a.q.num - b.q.num);
        return { slug: rodCands[0].q.slug, origem: 'rodizio' };
      }
    }
  } else {
    const c = pickConfirmacao();
    if (c) return c;
    const m = pickManutencao();
    if (m) return m;
  }

  // Fallback: última linha mais antiga
  const allInfo = candidatos.map((q) => infoBySlug.get(q.slug)!);
  allInfo.sort((a, b) => {
    if (a.lastAny.dateIso !== b.lastAny.dateIso) return a.lastAny.dateIso < b.lastAny.dateIso ? -1 : 1;
    return a.q.num - b.q.num;
  });
  return { slug: allInfo[0].q.slug, origem: 'fallback' };
}

// ── Piloto (§2.2) ───────────────────────────────────────────────────────────
export interface PilotoPassoStatus {
  id: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  dataNominal: string;
  titulo: string;
  tetoMin: number;
  concluido: boolean;
  ok: boolean | null;
  somaMin: number;
  naoRealizado: boolean;
}

export function computePilotoStatus(state: TreinoClinicoState, todayIso: string): PilotoPassoStatus[] {
  const logs = state.logs;
  const posPiloto = todayIso > '2026-11-29';

  const evalPasso = (
    def: (typeof PILOTO_PASSOS)[number],
    matchedLogs: TreinoLogEntry[],
    concluido: boolean
  ): PilotoPassoStatus => {
    const somaMin = matchedLogs.reduce((acc, l) => acc + (l.min || 0), 0);
    const ok = concluido
      ? somaMin <= def.tetoMin &&
        matchedLogs.every((l) => l.iaPista === false && l.linhaEm2min === true)
      : null;
    const naoRealizado =
      !concluido && (posPiloto && def.id !== 'P5' || state.piloto.naoRealizados.includes(def.id));
    return {
      ...def,
      concluido,
      ok,
      somaMin,
      naoRealizado,
    };
  };

  const p1Logs = logs.filter((l) => l.tipo === 'Nova' && l.slug === 'dor-toracica');
  const p2Var = logs.filter((l) => l.tipo === 'Var' && l.slug === 'dor-toracica');
  const p2Nova = logs.filter((l) => l.tipo === 'Nova' && l.slug === 'dor-abdominal');
  const p3Logs = logs.filter((l) => l.tipo === 'E4' && l.slug === 'e4-deterioracao-silenciosa');
  const p4Logs = logs.filter((l) => l.tipo === 'E3' && l.slug === 'e3-atb-empirico');
  const p5Logs = logs.filter((l) => l.tipo === 'BASELINE' && l.baselineFase === 'A');

  return [
    evalPasso(PILOTO_PASSOS[0], p1Logs.slice(0, 1), p1Logs.length > 0),
    evalPasso(
      PILOTO_PASSOS[1],
      [...p2Var.slice(0, 1), ...p2Nova.slice(0, 1)],
      p2Var.length > 0 && p2Nova.length > 0
    ),
    evalPasso(PILOTO_PASSOS[2], p3Logs.slice(0, 1), p3Logs.length > 0),
    evalPasso(PILOTO_PASSOS[3], p4Logs.slice(0, 1), p4Logs.length > 0),
    evalPasso(
      PILOTO_PASSOS[4],
      p5Logs.slice(0, 1),
      p5Logs.length > 0 && Boolean(state.piloto.auditoriaEm)
    ),
  ];
}

// ── Bloco Visual semanal (§2.3.4) ───────────────────────────────────────────
export interface PlanoVisualSemana {
  slug: string;
  visualTipo: VisualTipo;
  modo: 'anexado_A' | 'pin_visual_D1';
  dataAlvo: string;
}

export function computeBlocoVisualSemana(
  weekId: FeriasWeekId,
  state: TreinoClinicoState,
  todayIso: string,
  novasPermitidas: boolean
): PlanoVisualSemana | null {
  const diasDaSemana = FERIAS_CALENDARIO.filter((d) => d.weekId === weekId);
  if (diasDaSemana.length === 0) return null;
  const mondayIso = diasDaSemana[0].mondayIso;

  // Se já foi feito algum visual nesta semana, não atribui outro (máx 1/semana)
  const jaFeitoNaSemana = Object.values(state.visual).some(
    (v) => weekIsoOf(v.feitoEm) === mondayIso
  );
  if (jaFeitoNaSemana) return null;

  const pendentesVisual = QUEIXAS_E1.filter((q) => q.blocoVisual && !state.visual[q.slug]?.feitoEm);
  if (pendentesVisual.length === 0) return null;
  const pendenteSet = new Set(pendentesVisual.map((q) => q.slug));

  const diasDA = diasDaSemana.filter((d) => d.diaTipo === 'DA');
  if (diasDA.length === 0) return null;

  // 1. Projetar vagas A de Seg–Qua pela fila (a partir do estado antes de hoje ou atual)
  if (novasPermitidas) {
    const fila = filaPrimeiraPassadaE1(todayIso, state.logs);
    const diasRestantesDA = diasDA.filter(
      (d) => !state.logs.some((l) => l.tipo === 'Nova' && l.dateIso === d.dateIso)
    );
    for (let i = 0; i < Math.min(diasRestantesDA.length, fila.length); i += 1) {
      const q = fila[i];
      if (pendenteSet.has(q.slug) && q.visualTipo) {
        return {
          slug: q.slug,
          visualTipo: q.visualTipo,
          modo: 'anexado_A',
          dataAlvo: diasRestantesDA[i].dateIso,
        };
      }
    }
  }

  // 2. Candidatos = V ∩ {slugs com linha Nova antes da segunda}
  const candidatosPin = pendentesVisual.filter((q) =>
    state.logs.some((l) => l.tipo === 'Nova' && l.slug === q.slug && l.dateIso < mondayIso)
  );
  if (candidatosPin.length > 0 && candidatosPin[0].visualTipo) {
    return {
      slug: candidatosPin[0].slug,
      visualTipo: candidatosPin[0].visualTipo,
      modo: 'pin_visual_D1',
      dataAlvo: diasDA[0].dateIso,
    };
  }

  return null;
}

// ── Esteira Contínua Principal: proximosPassos (§2.1 – §2.4) ────────────────
function escolherVagaAFerias(
  todayIso: string,
  state: TreinoClinicoState,
  novasPermitidas: boolean
): { slug: string; origem: 'fila_primeira_passada' | 'reserva' | 'reteste' } | null {
  if (novasPermitidas) {
    const fila = filaPrimeiraPassadaE1(todayIso, state.logs);
    if (fila.length > 0) {
      return { slug: fila[0].slug, origem: 'fila_primeira_passada' };
    }
  }

  const ordered = sortLogsChrono(state.logs);
  // 2. refacaoIntegralPendente (mais antiga primeiro)
  const pendentesRefacao: Array<{ slug: string; dateIso: string }> = [];
  for (const q of QUEIXAS_E1) {
    if (q.reservedBaseline && q.unlockAfter && todayIso <= q.unlockAfter) continue;
    const novas = ordered.filter((l) => l.tipo === 'Nova' && l.slug === q.slug);
    const lastNova = novas[novas.length - 1];
    if (lastNova && lastNova.refacaoIntegralPendente) {
      pendentesRefacao.push({ slug: q.slug, dateIso: lastNova.dateIso });
    }
  }
  if (pendentesRefacao.length > 0) {
    pendentesRefacao.sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
    return { slug: pendentesRefacao[0].slug, origem: 'reserva' };
  }

  // 3. última avaliável E1 é Repetir (mais antiga primeiro)
  const retesteList: Array<{ slug: string; dateIso: string }> = [];
  for (const q of QUEIXAS_E1) {
    if (q.reservedBaseline && q.unlockAfter && todayIso <= q.unlockAfter) continue;
    const seq = seqE1(q.slug, state.logs);
    const last = seq[seq.length - 1];
    if (last && last.veredito === 'Repetir') {
      retesteList.push({ slug: q.slug, dateIso: last.dateIso });
    }
  }
  if (retesteList.length > 0) {
    retesteList.sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
    return { slug: retesteList[0].slug, origem: 'reteste' };
  }

  return null;
}

function escolherVagaBFerias(todayIso: string, logs: TreinoLogEntry[]): { slug: string; origem: 'fila_primeira_passada' | 'reteste' } | null {
  const fila = filaPrimeiraPassadaE3(todayIso, logs);
  if (fila.length > 0) return { slug: fila[0].slug, origem: 'fila_primeira_passada' };

  const retestes: Array<{ slug: string; dateIso: string }> = [];
  for (const a of ARQUETIPOS_E3) {
    if (a.unlockAfter && todayIso <= a.unlockAfter) continue;
    const seq = seqE3E4('E3', a.slug, logs);
    const last = seq[seq.length - 1];
    if (last && last.veredito === 'Repetir') retestes.push({ slug: a.slug, dateIso: last.dateIso });
  }
  if (retestes.length > 0) {
    retestes.sort((a, b) => (a.dateIso < b.dateIso ? -1 : 1));
    return { slug: retestes[0].slug, origem: 'reteste' };
  }
  return null;
}

function escolherVagaCFerias(logs: TreinoLogEntry[]): { slug: string; origem: 'fila_primeira_passada' | 'reteste' } | null {
  const fila = filaPrimeiraPassadaE4(logs);
  if (fila.length > 0) return { slug: fila[0].slug, origem: 'fila_primeira_passada' };

  const retestes: Array<{ slug: string; dateIso: string }> = [];
  for (const c of CENARIOS_E4) {
    const seq = seqE3E4('E4', c.slug, logs);
    const last = seq[seq.length - 1];
    if (last && last.veredito === 'Repetir') retestes.push({ slug: c.slug, dateIso: last.dateIso });
  }
  if (retestes.length > 0) {
    retestes.sort((a, b) => (a.dateIso < b.dateIso ? -1 : 1));
    return { slug: retestes[0].slug, origem: 'reteste' };
  }
  return null;
}

export function servicoFalhouSemana(weekIso: string, state: TreinoClinicoState, todayIso: string): boolean {
  const tercaIso = addDaysIso(weekIso, 1);
  if (todayIso <= tercaIso) return false;
  const semanaLogs = state.logs.filter((l) => weekIsoOf(l.dateIso) === weekIso && l.tipo === 'SERVIÇO');
  if (semanaLogs.length > 0) return false;
  const segPos = Boolean(state.internato.posPlantaoByDate[weekIso]);
  const terPos = Boolean(state.internato.posPlantaoByDate[tercaIso]);
  if (segPos && terPos) return false;
  return true;
}

export function proximosPassos(
  todayIso: string,
  state: TreinoClinicoState,
  central6Ano?: Partial<Central6AnoState> | null
): Passo[] {
  const bloco = getBlocoMacro(todayIso);
  const pendentesChecar = state.naoPodePassar.filter((n) => !n.checado).length;

  // ── BLOCO 0 — PILOTO (21–29/nov) ─────────────────────────────────────────
  if (bloco === 'BLOCO0_PILOTO') {
    const statuses = computePilotoStatus(state, todayIso);
    const next = statuses.find((s) => !s.concluido);
    if (!next) {
      return [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }];
    }
    if (todayIso < next.dataNominal) {
      return [{ kind: 'descanso', motivo: 'aguardando_data', proximaDataIso: next.dataNominal }];
    }

    if (next.id === 'P1') {
      return [
        {
          kind: 'sessao',
          prompt: 'A',
          tipoLog: 'Nova',
          slug: 'dor-toracica',
          ambiente: 'UPA com retaguarda',
          origem: 'piloto',
          tetoMin: 45,
          pilotoId: 'P1',
        },
      ];
    }
    if (next.id === 'P2') {
      const out: Passo[] = [];
      const hasVar = state.logs.some((l) => l.tipo === 'Var' && l.slug === 'dor-toracica');
      const hasNova = state.logs.some((l) => l.tipo === 'Nova' && l.slug === 'dor-abdominal');
      if (!hasVar) {
        out.push({
          kind: 'sessao',
          prompt: 'D1',
          tipoLog: 'Var',
          slug: 'dor-toracica',
          ambiente: 'UPA com retaguarda',
          origem: 'piloto',
          tetoMin: 12,
          mecanismosUsados: mecanismosUsadosDe('dor-toracica', state.logs),
          pilotoId: 'P2',
        });
      }
      if (!hasNova) {
        out.push({
          kind: 'sessao',
          prompt: 'A',
          tipoLog: 'Nova',
          slug: 'dor-abdominal',
          ambiente: 'UPA com retaguarda',
          origem: 'piloto',
          tetoMin: 30,
          pilotoId: 'P2',
        });
      }
      return out;
    }
    if (next.id === 'P3') {
      return [
        {
          kind: 'sessao',
          prompt: 'C',
          tipoLog: 'E4',
          slug: 'e4-deterioracao-silenciosa',
          ambiente: 'UPA com sala vermelha',
          origem: 'piloto',
          tetoMin: 30,
          pilotoId: 'P3',
        },
      ];
    }
    if (next.id === 'P4') {
      return [
        {
          kind: 'sessao',
          prompt: 'B',
          tipoLog: 'E3',
          slug: 'e3-atb-empirico',
          ambiente: 'UPA com retaguarda',
          origem: 'piloto',
          tetoMin: 40,
          pilotoId: 'P4',
        },
      ];
    }
    // P5
    const out: Passo[] = [];
    const hasBaseA = state.logs.some((l) => l.tipo === 'BASELINE' && l.baselineFase === 'A');
    if (!hasBaseA) {
      out.push({
        kind: 'sessao',
        prompt: 'A',
        tipoLog: 'BASELINE',
        slug: 'sensorio-focal-glicemia',
        ambiente: 'UPA com retaguarda',
        baseline: 'A',
        origem: 'baseline',
        tetoMin: 30,
        pilotoId: 'P5',
      });
    }
    if (!state.piloto.auditoriaEm) {
      out.push({ kind: 'marco', marco: 'congelamento_2026-11-29' });
    }
    return out;
  }

  // ── BLOCO 1 — FÉRIAS (30/nov–24/jan) ─────────────────────────────────────
  if (bloco === 'BLOCO1_FERIAS') {
    const dia = FERIAS_DIA_BY_ISO.get(todayIso);
    if (!dia) return [{ kind: 'descanso', motivo: 'fds' }];

    if (dia.diaTipo === 'OFF_FDS') return [{ kind: 'descanso', motivo: 'fds' }];
    if (dia.diaTipo === 'OFF_FERIADO') return [{ kind: 'descanso', motivo: 'feriado' }];
    if (dia.diaTipo === 'OFF_VIAGEM') return [{ kind: 'descanso', motivo: 'viagem' }];
    if (dia.diaTipo === 'MARCO_10JAN') {
      return [{ kind: 'marco', marco: 'contingencia_2027-01-10' }];
    }
    if (dia.diaTipo === 'MARCO_24JAN') {
      const out: Passo[] = [];
      const hasBaseB = state.logs.some((l) => l.tipo === 'BASELINE' && l.baselineFase === 'B');
      if (!hasBaseB) {
        out.push({
          kind: 'sessao',
          prompt: 'A',
          tipoLog: 'BASELINE',
          slug: 'sensorio-focal-glicemia',
          ambiente: 'UPA com retaguarda',
          baseline: 'B',
          origem: 'baseline',
          tetoMin: 30,
        });
      }
      out.push({ kind: 'marco', marco: 'revisao_2027-01-24' });
      return out;
    }

    const contingencia = computeContingencia10Jan(state, todayIso);
    const emContingenciaS7 = dia.weekId === 'S7' && contingencia.disparou;
    const saiuAntesS7 = emContingenciaS7 && isSaidaAntecipadaS7(state.logs);
    const novasPermitidas = !emContingenciaS7;
    const passos: Passo[] = [];

    // Checar se BASELINE-A atrasado ocupa vaga A (até 10/jan)
    const hasBaseA = state.logs.some((l) => l.tipo === 'BASELINE' && l.baselineFase === 'A');
    const baselineAAtrasado = !hasBaseA && !state.baselineInvalida && todayIso <= '2027-01-10';

    if (dia.diaTipo === 'DA') {
      const varsHoje = state.logs.filter((l) => l.tipo === 'Var' && l.dateIso === todayIso);
      const novasHoje = state.logs.filter(
        (l) => (l.tipo === 'Nova' || (l.tipo === 'BASELINE' && l.baselineFase === 'A')) && l.dateIso === todayIso
      );

      if (emContingenciaS7 && !saiuAntesS7) {
        // 2x D1 + pausa silenciosa 10s
        const usadosHoje = varsHoje.map((v) => v.slug);
        for (let slot = varsHoje.length; slot < 2; slot += 1) {
          const esc = escolherD1(todayIso, state.logs, usadosHoje);
          if (esc) {
            usadosHoje.push(esc.slug);
            passos.push({
              kind: 'sessao',
              prompt: 'D1',
              tipoLog: 'Var',
              slug: esc.slug,
              ambiente: 'UPA com retaguarda',
              origem: esc.origem,
              tetoMin: 12,
              mecanismosUsados: mecanismosUsadosDe(esc.slug, state.logs),
              pausaSilenciosa10s: true,
            });
          }
        }
        passos.push({ kind: 'checagem_fontes', minutos: 15, pendentesChecar });
        return passos;
      }

      // Fluxo normal DA (ou S7 após saída antecipada: novasPermitidas=false)
      const visualSemana = computeBlocoVisualSemana(dia.weekId, state, todayIso, novasPermitidas);
      const vagaA = baselineAAtrasado
        ? { slug: 'sensorio-focal-glicemia', origem: 'baseline' as const }
        : escolherVagaAFerias(todayIso, state, novasPermitidas);

      // Slot D1
      if (varsHoje.length === 0) {
        if (
          visualSemana &&
          visualSemana.modo === 'pin_visual_D1' &&
          visualSemana.dataAlvo === todayIso
        ) {
          passos.push({
            kind: 'sessao',
            prompt: 'D1',
            tipoLog: 'Var',
            slug: visualSemana.slug,
            ambiente: 'UPA com retaguarda',
            origem: 'pin_visual',
            tetoMin: 12,
            mecanismosUsados: mecanismosUsadosDe(visualSemana.slug, state.logs),
            visual: visualSemana.visualTipo,
          });
        } else {
          const exclude = vagaA ? [vagaA.slug] : [];
          const esc = escolherD1(todayIso, state.logs, exclude);
          if (esc) {
            passos.push({
              kind: 'sessao',
              prompt: 'D1',
              tipoLog: 'Var',
              slug: esc.slug,
              ambiente: 'UPA com retaguarda',
              origem: esc.origem,
              tetoMin: 12,
              mecanismosUsados: mecanismosUsadosDe(esc.slug, state.logs),
            });
          }
        }
      }

      // Slot A
      if (novasHoje.length === 0 && vagaA) {
        if (vagaA.origem === 'baseline') {
          passos.push({
            kind: 'sessao',
            prompt: 'A',
            tipoLog: 'BASELINE',
            slug: 'sensorio-focal-glicemia',
            ambiente: 'UPA com retaguarda',
            baseline: 'A',
            origem: 'baseline',
            tetoMin: 30,
          });
        } else {
          const visualAnexo =
            visualSemana &&
            visualSemana.modo === 'anexado_A' &&
            visualSemana.slug === vagaA.slug
              ? visualSemana.visualTipo
              : undefined;
          passos.push({
            kind: 'sessao',
            prompt: 'A',
            tipoLog: 'Nova',
            slug: vagaA.slug,
            ambiente: 'UPA com retaguarda',
            origem: vagaA.origem,
            tetoMin: 30,
            visual: visualAnexo,
          });
        }
      }

      if (passos.length === 0) {
        return [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }];
      }
      passos.push({ kind: 'checagem_fontes', minutos: 15, pendentesChecar });
      return passos;
    }

    if (dia.diaTipo === 'DC') {
      const temCHoje = state.logs.some((l) => l.tipo === 'E4' && l.dateIso === todayIso);
      if (!temCHoje) {
        const vagaC = escolherVagaCFerias(state.logs);
        if (vagaC) {
          passos.push({
            kind: 'sessao',
            prompt: 'C',
            tipoLog: 'E4',
            slug: vagaC.slug,
            ambiente: 'UPA com sala vermelha',
            origem: vagaC.origem,
            tetoMin: 30,
          });
        }
      }
      if (!state.rituais[dia.mondayIso]?.efFamiliar) {
        passos.push({ kind: 'ef_familiar' });
      }
      const temGravSemana = state.logs.some(
        (l) => l.tipo === 'GRAVAÇÃO' && weekIsoOf(l.dateIso) === dia.mondayIso
      );
      if (!temGravSemana) {
        passos.push({ kind: 'gravacao' });
      }
      if (passos.length === 0) return [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }];
      passos.push({ kind: 'checagem_fontes', minutos: 10, pendentesChecar });
      return passos;
    }

    // DB ou DB+G
    const temBHoje = state.logs.some((l) => l.tipo === 'E3' && l.dateIso === todayIso);
    if (!temBHoje) {
      const vagaB = escolherVagaBFerias(todayIso, state.logs);
      if (vagaB) {
        passos.push({
          kind: 'sessao',
          prompt: 'B',
          tipoLog: 'E3',
          slug: vagaB.slug,
          ambiente: sugerirAmbienteE3(vagaB.slug, state.logs),
          origem: vagaB.origem,
          tetoMin: 40,
        });
      }
    }
    if (dia.diaTipo === 'DB+G') {
      if (!state.rituais[dia.mondayIso]?.efFamiliar) {
        passos.push({ kind: 'ef_familiar' });
      }
      const temGravSemana = state.logs.some(
        (l) => l.tipo === 'GRAVAÇÃO' && weekIsoOf(l.dateIso) === dia.mondayIso
      );
      if (!temGravSemana) {
        passos.push({ kind: 'gravacao' });
      }
    }
    if (passos.length === 0) return [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }];
    passos.push({ kind: 'checagem_fontes', minutos: 15, pendentesChecar });
    return passos;
  }

  // ── BLOCO 2 — INTERNATO (≥ 25/jan) ───────────────────────────────────────
  const weekIso = weekIsoOf(todayIso);
  const posPlantaoHoje =
    state.internato.posPlantaoByDate[todayIso] !== undefined
      ? state.internato.posPlantaoByDate[todayIso]
      : central6Ano?.arquetipoId === 'pos_plantao';

  if (posPlantaoHoje) {
    return [{ kind: 'descanso', motivo: 'pos_plantao' }];
  }

  const rodizio = rodizioAtivo(todayIso, central6Ano);
  const passos: Passo[] = [];

  // SERVIÇO (segunda ou terça se segunda foi pós-plantão ou sem paciente novo)
  const dow = dayOfWeekIso(todayIso);
  const temServicoSemana = state.logs.some(
    (l) => l.tipo === 'SERVIÇO' && weekIsoOf(l.dateIso) === weekIso
  );
  const segIso = weekIso;
  const segPos = Boolean(state.internato.posPlantaoByDate[segIso]);
  const semPacSeg = Boolean(state.internato.semPacienteNovoSeg[weekIso]);
  if (!temServicoSemana && (dow === 1 || (dow === 2 && (segPos || semPacSeg)))) {
    passos.push({
      kind: 'servico',
      rodizioId: rodizio?.id || null,
      frase: FRASE_BASE_SERVICO,
      pedido: rodizio?.pedidoServico || null,
    });
  }

  // Já existe linha de treino hoje?
  const treinouHoje = state.logs.some(
    (l) =>
      l.dateIso === todayIso &&
      (l.tipo === 'Nova' || l.tipo === 'Var' || l.tipo === 'E3' || l.tipo === 'E4' || l.tipo === 'Micro')
  );
  if (treinouHoje) {
    return passos.length > 0 ? passos : [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }];
  }

  const semanaPesada =
    state.internato.semanaPesadaByWeek[weekIso] !== undefined
      ? state.internato.semanaPesadaByWeek[weekIso]
      : central6Ano?.marchaId === '2_pesada' || central6Ano?.marchaId === '1_sobrevivencia';

  const metas = semanaPesada ? { micro: 1, caso: 0 } : { micro: 3, caso: 1 };
  const logsSemana = state.logs.filter((l) => weekIsoOf(l.dateIso) === weekIso);
  const microFeito = logsSemana.filter((l) => l.tipo === 'Var' || l.tipo === 'Micro').length;
  const casoFeito = logsSemana.filter(
    (l) => l.tipo === 'Nova' || l.tipo === 'E3' || l.tipo === 'E4'
  ).length;
  const diaLivre = dow === 0 || dow === 6 || state.internato.diaLivreByDate[todayIso] === true;

  if (casoFeito < metas.caso && diaLivre) {
    const passoCaso = escolherCasoCompletoInternato(todayIso, state.logs, rodizio);
    if (passoCaso) passos.push(passoCaso);
  } else if (microFeito < metas.micro) {
    const temCasoReal = state.internato.casoRealByDate[todayIso] === true;
    if (temCasoReal) {
      const slugPadrao = rodizio?.alvos.find((s) => E1_BY_SLUG.has(s)) || 'dor-toracica';
      passos.push({
        kind: 'sessao',
        prompt: 'D2',
        tipoLog: 'Micro',
        slug: slugPadrao,
        ambiente: rodizio?.nome || 'Internato',
        origem: 'rodizio',
        tetoMin: 12,
      });
    } else {
      const esc = escolherD1(todayIso, state.logs, [], rodizio?.alvos || null, true);
      if (esc) {
        passos.push({
          kind: 'sessao',
          prompt: 'D1',
          tipoLog: 'Var',
          slug: esc.slug,
          ambiente: 'UPA com retaguarda',
          origem: esc.origem,
          tetoMin: 12,
          mecanismosUsados: mecanismosUsadosDe(esc.slug, state.logs),
        });
      }
    }
  } else if (passos.length === 0) {
    passos.push({ kind: 'descanso', motivo: 'meta_semana_cumprida' });
  }

  return passos;
}

function escolherCasoCompletoInternato(
  todayIso: string,
  logs: TreinoLogEntry[],
  rodizio: RodizioTreinoDef | null
): Passo | null {
  const ordered = sortLogsChrono(logs);
  const completosInternato = ordered.filter(
    (l) => l.dateIso >= '2027-01-25' && (l.tipo === 'Nova' || l.tipo === 'E3' || l.tipo === 'E4')
  );
  const ultimo = completosInternato[completosInternato.length - 1];
  const proxTipo: 'A' | 'B' | 'C' = !ultimo
    ? 'A'
    : ultimo.tipo === 'Nova'
      ? 'B'
      : ultimo.tipo === 'E3'
        ? 'C'
        : 'A';

  const rodAlvos = rodizio?.alvos || [];

  if (proxTipo === 'A') {
    const fila = filaPrimeiraPassadaE1(todayIso, logs);
    if (fila.length > 0) {
      return {
        kind: 'sessao',
        prompt: 'A',
        tipoLog: 'Nova',
        slug: fila[0].slug,
        ambiente: 'UPA com retaguarda',
        origem: 'fila_primeira_passada',
        tetoMin: 30,
      };
    }
    // Alvo E1 do rodízio não dominado com menos linhas avaliáveis
    const rodE1 = rodAlvos
      .filter((s) => E1_BY_SLUG.has(s))
      .map((s) => ({ slug: s, dom: computeDominioE1(s, logs, todayIso) }))
      .filter((x) => !x.dom.dominada)
      .sort((a, b) => a.dom.seq.length - b.dom.seq.length);
    if (rodE1.length > 0) {
      return {
        kind: 'sessao',
        prompt: 'A',
        tipoLog: 'Nova',
        slug: rodE1[0].slug,
        ambiente: 'UPA com retaguarda',
        origem: 'rodizio',
        tetoMin: 30,
      };
    }
    const reteste = escolherVagaAFerias(todayIso, { ...createInitialTreinoClinicoState(), logs }, false);
    if (reteste) {
      return {
        kind: 'sessao',
        prompt: 'A',
        tipoLog: 'Nova',
        slug: reteste.slug,
        ambiente: 'UPA com retaguarda',
        origem: reteste.origem,
        tetoMin: 30,
      };
    }
    // Mais antiga
    const sortedE1 = [...QUEIXAS_E1].sort((a, b) => {
      const la = ordered.filter((l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === a.slug).pop();
      const lb = ordered.filter((l) => (l.tipo === 'Nova' || l.tipo === 'Var') && l.slug === b.slug).pop();
      const da = la?.dateIso || '0000-00-00';
      const db = lb?.dateIso || '0000-00-00';
      return da < db ? -1 : da > db ? 1 : a.num - b.num;
    });
    return {
      kind: 'sessao',
      prompt: 'A',
      tipoLog: 'Nova',
      slug: sortedE1[0].slug,
      ambiente: 'UPA com retaguarda',
      origem: 'fallback',
      tetoMin: 30,
    };
  }

  // B ou C
  const tipoLog: 'E3' | 'E4' = proxTipo === 'B' ? 'E3' : 'E4';
  const catalog = proxTipo === 'B' ? ARQUETIPOS_E3 : CENARIOS_E4;

  // (0) SERVIÇO <= 7 dias com apontamento
  const servicos = ordered
    .filter(
      (l) =>
        l.tipo === 'SERVIÇO' &&
        l.servicoResultado === 'apontamento' &&
        (tipoLog === 'E3' ? E3_BY_SLUG.has(l.slug) : E4_BY_SLUG.has(l.slug)) &&
        diffDaysIso(l.dateIso, todayIso) <= 7 &&
        diffDaysIso(l.dateIso, todayIso) >= 0
    )
    .reverse();
  for (const s of servicos) {
    const temPosterior = ordered.some(
      (l) => l.tipo === tipoLog && l.slug === s.slug && l.dateIso >= s.dateIso && l.criadoEm > s.criadoEm
    );
    if (!temPosterior) {
      return {
        kind: 'sessao',
        prompt: proxTipo,
        tipoLog,
        slug: s.slug,
        ambiente: tipoLog === 'E3' ? sugerirAmbienteE3(s.slug, logs) : 'UPA com sala vermelha',
        origem: 'servico',
        tetoMin: tipoLog === 'E3' ? 40 : 30,
      };
    }
  }

  // (1) Fila 1ª passada
  const fila = tipoLog === 'E3' ? filaPrimeiraPassadaE3(todayIso, logs) : filaPrimeiraPassadaE4(logs);
  if (fila.length > 0) {
    return {
      kind: 'sessao',
      prompt: proxTipo,
      tipoLog,
      slug: fila[0].slug,
      ambiente: tipoLog === 'E3' ? sugerirAmbienteE3(fila[0].slug, logs) : 'UPA com sala vermelha',
      origem: 'fila_primeira_passada',
      tetoMin: tipoLog === 'E3' ? 40 : 30,
    };
  }

  // (2) Alvos do rodízio não dominados
  const rodItems = rodAlvos
    .filter((s) => (tipoLog === 'E3' ? E3_BY_SLUG.has(s) : E4_BY_SLUG.has(s)))
    .map((s) => ({ slug: s, dom: computeDominioE3E4(tipoLog, s, logs) }))
    .filter((x) => !x.dom.dominada)
    .sort((a, b) => a.dom.seq.length - b.dom.seq.length);
  if (rodItems.length > 0) {
    return {
      kind: 'sessao',
      prompt: proxTipo,
      tipoLog,
      slug: rodItems[0].slug,
      ambiente: tipoLog === 'E3' ? sugerirAmbienteE3(rodItems[0].slug, logs) : 'UPA com sala vermelha',
      origem: 'rodizio',
      tetoMin: tipoLog === 'E3' ? 40 : 30,
    };
  }

  // (3) Qualquer não dominado, última linha mais antiga
  const naoDom = catalog
    .map((item) => {
      const dom = computeDominioE3E4(tipoLog, item.slug, logs);
      const last = ordered.filter((l) => l.tipo === tipoLog && l.slug === item.slug).pop();
      return { slug: item.slug, num: item.num, dom, lastDate: last?.dateIso || '0000-00-00' };
    })
    .filter((x) => !x.dom.dominada)
    .sort((a, b) => (a.lastDate < b.lastDate ? -1 : a.lastDate > b.lastDate ? 1 : a.num - b.num));
  if (naoDom.length > 0) {
    return {
      kind: 'sessao',
      prompt: proxTipo,
      tipoLog,
      slug: naoDom[0].slug,
      ambiente: tipoLog === 'E3' ? sugerirAmbienteE3(naoDom[0].slug, logs) : 'UPA com sala vermelha',
      origem: 'reteste',
      tetoMin: tipoLog === 'E3' ? 40 : 30,
    };
  }

  // (4) Última linha mais antiga
  const allSorted = [...catalog].sort((a, b) => {
    const la = ordered.filter((l) => l.tipo === tipoLog && l.slug === a.slug).pop()?.dateIso || '0000-00-00';
    const lb = ordered.filter((l) => l.tipo === tipoLog && l.slug === b.slug).pop()?.dateIso || '0000-00-00';
    return la < lb ? -1 : la > lb ? 1 : a.num - b.num;
  });
  return {
    kind: 'sessao',
    prompt: proxTipo,
    tipoLog,
    slug: allSorted[0].slug,
    ambiente: tipoLog === 'E3' ? sugerirAmbienteE3(allSorted[0].slug, logs) : 'UPA com sala vermelha',
    origem: 'fallback',
    tetoMin: tipoLog === 'E3' ? 40 : 30,
  };
}

// ── Relatório Comparativo de Baseline (24/jan) (§2.3.6) ────────────────────
export interface RelatorioBaseline {
  baseA: TreinoLogEntry | null;
  baseB: TreinoLogEntry | null;
  inconclusivo: boolean;
  motivoInconclusivo: string | null;
}

export function computeRelatorioBaseline(state: TreinoClinicoState): RelatorioBaseline {
  const baseA = state.logs.find((l) => l.tipo === 'BASELINE' && l.baselineFase === 'A') || null;
  const baseB = state.logs.find((l) => l.tipo === 'BASELINE' && l.baselineFase === 'B') || null;
  if (state.baselineInvalida) {
    return { baseA, baseB, inconclusivo: true, motivoInconclusivo: 'BASELINE-A não concluído até 10/jan.' };
  }
  if (baseA?.iaPista || baseB?.iaPista) {
    return { baseA, baseB, inconclusivo: true, motivoInconclusivo: 'Houve vazamento de pista (IA_Pista = S).' };
  }
  if (baseB && (baseB.dateIso < '2027-01-24' || baseB.dateIso > '2027-01-31')) {
    return { baseA, baseB, inconclusivo: true, motivoInconclusivo: 'BASELINE-B fora da janela 24–31/jan.' };
  }
  return { baseA, baseB, inconclusivo: false, motivoInconclusivo: null };
}

// ── Geradores de Prompt (§2.5 + Templates blindados ChatGPT) ───────────────
function replacePlaceholders(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export function buildPromptA(opts: {
  dateIso: string;
  tipo: 'Nova' | 'BASELINE-A' | 'BASELINE-B';
  slug: string;
  servico?: AmbienteE1;
  perfil?: 'padrão' | 'paciente idoso';
  casoFixo?: string;
}): string {
  const q = E1_BY_SLUG.get(opts.slug);
  const nome = q ? q.nome : opts.slug;
  const isBaseline = opts.tipo === 'BASELINE-A' || opts.tipo === 'BASELINE-B';
  return replacePlaceholders(TEMPLATE_PROMPT_A, {
    DATA: formatDateDDMM(opts.dateIso),
    TIPO: opts.tipo,
    SLUG: opts.slug,
    NOME: nome,
    SERVICO: isBaseline ? 'UPA com retaguarda' : opts.servico || 'UPA com retaguarda',
    PERFIL: isBaseline ? 'paciente idoso' : opts.perfil || 'padrão',
    CASO_FIXO: isBaseline ? (opts.casoFixo?.trim() || '[COLAR CASO SELADO SEM LER]') : 'nenhum',
  });
}

export function buildPromptD1(opts: {
  dateIso: string;
  slug: string;
  servico?: AmbienteE1;
  mecanismosUsados: string[];
}): string {
  const q = E1_BY_SLUG.get(opts.slug);
  const nome = q ? q.nome : opts.slug;
  return replacePlaceholders(TEMPLATE_PROMPT_D1, {
    DATA: formatDateDDMM(opts.dateIso),
    SLUG: opts.slug,
    NOME: nome,
    SERVICO: opts.servico || 'UPA com retaguarda',
    MECANISMOS_USADOS: opts.mecanismosUsados.length > 0 ? opts.mecanismosUsados.join(', ') : 'nenhum',
  });
}

export function buildPromptD2(opts: {
  dateIso: string;
  eixo: Eixo;
  slug: string;
  rodizio: string;
  casoAnonimizado: string;
}): string {
  const sanitized = sanitizePiiText(opts.casoAnonimizado || '');
  return replacePlaceholders(TEMPLATE_PROMPT_D2, {
    DATA: formatDateDDMM(opts.dateIso),
    EIXO: opts.eixo,
    SLUG: opts.slug,
    RODIZIO: opts.rodizio || 'Internato',
    CASO_ANONIMIZADO: sanitized.sanitized.trim() || '[Descrever caso sem dados identificáveis]',
  });
}

export function buildPromptB(opts: {
  dateIso: string;
  slug: string;
  servico: AmbienteE3;
}): string {
  const a = E3_BY_SLUG.get(opts.slug);
  const nome = a ? a.nome : opts.slug;
  return replacePlaceholders(TEMPLATE_PROMPT_B, {
    DATA: formatDateDDMM(opts.dateIso),
    SLUG: opts.slug,
    NOME: nome,
    SERVICO: opts.servico,
  });
}

export function buildPromptC(opts: {
  dateIso: string;
  slug: string;
  servico?: AmbienteE4;
}): string {
  const c = E4_BY_SLUG.get(opts.slug);
  const nome = c ? c.nome : opts.slug;
  return replacePlaceholders(TEMPLATE_PROMPT_C, {
    DATA: formatDateDDMM(opts.dateIso),
    SLUG: opts.slug,
    NOME: nome,
    SERVICO: opts.servico || 'UPA com sala vermelha',
  });
}

// ── Parser de linha do Gemini (Contrato ChatGPT + §3.7) ────────────────────
const SLUG_PAT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const CAMPO_PAT = String.raw`[^|\s\x00-\x1f\x7f](?:[^|\x00-\x1f\x7f\u2028\u2029]*[^|\s\x00-\x1f\x7f])?`;
const AMBIENTE_PAT = String.raw`[^()|\s\x00-\x1f\x7f](?:[^()|\x00-\x1f\x7f\u2028\u2029]*[^()|\s\x00-\x1f\x7f])?`;
const DATA_PAT = '(?:0[1-9]|[12][0-9]|3[01])/(?:0[1-9]|1[0-2])';

const LOG_PARTES = [
  `(?<data>${DATA_PAT})`,
  '(?<tipo>Nova|Var|E3|E4|Micro|BASELINE|SERVIÇO|GRAVAÇÃO)',
  String.raw`(?<alvo>${SLUG_PAT}(?::${SLUG_PAT}|\/[a-z0-9_]+| \(${AMBIENTE_PAT}\))?)`,
  String.raw`(?<min>__m|\[__m\]|[1-9][0-9]*m)`,
  '(?<tresH>S|N|NA)',
  `(?<omissao>${CAMPO_PAT})`,
  String.raw`(?<score>NA|[0-4]/4 \(${CAMPO_PAT}\)|muletas: [0-9]+ \(${CAMPO_PAT}\))`,
  String.raw`(?<pista>\[N/S\]|N|S|NA)`,
  '(?<veredito>Limpo|Repetir|NA)',
];

export const LOG_RE = new RegExp(
  String.raw`^${LOG_PARTES.join(String.raw` \| `)}(?![\s\S])`,
  'u'
);

export function inferDateIsoFromDDMM(ddmm: string, refTodayIso: string): string {
  const [dd, mm] = ddmm.split('/').map(Number);
  const month = mm || 1;
  const year =
    month >= 11
      ? refTodayIso >= '2027-01-25'
        ? 2027
        : 2026
      : 2027;
  return `${year}-${String(month).padStart(2, '0')}-${String(dd || 1).padStart(2, '0')}`;
}

export interface ParsedLogDraft {
  dateIso: string;
  tipo: TipoLog;
  slug: string;
  mecanismo: string | null;
  ambiente: string | null;
  rodizioId: string | null;
  min: number | null;
  minPendente: boolean;
  h3Bloco: SN | 'NA';
  pemc: Pemc;
  score: Score;
  iaPista: boolean | null;
  iaPistaPendente: boolean;
  vereditoIA: Veredito;
  baselineFase: 'A' | 'B' | null;
}

function cleanGeminiCandidateLine(rawLine: string): string {
  let s = String(rawLine || '').trim();
  // Remove marcadores de lista / citação no início (ex.: "- ", "* ", "• ", "> ")
  s = s.replace(/^(?:[-*•>]\s+)+/, '').trim();
  // Remove delimitadores Markdown externos (crases, negrito, itálico) repetidamente
  for (let i = 0; i < 3; i++) {
    if (s.startsWith('```') && s.endsWith('```') && s.length > 6) {
      s = s.slice(3, -3).trim();
    } else if (s.startsWith('`') && s.endsWith('`') && s.length > 2) {
      s = s.slice(1, -1).trim();
    } else if (s.startsWith('**') && s.endsWith('**') && s.length > 4) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith('__') && s.endsWith('__') && s.length > 4) {
      s = s.slice(2, -2).trim();
    } else if (s.startsWith('*') && s.endsWith('*') && !s.startsWith('**') && s.length > 2) {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  // Remove ponto final avulso após o veredito
  s = s.replace(/\.\s*$/, '').trim();
  return s;
}

export function parseLogLineFromGemini(
  rawText: string,
  refTodayIso: string,
  baselineHint?: 'A' | 'B'
): { ok: true; draft: ParsedLogDraft } | { ok: false; error: string } {
  const trimmed = String(rawText || '').trim();
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^```[a-z]*$/i.test(l));
  if (lines.length === 0) return { ok: false, error: 'Texto vazio.' };

  // Para BASELINE-A, a resposta inteira deve ser só a linha do LOG
  if (baselineHint === 'A' && lines.length > 1) {
    return { ok: false, error: 'BASELINE-A contém texto além da linha do LOG.' };
  }
  const rawCandidate = baselineHint === 'A' ? lines[0] : lines[lines.length - 1];
  const candidate = cleanGeminiCandidateLine(rawCandidate);
  const m = LOG_RE.exec(candidate);
  if (!m || !m.groups) {
    return {
      ok: false,
      error: 'Linha não bate no formato de 9 campos separados por " | ".',
    };
  }

  const g = m.groups;
  const tipo = g.tipo as TipoLog;
  const dateIso = inferDateIsoFromDDMM(g.data, refTodayIso);

  // Parse alvo
  let slug = g.alvo;
  let mecanismo: string | null = null;
  let ambiente: string | null = null;
  let rodizioId: string | null = null;

  if (g.alvo.includes(':')) {
    const [s, mec] = g.alvo.split(':');
    slug = s;
    mecanismo = mec;
  } else if (g.alvo.includes(' (')) {
    const idx = g.alvo.indexOf(' (');
    slug = g.alvo.slice(0, idx);
    ambiente = g.alvo.slice(idx + 2, -1);
  } else if (g.alvo.includes('/')) {
    const [s, r] = g.alvo.split('/');
    slug = s;
    rodizioId = r;
  }

  // Min
  const minPendente = g.min === '__m' || g.min === '[__m]';
  const min = minPendente ? null : parseInt(g.min.slice(0, -1), 10);

  // IA Pista
  const iaPistaPendente = g.pista === '[N/S]';
  const iaPista = g.pista === 'S' ? true : g.pista === 'N' ? false : null;

  // Baseline fase + PEMC
  let baselineFase: 'A' | 'B' | null = null;
  let pemc: Pemc;
  if (tipo === 'BASELINE') {
    if (baselineHint) {
      baselineFase = baselineHint;
    } else if (g.omissao === 'S' || g.omissao === 'N') {
      baselineFase = 'A';
    } else {
      baselineFase = 'B';
    }
    if (baselineFase === 'A') {
      if (g.omissao !== 'S' && g.omissao !== 'N') {
        return { ok: false, error: 'BASELINE-A exige PEMC apenas S ou N.' };
      }
      pemc = { kind: 'baselineSN', valor: g.omissao };
    } else {
      pemc =
        g.omissao.toLowerCase() === 'nenhuma'
          ? { kind: 'nenhuma' }
          : { kind: 'omissao', texto: sanitizePiiText(g.omissao).sanitized.slice(0, 160) };
    }
  } else if (tipo === 'GRAVAÇÃO') {
    pemc = { kind: 'NA' };
  } else if (g.omissao === 'NA') {
    pemc = { kind: 'NA' };
  } else if (g.omissao.toLowerCase() === 'nenhuma') {
    pemc = { kind: 'nenhuma' };
  } else {
    pemc = { kind: 'omissao', texto: sanitizePiiText(g.omissao).sanitized.slice(0, 160) };
  }

  // Score
  let score: Score;
  if (g.score === 'NA') {
    score = { kind: 'NA' };
  } else if (g.score.startsWith('muletas: ')) {
    const mu = /^muletas: (\d+) \((.+)\)$/.exec(g.score);
    score = mu
      ? { kind: 'muletas', contagem: parseInt(mu[1], 10), ajuste: mu[2] }
      : { kind: 'NA' };
  } else {
    const sc = /^([0-4])\/4 \((.+)\)$/.exec(g.score);
    if (!sc) return { ok: false, error: 'Formato de score inválido.' };
    const valor = parseInt(sc[1], 10) as 0 | 1 | 2 | 3 | 4;
    const ajuste = sc[2];
    const bitsMatch = /^([01]{4})$/.exec(ajuste);
    const criterios: [boolean, boolean, boolean, boolean] | undefined = bitsMatch
      ? [
          bitsMatch[1][0] === '1',
          bitsMatch[1][1] === '1',
          bitsMatch[1][2] === '1',
          bitsMatch[1][3] === '1',
        ]
      : undefined;
    score = { kind: 'rubrica', valor, ajuste, criterios };
  }

  return {
    ok: true,
    draft: {
      dateIso,
      tipo,
      slug,
      mecanismo,
      ambiente,
      rodizioId,
      min,
      minPendente,
      h3Bloco: g.tresH as SN | 'NA',
      pemc,
      score,
      iaPista,
      iaPistaPendente,
      vereditoIA: g.veredito as Veredito,
      baselineFase,
    },
  };
}

// ── Serialização LOG.md (§3.7) ──────────────────────────────────────────────
export function formatLogLine(entry: TreinoLogEntry): string {
  const ddmm = formatDateDDMM(entry.dateIso);
  let alvo = entry.slug;
  if ((entry.tipo === 'Nova' || entry.tipo === 'Var') && entry.mecanismo) {
    alvo = `${entry.slug}:${entry.mecanismo}`;
  } else if ((entry.tipo === 'E3' || entry.tipo === 'E4') && entry.ambiente) {
    alvo = `${entry.slug} (${entry.ambiente})`;
  } else if (entry.tipo === 'SERVIÇO' && entry.rodizioId) {
    alvo = `${entry.slug}/${entry.rodizioId}`;
  }

  const minStr = entry.min !== null ? `${entry.min}m` : '__m';

  let pemcStr = 'NA';
  if (entry.pemc.kind === 'nenhuma') pemcStr = 'nenhuma';
  else if (entry.pemc.kind === 'omissao') pemcStr = entry.pemc.texto;
  else if (entry.pemc.kind === 'baselineSN') pemcStr = entry.pemc.valor;

  let scoreStr = 'NA';
  if (entry.score.kind === 'rubrica') {
    scoreStr = `${entry.score.valor}/4 (${entry.score.ajuste || 'ok'})`;
  } else if (entry.score.kind === 'muletas') {
    scoreStr = `muletas: ${entry.score.contagem} (${entry.score.ajuste || 'ok'})`;
  }

  const pistaStr = entry.iaPista === null ? 'NA' : entry.iaPista ? 'S' : 'N';
  return `${ddmm} | ${entry.tipo} | ${alvo} | ${minStr} | ${entry.h3Bloco} | ${pemcStr} | ${scoreStr} | ${pistaStr} | ${entry.veredito}`;
}

export function formatLogMarkdown(state: TreinoClinicoState, todayIso: string): string {
  const ordered = sortLogsChrono(state.logs);
  const metrics = computeTreinoMetrics(state, todayIso);
  const lines = [
    '# LOG de Treino — Habilidades Clínicas (v3.1)',
    '',
    '`DD/MM | Tipo | Alvo | Min | 3H_bloco | PEMC/Omissão | Score(0-4) | IA_Pista? | Veredito`',
    '',
    ...ordered.map(formatLogLine),
    '',
    `<!-- Métricas: 3H_bloco ${metrics.h3Num}/${metrics.h3Den} | PEMC ${metrics.pemcNum}/${metrics.pemcDen} | Dominadas E1 ${metrics.dominadasE1}/${metrics.totalAlvoE1} -->`,
  ];
  return lines.join('\n');
}

// ── Contrato "Não Pode Passar" (BLOCO 4) ────────────────────────────────────
export type NppValidationCode =
  | 'NPP_ORIGEM_INVALIDA'
  | 'NPP_LIMITE_6'
  | 'NPP_NASCE_CHECAR'
  | 'NPP_FONTE_OBRIGATORIA'
  | 'NPP_FONTE_PROIBIDA';

export const NPP_FONTE_PROIBIDA_RE =
  /\b(amboss|chat ?gpt|gemini|claude|antigravity|ia|ai|llm|novo-?pep|pr[eé]-?porta|hab-\d+|cart[aã]o \d+)\b/i;

export function validateNppAdd(
  items: Array<{ slug: string; texto: string; origemLogId: string }>,
  existingNpp: NaoPodePassarItem[],
  logs: TreinoLogEntry[]
): { ok: true } | { ok: false; errorCode: NppValidationCode; errorMessage: string } {
  if (items.length === 0) {
    return { ok: false, errorCode: 'NPP_ORIGEM_INVALIDA', errorMessage: 'Nenhum item informado.' };
  }

  const countBySlug = new Map<string, number>();
  for (const n of existingNpp) {
    countBySlug.set(n.slug, (countBySlug.get(n.slug) || 0) + 1);
  }

  for (const it of items) {
    const origem = logs.find((l) => l.id === it.origemLogId);
    const origemValida =
      origem &&
      (origem.tipo === 'Nova' || origem.tipo === 'Var' || origem.tipo === 'Micro') &&
      origem.slug === it.slug &&
      E1_BY_SLUG.has(it.slug) &&
      origem.pemc.kind === 'omissao';
    if (!origemValida) {
      return {
        ok: false,
        errorCode: 'NPP_ORIGEM_INVALIDA',
        errorMessage: 'Item NPP exige linha Nova, Var ou Micro do mesmo slug E1 com PEMC real (BASELINE nunca cria item).',
      };
    }
    const nextCount = (countBySlug.get(it.slug) || 0) + 1;
    if (nextCount > 6) {
      return {
        ok: false,
        errorCode: 'NPP_LIMITE_6',
        errorMessage: `Limite de 6 itens por queixa excedido em ${it.slug} (excedente: ${nextCount - 6}).`,
      };
    }
    countBySlug.set(it.slug, nextCount);
  }
  return { ok: true };
}

export function validateNppCheck(opts: {
  fonteTipo?: FonteTipo;
  fontePrimaria?: string;
  checadoEm?: string;
}): { ok: true } | { ok: false; errorCode: NppValidationCode; errorMessage: string } {
  const validTipo =
    opts.fonteTipo === 'diretriz' ||
    opts.fonteTipo === 'protocolo_oficial' ||
    opts.fonteTipo === 'bula_profissional';
  const fonte = String(opts.fontePrimaria || '').trim();
  if (!validTipo || fonte.length < 10 || !opts.checadoEm) {
    return {
      ok: false,
      errorCode: 'NPP_FONTE_OBRIGATORIA',
      errorMessage: 'Informe tipo de fonte, referência primária (≥ 10 caracteres) e data.',
    };
  }
  if (NPP_FONTE_PROIBIDA_RE.test(fonte)) {
    return {
      ok: false,
      errorCode: 'NPP_FONTE_PROIBIDA',
      errorMessage: 'AMBOSS, IAs (ChatGPT/Gemini/Claude/Antigravity) e cartões do Novo-PEP não retiram [CHECAR]. Cite diretriz, protocolo oficial ou bula.',
    };
  }
  return { ok: true };
}

export function applyNppTextEdit(item: NaoPodePassarItem, newText: string): NaoPodePassarItem {
  const clean = sanitizePiiText(newText).sanitized.replace(/\r?\n/g, ' ').trim().slice(0, 200);
  if (clean === item.texto) return item;
  return {
    ...item,
    texto: clean,
    checado: false,
    fontePrimaria: undefined,
    fonteTipo: undefined,
    checadoEm: undefined,
  };
}

export function formatNaoPodePassarMarkdown(items: NaoPodePassarItem[]): string {
  const bySlug = new Map<string, NaoPodePassarItem[]>();
  for (const it of items) {
    const arr = bySlug.get(it.slug) || [];
    arr.push(it);
    bySlug.set(it.slug, arr);
  }

  const out: string[] = ['# Não Pode Passar (v3.1)', ''];
  for (const q of QUEIXAS_E1) {
    const arr = bySlug.get(q.slug);
    if (!arr || arr.length === 0) continue;
    out.push(`## ${q.num}. ${q.slug} — ${q.nome}`);
    for (const it of arr) {
      if (!it.checado) {
        out.push(`- [CHECAR] ${it.texto}`);
      } else {
        out.push(
          `- ${it.texto} — Fonte (${it.fonteTipo}): ${it.fontePrimaria} · ${formatDateDDMMYYYY(it.checadoEm || '2026-11-21')}`
        );
      }
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}

// ── Integração Bidirecional: 1 Guia/Semana + Recomendação por Gargalo ───────
export interface GuiaRecomendado {
  modId: string;
  motivo: string;
  tipo: 'semana' | 'gargalo';
}

const GUIA_POR_FERIAS_WEEK: Record<string, { modId: string; label: string }> = {
  S1: { modId: 'mod-03', label: 'Semana 1 (30/nov–04/dez) · Raciocínio Clínico, Illness Scripts & Bayes' },
  S2: { modId: 'mod-02', label: 'Semana 2 (07–11/dez) · Exame Físico HDPE, Stanford 25 & LR+/LR-' },
  S3: { modId: 'mod-05', label: 'Semana 3 (14–18/dez) · Exames: ECG, Gasometria, RX, TC & Lab Diário' },
  S4: { modId: 'mod-04', label: 'Semana 4 (21–23/dez) · Oratória ≤90s, Explicação Leiga & SBAR/I-PASS' },
  S5: { modId: 'mod-06', label: 'Semana 5 (28–30/dez) · Farmacologia, 7 Travas, ATB & Pediatria Ponderal' },
  S6: { modId: 'mod-08', label: 'Semana 6 (04–08/jan) · Multi-Paciente A→B→C→D, NEWS2 & Chegadas Graves' },
  S7: { modId: 'mod-09', label: 'Semana 7 (18–22/jan) · Disposição, Limites s/ Lab (CROSS), UBS & Legais' },
  MARCO: { modId: 'mod-09', label: 'Fechamento Férias · Disposição, Regulação & Revisão Geral' },
};

export function guiaTeoricoDaSemana(todayIso: string): GuiaRecomendado | null {
  const bloco = getBlocoMacro(todayIso);
  if (bloco === 'BLOCO0_PILOTO') {
    return {
      modId: 'mod-01',
      motivo: 'Guia do Piloto (21–29/nov) · Anamnese Dirigida (3H ≤60s), Calgary-Cambridge & Atrito E2',
      tipo: 'semana',
    };
  }
  if (bloco === 'BLOCO1_FERIAS') {
    const dia = FERIAS_DIA_BY_ISO.get(todayIso);
    if (!dia || dia.weekId === 'LIVRE') return null;
    const g = GUIA_POR_FERIAS_WEEK[dia.weekId];
    return g ? { modId: g.modId, motivo: g.label, tipo: 'semana' } : null;
  }
  return {
    modId: 'mod-07',
    motivo: 'Internato · Procedimentos de Porta, Via Aérea Inicial (BVM/SRI) & Trauma Leve',
    tipo: 'semana',
  };
}

export function recomendarGuiasPorGargalo(state: TreinoClinicoState): GuiaRecomendado[] {
  const ordered = sortLogsChrono(state.logs);
  if (ordered.length === 0) return [];
  const ultimas = ordered.slice(-6).reverse();
  const out: GuiaRecomendado[] = [];
  const seen = new Set<string>();

  const pushUnique = (modId: string, motivo: string) => {
    if (!seen.has(modId)) {
      seen.add(modId);
      out.push({ modId, motivo, tipo: 'gargalo' });
    }
  };

  for (const l of ultimas) {
    const alvoNome = formatTargetLabel(l.slug);
    if ((l.tipo === 'Nova' || l.tipo === 'Var') && l.h3Bloco === 'N') {
      pushUnique('mod-01', `Falha no bloco 3H em ${alvoNome} (${formatDateDDMM(l.dateIso)}) → treinar Funil 3H ≤60s`);
      pushUnique('mod-03', `Falha no bloco 3H em ${alvoNome} → revisar Matriz 3H & Illness Scripts`);
    }
    if ((l.tipo === 'Nova' || l.tipo === 'Var' || l.tipo === 'Micro') && l.pemc.kind === 'omissao') {
      pushUnique('mod-02', `PEMC em ${alvoNome} (${formatDateDDMM(l.dateIso)}) → revisar HDPE, manobras & LR+/LR-`);
      pushUnique('mod-03', `PEMC em ${alvoNome} → revisar Discriminadores & Debiasing`);
    }
    if ((l.tipo === 'Nova' || l.tipo === 'Var') && l.score.kind === 'rubrica' && l.score.valor <= 2) {
      pushUnique('mod-04', `Score E2 ${l.score.valor}/4 em ${alvoNome} → treinar Apresentação ≤90s & Explicação ≤60s`);
      pushUnique('mod-01', `Score E2 ${l.score.valor}/4 em ${alvoNome} → revisar Scripts de Atrito E2 & Teach-Back`);
    }
    if (l.tipo === 'GRAVAÇÃO' && l.score.kind === 'muletas' && l.score.contagem > 2) {
      pushUnique('mod-04', `Gravação com ${l.score.contagem} muletas → treinar Regra da Pausa Limpa de 1s`);
    }
    if (l.tipo === 'E3' && l.veredito === 'Repetir') {
      pushUnique('mod-06', `E3 Repetir em ${alvoNome} → revisar 7 Travas A-R-G-I-V-P-O, ATB & Pediatria Ponderal`);
      pushUnique('mod-09', `E3 Repetir em ${alvoNome} → revisar Disposição, Limites s/ Lab (CROSS) & UBS`);
    }
    if (l.tipo === 'E4' && l.veredito === 'Repetir') {
      pushUnique('mod-08', `E4 Repetir em ${alvoNome} → revisar Multi-Paciente A→B→C→D, NEWS2 & Chegadas Graves`);
      pushUnique('mod-07', `E4 Repetir em ${alvoNome} → revisar Via Aérea Inicial (BVM/SRI/Vortex)`);
    }
  }

  return out.slice(0, 4);
}
