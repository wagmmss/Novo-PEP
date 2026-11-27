// ============================================================================
// FONTE ÚNICA DE PARÂMETROS FARMACOLÓGICOS (Doses, Apresentações, Tetos e Limites)
// Consumida pelo Parser AST (pepAst.ts), Motor Ponderal (personalizar.ts)
// e Auditor de Prescrição (remume.ts / prescriptionGuard.ts).
// ============================================================================

export interface PediatricAgeCeiling {
  /** Limite exclusivo superior em anos (ex.: maxAgeYears: 2 => idade < 2 anos). */
  maxAgeYearsExclusive: number;
  maxDailyMg?: number;
  maxSingleMg?: number;
}

export interface UnifiedDrugDoseSpec {
  canonicalKey: string;
  drugHint: string;
  /** Padrões de correspondência do nome do fármaco (mais específicos primeiro na busca). */
  patterns: RegExp[];
  /** Teto diário adulto absoluto em mg. */
  maxAdultDayMg?: number;
  /** Teto por tomada única em adulto (mg). */
  maxAdultDoseMg?: number;
  /** Teto diário pediátrico usual em mg (quando diferente do adulto, ex.: Prednisolona 40 vs 60 mg). */
  maxPediatricDayMg?: number;
  /** Teto por tomada única pediátrico/ambulatorial em mg (ex.: Ibuprofeno 400 vs 800 mg; Paracetamol 750 vs 1000 mg). */
  maxPediatricDoseMg?: number;
  /** Tetos por faixa etária pediátrica. */
  pediatricAgeCeilings?: PediatricAgeCeiling[];
  /** Teto diário máximo em mg/kg/dia para auditoria pediátrica. */
  maxDailyDoseMgPerKg?: number;
  /** Teto em gotas por tomada. */
  maxAdultGotas?: number;
  /** Teto em mL por tomada (apenas para fórmulas volumétricas com limite inequívoco, ex.: Adrenalina NBZ 5 mL). */
  maxAdultMl?: number;
  /** Restrição ponderal mínima (kg). */
  minWeightKg?: number;
  /** Restrição etária mínima (meses). */
  minAgeMonths?: number;
  /** Mensagem objetiva de contraindicação ponderal/etária. */
  restrictionReason?: string;
  /** Concentrações de referência em pt-BR usadas no autopreenchimento e auditoria de gotas. */
  dropsMgPerDrop?: number;
  oralSolMgPerMl?: number;
  injMgPerMl?: number;
}

/**
 * Catálogo unificado e ordenado do mais específico para o mais genérico
 * (ex.: amoxicilina+clavulanato antes de amoxicilina; oxacilina separada de ampicilina).
 */
export const UNIFIED_DRUG_SPECS: readonly UnifiedDrugDoseSpec[] = [
  {
    canonicalKey: 'amoxicilina_clavulanato',
    drugHint: 'Amoxicilina + Clavulanato',
    patterns: [/\bamoxicilina\s*(?:\+|e|com|[-–])\s*clavulan|\bclavulanat/i],
    maxAdultDayMg: 3000,
    maxAdultDoseMg: 1000,
    maxDailyDoseMgPerKg: 90,
    oralSolMgPerMl: 80, // apresentação padrão 7:1 = 400+57 mg/5 mL = 80 mg/mL de amoxicilina
  },
  {
    canonicalKey: 'amoxicilina',
    drugHint: 'Amoxicilina',
    patterns: [/\bamoxicilin/i],
    maxAdultDayMg: 3000,
    maxAdultDoseMg: 1000,
    maxDailyDoseMgPerKg: 90,
    oralSolMgPerMl: 50, // padrão 250 mg/5 mL (ou 80 mg/mL em 400 mg/5 mL)
  },
  {
    canonicalKey: 'ampicilina',
    drugHint: 'Ampicilina',
    patterns: [/\bampicilin|\bsulbactam\b/i],
    maxAdultDayMg: 12000,
    maxAdultDoseMg: 3000,
    maxDailyDoseMgPerKg: 200,
  },
  {
    canonicalKey: 'oxacilina',
    drugHint: 'Oxacilina',
    patterns: [/\boxacilin/i],
    maxAdultDayMg: 12000,
    maxAdultDoseMg: 2000,
    maxDailyDoseMgPerKg: 200,
  },
  {
    canonicalKey: 'penicilina',
    drugHint: 'Penicilina Cristalina',
    patterns: [/\bpenicilina\s+cristalin|\bbenzilpenicilina\b|\bbenze?tacil\b|\bpenicilina\b/i],
  },
  {
    canonicalKey: 'cefuroxima',
    drugHint: 'Cefuroxima',
    patterns: [/\bcefuroxim/i],
    maxAdultDayMg: 1000, // VO ambulatorial 500 mg 12/12h
    maxAdultDoseMg: 500,
    maxDailyDoseMgPerKg: 30,
    oralSolMgPerMl: 50, // 250 mg/5 mL
  },
  {
    canonicalKey: 'cefalexina',
    drugHint: 'Cefalexina',
    patterns: [/\bcefalexin/i],
    maxAdultDayMg: 4000,
    maxAdultDoseMg: 1000,
    maxDailyDoseMgPerKg: 100,
    oralSolMgPerMl: 50, // 250 mg/5 mL
  },
  {
    canonicalKey: 'ceftriaxona',
    drugHint: 'Ceftriaxona',
    patterns: [/\bceftriaxon/i],
    maxAdultDayMg: 4000,
    maxAdultDoseMg: 2000,
    maxDailyDoseMgPerKg: 100,
  },
  {
    canonicalKey: 'cefotaxima',
    drugHint: 'Cefotaxima',
    patterns: [/\bcefotaxim/i],
    maxAdultDayMg: 12000,
    maxAdultDoseMg: 2000,
    maxDailyDoseMgPerKg: 200,
  },
  {
    canonicalKey: 'azitromicina',
    drugHint: 'Azitromicina',
    patterns: [/\bazitromicin/i],
    maxAdultDayMg: 1000, // 1 g VO dose única (IST/Clamídia/Cancro Mole) em adulto
    maxAdultDoseMg: 1000,
    maxPediatricDayMg: 500,
    maxPediatricDoseMg: 500,
    maxDailyDoseMgPerKg: 10,
  },
  {
    canonicalKey: 'claritromicina',
    drugHint: 'Claritromicina',
    patterns: [/\bclaritromicin/i],
    maxAdultDayMg: 1000,
    maxAdultDoseMg: 500,
    maxDailyDoseMgPerKg: 15,
  },
  {
    canonicalKey: 'gentamicina',
    drugHint: 'Gentamicina',
    patterns: [/\bgentamicin/i],
    maxAdultDayMg: 360,
    maxAdultDoseMg: 360,
    maxDailyDoseMgPerKg: 7.5,
  },
  {
    canonicalKey: 'vancomicina',
    drugHint: 'Vancomicina',
    patterns: [/\bvancomicin/i],
    maxAdultDayMg: 4000,
    maxAdultDoseMg: 2000,
    maxDailyDoseMgPerKg: 60,
  },
  {
    canonicalKey: 'clindamicina',
    drugHint: 'Clindamicina',
    patterns: [/\bclindamicin/i],
    maxAdultDayMg: 2700,
    maxAdultDoseMg: 900,
    maxDailyDoseMgPerKg: 40,
  },
  {
    canonicalKey: 'metronidazol',
    drugHint: 'Metronidazol',
    patterns: [/\bmetronidazol\b/i],
    maxAdultDayMg: 2000,
    maxAdultDoseMg: 500,
    maxDailyDoseMgPerKg: 30,
  },
  {
    canonicalKey: 'aciclovir',
    drugHint: 'Aciclovir',
    patterns: [/\baciclovir\b|\bvalaciclovir\b/i],
    maxAdultDayMg: 4000,
    maxAdultDoseMg: 800,
  },
  {
    canonicalKey: 'dipirona',
    drugHint: 'Dipirona',
    patterns: [/\bdipiron|\bmetamizol\b/i],
    maxAdultDayMg: 4000,
    maxAdultDoseMg: 1000,
    maxDailyDoseMgPerKg: 80,
    maxAdultGotas: 40,
    minWeightKg: 5,
    minAgeMonths: 3,
    restrictionReason: 'Contraindicado (< 5 kg / < 3 meses)',
    dropsMgPerDrop: 25, // 500 mg/mL = 20 gts/mL => 25 mg/gota
    oralSolMgPerMl: 50,
  },
  {
    canonicalKey: 'paracetamol',
    drugHint: 'Paracetamol',
    patterns: [/\bparacetamol\b|\bacetaminofen\b/i],
    maxAdultDayMg: 4000,
    maxAdultDoseMg: 1000,
    maxPediatricDoseMg: 750,
    maxDailyDoseMgPerKg: 75,
    maxAdultGotas: 50, // 200 mg/mL (15 gts/mL ≈ 13,3 mg/gota => 1 gota/kg até 50 gotas ≈ 667-750 mg)
    dropsMgPerDrop: 13.3,
  },
  {
    canonicalKey: 'ibuprofeno',
    drugHint: 'Ibuprofeno',
    patterns: [/\bibuprofen/i],
    maxAdultDayMg: 2400,
    maxAdultDoseMg: 800,
    maxPediatricDoseMg: 400,
    maxDailyDoseMgPerKg: 40,
    maxAdultGotas: 40, // 100 mg/mL (10 gts/mL = 10 mg/gota) => 10 mg/kg = 1 gt/kg até 400 mg = 40 gts
    minWeightKg: 7,
    minAgeMonths: 6,
    restrictionReason: 'Evitar (< 6 meses / < 7 kg)',
    dropsMgPerDrop: 10,
  },
  {
    canonicalKey: 'prednisolona',
    drugHint: 'Prednisolona',
    patterns: [/\bprednisolon|\bprednison/i],
    maxAdultDayMg: 60,
    maxAdultDoseMg: 60,
    maxPediatricDayMg: 40,
    maxDailyDoseMgPerKg: 2,
    oralSolMgPerMl: 3, // 3 mg/mL
    pediatricAgeCeilings: [
      { maxAgeYearsExclusive: 2, maxDailyMg: 20 },
      { maxAgeYearsExclusive: 5, maxDailyMg: 30 },
      { maxAgeYearsExclusive: 18, maxDailyMg: 40 },
    ],
  },
  {
    canonicalKey: 'dexametasona',
    drugHint: 'Dexametasona',
    patterns: [/\bdexametason/i],
    maxAdultDayMg: 16,
    maxAdultDoseMg: 10,
    maxDailyDoseMgPerKg: 1.5,
  },
  {
    canonicalKey: 'dexclorfeniramina',
    drugHint: 'Dexclorfeniramina',
    patterns: [/\bdexclorfeniramin/i],
    maxAdultDayMg: 12,
    maxPediatricDayMg: 6,
    oralSolMgPerMl: 0.4,
    pediatricAgeCeilings: [
      { maxAgeYearsExclusive: 6, maxDailyMg: 3 },
      { maxAgeYearsExclusive: 12, maxDailyMg: 6 },
    ],
  },
  {
    canonicalKey: 'ondansetrona',
    drugHint: 'Ondansetrona',
    patterns: [/\bondansetron/i],
    maxAdultDayMg: 24,
    maxAdultDoseMg: 8,
    injMgPerMl: 2, // ampola 4 mg/2 mL
  },
  {
    canonicalKey: 'midazolam',
    drugHint: 'Midazolam',
    patterns: [/\bmidazolam\b/i],
    maxAdultDoseMg: 10,
  },
  {
    canonicalKey: 'diazepam',
    drugHint: 'Diazepam',
    patterns: [/\bdiazepam\b/i],
    maxAdultDoseMg: 10,
    pediatricAgeCeilings: [
      { maxAgeYearsExclusive: 5, maxSingleMg: 5 },
      { maxAgeYearsExclusive: 18, maxSingleMg: 10 },
    ],
  },
  {
    canonicalKey: 'sulfato_magnesio',
    drugHint: 'Sulfato de Magnésio',
    patterns: [/\bsulfato\s+de\s+magn[eé]sio\b|\bmgso4\b/i],
    maxAdultDoseMg: 2000,
  },
  {
    canonicalKey: 'alteplase',
    drugHint: 'Alteplase',
    patterns: [/\balteplase\b|\brt-?pa\b/i],
    maxAdultDoseMg: 90,
  },
  {
    canonicalKey: 'adrenalina',
    drugHint: 'Adrenalina',
    patterns: [/\badrenalin|\bepinefrin/i],
    maxAdultMl: 5,
  },
  {
    canonicalKey: 'sulfametoxazol_trimetoprima',
    drugHint: 'Sulfametoxazol + Trimetoprima',
    patterns: [/\bsulfametoxazol|\bbactrim\b/i],
    maxAdultDayMg: 3200,
    maxAdultDoseMg: 1600,
    maxDailyDoseMgPerKg: 60,
  },
  {
    canonicalKey: 'enoxaparina',
    drugHint: 'Enoxaparina',
    patterns: [/\benoxaparin/i],
  },
];

const SPEC_BY_KEY = new Map<string, UnifiedDrugDoseSpec>(
  UNIFIED_DRUG_SPECS.map((s) => [s.canonicalKey, s])
);

export function getUnifiedDrugSpecByKey(canonicalKey: string): UnifiedDrugDoseSpec {
  const found = SPEC_BY_KEY.get(canonicalKey);
  if (!found) {
    throw new Error(`UnifiedDrugDoseSpec desconhecido: ${canonicalKey}`);
  }
  return found;
}

/**
 * Localiza o fármaco na cláusula escolhendo a ÚLTIMA ocorrência imediatamente
 * anterior (ou mais próxima) da fórmula de dose, evitando contaminação cruzada.
 */
export function matchUnifiedDrugInClause(
  clauseBeforeFormula: string,
  clauseAfterFormula = ''
): UnifiedDrugDoseSpec | null {
  const beforeNorm = String(clauseBeforeFormula || '');
  let bestSpec: UnifiedDrugDoseSpec | null = null;
  let bestEndPos = -1;

  for (const spec of UNIFIED_DRUG_SPECS) {
    for (const pat of spec.patterns) {
      const globalPat = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : `${pat.flags}g`);
      let m: RegExpExecArray | null;
      while ((m = globalPat.exec(beforeNorm)) !== null) {
        const endPos = m.index + m[0].length;
        if (endPos > bestEndPos) {
          bestEndPos = endPos;
          bestSpec = spec;
        }
      }
    }
  }

  if (bestSpec) return bestSpec;

  const afterNorm = String(clauseAfterFormula || '');
  let earliestPos = Number.POSITIVE_INFINITY;
  for (const spec of UNIFIED_DRUG_SPECS) {
    for (const pat of spec.patterns) {
      const m = pat.exec(afterNorm);
      if (m && m.index < earliestPos) {
        earliestPos = m.index;
        bestSpec = spec;
      }
    }
  }
  return bestSpec;
}

/**
 * Resolve o teto aplicável considerando idade (quando informada) e escopo pediátrico/adulto.
 */
export function resolveDrugCeilingForContext(
  spec: UnifiedDrugDoseSpec,
  options: {
    unitKind: 'dayMg' | 'doseMg' | 'gotas' | 'ml';
    ageYears?: number | null;
    isPediatric?: boolean;
  }
): number | undefined {
  const { unitKind, ageYears = null, isPediatric = false } = options;

  if (unitKind === 'gotas') return spec.maxAdultGotas;
  if (unitKind === 'ml') return spec.maxAdultMl;

  if (ageYears !== null && spec.pediatricAgeCeilings?.length) {
    for (const band of spec.pediatricAgeCeilings) {
      if (ageYears < band.maxAgeYearsExclusive) {
        if (unitKind === 'dayMg' && band.maxDailyMg !== undefined) return band.maxDailyMg;
        if (unitKind === 'doseMg' && band.maxSingleMg !== undefined) return band.maxSingleMg;
      }
    }
  }

  if (unitKind === 'dayMg') {
    if (isPediatric && spec.maxPediatricDayMg !== undefined) return spec.maxPediatricDayMg;
    return spec.maxAdultDayMg;
  }

  if (isPediatric && spec.maxPediatricDoseMg !== undefined) return spec.maxPediatricDoseMg;
  return spec.maxAdultDoseMg;
}
