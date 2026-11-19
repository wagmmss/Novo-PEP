// ============================================================================
// GUARDA ANTI-PII (SANITIZAÇÃO DE DADOS DE PACIENTES EM PONTOS CEGOS/LOGBOOK)
// Detecta e remove CPF, telefone, e-mail, registro/prontuário e nomes próprios
// precedidos por identificadores clínicos (Paciente, Sr., Sra., Dona, etc.).
// ============================================================================

export interface PiiIssue {
  kind: 'cpf' | 'telefone' | 'email' | 'registro' | 'nome';
  label: string;
  sample: string;
}

export interface PiiSanitizationResult {
  sanitized: string;
  replacedCount: number;
  issues: PiiIssue[];
}

interface PiiRule {
  kind: PiiIssue['kind'];
  label: string;
  regex: RegExp;
  replacement: string;
}

const PII_RULES: PiiRule[] = [
  {
    kind: 'cpf',
    label: 'CPF',
    regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    replacement: '[CPF REMOVIDO]',
  },
  {
    kind: 'email',
    label: 'E-mail',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[EMAIL REMOVIDO]',
  },
  {
    kind: 'telefone',
    label: 'Telefone',
    regex: /(?:\+55\s*)?(?:\(\d{2}\)|\b\d{2}\b)[\s-]*(?:9\d{4}|\d{4})[-\s]?\d{4}\b/g,
    replacement: '[CONTATO REMOVIDO]',
  },
  {
    kind: 'registro',
    label: 'Prontuário / RG / CNS',
    regex: /\b(?:prontu[áa]rio|reg(?:istro)?|hc|rg|cns|leito)\s*(?:n[º°.]?|num(?:ero)?)?\s*[:#-]?\s*[a-z0-9][a-z0-9.-]{3,}\b/gi,
    replacement: '[REGISTRO REMOVIDO]',
  },
  {
    kind: 'nome',
    label: 'Nome de paciente',
    regex: /\b(?:[Pp]aciente|[Pp]cte\.?|[Ss]r\.?|[Ss]ra\.?|[Dd]ona|[Ss]eu)\s+[A-ZÀ-Ý][a-zà-ÿ]{2,}(?:\s+(?:da|de|do|dos|das|e)\s+[A-ZÀ-Ý][a-zà-ÿ]{2,}|\s+[A-ZÀ-Ý][a-zà-ÿ]{2,}){1,3}\b/g,
    replacement: '[PACIENTE ANONIMIZADO]',
  },
];

export function detectPiiIssues(text: string): PiiIssue[] {
  const input = String(text || '');
  if (!input.trim()) return [];

  const issues: PiiIssue[] = [];
  for (const rule of PII_RULES) {
    const matcher = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(input)) !== null) {
      issues.push({
        kind: rule.kind,
        label: rule.label,
        sample: match[0],
      });
    }
  }
  return issues;
}

export function sanitizePiiText(text: string): PiiSanitizationResult {
  const input = String(text || '');
  if (!input.trim()) {
    return { sanitized: input, replacedCount: 0, issues: [] };
  }

  const issues = detectPiiIssues(input);
  let sanitized = input;
  let replacedCount = 0;

  for (const rule of PII_RULES) {
    const matcher = new RegExp(rule.regex.source, rule.regex.flags);
    sanitized = sanitized.replace(matcher, () => {
      replacedCount += 1;
      return rule.replacement;
    });
  }

  return {
    sanitized: sanitized.replace(/\s{2,}/g, ' ').trim(),
    replacedCount,
    issues,
  };
}
