// ============================================================================
// MOTOR AUDITOR DE PRESCRIÇÃO (PRESCRIPTION GUARD) — LÓGICA PURA
// Audita itens de prescrição (PEP e Carrinho) contra:
//   1. Duplicidade de classe terapêutica (ex.: 2 AINEs, 2 Beta-lactâmicos)
//   2. Alergia direta e reação cruzada (penicilina, dipirona, AINE, sulfa...)
//   3. Função renal (TFG/ClCr) e Gestação (categorias D/X/EVITAR_3TRI)
//   4. Teto de dose diária (adulto e pediátrico mg/kg/dia)
//   5. Contraindicações do protocolo ativo (ex.: AINE/AAS na Dengue/HDA)
// ============================================================================

import { getDrugClinicalMeta, type RemumeClinicalMeta } from '../data/remume.ts';
import { getUnifiedDrugSpecByKey, UNIFIED_DRUG_SPECS } from '../data/farmacos.ts';
import type { ProtocolPharmaGuardHint } from '../data/clinical_links.ts';
import type { ClinicalContext } from './clinicalContext.ts';

export type PrescriptionAlertSeverity = 'block' | 'warn' | 'info';

export type PrescriptionAlertCategory =
  | 'duplicity'
  | 'allergy'
  | 'renal'
  | 'pregnancy'
  | 'ceiling'
  | 'protocol';

export interface PrescriptionAlert {
  id: string;
  severity: PrescriptionAlertSeverity;
  category: PrescriptionAlertCategory;
  title: string;
  detail: string;
  drugNames: string[];
  ruleCode: string;
}

export interface PrescriptionAuditItem {
  id?: string;
  name: string;
  posology?: string;
  rawText?: string;
  /** Escopo da prescrição: 'receita' (alta/domiciliar/carrinho) vs 'conduta' (plano/hospitalar). */
  scope?: 'receita' | 'conduta';
  /** Identificador de bloco de receita para não colidir resumo em Conduta com # RECEITA formal. */
  rxGroupId?: number;
  /** Opção condicional/alternativa (ex.: [OU], [SE ALERGIA], 2ª linha) — não gera falsa duplicidade. */
  isAlternative?: boolean;
  /** Fase sequencial (ex.: Rivaroxabana 20 mg "a partir do 22º dia / Fase de Manutenção") — não é uso simultâneo. */
  isSequentialPhase?: boolean;
  /** Conduta específica para gestação inviável (ectópica/abortamento infectado). */
  nonViablePregnancyScenario?: boolean;
  /** Prescrição de alta/pós-parto (puerpério/pós-cesariana) — gestação já resolvida. */
  postpartumScenario?: boolean;
}

export interface PrescriptionAuditReport {
  alerts: PrescriptionAlert[];
  blockCount: number;
  warnCount: number;
  infoCount: number;
  auditedItemCount: number;
  matchedDrugs: Array<{ itemName: string; meta: RemumeClinicalMeta }>;
}

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const KNOWN_COMBO_DRUGS_RE =
  /\b(?:amoxicilina\s*\+\s*clavulanat|sulfametoxazol\s*\+\s*trimetoprim|piperacilina\s*\+\s*tazobactam|ampicilina\s*\+\s*sulbactam|atenolol\s*\+\s*clortalidona|losartana\s*\+\s*hidroclorotiazida)/i;

function extractDrugSegmentForDose(fullText: string, meta: RemumeClinicalMeta): string {
  if (!fullText.includes('+') || KNOWN_COMBO_DRUGS_RE.test(normalizeText(fullText))) {
    return fullText;
  }
  const parts = fullText.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return fullText;
  const matched = parts.find((part) => getDrugClinicalMeta(part)?.canonicalKey === meta.canonicalKey);
  return matched || fullText;
}

/**
 * Estima a dose diária total (em mg) e a dose unitária a partir de strings de prescrição em pt-BR.
 * Exemplos:
 *   "Paracetamol 750 mg — 1 cp 6/6h"       -> singleMg=750, dosesPerDay=4, dailyMg=3000
 *   "Paracetamol 1000 mg 2 cp de 6/6h"     -> singleMg=2000, dosesPerDay=4, dailyMg=8000
 *   "Dipirona 1 g EV de 6/6h"              -> singleMg=1000, dosesPerDay=4, dailyMg=4000
 *   "Ibuprofeno 600 mg VO 8/8h"            -> singleMg=600, dosesPerDay=3, dailyMg=1800
 *   "Amoxicilina 500 mg 12/12h"            -> singleMg=500, dosesPerDay=2, dailyMg=1000
 */
export function parseEstimatedDailyDoseMg(text: string): {
  singleDoseMg: number | null;
  dosesPerDay: number | null;
  dailyDoseMg: number | null;
} {
  let norm = normalizeText(text);
  if (!norm) return { singleDoseMg: null, dosesPerDay: null, dailyDoseMg: null };

  // Se houver bólus/ataque + manutenção na mesma linha (ex.: Omeprazol 80 mg bolus + manutenção 40 mg 12/12h),
  // avalia o trecho de manutenção para não multiplicar a dose de ataque pela frequência diária.
  if (/\b(?:bolus|ataque)\b/.test(norm) && /\bmanutencao\b/.test(norm)) {
    const maintIdx = norm.indexOf('manutencao');
    if (maintIdx >= 0) {
      norm = norm.slice(maintIdx);
    }
  }

  // Remove quantidades de embalagem/frasco e declarações de teto máximo ("Dose máxima: 10 mg", "máx 500 mg", "teto 1 g")
  // para nunca confundir total dispensado nem o próprio limite de segurança com a dose prescrita.
  const doseNorm = norm
    .replace(/\(\s*(?:dose\s+)?m[aá]x(?:ima|\.)?[^)]*(?:\)|$)/gi, ' ')
    .replace(/\b(?:dose\s+)?m[aá]x(?:ima|\.)?\s*:?\s*\d+(?:[.,]\d+)?\s*(?:mg|g|ml|gotas?|ui|mcg)\b(?:\s*\/\s*(?:dia|dose))?/gi, ' ')
    .replace(/\b\d+\s*(?:frasco|frascos|fr\.?|caixa|caixas|bisnaga|bisnagas|pote|potes|tubo|tubos|seringa|seringas)\s*(?:\([^)]*(?:\)|$))?/gi, ' ')
    .replace(/(?:-{2,}|[—–])\s*\d+(?:\s*(?:ou|a)\s*\d+)?\s*(?:cp|comp|comprimido|comprimidos|caps|capsula|capsulas|amp|ampola|ampolas|envelope|envelopes|frasco|frascos|caixa|caixas)\b/gi, ' ')
    .replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:ml|g|mg|comprimidos?|capsulas?)(?:\s+cada)?\s*(?:\)|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Evita confundir concentração líquida "250 mg/5 mL" ou "500 mg/mL" com dose tomada quando não há volume
  // Também detecta dose diária já explícita ("700 mg/dia") para não multiplicar novamente por dosesPerDay.
  const explicitDailyMgMatch = doseNorm.match(/\b(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*dia\b/i);
  if (explicitDailyMgMatch) {
    const dailyVal = Number.parseFloat(explicitDailyMgMatch[1].replace(',', '.'));
    if (Number.isFinite(dailyVal) && dailyVal > 0) {
      let dosesPerDay: number | null = null;
      const intervalMatch = doseNorm.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*h\b/i) || doseNorm.match(/\ba cada\s*(\d{1,2})\s*h/i);
      if (intervalMatch) {
        const hours = Number.parseInt(intervalMatch[1], 10);
        if (hours > 0 && hours <= 24) dosesPerDay = Math.round((24 / hours) * 10) / 10;
      }
      const singleDoseMg = dosesPerDay && dosesPerDay > 0 ? Math.round((dailyVal / dosesPerDay) * 10) / 10 : dailyVal;
      return { singleDoseMg, dosesPerDay, dailyDoseMg: Math.round(dailyVal * 10) / 10 };
    }
  }

  let baseMg: number | null = null;

  // Padrão em gramas (ex.: "1 g", "1,5 g", "2g") — exclui "gotas"
  const gMatch = doseNorm.match(/\b(\d+(?:[.,]\d+)?)\s*g(?!\s*\/|\s*ot|\s*t|\w)/i);
  // Padrão em mg: suporta combos "2000+125 mg" capturando o componente principal (2000), exclui mg/kg, mg/ml e mg/dia
  const mgMatches = Array.from(
    doseNorm.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:\+\s*\d+(?:[.,]\d+)?\s*)?mg(?![a-z]|\s*\/\s*(?:kg|ml|\d+\s*ml|dia))/gi)
  );

  if (mgMatches.length > 0) {
    const parsedValues = mgMatches
      .map((m) => Number.parseFloat(m[1].replace(',', '.')))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (parsedValues.length > 0) {
      baseMg = parsedValues[0];
    }
  } else if (gMatch) {
    const grams = Number.parseFloat(gMatch[1].replace(',', '.'));
    if (Number.isFinite(grams) && grams > 0 && grams <= 20) {
      baseMg = grams * 1000;
    }
  }

  // Concentração líquida + volume administrado (ex.: "100 mg/mL ... Dar 10 mL" ou "250 mg/5 mL ... 10 mL VO")
  if (baseMg === null) {
    const liqConc = doseNorm.match(/\b(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*(\d+(?:[.,]\d+)?)?\s*ml\b/i);
    const volMatch = doseNorm.match(/\b(?:dar|tomar|fazer|administrar|infundir|vo|ev|im)?\s*(\d+(?:[.,]\d+)?)\s*ml\b(?!\s*\/)/gi);
    if (liqConc && volMatch) {
      const mgNum = Number.parseFloat(liqConc[1].replace(',', '.'));
      const denomMl = liqConc[2] ? Number.parseFloat(liqConc[2].replace(',', '.')) : 1;
      for (let i = volMatch.length - 1; i >= 0; i--) {
        const vm = volMatch[i].match(/(\d+(?:[.,]\d+)?)\s*ml/i);
        if (!vm) continue;
        const mlVal = Number.parseFloat(vm[1].replace(',', '.'));
        if (Number.isFinite(mlVal) && mlVal > 0 && denomMl > 0) {
          if (volMatch.length === 1 && mlVal === denomMl && doseNorm.includes(`/${denomMl}`)) continue;
          baseMg = (mgNum / denomMl) * mlVal;
          break;
        }
      }
    }
  }

  // Posologia em gotas (ex.: "Dipirona 500 mg/mL — Dar 12 gotas VO 6/6h" ou "Ibuprofeno 100 mg/mL 10 gotas")
  if (baseMg === null) {
    const dropsMatch = doseNorm.match(/\b(\d+(?:[.,]\d+)?)\s*gotas?\b(?!\s*\/)/i);
    if (dropsMatch) {
      const nDrops = Number.parseFloat(dropsMatch[1].replace(',', '.'));
      if (Number.isFinite(nDrops) && nDrops > 0) {
        let mgPerDrop: number | null = null;
        const explicitDropMg = doseNorm.match(/1\s*gota\s*(?:≈|=|~|corresponde\s*a)?\s*(\d+(?:[.,]\d+)?)\s*mg/i);
        if (explicitDropMg) {
          mgPerDrop = Number.parseFloat(explicitDropMg[1].replace(',', '.'));
        } else {
          const spec = UNIFIED_DRUG_SPECS.find((s) => s.patterns.some((pat) => pat.test(doseNorm)));
          if (spec?.dropsMgPerDrop) {
            mgPerDrop =
              spec.canonicalKey === 'ibuprofeno' && /\b50\s*mg\/ml\b/.test(doseNorm)
                ? 5
                : spec.dropsMgPerDrop;
          }
        }
        if (mgPerDrop !== null && Number.isFinite(mgPerDrop) && mgPerDrop > 0) {
          baseMg = Math.round(nDrops * mgPerDrop * 10) / 10;
        }
      }
    }
  }

  if (baseMg === null) {
    return { singleDoseMg: null, dosesPerDay: null, dailyDoseMg: null };
  }

  // Multiplicador de comprimidos/cápsulas por tomada (ex.: "2 cp", "2 comprimidos", "3 caps")
  let unitsPerDose = 1;
  const unitsMatch = doseNorm.match(/\b(\d+)\s*(?:cp|comp|comprimido|comprimidos|caps|capsula|capsulas|amp|ampola|ampolas|envelope|envelopes)\b/i);
  if (unitsMatch) {
    const qty = Number.parseInt(unitsMatch[1], 10);
    if (Number.isFinite(qty) && qty >= 1 && qty <= 10) {
      unitsPerDose = qty;
    }
  }

  const singleDoseMg = Math.round(baseMg * unitsPerDose * 10) / 10;

  // Frequência diária
  let dosesPerDay: number | null = null;
  const intervalMatch = doseNorm.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*h\b/i) || doseNorm.match(/\ba cada\s*(\d{1,2})\s*h/i);
  if (intervalMatch) {
    const hours = Number.parseInt(intervalMatch[1], 10);
    if (hours > 0 && hours <= 24) {
      dosesPerDay = Math.round((24 / hours) * 10) / 10;
    }
  } else {
    const xDayMatch = doseNorm.match(/\b(\d)\s*x\s*(?:\/|\s*ao\s*|\s*por\s*)?dia\b/i);
    if (xDayMatch) {
      const n = Number.parseInt(xDayMatch[1], 10);
      if (n >= 1 && n <= 12) dosesPerDay = n;
    } else if (/\bdose unica\b|\b1x\b|\bdu\b/.test(doseNorm)) {
      dosesPerDay = 1;
    }
  }

  const dailyDoseMg = dosesPerDay !== null ? Math.round(singleDoseMg * dosesPerDay * 10) / 10 : null;
  return { singleDoseMg, dosesPerDay, dailyDoseMg };
}

const STRUCTURED_PEP_DOC_RE =
  /^(?:#+\s*|>>\s*)?(?:identificacao|qp|hma|historia\s*\/|evolucao|exame\s+fisico|exame\s+clinico|hipoteses\s+diagnosticas|conduta(?:\s+terapeutica|\s+de\s+emergencia)?|plano\s*\/\s*conduta|receita(?:\s+medica|\s+domiciliar|\s+de\s+alta)?|prescricao\s+(?:domiciliar|de\s+alta|ambulatorial|hospitalar|medica))\s*(?::|$|[-–(])/im;

const RECEITA_HEADING_RE =
  /^(?:#+\s*|>>\s*)?(?:receita(?:\s+medica|\s+domiciliar|\s+de\s+alta)?|prescricao\s+(?:domiciliar|de\s+alta|ambulatorial|medica\s+de\s+alta|para\s+casa)|alta\s+hospitalar\s*[-–:]\s*receita)\b/i;

const CONDUTA_HEADING_RE =
  /^(?:#+\s*|>>\s*)?(?:conduta(?:\s+terapeutica|\s+de\s+emergencia|\s+imediata)?|plano\s*\/\s*conduta|plano\s+terapeutico|tratamento\b|manejo\b|prescricao\s+(?:hospitalar|medica\s+pos-parto|da\s+sedacao|na\s+upa|na\s+enfermaria))\b/i;

const IGNORE_SECTION_HEADING_RE =
  /^(?:#+\s*|>>\s*)?(?:identificacao\s*:|qp\s*:|queixa\s+principal\s*:|hma\s*:|historia\s*\/|dados\s+laboratoriais|evolucao(?:\s*\(24h\))?\s*:|exame\s+fisico\s*:|exame\s+clinico\b|hipoteses\s+diagnosticas\b|diagnostico\s*:|exames\s+(?:complementares|laboratoriais)|investigacao\s+complementar|laudo\s+do\s+eletrocardiograma|reconciliacao\s+medicamentosa|resumo\s+clinico\s+da\s+internacao|orientacao\s+critica|orientacoes\b|cuidados\s+e\s+sinais\b|compromisso\s+obrigatorio\s+de\s+retorno\b|sinais\s+de\s+alarme\b|sinais\s+de\s+alerta\b|criterios\s+de\s+retorno\b|medidas\s+(?:nao\s+farmacologicas|higienicas|gerais)|plano\s+de\s+seguimento\b|retorno\s*:|seguimento\s*:|encaminhamento\s*:)/i;

const CONDITIONAL_SUBBLOCK_RE =
  /^(?:>>\s*|\*\s*)?(?:\[(?:se|opcao\s*(?:[2-9]|[b-z]\b|alternativa)|ou\b|cenario|modalidade\s*(?:[2-9]|[b-z]\b)|etapa|plano|bloco)\b|(?:se|opcao|cenario|modalidade|etapa|bloco)\s+[^:]{1,60}:|.*(?:se\s+alergia|se\s+internacao|se\s+abortamento|se\s+gravidez\s+ectopica|2a\s+linha|alternativa))/i;

const BRACKET_HEADER_LINE_RE =
  /^(?:\*?\s*\[[^\]]+\]\s*\*?\s*:?\s*)$/;

const ALTERNATIVE_LINE_RE =
  /^(?:[-•*]\s*)?(?:\(?\[?(?:ou|se|opcao\s*(?:[2-9]|[b-z]\b|alternativa)|alternativa|2a?\s*linha|em\s+caso\s+de|apenas\s+se)\b|via\s+(?:oral|venosa|ev|im)\b|com\s+acesso\b|sem\s+acesso\b|crianca\s+(?:vacinada|grave)\b)|\[(?:ou\b|apenas\s+se|se\s+alergia|opcao\s*(?:[2-9]|[b-z]\b|alternativa)|alternativa)[^\]]*\]|\(\s*(?:alternativa|ou\b|se\s+alergia)|\b(?:apenas\s+se|se\s+alergia|se\s+refratario|se\s+intolerancia|2a\s*linha\s*:|alternativa\s*:|ou\s+na\s+falha|parceir[oa]\s+sexual)\b/i;

const PARTNER_TREATMENT_HEADER_RE =
  /^(?:>>\s*|\*\s*|#+\s*)?(?:tratamento|convocacao)[^\n:]{0,60}\bparceir[oa]/i;

const NON_VIABLE_PREGNANCY_RE =
  /\b(?:abortamento\s+(?:infectado|completo|incompleto)|pos-abortamento|amiu\b|gravidez\s+ectopica|gestacao\s+ectopica|mola\s+hidatiforme|obito\s+fetal|resolucao\s+da\s+gestacao|inducao\s+do\s+trabalho\s+de\s+parto)\b/i;

const POSTPARTUM_SCENARIO_RE =
  /\b(?:pos-cesariana|pos-parto|puerperi[oa]|alta\s+puerperal|alojamento\s+conjunto|parto\s+vaginal\s+recente|perineal|colica\s+uterina)\b/i;

const POSOLOGY_CONTINUATION_RE =
  /^(?:[-•*]\s*)?(?:tomar|dar|aplicar|fazer|administrar|infundir|usar|pingar|instilar|inalar|lavar|mastigar|dissolver|repetir|diluir|correr|manter|posologia\s*:|obs\.?\s*:|\(nota\s*:|nota\s*:)/i;

const NON_PRESCRIPTION_PROSE_RE =
  /\b(?:nao\s+prescrever|evitar|contraindicad[oa]|proibid[oa]|suspender|retirar|nao\s+usar|alergia\s+a|que\s+nao\s+ceda\s+com|se\s+a\s+febre\s+continuar|a\s+febre\s+continuar|se\s+ja\s+recebeu|a\s+crianca\s+ja\s+recebeu|ja\s+recebeu\s+na\s+unidade|retornar\s+(?:imediatamente|a\s+upa|ao\s+ps)|criterios\s+de\s+internacao)\b/i;

const SEQUENTIAL_PHASE_RE =
  /\b(?:a\s+partir\s+do\s+\d+[º°o]?\s*dia|fase\s+de\s+manutencao|apos\s+termino|apos\s+\d+\s+dias\s+de\s+ataque)\b/i;

function stripNegativeClinicalClauses(value: string): string {
  return String(value || '')
    .replace(
      /\(\s*(?:sem\b|n[aã]o\s+associad|n[aã]o\s+usar|n[aã]o\s+prescrever|evitar\b|excluir\b|contraindicad[oa])[^)]*(?:\)|$)/gi,
      ' '
    )
    .replace(/\bsem\s+[a-z0-9à-ÿ+-]{3,30}\s+associad[oa]\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPrescriptionDisplayName(rawName: string): string {
  return String(rawName || '')
    .replace(/\[(?:NÃO\s+PRESCREVER|CONTRAINDICAD|EVITAR\s+SE|APENAS\s+P[ÓO]S-ABORTAMENTO)[^\]]*\]/gi, '')
    .replace(/\s*(?:-{2,}|[—–])\s*(?:\d+|\[[^\]]*\])\s*(?:caixa|caixas|frasco|frascos|fr\.?|comprimido|comprimidos|cp|c[aá]psula|c[aá]psulas|caps|ampola|ampolas|envelope|envelopes|bisnaga|bisnagas|tubo|tubos|pote|potes|seringa|seringas|unidade|unidades)[^]*$/i, '')
    .replace(/\s*-{2,}\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Extrai itens de prescrição linha a linha a partir de um bloco textual de PEP/Receita.
 * Reconhece seções estruturadas (# CONDUTA vs # RECEITA vs seções narrativas),
 * consome linhas de posologia filhas e sinaliza opções alternativas para evitar falsos positivos.
 */
export function extractPrescriptionItemsFromText(
  rawText: string,
  options?: { defaultZone?: 'ignore' | 'conduta' | 'receita' }
): PrescriptionAuditItem[] {
  const lines = String(rawText || '').split('\n');
  const items: PrescriptionAuditItem[] = [];
  const seenKeys = new Set<string>();

  const isStructured = lines.some((l) => STRUCTURED_PEP_DOC_RE.test(normalizeText(l)));
  let zone: 'ignore' | 'conduta' | 'receita' =
    options?.defaultZone ?? (isStructured ? 'ignore' : 'receita');
  let rxGroupId = 0;
  let inConditionalBlock = false;
  let nextLineIsAlternative = false;
  let inNonViablePregBlock = false;
  let inPostpartumBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const normLine = normalizeText(trimmed);

    // Atualiza seção ativa em documentos estruturados (tanto Markdown com # / >> quanto AST serializada)
    if (RECEITA_HEADING_RE.test(normLine)) {
      zone = 'receita';
      rxGroupId++;
      inConditionalBlock = false;
      nextLineIsAlternative = false;
      inNonViablePregBlock = false;
      inPostpartumBlock = POSTPARTUM_SCENARIO_RE.test(normLine);
      continue;
    }
    if (IGNORE_SECTION_HEADING_RE.test(normLine)) {
      zone = 'ignore';
      inConditionalBlock = false;
      nextLineIsAlternative = false;
      inNonViablePregBlock = false;
      inPostpartumBlock = false;
      continue;
    }
    if (PARTNER_TREATMENT_HEADER_RE.test(normLine)) {
      inConditionalBlock = true;
      nextLineIsAlternative = true;
      continue;
    }
    if (CONDUTA_HEADING_RE.test(normLine)) {
      zone = 'conduta';
      inConditionalBlock = false;
      nextLineIsAlternative = false;
      inNonViablePregBlock = false;
      inPostpartumBlock = POSTPARTUM_SCENARIO_RE.test(normLine);
      continue;
    }
    if (trimmed.startsWith('>>') || BRACKET_HEADER_LINE_RE.test(normLine)) {
      const isAltHeader = CONDITIONAL_SUBBLOCK_RE.test(normLine);
      if (/^\*?\s*\[(?:ou\b|se\s+uso\s+recente|se\s+alergia)/i.test(normLine)) {
        nextLineIsAlternative = true;
      } else {
        inConditionalBlock = isAltHeader;
        nextLineIsAlternative = false;
      }
      inNonViablePregBlock = NON_VIABLE_PREGNANCY_RE.test(normLine);
      if (POSTPARTUM_SCENARIO_RE.test(normLine)) {
        inPostpartumBlock = true;
      }
      if (zone === 'ignore' && /\bconduta\b/i.test(normLine)) {
        zone = 'conduta';
      }
      continue;
    }

    if (zone === 'ignore') continue;
    if (trimmed.length < 4) continue;

    // Ignora cabeçalhos puros ou separadores sem fármaco
    if (/^(?:===|---|#|\*\*|uso\s+(?:oral|topico|nasal|otologico|oftalmico|retal|vaginal|inalatorio|interno|externo|intramuscular)\b)/i.test(normLine)) {
      inConditionalBlock = false;
      if (POSTPARTUM_SCENARIO_RE.test(normLine)) {
        inPostpartumBlock = true;
      }
      continue;
    }

    // Ignora linhas de orientação, proibição ou referência a dose prévia.
    // Remove avisos inline entre colchetes ("[NÃO PRESCREVER SE...]") ou parênteses de cautela
    // para que fármacos ativos com alerta acoplado (ex.: "3. Ibuprofeno 600 mg [NÃO PRESCREVER SE...] -- 1 caixa")
    // continuem sendo auditados normalmente.
    const isNumberedItem = /^\d+[.)]\s+/.test(trimmed);
    const normLineForProseCheck = normLine
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\(\s*(?:evitar|nao\s+prescrever|contraindicad[oa]|nao\s+usar|se\s+nao\s+hipertens)[^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (NON_PRESCRIPTION_PROSE_RE.test(normLineForProseCheck)) {
      continue;
    }

    // Em seção de Receita estruturada, linhas que começam com verbo de posologia sem numeração são continuação, não item novo
    if (zone === 'receita' && isStructured && !isNumberedItem && POSOLOGY_CONTINUATION_RE.test(normLine)) {
      continue;
    }

    const meta = getDrugClinicalMeta(stripNegativeClinicalClauses(trimmed));
    if (!meta) continue;

    const cleanedRaw = trimmed
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^[-•*]\s*/, '')
      .replace(/^\[[ xX]?\]\s*/, '')
      .trim();
    const cleaned = cleanPrescriptionDisplayName(cleanedRaw) || cleanedRaw;

    const dedupeKey = `${zone}::${meta.canonicalKey}::${normalizeText(cleaned).slice(0, 60)}`;
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    // Consome linhas de posologia/nota imediatamente subsequentes ao item (evita que "se não ceda com a Dipirona"
    // vire um segundo item de Dipirona).
    const posologyParts: string[] = [];
    let consumed = 0;
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const nextTrimmed = lines[j].trim();
      if (!nextTrimmed) break;
      const nextNorm = normalizeText(nextTrimmed);
      if (
        RECEITA_HEADING_RE.test(nextNorm) ||
        IGNORE_SECTION_HEADING_RE.test(nextNorm) ||
        CONDUTA_HEADING_RE.test(nextNorm) ||
        nextTrimmed.startsWith('>>') ||
        /^\d+[.)]\s+/.test(nextTrimmed)
      ) {
        break;
      }
      if (POSOLOGY_CONTINUATION_RE.test(nextNorm)) {
        posologyParts.push(nextTrimmed.replace(/^[-•*]\s*/, '').trim());
        consumed++;
        continue;
      }
      if (
        !getDrugClinicalMeta(stripNegativeClinicalClauses(nextTrimmed)) &&
        /\b(tomar|dar|aplicar|fazer|infundir|vo|ev|im|sc|inalatorio|cp|ml|gotas|\d+\/\d+h|\dx\/dia)\b/i.test(nextNorm)
      ) {
        posologyParts.push(nextTrimmed.replace(/^[-•*]\s*/, '').trim());
        consumed++;
        continue;
      }
      break;
    }
    i += consumed;

    const posology = posologyParts.join(' ');
    const normPosology = normalizeText(posology);
    const isAlternative =
      inConditionalBlock ||
      nextLineIsAlternative ||
      ALTERNATIVE_LINE_RE.test(normLine) ||
      (zone === 'receita' && /\b(?:ou\s+na\s+alergia|se\s+alergia|apenas\s+se|opcao\s*2)\b/i.test(normPosology));
    nextLineIsAlternative = false;
    const isSequentialPhase = SEQUENTIAL_PHASE_RE.test(normLine) || SEQUENTIAL_PHASE_RE.test(normPosology);
    const nonViablePregnancyScenario = inNonViablePregBlock || NON_VIABLE_PREGNANCY_RE.test(normLine);
    const postpartumScenario = inPostpartumBlock || POSTPARTUM_SCENARIO_RE.test(normLine);

    items.push({
      id: `rx-${i}`,
      name: cleaned.slice(0, 110),
      posology,
      rawText: posology ? `${cleanedRaw} ${posology}` : cleanedRaw,
      scope: zone,
      rxGroupId,
      isAlternative,
      isSequentialPhase,
      nonViablePregnancyScenario,
      postpartumScenario,
    });
  }

  return items;
}

const ALLERGY_SYNONYM_MAP: Record<string, string[]> = {
  penicilina: ['penicilina', 'amoxicilina', 'ampicilina', 'benzetacil', 'beta-lactamico', 'betalactamico'],
  amoxicilina: ['penicilina', 'amoxicilina', 'beta-lactamico', 'betalactamico'],
  cefalosporina: ['cefalosporina', 'cefalexina', 'ceftriaxona', 'beta-lactamico', 'betalactamico'],
  dipirona: ['dipirona', 'metamizol', 'pirazolona', 'novalgina'],
  novalgina: ['dipirona', 'metamizol', 'pirazolona'],
  aine: ['aine', 'anti-inflamatorio', 'antiinflamatorio', 'ibuprofeno', 'diclofenaco', 'cetoprofeno', 'nimesulida', 'naproxeno', 'meloxicam', 'cetorolaco', 'aas'],
  aines: ['aine', 'anti-inflamatorio', 'antiinflamatorio', 'ibuprofeno', 'diclofenaco', 'cetoprofeno', 'nimesulida', 'naproxeno', 'meloxicam', 'cetorolaco', 'aas'],
  ibuprofeno: ['ibuprofeno', 'aine'],
  diclofenaco: ['diclofenaco', 'aine'],
  aas: ['aas', 'aspirina', 'salicilato', 'aine'],
  aspirina: ['aas', 'aspirina', 'salicilato', 'aine'],
  sulfa: ['sulfa', 'sulfonamida', 'sulfametoxazol', 'bactrim', 'sulfadiazina'],
  bactrim: ['sulfa', 'sulfonamida', 'sulfametoxazol', 'bactrim'],
  paracetamol: ['paracetamol', 'acetaminofen', 'tylenol'],
  tylenol: ['paracetamol', 'acetaminofen'],
  plasil: ['metoclopramida'],
  metoclopramida: ['metoclopramida'],
};

function expandAllergyTokens(allergiesNormalized: readonly string[]): Set<string> {
  const expanded = new Set<string>();
  for (const raw of allergiesNormalized) {
    const clean = normalizeText(raw);
    if (!clean) continue;
    expanded.add(clean);
    for (const [key, synonyms] of Object.entries(ALLERGY_SYNONYM_MAP)) {
      if (clean === key || clean.includes(key) || key.includes(clean)) {
        synonyms.forEach((s) => expanded.add(s));
      }
    }
  }
  return expanded;
}

/**
 * Audita uma lista de itens de prescrição contra o contexto clínico do paciente e hints do protocolo.
 */
export function auditPrescription(
  items: readonly PrescriptionAuditItem[],
  context: ClinicalContext,
  protocolHints?: ProtocolPharmaGuardHint | null
): PrescriptionAuditReport {
  const alerts: PrescriptionAlert[] = [];
  const matchedDrugs: Array<{ itemName: string; meta: RemumeClinicalMeta }> = [];
  const byDuplicityGroup = new Map<string, Array<{ item: PrescriptionAuditItem; meta: RemumeClinicalMeta }>>();

  const expandedAllergies = expandAllergyTokens(context.allergiesNormalized);
  const effectivePregnant = Boolean(context.isPregnant || protocolHints?.impliedPregnancy);
  const effectivePediatric = Boolean(context.isPediatric || protocolHints?.impliedPediatric);
  const gfr = context.effectiveGfrMlMin;

  for (const item of items) {
    const fullText = `${item.name} ${item.posology || ''} ${item.rawText || ''}`.trim();
    // Prioriza sempre o fármaco principal nomeado em item.name (removendo alternativas entre parênteses "(ou ...)")
    // para não misturar a dose de "Cetoprofeno 100 mg" com o teto de "(ou Diclofenaco 50 mg)" nem contaminar
    // com menções na posologia (ex.: Tramadol "se dor que não ceda com a Dipirona").
    const cleanItemName = stripNegativeClinicalClauses(item.name);
    const cleanFullText = stripNegativeClinicalClauses(fullText);
    const primaryName = cleanItemName.replace(/\(\s*ou\b[^)]*\)/gi, '').trim();
    const meta =
      getDrugClinicalMeta(primaryName) ??
      getDrugClinicalMeta(cleanItemName) ??
      getDrugClinicalMeta(cleanFullText);
    if (!meta) continue;

    matchedDrugs.push({ itemName: item.name, meta });

    // Duplicidade terapêutica só se aplica a itens efetivamente co-prescritos simultaneamente no mesmo bloco de Receita/Carrinho
    // (nunca cruza Conduta hospitalar × Receita de alta, blocos separados de receita, fases sequenciais nem opções alternativas).
    const effectiveScope = item.scope ?? 'receita';
    if (effectiveScope === 'receita' && !item.isAlternative && !item.isSequentialPhase) {
      const dupKey = `${item.rxGroupId ?? 0}::${meta.duplicityGroup}`;
      const grpList = byDuplicityGroup.get(dupKey) || [];
      grpList.push({ item, meta });
      byDuplicityGroup.set(dupKey, grpList);
    }

    // ------------------------------------------------------------------------
    // 2. ALERGIA DIRETA OU CRUZADA
    // ------------------------------------------------------------------------
    if (expandedAllergies.size > 0) {
      const directHit = meta.allergyCrossGroups.find((g) => expandedAllergies.has(g));
      if (directHit) {
        alerts.push({
          id: `allergy-block-${meta.canonicalKey}-${alerts.length}`,
          severity: 'block',
          category: 'allergy',
          title: `ALERGIA: ${item.name}`,
          detail: `Conflito direto/cruzado com alergia registrada (${context.allergies.join(', ')}) — grupo "${directHit}". Não prescrever.`,
          drugNames: [item.name],
          ruleCode: 'ALLERGY_DIRECT_OR_CROSS',
        });
      } else if (meta.allergyWarnGroups && meta.allergyWarnGroups.length > 0) {
        const warnHit = meta.allergyWarnGroups.find((g) => expandedAllergies.has(g));
        if (warnHit) {
          alerts.push({
            id: `allergy-warn-${meta.canonicalKey}-${alerts.length}`,
            severity: 'warn',
            category: 'allergy',
            title: `Reação cruzada possível: ${item.name}`,
            detail: `Paciente refere alergia (${context.allergies.join(', ')}). Cefalosporinas têm baixa reatividade cruzada com penicilinas, mas evitar em história de anafilaxia grave.`,
            drugNames: [item.name],
            ruleCode: 'ALLERGY_CROSS_WARN',
          });
        }
      }
    }

    // ------------------------------------------------------------------------
    // 3A. FUNÇÃO RENAL (TFG / ClCr)
    // ------------------------------------------------------------------------
    if (gfr !== null) {
      const gfrDisplay = String(gfr).replace('.', ',');
      const renal = meta.renalAdjustment;
      if (renal.contraindicatedBelowGfr !== undefined && gfr < renal.contraindicatedBelowGfr) {
        alerts.push({
          id: `renal-block-${meta.canonicalKey}-${alerts.length}`,
          severity: 'block',
          category: 'renal',
          title: `Contraindicado na DRC (TFG ${gfrDisplay} mL/min): ${item.name}`,
          detail: renal.note || `Evitar ${meta.classLabel} quando TFG < ${renal.contraindicatedBelowGfr} mL/min.`,
          drugNames: [item.name],
          ruleCode: 'RENAL_CONTRAINDICATED',
        });
      } else if (renal.required && renal.gfrCutoffMlMin !== undefined && gfr <= renal.gfrCutoffMlMin) {
        alerts.push({
          id: `renal-warn-${meta.canonicalKey}-${alerts.length}`,
          severity: 'warn',
          category: 'renal',
          title: `Ajuste renal necessário (TFG ${gfrDisplay} mL/min): ${item.name}`,
          detail: renal.note || `Ajustar dose ou intervalo de ${item.name} para TFG <= ${renal.gfrCutoffMlMin} mL/min.`,
          drugNames: [item.name],
          ruleCode: 'RENAL_ADJUST',
        });
      }
    }

    // ------------------------------------------------------------------------
    // 3B. GESTAÇÃO
    // ------------------------------------------------------------------------
    if (effectivePregnant && !item.nonViablePregnancyScenario && !item.postpartumScenario) {
      if (meta.pregnancyRisk === 'X' || meta.pregnancyRisk === 'D') {
        alerts.push({
          id: `preg-block-${meta.canonicalKey}-${alerts.length}`,
          severity: 'block',
          category: 'pregnancy',
          title: `Contraindicado na Gestação (Cat. ${meta.pregnancyRisk}): ${item.name}`,
          detail: meta.pregnancyNote || `${meta.classLabel} apresenta risco fetal significativo (Categoria ${meta.pregnancyRisk}). Substituir por alternativa segura.`,
          drugNames: [item.name],
          ruleCode: `PREGNANCY_CAT_${meta.pregnancyRisk}`,
        });
      } else if (meta.pregnancyRisk === 'EVITAR_3TRI') {
        const ig = context.igWeeks;
        const isLate = ig === null || ig >= 20;
        alerts.push({
          id: `preg-3tri-${meta.canonicalKey}-${alerts.length}`,
          severity: isLate ? 'block' : 'warn',
          category: 'pregnancy',
          title: `${isLate ? 'Evitar/Contraindicado' : 'Atenção'} na Gestação: ${item.name}`,
          detail: meta.pregnancyNote || `Evitar no 2º/3º trimestre de gestação.`,
          drugNames: [item.name],
          ruleCode: 'PREGNANCY_EVITAR_3TRI',
        });
      }
    }

    // ------------------------------------------------------------------------
    // 4. TETO DE DOSE DIÁRIA (ADULTO E PEDIÁTRICO)
    // ------------------------------------------------------------------------
    const doseTargetText = extractDrugSegmentForDose(fullText, meta);
    const doseEst = parseEstimatedDailyDoseMg(doseTargetText);
    if (doseEst.dailyDoseMg !== null) {
      if (effectivePediatric && context.weightKg !== null && meta.maxDailyDoseMgPerKg !== undefined) {
        const pedCeilingMg = Math.min(
          Math.round(meta.maxDailyDoseMgPerKg * context.weightKg),
          meta.maxDailyDoseMg ?? Number.POSITIVE_INFINITY
        );
        if (doseEst.dailyDoseMg > pedCeilingMg) {
          alerts.push({
            id: `ceil-ped-${meta.canonicalKey}-${alerts.length}`,
            severity: 'block',
            category: 'ceiling',
            title: `Acima do teto pediátrico (${context.weightKg} kg): ${item.name}`,
            detail: `Dose estimada ${doseEst.dailyDoseMg} mg/dia excede o teto pediátrico de ${pedCeilingMg} mg/dia (${meta.maxDailyDoseMgPerKg} mg/kg/dia${meta.maxDailyDoseMg ? `, teto adulto ${meta.maxDailyDoseMg} mg/dia` : ''}).`,
            drugNames: [item.name],
            ruleCode: 'DOSE_CEILING_PEDIATRIC',
          });
        }
      } else if (meta.maxDailyDoseMg !== undefined && doseEst.dailyDoseMg > meta.maxDailyDoseMg) {
        alerts.push({
          id: `ceil-adult-${meta.canonicalKey}-${alerts.length}`,
          severity: 'block',
          category: 'ceiling',
          title: `Acima do teto diário adulto: ${item.name}`,
          detail: `Dose diária estimada (${doseEst.dailyDoseMg} mg/dia) ultrapassa o teto de ${meta.maxDailyDoseMg} mg/dia.`,
          drugNames: [item.name],
          ruleCode: 'DOSE_CEILING_ADULT',
        });
      }
    } else if (doseEst.singleDoseMg !== null && meta.maxSingleDoseMg !== undefined && doseEst.singleDoseMg > meta.maxSingleDoseMg) {
      alerts.push({
        id: `ceil-single-${meta.canonicalKey}-${alerts.length}`,
        severity: 'warn',
        category: 'ceiling',
        title: `Dose única elevada: ${item.name}`,
        detail: `Dose unitária estimada (${doseEst.singleDoseMg} mg) ultrapassa o limite usual por tomada (${meta.maxSingleDoseMg} mg).`,
        drugNames: [item.name],
        ruleCode: 'DOSE_CEILING_SINGLE',
      });
    }

    // ------------------------------------------------------------------------
    // 4B. CONTRAINDICAÇÃO PONDERAL / ETÁRIA PEDIÁTRICA (Dipirona < 5 kg / < 3m; Ibuprofeno < 7 kg / < 6m)
    // ------------------------------------------------------------------------
    if (
      effectivePediatric &&
      !item.isAlternative &&
      (meta.canonicalKey === 'dipirona' || meta.canonicalKey === 'ibuprofeno')
    ) {
      const spec = getUnifiedDrugSpecByKey(meta.canonicalKey);
      const belowWeight =
        context.weightKg !== null && spec.minWeightKg !== undefined && context.weightKg < spec.minWeightKg;
      const belowAge =
        context.ageYears !== null &&
        spec.minAgeMonths !== undefined &&
        context.ageYears * 12 < spec.minAgeMonths;
      if (belowWeight || belowAge) {
        alerts.push({
          id: `ped-min-${meta.canonicalKey}-${alerts.length}`,
          severity: 'block',
          category: 'ceiling',
          title: `Contraindicado para peso/idade pediátrica: ${item.name}`,
          detail: `${spec.restrictionReason || 'Abaixo do limite ponderal/etário mínimo seguro'}. Substituir por alternativa segura (ex.: Paracetamol quando aplicável).`,
          drugNames: [item.name],
          ruleCode: 'PEDIATRIC_AGE_WEIGHT_CONTRAINDICATION',
        });
      }
    }

    // ------------------------------------------------------------------------
    // 5. CONTRAINDICAÇÃO DO PROTOCOLO ATIVO (ex.: Dengue + AINE/AAS)
    // ------------------------------------------------------------------------
    if (protocolHints) {
      const classBlocked = protocolHints.avoidClasses?.includes(meta.therapeuticClass);
      const keyBlocked = protocolHints.avoidCanonicalKeys?.includes(meta.canonicalKey);
      if (classBlocked || keyBlocked) {
        alerts.push({
          id: `proto-block-${meta.canonicalKey}-${alerts.length}`,
          severity: 'block',
          category: 'protocol',
          title: `Contraindicado no protocolo atual: ${item.name}`,
          detail: protocolHints.reason,
          drugNames: [item.name],
          ruleCode: 'PROTOCOL_CONTRAINDICATION',
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 1. DUPLICIDADE DE CLASSE TERAPÊUTICA
  // --------------------------------------------------------------------------
  const DUPLICITY_CRITICAL_GROUPS = new Set([
    'aine',
    'beta_lactamico',
    'corticoide',
    'opioide',
    'benzodiazepinico',
    'bloqueio_sraa',
    'ibp',
    'anticoagulante',
    'dipirona',
    'paracetamol',
    'macrolideo',
    'fluoroquinolona',
    'anti_histaminico',
  ]);

  for (const [dupKey, entries] of byDuplicityGroup.entries()) {
    if (entries.length < 2) continue;
    const group = dupKey.includes('::') ? dupKey.split('::')[1] : dupKey;
    if (!DUPLICITY_CRITICAL_GROUPS.has(group)) continue;

    const names = entries.map((e) => e.item.name);
    const label = entries[0].meta.classLabel;
    const isHardBlock = group === 'aine' || group === 'bloqueio_sraa' || group === 'anticoagulante' || group === 'paracetamol' || group === 'dipirona';
    alerts.push({
      id: `dup-${dupKey}`,
      severity: isHardBlock ? 'block' : 'warn',
      category: 'duplicity',
      title: `Duplicidade terapêutica (${label})`,
      detail: `Foram detectados ${entries.length} itens da mesma classe (${names.join(' + ')}). Revisar associação para evitar toxicidade cumulativa.`,
      drugNames: names,
      ruleCode: `DUPLICITY_${group.toUpperCase()}`,
    });
  }

  // Ordena: block primeiro, depois warn, depois info
  const sevOrder: Record<PrescriptionAlertSeverity, number> = { block: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return {
    alerts,
    blockCount: alerts.filter((a) => a.severity === 'block').length,
    warnCount: alerts.filter((a) => a.severity === 'warn').length,
    infoCount: alerts.filter((a) => a.severity === 'info').length,
    auditedItemCount: items.length,
    matchedDrugs,
  };
}
