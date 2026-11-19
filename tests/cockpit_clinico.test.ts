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
} from '../src/engine/diretrizes.ts';
import {
  RODIZIOS_6ANO,
  LOGBOOK_PROCEDIMENTOS_MATRIX,
  UNIFIED_CURRICULUM_CATALOG,
  CURRICULUM_BANKS_CONFIG,
  FORMACAO_TEORICA_MODULOS,
  registerProcedureExecution,
  recordPrePortaExecution,
  buildContextualAiPrompt,
  computeMilestoneCountdown,
  computeUnifiedCurriculumScores,
  migrateCentral6AnoState,
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
} from '../src/data/protocolsRepo.ts';
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

  // Observou registra histórico sem inflar Regra 3x
  cockpitStore.recordMatrixProcedure(firstProc.id, 'observou');
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id] || 0, 0);

  // Auxiliou, Supervisionado e Autônomo completam Regra 3x (3/3)
  cockpitStore.recordMatrixProcedure(firstProc.id, 'auxiliei');
  cockpitStore.recordMatrixProcedure(firstProc.id, 'supervisionado');
  cockpitStore.recordMatrixProcedure(firstProc.id, 'autonomo');
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id], 3);

  // Remover uma execução ativa decrementa com segurança
  const latestExec = (cockpitStore.getSnapshot().central6Ano.logbookEntries || []).find(
    (e) => e.tipo === 'procedimento' && e.papel === 'Autônomo'
  );
  assert.ok(latestExec);
  cockpitStore.deleteLogbookEntry(latestExec.id);
  assert.equal(cockpitStore.getSnapshot().central6Ano.procCountsById?.[firstProc.id], 2);

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
  assert.equal(after.procCountsById?.[firstProc.id], 2);
  assert.equal(after.curriculumEntries?.[catItem.id]?.proofStatus, 'pdf_pronto');
  assert.equal(after.curriculumEnamedConcept, 5);
  assert.ok((after.r1Milestones || []).some((m) => m.id === addedMs.id));

  // Remover prazo adicionado
  cockpitStore.deleteR1Milestone(addedMs.id);
  assert.ok(!(cockpitStore.getSnapshot().central6Ano.r1Milestones || []).some((m) => m.id === addedMs.id));
});
