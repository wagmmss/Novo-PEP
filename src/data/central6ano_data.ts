// ============================================================================
// CENTRAL DO 6º ANO — DADOS ESTÁTICOS & CONTRATOS DE SCHEMA
// (Rodízios, Escala Semanal, Marcos R1, Matriz Unificada USP-SP / USP-RP /
//  UNICAMP 2025/2026, Logbook, Ritual & Ensaio Mental)
// Mantém src/engine/central6ano.ts 100% lógica pura.
// ============================================================================

import type { TreinoClinicoState } from './treino_clinico_data.ts';

export type WeeklyDayKey = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

export type ShiftType = 'manha' | 'tarde' | 'plantao_noturno' | 'folga';

export type WeeklyScheduleMap = Record<WeeklyDayKey, ShiftType[]>;

export type DailyTaskCategory = 'hospital' | 'estudo' | 'curriculo' | 'pessoal';

export interface DailyTaskItem {
  id: string;
  text: string;
  done: boolean;
  category: DailyTaskCategory;
  createdAtIso: string;
}

export interface R1Milestone {
  id: string;
  titulo: string;
  dateIso: string;
  categoria: 'curriculo' | 'estudo' | 'graduacao' | 'prova' | 'ingresso';
  nota?: string;
}

export type CurriculumBankId = 'usp_sp' | 'usp_rp' | 'unicamp';
export type ProofStatus = 'falta' | 'em_andamento' | 'pdf_pronto';
export type CurriculumEffortLevel = 'baixo' | 'medio' | 'alto';
export type CurriculumCategoryId =
  | 'institucional'
  | 'cientifico'
  | 'ensino_ligas'
  | 'assistencial_cursos'
  | 'representacao';

export interface CurriculumBlockDef {
  id: string;
  label: string;
  maxPoints: number;
}

export interface CurriculumBankConfig {
  id: CurriculumBankId;
  nome: string;
  sigla: string;
  escalaMax: number;
  pesoNotaFinal: string;
  psiquiatriaPesos: string;
  pesoCurriculoPct: number;
  pesoPrimeiraFasePct: number;
  questoesPrimeiraFase: number;
  editalRef: string;
  dicaEnvio: string;
  blocks: CurriculumBlockDef[];
}

export interface BankItemRule {
  blockId: string;
  perUnit: number;
  maxItemPoints: number;
  /** Regra opcional por faixa (ex.: UNICAMP IC/Monitoria/Voluntariado, USP-SP Monitoria/Extensão/Rep.) */
  tiers?: Array<{ minUnits: number; points: number }>;
  note: string;
}

export interface CurriculumCatalogItem {
  id: string;
  categoria: CurriculumCategoryId;
  titulo: string;
  descricao: string;
  inputType: 'boolean' | 'number';
  unitLabel?: string;
  step?: number;
  maxInput: number;
  defaultValue?: number;
  /** Se false, não entra nas recomendações de ROI (ex.: estrutura da faculdade ou 2ª graduação). */
  actionable?: boolean;
  effortHint?: CurriculumEffortLevel;
  /** Incremento realista simulado pelo motor de ROI (padrão = step ou 1). */
  roiStep?: number;
  roiActionLabel?: string;
  rules: Partial<Record<CurriculumBankId, BankItemRule>>;
}

export interface CurriculumEntryState {
  value: number;
  proofStatus: ProofStatus;
  notes?: string;
}

export interface RodizioConfig {
  id: string;
  nome: string;
  periodo: string;
  areaBadge: 'cirurgia' | 'clinica' | 'go' | 'pediatria' | 'preventiva';
  ancora70: string;
  trilha30: string;
  procedimentosAlvo: string[];
  microHabitoSugerido: string;
}

export type MarchaId = '4_sprint' | '3_normal' | '2_pesada' | '1_sobrevivencia';

export interface MarchaConfig {
  id: MarchaId;
  nome: string;
  badge: string;
  metaMin: number;
  metaMax: number;
  metaAlvo: number;
  cicloDiaUtilMin: number;
  fdsHorasDia: number;
  resumo: string;
}

export interface TimelineStep {
  id: string;
  horario: string;
  titulo: string;
  detalhe: string;
  categoria: string;
  corCategoria: string;
  atalhoSecao?: string;
  atalhoLabel?: string;
  atalhoTeoriaMod?: string;
  atalhoFerramentaTab?: 'gaso' | 'lr' | 'travas' | 'intercorrencias';
}

export interface CurriculoAuditItem {
  id: string;
  categoria: 'Concluído (Base)' | 'Meta 1º Semestre (até 30/06/27)';
  titulo: string;
  detalhe: string;
  done: boolean;
}

export type ProcedureAutonomy = 'auxiliei' | 'supervisionado' | 'autonomo';

export interface LogbookProcedureGoal {
  id: string;
  rodizioId: string;
  rodizioNome: string;
  nome: string;
  metaAlvo: number;
  guiaRef: string;
  /** Cartão Pré-Porta (hab-*) que realmente ensina a técnica manual deste procedimento */
  habId?: string;
}

export interface ShiftScheduleEntry {
  dateIso: string;
  tipo: Central6AnoState['arquetipoId'];
  label?: string;
}

export interface WeeklyHistory7030Entry {
  weekIso: string;
  rodizioId: string;
  marchaId: MarchaId;
  questoesAncora: number;
  questoesTrilha: number;
  totalQuestoes: number;
  metaAlvo: number;
  pctAncora: number;
  pctTrilha: number;
  metaAtingida: boolean;
  ankiCardsSem?: number;
}

export type TimerPresetId = 'anki_15m' | 'exames_25m' | 'ciclo_90m' | 'osce_8m' | 'cochilo_90m';

export interface TimerPresetConfig {
  id: TimerPresetId;
  label: string;
  minutes: number;
  seconds: number;
  category: string;
}

export interface TimerLogEntry {
  id: string;
  presetId: TimerPresetId;
  completedAtIso: string;
  minutes: number;
}

export interface TeoriaDrillProgressEntry {
  drillId: string;
  modId: string;
  attempts: number;
  correctCount: number;
  streakCorrect: number;
  lastResult: 'correct' | 'wrong';
  lastAttemptIso: string;
  nextReviewIso: string;
}

export interface Central6AnoState {
  schemaVersion?: number;
  rodizioId: string;
  feriasSemana: string;
  marchaId: MarchaId;
  arquetipoId: 'ferias_4h' | 'dia_cheio' | 'pe_vespera' | 'plantao_12h' | 'pos_plantao' | 'fds';
  diaSemana: WeeklyDayKey;
  microHabitoSemanal: string;
  linkedHabId?: string;
  consecutiveCleanByHab?: Record<string, number>;
  dominadasHabIds?: Record<string, boolean>;
  questoesAncoraSem: number;
  questoesTrilhaSem: number;
  streakDias: number;
  semanasConcluidas: number;
  ultimoDiaConcluidoIso: string;
  checkedTimelineIds: Record<string, boolean>;
  checkedTimelineByDate?: Record<string, Record<string, boolean>>;
  ankiDoneByDate?: Record<string, boolean>;
  autoSyncDiaSemana?: boolean;
  curriculoDoneIds: Record<string, boolean>;
  ritualDomingoDoneIds: Record<string, boolean>;
  ritualDomingoCycleIso?: string;
  ritualDomingoLastCompletedIso?: string;
  teoriaStatusById?: Record<string, 'nao_iniciado' | 'estudado' | 'dominado'>;
  teoriaExercisesDone?: Record<string, boolean>;
  teoriaExercisesNotes?: Record<string, string>;
  teoriaDrillProgressById?: Record<string, TeoriaDrillProgressEntry>;
  activeTeoriaModId?: string;
  travasCheckedIds?: Record<string, boolean>;
  procCountsById?: Record<string, number>;
  procAutonomyById?: Record<string, { auxiliei: number; supervisionado: number; autonomo: number }>;
  shiftSchedule?: ShiftScheduleEntry[];
  weeklyHistory?: WeeklyHistory7030Entry[];
  timerLogs?: TimerLogEntry[];
  logbookEntries?: Array<{
    id: string;
    dateIso: string;
    rodizio: string;
    tipo: 'procedimento' | 'ponto_cego';
    titulo: string;
    papel: string;
    aprendizado: string;
    status?: 'em_treino' | 'resolvido';
    gatilhoCorrecao?: string;
  }>;
  // ---- Campos v2 — Cockpit Real do Internato & R1 ----
  weeklySchedule?: WeeklyScheduleMap;
  dailyTasks?: DailyTaskItem[];
  focoSemanalAncora70?: string;
  focoSemanalTrilha30?: string;
  questoesHoje?: number;
  questoesHojeDateIso?: string;
  ankiCardsHoje?: number;
  ankiCardsSem?: number;
  ankiCardsDateIso?: string;
  ankiMetaSemanal?: number;
  r1Milestones?: R1Milestone[];
  curriculumEntries?: Record<string, CurriculumEntryState>;
  curriculumEnamedConcept?: 3 | 4 | 5;
  r1SubTab?: 'plano' | 'r1';
  // ---- Esteira Contínua de Treino Clínico v3.1 ----
  treinoClinico?: TreinoClinicoState;
}

export interface EnsaioMentalProcGuide {
  id: string;
  nome: string;
  indicacao: string;
  material: string;
  anatomia: string;
  armadilha: string;
}

// ============================================================================
// GRADE SEMANAL (VISÃO A — HOJE)
// ============================================================================

export const WEEKLY_DAYS_ORDER: Array<{ key: WeeklyDayKey; short: string; label: string }> = [
  { key: 'seg', short: 'Seg', label: 'Segunda' },
  { key: 'ter', short: 'Ter', label: 'Terça' },
  { key: 'qua', short: 'Qua', label: 'Quarta' },
  { key: 'qui', short: 'Qui', label: 'Quinta' },
  { key: 'sex', short: 'Sex', label: 'Sexta' },
  { key: 'sab', short: 'Sáb', label: 'Sábado' },
  { key: 'dom', short: 'Dom', label: 'Domingo' },
];

export const SHIFT_TYPE_META: Record<
  ShiftType,
  { id: ShiftType; short: string; label: string; description: string }
> = {
  manha: { id: 'manha', short: 'M', label: 'Manhã', description: 'Turno matutino (enfermaria/ambulatório)' },
  tarde: { id: 'tarde', short: 'T', label: 'Tarde', description: 'Turno vespertino' },
  plantao_noturno: {
    id: 'plantao_noturno',
    short: 'PN',
    label: 'Plantão Noturno',
    description: 'Plantão 12h noturno — ativa Pós-Plantão automaticamente no dia seguinte',
  },
  folga: { id: 'folga', short: 'Folga', label: 'Folga', description: 'Dia livre / descanso / estudo focado' },
};

export const DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleMap = {
  seg: ['manha', 'tarde'],
  ter: ['manha', 'tarde'],
  qua: ['manha', 'tarde'],
  qui: ['manha', 'tarde'],
  sex: ['manha', 'tarde'],
  sab: ['folga'],
  dom: ['folga'],
};

// ============================================================================
// MARCOS & CICLOS R1 EDITÁVEIS (VISÃO B — R1 & CURRÍCULO)
// ============================================================================

export const DEFAULT_R1_MILESTONES: R1Milestone[] = [
  {
    id: 'ms-curriculo',
    titulo: 'Corte do Dossiê Curricular (Fim de Atividades Novas)',
    dateIso: '2027-06-30',
    categoria: 'curriculo',
    nota: 'Certificados frente/verso, chancela CCEx, DOI e declarações da FMRP fechados antes da reta final',
  },
  {
    id: 'ms-ciclo1',
    titulo: 'Fim do 1º Ciclo Teórico do 6º Ano (5 Grandes Áreas)',
    dateIso: '2027-08-31',
    categoria: 'estudo',
    nota: 'Base sólida fechada ainda no 6º ano para manter revisão leve durante o ano de trabalho em 2028',
  },
  {
    id: 'ms-formatura',
    titulo: 'Formatura Medicina (FMRP-USP)',
    dateIso: '2027-11-30',
    categoria: 'graduacao',
    nota: 'Conclusão do internato, CRM e início do ciclo de trabalho (quitar dívida + reserva)',
  },
  {
    id: 'ms-editais-2028',
    titulo: 'Publicação dos Editais & Inscrições R1 (Psiquiatria)',
    dateIso: '2028-09-15',
    categoria: 'curriculo',
    nota: 'Conferir retificações de barema 2029 (USP-SP, USP-RP, UNICAMP) e revisar PDFs antes do upload',
  },
  {
    id: 'ms-provas-r1',
    titulo: 'Provas R1 Psiquiatria — USP-SP / USP-RP / UNICAMP',
    dateIso: '2028-11-15',
    categoria: 'prova',
    nota: '1ª Fase teórica + 2ª Fase prática (USP-RP) + upload do currículo',
  },
  {
    id: 'ms-ingresso-r1',
    titulo: 'Ingresso na Residência Médica (R1 Psiquiatria)',
    dateIso: '2029-03-01',
    categoria: 'ingresso',
    nota: 'Início oficial do R1 (meta mar/2029)',
  },
];

// ============================================================================
// MATRIZ UNIFICADA DE CURRÍCULO — EDITAIS OFICIAIS INGRESSO 2027
// USP-SP (0–100 × ENAMED) · USP-RP (0–10 c/ ENAMED) · UNICAMP (0–100)
// Auditada pelos editais COREME/FM 02/2026 (USP-SP), HCFMRP 2027 e FCM 2026/27.
// ============================================================================

export const CURRICULUM_BANKS_CONFIG: Record<CurriculumBankId, CurriculumBankConfig> = {
  usp_sp: {
    id: 'usp_sp',
    nome: 'USP-SP (FMUSP / FUVEST)',
    sigla: 'USP-SP',
    escalaMax: 100,
    pesoNotaFinal: '10% (Peso 1 · 0–100)',
    psiquiatriaPesos: '90% 1ª Fase (120q) · 10% Currículo',
    pesoCurriculoPct: 10,
    pesoPrimeiraFasePct: 90,
    questoesPrimeiraFase: 120,
    editalRef: 'Edital COREME/FM nº 02/2026 (Ingresso 2027): 13 blocos = 100 pts × Fator ENAMED (1,0×/1,1×/1,2×, teto 100).',
    dicaEnvio:
      'PDF individual por item na Área do Candidato FUVEST (frente e verso legíveis no mesmo PDF). Extensão exige chancela da CCEx/Diretoria; Ligas foram retiradas do Item 10 em 2027.',
    blocks: [
      { id: 'inst_pos', label: '1. Pós CAPES / Sucupira', maxPoints: 15 },
      { id: 'inst_hu', label: '2. Hospital de Ensino', maxPoints: 12 },
      { id: 'inst_sus', label: '3. Rede SUS 1º/2º/3º', maxPoints: 8 },
      { id: 'monitoria', label: '4. Monitoria Oficial', maxPoints: 3 },
      { id: 'ic', label: '5. Iniciação Científica', maxPoints: 12 },
      { id: 'publicacao', label: '6. Publicação (fora da IC)', maxPoints: 10 },
      { id: 'org_eventos', label: '7. Org. Congressos/Eventos', maxPoints: 6 },
      { id: 'oral', label: '8. Oral (1º Autor)', maxPoints: 8 },
      { id: 'poster', label: '9. Pôster (1º Autor)', maxPoints: 6 },
      { id: 'extensao', label: '10. Extensão Acadêmica', maxPoints: 5 },
      { id: 'aprimoramento', label: '11. Aprimoramento / 2ª Grad.', maxPoints: 8 },
      { id: 'suporte_vida', label: '12. Suporte de Vida', maxPoints: 4 },
      { id: 'rep_estudantil', label: '13. Rep. Estudantil & Esporte', maxPoints: 3 },
    ],
  },
  usp_rp: {
    id: 'usp_rp',
    nome: 'USP-RP (FMRP / HC-FMRP)',
    sigla: 'USP-RP',
    escalaMax: 10,
    pesoNotaFinal: '10% (Peso 1 · 0–10)',
    psiquiatriaPesos: '50% 1ª Fase (100q) · 40% Prática · 10% Currículo',
    pesoCurriculoPct: 10,
    pesoPrimeiraFasePct: 50,
    questoesPrimeiraFase: 100,
    editalRef: 'Edital HC-FMRP Ingresso 2027 (Psiquiatria: 3 fases · 5 eixos = 10,0 pts; ENAMED até 0,5 pt no Histórico).',
    dicaEnvio:
      'Upload no portal HCRP após 1ª fase com timbre, período/carga horária e assinaturas. Sem ACLS/esporte tabelados; Teste de Progresso entra em Ensino.',
    blocks: [
      { id: 'historico', label: '1. Histórico & ENAMED', maxPoints: 1.5 },
      { id: 'assistencial', label: '2. Assistencial Extra', maxPoints: 2.0 },
      { id: 'cientifico', label: '3. Atividades Científicas', maxPoints: 3.0 },
      { id: 'ensino', label: '4. Ensino & Provas', maxPoints: 1.5 },
      { id: 'estudantil', label: '5. Atividades Estudantis', maxPoints: 2.0 },
    ],
  },
  unicamp: {
    id: 'unicamp',
    nome: 'UNICAMP (FCM / COMVEST)',
    sigla: 'UNICAMP',
    escalaMax: 100,
    pesoNotaFinal: '10% (Peso 10 · 0–100)',
    psiquiatriaPesos: '90% Discursiva (100q) · 10% Currículo',
    pesoCurriculoPct: 10,
    pesoPrimeiraFasePct: 90,
    questoesPrimeiraFase: 100,
    editalRef: 'Edital FCM/UNICAMP 2026/2027 (Acesso Direto: 11 blocos = 100 pts).',
    dicaEnvio:
      'PDF único ≤ 5 MB contendo formulário FCM + Lattes + comprovantes rigorosamente na ordem dos 11 itens. Não enviar dentro do prazo elimina do processo.',
    blocks: [
      { id: 'pos_fac', label: '1. Pós CAPES na Faculdade', maxPoints: 15 },
      { id: 'hu', label: '2. Hospital de Ensino', maxPoints: 10 },
      { id: 'ic', label: '3. Iniciação Científica', maxPoints: 20 },
      { id: 'artigos', label: '4. Artigos Completos', maxPoints: 15 },
      { id: 'congresso', label: '5. Trabalhos em Congresso', maxPoints: 10 },
      { id: 'liga', label: '6. Liga Acadêmica', maxPoints: 5 },
      { id: 'aprimoramento', label: '7. Cursos & Suporte Vida', maxPoints: 5 },
      { id: 'monitoria', label: '8. Monitoria / PAD', maxPoints: 5 },
      { id: 'extensao', label: '9. Voluntariado Social', maxPoints: 5 },
      { id: 'rep_colegiado', label: '10. Colegiados Institucionais', maxPoints: 5 },
      { id: 'rep_discente', label: '11. CA / Atlética / Esporte', maxPoints: 5 },
    ],
  },
};

export const CURRICULUM_CATEGORIES_META: Record<CurriculumCategoryId, { label: string }> = {
  institucional: { label: 'Institucional & Formação' },
  cientifico: { label: 'Pesquisa, Artigos & Congressos' },
  ensino_ligas: { label: 'Monitoria, Ligas & Eventos' },
  assistencial_cursos: { label: 'Extensão, Estágios & Cursos' },
  representacao: { label: 'Representação, Esporte & Provas' },
};

/**
 * Catálogo unificado auditado pelos editais oficiais 2027 (USP-SP, USP-RP, UNICAMP).
 * Preencher 1 vez calcula simultaneamente nas 3 bancas respeitando tetos de bloco,
 * multiplicador/bônus ENAMED e regra de não-duplicação IC vs. Artigo na USP-SP.
 */
export const UNIFIED_CURRICULUM_CATALOG: CurriculumCatalogItem[] = [
  // 1. INSTITUCIONAL & FORMAÇÃO
  {
    id: 'inst_pos_capes',
    categoria: 'institucional',
    titulo: 'Faculdade com Pós-Graduação Stricto Sensu (Doutorado CAPES)',
    descricao: 'Declaração oficial da CPG listando programas Medicina I/II/III credenciados (≥ 5 programas / Sucupira).',
    inputType: 'boolean',
    maxInput: 1,
    actionable: false,
    rules: {
      usp_sp: { blockId: 'inst_pos', perUnit: 15, maxItemPoints: 15, note: 'Item 1 (2027): Pós CAPES/Sucupira até 15 pts' },
      usp_rp: { blockId: 'historico', perUnit: 0.5, maxItemPoints: 0.5, note: 'Item 1: ≥ 5 programas CAPES = 0,5 pt (+ ENAMED até 0,5)' },
      unicamp: { blockId: 'pos_fac', perUnit: 15, maxItemPoints: 15, note: 'Item 1a: Doutorado stricto sensu = 15 pts' },
    },
  },
  {
    id: 'inst_hu_proprio',
    categoria: 'institucional',
    titulo: 'Hospital de Ensino Próprio (HU / HCRP)',
    descricao: 'Termo emitido pelo Serviço Acadêmico / Comissão de Graduação comprovando hospital universitário próprio.',
    inputType: 'boolean',
    maxInput: 1,
    actionable: false,
    rules: {
      usp_sp: { blockId: 'inst_hu', perUnit: 12, maxItemPoints: 12, note: 'Item 2a: Hospital de ensino próprio = 12 pts' },
      usp_rp: { blockId: 'historico', perUnit: 0.5, maxItemPoints: 0.5, note: 'Item 1: HU próprio = 0,5 pt (soma c/ CAPES + ENAMED = 1,5)' },
      unicamp: { blockId: 'hu', perUnit: 10, maxItemPoints: 10, note: 'Item 2a: HU próprio = 10 pts' },
    },
  },
  {
    id: 'inst_sus_rede',
    categoria: 'institucional',
    titulo: 'Centro Assistencial Próprio SUS (Primário, Secundário e Terciário)',
    descricao: 'Declaração do Serviço Acadêmico com nome, endereço e telefone dos locais da rede SUS 1º/2º/3º (Portaria 4.279).',
    inputType: 'boolean',
    maxInput: 1,
    actionable: false,
    rules: {
      usp_sp: { blockId: 'inst_sus', perUnit: 8, maxItemPoints: 8, note: 'Item 3a: Rede SUS 1º, 2º e 3º níveis = 8 pts' },
    },
  },
  {
    id: 'outra_graduacao_pos',
    categoria: 'institucional',
    titulo: 'Outro Curso Universitário Concluído (ex.: Psicologia)',
    descricao: 'Diploma de graduação prévia reconhecida pelo MEC (Item 11d USP-SP). Mestrado (4) / Doutorado (8) entram no mesmo bloco.',
    inputType: 'boolean',
    maxInput: 1,
    actionable: false,
    rules: {
      usp_sp: { blockId: 'aprimoramento', perUnit: 1, maxItemPoints: 1, note: 'Item 11d: Outro curso universitário concluído = 1 pt (bloco teto 8)' },
    },
  },

  // 2. CIENTÍFICO (IC, ARTIGOS, CONGRESSOS)
  {
    id: 'ic_com_bolsa',
    categoria: 'cientifico',
    titulo: 'Iniciação Científica COM Bolsa (FAPESP / CNPq / PIBIC)',
    descricao: 'Informe em anos concluídos (1 ano = 2 semestres). Exige declaração institucional + agência de fomento e carga horária.',
    inputType: 'number',
    unitLabel: 'anos',
    step: 0.5,
    maxInput: 4,
    actionable: true,
    effortHint: 'alto',
    roiStep: 1,
    roiActionLabel: 'Concluir +1 ano de IC com bolsa',
    rules: {
      usp_sp: {
        blockId: 'ic',
        perUnit: 2,
        maxItemPoints: 4,
        note: 'Item 5b: 2 pts/projeto (2 sem) s/ artigo; sobe p/ 6 pts/projeto (teto 12) com artigo vinculado à IC',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 0.7,
        maxItemPoints: 1.4,
        note: 'Item 3: 0,7 pt/ano (mín. 1 ano; teto 1,4)',
      },
      unicamp: {
        blockId: 'ic',
        perUnit: 15,
        maxItemPoints: 20,
        tiers: [
          { minUnits: 1.5, points: 20 },
          { minUnits: 0.5, points: 15 },
        ],
        note: 'Item 3a: > 2 sem = 20 pts; até 2 sem = 15 pts',
      },
    },
  },
  {
    id: 'ic_sem_bolsa',
    categoria: 'cientifico',
    titulo: 'Iniciação Científica SEM Bolsa (Institucional Oficial)',
    descricao: 'Vigência institucional oficial sem fomento (em anos) com carga horária e assinatura do orientador/instituição.',
    inputType: 'number',
    unitLabel: 'anos',
    step: 0.5,
    maxInput: 4,
    actionable: true,
    effortHint: 'alto',
    roiStep: 1,
    roiActionLabel: 'Concluir +1 ano de IC sem bolsa',
    rules: {
      usp_sp: {
        blockId: 'ic',
        perUnit: 1,
        maxItemPoints: 2,
        note: 'Item 5: 1 pt/projeto s/ artigo; sobe p/ 4 pts/projeto (teto 8) se tiver artigo vinculado',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 0.5,
        maxItemPoints: 1.0,
        note: 'Item 3: 0,5 pt/ano sem bolsa (teto 1,0)',
      },
      unicamp: {
        blockId: 'ic',
        perUnit: 5,
        maxItemPoints: 10,
        tiers: [
          { minUnits: 1.5, points: 10 },
          { minUnits: 0.5, points: 5 },
        ],
        note: 'Item 3b: > 2 sem = 10 pts; até 2 sem = 5 pts',
      },
    },
  },
  {
    id: 'ic_artigo_vinculado',
    categoria: 'cientifico',
    titulo: 'Projetos de IC com Artigo Aceito / Publicado (Bônus USP-SP)',
    descricao: 'Quantos dos seus artigos abaixo derivam diretamente de projetos de IC. Na USP-SP eleva o projeto de 2→6 pts (e desconta do Item 6).',
    inputType: 'number',
    unitLabel: 'projetos',
    step: 1,
    maxInput: 2,
    actionable: true,
    effortHint: 'medio',
    roiStep: 1,
    roiActionLabel: 'Publicar artigo derivado do 2º projeto de IC',
    rules: {
      usp_sp: {
        blockId: 'ic',
        perUnit: 4,
        maxItemPoints: 8,
        note: 'Item 5a: +4 pts/proj c/ bolsa (total 6/proj) ou +3 pts s/ bolsa; artigo usado aqui não repete no Item 6',
      },
    },
  },
  {
    id: 'artigo_pubmed',
    categoria: 'cientifico',
    titulo: 'Artigo Científico Completo Publicado / Aceito (PubMed / JCR)',
    descricao: 'Informe o TOTAL de artigos PubMed (incluindo o da IC). Anexar cópia completa + DOI. Resumos em anais não contam.',
    inputType: 'number',
    unitLabel: 'artigos',
    step: 1,
    maxInput: 6,
    actionable: true,
    effortHint: 'alto',
    roiStep: 1,
    roiActionLabel: 'Publicar +1 artigo completo indexado no PubMed',
    rules: {
      usp_sp: {
        blockId: 'publicacao',
        perUnit: 10,
        maxItemPoints: 10,
        note: 'Item 6a: 10 pts (máx 1 artigo DIFERENTE do usado na IC)',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 1.0,
        maxItemPoints: 3.0,
        note: 'Item 3: 1,0 pt/artigo c/ DOI (bloco teto 3,0)',
      },
      unicamp: {
        blockId: 'artigos',
        perUnit: 10,
        maxItemPoints: 15,
        note: 'Item 4a: 10 pts/artigo PubMed c/ DOI (teto 15)',
      },
    },
  },
  {
    id: 'artigo_scielo',
    categoria: 'cientifico',
    titulo: 'Artigo Científico Completo Publicado / Aceito (SciELO / LILACS)',
    descricao: 'Artigo completo indexado em SciELO/LILACS/Scopus com DOI. Na USP-RP vale 1,0 pt igual PubMed.',
    inputType: 'number',
    unitLabel: 'artigos',
    step: 1,
    maxInput: 6,
    actionable: true,
    effortHint: 'alto',
    roiStep: 1,
    roiActionLabel: 'Publicar +1 artigo completo SciELO/LILACS',
    rules: {
      usp_sp: {
        blockId: 'publicacao',
        perUnit: 8,
        maxItemPoints: 8,
        note: 'Item 6b: 8 pts (máx 1 artigo DIFERENTE do usado na IC)',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 1.0,
        maxItemPoints: 3.0,
        note: 'Item 3: 1,0 pt/artigo SciELO/LILACS/Scopus c/ DOI (teto 3,0)',
      },
      unicamp: {
        blockId: 'artigos',
        perUnit: 5,
        maxItemPoints: 15,
        note: 'Item 4b: 5 pts/artigo SciELO (teto 15)',
      },
    },
  },
  {
    id: 'congresso_oral',
    categoria: 'cientifico',
    titulo: 'Apresentação ORAL em Congresso de Sociedade (Nacional / Int.)',
    descricao: 'Certificado especificando apresentação oral e 1º autor (exigido na USP-SP). Na UNICAMP vale autor ou coautor.',
    inputType: 'number',
    unitLabel: 'trabalhos',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'medio',
    roiStep: 1,
    roiActionLabel: 'Apresentar 1 trabalho ORAL (1º autor) em congresso de sociedade',
    rules: {
      usp_sp: {
        blockId: 'oral',
        perUnit: 7,
        maxItemPoints: 8,
        note: 'Item 8: 1º autor oral Nacional = 7 pts (Int. = 8 pts; teto bloco 8)',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 0.5,
        maxItemPoints: 1.0,
        note: 'Item 3: 0,5 pt/apresentação oral (teto 1,0)',
      },
      unicamp: {
        blockId: 'congresso',
        perUnit: 10,
        maxItemPoints: 10,
        note: 'Item 5a.1: Oral em Congresso de Sociedade = 10 pts (teto 10)',
      },
    },
  },
  {
    id: 'congresso_poster',
    categoria: 'cientifico',
    titulo: 'Pôster em Congresso de Sociedade Médica (1º Autor)',
    descricao: 'Certificado de congresso de sociedade nacional/internacional indicando 1º autor (USP-SP exige 1º autor; USP-RP 1º/2º).',
    inputType: 'number',
    unitLabel: 'pôsteres',
    step: 1,
    maxInput: 6,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Apresentar 1 pôster (1º autor) em congresso nacional de sociedade',
    rules: {
      usp_sp: {
        blockId: 'poster',
        perUnit: 4,
        maxItemPoints: 6,
        note: 'Item 9b: 1º autor Nacional = 4 pts (Int. = 6 pts; teto bloco 6)',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 0.15,
        maxItemPoints: 0.6,
        note: 'Item 3: Pôster 1º/2º autor (Reg 0,1 / Nac 0,15 / Int 0,3 · teto 0,6)',
      },
      unicamp: {
        blockId: 'congresso',
        perUnit: 6,
        maxItemPoints: 10,
        note: 'Item 5a.2: Pôster em Sociedade = 6 pts (bloco teto 10)',
      },
    },
  },
  {
    id: 'congresso_academico',
    categoria: 'cientifico',
    titulo: 'Trabalho em Evento Acadêmico Local / Regional (ex.: SIICUSP)',
    descricao: 'Jornadas, simpósios acadêmicos ou SIICUSP como 1º autor. Atenção: certificado deve especificar oral vs. pôster.',
    inputType: 'number',
    unitLabel: 'trabalhos',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Apresentar trabalho em simpósio/jornada acadêmica (1º autor)',
    rules: {
      usp_sp: {
        blockId: 'poster',
        perUnit: 1,
        maxItemPoints: 1,
        note: 'Item 9c: 1º autor pôster evento acadêmico = 1 pt (se oral comprovado: Item 8i = 2 pts)',
      },
      usp_rp: {
        blockId: 'cientifico',
        perUnit: 0.1,
        maxItemPoints: 0.6,
        note: 'Item 3: Pôster regional 1º/2º autor = 0,1 pt (oral = 0,5 pt)',
      },
      unicamp: {
        blockId: 'congresso',
        perUnit: 2,
        maxItemPoints: 10,
        note: 'Item 5b: Congresso acadêmico local/regional (oral ou pôster) = 2 pts',
      },
    },
  },

  // 3. ENSINO, LIGAS & EVENTOS
  {
    id: 'monitoria_oficial',
    categoria: 'ensino_ligas',
    titulo: 'Monitoria Acadêmica Oficial / PAD (em semestres)',
    descricao: 'Certificado institucional com período e carga horária (USP-SP: 64h/128h/192h; USP-RP exige bolsa por ≥ 1 ano).',
    inputType: 'number',
    unitLabel: 'semestres',
    step: 1,
    maxInput: 6,
    actionable: true,
    effortHint: 'medio',
    roiStep: 2,
    roiActionLabel: 'Fazer 2 semestres de monitoria oficial (c/ bolsa se possível)',
    rules: {
      usp_sp: {
        blockId: 'monitoria',
        perUnit: 1,
        maxItemPoints: 3,
        tiers: [
          { minUnits: 3, points: 3 },
          { minUnits: 2, points: 2 },
          { minUnits: 1, points: 1 },
        ],
        note: 'Item 4: >2 sem (≥192h)=3; 2 sem (≥128h)=2; 1 sem (≥64h)=1',
      },
      usp_rp: {
        blockId: 'ensino',
        perUnit: 0.5,
        maxItemPoints: 1.0,
        tiers: [
          { minUnits: 4, points: 1.0 },
          { minUnits: 2, points: 0.5 },
        ],
        note: 'Item 4: Monitoria COM bolsa ≥1 ano (2 sem) = 0,5 pt/ano (teto 1,0)',
      },
      unicamp: {
        blockId: 'monitoria',
        perUnit: 2,
        maxItemPoints: 5,
        tiers: [
          { minUnits: 3, points: 5 },
          { minUnits: 1, points: 2 },
        ],
        note: 'Item 8: > 2 sem = 5 pts; até 2 sem = 2 pts',
      },
    },
  },
  {
    id: 'liga_diretoria',
    categoria: 'ensino_ligas',
    titulo: 'Liga Acadêmica — Diretoria (≥ 1 ano / 2 semestres)',
    descricao: 'Certificado timbrado pelo coordenador da liga. Nota: USP-SP 2027 retirou ligas do Item 10 (agora é extensão).',
    inputType: 'boolean',
    maxInput: 1,
    actionable: true,
    effortHint: 'medio',
    roiActionLabel: 'Completar 1 ano de diretoria em liga acadêmica',
    rules: {
      usp_rp: { blockId: 'assistencial', perUnit: 0.5, maxItemPoints: 0.5, note: 'Item 2: 0,5 pt por ano de liga (sem bônus por diretoria; máx 1,0)' },
      unicamp: { blockId: 'liga', perUnit: 5, maxItemPoints: 5, note: 'Item 6a: Diretoria de liga = 5 pts (teto 5)' },
    },
  },
  {
    id: 'liga_membro',
    categoria: 'ensino_ligas',
    titulo: 'Liga Acadêmica — Anos adicionais como Membro / Ligante',
    descricao: 'Anos como ligante (ou 2º ano de liga para fechar o teto 1,0 pt na USP-RP). Relatório de atividades se houver assistência.',
    inputType: 'number',
    unitLabel: 'anos',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Completar +1 ano em liga acadêmica (fecha teto USP-RP)',
    rules: {
      usp_rp: { blockId: 'assistencial', perUnit: 0.5, maxItemPoints: 1.0, note: 'Item 2: 0,5 pt/ano de liga (teto conjunto liga = 1,0)' },
      unicamp: { blockId: 'liga', perUnit: 2, maxItemPoints: 4, note: 'Item 6b: Membro = 2 pts (bloco teto 5)' },
    },
  },
  {
    id: 'org_evento',
    categoria: 'ensino_ligas',
    titulo: 'Organização de Eventos Científicos (Ligas / DA / Extensão)',
    descricao: 'Comissão organizadora de jornadas, aulas abertas ou simpósios acadêmicos (ex.: LAPQ, Simpósio Pontes).',
    inputType: 'number',
    unitLabel: 'eventos',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Organizar +1 evento científico acadêmico',
    rules: {
      usp_sp: { blockId: 'org_eventos', perUnit: 2, maxItemPoints: 4, note: 'Item 7b: 2 pts/evento acadêmico (máx 2 atividades = 4 pts)' },
      usp_rp: { blockId: 'ensino', perUnit: 0.3, maxItemPoints: 0.6, note: 'Item 4: 0,3 pt/evento científico (teto 0,6)' },
    },
  },
  {
    id: 'org_evento_sociedade',
    categoria: 'ensino_ligas',
    titulo: 'Organização de Congresso de Sociedade Médica (Estadual / Nac.)',
    descricao: 'Comissão organizadora de congresso promovido por entidade profissional de classe (USP-SP Item 7a).',
    inputType: 'number',
    unitLabel: 'eventos',
    step: 1,
    maxInput: 2,
    actionable: true,
    effortHint: 'alto',
    roiStep: 1,
    roiActionLabel: 'Participar da comissão organizadora de congresso de sociedade',
    rules: {
      usp_sp: { blockId: 'org_eventos', perUnit: 4, maxItemPoints: 4, note: 'Item 7a: 4 pts (máx 1 atividade; bloco teto 6)' },
      usp_rp: { blockId: 'ensino', perUnit: 0.3, maxItemPoints: 0.6, note: 'Item 4: 0,3 pt/evento (teto 0,6)' },
    },
  },

  // 4. EXTENSÃO, ESTÁGIOS & CURSOS
  {
    id: 'extensao_voluntariado',
    categoria: 'assistencial_cursos',
    titulo: 'Extensão Universitária Acadêmica / Voluntariado Social (horas)',
    descricao: 'Projetos de extensão não curriculares e voluntariado social (exceto ligas). USP-SP exige chancela da CCEx/Diretoria.',
    inputType: 'number',
    unitLabel: 'horas',
    step: 24,
    maxInput: 240,
    actionable: true,
    effortHint: 'medio',
    roiStep: 48,
    roiActionLabel: 'Acumular +48h em extensão/voluntariado oficial',
    rules: {
      usp_sp: {
        blockId: 'extensao',
        perUnit: 0.05,
        maxItemPoints: 5,
        tiers: [
          { minUnits: 96, points: 5 },
          { minUnits: 48, points: 2.5 },
        ],
        note: 'Item 10 (2027): Extensão acadêmica (sem ligas) c/ aval CCEx/Diretoria — até 5 pts',
      },
      usp_rp: {
        blockId: 'assistencial',
        perUnit: 0.004,
        maxItemPoints: 1.0,
        tiers: [
          { minUnits: 240, points: 1.0 },
          { minUnits: 120, points: 0.5 },
        ],
        note: 'Item 2: Voluntariado social 0,5 pt por bloco de 120h (teto 1,0)',
      },
      unicamp: {
        blockId: 'extensao',
        perUnit: 0.05,
        maxItemPoints: 5,
        tiers: [
          { minUnits: 97, points: 5 },
          { minUnits: 48, points: 2 },
        ],
        note: 'Item 9: Voluntariado social > 96h = 5 pts; 48–96h = 2 pts',
      },
    },
  },
  {
    id: 'cursos_suporte_vida',
    categoria: 'assistencial_cursos',
    titulo: 'Cursos de Suporte de Vida Atualizados (ACLS / ATLS / PALS / BLS)',
    descricao: 'Certificação dentro da validade na inscrição. Pontua na USP-SP e UNICAMP (não tabelado na USP-RP).',
    inputType: 'number',
    unitLabel: 'cursos',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Fazer 1 curso de suporte de vida (ACLS/BLS/PALS)',
    rules: {
      usp_sp: { blockId: 'suporte_vida', perUnit: 2, maxItemPoints: 4, note: 'Item 12: 2 pts/curso atualizado (máx 2 = 4 pts)' },
      unicamp: { blockId: 'aprimoramento', perUnit: 2, maxItemPoints: 5, note: 'Item 7b: 2 pts/curso suporte de vida (bloco teto 5)' },
    },
  },
  {
    id: 'cursos_aprimoramento_12h',
    categoria: 'assistencial_cursos',
    titulo: 'Cursos de ECG / Ventilação Mecânica / USG Beira-Leito (> 12h)',
    descricao: 'Cursos concluídos na área da saúde com > 12h (não vale cursinho preparatório para residência).',
    inputType: 'number',
    unitLabel: 'cursos',
    step: 1,
    maxInput: 5,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Concluir 1 curso certificado > 12h (ECG/VM/USG)',
    rules: {
      unicamp: { blockId: 'aprimoramento', perUnit: 1, maxItemPoints: 5, note: 'Item 7a: 1 pt/curso > 12h (bloco teto 5)' },
    },
  },
  {
    id: 'estagio_extracurricular',
    categoria: 'assistencial_cursos',
    titulo: 'Plantão / Estágio Voluntário Extracurricular (blocos de 120h)',
    descricao: 'Fora da grade obrigatória do internato com declaração de carga horária. Pontua apenas na USP-RP.',
    inputType: 'number',
    unitLabel: 'blocos (120h)',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'medio',
    roiStep: 1,
    roiActionLabel: 'Cumprir 1 bloco de 120h de plantão voluntário extracurricular',
    rules: {
      usp_rp: { blockId: 'assistencial', perUnit: 0.5, maxItemPoints: 1.0, note: 'Item 2: 0,5 pt por 120h de plantão voluntário (teto 1,0)' },
    },
  },

  // 5. REPRESENTAÇÃO, ESPORTE & PROVAS
  {
    id: 'rep_colegiado',
    categoria: 'representacao',
    titulo: 'Representação Discente em Colegiados Institucionais (anos)',
    descricao: 'Congregação, Conselhos Departamentais, CCG ou Comissões de Avaliação/Reforma Curricular (assinado pela faculdade).',
    inputType: 'number',
    unitLabel: 'anos',
    step: 1,
    maxInput: 2,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Assumir 1 gestão (1 ano) como representante discente em colegiado',
    rules: {
      usp_sp: {
        blockId: 'rep_estudantil',
        perUnit: 1,
        maxItemPoints: 3,
        tiers: [
          { minUnits: 2, points: 3 },
          { minUnits: 1, points: 1 },
        ],
        note: 'Item 13: ≥ 2 anos = 3 pts; ≥ 1 ano = 1 pt (teto bloco 3)',
      },
      usp_rp: { blockId: 'estudantil', perUnit: 0.5, maxItemPoints: 1.0, note: 'Item 5: 0,5 pt/ano em colegiado oficial (teto 1,0)' },
      unicamp: {
        blockId: 'rep_colegiado',
        perUnit: 5,
        maxItemPoints: 5,
        tiers: [{ minUnits: 1, points: 5 }],
        note: 'Item 10: Colegiado institucional (mín. 1 sem) = 5 pts',
      },
    },
  },
  {
    id: 'rep_ca_atletica',
    categoria: 'representacao',
    titulo: 'Diretoria de Centro Acadêmico (CARL/DA) ou Atlética (gestões/anos)',
    descricao: 'Gestão mínima de 1 ano (2 semestres) comprovada por certificado institucional contendo período e cargo.',
    inputType: 'number',
    unitLabel: 'anos',
    step: 1,
    maxInput: 3,
    actionable: true,
    effortHint: 'medio',
    roiStep: 1,
    roiActionLabel: 'Cumprir 1 gestão de CA ou Atlética',
    rules: {
      usp_sp: {
        blockId: 'rep_estudantil',
        perUnit: 1,
        maxItemPoints: 3,
        tiers: [
          { minUnits: 2, points: 3 },
          { minUnits: 1, points: 1 },
        ],
        note: 'Item 13: ≥ 2 anos = 3 pts; ≥ 1 ano = 1 pt (compartilha teto 3)',
      },
      usp_rp: { blockId: 'estudantil', perUnit: 0.5, maxItemPoints: 1.0, note: 'Item 5: 0,5 pt/ano em CA/Atlética (teto 1,0)' },
      unicamp: { blockId: 'rep_discente', perUnit: 2, maxItemPoints: 4, note: 'Item 11: CA = 2 pts / Atlética = 2 pts (bloco teto 5)' },
    },
  },
  {
    id: 'esporte_universitario',
    categoria: 'representacao',
    titulo: 'Equipe Esportiva Universitária Oficial (ex.: Natação, em anos)',
    descricao: 'Participação regular comprovada pela instituição/atlética com período e carga horária. Na USP-SP entra no Item 13!',
    inputType: 'number',
    unitLabel: 'anos',
    step: 0.5,
    maxInput: 4,
    actionable: true,
    effortHint: 'medio',
    roiStep: 0.5,
    roiActionLabel: 'Completar 2 anos de equipe esportiva universitária',
    rules: {
      usp_sp: {
        blockId: 'rep_estudantil',
        perUnit: 1,
        maxItemPoints: 3,
        tiers: [
          { minUnits: 2, points: 3 },
          { minUnits: 1, points: 1 },
        ],
        note: 'Item 13: Equipe esportiva ≥ 2 anos = 3 pts; ≥ 1 ano = 1 pt',
      },
      unicamp: {
        blockId: 'rep_discente',
        perUnit: 1,
        maxItemPoints: 1,
        tiers: [{ minUnits: 1, points: 1 }],
        note: 'Item 11c: Equipe esportiva (≥ 2 sem) = 1 pt',
      },
    },
  },
  {
    id: 'teste_progresso',
    categoria: 'representacao',
    titulo: 'Provas Suprainstitucionais (Teste de Progresso / Habilidades / CRM)',
    descricao: 'Participação comprovada nas edições anuais do Teste de Progresso (ABEM/Núcleo). Pontua em Ensino na USP-RP.',
    inputType: 'number',
    unitLabel: 'provas',
    step: 1,
    maxInput: 4,
    actionable: true,
    effortHint: 'baixo',
    roiStep: 1,
    roiActionLabel: 'Fazer +1 edição do Teste de Progresso (ABEM/Núcleo)',
    rules: {
      usp_rp: { blockId: 'ensino', perUnit: 0.5, maxItemPoints: 1.0, note: 'Item 4 (Ensino): 0,5 pt/prova não obrigatória (teto 1,0)' },
    },
  },
];

/**
 * Migração automática de chaves antigas da v2 para as chaves auditadas 2027.
 */
export const CURRICULUM_ID_MIGRATION_MAP: Record<string, string> = {
  inst_docentes_cr: 'inst_sus_rede',
};

/**
 * Inventário base conhecido do Wagner (O que eu já fiz.txt + 4 PDFs em Currículo/Certificados + Psicologia).
 * Usado apenas quando o usuário aciona explicitamente "Carregar meu inventário".
 */
export const WAGNER_BASELINE_CURRICULUM_ENTRIES: Record<string, CurriculumEntryState> = {
  inst_pos_capes: {
    value: 1,
    proofStatus: 'falta',
    notes: 'FMRP-USP (> 5 programas Medicina I/II/III CAPES). Solicitar declaração na CPG/Serviço Acadêmico.',
  },
  inst_hu_proprio: {
    value: 1,
    proofStatus: 'falta',
    notes: 'HCRP-USP próprio. Solicitar termo comprobatório no Serviço Acadêmico da FMRP.',
  },
  inst_sus_rede: {
    value: 1,
    proofStatus: 'falta',
    notes: 'Rede assistencial FMRP (1º, 2º e 3º níveis SUS). Pedir declaração com endereços e telefones (Portaria 4.279).',
  },
  outra_graduacao_pos: {
    value: 1,
    proofStatus: 'falta',
    notes: 'Graduação em Psicologia concluída (+1 pt garantido no Item 11d da USP-SP). Digitalizar diploma frente e verso.',
  },
  ic_com_bolsa: {
    value: 2,
    proofStatus: 'em_andamento',
    notes: '2 anos de IC com bolsa (encerrando Jan/2027). Reunir comprovante da agência + carga horária e assinatura do orientador.',
  },
  ic_artigo_vinculado: {
    value: 1,
    proofStatus: 'em_andamento',
    notes: '1 dos 2 artigos publicados deriva da IC (eleva projeto 1 de 2→6 pts na USP-SP sem repetir no Item 6).',
  },
  artigo_pubmed: {
    value: 2,
    proofStatus: 'em_andamento',
    notes: '2 artigos publicados (1 da IC + 1 fora da IC). Confirmar indexação PubMed vs. SciELO e salvar PDF completo + DOI de ambos.',
  },
  congresso_academico: {
    value: 1,
    proofStatus: 'pdf_pronto',
    notes: 'Certificados/Siicusp.pdf (33º SIICUSP 2025, 1º autor). Alerta: declaração não especifica oral vs. pôster — checar se cabe declaração complementar.',
  },
  liga_diretoria: {
    value: 1,
    proofStatus: 'falta',
    notes: 'Diretoria de Liga Acadêmica (> 1 ano). Emitir certificado timbrado com datas, carga horária e assinatura do docente tutor.',
  },
  org_evento: {
    value: 2,
    proofStatus: 'pdf_pronto',
    notes: 'Certificados prontos: Aula Aberta LAPQ 2026 (4h) + Simpósio Redução de Danos — Pontes (4h). Fecha teto 7b USP-SP e 0,6 USP-RP.',
  },
  extensao_voluntariado: {
    value: 240,
    proofStatus: 'pdf_pronto',
    notes: 'Certificados/Construindo Pontes.pdf (Gestão set/2022–out/2023, 240h). Alerta USP-SP 2027: certificado está no CARL — validar se precisa chancela da CCEx/FMRP.',
  },
  esporte_universitario: {
    value: 1.5,
    proofStatus: 'falta',
    notes: '1,5 ano na equipe de natação da faculdade (+1 pt USP-SP Item 13 e +1 pt UNICAMP Item 11c). Pedir certificado com período e carga horária.',
  },
};

/**
 * Mapeamento de migração automática dos IDs legados (`curriculoDoneIds` da v1)
 * para o catálogo canônico unificado (preserva progresso salvo no localStorage).
 */
export const LEGACY_CURRICULO_TO_UNIFIED_MAP: Record<string, Array<{ canonicalId: string; value: number }>> = {
  'curr-inst-fmrp': [
    { canonicalId: 'inst_pos_capes', value: 1 },
    { canonicalId: 'inst_hu_proprio', value: 1 },
    { canonicalId: 'inst_sus_rede', value: 1 },
  ],
  'curr-ic-2anos': [{ canonicalId: 'ic_com_bolsa', value: 2 }],
  'curr-2-artigos': [{ canonicalId: 'artigo_pubmed', value: 2 }],
  'curr-liga': [{ canonicalId: 'liga_diretoria', value: 1 }],
  'curr-natacao': [{ canonicalId: 'esporte_universitario', value: 1.5 }],
  'curr-monitoria': [{ canonicalId: 'monitoria_oficial', value: 2 }],
  'curr-congresso': [{ canonicalId: 'congresso_oral', value: 1 }],
  'curr-org-evento': [{ canonicalId: 'org_evento', value: 1 }],
  'curr-cursos-suporte': [{ canonicalId: 'cursos_suporte_vida', value: 1 }],
  'curr-voluntariado-plantao': [{ canonicalId: 'extensao_voluntariado', value: 100 }],
  'curr-rep-estudantil': [
    { canonicalId: 'rep_colegiado', value: 1 },
    { canonicalId: 'teste_progresso', value: 2 },
  ],
};

// ============================================================================
// DADOS ESTÁTICOS DE RODÍZIOS, MARCHAS, LOGBOOK, RITUAL E ENSAIO MENTAL
// (Preservados 100% para retrocompatibilidade e Visão C / Teoria / Ferramentas)
// ============================================================================

export const RODIZIOS_6ANO: RodizioConfig[] = [
  {
    id: 'ferias',
    nome: 'Pré-Temporada de Férias (31 dias úteis)',
    periodo: '30/11/2026 a 24/01/2027',
    areaBadge: 'cirurgia',
    ancora70: 'Cirurgia + Anestesio/CTI + Lacunas Obstetrícia + Clínica Crítica (Medway + MedQuest, ~2h/dia)',
    trilha30: 'Esteira Contínua v3.1 (~55–70 min/dia Seg–Sex; ~3h/dia total, folgas 24–25/12, 31/12–01/01 e 11–17/01)',
    procedimentosAlvo: [
      '1ª passada E1 (19/20 + baseline), E3-Porta (6/7) e E4 (6/7) até 24/01',
      '≥ 6 queixas E1 dominadas na Esteira v3.1 + ≥ 25/31 dias úteis no Bloco 1',
      'Blocos visuais obrigatórios (ECG + RX nas queixas #1, #4, #5 e #17)',
      'Revisão de 15 min do LOG + Baseline Caso B em 24/01/2027 + IC/editais R1',
    ],
    microHabitoSugerido: 'Anamnese guiada por 3 hipóteses (3H ≤ 60s) + apresentação oral ≤ 90s',
  },
  {
    id: 'cirurgia',
    nome: 'Mês 1 — Cirurgia Geral (1 mês)',
    periodo: '25/01 a 21/02/2027',
    areaBadge: 'cirurgia',
    ancora70: 'Abdome agudo, Trauma/ATLS, Pré/Pós-operatório, Hérnias, Vias biliares e Onco-cirurgia',
    trilha30: 'Preventiva Bloco 1 (SUS, Atenção Primária, Vigilância e Indicadores)',
    procedimentosAlvo: ['Anestesia local + Sutura (Regra 3x)', 'Drenagem abscesso / CE superficial', 'Curativo complexo / retirada de dreno', 'SVD (M/F) e SNG/SNE'],
    microHabitoSugerido: 'Exame de Abdome Agudo guiado por hipóteses (LR+) + Passagem SBAR pós-op',
  },
  {
    id: 'anestesio_cti',
    nome: 'Mês 2 — Anestesiologia & CTI (1 mês)',
    periodo: '22/02 a 21/03/2027',
    areaBadge: 'clinica',
    ancora70: 'Avaliação pré-anestésica, Via Aérea/IOT, Choque/Sepse/DVA, VM + Clínica Crítica (Cardio/Pneumo/Nefro/Gaso)',
    trilha30: 'Preventiva Bloco 2 (Estudos Epidemiológicos, Bioestatística e Testes Diagnósticos)',
    procedimentosAlvo: ['Ventilação BVM (C-E)', 'Laringoscopia / IOT', 'Punção para Gasometria Arterial'],
    microHabitoSugerido: 'ABCDE nos primeiros 5 min + Checklist das 7 Travas A-R-G-I-V-P-O no CTI',
  },
  {
    id: 'go',
    nome: 'Meses 3–4 — Ginecologia & Obstetrícia (6 sem)',
    periodo: '22/03 a 02/05/2027',
    areaBadge: 'go',
    ancora70: 'Obstetrícia de Alto Risco (DHEG/HELLP, Hemorragias, Partograma/CTG) + Gineco Endócrina, IST/DIP e Onco',
    trilha30: 'Clínica Médica Bloco 1 (Endocrinologia: DM/Tireoide + Reumatologia)',
    procedimentosAlvo: ['Exame especular + coleta CCO', 'Toque obstétrico (dilatação/apagamento/plano)', 'Parto normal assistido / sutura perineal'],
    microHabitoSugerido: 'Anamnese acolhedora Calgary-Cambridge (ICE) + 4 Manobras de Leopold + SNAPPS',
  },
  {
    id: 'oftalmo_orl_ccp',
    nome: 'Mês 4,5 — Oftalmo / ORL / CCP (2 sem)',
    periodo: '03/05 a 16/05/2027',
    areaBadge: 'cirurgia',
    ancora70: 'Olho vermelho, Glaucoma, Otites, Vertigem (HINTS), Epistaxe/IVAS + Neurologia (AVC, Cefaleias, Epilepsia)',
    trilha30: 'Pediatria Bloco 1 (Neonatologia: Reanimação, Icterícia, Sepse e Triagem Neonatal)',
    procedimentosAlvo: ['Otoscopia limpa + remoção de cerume/CE', 'Avaliação de olho vermelho com Fluoresceína', 'Tamponamento nasal anterior'],
    microHabitoSugerido: 'Triagem neurológica rápida (HINTS/Pares Cranianos) + Otoscopia técnica',
  },
  {
    id: 'mfc',
    nome: 'Mês 5 — Medicina de Família e Comunidade (1 mês)',
    periodo: '17/05 a 13/06/2027',
    areaBadge: 'preventiva',
    ancora70: 'Preventiva Completa + APS + Clínica Médica Ambulatorial (HAS, Dislipidemia, Asma/DPOC, Rastreamentos)',
    trilha30: 'Pediatria Bloco 2 (Puericultura, Aleitamento, DNPM, Vacinação e Crescimento)',
    procedimentosAlvo: ['Consultas centradas na pessoa (ICE + Teach-Back)', 'Conciliação medicamentosa e rastreamentos', 'Fechamento do Dossiê Curricular R1 até 30/06/2027'],
    microHabitoSugerido: 'Explicação compartilhada (Ask-Tell-Ask + Teach-Back) e conciliação medicamentosa',
  },
  {
    id: 'cm',
    nome: 'Mês 6 — Clínica Médica (1 mês)',
    periodo: '14/06 a 11/07/2027',
    areaBadge: 'clinica',
    ancora70: 'Clínica Médica Pesada: Infectologia, Gastroenterologia/Hepatologia e Hematologia',
    trilha30: 'Pediatria Bloco 3 (Emergências Pediátricas, BVA, PAC, GECA/Desidratação e ITU)',
    procedimentosAlvo: ['Paracentese diagnóstica / alívio (supervisionada)', 'Toracocentese (supervisionada)', 'Punção Lombar (supervisionada)'],
    microHabitoSugerido: 'Apresentação de visita pelo Pyramid Principle (≤ 90s) + 7 Travas na prescrição',
  },
  {
    id: 'ped',
    nome: 'Mês 7 — Pediatria (1 mês)',
    periodo: '12/07 a 08/08/2027',
    areaBadge: 'pediatria',
    ancora70: 'Consolidação Total de Pediatria (Neonatologia, Puericultura, Infecto-Ped e Urgências)',
    trilha30: 'Auditoria e Fechamento de Lacunas (<80% de acerto nas 5 grandes áreas)',
    procedimentosAlvo: ['Otoscopia pediátrica com contenção adequada', 'Passos iniciais + VPP neonatal em sala de parto'],
    microHabitoSugerido: 'Coreografia de Exame Físico Pediátrico (Ordem Anti-Choro + Triângulo de Avaliação)',
  },
  {
    id: 'emergencia_trauma',
    nome: 'Meses 8–9 — Emergência & Trauma (2 meses)',
    periodo: '09/08 a 03/10/2027',
    areaBadge: 'cirurgia',
    ancora70: 'Até 31/08: Fechar 100% do 1º ciclo | A partir de 01/09: Provas antigas (USP-SP, USP-RP, UNICAMP) + revisão de lacunas',
    trilha30: 'Esteira v3.1 (E4 Sala Vermelha + Regulação CROSS) + consolidação do Logbook 3x',
    procedimentosAlvo: ['Cardioversão elétrica / Desfibrilação (manuseio prático)', 'Priorização de sala vermelha + SBAR sob pressão'],
    microHabitoSugerido: 'Liderança em Sala Vermelha (ABCDE + Comunicação em Alça Fechada + SBAR)',
  },
  {
    id: 'sprint_r1',
    nome: 'Meses 10–11 — Reta Final 6º Ano & Consolidação de Base',
    periodo: 'Outubro a Novembro de 2027',
    areaBadge: 'preventiva',
    ancora70: 'Provas antigas cronometradas (USP-SP, USP-RP, UNICAMP) como diagnóstico de base pré-2028 + fechamento de lacunas (<80%)',
    trilha30: 'Transição para plantões 2028: Checklist "Posso Assumir Essa Escala?" (§8 CRM 2028) + revisão de prescrição e emergências',
    procedimentosAlvo: [
      'Revisão final das 7 Travas de prescrição e altas defensáveis (E3)',
      'Domínio prático dos cenários críticos de porta e sala vermelha (E4)',
      'Fechamento de pendências do internato e formatura FMRP-USP (nov/2027)',
    ],
    microHabitoSugerido: 'Conduta completa e prescrição segura com autonomia para assumir plantões em 2028',
  },
];

export const FERIAS_SEMANAS: {
  id: string;
  de: string;
  ate: string;
  label: string;
  focoConteudo: string;
  focoExames: string;
  focoHabilidade: string;
  isFreeWeek?: boolean;
}[] = [
  {
    id: 'sem1',
    de: '2026-11-30',
    ate: '2026-12-06',
    label: 'Semana 1 (30/11 a 04/12 · 5d) — Cirurgia I: Abdome Agudo Inflamatório/Obstrutivo',
    focoConteudo: 'Apendicite, colecistite/colangite, diverticulite, pancreatite aguda, obstrução intestinal e hérnias (30m Anki + 60m MedQuest + 30m Medway)',
    focoExames: 'Semana cheia v3.1 (~290m Seg–Sex): BASELINE-A entra na vaga A de 30/11; 3 (D1+A) + 1 C + 1 B + visual aplicável',
    focoHabilidade: 'Seg–Sex (~3h/dia total; Sáb/Dom 0 min de habilidades; foco em 3H ≤ 60s e 1ª passada E1)',
  },
  {
    id: 'sem2',
    de: '2026-12-07',
    ate: '2026-12-13',
    label: 'Semana 2 (07/12 a 11/12 · 5d) — Cirurgia II: Vascular/Perfurativo, Pós-Op & Trauma',
    focoConteudo: 'Úlcera perfurada, isquemia mesentérica, complicações pós-op (5 Ws, deiscência, TEP) e ATLS inicial / choque hemorrágico',
    focoExames: 'Semana cheia v3.1 (~290m Seg–Sex): 3 (D1+A) + 1 C + 1 B + 10 min EF em familiar (Qui) + gravação 5m',
    focoHabilidade: 'Avançar 1ª passada E1 + checagem [CHECAR] em diretriz/protocolo/bula',
  },
  {
    id: 'sem3',
    de: '2026-12-14',
    ate: '2026-12-20',
    label: 'Semana 3 (14/12 a 18/12 · 5d) — Anestesio & CTI I: Via Aérea, Choque, Sepse e DVA',
    focoConteudo: 'Pré-anestésico (ASA, Mallampati, jejum), via aérea/SRI, choque (4 tipos), sepse/ILAS, noradrenalina/vasopressina e sedação',
    focoExames: 'Semana cheia v3.1 (~290m Seg–Sex): 3 (D1+A) + 1 C + 1 B + revisão de Não Pode Passar',
    focoHabilidade: 'Priorizar D(1) para retestar queixas com falha recente e confirmar sequências em dias distintos',
  },
  {
    id: 'sem4',
    de: '2026-12-21',
    ate: '2026-12-27',
    label: 'Semana 4 (21/12 a 23/12 · 3d · Folga Natal 24–25/12) — Anestesio & CTI II (Enxuta)',
    focoConteudo: 'Distúrbios Na+/K+/Ca2+, Injúria Renal Aguda (IRA) e Ventilação Mecânica básica (VCV/PCV, PEEP, driving pressure) — ACLS movido p/ S6',
    focoExames: 'Semana reduzida de Natal (Seg–Qua): 2 (D1+A) + 1 C (Qua 23/12) · Folga oficial 24–25/12 (Conteúdo + Habilidades)',
    focoHabilidade: 'Cadência curta de 3 dias sem dívida no Natal; plano B de local de estudo se recesso em Mogi',
  },
  {
    id: 'sem5',
    de: '2026-12-28',
    ate: '2027-01-03',
    label: 'Semana 5 (28/12 a 30/12 · 3d · Folga Ano-Novo 31/12–01/01) — Obstetrícia (Lacunas Pós-Prova)',
    focoConteudo: 'Vitalidade fetal/CTG, pré-natal de alto risco/DMG, infecções congênitas (sífilis/toxo/GBS) + doses MgSO4/HPP (Gineco segue só no FSRS)',
    focoExames: 'Semana reduzida de Ano-Novo (Seg–Qua): 2 (D1+A) + 1 B + EF/Gravação (Qua 30/12) · Folga oficial 31/12–01/01',
    focoHabilidade: 'Prescrição segura (Prompt B) + limpeza de itens [CHECAR] pendentes antes de janeiro',
  },
  {
    id: 'sem6',
    de: '2027-01-04',
    ate: '2027-01-10',
    label: 'Semana 6 (04/01 a 08/01 · 5d · Contingência 10/01) — Clínica Crítica (CTI/PS) + Reforço Cirurgia',
    focoConteudo: 'ACLS/arritmias e SCA, insuf. respiratória/TEP, CAD/EHH + reforço Cirurgia (vias biliares, trauma, onco básica) · Zerar novos Anki em 06/01',
    focoExames: 'Semana cheia v3.1 (~290m Seg–Sex): 3 (D1+A) + 1 C + 1 B · Marco de contingência 3H ≥ 80% em 10/01',
    focoHabilidade: 'Consolidar queixas E1 em caminho de domínio (meta ≥ 6 dominadas até 24/01)',
  },
  {
    id: 'sem7',
    de: '2027-01-11',
    ate: '2027-01-17',
    label: 'Semana Livre (11/01 a 17/01/2027 · 0d) — Viagem & Pausa Total',
    focoConteudo: 'ZERO estudo teórico novo e ZERO questões. Anki pausado (usar Postpone do FSRS ao voltar em 18/01).',
    focoExames: 'Pausa total na Esteira v3.1 (0 sessões).',
    focoHabilidade: 'Descanso integral antes da última semana pré-Cirurgia.',
    isFreeWeek: true,
  },
  {
    id: 'sem8',
    de: '2027-01-18',
    ate: '2027-01-24',
    label: 'Semana 7 Útil (18/01 a 22/01 · 5d · Baseline B 24/01) — Ponte Pré-Cirurgia & Fechamento',
    focoConteudo: '2–3 blocos refazendo erros de Cirurgia (S1–S2: abdome agudo, pós-op, trauma) + lacunas CTI/PS · Fora das 3h: encerramento IC (jan/27) e editais R1',
    focoExames: 'Semana cheia v3.1 (18–22/01): 3 (D1+A) + 1 C + 1 B · Dom 24/01: Baseline Caso B + 15 min revisão LOG',
    focoHabilidade: 'Fechar 1ª passada (19/20 E1, 6/7 E3-Porta, 6/7 E4) e destravar Cirurgia Geral em 25/01',
  },
];

export const MARCHAS_6ANO: Record<MarchaId, MarchaConfig> = {
  '4_sprint': {
    id: '4_sprint',
    nome: 'Marcha 4 — Consolidação Intensiva',
    badge: '350+ q/sem',
    metaMin: 350,
    metaMax: 450,
    metaAlvo: 380,
    cicloDiaUtilMin: 90,
    fdsHorasDia: 5,
    resumo: 'Provas antigas cronometradas (USP-SP/USP-RP/UNICAMP) + revisão cirúrgica de erros.',
  },
  '3_normal': {
    id: '3_normal',
    nome: 'Marcha Normal',
    badge: 'Semana regular',
    metaMin: 200,
    metaMax: 250,
    metaAlvo: 220,
    cicloDiaUtilMin: 90,
    fdsHorasDia: 4,
    resumo: 'Carga padrão do internato. Esteira v3.1 em ritmo normal (3 micro-doses + 1 caso completo) e blocos 70/30.',
  },
  '2_pesada': {
    id: '2_pesada',
    nome: 'Semana Pesada',
    badge: '2+ plantões 12h',
    metaMin: 130,
    metaMax: 170,
    metaAlvo: 150,
    cicloDiaUtilMin: 40,
    fdsHorasDia: 4,
    resumo: 'Ativa modo Semana Pesada na Esteira v3.1 (piso: 1 micro-dose + [SERVIÇO]). Estudo enxuto e sono protegido.',
  },
  '1_sobrevivencia': {
    id: '1_sobrevivencia',
    nome: 'Sobrevivência',
    badge: 'Semana caótica',
    metaMin: 60,
    metaMax: 100,
    metaAlvo: 80,
    cicloDiaUtilMin: 0,
    fdsHorasDia: 2.5,
    resumo: 'Ativa modo Semana Pesada na Esteira v3.1. Zero teoria nova nos dias úteis; foco em sobreviver bem e proteger sono.',
  },
};

export const ROTA_DIAS_SEMANA: Record<
  WeeklyDayKey,
  {
    nome: string;
    exame25m: string;
    pilarTitulo: string;
    pilarDetalhe: string;
    moduloRef: string;
    moduloId: string;
    ferramentaTab: 'gaso' | 'lr' | 'travas' | 'intercorrencias';
  }
> = {
  seg: {
    nome: 'Segunda-feira',
    exame25m: '1 ECG sistemático (10 passos) + 1 Gasometria arterial (Winter + AG)',
    pilarTitulo: 'Anamnese & Comunicação (Calgary-Cambridge)',
    pilarDetalhe: 'Treinar abertura 60s sem interromper, funil guiado por hipóteses, Red Flags e bloco ICE.',
    moduloRef: 'Módulo 01',
    moduloId: 'mod-01',
    ferramentaTab: 'gaso',
  },
  ter: {
    nome: 'Terça-feira',
    exame25m: '1 RX de Tórax (RIPE + ABCDE-F) ou 1 Rotina de Abdome Agudo',
    pilarTitulo: 'Exame Físico Guiado por Hipóteses (HDPE & LR+/LR-)',
    pilarDetalhe: 'Definir achados discriminatórios antes de examinar e aplicar peso real dos sinais (LR+ e LR-).',
    moduloRef: 'Módulo 02',
    moduloId: 'mod-02',
    ferramentaTab: 'lr',
  },
  qua: {
    nome: 'Quarta-feira',
    exame25m: '1 ECG isquêmico/arritmia + 1 Caso de e-FAST ou TC de Crânio/Abdome',
    pilarTitulo: 'Raciocínio Clínico, Illness Scripts, Vieses & Bayes',
    pilarDetalhe: 'Qualificadores Semânticos, One-Liner cirúrgico e comparação de Illness Scripts.',
    moduloRef: 'Módulo 03',
    moduloId: 'mod-03',
    ferramentaTab: 'lr',
  },
  qui: {
    nome: 'Quinta-feira',
    exame25m: '1 Gasometria completa (AG corrigido + Delta-Delta) + 1 RX de urgência',
    pilarTitulo: 'Oratória Clínica (Pyramid, SNAPPS & SBAR)',
    pilarDetalhe: 'Passagem de caso em 60–90s sem ler papel com comparação explícita de diferenciais.',
    moduloRef: 'Módulo 04',
    moduloId: 'mod-04',
    ferramentaTab: 'gaso',
  },
  sex: {
    nome: 'Sexta-feira',
    exame25m: 'Mix Rápido Cronometrado: ECG + Gasometria + Imagem',
    pilarTitulo: 'Simulado Integrado ou OSCE em Dupla',
    pilarDetalhe: 'Executar 1 estação completa com 7 Travas de prescrição e debriefing objetivo.',
    moduloRef: 'Módulo 05 (Exames)',
    moduloId: 'mod-05',
    ferramentaTab: 'travas',
  },
  sab: {
    nome: 'Sábado',
    exame25m: 'Auditoria de Imagens Puras e Traçados das questões da semana',
    pilarTitulo: 'Bloco Intensivo R1 + Prática Intercalada Cumulativa',
    pilarDetalhe: 'Avanço no rodízio-âncora (70%) + revisão intercalada de questões antigas.',
    moduloRef: 'Módulo 06 (Prescrição)',
    moduloId: 'mod-06',
    ferramentaTab: 'travas',
  },
  dom: {
    nome: 'Domingo',
    exame25m: 'Revisão dos Pontos Cegos da semana',
    pilarTitulo: 'Trilha Paralela 30% + Ritual de Domingo',
    pilarDetalhe: 'Ajustar escala da próxima semana e foco 70/30.',
    moduloRef: 'Módulo 07 (Procedimentos)',
    moduloId: 'mod-07',
    ferramentaTab: 'intercorrencias',
  },
};

export const LOGBOOK_PROCEDIMENTOS_MATRIX: LogbookProcedureGoal[] = [
  { id: 'proc-sutura', rodizioId: 'cirurgia', rodizioNome: 'Cirurgia Geral', nome: 'Anestesia local / bloqueio digital + Sutura (simples/Donati)', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-21' },
  { id: 'proc-abscesso', rodizioId: 'cirurgia', rodizioNome: 'Cirurgia Geral', nome: 'Drenagem de abscesso simples / remoção de CE superficial', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-21' },
  { id: 'proc-curativo', rodizioId: 'cirurgia', rodizioNome: 'Cirurgia Geral', nome: 'Curativo complexo / debridamento simples / retirada de dreno', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-21' },
  { id: 'proc-svd', rodizioId: 'cirurgia', rodizioNome: 'Cirurgia Geral', nome: 'Sondagem Vesical de Demora (SVD M/F)', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-19' },
  { id: 'proc-sng', rodizioId: 'cirurgia', rodizioNome: 'Cirurgia Geral', nome: 'Sondagem Nasogástrica / Enteral (SNG/SNE)', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-19' },
  { id: 'proc-bvm', rodizioId: 'anestesio_cti', rodizioNome: 'Anestesio / CTI', nome: 'Ventilação Bolsa-Válvula-Máscara (BVM C-E)', metaAlvo: 3, guiaRef: 'Módulo 07', habId: 'hab-22' },
  { id: 'proc-iot', rodizioId: 'anestesio_cti', rodizioNome: 'Anestesio / CTI', nome: 'Laringoscopia / Intubação Orotraqueal (IOT)', metaAlvo: 3, guiaRef: 'Módulo 07', habId: 'hab-22' },
  { id: 'proc-gaso-art', rodizioId: 'anestesio_cti', rodizioNome: 'Anestesio / CTI', nome: 'Punção para Gasometria Arterial', metaAlvo: 3, guiaRef: 'Módulo 07', habId: 'hab-14' },
  { id: 'proc-especular', rodizioId: 'go', rodizioNome: 'Ginecologia & Obstetrícia', nome: 'Exame Especular + Coleta CCO', metaAlvo: 3, guiaRef: '02_Exame_Fisico_Anamnese_GO.md', habId: 'hab-3' },
  { id: 'proc-toque-obs', rodizioId: 'go', rodizioNome: 'Ginecologia & Obstetrícia', nome: 'Toque Obstétrico (dilatação/apagamento/plano)', metaAlvo: 3, guiaRef: '02_Exame_Fisico_Anamnese_GO.md', habId: 'hab-3' },
  { id: 'proc-parto-sut', rodizioId: 'go', rodizioNome: 'Ginecologia & Obstetrícia', nome: 'Parto Normal Assistido / Sutura Perineal', metaAlvo: 3, guiaRef: '02_Exame_Fisico_Anamnese_GO.md', habId: 'hab-3' },
  { id: 'proc-otoscopia', rodizioId: 'oftalmo_orl_ccp', rodizioNome: 'Oftalmo / ORL / CCP', nome: 'Otoscopia limpa + Remoção de cerume / CE simples', metaAlvo: 3, guiaRef: 'Guias de Semiologia + R1', habId: 'hab-20' },
  { id: 'proc-fluoresceina', rodizioId: 'oftalmo_orl_ccp', rodizioNome: 'Oftalmo / ORL / CCP', nome: 'Avaliação de olho vermelho com Fluoresceína', metaAlvo: 3, guiaRef: 'Guias de Semiologia + R1', habId: 'hab-20' },
  { id: 'proc-tamponamento', rodizioId: 'oftalmo_orl_ccp', rodizioNome: 'Oftalmo / ORL / CCP', nome: 'Tamponamento nasal anterior', metaAlvo: 3, guiaRef: 'Guias de Semiologia + R1', habId: 'hab-20' },
  { id: 'proc-paracentese', rodizioId: 'cm', rodizioNome: 'Clínica Médica', nome: 'Paracentese diagnóstica / alívio', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-19' },
  { id: 'proc-toracocentese', rodizioId: 'cm', rodizioNome: 'Clínica Médica', nome: 'Toracocentese (diagnóstica / alívio)', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-19' },
  { id: 'proc-pl', rodizioId: 'cm', rodizioNome: 'Clínica Médica', nome: 'Punção Lombar (PL)', metaAlvo: 3, guiaRef: '03_Execucao_Motora_Procedimentos_Essenciais.md', habId: 'hab-19' },
  { id: 'proc-ped-oto', rodizioId: 'ped', rodizioNome: 'Pediatria', nome: 'Otoscopia pediátrica com contenção adequada', metaAlvo: 3, guiaRef: '08_Exame_Fisico_Pediatrico.md', habId: 'hab-10' },
  { id: 'proc-ped-sala-parto', rodizioId: 'ped', rodizioNome: 'Pediatria', nome: 'Passos iniciais + VPP neonatal em sala de parto', metaAlvo: 3, guiaRef: '08_Exame_Fisico_Pediatrico.md', habId: 'hab-10' },
  { id: 'proc-cardioversao', rodizioId: 'emergencia_trauma', rodizioNome: 'Emergência & Trauma', nome: 'Cardioversão elétrica / Desfibrilação (manuseio prático)', metaAlvo: 3, guiaRef: '02_Avaliacao_Paciente_Grave_ABCDE.md', habId: 'hab-18' },
];

export const HOJE_DEEP_LINKS_MAP: Record<string, Array<{ id: string; label: string }>> = {
  'ferias:sem1': [
    { id: 'hab-7', label: 'HDPE Abdome Agudo' },
    { id: ';abdome-agudo', label: 'Dor Abdominal / Abdome Agudo' },
    { id: 'hab-12', label: 'ECG 10 Passos' },
    { id: 'hab-13', label: 'RX Tórax' },
  ],
  cirurgia: [
    { id: 'hab-7', label: 'HDPE Abdome Agudo' },
    { id: 'hab-21', label: 'Sutura & Anestesia Local' },
    { id: ';abdome-agudo', label: 'Abdome Agudo' },
    { id: ';enf-evo-po', label: 'Evolução Pós-Op' },
  ],
  anestesio_cti: [
    { id: 'hab-22', label: 'IOT, Via Aérea & VM' },
    { id: 'hab-14', label: 'Gasometria 5 Passos' },
    { id: 'hab-18', label: 'ABCDE & Choque' },
    { id: ';sepse', label: 'Sepse & Choque' },
  ],
  go: [
    { id: 'hab-3', label: 'Exame Físico & Leopold GO' },
    { id: 'hab-15', label: 'CTG & Partograma' },
    { id: ';pre-eclampsia', label: 'Pré-Eclâmpsia' },
    { id: ';hpp', label: 'Hemorragia Pós-Parto' },
  ],
  oftalmo_orl_ccp: [
    { id: 'hab-20', label: 'ORL & Olho Vermelho' },
    { id: 'hab-9', label: 'Exame Neuro & HINTS' },
    { id: ';vertigem', label: 'Vertigem / HINTS' },
    { id: ';conjuntivite', label: 'Olho Vermelho' },
  ],
  mfc: [
    { id: 'hab-1', label: 'Calgary-Cambridge & ICE' },
    { id: 'hab-16', label: 'SPIKES & Teach-Back' },
    { id: 'hab-17', label: '7 Travas Prescrição' },
  ],
  cm: [
    { id: 'hab-11', label: 'Método DDx & Bayes' },
    { id: 'hab-19', label: 'Paracentese / Toraco / PL' },
    { id: 'hab-5', label: 'Exame Cardiovascular' },
    { id: 'hab-6', label: 'Exame Pulmonar' },
  ],
  ped: [
    { id: 'hab-10', label: 'EF Pediátrico Anti-Choro' },
    { id: ';bva', label: 'Bronquiolite (BVA)' },
    { id: ';ped-febre', label: 'Febre sem Foco' },
    { id: ';ped-desidratacao', label: 'GECA & Desidratação' },
  ],
  emergencia_trauma: [
    { id: 'hab-18', label: 'ABCDE & Sala Vermelha' },
    { id: 'hab-22', label: 'SRI & Via Aérea' },
    { id: ';sca', label: 'SCA / IAM' },
    { id: ';pcr', label: 'PCR & ACLS' },
  ],
  sprint_r1: [
    { id: 'hab-18', label: 'ABCDE OSCE' },
    { id: 'hab-17', label: '7 Travas OSCE' },
    { id: 'hab-12', label: 'ECG 10 Passos' },
    { id: 'hab-14', label: 'Gasometria 5 Passos' },
  ],
};

/** Mantido para compatibilidade retroativa com a v1. */
export const CURRICULO_ITEMS_DATA: Array<{
  id: string;
  categoria: 'Concluído (Base)' | 'Meta 1º Semestre (até 30/06/27)';
  titulo: string;
  detalhe: string;
}> = [
  {
    id: 'curr-inst-fmrp',
    categoria: 'Concluído (Base)',
    titulo: 'Declaração Institucional FMRP-USP (HU próprio + Pós CAPES + Rede SUS 1º/2º/3º)',
    detalhe: 'USP-SP: itens 1–3 (até 35 pts) · USP-RP: Histórico (1,5 pt) · UNICAMP: itens 1–2 (25 pts).',
  },
  {
    id: 'curr-ic-2anos',
    categoria: 'Concluído (Base)',
    titulo: '2 anos de Iniciação Científica (IC) com bolsa comprovada',
    detalhe: 'USP-SP: item 5 (até 14 pts) · USP-RP: Científico (1,4 pt) · UNICAMP: item 3 (20 pts).',
  },
  {
    id: 'curr-2-artigos',
    categoria: 'Concluído (Base)',
    titulo: '2 Artigos Científicos Publicados',
    detalhe: 'USP-SP: item 6 (10 pts) · USP-RP: Científico (1,0/artigo) · UNICAMP: item 4 (15 pts).',
  },
  {
    id: 'curr-liga',
    categoria: 'Concluído (Base)',
    titulo: 'Diretoria de Liga Acadêmica (≥ 1 ano)',
    detalhe: 'UNICAMP: item 6 (5 pts) · USP-RP: Assistencial (1,0 pt).',
  },
  {
    id: 'curr-natacao',
    categoria: 'Concluído (Base)',
    titulo: 'Equipe Esportiva Universitária (≥ 2 semestres)',
    detalhe: 'UNICAMP: item 11c (1 pt) · USP-RP: Estudantil (0,25 pt).',
  },
  {
    id: 'curr-monitoria',
    categoria: 'Meta 1º Semestre (até 30/06/27)',
    titulo: 'Monitoria Acadêmica Oficial',
    detalhe: 'USP-SP: item 4 (até 4 pts) · USP-RP: Ensino (até 1,0 pt) · UNICAMP: item 8 (até 5 pts).',
  },
  {
    id: 'curr-congresso',
    categoria: 'Meta 1º Semestre (até 30/06/27)',
    titulo: 'Apresentação em Congresso (Oral ou Pôster)',
    detalhe: 'USP-SP: itens 8–9 · USP-RP: Científico · UNICAMP: item 5 (até 10 pts).',
  },
  {
    id: 'curr-org-evento',
    categoria: 'Meta 1º Semestre (até 30/06/27)',
    titulo: 'Organização de Eventos Científicos',
    detalhe: 'USP-SP: item 7 (até 5 pts) · USP-RP: Ensino (até 0,5 pt).',
  },
  {
    id: 'curr-cursos-suporte',
    categoria: 'Meta 1º Semestre (até 30/06/27)',
    titulo: 'Cursos de Suporte de Vida (ACLS/ATLS/PALS/BLS)',
    detalhe: 'USP-SP: item 12 (até 4 pts) · UNICAMP: item 7 (até 5 pts).',
  },
  {
    id: 'curr-voluntariado-plantao',
    categoria: 'Meta 1º Semestre (até 30/06/27)',
    titulo: 'Extensão / Voluntariado Social (≥ 96h)',
    detalhe: 'USP-SP: item 10 (5 pts) · UNICAMP: item 9 (5 pts) · USP-RP: Assistencial.',
  },
  {
    id: 'curr-rep-estudantil',
    categoria: 'Meta 1º Semestre (até 30/06/27)',
    titulo: 'Representação Discente & Teste de Progresso',
    detalhe: 'USP-SP: item 13 (3 pts) · USP-RP: Estudantil (2,0 pts) · UNICAMP: itens 10–11 (10 pts).',
  },
];

export const RITUAL_DOMINGO_DATA: Array<{ id: string; text: string }> = [
  {
    id: 'rit-escala',
    text: 'Definir a Marcha da semana conforme plantões e carga real do internato (sincroniza a Esteira v3.1).',
  },
  {
    id: 'rit-7030',
    text: 'Confirmar ou ajustar os subtemas da semana: 70% Rodízio-Âncora + 30% Trilha Paralela.',
  },
  {
    id: 'rit-habito',
    text: 'Revisar pendências clínicas: itens [CHECAR] na Esteira, Pontos Cegos abertos e Logbook 3x.',
  },
  {
    id: 'rit-curriculo',
    text: 'Avançar 1 pendência de comprovante na matriz R1 & Currículo (corte 30/06/2027).',
  },
];

export const ENSAIO_MENTAL_PROCS_DATA: EnsaioMentalProcGuide[] = [
  {
    id: 'proc-sutura',
    nome: '1. Anestesia Local & Sutura (Simples / Donati)',
    indicacao: 'Feridas limpas/contaminadas com < 6–12h sem infecção franca; checar status vacinal antitetânico.',
    material: 'Luva estéril, clorexidina, SF 0,9% sob pressão, lidocaína 1–2%, seringa/agulha, porta-agulhas, pinça dente de rato, tesoura, fio Nylon 3-0 a 5-0.',
    anatomia: 'Testar sensibilidade/motricidade distal ANTES da lidocaína! Dose máx lido: 4,5 mg/kg s/ vaso (7 mg/kg c/ vaso). Entrar a 90° na derme.',
    armadilha: 'Esquecer de irrigar abundantemente antes de fechar; dar ponto frouxo ou isquemiante; usar vasoconstritor em extremidade isquêmica.',
  },
  {
    id: 'proc-iot',
    nome: '2. Ventilação BVM ("C-E") & Laringoscopia (IOT)',
    indicacao: 'Falência ventilatória/oxigenação, proteção de via aérea (Glasgow ≤ 8), instabilidade refratária.',
    material: 'BVM com reservatório, O2 15 L/min, aspirador rígido testado, cânula Guedel, laringoscópio testado (lâmina 3/4), TOT com cuff testado + fio-guia, capnógrafo, drogas SRI + vasopressor pronto.',
    anatomia: 'Posição olfativa (meato acústico alinhado ao esterno). Entrar pela direita da boca, rebater língua p/ esquerda, ponta da Macintosh na valécula e tracionar a 45° sem báscula nos dentes.',
    armadilha: 'Tentar intubar paciente hipoxêmico/hipotenso sem pré-oxigenar e sem push-dose/noradrenalina; esquecer de checar capnografia e altura do tubo (20–22 cm na rima).',
  },
  {
    id: 'proc-cvc',
    nome: '3. Acesso Venoso Central USG-Guiado (Jugular Interna / Femoral)',
    indicacao: 'Infusão contínua de DVA, acesso periférico impossível, monitorização/nutrição parenteral.',
    material: 'Kit CVC, barreira máxima estéril, USG com capa estéril, lidocaína, agulha de punção, fio-guia em J, bisturi nº 11, dilatador, cateter lavado com SF, Nylon 3-0.',
    anatomia: 'Triângulo de Sedillot (cabeças esternal e clavicular do ECOM). No USG: veia jugular é compressível e lateral à carótida pulsátil.',
    armadilha: 'Perder o controle da ponta externa do fio-guia (SEMPRE segurar o guia!); forçar o fio-guia contra resistência ou diante de extrassístoles no monitor.',
  },
  {
    id: 'proc-paracentese',
    nome: '4. Paracentese Diagnóstica e de Alívio',
    indicacao: 'Ascite nova, internação de cirrótico (descartar PBE) ou ascite tensa com restrição ventilatória.',
    material: 'Luva estéril, clorexidina, lidocaína, jelco 14G/16G, seringa 20 mL, equipo macrogotas + frasco coletor, tubos (celularidade/diferencial, albumina, cultura em frasco de hemocultura) + Albumina humana se > 5 L.',
    anatomia: 'QIE: 2 dedos mediais e 2 dedos cefálicos à EIAS esquerda (lateral aos vasos epigástricos inferiores; evitar QID pelo ceco dilatado). Técnica em Z-track.',
    armadilha: 'Deixar de colher PBE por INR elevado ou plaquetopenia (não são contraindicações!); retirar > 5 litros sem repor 6–8 g de Albumina por litro total retirado.',
  },
  {
    id: 'proc-toracocentese',
    nome: '5. Toracocentese Diagnóstica / Alívio',
    indicacao: 'Derrame pleural novo (> 1 cm no decúbito lateral/USG) ou derrame volumoso causando dispneia.',
    material: 'Kit estéril, lidocaína, jelco 16G/18G, torneira de 3 vias (three-way), seringa 20–50 mL, equipo, tubos para Critérios de Light (proteínas, DHL, pH, glicose, celularidade, ADA, cultura).',
    anatomia: 'Paciente sentado inclinado sobre mesa; 1 a 2 espaços abaixo do topo da macicez na linha escapular posterior, SEMPRE na BORDA SUPERIOR da costela inferior.',
    armadilha: 'Entrar na borda inferior da costela (laceração da artéria intercostal → hemotórax); drenar > 1.200–1.500 mL de uma só vez (edema pulmonar de reexpansão).',
  },
  {
    id: 'proc-pl',
    nome: '6. Punção Lombar (Líquor / LCR)',
    indicacao: 'Suspeita de meningite/encefalite, HSA com TC normal, síndrome de Guillain-Barré.',
    material: 'Campo/luva estéril, clorexidina, lidocaína, agulha espinhal Quincke ou Whitacre 22G com mandril, 3 a 4 tubos estéreis numerados.',
    anatomia: 'Linha de Tuffier (cristas ilíacas superiores cruzam L4): puncionar L3–L4 ou L4–L5 na linha média com inclinação cefálica de 15° (mirando a cicatriz umbilical).',
    armadilha: 'Puncionar sem TC de crânio prévia quando há sinal de alarme (imunossuprimido, Glasgow < 12, déficit focal, convulsão recente ou papiledema); retirar a agulha sem recolocar o mandril.',
  },
  {
    id: 'proc-svd-sng',
    nome: '7. Sondagem Vesical de Demora (SVD) & Sondagem Nasogástrica (SNG)',
    indicacao: 'SVD: retenção urinária, balanço hídrico estrito em choque. SNG: obstrução intestinal, HDA, proteção de via aérea.',
    material: 'SVD: bandeja estéril, Foley 14–16 Fr, água destilada (nunca SF no balonete!), lidocaína gel estéril (15–20 mL no homem), coletor sistema fechado. SNG: sonda Levine, medição NEX.',
    anatomia: 'SVD masculina: tracionar pênis a 90° para retificar uretra bulbar e só insuflar o balonete após retorno franco de urina com a sonda inserida até a bifurcação (Y)!',
    armadilha: 'Insuflar o balonete da Foley na uretra prostática antes de ver retorno de urina; iniciar dieta em SNE sem RX confirmando ponta infradiafragmática.',
  },
  {
    id: 'proc-especular',
    nome: '8. Exame Especular, Coleta de CCO & Toque Obstétrico',
    indicacao: 'Rastreio de CA de colo (25–64 anos), avaliação de sangramento/corrimento, bolsa rota ou trabalho de parto.',
    material: 'Espéculo de Collins (P/M/G), foco de luz, espátula de Ayres (ectocérvice 360°), escova endocervical (giro 360°), lâmina identificada + fixador.',
    anatomia: 'Afastar pequenos lábios, introduzir espéculo fechado em direção oblíqua/posterior apoiando na parede posterior (fúrcula), girar para horizontal e abrir suavemente.',
    armadilha: 'Usar lubrificante em gel antes do CCO (inviabiliza a lâmina); realizar toque vaginal em sangramento de 2ª metade da gestação antes de excluir Placenta Prévia no USG!',
  },
];

export const ENSAIO_MENTAL_3MIN_PASSOS = [
  { step: 1, title: 'Indicação & Contraindicação Absoluta', prompt: 'Por que estou fazendo agora? O que proíbe (plaquetopenia grave, INR alterado, infecção no sítio, instabilidade)?' },
  { step: 2, title: 'Material Completo na Bandeja', prompt: 'Cheque mentalmente 100% dos itens antes de calçar luva estéril para não quebrar assepsia no meio.' },
  { step: 3, title: 'Marco Anatômico & Ângulo', prompt: 'Onde entra a agulha/lâmina, em que ângulo, qual estrutura nobre passa ao lado (vaso, nervo, pleura)?' },
  { step: 4, title: 'Complicação Imediata & Plano B', prompt: 'Se sangrar / der pneumotórax / não progredir o fio-guia, o que eu faço nos primeiros 10 segundos?' },
] as const;

export const TIMER_PRESETS: Record<TimerPresetId, TimerPresetConfig> = {
  anki_15m: { id: 'anki_15m', label: 'Anki 15m', minutes: 15, seconds: 15 * 60, category: 'Micro-Janela' },
  exames_25m: { id: 'exames_25m', label: 'Exames 25m', minutes: 25, seconds: 25 * 60, category: 'Aquecimento' },
  ciclo_90m: { id: 'ciclo_90m', label: 'Ciclo 90m', minutes: 90, seconds: 90 * 60, category: 'Estudo Profundo' },
  osce_8m: { id: 'osce_8m', label: 'OSCE 8m', minutes: 8, seconds: 8 * 60, category: 'Simulação' },
  cochilo_90m: { id: 'cochilo_90m', label: 'Cochilo 90m', minutes: 90, seconds: 90 * 60, category: 'Blindagem' },
};
