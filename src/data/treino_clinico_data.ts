// ============================================================================
// ESTEIRA CONTÍNUA DE TREINO CLÍNICO v3.1 — CATÁLOGO, CALENDÁRIO E TEMPLATES
// Fonte única: docs/PLANO_CURSO_HABILIDADES_CLINICAS.md (v3.1)
//              docs/SPEC_NOVO_PEP_ESTEIRA_TREINO_v3.1.md
// ============================================================================

export type Eixo = 'E1' | 'E3' | 'E4';

export type HabId =
  | 'hab-1'
  | 'hab-2'
  | 'hab-3'
  | 'hab-4'
  | 'hab-5'
  | 'hab-6'
  | 'hab-7'
  | 'hab-8'
  | 'hab-9'
  | 'hab-10'
  | 'hab-11'
  | 'hab-12'
  | 'hab-13'
  | 'hab-14'
  | 'hab-15'
  | 'hab-16'
  | 'hab-17'
  | 'hab-18'
  | 'hab-19'
  | 'hab-20'
  | 'hab-21'
  | 'hab-22';

export type VisualTipo = 'ECG+RX' | 'ECG';

export interface QueixaE1 {
  eixo: 'E1';
  num: number;
  slug: string;
  nome: string;
  blocoVisual: boolean;
  visualTipo: VisualTipo | null;
  reservedBaseline: boolean;
  unlockAfter: string | null;
  relatedHabIds: HabId[];
}

export type RubricaE3 = 'E3-Porta' | 'E3-UBS';
export type AmbienteE3 = 'UPA com retaguarda' | 'PA de cidade pequena sem lab' | 'UBS';

export interface ArquetipoE3 {
  eixo: 'E3';
  num: number;
  slug: string;
  nome: string;
  rubrica: RubricaE3;
  ambientePadrao: AmbienteE3;
  ambientesPermitidos: AmbienteE3[];
  unlockAfter: string | null;
  relatedHabIds: HabId[];
}

export type AmbienteE4 = 'UPA com sala vermelha' | 'PA de cidade pequena';

export interface CenarioE4 {
  eixo: 'E4';
  num: number;
  slug: string;
  nome: string;
  relatedHabIds: HabId[];
}

export type AmbienteE1 = 'UPA com retaguarda' | 'PA de cidade pequena sem laboratório no turno';

export interface RodizioTreinoDef {
  id: string;
  nome: string;
  de: string;
  ate: string;
  alvos: string[];
  pedidoServico: string;
}

export type BlocoMacro = 'BLOCO0_PILOTO' | 'BLOCO1_FERIAS' | 'BLOCO2_INTERNATO';
export type PromptId = 'A' | 'D1' | 'B' | 'C' | 'D2';

export type Origem =
  | 'piloto'
  | 'fila_primeira_passada'
  | 'reserva'
  | 'reteste'
  | 'confirmacao'
  | 'manutencao'
  | 'servico'
  | 'rodizio'
  | 'pin_visual'
  | 'fallback'
  | 'baseline';

export type TipoLog =
  | 'Nova'
  | 'Var'
  | 'E3'
  | 'E4'
  | 'Micro'
  | 'SERVIÇO'
  | 'GRAVAÇÃO'
  | 'BASELINE';

export type SN = 'S' | 'N';
export type Veredito = 'Limpo' | 'Repetir' | 'NA';

export type Pemc =
  | { kind: 'nenhuma' }
  | { kind: 'omissao'; texto: string }
  | { kind: 'baselineSN'; valor: SN }
  | { kind: 'NA' };

export type Score =
  | {
      kind: 'rubrica';
      valor: 0 | 1 | 2 | 3 | 4;
      ajuste: string;
      criterios?: [boolean, boolean, boolean, boolean];
    }
  | { kind: 'muletas'; contagem: number; ajuste: string }
  | { kind: 'NA' };

export interface TreinoLogEntry {
  id: string;
  criadoEm: string;
  dateIso: string;
  tipo: TipoLog;
  slug: string;
  mecanismo: string | null;
  ambiente: string | null;
  rodizioId: string | null;
  min: number | null;
  h3Bloco: SN | 'NA';
  pemc: Pemc;
  score: Score;
  iaPista: boolean | null;
  veredito: Veredito;
  baselineFase: 'A' | 'B' | null;
  avaliavel: boolean;
  erroCritico: boolean;
  refacaoIntegralPendente: boolean;
  atritoE2: 'nenhum' | 'A' | 'B' | 'C' | null;
  servicoResultado: 'apontamento' | 'recusa' | 'sem_paciente' | null;
  linhaEm2min: boolean | null;
  vereditoIA: Veredito | null;
}

export type FonteTipo = 'diretriz' | 'protocolo_oficial' | 'bula_profissional';

export interface NaoPodePassarItem {
  id: string;
  slug: string;
  texto: string;
  checado: boolean;
  fontePrimaria?: string;
  fonteTipo?: FonteTipo;
  checadoEm?: string;
  origemLogId: string;
  criadoEm: string;
}

export interface TreinoClinicoState {
  schemaVersion: 31;
  logs: TreinoLogEntry[];
  naoPodePassar: NaoPodePassarItem[];
  visual: Record<string, { feitoEm: string }>;
  piloto: { auditoriaEm?: string; naoRealizados: string[] };
  baselineInvalida: boolean;
  contingencia10jan?: {
    num: number;
    den: number;
    disparou: boolean;
    calculadoEm: string;
  };
  metas: { primeiraPassadaCedeu: boolean };
  internato: {
    posPlantaoByDate: Record<string, boolean>;
    semanaPesadaByWeek: Record<string, boolean>;
    diaLivreByDate: Record<string, boolean>;
    casoRealByDate: Record<string, boolean>;
    semPacienteNovoSeg: Record<string, boolean>;
  };
  rituais: Record<string, { efFamiliar?: boolean }>;
}

export type Passo =
  | {
      kind: 'sessao';
      prompt: PromptId;
      tipoLog: TipoLog;
      slug: string;
      ambiente: string;
      baseline?: 'A' | 'B';
      origem: Origem;
      tetoMin: number;
      mecanismosUsados?: string[];
      visual?: VisualTipo;
      pausaSilenciosa10s?: boolean;
      primeiraExecucaoSemPiloto?: boolean;
      pilotoId?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
    }
  | { kind: 'servico'; rodizioId: string | null; frase: string; pedido: string | null }
  | { kind: 'gravacao' }
  | { kind: 'ef_familiar' }
  | { kind: 'checagem_fontes'; minutos: number; pendentesChecar: number }
  | {
      kind: 'marco';
      marco: 'congelamento_2026-11-29' | 'contingencia_2027-01-10' | 'revisao_2027-01-24';
    }
  | {
      kind: 'descanso';
      motivo: 'fds' | 'feriado' | 'viagem' | 'pos_plantao' | 'meta_semana_cumprida' | 'aguardando_data';
      proximaDataIso?: string;
    };

export const HAB_UNIVERSAIS: Record<Eixo, HabId[]> = {
  E1: ['hab-1', 'hab-11', 'hab-4', 'hab-16'],
  E3: ['hab-17'],
  E4: ['hab-18'],
};

export const QUEIXAS_E1: QueixaE1[] = [
  { eixo: 'E1', num: 1, slug: 'dor-toracica', nome: 'Dor torácica', blocoVisual: true, visualTipo: 'ECG+RX', reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-5', 'hab-12', 'hab-13', 'hab-18'] },
  { eixo: 'E1', num: 2, slug: 'dor-abdominal', nome: 'Dor abdominal', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-7', 'hab-2'] },
  { eixo: 'E1', num: 3, slug: 'cefaleia', nome: 'Cefaleia', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-9'] },
  { eixo: 'E1', num: 4, slug: 'dispneia-adulto', nome: 'Dispneia no adulto', blocoVisual: true, visualTipo: 'ECG+RX', reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-6', 'hab-5', 'hab-13', 'hab-14', 'hab-18'] },
  { eixo: 'E1', num: 5, slug: 'tontura-sincope', nome: 'Tontura / síncope', blocoVisual: true, visualTipo: 'ECG', reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-9', 'hab-5', 'hab-12', 'hab-20'] },
  { eixo: 'E1', num: 6, slug: 'febre-adulto', nome: 'Febre no adulto', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-2', 'hab-18', 'hab-17'] },
  { eixo: 'E1', num: 7, slug: 'febre-crianca', nome: 'Febre na criança', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-10', 'hab-18', 'hab-17'] },
  { eixo: 'E1', num: 8, slug: 'dispneia-crianca', nome: 'Desconforto respiratório / chiado / tosse na criança', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-10', 'hab-6', 'hab-18'] },
  { eixo: 'E1', num: 9, slug: 'vomitos-diarreia', nome: 'Vômitos / diarreia / desidratação (adulto e criança)', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-7', 'hab-10', 'hab-14', 'hab-17'] },
  { eixo: 'E1', num: 10, slug: 'lombalgia', nome: 'Lombalgia', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-8', 'hab-9'] },
  { eixo: 'E1', num: 11, slug: 'disuria-urinario', nome: 'Disúria / sintomas urinários', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-7', 'hab-17'] },
  { eixo: 'E1', num: 12, slug: 'go-aguda', nome: 'Queixa gineco-obstétrica aguda', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-3', 'hab-15', 'hab-7', 'hab-18'] },
  { eixo: 'E1', num: 13, slug: 'ivas-orl-olho', nome: 'IVAS (tosse, garganta, ouvido) e olho vermelho', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-20', 'hab-6', 'hab-17'] },
  { eixo: 'E1', num: 14, slug: 'pele-tvp-alergia', nome: 'Pele, partes moles, edema de membro (TVP) e alergia/urticária', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-8', 'hab-2', 'hab-18', 'hab-17'] },
  { eixo: 'E1', num: 15, slug: 'ferida-trauma-leve', nome: 'Ferida / trauma leve de membro', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-21', 'hab-8', 'hab-17'] },
  { eixo: 'E1', num: 16, slug: 'pa-elevada', nome: 'PA elevada assintomática ou sintomática', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-5', 'hab-9', 'hab-12', 'hab-17'] },
  { eixo: 'E1', num: 17, slug: 'palpitacao-ansiedade', nome: 'Palpitação / ansiedade (orgânico × psiquiátrico)', blocoVisual: true, visualTipo: 'ECG', reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-12', 'hab-5', 'hab-14'] },
  { eixo: 'E1', num: 18, slug: 'agitacao-intox-abstinencia', nome: 'Agitação / intoxicação / abstinência', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-18', 'hab-9', 'hab-14', 'hab-17'] },
  { eixo: 'E1', num: 19, slug: 'ideacao-suicida', nome: 'Ideação suicida / risco', blocoVisual: false, visualTipo: null, reservedBaseline: false, unlockAfter: null, relatedHabIds: ['hab-17'] },
  { eixo: 'E1', num: 20, slug: 'sensorio-focal-glicemia', nome: 'Alteração aguda do sensório / déficit focal / alteração glicêmica', blocoVisual: false, visualTipo: null, reservedBaseline: true, unlockAfter: '2027-01-24', relatedHabIds: ['hab-9', 'hab-18', 'hab-14', 'hab-12'] },
];

export const ARQUETIPOS_E3: ArquetipoE3[] = [
  { eixo: 'E3', num: 1, slug: 'e3-atb-empirico', nome: 'Antibiótico empírico limítrofe (adulto)', rubrica: 'E3-Porta', ambientePadrao: 'UPA com retaguarda', ambientesPermitidos: ['UPA com retaguarda', 'PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-11'] },
  { eixo: 'E3', num: 2, slug: 'e3-pediatria-ponderal', nome: 'Prescrição pediátrica ponderal + teto + mL/gotas + alta', rubrica: 'E3-Porta', ambientePadrao: 'UPA com retaguarda', ambientesPermitidos: ['UPA com retaguarda', 'PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-10'] },
  { eixo: 'E3', num: 3, slug: 'e3-analgesia-travas', nome: 'Analgesia escalonada em terreno de risco', rubrica: 'E3-Porta', ambientePadrao: 'UPA com retaguarda', ambientesPermitidos: ['UPA com retaguarda', 'PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-12', 'hab-3'] },
  { eixo: 'E3', num: 4, slug: 'e3-ev-alto-risco', nome: 'Prescrição EV de alto risco em observação 24h + SBAR', rubrica: 'E3-Porta', ambientePadrao: 'UPA com retaguarda', ambientesPermitidos: ['UPA com retaguarda', 'PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-14', 'hab-4'] },
  { eixo: 'E3', num: 5, slug: 'e3-cronico-conciliacao', nome: 'Descompensação crônica + conciliação', rubrica: 'E3-Porta', ambientePadrao: 'UPA com retaguarda', ambientesPermitidos: ['UPA com retaguarda', 'PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-5', 'hab-6'] },
  { eixo: 'E3', num: 6, slug: 'e3-regulacao-cross', nome: 'Limites do serviço + estabilização + regulação (SBAR)', rubrica: 'E3-Porta', ambientePadrao: 'PA de cidade pequena sem lab', ambientesPermitidos: ['PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-4', 'hab-18'] },
  { eixo: 'E3', num: 7, slug: 'e3-alta-cinzenta-recusa', nome: 'Alta defensável em zona cinzenta ou recusa / alta a pedido', rubrica: 'E3-Porta', ambientePadrao: 'UPA com retaguarda', ambientesPermitidos: ['UPA com retaguarda', 'PA de cidade pequena sem lab'], unlockAfter: null, relatedHabIds: ['hab-16', 'hab-4'] },
  { eixo: 'E3', num: 8, slug: 'e3-ubs-longitudinal', nome: 'Seguimento longitudinal na UBS pós-UPA / multimorbidade', rubrica: 'E3-UBS', ambientePadrao: 'UBS', ambientesPermitidos: ['UBS'], unlockAfter: '2027-01-24', relatedHabIds: ['hab-16', 'hab-1'] },
];

export const CENARIOS_E4: CenarioE4[] = [
  { eixo: 'E4', num: 1, slug: 'e4-deterioracao-silenciosa', nome: 'Deterioração silenciosa na observação', relatedHabIds: ['hab-14', 'hab-4'] },
  { eixo: 'E4', num: 2, slug: 'e4-va-insuf-resp', nome: 'Via aérea ameaçada / insuficiência respiratória (+ anafilaxia)', relatedHabIds: ['hab-22', 'hab-6', 'hab-13', 'hab-14'] },
  { eixo: 'E4', num: 3, slug: 'e4-arritmia-pcr', nome: 'Arritmia instável + deterioração → PCR / pós-RCE', relatedHabIds: ['hab-12', 'hab-5'] },
  { eixo: 'E4', num: 4, slug: 'e4-multipaciente', nome: 'Multi-paciente / priorização simultânea', relatedHabIds: ['hab-4'] },
  { eixo: 'E4', num: 5, slug: 'e4-crianca-grave', nome: 'Chegada inesperada: criança grave', relatedHabIds: ['hab-10', 'hab-17'] },
  { eixo: 'E4', num: 6, slug: 'e4-gestante-grave', nome: 'Chegada inesperada: gestante ou puérpera grave', relatedHabIds: ['hab-3', 'hab-15', 'hab-17'] },
  { eixo: 'E4', num: 7, slug: 'e4-trauma-hemorragia', nome: 'Chegada inesperada: trauma com hemorragia / membro ameaçado', relatedHabIds: ['hab-21', 'hab-8', 'hab-4'] },
];

export const RODIZIOS_TREINO: Record<string, RodizioTreinoDef> = {
  cirurgia: {
    id: 'cirurgia',
    nome: 'Cirurgia Geral',
    de: '2027-01-25',
    ate: '2027-02-21',
    alvos: ['dor-abdominal', 'ferida-trauma-leve', 'e3-analgesia-travas', 'e4-trauma-hemorragia'],
    pedidoServico: 'Anamnese/exame abdominal dirigido (1 min)',
  },
  anestesio_cti: {
    id: 'anestesio_cti',
    nome: 'Anestesiologia / CTI',
    de: '2027-02-22',
    ate: '2027-03-21',
    alvos: ['dispneia-adulto', 'e3-ev-alto-risco', 'e4-va-insuf-resp', 'e4-deterioracao-silenciosa'],
    pedidoServico: 'Ordem/SBAR ou avaliação de via aérea',
  },
  go: {
    id: 'go',
    nome: 'Ginecologia e Obstetrícia',
    de: '2027-03-22',
    ate: '2027-05-02',
    alvos: ['go-aguda', 'pa-elevada', 'e4-gestante-grave'],
    pedidoServico: 'Queixa aguda GO ou interpretação CTG',
  },
  oftalmo_orl_ccp: {
    id: 'oftalmo_orl_ccp',
    nome: 'Oftalmo / ORL / CCP',
    de: '2027-05-03',
    ate: '2027-05-16',
    alvos: ['ivas-orl-olho', 'tontura-sincope', 'cefaleia'],
    pedidoServico: 'Manobra focal (HINTS / otoscopia / olho)',
  },
  mfc: {
    id: 'mfc',
    nome: 'MFC (APS)',
    de: '2027-05-17',
    ate: '2027-06-13',
    alvos: ['e3-ubs-longitudinal', 'pa-elevada', 'lombalgia', 'disuria-urinario'],
    pedidoServico: 'Explicação + teach-back ou conciliação',
  },
  cm: {
    id: 'cm',
    nome: 'Clínica Médica',
    de: '2027-06-14',
    ate: '2027-07-11',
    alvos: ['dor-toracica', 'febre-adulto', 'e3-cronico-conciliacao', 'e3-atb-empirico'],
    pedidoServico: 'Apresentação ≤ 90 s ou travas da prescrição',
  },
  ped: {
    id: 'ped',
    nome: 'Pediatria',
    de: '2027-07-12',
    ate: '2027-08-08',
    alvos: ['febre-crianca', 'dispneia-crianca', 'vomitos-diarreia', 'e3-pediatria-ponderal', 'e4-crianca-grave'],
    pedidoServico: 'Conduta/prescrição ponderal + sinais de alarme',
  },
  emergencia_trauma: {
    id: 'emergencia_trauma',
    nome: 'Emergência & Trauma',
    de: '2027-08-09',
    ate: '2027-10-03',
    alvos: ['sensorio-focal-glicemia', 'pele-tvp-alergia', 'e3-regulacao-cross', 'e4-arritmia-pcr', 'e4-multipaciente'],
    pedidoServico: 'Priorização de sala vermelha / SBAR',
  },
};

export const FRASE_BASE_SERVICO =
  'Posso fazer a anamnese/exame desse paciente e você me diz, em 1 minuto, a pergunta ou manobra mais importante que eu não fiz?';

export interface PilotoPassoDef {
  id: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  dataNominal: string;
  titulo: string;
  tetoMin: number;
}

export const PILOTO_PASSOS: PilotoPassoDef[] = [
  { id: 'P1', dataNominal: '2026-11-21', titulo: 'P1 · Queixa Nova (dor-toracica)', tetoMin: 45 },
  { id: 'P2', dataNominal: '2026-11-24', titulo: 'P2 · Troca de chat (D1 dor-toracica + A dor-abdominal)', tetoMin: 45 },
  { id: 'P3', dataNominal: '2026-11-27', titulo: 'P3 · Paciente Grave (e4-deterioracao-silenciosa)', tetoMin: 30 },
  { id: 'P4', dataNominal: '2026-11-28', titulo: 'P4 · Prescrição Escrita (e3-atb-empirico)', tetoMin: 40 },
  { id: 'P5', dataNominal: '2026-11-29', titulo: 'P5 · BASELINE-A (sensorio-focal-glicemia) + Congelamento', tetoMin: 30 },
];

export type FeriasWeekId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'LIVRE' | 'S7' | 'MARCO';
export type FeriasDiaTipo = 'DA' | 'DC' | 'DB' | 'DB+G' | 'OFF_FDS' | 'OFF_FERIADO' | 'OFF_VIAGEM' | 'MARCO_10JAN' | 'MARCO_24JAN';

export interface FeriasDiaDef {
  dateIso: string;
  weekId: FeriasWeekId;
  mondayIso: string;
  diaTipo: FeriasDiaTipo;
}

export const FERIAS_CALENDARIO: FeriasDiaDef[] = [
  // S1 (30/11 – 06/12)
  { dateIso: '2026-11-30', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'DA' },
  { dateIso: '2026-12-01', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'DA' },
  { dateIso: '2026-12-02', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'DA' },
  { dateIso: '2026-12-03', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'DC' },
  { dateIso: '2026-12-04', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'DB' },
  { dateIso: '2026-12-05', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'OFF_FDS' },
  { dateIso: '2026-12-06', weekId: 'S1', mondayIso: '2026-11-30', diaTipo: 'OFF_FDS' },
  // S2 (07/12 – 13/12)
  { dateIso: '2026-12-07', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'DA' },
  { dateIso: '2026-12-08', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'DA' },
  { dateIso: '2026-12-09', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'DA' },
  { dateIso: '2026-12-10', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'DC' },
  { dateIso: '2026-12-11', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'DB' },
  { dateIso: '2026-12-12', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'OFF_FDS' },
  { dateIso: '2026-12-13', weekId: 'S2', mondayIso: '2026-12-07', diaTipo: 'OFF_FDS' },
  // S3 (14/12 – 20/12)
  { dateIso: '2026-12-14', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'DA' },
  { dateIso: '2026-12-15', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'DA' },
  { dateIso: '2026-12-16', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'DA' },
  { dateIso: '2026-12-17', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'DC' },
  { dateIso: '2026-12-18', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'DB' },
  { dateIso: '2026-12-19', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'OFF_FDS' },
  { dateIso: '2026-12-20', weekId: 'S3', mondayIso: '2026-12-14', diaTipo: 'OFF_FDS' },
  // S4 Natal (21/12 – 27/12)
  { dateIso: '2026-12-21', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'DA' },
  { dateIso: '2026-12-22', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'DA' },
  { dateIso: '2026-12-23', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'DC' },
  { dateIso: '2026-12-24', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'OFF_FERIADO' },
  { dateIso: '2026-12-25', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'OFF_FERIADO' },
  { dateIso: '2026-12-26', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'OFF_FDS' },
  { dateIso: '2026-12-27', weekId: 'S4', mondayIso: '2026-12-21', diaTipo: 'OFF_FDS' },
  // S5 Ano-Novo (28/12 – 03/01)
  { dateIso: '2026-12-28', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'DA' },
  { dateIso: '2026-12-29', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'DA' },
  { dateIso: '2026-12-30', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'DB+G' },
  { dateIso: '2026-12-31', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'OFF_FERIADO' },
  { dateIso: '2027-01-01', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'OFF_FERIADO' },
  { dateIso: '2027-01-02', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'OFF_FDS' },
  { dateIso: '2027-01-03', weekId: 'S5', mondayIso: '2026-12-28', diaTipo: 'OFF_FDS' },
  // S6 (04/01 – 10/01)
  { dateIso: '2027-01-04', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'DA' },
  { dateIso: '2027-01-05', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'DA' },
  { dateIso: '2027-01-06', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'DA' },
  { dateIso: '2027-01-07', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'DC' },
  { dateIso: '2027-01-08', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'DB' },
  { dateIso: '2027-01-09', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'OFF_FDS' },
  { dateIso: '2027-01-10', weekId: 'S6', mondayIso: '2027-01-04', diaTipo: 'MARCO_10JAN' },
  // Semana Livre — Viagem (11/01 – 17/01)
  { dateIso: '2027-01-11', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  { dateIso: '2027-01-12', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  { dateIso: '2027-01-13', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  { dateIso: '2027-01-14', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  { dateIso: '2027-01-15', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  { dateIso: '2027-01-16', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  { dateIso: '2027-01-17', weekId: 'LIVRE', mondayIso: '2027-01-11', diaTipo: 'OFF_VIAGEM' },
  // S7 (18/01 – 24/01)
  { dateIso: '2027-01-18', weekId: 'S7', mondayIso: '2027-01-18', diaTipo: 'DA' },
  { dateIso: '2027-01-19', weekId: 'S7', mondayIso: '2027-01-18', diaTipo: 'DA' },
  { dateIso: '2027-01-20', weekId: 'S7', mondayIso: '2027-01-18', diaTipo: 'DA' },
  { dateIso: '2027-01-21', weekId: 'S7', mondayIso: '2027-01-18', diaTipo: 'DC' },
  { dateIso: '2027-01-22', weekId: 'S7', mondayIso: '2027-01-18', diaTipo: 'DB' },
  { dateIso: '2027-01-23', weekId: 'S7', mondayIso: '2027-01-18', diaTipo: 'OFF_FDS' },
  { dateIso: '2027-01-24', weekId: 'MARCO', mondayIso: '2027-01-18', diaTipo: 'MARCO_24JAN' },
];

export const FERIAS_DIA_BY_ISO = new Map(FERIAS_CALENDARIO.map((d) => [d.dateIso, d]));

// ============================================================================
// TEMPLATES BLINDADOS PARA O GEMINI (v3.2 — voz de ida + texto de volta, feedback em PT-BR claro)
// ============================================================================

export const TEMPLATE_PROMPT_A = `Você é preceptor de emergência do SUS. Treino de 6º ano por voz de ida e texto de volta, 25–30 min.
Tipo {{TIPO}} | {{SLUG}} — {{NOME}} | Serviço {{SERVICO}} | Perfil {{PERFIL}}
Caso fixo (só baseline, conteúdo sigiloso): {{CASO_FIXO}}

Trave o caso antes de abrir. No baseline, use apenas os dados do caso fixo. Em Nova, monte quadro prevalente com letal clássico a afastar. Oculte 3 hipóteses e 3–6 discriminadores; aceite equivalentes plausíveis. Abra só com triagem, sinais vitais e recursos. Em instabilidade, priorize estabilização.

Durante a simulação, mensagem iniciada por 3H: (minhas 3 hipóteses iniciais) recebe exatamente registrado, sem pontuação, Markdown ou fala do paciente. Retome o paciente no meu próximo turno. Marque S na coluna de hipóteses só se o bloco, antes da primeira pergunta ao paciente, trouxer 3 hipóteses plausíveis cobrindo provável, perigosa e não pode passar. Se eu começar a entrevista direto, prossiga sem lembrete e marque N.

Paciente: linguagem leiga, incluindo nas perguntas abertas pertinentes. Responda ao que a pergunta cobre, sem acrescentar discriminadores, interpretar achados ou sugerir a próxima ação. Exame: só o achado da manobra nomeada; pedido genérico recebe exatamente sem achado específico disponível. Se exame indisponível, informe. Lab/gaso: valores com unidades, sem setas ou interpretação. ECG/RX: só achados primários solicitados.

Feche uma etapa por turno, aguardando minha resposta antes da próxima: (1) “Qual grave ainda está em aberto e o que você fará a seguir?” → (2) apresentação ao preceptor (até ~220 palavras) → (3) explicação leiga (até ~150 palavras) com resposta real do paciente ao teach-back. Ao concluir ou receber ENCERRAR, fixe a avaliação da 1ª tentativa. Critérios de Condução e Comunicação (0 a 4): [1] estrutura/agenda [2] apresentação [3] explicação + teach-back [4] firmeza/clareza.

BASELINE-A: emita só a linha final de registro e encerre. Erro crítico apenas S ou N. Score no formato X/4 (1011), com 1/0 por critério [1]–[4]. Preserve o sigilo em repreguntas.
Nova/BASELINE-B: dê feedback objetivo em português claro, SEM siglas internas (não escreva PEMC, E2 ou 3H como títulos), usando exatamente os títulos:
- Erros ou omissões críticas: (nenhuma ou lista objetiva do que colocou o paciente em risco / faltou checar)
- 3 Hipóteses iniciais: (Sim/Não, o que faltou e qual dado faria mudar a hipótese principal)
- Condução e comunicação (0/4): nota por critério [1] a [4]
Só em Nova: sem hipóteses iniciais ou sem roteiro, entregue um modelo de condução (≤2 min) e proponha refação desde a triagem se couber; senão, refaça só o trecho falho. Inclua microcorreção (≤3 min, um ponto) só se houver erro de modelo mental. Aponte 1–2 checagens em diretriz, protocolo oficial ou bula profissional; AMBOSS só localiza. Só em Nova com erro ou omissão crítica, inclua a seção “Não Pode Passar” (≤6 linhas, tag [CHECAR]) antes da última linha.

Última linha (para importação no app), texto puro, sem rótulo, crases ou pipes extras. Substitua os campos em maiúsculas:
{{DATA}} | TIPO_LOG | ALVO | __m | HIPOTESES_SN | ERRO_CRITICO | SCORE | [N/S] | VEREDITO
Nova: tipo Nova, alvo {{SLUG}}:mecanismo em minúsculas, ERRO_CRITICO “nenhuma” ou omissão curta, score X/4 (ajuste). Baselines: tipo BASELINE, alvo sensorio-focal-glicemia, score com quatro bits; no B use “nenhuma” ou descreva o erro crítico. Veredito Limpo só com HIPOTESES_SN=S e ERRO_CRITICO=nenhuma; senão Repetir.`;

export const TEMPLATE_PROMPT_D1 = `Variante Nível 2, chat próprio, 10–12 min. Eu falo; você responde em texto.
{{SLUG}} — {{NOME}} | Serviço {{SERVICO}} | Mecanismos já usados no histórico: {{MECANISMOS_USADOS}}

Trave antes de abrir um caso com mecanismo diferente de todos os listados: terreno atípico, diagnóstico gêmeo ou disposição em zona cinzenta. Oculte 3 hipóteses e 3–6 discriminadores; aceite equivalentes plausíveis. Sorteie e encene atrito compatível: nenhum, A demanda indevida, B história vaga/família ansiosa, C conversa sensível/aliança. Revele só no feedback.

Abra só com triagem, sinais vitais e recursos. Em instabilidade, priorize estabilização. Durante a simulação, mensagem iniciada por 3H: (minhas 3 hipóteses iniciais) recebe exatamente registrado, sem pontuação, Markdown ou fala do paciente. Retome o paciente no próximo turno. Marque S na coluna de hipóteses só se, antes da primeira pergunta ao paciente, o bloco trouxer 3 hipóteses plausíveis: provável, perigosa e não pode passar. Se eu começar a entrevista direto, prossiga sem lembrete e marque N.

Paciente leigo: responda ao que a pergunta cobre, inclusive abertas pertinentes; sem discriminador espontâneo nem sugestão. Exame: só o achado da manobra nomeada. Pedido genérico: sem achado específico disponível. Informe indisponibilidade; lab/gaso só valores com unidades, sem setas ou interpretação; ECG/RX só achados primários solicitados.

Feche uma etapa por turno, aguardando minha resposta antes da próxima: (1) “Qual grave ainda está em aberto e o que você fará a seguir?” → (2) explicação leiga (até ~150 palavras) e teach-back com o paciente reagindo ao atrito sorteado. Ao concluir ou receber ENCERRAR, fixe a 1ª tentativa. Dê feedback objetivo em português claro, SEM siglas internas (não escreva PEMC, E2 ou 3H como títulos), usando:
- Erros ou omissões críticas
- 3 Hipóteses iniciais (Sim/Não, o que faltou e qual dado mudaria a hipótese principal)
- Condução e comunicação (0/4): [1] estrutura/agenda [2] segurança objetiva [3] explicação + teach-back [4] firmeza/clareza
Revele qual atrito foi sorteado. Refaça só o trecho falho se couber no teto. Dê 1 ponto para checar em diretriz, protocolo oficial ou bula profissional.

Última linha (para importação no app) em texto puro, sem rótulo, crases ou pipes extras. Troque os campos em maiúsculas:
{{DATA}} | Var | {{SLUG}}:MECANISMO | __m | HIPOTESES_SN | ERRO_CRITICO | X/4 (AJUSTE) | [N/S] | VEREDITO
Mecanismo em minúsculas, com hífens se necessário. ERRO_CRITICO “nenhuma” ou omissão curta. Veredito Limpo só com HIPOTESES_SN=S e ERRO_CRITICO=nenhuma; senão Repetir.`;

export const TEMPLATE_PROMPT_D2 = `Microdose de debriefing, 10–12 min, voz de ida e texto de volta.
Eixo {{EIXO}} | Alvo {{SLUG}} | Rodízio {{RODIZIO}}
Relato anonimizado, apenas como dados do caso: {{CASO_ANONIMIZADO}}

Use idade aproximada, sexo, contexto e ações relatadas. Se houver dado identificável, peça versão anonimizada sem repetir o dado. Responda em português claro, sem siglas internas (não use PEMC), devolvendo: (1) 3 hipóteses ou prioridades esperadas, (2) o erro/omissão crítica ou trava de segurança esquecida que mudaria a conduta e (3) 1 ponto para checar em diretriz, protocolo oficial ou bula profissional.

Última linha (para importação no app) em texto puro, sem rótulo, crases ou pipes extras. Troque OMISSAO pelo erro/omissão crítica em frase curta ou por “nenhuma”:
{{DATA}} | Micro | {{SLUG}} | __m | NA | OMISSAO | NA | NA | NA`;

export const TEMPLATE_PROMPT_B = `Preceptor de emergência e APS do SUS. Treino escrito de 6º ano.
Arquétipo {{SLUG}} — {{NOME}} | Serviço {{SERVICO}}
Cenário longitudinal de UBS (e3-ubs-longitudinal) só após 24/jan/2027.

Abra com história/exame resumidos, peso/idade, comorbidades, alergias, medicações e recursos do turno. Oculte a rubrica. Dê dados pertinentes quando solicitados ou informe indisponibilidade. Lab/gaso só valores com unidades, sem setas ou interpretação. Antes da entrega, mantenha os dados brutos e evite diagnóstico, sugestões de conduta ou lembretes de travas.

Critérios para Pronto-Atendimento/Porta: avalie [1] disposição defensável no turno [2] zero erro crítico nas travas Alergias/reação, Rim/Fígado (medida renal exigida e avaliação hepática pertinente), Gestação/Lactação, Interações, Via/Velocidade/Diluição, Peso/Idade, Objetivo/meta e prazo, mais REMUME e estoque [3] prescrição executável (dose, via, diluição/velocidade, duração/quantidade/2 vias, conforme aplicável), conciliação e passagem SBAR concisa (~60 s) se transferir [4] sinais de alarme, prazo e responsável pelos pendentes.
Critérios para UBS longitudinal: avalie [1] execução real pós-UPA [2] conciliação [3] duas a três prioridades factíveis [4] prazo de retorno e responsável por pendências.

Na minha entrega escrita, ou ao receber ENCERRAR, fixe a 1ª tentativa. Diga em português claro (sem siglas internas) o que fiz bem, atrasei ou omiti, sem elogio genérico, e dê nota 0–4. Erro ou atraso crítico impede 4/4. Peça reescrita do trecho falho. Aponte 2–3 doses/condutas para checar em diretriz, protocolo oficial ou bula profissional; AMBOSS só localiza.

Última linha (para importação no app) em texto puro, sem rótulo, crases ou pipes extras. Troque os campos em maiúsculas:
{{DATA}} | E3 | {{SLUG}} ({{SERVICO}}) | __m | NA | OMISSAO | X/4 (AJUSTE) | [N/S] | VEREDITO
Omissão curta ou “nenhuma”. Limpo só com 4/4; senão Repetir.`;

export const TEMPLATE_PROMPT_C = `Preceptor de emergência do SUS. Simulação de 6º ano, voz de ida e texto de volta.
Cenário {{SLUG}} — {{NOME}} | Serviço {{SERVICO}}

Abra com chamado da enfermagem ou chegada à sala vermelha, monitor inicial e recursos do turno. Atue como enfermagem, monitor e paciente; avance o tempo simulado por turno ou intervalo declarado. Julgue a ordem das ações em silêncio. Mostre apenas dados e consequências observáveis; guarde diagnóstico, interpretação, prioridades e sugestões para o feedback.

Enfermagem só executa e confirma ordem dirigida (nome + ação), com dose, via e velocidade quando aplicáveis. Se vaga ou incompleta: “como assim, doutor?”. Lab/gaso: valores com unidades, sem setas ou interpretação. ECG/RX: só achados primários solicitados.
Se e4-multipaciente, durante a estabilização do primeiro, insira um segundo grave e uma demanda barulhenta. Avalie em silêncio A via aérea → B ventilação → C circulação/choque → D neurológico/tempo-dependente → demanda estável, e quem assume o primeiro paciente.

Rubrica oculta [1] reconhecimento precoce e ajuda no limite do serviço [2] ≥2 ordens em circuito fechado com dose/via/velocidade quando aplicáveis [3] estabilização compatível com recursos [4] prazo e gatilho objetivo de reavaliação (mais sequência e responsável no multipaciente).

Quando eu encerrar a atuação ou disser ENCERRAR, fixe a 1ª tentativa. Diga em português claro (sem siglas internas) o que fiz bem, atrasei ou omiti, sem elogio genérico, e dê nota 0–4. Erro ou atraso crítico impede 4/4. Peça refação do trecho falho por voz. Aponte 2–3 doses/condutas para checar em diretriz, protocolo oficial ou bula profissional; AMBOSS só localiza.

Última linha (para importação no app) em texto puro, sem rótulo, crases ou pipes extras. Troque os campos em maiúsculas:
{{DATA}} | E4 | {{SLUG}} ({{SERVICO}}) | __m | NA | OMISSAO | X/4 (AJUSTE) | [N/S] | VEREDITO
Omissão curta ou “nenhuma”. Limpo só com 4/4; senão Repetir.`;
