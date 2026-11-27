import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FERIAS_CALENDARIO,
  QUEIXAS_E1,
  ARQUETIPOS_E3,
  CENARIOS_E4,
  type TreinoClinicoState,
  type TreinoLogEntry,
} from '../src/data/treino_clinico_data.ts';
import {
  applyNppTextEdit,
  buildPromptA,
  buildPromptD1,
  buildPromptD2,
  canDeleteLogEntry,
  computeContingencia10Jan,
  computeDominioE1,
  computeTreinoMetrics,
  computeVeredito,
  createInitialTreinoClinicoState,
  formatLogLine,
  formatLogMarkdown,
  formatNaoPodePassarMarkdown,
  guiaTeoricoDaSemana,
  isSaidaAntecipadaS7,
  LOG_RE,
  mecanismosUsadosDe,
  migrateTreinoClinicoState,
  normalizeMecanismo,
  parseLogLineFromGemini,
  proximosPassos,
  recomendarGuiasPorGargalo,
  validateLogEntry,
  validateNppAdd,
  validateNppCheck,
} from '../src/engine/treinoClinico.ts';
import { migrateCentral6AnoState, FORMACAO_TEORICA_MODULOS } from '../src/engine/central6ano.ts';
import { renderTeoriaMarkdownToHtml } from '../src/engine/diretrizes.ts';

let seqId = 1;
function makeLog(partial: Partial<TreinoLogEntry> & Pick<TreinoLogEntry, 'dateIso' | 'tipo' | 'slug'>): TreinoLogEntry {
  const idNum = seqId++;
  const hh = String(Math.floor(idNum / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor(idNum / 60) % 60).padStart(2, '0');
  const ss = String(idNum % 60).padStart(2, '0');
  const base: TreinoLogEntry = {
    id: `log-${idNum}`,
    criadoEm: `${partial.dateIso}T${hh}:${mm}:${ss}.000Z`,
    dateIso: partial.dateIso,
    tipo: partial.tipo,
    slug: partial.slug,
    mecanismo: partial.tipo === 'Nova' || partial.tipo === 'Var' ? (partial.mecanismo ?? `mec-${seqId}`) : null,
    ambiente:
      partial.tipo === 'E3'
        ? (partial.ambiente ?? 'UPA com retaguarda')
        : partial.tipo === 'E4'
          ? (partial.ambiente ?? 'UPA com sala vermelha')
          : null,
    rodizioId: partial.rodizioId ?? null,
    min: partial.min !== undefined ? partial.min : 20,
    h3Bloco:
      partial.h3Bloco !== undefined
        ? partial.h3Bloco
        : partial.tipo === 'Nova' || partial.tipo === 'Var' || partial.tipo === 'BASELINE'
          ? 'S'
          : 'NA',
    pemc:
      partial.pemc ??
      (partial.tipo === 'GRAVAÇÃO'
        ? { kind: 'NA' }
        : partial.tipo === 'BASELINE' && partial.baselineFase === 'A'
          ? { kind: 'baselineSN', valor: 'N' }
          : { kind: 'nenhuma' }),
    score:
      partial.score ??
      (partial.tipo === 'Micro' || partial.tipo === 'SERVIÇO'
        ? { kind: 'NA' }
        : partial.tipo === 'GRAVAÇÃO'
          ? { kind: 'muletas', contagem: 2, ajuste: 'pausa limpa' }
          : { kind: 'rubrica', valor: 4, ajuste: 'ok' }),
    iaPista:
      partial.iaPista !== undefined
        ? partial.iaPista
        : partial.tipo === 'Micro' || partial.tipo === 'SERVIÇO' || partial.tipo === 'GRAVAÇÃO'
          ? null
          : false,
    veredito: 'NA',
    baselineFase: partial.baselineFase ?? null,
    avaliavel: partial.avaliavel ?? true,
    erroCritico: partial.erroCritico ?? false,
    refacaoIntegralPendente: partial.refacaoIntegralPendente ?? false,
    atritoE2: partial.atritoE2 ?? null,
    servicoResultado: partial.servicoResultado ?? null,
    linhaEm2min: partial.linhaEm2min ?? true,
    vereditoIA: partial.vereditoIA ?? null,
  };
  base.veredito = computeVeredito(base);
  return base;
}

test('1. Totais nominais (piloto + férias + 24/jan) fecham 19 A + 2 reserva + 2 baseline, 20 D1, 7 B, 7 C, 4 visuais', () => {
  assert.equal(QUEIXAS_E1.length, 20);
  assert.equal(ARQUETIPOS_E3.length, 8);
  assert.equal(CENARIOS_E4.length, 7);

  const state: TreinoClinicoState = createInitialTreinoClinicoState();
  // Piloto: P1, P2, P3, P4, P5
  state.logs.push(makeLog({ dateIso: '2026-11-21', tipo: 'Nova', slug: 'dor-toracica', mecanismo: 'iamcsst', min: 28 }));
  state.logs.push(makeLog({ dateIso: '2026-11-24', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'tep', min: 11 }));
  state.logs.push(makeLog({ dateIso: '2026-11-24', tipo: 'Nova', slug: 'dor-abdominal', mecanismo: 'apendicite', min: 28 }));
  state.logs.push(makeLog({ dateIso: '2026-11-27', tipo: 'E4', slug: 'e4-deterioracao-silenciosa', min: 25 }));
  state.logs.push(makeLog({ dateIso: '2026-11-28', tipo: 'E3', slug: 'e3-atb-empirico', min: 35 }));
  state.logs.push(makeLog({ dateIso: '2026-11-29', tipo: 'BASELINE', slug: 'sensorio-focal-glicemia', baselineFase: 'A', min: 25 }));
  state.piloto.auditoriaEm = '2026-11-29';

  let countA1a = 2; // dor-toracica, dor-abdominal
  let countD1 = 1;
  let countB = 1;
  let countC = 1;
  let countVisuais = 0;

  for (const dia of FERIAS_CALENDARIO) {
    const passos = proximosPassos(dia.dateIso, state);
    for (const p of passos) {
      if (p.kind === 'sessao') {
        if (p.prompt === 'D1') {
          countD1 += 1;
          state.logs.push(makeLog({ dateIso: dia.dateIso, tipo: 'Var', slug: p.slug, min: 11 }));
          if (p.visual) {
            state.visual[p.slug] = { feitoEm: dia.dateIso };
            countVisuais += 1;
          }
        } else if (p.prompt === 'A' && p.tipoLog === 'Nova') {
          if (p.origem === 'fila_primeira_passada') countA1a += 1;
          state.logs.push(makeLog({ dateIso: dia.dateIso, tipo: 'Nova', slug: p.slug, min: 28 }));
          if (p.visual) {
            state.visual[p.slug] = { feitoEm: dia.dateIso };
            countVisuais += 1;
          }
        } else if (p.prompt === 'A' && p.tipoLog === 'BASELINE') {
          state.logs.push(
            makeLog({ dateIso: dia.dateIso, tipo: 'BASELINE', slug: p.slug, baselineFase: p.baseline || 'B', min: 28 })
          );
        } else if (p.prompt === 'B') {
          countB += 1;
          state.logs.push(makeLog({ dateIso: dia.dateIso, tipo: 'E3', slug: p.slug, ambiente: p.ambiente, min: 35 }));
        } else if (p.prompt === 'C') {
          countC += 1;
          state.logs.push(makeLog({ dateIso: dia.dateIso, tipo: 'E4', slug: p.slug, ambiente: p.ambiente, min: 25 }));
        }
      }
    }
  }

  assert.equal(countA1a, 19);
  assert.equal(countD1, 20);
  assert.equal(countB, 7);
  assert.equal(countC, 7);
  assert.equal(countVisuais, 4);
  assert.equal(state.logs.filter((l) => l.tipo === 'BASELINE').length, 2);
});

test('2. Dia perdido em S2 desloca fila e R1 absorve sem perder nenhum slug #3–#19', () => {
  const state = createInitialTreinoClinicoState();
  state.logs.push(makeLog({ dateIso: '2026-11-21', tipo: 'Nova', slug: 'dor-toracica', mecanismo: 'iamcsst' }));
  state.logs.push(makeLog({ dateIso: '2026-11-24', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'tep' }));
  state.logs.push(makeLog({ dateIso: '2026-11-24', tipo: 'Nova', slug: 'dor-abdominal', mecanismo: 'apendicite' }));
  state.logs.push(makeLog({ dateIso: '2026-11-29', tipo: 'BASELINE', slug: 'sensorio-focal-glicemia', baselineFase: 'A' }));

  for (const dia of FERIAS_CALENDARIO) {
    if (dia.dateIso === '2026-12-08') continue; // Dia perdido em S2
    const passos = proximosPassos(dia.dateIso, state);
    for (const p of passos) {
      if (p.kind === 'sessao' && p.prompt === 'A' && p.tipoLog === 'Nova') {
        state.logs.push(makeLog({ dateIso: dia.dateIso, tipo: 'Nova', slug: p.slug }));
      } else if (p.kind === 'sessao' && p.prompt === 'D1') {
        state.logs.push(makeLog({ dateIso: dia.dateIso, tipo: 'Var', slug: p.slug }));
      }
    }
  }

  for (let num = 1; num <= 19; num += 1) {
    const q = QUEIXAS_E1[num - 1];
    assert.ok(
      state.logs.some((l) => l.tipo === 'Nova' && l.slug === q.slug),
      `Slug ${q.slug} não deveria sumir após dia perdido`
    );
  }
});

test('3. Contingência 10/jan: den=0 dispara, 79/100 dispara, 80/100 não, congela em 18/jan e saída antecipada janela10 >= 8', () => {
  const empty = createInitialTreinoClinicoState();
  assert.equal(computeContingencia10Jan(empty, '2027-01-10').disparou, true);

  const st79 = createInitialTreinoClinicoState();
  for (let i = 0; i < 100; i += 1) {
    st79.logs.push(
      makeLog({
        dateIso: '2026-12-10',
        tipo: 'Var',
        slug: i % 2 === 0 ? 'dor-toracica' : 'dor-abdominal',
        h3Bloco: i < 79 ? 'S' : 'N',
      })
    );
  }
  assert.equal(computeContingencia10Jan(st79, '2027-01-10').disparou, true);

  const st80 = createInitialTreinoClinicoState();
  for (let i = 0; i < 100; i += 1) {
    st80.logs.push(
      makeLog({
        dateIso: '2026-12-10',
        tipo: 'Var',
        slug: 'dor-toracica',
        h3Bloco: i < 80 ? 'S' : 'N',
      })
    );
  }
  assert.equal(computeContingencia10Jan(st80, '2027-01-10').disparou, false);

  // Snapshot congela em 18/jan
  st79.contingencia10jan = { num: 79, den: 100, disparou: true, calculadoEm: '2027-01-10' };
  const s7Passos = proximosPassos('2027-01-18', st79);
  const d1s = s7Passos.filter((p) => p.kind === 'sessao' && p.prompt === 'D1');
  assert.equal(d1s.length, 2);
  assert.equal(d1s[0].kind === 'sessao' && d1s[0].pausaSilenciosa10s, true);

  // Saída antecipada: últimas 10 linhas avaliáveis com >= 8 S
  for (let i = 0; i < 8; i += 1) {
    st79.logs.push(makeLog({ dateIso: '2027-01-18', tipo: 'Var', slug: 'dor-abdominal', h3Bloco: 'S' }));
  }
  assert.equal(isSaidaAntecipadaS7(st79.logs), true);
});

test('4. Domínio E1: dias distintos, IA_Pista ignorada, Var->Nova não domina, Repetir rebaixa e mecanismo repetido sai', () => {
  // Mesmo dia ≠ dominada
  const sameDay = [
    makeLog({ dateIso: '2026-11-21', tipo: 'Nova', slug: 'dor-toracica', mecanismo: 'iam' }),
    makeLog({ dateIso: '2026-11-21', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'tep' }),
  ];
  assert.equal(computeDominioE1('dor-toracica', sameDay, '2026-11-25').dominada, false);

  // Nova L -> [Var iaPista=S] -> Var L (dias distintos) = dominada
  const withPista = [
    makeLog({ dateIso: '2026-11-21', tipo: 'Nova', slug: 'dor-toracica', mecanismo: 'iam' }),
    makeLog({ dateIso: '2026-11-22', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'disseccao', iaPista: true }),
    makeLog({ dateIso: '2026-11-24', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'tep' }),
  ];
  assert.equal(computeDominioE1('dor-toracica', withPista, '2026-11-25').dominada, true);
  assert.deepEqual(mecanismosUsadosDe('dor-toracica', withPista), ['iam', 'disseccao', 'tep']);

  // Var L -> Nova L ≠ dominada
  const varThenNova = [
    makeLog({ dateIso: '2026-11-21', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'tep' }),
    makeLog({ dateIso: '2026-11-24', tipo: 'Nova', slug: 'dor-toracica', mecanismo: 'iam' }),
  ];
  assert.equal(computeDominioE1('dor-toracica', varThenNova, '2026-11-25').dominada, false);

  // Repetir após par rebaixa
  const rebaixada = [
    ...withPista,
    makeLog({ dateIso: '2026-12-01', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'pericardite', h3Bloco: 'N' }),
  ];
  assert.equal(computeDominioE1('dor-toracica', rebaixada, '2026-12-02').dominada, false);

  // Mecanismo repetido sai da sequência
  const mecRepetido = [
    makeLog({ dateIso: '2026-11-21', tipo: 'Nova', slug: 'dor-toracica', mecanismo: 'iam' }),
    makeLog({ dateIso: '2026-11-24', tipo: 'Var', slug: 'dor-toracica', mecanismo: 'iam' }),
  ];
  assert.equal(computeDominioE1('dor-toracica', mecRepetido, '2026-11-25').dominada, false);
});

test('5. E3 score 4 + erroCritico rejeitado; score 3 + erroCritico = Repetir', () => {
  const bad = makeLog({
    dateIso: '2026-11-28',
    tipo: 'E3',
    slug: 'e3-atb-empirico',
    score: { kind: 'rubrica', valor: 4, ajuste: 'ok' },
    erroCritico: true,
  });
  const res = validateLogEntry(bad, []);
  assert.equal(res.ok, false);
  assert.equal(res.errorCode, 'SCORE_4_COM_ERRO_CRITICO');

  const rep = makeLog({
    dateIso: '2026-11-28',
    tipo: 'E3',
    slug: 'e3-atb-empirico',
    score: { kind: 'rubrica', valor: 3, ajuste: 'ajustar dose' },
    erroCritico: true,
  });
  assert.equal(validateLogEntry(rep, []).ok, true);
  assert.equal(rep.veredito, 'Repetir');
});

test('6 & 7. NPP: BASELINE rejeitado, limite 6, fonte proibida (AMBOSS/Claude/Novo-PEP) rejeitada, edição reseta [CHECAR]', () => {
  const baseA = makeLog({
    dateIso: '2026-11-29',
    tipo: 'BASELINE',
    slug: 'sensorio-focal-glicemia',
    baselineFase: 'A',
    pemc: { kind: 'baselineSN', valor: 'S' },
  });
  const resBase = validateNppAdd(
    [{ slug: 'sensorio-focal-glicemia', texto: 'Glicemia capilar imediata', origemLogId: baseA.id }],
    [],
    [baseA]
  );
  assert.equal(resBase.ok, false);
  assert.equal(resBase.errorCode, 'NPP_ORIGEM_INVALIDA');

  const novaPemc = makeLog({
    dateIso: '2026-11-21',
    tipo: 'Nova',
    slug: 'dor-toracica',
    mecanismo: 'iam',
    pemc: { kind: 'omissao', texto: 'Não perguntou sobre dissecção' },
  });
  const existing6 = Array.from({ length: 6 }, (_, i) => ({
    id: `npp-${i}`,
    slug: 'dor-toracica',
    texto: `Item ${i + 1}`,
    checado: false,
    origemLogId: novaPemc.id,
    criadoEm: '2026-11-21T12:00:00Z',
  }));
  const res7 = validateNppAdd(
    [{ slug: 'dor-toracica', texto: '7º item', origemLogId: novaPemc.id }],
    existing6,
    [novaPemc]
  );
  assert.equal(res7.ok, false);
  assert.equal(res7.errorCode, 'NPP_LIMITE_6');

  assert.equal(
    validateNppCheck({ fonteTipo: 'diretriz', fontePrimaria: 'AMBOSS Dor Torácica 2026', checadoEm: '2026-11-22' }).ok,
    false
  );
  assert.equal(
    validateNppCheck({ fonteTipo: 'diretriz', fontePrimaria: 'Validado no Claude e Novo-PEP', checadoEm: '2026-11-22' }).ok,
    false
  );
  assert.equal(
    validateNppCheck({ fonteTipo: 'diretriz', fontePrimaria: 'Diretriz SBC SCA 2025 p. 14', checadoEm: '2026-11-22' }).ok,
    true
  );

  const checado = {
    ...existing6[0],
    checado: true,
    fonteTipo: 'diretriz' as const,
    fontePrimaria: 'Diretriz SBC SCA 2025',
    checadoEm: '2026-11-22',
  };
  const editado = applyNppTextEdit(checado, 'Texto revisado');
  assert.equal(editado.checado, false);
  assert.equal(editado.fontePrimaria, undefined);
  assert.ok(formatNaoPodePassarMarkdown([editado]).includes('- [CHECAR] Texto revisado'));
});

test('8. Internato: pós-plantão seg -> SERVIÇO ter; semana pesada -> 1 micro + 0 caso; sem carry-over', () => {
  const st = createInitialTreinoClinicoState();
  st.logs.push(makeLog({ dateIso: '2026-12-01', tipo: 'Nova', slug: 'dor-abdominal', mecanismo: 'apendicite' }));
  st.internato.posPlantaoByDate['2027-01-25'] = true; // Segunda

  const segPassos = proximosPassos('2027-01-25', st);
  assert.deepEqual(segPassos, [{ kind: 'descanso', motivo: 'pos_plantao' }]);

  const terPassos = proximosPassos('2027-01-26', st);
  assert.ok(terPassos.some((p) => p.kind === 'servico'));

  st.internato.semanaPesadaByWeek['2027-01-25'] = true;
  st.logs.push(makeLog({ dateIso: '2027-01-26', tipo: 'Var', slug: 'dor-abdominal', mecanismo: 'diverticulite' }));
  st.logs.push(makeLog({ dateIso: '2027-01-26', tipo: 'SERVIÇO', slug: 'dor-abdominal', min: 5, servicoResultado: 'apontamento' }));
  const sabPesada = proximosPassos('2027-01-30', st);
  assert.deepEqual(sabPesada, [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }]);
});

test('9. Parser Gemini LOG_RE (5 exemplos ChatGPT + malformados) + Round-trip LOG.md + Backup v2', () => {
  const validExamples = [
    '21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (conferir com teach-back) | [N/S] | Limpo',
    '24/11 | Var | dor-toracica:tep | __m | S | omitiu pergunta sobre imobilização | 3/4 (explicitar o próximo passo) | [N/S] | Repetir',
    '28/11 | E3 | e3-atb-empirico (UPA com retaguarda) | __m | NA | nenhuma | 4/4 (manter prazo explícito) | [N/S] | Limpo',
    '27/11 | E4 | e4-deterioracao-silenciosa (PA de cidade pequena) | __m | NA | omitiu prazo de reavaliação | 3/4 (definir prazo) | [N/S] | Repetir',
    '29/11 | BASELINE | sensorio-focal-glicemia | __m | S | N | 3/4 (1101) | [N/S] | Limpo',
  ];

  for (const line of validExamples) {
    assert.ok(LOG_RE.test(line), `Deveria casar: ${line}`);
    const parsed = parseLogLineFromGemini(line, '2026-11-29');
    assert.equal(parsed.ok, true, `Deveria parsear: ${line}`);
  }

  // BASELINE-A com texto extra deve ser rejeitado
  const leak = parseLogLineFromGemini(`Feedback extra\n${validExamples[4]}`, '2026-11-29', 'A');
  assert.equal(leak.ok, false);

  // Prompts gerados com PII sanitizada no D2 e mecanismos injetados no D1
  const pD1 = buildPromptD1({ dateIso: '2026-11-24', slug: 'dor-toracica', mecanismosUsados: ['iamcsst', 'tep'] });
  assert.ok(pD1.includes('iamcsst, tep'));
  const pD2 = buildPromptD2({
    dateIso: '2027-02-01',
    eixo: 'E1',
    slug: 'dor-abdominal',
    rodizio: 'Cirurgia Geral',
    casoAnonimizado: 'Paciente João CPF 123.456.789-00 com dor em FID.',
  });
  assert.ok(!pD2.includes('123.456.789-00'));
  const pA = buildPromptA({ dateIso: '2026-11-21', tipo: 'Nova', slug: 'dor-toracica' });
  assert.ok(pA.includes('Tipo Nova | dor-toracica'));

  // Round-trip formatLogLine -> parseLogLineFromGemini + Backup/migração Central6AnoState
  const st = createInitialTreinoClinicoState();
  const entry = makeLog({
    dateIso: '2026-11-21',
    tipo: 'Nova',
    slug: 'dor-toracica',
    mecanismo: normalizeMecanismo('IAM CSST!'),
    min: 28,
    score: { kind: 'rubrica', valor: 3, ajuste: 'teach-back' },
    iaPista: false,
  });
  st.logs.push(entry);
  const line = formatLogLine(entry);
  const back = parseLogLineFromGemini(line, '2026-11-21');
  assert.equal(back.ok, true);
  if (back.ok) {
    assert.equal(back.draft.slug, 'dor-toracica');
    assert.equal(back.draft.mecanismo, 'iam-csst');
    assert.equal(back.draft.min, 28);
    assert.equal(back.draft.iaPista, false);
  }
  assert.ok(formatLogMarkdown(st, '2026-11-21').includes(line));

  const migrated = migrateCentral6AnoState({ treinoClinico: st });
  assert.equal(migrated.treinoClinico?.logs.length, 1);
  assert.equal(migrateTreinoClinicoState(undefined).schemaVersion, 31);
  assert.equal(computeTreinoMetrics(st, '2026-11-21').h3Num, 1);
  assert.equal(canDeleteLogEntry(entry.id, []).ok, true);
});

test('10. 9 Guias Teóricos v2.0 renderizam 27 Micro-Drills (<details>) e conectam por semana + gargalo do LOG', () => {
  assert.equal(FORMACAO_TEORICA_MODULOS.length, 9);
  for (const mod of FORMACAO_TEORICA_MODULOS) {
    const html = renderTeoriaMarkdownToHtml(mod.markdown);
    assert.ok(!html.includes('&lt;details&gt;'), `${mod.id} não pode escapar <details>`);
    const drills = html.match(/<details class="guia-drill-details/g) || [];
    assert.equal(drills.length, 3, `${mod.id} deve ter exatamente 3 Micro-Drills renderizados`);
  }

  assert.equal(guiaTeoricoDaSemana('2026-11-22')?.modId, 'mod-01');
  assert.equal(guiaTeoricoDaSemana('2026-12-01')?.modId, 'mod-06');
  assert.equal(guiaTeoricoDaSemana('2026-12-08')?.modId, 'mod-08');
  assert.equal(guiaTeoricoDaSemana('2026-12-15')?.modId, 'mod-05');
  assert.equal(guiaTeoricoDaSemana('2026-12-22')?.modId, 'mod-03');
  assert.equal(guiaTeoricoDaSemana('2026-12-29')?.modId, 'mod-04');
  assert.equal(guiaTeoricoDaSemana('2027-01-05')?.modId, 'mod-09');
  assert.equal(guiaTeoricoDaSemana('2027-01-20')?.modId, 'mod-02');
  assert.equal(guiaTeoricoDaSemana('2027-01-24')?.modId, 'mod-07');
  assert.equal(guiaTeoricoDaSemana('2027-05-20', 'mfc')?.modId, 'mod-09');
  assert.equal(guiaTeoricoDaSemana('2027-07-15', 'ped')?.modId, 'mod-06');

  // Conferência das 3 correções clínicas aplicadas nos módulos 02, 03 e 06
  const mod02 = FORMACAO_TEORICA_MODULOS.find((m) => m.id === 'mod-02')!;
  assert.ok(!mod02.markdown.includes('cristaloide 30 mL/kg se hipoperfusão/lactato ≥ 2'));
  assert.ok(mod02.markdown.includes('primeiras 3 h'));
  const mod03 = FORMACAO_TEORICA_MODULOS.find((m) => m.id === 'mod-03')!;
  assert.ok(!mod03.markdown.includes('TEP submaciço/maciço'));
  const mod06 = FORMACAO_TEORICA_MODULOS.find((m) => m.id === 'mod-06')!;
  assert.ok(mod06.markdown.includes('2 g/dose'));

  const st = createInitialTreinoClinicoState();
  st.logs.push(
    makeLog({
      dateIso: '2026-11-22',
      tipo: 'Nova',
      slug: 'dor-toracica',
      h3Bloco: 'N',
      pemc: { kind: 'omissao', texto: 'Não avaliou PA nos 2 braços' },
    })
  );
  const recs = recomendarGuiasPorGargalo(st).map((r) => r.modId);
  assert.ok(recs.includes('mod-01'));
  assert.ok(recs.includes('mod-02'));
  assert.ok(recs.includes('mod-03'));
});

test('11. Regressões Treino Clínico (P0/P1/P2): parser Markdown, recálculo contingência no delete/restore, anti-PII NPP, formatTargetLabel e hash routes', async () => {
  const { formatTargetLabel } = await import('../src/engine/treinoClinico.ts');
  const { cockpitStore } = await import('../src/state/store.ts');
  const { formatHashRoute, parseHashRoute } = await import('../src/state/hashRoute.ts');

  // P0.10: Parser Gemini aceita crases, negrito, bullet, fence ``` e ponto final
  const formattedVariants = [
    '`21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (teach-back) | [N/S] | Limpo`',
    '**21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (teach-back) | [N/S] | Limpo.**',
    '- 21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (teach-back) | [N/S] | Limpo.',
    '```\n21/11 | Nova | dor-toracica:iamcsst | __m | S | nenhuma | 3/4 (teach-back) | [N/S] | Limpo\n```',
  ];
  for (const variant of formattedVariants) {
    const parsed = parseLogLineFromGemini(variant, '2026-11-21');
    assert.equal(parsed.ok, true, `Parser deveria aceitar formatação Markdown: ${variant}`);
  }
  // BASELINE-A com texto extra continua rejeitado
  const baseLeak = parseLogLineFromGemini(
    'Comentário extra\n`29/11 | BASELINE | sensorio-focal-glicemia | __m | S | N | 3/4 (1101) | [N/S] | Limpo`',
    '2026-11-29',
    'A'
  );
  assert.equal(baseLeak.ok, false);

  // P0.11: formatTargetLabel + recomendarGuiasPorGargalo sem slugs crus
  assert.equal(formatTargetLabel('dor-toracica'), '#01 Dor torácica');
  assert.ok(formatTargetLabel('e3-atb-empirico').startsWith('E3 #1'));
  assert.ok(formatTargetLabel('e4-trauma-hemorragia').startsWith('E4 #'));
  const stGarg = createInitialTreinoClinicoState();
  stGarg.logs.push(
    makeLog({
      dateIso: '2026-11-24',
      tipo: 'Nova',
      slug: 'dor-abdominal',
      pemc: { kind: 'omissao', texto: 'Não avaliou sinal de Murphy' },
    })
  );
  const motivos = recomendarGuiasPorGargalo(stGarg).map((g) => g.motivo);
  assert.ok(motivos.some((m) => m.includes('#02 Dor abdominal')));
  assert.ok(motivos.every((m) => !m.includes('dor-abdominal')));

  // P0.2: Hash routes para sub-seções do Treino Clínico
  assert.equal(
    formatHashRoute({
      world: 'sexto-ano',
      tab: 'teoria',
      teoriaMode: 'treino',
      treinoSection: 'e1',
      treinoSlug: 'dor-toracica',
      treinoDetail: true,
    }),
    '#/6ano/teoria/treino/e1/dor-toracica'
  );
  assert.equal(
    formatHashRoute({
      world: 'sexto-ano',
      tab: 'teoria',
      teoriaMode: 'treino',
      treinoSection: 'log',
    }),
    '#/6ano/teoria/treino/log'
  );
  assert.deepEqual(parseHashRoute('#/6ano/teoria/treino/e3/e3-atb-empirico', () => false), {
    world: 'sexto-ano',
    tab: 'teoria',
    teoriaMode: 'treino',
    treinoSection: 'e3',
    treinoSlug: 'e3-atb-empirico',
    treinoDetail: true,
  });

  // P0.6 + P0.8 + P0.12: deleteTreinoLogEntry recalcula contingência + restoreTreinoLogEntry + anti-PII NPP
  cockpitStore.setCentral6AnoState(migrateCentral6AnoState({}));
  const addBad = cockpitStore.addTreinoLogEntry({
    dateIso: '2027-01-10',
    tipo: 'Nova',
    slug: 'dor-toracica',
    mecanismo: 'iamcsst',
    ambiente: null,
    rodizioId: null,
    min: 22,
    h3Bloco: 'N',
    pemc: { kind: 'omissao', texto: 'Omitiu supra em aVR' },
    score: { kind: 'rubrica', valor: 3, ajuste: 'ok' },
    iaPista: false,
    baselineFase: null,
    avaliavel: true,
    erroCritico: false,
    refacaoIntegralPendente: false,
    atritoE2: null,
    servicoResultado: null,
    linhaEm2min: null,
    vereditoIA: 'Repetir',
  });
  assert.equal(addBad.ok, true);
  if (!addBad.ok) return;

  assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico?.contingencia10jan?.disparou, true);
  assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico?.metas.primeiraPassadaCedeu, true);

  // Adicionar item NPP, validar com PII na fonte primária (deve sanitizar!), depois excluir e restaurar
  const nppAdd = cockpitStore.addTreinoNppItems([
    { slug: 'dor-toracica', texto: 'Avaliar derivação aVR no ECG', origemLogId: addBad.entry.id },
  ]);
  assert.equal(nppAdd.ok, true);
  const nppItem = cockpitStore.getSnapshot().central6Ano.treinoClinico!.naoPodePassar[0];
  const checkRes = cockpitStore.checkTreinoNppItem(
    nppItem.id,
    'diretriz',
    'Diretriz SBC SCA 2025 — caso CPF 123.456.789-00 p. 18',
    '2027-01-10'
  );
  assert.equal(checkRes.ok, true);
  if (checkRes.ok) assert.ok(checkRes.sanitizedCount >= 1);
  const checkedNpp = cockpitStore.getSnapshot().central6Ano.treinoClinico!.naoPodePassar[0];
  assert.ok(!checkedNpp.fontePrimaria?.includes('123.456.789-00'));

  // Excluir e restaurar NPP (Undo)
  const delNpp = cockpitStore.deleteTreinoNppItem(nppItem.id);
  assert.ok(delNpp);
  assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico!.naoPodePassar.length, 0);
  cockpitStore.restoreTreinoNppItem(delNpp.item, delNpp.index);
  assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico!.naoPodePassar.length, 1);

  // Remover NPP para poder apagar o LOG e verificar recálculo de contingencia10jan
  cockpitStore.deleteTreinoNppItem(nppItem.id);
  const delLog = cockpitStore.deleteTreinoLogEntry(addBad.entry.id);
  assert.equal(delLog.ok, true);
  assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico?.contingencia10jan, undefined);
  assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico?.metas.primeiraPassadaCedeu, false);

  // Restaurar LOG recompõe contingencia10jan
  if (delLog.ok) {
    cockpitStore.restoreTreinoLogEntry(delLog.deleted, delLog.index);
    assert.equal(cockpitStore.getSnapshot().central6Ano.treinoClinico?.contingencia10jan?.disparou, true);
  }
});

test('12. Auditoria v3.2: descanso 27–29/11, BASELINE-A a frio em 30/11, parser resiliente com texto após LOG e métricas E2', () => {
  const st = createInitialTreinoClinicoState();
  // Descanso pós-prova GO em 27–29/11
  for (const dt of ['2026-11-27', '2026-11-28', '2026-11-29']) {
    const passos = proximosPassos(dt, st);
    assert.deepEqual(passos, [{ kind: 'descanso', motivo: 'aguardando_data', proximaDataIso: '2026-11-30' }]);
  }

  // Em 30/11 sem BASELINE-A: roda SOMENTE BASELINE-A a frio (sem D1 prévio)
  const p30 = proximosPassos('2026-11-30', st);
  assert.equal(p30.length, 1);
  assert.equal(p30[0].kind, 'sessao');
  if (p30[0].kind === 'sessao') {
    assert.equal(p30[0].tipoLog, 'BASELINE');
    assert.equal(p30[0].baseline, 'A');
  }

  // Após registrar BASELINE-A em 30/11, dia 30/11 fica concluído
  st.logs.push(makeLog({ dateIso: '2026-11-30', tipo: 'BASELINE', slug: 'sensorio-focal-glicemia', baselineFase: 'A', min: 26 }));
  const p30Pos = proximosPassos('2026-11-30', st);
  assert.deepEqual(p30Pos, [{ kind: 'descanso', motivo: 'meta_semana_cumprida' }]);

  // Parser resiliente encontra linha do LOG mesmo se a IA escrever frase depois
  const withTrailing = [
    'Feedback resumido acima.',
    '01/12 | Nova | cefaleia:hsa | __m | S | nenhuma | 2/4 (encurtar explicação) | [N/S] | Limpo',
    'Quer fazer a refação do trecho de explicação agora?',
  ].join('\n');
  const parsedTrailing = parseLogLineFromGemini(withTrailing, '2026-12-01');
  assert.equal(parsedTrailing.ok, true);
  if (parsedTrailing.ok) {
    assert.equal(parsedTrailing.draft.slug, 'cefaleia');
    assert.equal(parsedTrailing.draft.mecanismo, 'hsa');
  }

  // Métricas E2 agregadas separadas do veredito E1
  const stE2 = createInitialTreinoClinicoState();
  stE2.logs.push(
    makeLog({ dateIso: '2026-12-01', tipo: 'Nova', slug: 'cefaleia', mecanismo: 'hsa', score: { kind: 'rubrica', valor: 2, ajuste: 'teach-back' } }),
    makeLog({ dateIso: '2026-12-02', tipo: 'Var', slug: 'cefaleia', mecanismo: 'meningite', score: { kind: 'rubrica', valor: 4, ajuste: 'ok' } })
  );
  const m = computeTreinoMetrics(stE2, '2026-12-02');
  assert.equal(m.e2Den, 2);
  assert.equal(m.e2Gte3Num, 1);
  assert.equal(m.e2Avg, 3);
});

test('13. UI/UX & Parser v3.2: parser tolera acento/espaço no mecanismo e diagnostica campo exato; selo 1ª execução B/C; drills inline', () => {
  // U1: acento e espaço no mecanismo + "|" sem espaços + "38 min" + case misto
  const messy = '21/11|Nova|dor-toracica:dissecção aórtica|38 min|s|nenhuma|3/4 (teach-back curto)|n|limpo';
  const okMessy = parseLogLineFromGemini(messy, '2026-11-26');
  assert.equal(okMessy.ok, true);
  if (okMessy.ok) {
    assert.equal(okMessy.draft.mecanismo, 'disseccao-aortica');
    assert.equal(okMessy.draft.min, 38);
    assert.equal(okMessy.draft.h3Bloco, 'S');
    assert.equal(okMessy.draft.iaPista, false);
    assert.equal(okMessy.draft.vereditoIA, 'Limpo');
  }

  // Erro específico por campo (9 campos com tipo inválido / Nova sem mecanismo / falta campo)
  const badTipo = parseLogLineFromGemini(
    '21/11 | Invalido | dor-toracica:iam | 25m | S | nenhuma | 3/4 (ok) | N | Limpo',
    '2026-11-26'
  );
  assert.equal(badTipo.ok, false);
  if (!badTipo.ok) assert.ok(badTipo.error.includes('Campo 2'));

  const missingMec = parseLogLineFromGemini(
    '21/11 | Nova | dor-toracica | 25m | S | nenhuma | 3/4 (ok) | N | Limpo',
    '2026-11-26'
  );
  assert.equal(missingMec.ok, false);
  if (!missingMec.ok) assert.ok(missingMec.error.includes('Campo 3'));

  const missingField = parseLogLineFromGemini(
    '21/11 | Nova | dor-toracica:iam | 25m | S | nenhuma | N | Limpo',
    '2026-11-26'
  );
  assert.equal(missingField.ok, false);
  if (!missingField.ok) assert.ok(missingField.error.includes('8'));

  // D3: 1ª execução de E4 (03/12) e E3 (04/12) trazem selo teto flexível sem piloto
  const st = createInitialTreinoClinicoState();
  const passos03 = proximosPassos('2026-12-03', st);
  const passoC = passos03.find((p) => p.kind === 'sessao' && p.prompt === 'C');
  assert.ok(passoC && passoC.kind === 'sessao' && passoC.primeiraExecucaoSemPiloto === true);

  const passos04 = proximosPassos('2026-12-04', st);
  const passoB = passos04.find((p) => p.kind === 'sessao' && p.prompt === 'B');
  assert.ok(passoB && passoB.kind === 'sessao' && passoB.primeiraExecucaoSemPiloto === true);

  // Após registrar uma sessão E3/E4, o selo de 1ª execução desaparece nas seguintes
  st.logs.push(makeLog({ dateIso: '2026-12-03', tipo: 'E4', slug: 'e4-deterioracao-silenciosa' }));
  st.logs.push(makeLog({ dateIso: '2026-12-04', tipo: 'E3', slug: 'e3-atb-empirico' }));
  const passos10 = proximosPassos('2026-12-10', st);
  const nextC = passos10.find((p) => p.kind === 'sessao' && p.prompt === 'C');
  assert.ok(!nextC || (nextC.kind === 'sessao' && nextC.primeiraExecucaoSemPiloto === false));

  // U7 + drills inline no HTML renderizado
  const mod01 = FORMACAO_TEORICA_MODULOS[0];
  const htmlDrills = renderTeoriaMarkdownToHtml(mod01.markdown, {
    includeHeadingIds: true,
    includeDrillDoneButtons: true,
  });
  const btns = htmlDrills.match(/class="teoria-drill-inline-btn" data-drill-index="[1-3]"/g) || [];
  assert.equal(btns.length, 3);
});

