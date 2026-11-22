import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  sanitizePepOutput,
  detectPendingGaps,
  hasEmptyPediatricWeight,
  computeWeightBasedDoses,
  extractBodiesFromCustomPep,
  parseChoiceGroupToken,
  formatMultiChoices,
  createFreeEditState,
  pushFreeEditSnapshot,
  undoFreeEditSnapshot,
  resolvePediatricDoseFieldValue,
} from '../src/engine/personalizar.ts';
import {
  createClinicalSearchIndex,
  searchClinicalProtocols,
  searchGlobalStratified,
} from '../src/engine/search.ts';
import {
  parsePepToAst,
  clearPepAstCache,
  createAstSelectionState,
  computeAstDisplayLayout,
  evaluateDoseFormula,
  serializeAstToClinicalText,
  type DoseFormulaNode,
} from '../src/engine/pepAst.ts';
import {
  buildClinicalContext,
  findMatchingBlindSpots,
  validateAgeWeightPlausibility,
} from '../src/engine/clinicalContext.ts';
import {
  formatGuiaInlineHtml,
  classifyGuiaSectionTheme,
  renderGuiaSectionBodyHtml,
  renderTeoriaMarkdownToHtml,
  parsePrePortaContent,
  formatPrePortaTitle,
  formatInlineClinicalHtml,
  cleanHeadingText,
  formatCompactProtocolTitle,
} from '../src/engine/diretrizes.ts';
import {
  filterIntercorrencias,
  buildPendingPontoCegoNote,
} from '../src/engine/prePortaHelpers.ts';
import {
  isExcludingChoiceOption,
  resolveMultiChoiceSelection,
  resolveInlinePlaceholder,
} from '../src/engine/pepInlineHelpers.ts';
import {
  RODIZIOS_6ANO,
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  UNIFIED_CURRICULUM_CATALOG,
  CURRICULUM_BANKS_CONFIG,
  FORMACAO_TEORICA_MODULOS,
  analyzeWeeklySchedule,
  buildDailyTimeline,
  computeProcedureProgress,
  getEffectiveRitualDoneMap,
  getProceduresForHabId,
  getRitualCycleKey,
  registerProcedureExecution,
  recordPrePortaExecution,
  resolveExpectedRodizioForDate,
  resolveFeriasSemanaForDate,
  buildContextualAiPrompt,
  computeCurriculumRoiOpportunities,
  computeMilestoneCountdown,
  computeUnifiedCurriculumScores,
  migrateCentral6AnoState,
  WAGNER_BASELINE_CURRICULUM_ENTRIES,
  type Central6AnoState,
  type CurriculumEntryState,
} from '../src/engine/central6ano.ts';
import {
  resolveClinicalLinksForPep,
  resolveLinksForPrePorta,
  resolveLinksForTeoriaModule,
} from '../src/data/clinical_links.ts';
import {
  ALL_PROTOCOLS,
  PEP_PROTOCOLS,
  HAB_PROTOCOLS,
  compileProtocolForDisplay,
  EMPTY_PATIENT_CONTEXT,
  protocolRequiresWeightCalculation,
  splitGuiaIntoSections,
  partitionAstIntoSections,
  applyPatientContextToAstState,
  serializeProtocolSection,
  walkInlineNodes,
  analyzeSectionGaps,
  countOpenBracketsInFreeText,
  INTERCORRENCIAS_HAB_ID,
  COMMAND_PALETTE_ITEMS,
  COMMAND_PALETTE_SEARCH_INDEX,
} from '../src/data/protocolsRepo.ts';
import { SEIS_INTERCORRENCIAS_DATA } from '../src/data/clinical_reference_data.ts';
import { cockpitStore } from '../src/state/store.ts';
import { detectPiiIssues, sanitizePiiText } from '../src/utils/piiGuard.ts';

const ROOT = process.cwd();
const PROTOCOLS_GEN_PATH = path.join(ROOT, 'src/data/protocols.generated.json');
const protocolsPayload = JSON.parse(fs.readFileSync(PROTOCOLS_GEN_PATH, 'utf8'));

test('Pipeline JSON puro: 88 PEPs + 22 Pré-Porta com CID-10, gravidade e checklists [CRÍTICO]', () => {
  assert.equal(protocolsPayload.counts.total, 110);
  assert.equal(protocolsPayload.counts.pep, 88);
  assert.equal(protocolsPayload.counts.hab, 22);
  assert.equal(ALL_PROTOCOLS.length, 110);
  assert.equal(PEP_PROTOCOLS.length, 88);
  assert.equal(HAB_PROTOCOLS.length, 22);

  assert.ok(PEP_PROTOCOLS.every((p) => Boolean(p.cid10)), 'Todos os 88 PEPs devem ter CID-10');
  assert.ok(
    PEP_PROTOCOLS.every((p) => ['critico', 'urgente', 'rotina'].includes(String(p.gravidade))),
    'Todos os PEPs devem ter gravidade normalizada'
  );

  const critItemsCount = HAB_PROTOCOLS.reduce(
    (sum, h) =>
      sum +
      (h.checklist_sections || []).reduce(
        (s, sec) => s + sec.items.filter((it) => it.critical).length,
        0
      ),
    0
  );
  assert.ok(critItemsCount >= 22, `Esperado >= 22 itens [CRÍTICO] nos cartões Pré-Porta (encontrados: ${critItemsCount})`);
});

test('Motor Personalizar: sanitização clínica, cálculo ponderal com tetos adultos e contraindicações', () => {
  const sample = '# CONDUTA:\n1. Dipirona 1 g [*EV / VO] 6/6h.\n2. [Opcional] Ondansetrona 4 mg EV.\n3. Ibuprofeno [NÃO PRESCREVER SE DENGUE].';
  const clean = sanitizePepOutput(sample);
  assert.ok(clean.includes('Dipirona 1 g EV 6/6h.'));
  assert.ok(!clean.includes('[Opcional]'));
  assert.ok(clean.includes('[NÃO PRESCREVER SE DENGUE]'), 'Travas de contraindicação devem ser preservadas');

  const gaps = detectPendingGaps('PA: [ ] mmHg | Nome: [Nome] | Escolha: [A / B]');
  assert.equal(gaps.emptyBrackets, 1);
  assert.equal(gaps.namedPlaceholders, 1);
  assert.equal(gaps.unresolvedChoices, 1);

  assert.equal(hasEmptyPediatricWeight('Peso: [ ] kg'), true);
  assert.equal(hasEmptyPediatricWeight('Peso: 70 kg'), false);

  const parsed = parseChoiceGroupToken('*Normal / Alterado');
  assert.equal(parsed.hasDefault, true);
  assert.equal(parsed.options[0].isDefault, true);
  assert.equal(formatMultiChoices(['A', 'B', 'C']), 'A, B e C');

  // Lactente 4 kg: Dipirona contraindicada (<5 kg) e Ibuprofeno evitado (<7 kg)
  const infant = computeWeightBasedDoses(4);
  assert.ok(infant);
  assert.equal(infant.dipironaAllowed, false);
  assert.equal(infant.ibuprofenoAllowed, false);

  // Escolar 15 kg: doses ponderais exatas
  const child = computeWeightBasedDoses(15);
  assert.ok(child);
  assert.equal(child.dipironaAllowed, true);
  assert.equal(child.dipironaMg, 300);
  assert.equal(child.amoxi50Ml8h, '5,0');

  // Adolescente 70 kg: trava de teto adulto ativada
  const teen = computeWeightBasedDoses(70);
  assert.ok(teen);
  assert.equal(teen.dipironaMg, 1000);
  assert.equal(teen.paracetamolMg, 750);
  assert.ok(teen.items.some((it) => it.ceilingHit));

  // Resolução inline de dose pediátrica
  const amoxiField = resolvePediatricDoseFieldValue({
    isWeightSourceInput: false,
    lineContext: 'Amoxicilina 250 mg/5 mL — dar [ ] mL de 8/8h',
    prevLineContext: '',
    beforeText: 'dar ',
    afterText: ' mL de 8/8h',
    placeholder: 'mL',
    weightKg: 15,
    doses: child,
  });
  assert.equal(amoxiField, '5,0');

  // Regressão clínica: Ibuprofeno gotas (100 mg/mL) deve respeitar teto adulto de 40 gotas em 70 kg
  // mesmo quando o texto adjacente contém "(1 gota por kg de peso; máx 40 gotas)"
  const ibu15 = resolvePediatricDoseFieldValue({
    isWeightSourceInput: false,
    lineContext: 'Dar [ ] gotas (1 gota por kg de peso; máx 40 gotas) por via oral de 8 em 8 horas.',
    prevLineContext: '2. Ibuprofeno Solução Oral Gotas (100 mg/mL) --- 1 frasco',
    beforeText: 'Dar ',
    afterText: ' gotas (1 gota por kg de peso; máx 40 gotas) por via oral de 8 em 8 horas.',
    placeholder: '...',
    weightKg: 15,
    doses: child,
  });
  assert.equal(ibu15, '15');

  const ibu70 = resolvePediatricDoseFieldValue({
    isWeightSourceInput: false,
    lineContext: 'Dar [ ] gotas (1 gota por kg de peso; máx 40 gotas) por via oral de 8 em 8 horas.',
    prevLineContext: '2. Ibuprofeno Solução Oral Gotas (100 mg/mL) --- 1 frasco',
    beforeText: 'Dar ',
    afterText: ' gotas (1 gota por kg de peso; máx 40 gotas) por via oral de 8 em 8 horas.',
    placeholder: '...',
    weightKg: 70,
    doses: teen,
  });
  assert.equal(ibu70, '40');

  // Campo de peso conferido ("pelo peso de [ ] kg") continua espelhando o peso real (70)
  const weightNote70 = resolvePediatricDoseFieldValue({
    isWeightSourceInput: false,
    lineContext: '*(Cálculo conferido pelo peso de [ ] kg na dose de 50 mg/kg/dia).*',
    prevLineContext: 'Dar [ ] mL',
    beforeText: '*(Cálculo conferido pelo peso de ',
    afterText: ' kg na dose de 50 mg/kg/dia).*',
    placeholder: '...',
    weightKg: 70,
    doses: teen,
  });
  assert.equal(weightNote70, '70');

  // Edição livre com Undo
  const fe0 = createFreeEditState('Texto inicial');
  const fe1 = pushFreeEditSnapshot(fe0, 'Texto editado');
  assert.equal(fe1.dirty, true);
  const feUndo = undoFreeEditSnapshot(fe1);
  assert.equal(feUndo.currentText, 'Texto inicial');
  assert.equal(feUndo.dirty, false);
});

test('Compilador de Protocolos React: prosa limpa sem blocos duplicados, auto-expansão pediátrica e recálculo ponderal', () => {
  clearPepAstCache();

  const pedProto = PEP_PROTOCOLS.find((p) => p.mod_id === 'ped');
  assert.ok(pedProto, 'Deve existir protocolo pediátrico');
  assert.equal(protocolRequiresWeightCalculation(pedProto), true, 'Protocolo pediátrico deve acionar auto-expansão');

  const compiledPed = compileProtocolForDisplay(pedProto, {
    idade: '4 anos',
    pesoKg: '15',
    gestante: false,
    igSemanas: '',
  });
  assert.equal(compiledPed.needsWeightPersonalization, true);
  assert.ok(compiledPed.clinicalContext.weightDoses);
  assert.ok(compiledPed.blocks.length >= 1);
  assert.ok(compiledPed.fullText.includes('15'), 'Peso informado deve ser injetado no texto compilado');

  // Protocolo GO com evolução + conduta + receita + orientações: zero sobreposição entre blocos
  const puerp = PEP_PROTOCOLS.find((p) => p.id === 'go-1');
  assert.ok(puerp);
  const compiledGo = compileProtocolForDisplay(puerp, EMPTY_PATIENT_CONTEXT);
  const ids = compiledGo.blocks.map((b) => b.id);
  assert.ok(ids.includes('evolucao'));
  assert.ok(ids.includes('conduta'));
  assert.ok(ids.includes('receita'));
  assert.ok(ids.includes('orientacoes'));

  const condBlock = compiledGo.blocks.find((b) => b.id === 'conduta')!;
  assert.ok(!condBlock.text.includes('Sulfato Ferroso 40 mg de ferro elementar'), 'Bloco Conduta não deve duplicar Receita');
  assert.ok(!condBlock.text.includes('ORIENTAÇÕES DE ALTA PUERPERAL'), 'Bloco Conduta não deve duplicar Orientações');

  const guiaSections = splitGuiaIntoSections(puerp.guia_body || '');
  assert.ok(guiaSections.length >= 2, 'Diretrizes devem ser fatiadas em seções editoriais');

  // Verificação direta da AST & DoseFormulaNode
  const ast = parsePepToAst('# CONDUTA:\n1. Dipirona 20 mg/kg/dose EV.', 'test-dose');
  const ctx = buildClinicalContext({ pesoKg: '15' }, { modId: 'ped' });
  const astState = createAstSelectionState(ast, ctx);
  const serialized = serializeAstToClinicalText(ast, astState, ctx);
  assert.ok(serialized.includes('300 mg'), 'Fórmula ponderal deve ser calculada inline na serialização');

  const formulaNode: DoseFormulaNode = {
    kind: 'dose-formula',
    id: 'df-1',
    raw: '20 mg/kg/dose',
    drugHint: 'dipirona',
    dosePerKgMin: 20,
    unit: 'mg/kg/dose',
    maxAdultValue: 1000,
    maxAdultUnit: 'mg/dose',
  };
  const evalMax = evaluateDoseFormula(formulaNode, 70);
  assert.ok(evalMax?.ceilingHit, 'Dose acima do teto adulto deve sinalizar ceilingHit');

  // Alerta de plausibilidade Idade x Peso
  const plausibility = validateAgeWeightPlausibility(2, 150);
  assert.ok(plausibility && plausibility.severity === 'critical');
});

test('Motor de Busca MiniSearch: 110 itens indexados, busca estratificada limpa sem REMUME', () => {
  const index = createClinicalSearchIndex(ALL_PROTOCOLS);

  const dorPeito = searchClinicalProtocols(index, ALL_PROTOCOLS, 'dor no peito', 10);
  assert.ok(dorPeito.length > 0);
  assert.equal(dorPeito[0].item.trigger, ';sca');

  const strat = searchGlobalStratified(index, ALL_PROTOCOLS, 'ecg');
  assert.ok(strat.peps.length > 0 || strat.prePorta.length > 0);
  assert.ok(strat.teoria.some((t) => t.id === 'mod-05'));
});

test('Motor Diretrizes: escape XSS, normalização LaTeX e classificação temática', () => {
  const safe = formatGuiaInlineHtml('<script>alert(1)</script> **Atenção** $\\ge 140$ mmHg');
  assert.ok(!safe.includes('<script>'));
  assert.ok(safe.includes('≥ 140'));
  assert.ok(safe.includes('<strong'));

  assert.equal(classifyGuiaSectionTheme('🚫 Travas de Segurança').cls, 'theme-danger');
  assert.equal(classifyGuiaSectionTheme('💊 Farmacologia').cls, 'theme-pharma');

  const html = renderGuiaSectionBodyHtml('1. Primeiro passo\n- Item A');
  assert.ok(html.includes('guia-ol'));
  assert.ok(html.includes('guia-list'));

  const teoriaHtml = renderTeoriaMarkdownToHtml('## Título\n- Ponto **chave**');
  assert.ok(teoriaHtml.includes('<h2>'));
  assert.ok(teoriaHtml.includes('<strong>chave</strong>'));
});

test('Motor 6º Ano & Vínculos Clínicos: Logbook 3x, Pontos Cegos, Prazos R1, Matriz USP/UNICAMP e Links', () => {
  assert.ok(RODIZIOS_6ANO.length >= 6);
  assert.ok(LOGBOOK_PROCEDIMENTOS_MATRIX.length >= 10);
  assert.ok(FORMACAO_TEORICA_MODULOS.length >= 9);
  assert.ok(UNIFIED_CURRICULUM_CATALOG.length >= 10);
  assert.deepEqual(Object.keys(CURRICULUM_BANKS_CONFIG).sort(), ['unicamp', 'usp_rp', 'usp_sp']);

  let st: Central6AnoState = migrateCentral6AnoState({});
  st = registerProcedureExecution(st, 'iot', 'autonomo');
  assert.equal(st.procCountsById?.iot, 1);
  assert.equal(st.procAutonomyById?.iot?.autonomo, 1);

  const pre1 = recordPrePortaExecution(st, 'hab-1', 0);
  const pre2 = recordPrePortaExecution(pre1.nextState, 'hab-1', 0);
  const pre3 = recordPrePortaExecution(pre2.nextState, 'hab-1', 0);
  assert.equal(pre3.newlyDominated, true);

  const prompt = buildContextualAiPrompt('osce', pre3.nextState);
  assert.ok(prompt.includes('OSCE'));

  const countdown = computeMilestoneCountdown(
    { id: 'm1', titulo: 'Prova R1', dateIso: '2027-11-15', categoria: 'prova' },
    new Date(2027, 9, 15)
  );
  assert.equal(countdown.daysLeft, 31);
  assert.equal(countdown.status, 'soon');

  const entries: Record<string, CurriculumEntryState> = {};
  const firstCat = UNIFIED_CURRICULUM_CATALOG[0];
  entries[firstCat.id] = { value: 1, proofStatus: 'pdf_pronto' };
  const evalCurr = computeUnifiedCurriculumScores(entries, { enamedConcept: 5 });
  assert.equal(evalCurr.proofCounts.pdf_pronto, 1);
  assert.ok(evalCurr.banks.usp_sp.finalScore >= 0);

  const blindMatches = findMatchingBlindSpots(
    [
      {
        id: 'pc-1',
        dateIso: '2026-11-19',
        tipo: 'ponto_cego',
        titulo: 'Pré-Eclâmpsia grave: dose de magnésio',
        aprendizado: 'Revisar esquema Pritchard vs Zuspan',
        status: 'aberto',
      },
    ],
    { title: 'Pré-Eclâmpsia e Eclâmpsia', trigger: ';pre-eclampsia' }
  );
  assert.equal(blindMatches.length, 1);

  const links = resolveClinicalLinksForPep({ trigger: ';sca', mod_id: 'upa', gravidade: 'critico' });
  assert.ok(links.habIds.includes('hab-12'));
  assert.ok(resolveLinksForPrePorta('hab-12').pepTriggers.includes(';sca'));
  assert.ok(resolveLinksForTeoriaModule('mod-05').habIds.includes('hab-12'));
});

test('Store React & Backup JSON: tema claro padrão, favoritos, checklists, Logbook rápido e Export/Import atômico', () => {
  cockpitStore.setTheme('light');
  assert.equal(cockpitStore.getSnapshot().theme, 'light');
  cockpitStore.toggleTheme();
  assert.equal(cockpitStore.getSnapshot().theme, 'dark');

  const favAdded = cockpitStore.toggleFavorite('go-1');
  assert.equal(favAdded, true);
  assert.ok(cockpitStore.getSnapshot().favoriteIds.includes('go-1'));

  cockpitStore.toggleHabChecklistItem('hab-1', 'step-1');
  assert.equal(cockpitStore.getSnapshot().habChecklists['hab-1']?.['step-1'], true);

  cockpitStore.addQuickLogbookEntry({
    titulo: 'Intubação Orotraqueal',
    rodizio: 'emergencia_trauma',
    autonomy: 'supervisionado',
    aprendizado: 'Laringoscopia direta em 1ª tentativa',
  });
  cockpitStore.addQuickBlindSpotEntry({
    titulo: 'Critérios de intubação na asma grave',
    rodizio: 'emergencia_trauma',
    aprendizado: 'Revisar sequência com cetamina',
  });

  const backup = cockpitStore.exportBackupJson();
  assert.equal(backup.version, 2);
  assert.equal(backup.clinicalTheme, 'dark');
  assert.ok(backup.favoriteIds.includes('go-1'));
  assert.equal(backup.habChecklists['hab-1']?.['step-1'], true);
  assert.ok((backup.central6AnoState.logbookEntries || []).length >= 2);

  // Limpar e restaurar via JSON string
  cockpitStore.setTheme('light');
  cockpitStore.resetHabChecklist('hab-1');
  const restored = cockpitStore.importBackupJson(JSON.stringify(backup));
  assert.equal(restored.clinicalTheme, 'dark');
  assert.equal(cockpitStore.getSnapshot().theme, 'dark');
  assert.equal(cockpitStore.getSnapshot().habChecklists['hab-1']?.['step-1'], true);

  // Rejeitar JSON inválido sem corromper estado
  assert.throws(() => cockpitStore.importBackupJson('{invalido'), /malformado/i);
  assert.throws(() => cockpitStore.importBackupJson(JSON.stringify({ version: 99 })), /inválido|reconhecido/i);

  // Restaurar padrão claro após teste
  cockpitStore.setTheme('light');
});

test('Extração de corpos do PEP preserva estrutura limpa sem duplicação', () => {
  const custom = '# IDENTIFICAÇÃO:\nPaciente 30a\n\n# CONDUTA:\n1. Hidratação\n\n# RECEITA:\n1. Dipirona 500mg\n\nORIENTAÇÕES:\nRetornar se febre.';
  const bodies = extractBodiesFromCustomPep(custom, { has_receita: true });
  assert.ok(bodies.evolucao_body.includes('Paciente 30a'));
  assert.ok(bodies.conduta_body.includes('Hidratação'));
  assert.ok(bodies.receita_meds_body.includes('Dipirona 500mg'));
  assert.ok(!bodies.receita_meds_body.includes('Retornar se febre'));
  assert.ok(bodies.orientacoes_body.includes('Retornar se febre'));
});

test('Guarda Anti-PII: detecta e anonimiza CPF, telefone, prontuário e nome de paciente sem corromper texto clínico', () => {
  const sample =
    'Paciente João da Silva, CPF 123.456.789-01, prontuário HC-998877, tel (16) 99123-4567 — dúvida sobre dose de MgSO4 4 g EV.';
  const issues = detectPiiIssues(sample);
  assert.ok(issues.length >= 4, `Esperado >= 4 ocorrências PII (encontradas: ${issues.length})`);

  const res = sanitizePiiText(sample);
  assert.ok(!res.sanitized.includes('João da Silva'));
  assert.ok(!res.sanitized.includes('123.456.789-01'));
  assert.ok(!res.sanitized.includes('HC-998877'));
  assert.ok(!res.sanitized.includes('99123-4567'));
  assert.ok(res.sanitized.includes('MgSO4 4 g EV'), 'Conteúdo clínico deve permanecer intacto');

  const cleanClinical = 'Pré-eclâmpsia grave: PA 170x110 mmHg, sulfato de magnésio 4 g EV em 20 min.';
  assert.equal(detectPiiIssues(cleanClinical).length, 0);
});

test('Mundo 2 Store: Logbook 3x (4 papéis + undo), Pontos Cegos anti-PII, Teoria status, Prazos R1, Matriz 3 Bancas e Backup JSON', () => {
  // Reset limpo do estado 6º Ano
  cockpitStore.setCentral6AnoState(migrateCentral6AnoState({}));

  const firstProc = LOGBOOK_PROCEDIMENTOS_MATRIX[0];
  assert.ok(firstProc);

  // Observou e Auxiliou registram exposição sem inflar Regra 3x real
  const obsId = cockpitStore.recordMatrixProcedure(firstProc.id, 'observou');
  assert.ok(obsId);
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id] || 0, 0);
  const auxId = cockpitStore.recordMatrixProcedure(firstProc.id, 'auxiliei');
  assert.ok(auxId);
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id] || 0, 0);
  assert.equal(
    computeProcedureProgress(firstProc.id, cockpitStore.getSnapshot().central6Ano).stage,
    'exposicao'
  );

  // Nota rápida pós-registro com sanitização anti-PII
  const noteRes = cockpitStore.updateLogbookEntryNote(
    auxId,
    'Paciente Maria Silva CPF 111.222.333-44 — manter ângulo 30 graus'
  );
  assert.ok(noteRes.sanitizedCount >= 2);
  const notedEntry = (cockpitStore.getSnapshot().central6Ano.logbookEntries || []).find(
    (e) => e.id === auxId
  );
  assert.ok(notedEntry?.aprendizado.includes('ângulo 30 graus'));
  assert.ok(!notedEntry?.aprendizado.includes('Maria Silva'));

  // Supervisionado e Autônomo avançam a Regra 3x real (Escada de Autonomia)
  cockpitStore.recordMatrixProcedure(firstProc.id, 'supervisionado');
  cockpitStore.recordMatrixProcedure(firstProc.id, 'supervisionado');
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id], 2);
  assert.equal(
    computeProcedureProgress(firstProc.id, cockpitStore.getSnapshot().central6Ano).stage,
    'em_treino'
  );

  cockpitStore.recordMatrixProcedure(firstProc.id, 'supervisionado');
  assert.equal(
    computeProcedureProgress(firstProc.id, cockpitStore.getSnapshot().central6Ano).stage,
    'supervisionado_3x'
  );

  cockpitStore.recordMatrixProcedure(firstProc.id, 'autonomo');
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id], 4);
  assert.equal(
    computeProcedureProgress(firstProc.id, cockpitStore.getSnapshot().central6Ano).stage,
    'autonomo_3x'
  );

  // Remover uma execução ativa decrementa com segurança
  const latestExec = (cockpitStore.getSnapshot().central6Ano.logbookEntries || []).find(
    (e) => e.tipo === 'procedimento' && e.papel === 'Autônomo'
  );
  assert.ok(latestExec);
  cockpitStore.deleteLogbookEntry(latestExec.id);
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id], 3);
  assert.equal(
    computeProcedureProgress(firstProc.id, cockpitStore.getSnapshot().central6Ano).stage,
    'supervisionado_3x'
  );

  // Vínculo Pré-Porta -> QuickCaptureModal -> Logbook 3x
  const hab19Procs = getProceduresForHabId('hab-19');
  assert.ok(hab19Procs.some((p) => p.id === 'proc-svd'));
  assert.ok(hab19Procs.some((p) => p.id === 'proc-paracentese'));
  assert.ok(!LOGBOOK_PROCEDIMENTOS_MATRIX.some((p) => p.id === 'proc-cvc' || p.id === 'proc-efast' || p.id === 'proc-dreno-torax'));

  cockpitStore.addQuickLogbookEntry({
    titulo: 'Paracentese diagnóstica / alívio',
    rodizio: 'cm',
    autonomy: 'supervisionado',
    aprendizado: 'Técnica em Z-track sem intercorrências',
    procId: 'proc-paracentese',
  });
  assert.equal(
    computeProcedureProgress('proc-paracentese', cockpitStore.getSnapshot().central6Ano).execCount,
    1
  );

  // Ponto Cego com sanitização anti-PII + toggle resolvido
  const blindRes = cockpitStore.addBlindSpotEntry({
    titulo: 'Dúvida na cetoacidose — Paciente Maria Oliveira CPF 111.222.333-44',
    rodizio: 'emergencia_trauma',
    duvida: 'Quando iniciar potássio no K+ 3,4',
    acaoRevisao: 'Revisar protocolo CAD',
  });
  assert.ok(blindRes.sanitizedCount >= 2);
  const savedSpot = (cockpitStore.getSnapshot().central6Ano.logbookEntries || []).find(
    (e) => e.tipo === 'ponto_cego'
  );
  assert.ok(savedSpot);
  assert.ok(!savedSpot.titulo.includes('Maria Oliveira'));
  assert.ok(!savedSpot.titulo.includes('111.222.333-44'));
  assert.equal(savedSpot.status, 'em_treino');

  cockpitStore.toggleBlindSpotStatus(savedSpot.id);
  const toggledSpot = (cockpitStore.getSnapshot().central6Ano.logbookEntries || []).find(
    (e) => e.id === savedSpot.id
  );
  assert.equal(toggledSpot?.status, 'resolvido');

  // Status de módulo teórico
  cockpitStore.setTeoriaModuleStatus('mod-01', 'dominado');
  assert.equal(cockpitStore.getSnapshot().central6Ano.teoriaStatusById?.['mod-01'], 'dominado');

  // CRUD de marcos R1
  const addedMs = cockpitStore.addR1Milestone({
    titulo: 'Simulado Geral R1',
    dateIso: '2027-09-15',
    categoria: 'estudo',
    nota: 'Prova na íntegra',
  });
  assert.ok(addedMs);
  cockpitStore.updateR1Milestone(addedMs.id, { titulo: 'Simulado Geral R1 — Atualizado' });
  assert.ok(
    (cockpitStore.getSnapshot().central6Ano.r1Milestones || []).some(
      (m) => m.id === addedMs.id && m.titulo === 'Simulado Geral R1 — Atualizado'
    )
  );

  // Matriz Unificada de Currículo + ENAMED
  const catItem = UNIFIED_CURRICULUM_CATALOG[0];
  cockpitStore.setCurriculumEnamedConcept(4);
  cockpitStore.updateCurriculumEntry(catItem.id, { value: 1, proofStatus: 'pdf_pronto' });
  const score4 = computeUnifiedCurriculumScores(
    cockpitStore.getSnapshot().central6Ano.curriculumEntries,
    { enamedConcept: 4 }
  );
  cockpitStore.setCurriculumEnamedConcept(5);
  const score5 = computeUnifiedCurriculumScores(
    cockpitStore.getSnapshot().central6Ano.curriculumEntries,
    { enamedConcept: 5 }
  );
  assert.ok(score5.banks.usp_sp.finalScore >= score4.banks.usp_sp.finalScore);

  // Roundtrip completo no Backup JSON
  const exported = cockpitStore.exportBackupJson();
  cockpitStore.setCentral6AnoState(migrateCentral6AnoState({}));
  assert.equal(cockpitStore.getSnapshot().central6Ano.teoriaStatusById?.['mod-01'], undefined);

  cockpitStore.importBackupJson(JSON.stringify(exported));
  const after = cockpitStore.getSnapshot().central6Ano;
  assert.equal(after.teoriaStatusById?.['mod-01'], 'dominado');
  assert.equal(after.procCountsById?.[firstProc.id], 3);
  assert.equal(after.procCountsById?.['proc-paracentese'], 1);
  assert.equal(after.curriculumEntries?.[catItem.id]?.proofStatus, 'pdf_pronto');
  assert.equal(after.curriculumEnamedConcept, 5);
  assert.ok((after.r1Milestones || []).some((m) => m.id === addedMs.id));

  // Remover prazo adicionado
  cockpitStore.deleteR1Milestone(addedMs.id);
  assert.ok(!(cockpitStore.getSnapshot().central6Ano.r1Milestones || []).some((m) => m.id === addedMs.id));
});

test('AST Editorial & Condicionais: zero órfãos "2.:" nos 88 PEPs, renumeração sequencial ao alternar switches e espelhamento respeitando userEditedNodes', () => {
  clearPepAstCache();

  // 1) Nenhum dos 88 PEPs pode gerar linha órfã tipo "2.:" ou "3. :"
  for (const proto of PEP_PROTOCOLS) {
    const compiled = compileProtocolForDisplay(proto, EMPTY_PATIENT_CONTEXT);
    for (const blk of compiled.blocks) {
      assert.ok(
        !/^\d+\.\s*:?\s*$/m.test(blk.text),
        `Protocolo ${proto.id} (${blk.id}) gerou item numerado órfão:\n${blk.text}`
      );
    }
  }

  // 2) Protocolo go-4: alternar condicional de profilaxia de Pré-Eclâmpsia renumera itens sem órfãos
  const go4 = PEP_PROTOCOLS.find((p) => p.id === 'go-4');
  assert.ok(go4, 'Protocolo go-4 deve existir');
  const compiledGo4 = compileProtocolForDisplay(go4, EMPTY_PATIENT_CONTEXT);
  const receitaSec = compiledGo4.sections.find((s) => s.id === 'receita');
  assert.ok(receitaSec, 'go-4 deve conter seção de receita');

  const peToggle = receitaSec.toggles.find(
    (t) => t.kind === 'trava' && /pr[ée]-ecl[âa]mpsia/i.test(t.fullLabel)
  );
  assert.ok(peToggle, 'Seção receita do go-4 deve expor interruptor condicional de Pré-Eclâmpsia');

  // Switch LIGADO (travaExcluded = false): AAS e Carbonato promovidos a 2. e 3., demais seguem 4., 5.
  const stateOn = {
    ...compiledGo4.initialAstState,
    travaExcluded: { ...compiledGo4.initialAstState.travaExcluded, [peToggle.id]: false },
  };
  const textOn = serializeProtocolSection(compiledGo4.ast, stateOn, compiledGo4.clinicalContext, receitaSec);
  assert.ok(!/^\d+\.\s*:?\s*$/m.test(textOn), 'Não pode haver "2.:" com switch ligado');
  assert.ok(textOn.includes('2. Ácido Acetilsalicílico'), `AAS deve ser promovido ao item 2:\n${textOn}`);
  assert.ok(textOn.includes('3. Carbonato de Cálcio'), `Cálcio deve ser promovido ao item 3:\n${textOn}`);

  // Switch DESLIGADO (travaExcluded = true): AAS e Cálcio omitidos e lista renumerada 1, 2, 3...
  const stateOff = {
    ...compiledGo4.initialAstState,
    travaExcluded: { ...compiledGo4.initialAstState.travaExcluded, [peToggle.id]: true },
  };
  const textOff = serializeProtocolSection(compiledGo4.ast, stateOff, compiledGo4.clinicalContext, receitaSec);
  assert.ok(!textOff.includes('Ácido Acetilsalicílico'), 'AAS deve ser omitido com switch desligado');
  assert.ok(!textOff.includes('Carbonato de Cálcio'), 'Cálcio deve ser omitido com switch desligado');

  const layoutOff = computeAstDisplayLayout(compiledGo4.ast, stateOff, receitaSec.blockIndexSet);
  const numbersOff = Array.from(layoutOff.renumberedByBlockIndex.values());
  assert.ok(numbersOff.length >= 2);
  numbersOff.forEach((n, idx) => {
    assert.equal(n, idx + 1, 'Itens visíveis devem manter numeração sequencial 1..N');
  });

  // 3) Particionamento sem sobreposição de índices de bloco
  const sections = partitionAstIntoSections(compiledGo4.ast, go4);
  const seenIndices = new Set<number>();
  for (const sec of sections) {
    for (const bi of sec.blockIndices) {
      assert.equal(seenIndices.has(bi), false, `Bloco AST ${bi} duplicado entre seções`);
      seenIndices.add(bi);
    }
  }

  // 4) Espelhamento de contexto do paciente respeita userEditedNodes
  const pedProto = PEP_PROTOCOLS.find((p) => p.id === 'ped-81') || PEP_PROTOCOLS.find((p) => p.mod_id === 'ped')!;
  assert.ok(pedProto);
  const compiledPed = compileProtocolForDisplay(pedProto, EMPTY_PATIENT_CONTEXT);
  let weightNodeId: string | null = null;
  for (const blk of compiledPed.ast.blocks) {
    walkInlineNodes(blk.children, (n) => {
      if (!weightNodeId && n.kind === 'inline-input' && (n.anthroRole === 'peso' || n.mirrorRole === 'peso')) {
        weightNodeId = n.id;
      }
    });
  }
  assert.ok(weightNodeId, 'Protocolo pediátrico deve ter nó de peso espelhável');

  const ctx15 = buildClinicalContext({ pesoKg: '15' }, { modId: pedProto.mod_id });
  const synced15 = applyPatientContextToAstState(compiledPed.ast, compiledPed.initialAstState, ctx15);
  assert.equal(synced15.inputValues[weightNodeId], '15');

  // Edição manual no nó trava sobrescrita automática
  const manuallyEdited = {
    ...synced15,
    inputValues: { ...synced15.inputValues, [weightNodeId]: '18,5' },
    userEditedNodes: { ...synced15.userEditedNodes, [weightNodeId]: true },
  };
  const ctx22 = buildClinicalContext({ pesoKg: '22' }, { modId: pedProto.mod_id });
  const syncedAfterManual = applyPatientContextToAstState(compiledPed.ast, manuallyEdited, ctx22);
  assert.equal(
    syncedAfterManual.inputValues[weightNodeId],
    '18,5',
    'Valor editado manualmente pelo usuário não pode ser sobrescrito pelo espelhamento automático'
  );
});

test('Personalização Inline PEP: exclusão mútua em multi-escolha (Hígida/Nega) e placeholders não redundantes (G/P/A)', () => {
  assert.equal(isExcludingChoiceOption('Hígida'), true);
  assert.equal(isExcludingChoiceOption('Nega alergias'), true);
  assert.equal(isExcludingChoiceOption('Sem comorbidades'), true);
  assert.equal(isExcludingChoiceOption('HAS'), false);
  assert.equal(isExcludingChoiceOption('[Outra...]'), false);

  const options = [
    { index: 0, rawText: 'Hígida' },
    { index: 1, rawText: 'HAS' },
    { index: 2, rawText: 'DM' },
    { index: 3, rawText: '[Outra...]' },
  ];

  // Partindo de Hígida (0), marcar HAS (1) desmarca Hígida automaticamente
  const afterHas = resolveMultiChoiceSelection(options, [0], 1);
  assert.deepEqual(afterHas, [1]);

  // Adicionar [Outra...] (3) mantém HAS + [Outra...]
  const afterOutra = resolveMultiChoiceSelection(options, afterHas, 3);
  assert.deepEqual(afterOutra, [1, 3]);

  // Marcar Hígida (0) desmarca todas as demais
  const backToHigida = resolveMultiChoiceSelection(options, afterOutra, 0);
  assert.deepEqual(backToHigida, [0]);

  // Placeholders redundantes ("G G", "P P", "A A") viram "_"
  assert.equal(resolveInlinePlaceholder('G', 'ID: G'), '_');
  assert.equal(resolveInlinePlaceholder('P', 'G2 P'), '_');
  assert.equal(resolveInlinePlaceholder('A', 'G2 P1 A'), '_');
  assert.equal(resolveInlinePlaceholder('Alérgica a...', 'Alergias: '), 'Alérgica a...');
  assert.equal(resolveInlinePlaceholder('Outra...', 'Comorbidades: '), 'Outra...');
});

test('Pré-Porta: parser estruturado, subtítulos sem numeração quebrada e capitalização limpa dos títulos', () => {
  assert.equal(
    formatPrePortaTitle('Leitura de Cardiotocografia (CTG / Acog) & Partograma (oms)'),
    'Leitura de Cardiotocografia (CTG / ACOG) & Partograma (OMS)'
  );
  assert.equal(
    formatPrePortaTitle('Procedimentos Invasivos Essenciais do Interno (paracentese, Toracocentese, Pl & Sondagens)'),
    'Procedimentos Invasivos Essenciais do Interno (Paracentese, Toracocentese, PL & Sondagens)'
  );
  assert.equal(
    formatPrePortaTitle('Comunicação de Más Notícias (SPIKES / Nurse) & TEACH-BACK'),
    'Comunicação de Más Notícias (SPIKES / NURSE) & Teach-Back'
  );
  assert.equal(
    formatPrePortaTitle('Exame Físico Pediátrico & Triângulo de Avaliação Pediátrica (tep)'),
    'Exame Físico Pediátrico & Triângulo de Avaliação Pediátrica (TEP)'
  );

  // Parse estruturado de um cartão completo (hab-21 tem Resumo 30s + Mnemônico + Coreografia)
  const hab21 = HAB_PROTOCOLS.find((h) => h.id === 'hab-21');
  assert.ok(hab21?.pre_porta);
  const parsed21 = parsePrePortaContent(hab21.pre_porta);
  assert.ok(parsed21.resumo30s.includes('Exame Neurovascular'));
  assert.ok(parsed21.mnemonico.includes('Lidocaína'));
  assert.ok(parsed21.coreografia.includes('AVALIAÇÃO INICIAL'));

  // Subtítulos numerados seguidos de bullets não podem virar <ol> quebrados que reiniciam em 1.
  const coreoHtml21 = renderTeoriaMarkdownToHtml(parsed21.coreografia);
  assert.ok(
    coreoHtml21.includes('<h4 class="preporta-subhead">AVALIAÇÃO INICIAL, HEMOSTASIA E EXPLORAÇÃO</h4>'),
    `Subtítulo editorial esperado em hab-21:\n${coreoHtml21}`
  );
  assert.ok(
    coreoHtml21.includes('<h4 class="preporta-subhead">ANTISSEPSIA E TÉCNICA DE INFILTRAÇÃO ANESTÉSICA (MENOS DOR)</h4>')
  );

  // Numeração dupla "2. 1. CALIBRAÇÃO" (hab-12) deve ser limpa
  const hab12 = HAB_PROTOCOLS.find((h) => h.id === 'hab-12');
  assert.ok(hab12?.pre_porta);
  const parsed12 = parsePrePortaContent(hab12.pre_porta);
  assert.ok(!/^\s*2\.\s+1\./m.test(parsed12.resumo30s), 'Não deve manter prefixo duplicado "2. 1."');
});

test('Plano 6º Ano: persistência de rodízio, semana de férias, arquétipo de dia e Ritual de Domingo + Backup', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const mem = new Map<string, string>();
  const mockLocalStorage = {
    get length() {
      return mem.size;
    },
    key(i: number) {
      return Array.from(mem.keys())[i] ?? null;
    },
    getItem(k: string) {
      return mem.has(k) ? mem.get(k)! : null;
    },
    setItem(k: string, v: string) {
      mem.set(k, String(v));
    },
    removeItem(k: string) {
      mem.delete(k);
    },
    clear() {
      mem.clear();
    },
  };
  (globalThis as Record<string, unknown>).window = { localStorage: mockLocalStorage };

  try {
    cockpitStore.reload();
    cockpitStore.updateCentralContext({
      rodizioId: 'ferias',
      feriasSemana: 'sem4',
      arquetipoId: 'pos_plantao',
    });
    cockpitStore.toggleRitualDomingoItem('rit-escala');
    cockpitStore.toggleRitualDomingoItem('rit-7030');

    const snap = cockpitStore.getSnapshot().central6Ano;
    assert.equal(snap.rodizioId, 'ferias');
    assert.equal(snap.feriasSemana, 'sem4');
    assert.equal(snap.arquetipoId, 'pos_plantao');
    assert.equal(snap.ritualDomingoDoneIds['rit-escala'], true);
    assert.equal(snap.ritualDomingoDoneIds['rit-7030'], true);

    const exported = cockpitStore.exportBackupJson();
    cockpitStore.resetRitualDomingo();
    assert.deepEqual(cockpitStore.getSnapshot().central6Ano.ritualDomingoDoneIds, {});

    cockpitStore.importBackupJson(JSON.stringify(exported));
    const restored = cockpitStore.getSnapshot().central6Ano;
    assert.equal(restored.feriasSemana, 'sem4');
    assert.equal(restored.arquetipoId, 'pos_plantao');
    assert.equal(restored.ritualDomingoDoneIds['rit-escala'], true);

    // selectRodizio atualiza 70% e 30% e preserva microHabitoSemanal customizado
    cockpitStore.updateCentralContext({ microHabitoSemanal: 'Meu micro-hábito customizado' });
    cockpitStore.selectRodizio('go');
    const afterGo = cockpitStore.getSnapshot().central6Ano;
    assert.equal(afterGo.rodizioId, 'go');
    assert.ok(afterGo.focoSemanalAncora70?.includes('Obstetrícia'));
    assert.ok(afterGo.focoSemanalTrilha30?.includes('Endocrinologia'));
    assert.equal(afterGo.microHabitoSemanal, 'Meu micro-hábito customizado');

    // setWeeklyMarcha sincroniza bidirecionalmente com Esteira v3.1 (semanaPesadaByWeek)
    cockpitStore.setWeeklyMarcha('2_pesada', '2027-02-03');
    assert.equal(cockpitStore.getSnapshot().central6Ano.marchaId, '2_pesada');
    assert.equal(
      cockpitStore.getSnapshot().central6Ano.treinoClinico?.internato.semanaPesadaByWeek['2027-02-01'],
      true
    );
    cockpitStore.setTreinoInternatoFlag('semanaPesadaByWeek', '2027-02-01', false);
    assert.equal(cockpitStore.getSnapshot().central6Ano.marchaId, '3_normal');

    // Ciclo semanal do Ritual de Domingo: vira limpo no sábado seguinte e grava última conclusão
    assert.equal(getRitualCycleKey('2026-11-22'), '2026-11-21'); // domingo -> sábado anterior
    assert.equal(getRitualCycleKey('2026-11-27'), '2026-11-21'); // sexta -> mesmo ciclo
    assert.equal(getRitualCycleKey('2026-11-28'), '2026-11-28'); // sábado seguinte -> novo ciclo

    cockpitStore.resetRitualDomingo('2026-11-22');
    for (const id of ['rit-escala', 'rit-7030', 'rit-habito', 'rit-curriculo']) {
      cockpitStore.toggleRitualDomingoItem(id, '2026-11-22');
    }
    const ritualSnap = cockpitStore.getSnapshot().central6Ano;
    assert.equal(ritualSnap.ritualDomingoLastCompletedIso, '2026-11-22');
    assert.equal(getEffectiveRitualDoneMap(ritualSnap, '2026-11-27')['rit-escala'], true);
    assert.deepEqual(getEffectiveRitualDoneMap(ritualSnap, '2026-11-28'), {});

    // Férias v3.1 & rodízio esperado por data
    assert.equal(resolveFeriasSemanaForDate('2026-11-22'), null);
    assert.equal(resolveFeriasSemanaForDate('2026-12-22'), 'sem4');
    assert.equal(resolveFeriasSemanaForDate('2027-01-14'), 'sem7');
    assert.equal(resolveExpectedRodizioForDate('2027-02-01').id, 'cirurgia');
    assert.equal(resolveExpectedRodizioForDate('2027-10-15').id, 'sprint_r1');

    // Pós-plantão noturno: descanso integral (0 Anki e zero revisão leve)
    const sched = analyzeWeeklySchedule(
      {
        seg: ['plantao_noturno'],
        ter: ['folga'],
        qua: ['manha', 'tarde'],
        qui: ['manha', 'tarde'],
        sex: ['manha', 'tarde'],
        sab: ['folga'],
        dom: ['folga'],
      },
      'ter',
      '3_normal'
    );
    assert.equal(sched.days.ter.isPosPlantao, true);
    assert.equal(sched.days.ter.recommendedQuestions, 0);
    assert.equal(sched.days.ter.recommendedAnkiCards, 0);
    const posSteps = buildDailyTimeline(migrateCentral6AnoState({ arquetipoId: 'pos_plantao' }));
    assert.ok(posSteps.every((s) => !/anki/i.test(s.titulo) && !/anki/i.test(s.detalhe)));
  } finally {
    (globalThis as Record<string, unknown>).window = originalWindow;
  }
});

test('Trava de cópia: lacunas clínicas travam, identificação e valores sugeridos não, peso ausente detectado', () => {
  clearPepAstCache();

  const receitaReport = (title: string, patient = EMPTY_PATIENT_CONTEXT) => {
    const proto = PEP_PROTOCOLS.find((p) => p.title.includes(title));
    assert.ok(proto, `Protocolo "${title}" deve existir`);
    const compiled = compileProtocolForDisplay(proto, patient);
    const receita = compiled.sections.find((s) => s.id === 'receita');
    assert.ok(receita, `"${title}" deve ter seção de Prescrição`);
    const report = analyzeSectionGaps(compiled.ast, compiled.initialAstState, compiled.clinicalContext, receita);
    const copied = serializeProtocolSection(compiled.ast, compiled.initialAstState, compiled.clinicalContext, receita);
    return { report, copied };
  };

  // Pediatria sem peso: trava (peso é a base da dose)
  const semPeso = receitaReport('Bronquiolite');
  assert.ok(semPeso.report.total > 0, 'Receita pediátrica sem peso deve travar a cópia');

  // Mesmo protocolo com peso: só sobram Nome/Data (identificação), que NÃO travam
  const comPeso = receitaReport('Bronquiolite', { ...EMPTY_PATIENT_CONTEXT, pesoKg: '8', idade: '6m' });
  assert.equal(comPeso.report.total, 0, 'Com peso informado a receita da BVA não deve travar');
  assert.ok(comPeso.report.identificationFields >= 1, 'Nome/Data em branco devem ser contados só como aviso');
  assert.ok(comPeso.copied.includes('[3 a 5]'), 'Valor sugerido "[3 a 5]" continua no texto e não conta como lacuna');

  // Marcadores internos de auditoria nunca vazam para o texto copiado
  assert.ok(!/⟪GAP_/.test(semPeso.copied) && !/⟪GAP_/.test(comPeso.copied));

  // Dengue (adulto) sem peso: detecta dose por kg sem peso informado
  const dengue = receitaReport('Dengue');
  assert.equal(dengue.report.missingWeightForDoses, true, 'Hidratação mL/kg sem peso deve ser sinalizada');

  // Rótulos em CAIXA ALTA entre colchetes não são lacunas (PAC adulto não trava)
  const pac = receitaReport('Pronto Atendimento - Pneumonia');
  assert.equal(pac.report.total, 0, 'Cabeçalho "[MEDICAÇÃO SINTOMÁTICA E SUPORTE]" não é lacuna');

  // Panorama: toda receita pediátrica sem peso trava; nenhuma receita trava só por identificação
  let pedTravadas = 0;
  let pedComReceita = 0;
  for (const proto of PEP_PROTOCOLS) {
    const compiled = compileProtocolForDisplay(proto, EMPTY_PATIENT_CONTEXT);
    const receita = compiled.sections.find((s) => s.id === 'receita');
    if (!receita) continue;
    const r = analyzeSectionGaps(compiled.ast, compiled.initialAstState, compiled.clinicalContext, receita);
    assert.equal(r.total, r.openFields + r.unselectedChoices + (r.missingWeightForDoses ? 1 : 0));
    if (proto.mod_id === 'ped') {
      pedComReceita++;
      if (r.total > 0) pedTravadas++;
    }
  }
  assert.ok(pedComReceita > 0 && pedTravadas === pedComReceita, 'Toda receita pediátrica sem dados deve travar');

  // Texto editado livremente: "[ ]" de checkbox no início da linha não conta; lacunas inline contam
  assert.equal(countOpenBracketsInFreeText('[ ] Retorno em 48h\nDipirona [ ] gotas 6/6h\nPeso: [___] kg'), 2);
  assert.equal(countOpenBracketsInFreeText('- [x] Orientado\nTudo preenchido'), 0);
});


test('Rota na URL: ida e volta de #/p/<id>, #/hab/<id>, #/6ano/<aba> e ids desconhecidos caem na lista', async () => {
  const { formatHashRoute, parseHashRoute } = await import('../src/state/hashRoute.ts');
  const { resolveKnownRouteId, INTERCORRENCIAS_HAB_ID } = await import('../src/data/protocolsRepo.ts');
  const pep = PEP_PROTOCOLS[3];
  const hab = HAB_PROTOCOLS[2];

  const pRoute = { world: 'beira-leito' as const, tab: 'protocolos' as const, id: pep.id, detail: true };
  assert.deepEqual(parseHashRoute(formatHashRoute(pRoute), resolveKnownRouteId), pRoute);

  const hRoute = { world: 'beira-leito' as const, tab: 'pre-porta' as const, id: hab.id, detail: true };
  assert.deepEqual(parseHashRoute(formatHashRoute(hRoute), resolveKnownRouteId), hRoute);

  // Resolução resiliente por trigger/slug (;sca ou sca) e rota especial #/hab/intercorrencias
  const scaProto = PEP_PROTOCOLS.find((p) => p.trigger === ';sca')!;
  assert.equal(resolveKnownRouteId('protocolos', 'sca'), scaProto.id);
  assert.equal(resolveKnownRouteId('protocolos', ';sca'), scaProto.id);
  assert.deepEqual(parseHashRoute('#/p/sca', resolveKnownRouteId), {
    world: 'beira-leito',
    tab: 'protocolos',
    id: scaProto.id,
    detail: true,
  });

  const ecgHab = HAB_PROTOCOLS.find((h) => h.trigger === ';hab-ecg')!;
  assert.equal(resolveKnownRouteId('pre-porta', 'hab-ecg'), ecgHab.id);
  assert.equal(resolveKnownRouteId('pre-porta', ';hab-ecg'), ecgHab.id);
  assert.equal(resolveKnownRouteId('pre-porta', INTERCORRENCIAS_HAB_ID), INTERCORRENCIAS_HAB_ID);
  assert.deepEqual(parseHashRoute('#/hab/intercorrencias', resolveKnownRouteId), {
    world: 'beira-leito',
    tab: 'pre-porta',
    id: INTERCORRENCIAS_HAB_ID,
    detail: true,
  });

  assert.equal(formatHashRoute({ world: 'beira-leito', tab: 'protocolos', id: pep.id, detail: false }), '#/p');
  assert.deepEqual(parseHashRoute('#/6ano/teoria', resolveKnownRouteId), { world: 'sexto-ano', tab: 'teoria' });
  assert.deepEqual(parseHashRoute('#/6ano/xyz', resolveKnownRouteId), { world: 'sexto-ano', tab: 'pratica' });
  assert.deepEqual(parseHashRoute('#/p/protocolo-que-nao-existe', resolveKnownRouteId), {
    world: 'beira-leito',
    tab: 'protocolos',
    id: null,
    detail: false,
  });
  // Um id de Pré-Porta não abre como protocolo PEP
  assert.equal(parseHashRoute(`#/p/${hab.id}`, resolveKnownRouteId)?.world, 'beira-leito');
  assert.equal((parseHashRoute(`#/p/${hab.id}`, resolveKnownRouteId) as { detail: boolean }).detail, false);
  assert.equal(parseHashRoute('', resolveKnownRouteId), null);
  assert.equal(parseHashRoute('#/qualquer', resolveKnownRouteId), null);
});

test('Busca por medicamento: nomes de fármacos de toda a receita entram no índice', async () => {
  const { extractDrugNamesForIndex } = await import('../src/engine/search.ts');
  const names = extractDrugNamesForIndex(
    '1. Ceftriaxona 1 g IV 12/12h\n   - Dipirona Monoidratada 1 g VO\nOrientações: retorno em 48h'
  );
  assert.ok(names.includes('Ceftriaxona'));
  assert.ok(names.includes('Dipirona Monoidratada'));
  assert.ok(!names.includes('Orientações'));

  const index = createClinicalSearchIndex(PEP_PROTOCOLS);
  for (const drug of ['ceftriaxona', 'amoxicilina']) {
    const containing = PEP_PROTOCOLS.filter((p) =>
      (p.pep_body || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(drug)
    ).length;
    const found = searchClinicalProtocols(index, PEP_PROTOCOLS, drug, 88).length;
    assert.ok(found >= Math.ceil(containing / 2), `"${drug}": ${found} resultados para ${containing} protocolos`);
  }
});

test('Auditor de prescrição nos protocolos: 88/88 com seção Conduta, receita padrão sem falsos positivos, CKD-EPI 2021 integrado e alergia informada bloqueia', async () => {
  const { auditProtocolPrescription } = await import('../src/data/protocolsRepo.ts');
  let alertsWithoutPatient = 0;
  for (const proto of PEP_PROTOCOLS) {
    const compiled = compileProtocolForDisplay(proto, EMPTY_PATIENT_CONTEXT);
    assert.ok(
      compiled.sections.some((s) => s.id === 'conduta'),
      `Protocolo ${proto.id} (${proto.trigger}) deve possuir seção Conduta particionada`
    );
    const texts: Record<string, string> = {};
    for (const sec of compiled.sections) {
      if (sec.id === 'receita' || sec.id === 'conduta') {
        texts[sec.id] = serializeProtocolSection(compiled.ast, compiled.initialAstState, compiled.clinicalContext, sec);
      }
    }
    const audit = auditProtocolPrescription(proto, texts, compiled.clinicalContext);
    const recAlerts = (audit.receita?.blockCount ?? 0) + (audit.receita?.warnCount ?? 0);
    const condBlocks = audit.conduta?.blockCount ?? 0;
    assert.equal(recAlerts, 0, `Receita padrão de ${proto.id} (${proto.trigger}) gerou falso positivo: ${JSON.stringify(audit.receita?.alerts)}`);
    assert.equal(condBlocks, 0, `Conduta padrão de ${proto.id} (${proto.trigger}) gerou bloqueio falso: ${JSON.stringify(audit.conduta?.alerts)}`);
    alertsWithoutPatient += recAlerts + condBlocks;
  }
  assert.equal(alertsWithoutPatient, 0, 'Nenhum protocolo padrão pode disparar alarme falso sem dados do paciente');

  // Contexto obstétrico automático em ;pn-ret (go-4) e ;cesarea (go-10)
  for (const trig of [';pn-ret', ';cesarea']) {
    const obstProto = PEP_PROTOCOLS.find((p) => p.trigger === trig)!;
    assert.ok(obstProto, `Protocolo ${trig} deve existir`);
    const compiledObst = compileProtocolForDisplay(obstProto, EMPTY_PATIENT_CONTEXT);
    assert.equal(compiledObst.clinicalContext.isPregnant, true, `${trig} deve ativar isPregnant automaticamente`);
  }

  // ;sutura (upa-64), ;parasitose (upa-33) e ;escabiose (upa-54) particionam Conduta e Prescrição/Receita
  for (const trig of [';sutura', ';parasitose', ';escabiose']) {
    const p = PEP_PROTOCOLS.find((x) => x.trigger === trig)!;
    const comp = compileProtocolForDisplay(p, EMPTY_PATIENT_CONTEXT);
    assert.ok(comp.sections.some((s) => s.id === 'conduta'), `${trig} deve ter seção Conduta`);
    assert.ok(comp.sections.some((s) => s.id === 'receita'), `${trig} deve ter seção Prescrição/Receita`);
  }

  // CKD-EPI 2021 integrado na barra do paciente alimenta automaticamente a TFG e o Prescription Guard
  const pac = PEP_PROTOCOLS.find((p) => p.title.includes('Pronto Atendimento - Pneumonia'))!;
  const compiledCkd = compileProtocolForDisplay(pac, {
    ...EMPTY_PATIENT_CONTEXT,
    idade: '72',
    creatinina: '3,2',
    sexo: 'M',
  });
  assert.ok(
    compiledCkd.clinicalContext.tfgCkdEpi !== null && compiledCkd.clinicalContext.tfgCkdEpi < 25,
    `CKD-EPI 2021 deveria calcular TFGe < 25 mL/min (obtido: ${compiledCkd.clinicalContext.tfgCkdEpi})`
  );
  const receitaCkd = compiledCkd.sections.find((s) => s.id === 'receita')!;
  const auditCkd = auditProtocolPrescription(
    pac,
    { receita: serializeProtocolSection(compiledCkd.ast, compiledCkd.initialAstState, compiledCkd.clinicalContext, receitaCkd) },
    compiledCkd.clinicalContext
  );
  assert.ok(
    (auditCkd.receita?.alerts.length ?? 0) >= 1,
    'TFGe < 30 mL/min calculada via CKD-EPI 2021 deve acionar alerta renal na prescrição com Amoxicilina'
  );

  const compiled = compileProtocolForDisplay(pac, { ...EMPTY_PATIENT_CONTEXT, alergias: 'penicilina' });
  const receita = compiled.sections.find((s) => s.id === 'receita')!;
  const audit = auditProtocolPrescription(
    pac,
    { receita: serializeProtocolSection(compiled.ast, compiled.initialAstState, compiled.clinicalContext, receita) },
    compiled.clinicalContext
  );
  assert.ok((audit.receita?.blockCount ?? 0) >= 1, 'Amoxicilina com alergia a penicilina deve bloquear');
});

test('R1 & Currículo (Editais 2027): baremas USP-SP/USP-RP/UNICAMP, Comprovado vs Projetado, bug proofCounts, equivalência em questões, ROI e inventário base', () => {
  // 1) Soma dos blocos de cada banca fecha exatamente a escala máxima (100 / 10 / 100)
  for (const bankId of ['usp_sp', 'usp_rp', 'unicamp'] as const) {
    const cfg = CURRICULUM_BANKS_CONFIG[bankId];
    const sumBlocks = Math.round(cfg.blocks.reduce((acc, b) => acc + b.maxPoints, 0) * 100) / 100;
    assert.equal(sumBlocks, cfg.escalaMax, `Blocos de ${bankId} devem somar ${cfg.escalaMax} (obtido: ${sumBlocks})`);
  }

  // 2) Inventário base do Wagner: 12 itens preenchidos, 3 já com PDF pronto (SIICUSP, 2 eventos, Construindo Pontes 240h)
  const ev = computeUnifiedCurriculumScores(WAGNER_BASELINE_CURRICULUM_ENTRIES, { enamedConcept: 5 });
  assert.equal(ev.proofCounts.filledItems, 12);
  assert.equal(ev.proofCounts.pdf_pronto, 3);
  assert.equal(ev.proofCounts.em_andamento, 3);
  assert.equal(ev.proofCounts.falta, 6);
  assert.equal(
    ev.proofCounts.pdf_pronto + ev.proofCounts.em_andamento + ev.proofCounts.falta,
    ev.proofCounts.filledItems,
    'Itens com value = 0 não devem inflar a contagem de pendências de PDF'
  );

  // 3) USP-SP 2027: IC 2 anos c/ bolsa (4) + 1 artigo vinculado (+4 = 8) + 1 artigo PubMed livre (10)
  //    + Pós(15) + HU(12) + SUS(8) + 2 eventos(4) + SIICUSP(1) + Extensão 240h(5) + Psicologia(1) + Natação 1,5a(1)
  //    = 65 bruto × 1,2 (ENAMED 5) = 78,0/100; e somente os 3 itens PDF pronto (4+1+5 = 10 × 1,2 = 12,0)
  assert.equal(ev.banks.usp_sp.rawSubtotal, 65);
  assert.equal(ev.banks.usp_sp.finalScore, 78);
  assert.equal(ev.banks.usp_sp.confirmedScore, 12);
  assert.equal(ev.banks.usp_sp.unconfirmedGap, 66);
  assert.ok(ev.banks.usp_sp.equivalentFirstPhaseQuestions > 2.5 && ev.banks.usp_sp.equivalentFirstPhaseQuestions < 3.5);

  // Não-duplicação USP-SP Item 5 vs Item 6: se tiver apenas 1 artigo PubMed e marcar como vinculado à IC,
  // esse artigo não pode pontuar novamente no Item 6
  const singleArticleIc = computeUnifiedCurriculumScores(
    {
      ic_com_bolsa: { value: 1, proofStatus: 'pdf_pronto' },
      ic_artigo_vinculado: { value: 1, proofStatus: 'pdf_pronto' },
      artigo_pubmed: { value: 1, proofStatus: 'pdf_pronto' },
    },
    { enamedConcept: 3 }
  );
  assert.equal(singleArticleIc.itemPointsByBank.ic_artigo_vinculado.usp_sp, 4);
  assert.equal(singleArticleIc.itemPointsByBank.artigo_pubmed.usp_sp, 0);
  assert.equal(singleArticleIc.banks.usp_sp.finalScore, 6);

  // 4) USP-RP 2027: Histórico (HU 0,5 + Pós 0,5 + ENAMED 5 0,5 = 1,5), Assistencial (Liga 0,5 + Pontes 240h 1,0 = 1,5),
  //    Científico (IC 1,4 + 2 artigos 2,0 + SIICUSP 0,1 = 3,5 -> teto 3,0), Ensino (2 eventos = 0,6), Estudantil (0) -> 6,6/10
  assert.equal(ev.banks.usp_rp.enamedBonusPoints, 0.5);
  assert.equal(ev.banks.usp_rp.finalScore, 6.6);
  assert.equal(ev.banks.usp_rp.confirmedScore, 1.7);
  // ENAMED 3 reduz bônus histórico USP-RP de 0,5 -> 0,3
  const evEnamed3 = computeUnifiedCurriculumScores(WAGNER_BASELINE_CURRICULUM_ENTRIES, { enamedConcept: 3 });
  assert.equal(evEnamed3.banks.usp_rp.enamedBonusPoints, 0.3);
  assert.equal(evEnamed3.banks.usp_rp.finalScore, 6.4);

  // 5) UNICAMP 2027: Pós(15) + HU(10) + IC(20) + Artigos(15) + SIICUSP 5b(2) + Liga Dir(5) + Pontes(5) + Natação(1) = 73/100
  assert.equal(ev.banks.unicamp.finalScore, 73);
  assert.equal(ev.banks.unicamp.confirmedScore, 7);

  // 6) ROI respeita tetos: como bloco Científico da USP-RP já está no teto 3,0/3,0,
  //    nenhuma oportunidade científica deve reportar delta positivo na USP-RP
  const roi = computeCurriculumRoiOpportunities(WAGNER_BASELINE_CURRICULUM_ENTRIES, {
    enamedConcept: 5,
    limit: 5,
  });
  assert.ok(roi.length >= 3, 'Deve retornar alavancas reais de ROI');
  for (const opp of roi) {
    assert.ok(opp.combinedFinalPtsDelta > 0);
    if (opp.itemId === 'congresso_oral' || opp.itemId === 'congresso_poster') {
      assert.equal(opp.deltaByBank.usp_rp, 0, 'Bloco científico USP-RP já está no teto 3,0');
    }
  }

  // 7) Migração automática de chave legada (inst_docentes_cr -> inst_sus_rede) e persistência de sub-aba + inventário no store
  const migrated = migrateCentral6AnoState({
    curriculumEntries: {
      inst_docentes_cr: { value: 1, proofStatus: 'pdf_pronto', notes: 'Declaração antiga' },
    },
    r1SubTab: 'r1',
  });
  assert.equal(migrated.curriculumEntries?.inst_sus_rede?.value, 1);
  assert.equal(migrated.curriculumEntries?.inst_sus_rede?.proofStatus, 'pdf_pronto');
  assert.equal(migrated.r1SubTab, 'r1');

  cockpitStore.setCentral6AnoState(migrateCentral6AnoState({}));
  cockpitStore.setR1SubTab('r1');
  assert.equal(cockpitStore.getSnapshot().central6Ano.r1SubTab, 'r1');
  const applied = cockpitStore.applyBaselineCurriculumInventory('merge');
  assert.equal(applied.updatedCount, 12);
  assert.equal(cockpitStore.getSnapshot().central6Ano.curriculumEntries?.outra_graduacao_pos?.value, 1);
  assert.equal(cockpitStore.getSnapshot().central6Ano.curriculumEntries?.extensao_voluntariado?.value, 240);
});

test('Pré-Porta UX & Conteúdo: links seguros, LaTeX limpo em Técnica Completa, títulos compactos, busca de Intercorrências e Ponto Cego transparente', () => {
  // 1) Títulos compactos sem prefixo repetitivo e limpeza de backticks/emojis
  assert.equal(
    formatCompactProtocolTitle('Atendimento de Pronto Atendimento - Insuficiência Cardíaca Descompensada e EAP'),
    'Insuficiência Cardíaca Descompensada e EAP'
  );
  assert.equal(
    formatCompactProtocolTitle('Manejo de Emergência - Sepse e Choque Séptico (Pacote de 1 Hora)'),
    'Sepse e Choque Séptico (Pacote de 1 Hora)'
  );
  assert.equal(
    cleanHeadingText('Guia Profundo — `01_Anamnese_Estruturada`'),
    'Guia Profundo — 01_Anamnese_Estruturada'
  );

  // 2) Links Markdown seguros (https permitido, javascript: bloqueado)
  const linkHtml = formatInlineClinicalHtml(
    'Consulte [Diretriz ESC](https://esc.org/guide) e evite [XSS](javascript:alert(1)).'
  );
  assert.ok(
    linkHtml.includes('<a href="https://esc.org/guide" target="_blank" rel="noopener noreferrer" class="guia-link">Diretriz ESC</a>'),
    `Link HTTPS esperado:\n${linkHtml}`
  );
  assert.ok(!linkHtml.includes('href="javascript:'), 'URL javascript: não pode virar href clicável');

  // 3) Fórmulas LaTeX complexas (frações, raiz, blocos $$...$$, subscritos)
  const mathHtml = renderTeoriaMarkdownToHtml(
    'Fórmula de Winter: $$PaCO_2 = 1{,}5 \\times HCO_3^- + 8 \\pm 2$$ e QTc = $\\frac{QT}{\\sqrt{RR}}$.'
  );
  assert.ok(!mathHtml.includes('\\frac'), `Não deve sobrar \\frac bruto:\n${mathHtml}`);
  assert.ok(!mathHtml.includes('\\sqrt'), `Não deve sobrar \\sqrt bruto:\n${mathHtml}`);
  assert.ok(!mathHtml.includes('$$'), `Não deve sobrar $$ bruto:\n${mathHtml}`);
  assert.ok(mathHtml.includes('√(RR)'), `Raiz deve renderizar com √(...):\n${mathHtml}`);

  // 4) Varredura completa: zero links Markdown crus ou jargão de simulação nos 22 cartões Pré-Porta
  for (const hab of HAB_PROTOCOLS) {
    const parsed = parsePrePortaContent(hab.pre_porta || '');
    for (const chunk of [parsed.resumo30s, parsed.mnemonico, parsed.coreografia]) {
      assert.ok(!/simulação v3\.1/i.test(chunk), `${hab.id} não deve expor jargão interno de simulação`);
      const rendered = renderTeoriaMarkdownToHtml(chunk);
      assert.ok(
        !/\[[^\]]+\]\(https?:\/\//.test(rendered),
        `${hab.id} deixou link Markdown cru sem renderizar`
      );
    }
    for (const pit of hab.pitfalls || []) {
      const pitHtml = formatInlineClinicalHtml(`${pit.title} ${pit.detail}`);
      assert.ok(
        !/\[[^\]]+\]\(https?:\/\//.test(pitHtml),
        `${hab.id} deixou link Markdown cru em armadilhas`
      );
    }
  }

  // 5) Varredura completa de tecnica_profunda.generated.json: zero \frac, \sqrt ou $ residual
  const techPath = path.join(ROOT, 'src/data/tecnica_profunda.generated.json');
  const techData = JSON.parse(fs.readFileSync(techPath, 'utf8')) as {
    byHabId: Record<string, Array<{ title: string; sections: Array<{ heading: string; body: string }> }>>;
  };
  for (const [habId, guides] of Object.entries(techData.byHabId || {})) {
    for (const g of guides) {
      assert.ok(!cleanHeadingText(g.title).includes('`'), `Título limpo em ${habId} não deve conter backticks`);
      for (const sec of g.sections || []) {
        assert.ok(!cleanHeadingText(sec.heading).includes('`'), `Seção limpa em ${habId} não deve conter backticks`);
        const html = renderTeoriaMarkdownToHtml(sec.body || '');
        assert.ok(!html.includes('\\frac'), `${habId}/${sec.heading} ainda contém \\frac`);
        assert.ok(!html.includes('\\sqrt'), `${habId}/${sec.heading} ainda contém \\sqrt`);
        assert.ok(!/\$\$/.test(html), `${habId}/${sec.heading} ainda contém $$`);
      }
    }
  }

  // 6) Filtro das 6 Intercorrências de Madrugada: tolerante a acentos e sinônimos
  const disp = filterIntercorrencias(SEIS_INTERCORRENCIAS_DATA, 'dispnéia');
  assert.equal(disp.visibleInSidebar, true);
  assert.ok(disp.items.some((c) => c.num === '2'), 'Busca acentuada "dispnéia" deve encontrar card 2');

  const olig = filterIntercorrencias(SEIS_INTERCORRENCIAS_DATA, 'oligúria');
  assert.equal(olig.visibleInSidebar, true);
  assert.ok(olig.items.some((c) => c.num === '4'), 'Busca "oligúria" deve encontrar card 4');

  const none = filterIntercorrencias(SEIS_INTERCORRENCIAS_DATA, 'zzzznaoexiste');
  assert.equal(none.visibleInSidebar, false);
  assert.equal(none.items.length, 0);

  // 7) Nota transparente de Ponto Cego (lista até 6 e indica excedente)
  const note = buildPendingPontoCegoNote(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.ok(note.includes('A; B; C; D; E; F'));
  assert.ok(note.includes('(+2 outros)'), `Esperado indicador transparente de excedente:\n${note}`);

  // 8) Ctrl+K encontra 6 Intercorrências de Madrugada preservando ALL_PROTOCOLS.length === 110
  assert.equal(ALL_PROTOCOLS.length, 110);
  const madResults = searchClinicalProtocols(COMMAND_PALETTE_SEARCH_INDEX, COMMAND_PALETTE_ITEMS, 'madrugada', 5);
  assert.ok(
    madResults.some((r) => r.item.id === INTERCORRENCIAS_HAB_ID),
    'Busca Ctrl+K por "madrugada" deve retornar Guia das 6 Intercorrências'
  );
  const oligResults = searchClinicalProtocols(COMMAND_PALETTE_SEARCH_INDEX, COMMAND_PALETTE_ITEMS, 'oliguria', 5);
  assert.ok(
    oligResults.some((r) => r.item.id === INTERCORRENCIAS_HAB_ID),
    'Busca Ctrl+K por "oliguria" deve retornar Guia das 6 Intercorrências'
  );
});

test('Regressões Protocolos (P0/P1/P2): Amoxicilina intacta + mL dinâmico, Auditoria Ibuprofeno/TFGe/Dose diária, Condicionais OFF, Sync Alergias/Idade e Exclusão 1-clique', async () => {
  clearPepAstCache();
  const { auditProtocolPrescription, getSubcategoryLabel } = await import('../src/data/protocolsRepo.ts');
  const { parseEstimatedDailyDoseMg } = await import('../src/engine/prescriptionGuard.ts');

  // 1) ped-81 (OMA) e ped-82 (PAC Ped): barras de unidade "mg / 5 mL" NÃO quebram opções; ped-76 "[3 mL / 5 mL / 10 mL]" segue com 3 opções
  const ped81 = PEP_PROTOCOLS.find((p) => p.id === 'ped-81')!;
  const ped82 = PEP_PROTOCOLS.find((p) => p.id === 'ped-82')!;
  const ped76 = PEP_PROTOCOLS.find((p) => p.id === 'ped-76')!;
  assert.ok(ped81 && ped82 && ped76);

  const comp81 = compileProtocolForDisplay(ped81, { ...EMPTY_PATIENT_CONTEXT, pesoKg: '14', idade: '3a' });
  const amoxiGroup81 = comp81.ast.blocks
    .flatMap((b) => b.children)
    .find((n) => n.kind === 'choice-group' && n.options.some((o) => /Amoxicilina/i.test(o.rawText)));
  assert.ok(amoxiGroup81 && amoxiGroup81.kind === 'choice-group');
  assert.equal(amoxiGroup81.options.length, 3, 'ped-81 deve ter 3 apresentações intactas de Amoxicilina');
  assert.ok(
    amoxiGroup81.options.every((o) => !/^\s*5\s*mL/i.test(o.rawText)),
    'Nenhuma opção pode começar quebrada em "5 mL"'
  );

  const comp82 = compileProtocolForDisplay(ped82, { ...EMPTY_PATIENT_CONTEXT, pesoKg: '14', idade: '3a' });
  const amoxiGroup82 = comp82.ast.blocks
    .flatMap((b) => b.children)
    .find((n) => n.kind === 'choice-group' && n.options.some((o) => /Amoxicilina/i.test(o.rawText)));
  assert.ok(amoxiGroup82 && amoxiGroup82.kind === 'choice-group');
  assert.equal(amoxiGroup82.options.length, 2, 'ped-82 deve ter 2 apresentações intactas de Amoxicilina');

  const comp76 = compileProtocolForDisplay(ped76, EMPTY_PATIENT_CONTEXT);
  const mlGroup76 = comp76.ast.blocks
    .flatMap((b) => b.children)
    .find((n) => n.kind === 'choice-group' && n.options.some((o) => /3\s*mL/i.test(o.rawText)));
  assert.ok(mlGroup76 && mlGroup76.kind === 'choice-group');
  assert.equal(mlGroup76.options.length, 3, 'ped-76 [3 mL / 5 mL / 10 mL] deve permanecer com 3 opções');

  // 2) ped-81 OMA (14 kg): cálculo dinâmico de mL conforme apresentação + dose + intervalo
  const rec81 = comp81.sections.find((s) => s.id === 'receita')!;
  const rec81Nodes = rec81.blockIndices.flatMap((bi) => comp81.ast.blocks[bi].children);
  const amoxiRec81 = rec81Nodes.find(
    (n) => n.kind === 'choice-group' && n.options.some((o) => /Amoxicilina/i.test(o.rawText))
  );
  assert.ok(amoxiRec81 && amoxiRec81.kind === 'choice-group');
  assert.equal(amoxiRec81.options.length, 3, 'Receita ped-81 deve ter 3 apresentações intactas de Amoxicilina');

  const text81Default = serializeProtocolSection(comp81.ast, comp81.initialAstState, comp81.clinicalContext, rec81);
  assert.ok(text81Default.includes('4,4 mL'), `400 mg/5 mL + 50 mg/kg/dia + 12/12h em 14 kg deve dar 4,4 mL:\n${text81Default}`);
  assert.ok(!text81Default.includes(', nos horários,'), 'Erro de concordância ", nos horários," deve estar corrigido');

  // Trocar dose de 50 -> 90 mg/kg/dia: 14 * 90 / 2 / 80 = 7,9 mL
  const doseGroup81 = rec81Nodes.find(
    (n) => n.kind === 'choice-group' && n.options.some((o) => /90/.test(o.rawText))
  );
  assert.ok(doseGroup81 && doseGroup81.kind === 'choice-group');
  const idx90 = doseGroup81.options.findIndex((o) => /90/.test(o.rawText));
  const state90 = applyPatientContextToAstState(
    comp81.ast,
    {
      ...comp81.initialAstState,
      choiceSelections: { ...comp81.initialAstState.choiceSelections, [doseGroup81.id]: [idx90] },
      userEditedNodes: { ...comp81.initialAstState.userEditedNodes, [doseGroup81.id]: true },
    },
    comp81.clinicalContext
  );
  const text81Dose90 = serializeProtocolSection(comp81.ast, state90, comp81.clinicalContext, rec81);
  assert.ok(text81Dose90.includes('7,9 mL'), `400 mg/5 mL + 90 mg/kg/dia + 12/12h em 14 kg deve dar 7,9 mL:\n${text81Dose90}`);

  // Trocar apresentação para 250 mg/5 mL + intervalo 8 em 8 + dose 50: 14 * 50 / 3 / 50 = 4,7 mL
  const idx250 = amoxiRec81.options.findIndex((o) => /250/.test(o.rawText));
  const intervalGroup81 = rec81Nodes.find(
    (n) => n.kind === 'choice-group' && n.options.some((o) => /8 em 8/.test(o.rawText))
  );
  assert.ok(intervalGroup81 && intervalGroup81.kind === 'choice-group');
  const idx8h = intervalGroup81.options.findIndex((o) => /8 em 8/.test(o.rawText));
  const state250 = applyPatientContextToAstState(
    comp81.ast,
    {
      ...comp81.initialAstState,
      choiceSelections: {
        ...comp81.initialAstState.choiceSelections,
        [amoxiRec81.id]: [idx250],
        [intervalGroup81.id]: [idx8h],
      },
      userEditedNodes: {
        ...comp81.initialAstState.userEditedNodes,
        [amoxiRec81.id]: true,
        [intervalGroup81.id]: true,
      },
    },
    comp81.clinicalContext
  );
  const text81Conc250 = serializeProtocolSection(comp81.ast, state250, comp81.clinicalContext, rec81);
  assert.ok(text81Conc250.includes('4,7 mL'), `250 mg/5 mL + 50 mg/kg/dia + 8/8h em 14 kg deve dar 4,7 mL:\n${text81Conc250}`);

  // 3) Sincronização de idade pediátrica ("3a" -> "3" + "anos"; "8m" -> "8" + "meses")
  const evol81 = comp81.sections.find((s) => s.id === 'evolucao')!;
  const evolText3a = serializeProtocolSection(comp81.ast, comp81.initialAstState, comp81.clinicalContext, evol81);
  assert.ok(evolText3a.includes('3 anos'), `Idade "3a" deve sincronizar para "3 anos":\n${evolText3a}`);
  const comp81Infant = compileProtocolForDisplay(ped81, { ...EMPTY_PATIENT_CONTEXT, pesoKg: '8', idade: '8m' });
  const evolText8m = serializeProtocolSection(comp81Infant.ast, comp81Infant.initialAstState, comp81Infant.clinicalContext, comp81Infant.sections.find((s) => s.id === 'evolucao')!);
  assert.ok(evolText8m.includes('8 meses'), `Idade "8m" deve sincronizar para "8 meses":\n${evolText8m}`);

  // 4) Dose diária "700 mg/dia" não pode ser multiplicada por frequência (zero falso positivo de superdose)
  const parsedDaily = parseEstimatedDailyDoseMg('Amoxicilina 50 mg/kg/dia (700 mg/dia (233 mg/tomada)) 8/8h');
  assert.equal(parsedDaily.dailyDoseMg, 700, '700 mg/dia já é dose diária total e não deve virar 2100 mg/dia');

  // 5) go-1 (Puerpério): Ibuprofeno auditado em TFGe < 30 (com vírgula pt-BR) e alergia a AINE + aviso interno omitido na cópia + condicionais OFF + sync de alergia + exclusão 1-clique
  const go1 = PEP_PROTOCOLS.find((p) => p.id === 'go-1')!;
  const compGo1Renal = compileProtocolForDisplay(go1, {
    ...EMPTY_PATIENT_CONTEXT,
    idade: '30',
    creatinina: '3,2',
    sexo: 'F',
    alergias: 'dipirona, aine',
  });
  const recGo1 = compGo1Renal.sections.find((s) => s.id === 'receita')!;
  const condGo1 = compGo1Renal.sections.find((s) => s.id === 'conduta')!;
  const evolGo1 = compGo1Renal.sections.find((s) => s.id === 'evolucao')!;

  const recTextGo1 = serializeProtocolSection(compGo1Renal.ast, compGo1Renal.initialAstState, compGo1Renal.clinicalContext, recGo1);
  assert.ok(!recTextGo1.includes('[NÃO PRESCREVER SE HIPERTENSA'), 'Aviso interno [NÃO PRESCREVER...] deve ser omitido na prescrição copiada');
  assert.ok(!recTextGo1.includes('Desogestrel'), '[Opcional - Contracepção] deve iniciar desligado por padrão');

  const condTextGo1 = serializeProtocolSection(compGo1Renal.ast, compGo1Renal.initialAstState, compGo1Renal.clinicalContext, condGo1);
  assert.ok(!condTextGo1.includes('Imunoglobulina Anti-D'), 'Condicional [Se mãe Rh negativo...] deve iniciar desligado');
  assert.ok(!condTextGo1.includes('Enoxaparina'), 'Condicional [Se alto risco para TEV...] deve iniciar desligado');

  const evolTextGo1 = serializeProtocolSection(compGo1Renal.ast, compGo1Renal.initialAstState, compGo1Renal.clinicalContext, evolGo1);
  assert.ok(/dipirona,\s*aine/i.test(evolTextGo1), `Alergias da faixa do paciente devem espelhar na Evolução:\n${evolTextGo1}`);

  const auditGo1 = auditProtocolPrescription(go1, { receita: recTextGo1 }, compGo1Renal.clinicalContext);
  assert.ok(
    auditGo1.receita?.alerts.some((a) => a.category === 'renal' && /Ibuprofeno/i.test(a.title) && a.title.includes(',')),
    `Ibuprofeno deve disparar bloqueio renal com TFG em vírgula pt-BR: ${JSON.stringify(auditGo1.receita?.alerts)}`
  );
  assert.ok(
    auditGo1.receita?.alerts.some((a) => a.category === 'allergy' && /Ibuprofeno/i.test(a.title)),
    'Ibuprofeno deve disparar bloqueio de alergia a AINE'
  );
  assert.ok(
    auditGo1.receita?.alerts.some((a) => a.category === 'allergy' && /Dipirona/i.test(a.title)),
    'Dipirona deve disparar bloqueio de alergia a Dipirona'
  );

  // 6) Exclusão 1-clique (excludedBlocks): retirar Dipirona e Ibuprofeno renumera restantes e zera alertas!
  const excludedBlocks: Record<string, boolean> = {};
  for (const bi of recGo1.blockIndices) {
    const blk = compGo1Renal.ast.blocks[bi];
    if (blk.kind === 'paragraph' && /^\s*\d+[.)]\s+/.test(blk.rawLine) && /Dipirona|Ibuprofeno/i.test(blk.rawLine)) {
      excludedBlocks[blk.id] = true;
    }
  }
  assert.equal(Object.keys(excludedBlocks).length, 2, 'Deve encontrar Dipirona e Ibuprofeno para exclusão');
  const stateAfterExclude = { ...compGo1Renal.initialAstState, excludedBlocks };
  const recTextAfterExclude = serializeProtocolSection(compGo1Renal.ast, stateAfterExclude, compGo1Renal.clinicalContext, recGo1);
  assert.ok(!/Dipirona/i.test(recTextAfterExclude) && !/Ibuprofeno/i.test(recTextAfterExclude));
  assert.ok(recTextAfterExclude.includes('1. Sulfato Ferroso'), `Sulfato Ferroso deve ser renumerado para 1.:\n${recTextAfterExclude}`);
  const auditAfterExclude = auditProtocolPrescription(go1, { receita: recTextAfterExclude }, compGo1Renal.clinicalContext);
  assert.equal(auditAfterExclude.receita?.blockCount ?? 0, 0, 'Após excluir fármacos com bloqueio, auditoria deve zerar');

  // 7) Formatação acentuada de subcategorias compartilhada (Command Palette + Protocolos)
  assert.equal(getSubcategoryLabel('Cardiovascular e Respiratorio'), 'Cardiovascular e Respiratório');
  assert.equal(getSubcategoryLabel('Emergencias GO'), 'Emergências em GO');
});

