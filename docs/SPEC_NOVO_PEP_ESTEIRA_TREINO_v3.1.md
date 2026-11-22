# SPEC — Esteira Contínua de Treino Clínico v3.1 no `Novo-PEP` (`#/6ano/teoria`)

> **Fonte única:** `docs/PLANO_CURSO_HABILIDADES_CLINICAS.md` (v3.1). Substitui `docs/arquivo/PLANO_IMPLEMENTACAO_NOVO_PEP_TREINO_CLINICO.md` (v3.0 / 16 queixas — nunca implementada; não há migração de dados).
> **Escopo:** dados + regras puras. Sem UI. A simulação roda no ChatGPT/Gemini; o app decide o próximo passo, monta o prompt, registra o LOG e gerencia o `Não Pode Passar`.
> **Conflito conhecido:** o §6 do plano congela o `Novo-PEP` até abr/2027. Implementar esta spec é decisão explícita do usuário e deve entrar no §9 (changelog) do plano.
> **Convenções:** datas `YYYY-MM-DD` (fuso local `America/Sao_Paulo`); semana = segunda a domingo, identificada pelo `YYYY-MM-DD` da segunda (`weekIso`); `#n` = ordem estável do catálogo; "hoje" = `todayIso` passado como parâmetro (nenhuma função lê o relógio).

---

## BLOCO 1 — Catálogo v3.1

### 1.1 Tipos

```ts
export type Eixo = 'E1' | 'E3' | 'E4';
export type HabId = `hab-${1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22}`;

export interface QueixaE1 {
  eixo: 'E1'; num: number; slug: string; nome: string;
  blocoVisual: boolean;              // true só em #1, #4, #5, #17
  visualTipo: 'ECG+RX' | 'ECG' | null;
  reservedBaseline: boolean;         // true só em #20
  unlockAfter: string | null;        // '2027-01-24' só em #20 (treinável quando todayIso > unlockAfter)
  relatedHabIds: HabId[];            // específicos; somar HAB_UNIVERSAIS.E1
}

export type RubricaE3 = 'E3-Porta' | 'E3-UBS';
export type AmbienteE3 = 'UPA com retaguarda' | 'PA de cidade pequena sem lab' | 'UBS';
export interface ArquetipoE3 {
  eixo: 'E3'; num: number; slug: string; nome: string;
  rubrica: RubricaE3;
  ambientePadrao: AmbienteE3;
  ambientesPermitidos: AmbienteE3[];
  unlockAfter: string | null;        // '2027-01-24' só em #8
  relatedHabIds: HabId[];
}

export type AmbienteE4 = 'UPA com sala vermelha' | 'PA de cidade pequena';
export interface CenarioE4 { eixo: 'E4'; num: number; slug: string; nome: string; relatedHabIds: HabId[]; }

export type AmbienteE1 = 'UPA com retaguarda' | 'PA de cidade pequena sem laboratório no turno';
```

**Regra de links:** `habIdsDe(item) = dedupe([...item.relatedHabIds, ...HAB_UNIVERSAIS[item.eixo]])`, ordem preservada (específicos primeiro). O clique abre o cartão Pré-Porta pelo `habId` (mesmo mecanismo já usado por `clinical_links.ts`).

```json
{
  "HAB_UNIVERSAIS": {
    "E1": ["hab-1", "hab-11", "hab-4", "hab-16"],
    "E3": ["hab-17"],
    "E4": ["hab-18"]
  }
}
```

### 1.2 E1 — 20 queixas

```json
[
  { "num": 1,  "slug": "dor-toracica",               "nome": "Dor torácica",                                         "blocoVisual": true,  "visualTipo": "ECG+RX", "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-5","hab-12","hab-13","hab-18"] },
  { "num": 2,  "slug": "dor-abdominal",              "nome": "Dor abdominal",                                        "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-7","hab-2"] },
  { "num": 3,  "slug": "cefaleia",                   "nome": "Cefaleia",                                             "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-9"] },
  { "num": 4,  "slug": "dispneia-adulto",            "nome": "Dispneia no adulto",                                   "blocoVisual": true,  "visualTipo": "ECG+RX", "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-6","hab-5","hab-13","hab-14","hab-18"] },
  { "num": 5,  "slug": "tontura-sincope",            "nome": "Tontura / síncope",                                    "blocoVisual": true,  "visualTipo": "ECG",    "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-9","hab-5","hab-12","hab-20"] },
  { "num": 6,  "slug": "febre-adulto",               "nome": "Febre no adulto",                                      "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-2","hab-18","hab-17"] },
  { "num": 7,  "slug": "febre-crianca",              "nome": "Febre na criança",                                     "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-10","hab-18","hab-17"] },
  { "num": 8,  "slug": "dispneia-crianca",           "nome": "Desconforto respiratório / chiado / tosse na criança", "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-10","hab-6","hab-18"] },
  { "num": 9,  "slug": "vomitos-diarreia",           "nome": "Vômitos / diarreia / desidratação (adulto e criança)", "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-7","hab-10","hab-14","hab-17"] },
  { "num": 10, "slug": "lombalgia",                  "nome": "Lombalgia",                                            "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-8","hab-9"] },
  { "num": 11, "slug": "disuria-urinario",           "nome": "Disúria / sintomas urinários",                         "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-7","hab-17"] },
  { "num": 12, "slug": "go-aguda",                   "nome": "Queixa gineco-obstétrica aguda",                       "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-3","hab-15","hab-7","hab-18"] },
  { "num": 13, "slug": "ivas-orl-olho",              "nome": "IVAS (tosse, garganta, ouvido) e olho vermelho",       "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-20","hab-6","hab-17"] },
  { "num": 14, "slug": "pele-tvp-alergia",           "nome": "Pele, partes moles, edema de membro (TVP) e alergia/urticária", "blocoVisual": false, "visualTipo": null, "reservedBaseline": false, "unlockAfter": null,     "relatedHabIds": ["hab-8","hab-2","hab-18","hab-17"] },
  { "num": 15, "slug": "ferida-trauma-leve",         "nome": "Ferida / trauma leve de membro",                       "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-21","hab-8","hab-17"] },
  { "num": 16, "slug": "pa-elevada",                 "nome": "PA elevada assintomática ou sintomática",              "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-5","hab-9","hab-12","hab-17"] },
  { "num": 17, "slug": "palpitacao-ansiedade",       "nome": "Palpitação / ansiedade (orgânico × psiquiátrico)",     "blocoVisual": true,  "visualTipo": "ECG",    "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-12","hab-5","hab-14"] },
  { "num": 18, "slug": "agitacao-intox-abstinencia", "nome": "Agitação / intoxicação / abstinência",                 "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-18","hab-9","hab-14","hab-17"] },
  { "num": 19, "slug": "ideacao-suicida",            "nome": "Ideação suicida / risco",                              "blocoVisual": false, "visualTipo": null,     "reservedBaseline": false, "unlockAfter": null,         "relatedHabIds": ["hab-17"] },
  { "num": 20, "slug": "sensorio-focal-glicemia",    "nome": "Alteração aguda do sensório / déficit focal / alteração glicêmica", "blocoVisual": false, "visualTipo": null, "reservedBaseline": true, "unlockAfter": "2027-01-24", "relatedHabIds": ["hab-9","hab-18","hab-14","hab-12"] }
]
```

### 1.3 E3 — 8 arquétipos

```json
[
  { "num": 1, "slug": "e3-atb-empirico",         "nome": "Antibiótico empírico limítrofe (adulto)",                 "rubrica": "E3-Porta", "ambientePadrao": "UPA com retaguarda",           "ambientesPermitidos": ["UPA com retaguarda","PA de cidade pequena sem lab"], "unlockAfter": null,         "relatedHabIds": ["hab-11"] },
  { "num": 2, "slug": "e3-pediatria-ponderal",   "nome": "Prescrição pediátrica ponderal + teto + mL/gotas + alta", "rubrica": "E3-Porta", "ambientePadrao": "UPA com retaguarda",           "ambientesPermitidos": ["UPA com retaguarda","PA de cidade pequena sem lab"], "unlockAfter": null,         "relatedHabIds": ["hab-10"] },
  { "num": 3, "slug": "e3-analgesia-travas",     "nome": "Analgesia escalonada em terreno de risco",                "rubrica": "E3-Porta", "ambientePadrao": "UPA com retaguarda",           "ambientesPermitidos": ["UPA com retaguarda","PA de cidade pequena sem lab"], "unlockAfter": null,         "relatedHabIds": ["hab-12","hab-3"] },
  { "num": 4, "slug": "e3-ev-alto-risco",        "nome": "Prescrição EV de alto risco em observação 24h + SBAR",    "rubrica": "E3-Porta", "ambientePadrao": "UPA com retaguarda",           "ambientesPermitidos": ["UPA com retaguarda","PA de cidade pequena sem lab"], "unlockAfter": null,         "relatedHabIds": ["hab-14","hab-4"] },
  { "num": 5, "slug": "e3-cronico-conciliacao",  "nome": "Descompensação crônica + conciliação",                    "rubrica": "E3-Porta", "ambientePadrao": "UPA com retaguarda",           "ambientesPermitidos": ["UPA com retaguarda","PA de cidade pequena sem lab"], "unlockAfter": null,         "relatedHabIds": ["hab-5","hab-6"] },
  { "num": 6, "slug": "e3-regulacao-cross",      "nome": "Limites do serviço + estabilização + regulação (SBAR)",   "rubrica": "E3-Porta", "ambientePadrao": "PA de cidade pequena sem lab", "ambientesPermitidos": ["PA de cidade pequena sem lab"],                      "unlockAfter": null,         "relatedHabIds": ["hab-4","hab-18"] },
  { "num": 7, "slug": "e3-alta-cinzenta-recusa", "nome": "Alta defensável em zona cinzenta ou recusa / alta a pedido", "rubrica": "E3-Porta", "ambientePadrao": "UPA com retaguarda",         "ambientesPermitidos": ["UPA com retaguarda","PA de cidade pequena sem lab"], "unlockAfter": null,         "relatedHabIds": ["hab-16","hab-4"] },
  { "num": 8, "slug": "e3-ubs-longitudinal",     "nome": "Seguimento longitudinal na UBS pós-UPA / multimorbidade", "rubrica": "E3-UBS",   "ambientePadrao": "UBS",                          "ambientesPermitidos": ["UBS"],                                              "unlockAfter": "2027-01-24", "relatedHabIds": ["hab-16","hab-1"] }
]
```

### 1.4 E4 — 7 cenários

```json
[
  { "num": 1, "slug": "e4-deterioracao-silenciosa", "nome": "Deterioração silenciosa na observação",                      "relatedHabIds": ["hab-14","hab-4"] },
  { "num": 2, "slug": "e4-va-insuf-resp",           "nome": "Via aérea ameaçada / insuficiência respiratória (+ anafilaxia)", "relatedHabIds": ["hab-22","hab-6","hab-13","hab-14"] },
  { "num": 3, "slug": "e4-arritmia-pcr",            "nome": "Arritmia instável + deterioração → PCR / pós-RCE",           "relatedHabIds": ["hab-12","hab-5"] },
  { "num": 4, "slug": "e4-multipaciente",           "nome": "Multi-paciente / priorização simultânea",                    "relatedHabIds": ["hab-4"] },
  { "num": 5, "slug": "e4-crianca-grave",           "nome": "Chegada inesperada: criança grave",                          "relatedHabIds": ["hab-10","hab-17"] },
  { "num": 6, "slug": "e4-gestante-grave",          "nome": "Chegada inesperada: gestante ou puérpera grave",             "relatedHabIds": ["hab-3","hab-15","hab-17"] },
  { "num": 7, "slug": "e4-trauma-hemorragia",       "nome": "Chegada inesperada: trauma com hemorragia / membro ameaçado", "relatedHabIds": ["hab-21","hab-8","hab-4"] }
]
```

### 1.5 Rodízios (entrada do Bloco 2)

`rodizioAtivo(todayIso, central6Ano)`: usar `central6Ano.rodizioId` se ∈ chaves abaixo; se for `'ferias'` e `todayIso ≥ 2027-01-25`, cair na tabela de datas (inclusive). Fora de qualquer intervalo ou `sprint_r1` → `null` (sem prioridade de rodízio).

```json
{
  "cirurgia":          { "de": "2027-01-25", "ate": "2027-02-21", "alvos": ["dor-abdominal","ferida-trauma-leve","e3-analgesia-travas","e4-trauma-hemorragia"],                       "pedidoServico": "Anamnese/exame abdominal dirigido (1 min)" },
  "anestesio_cti":     { "de": "2027-02-22", "ate": "2027-03-21", "alvos": ["dispneia-adulto","e3-ev-alto-risco","e4-va-insuf-resp","e4-deterioracao-silenciosa"],                  "pedidoServico": "Ordem/SBAR ou avaliação de via aérea" },
  "go":                { "de": "2027-03-22", "ate": "2027-05-02", "alvos": ["go-aguda","pa-elevada","e4-gestante-grave"],                                                           "pedidoServico": "Queixa aguda GO ou interpretação CTG" },
  "oftalmo_orl_ccp":   { "de": "2027-05-03", "ate": "2027-05-16", "alvos": ["ivas-orl-olho","tontura-sincope","cefaleia"],                                                          "pedidoServico": "Manobra focal (HINTS / otoscopia / olho)" },
  "mfc":               { "de": "2027-05-17", "ate": "2027-06-13", "alvos": ["e3-ubs-longitudinal","pa-elevada","lombalgia","disuria-urinario"],                                     "pedidoServico": "Explicação + teach-back ou conciliação" },
  "cm":                { "de": "2027-06-14", "ate": "2027-07-11", "alvos": ["dor-toracica","febre-adulto","e3-cronico-conciliacao","e3-atb-empirico"],                              "pedidoServico": "Apresentação ≤ 90 s ou travas da prescrição" },
  "ped":               { "de": "2027-07-12", "ate": "2027-08-08", "alvos": ["febre-crianca","dispneia-crianca","vomitos-diarreia","e3-pediatria-ponderal","e4-crianca-grave"],      "pedidoServico": "Conduta/prescrição ponderal + sinais de alarme" },
  "emergencia_trauma": { "de": "2027-08-09", "ate": "2027-10-03", "alvos": ["sensorio-focal-glicemia","pele-tvp-alergia","e3-regulacao-cross","e4-arritmia-pcr","e4-multipaciente"], "pedidoServico": "Priorização de sala vermelha / SBAR" }
}
```

Frase-base do `[SERVIÇO]` (literal do §7): *"Posso fazer a anamnese/exame desse paciente e você me diz, em 1 minuto, a pergunta ou manobra mais importante que eu não fiz?"* — exibida junto do `pedidoServico` do rodízio.

---

## BLOCO 2 — Esteira contínua (máquina de estados)

### 2.1 Estado macro (só pela data)

| Estado | Intervalo (inclusive) |
| :--- | :--- |
| `BLOCO0_PILOTO` | `2026-11-21` … `2026-11-29` |
| `BLOCO1_FERIAS` | `2026-11-30` … `2027-01-24` |
| `BLOCO2_INTERNATO` | `≥ 2027-01-25` |

`proximosPassos(todayIso, state, central6Ano): Passo[]` — pura; o mesmo dia pode devolver vários passos, na ordem de execução.

```ts
type PromptId = 'A' | 'D1' | 'B' | 'C' | 'D2';
type Origem = 'piloto' | 'fila_primeira_passada' | 'reserva' | 'reteste' | 'confirmacao'
            | 'manutencao' | 'servico' | 'rodizio' | 'pin_visual' | 'fallback' | 'baseline';
type Passo =
  | { kind: 'sessao'; prompt: PromptId; tipoLog: TipoLog; slug: string; ambiente: string;
      baseline?: 'A' | 'B'; origem: Origem; tetoMin: number;
      mecanismosUsados?: string[]; visual?: 'ECG+RX' | 'ECG'; pausaSilenciosa10s?: boolean }
  | { kind: 'servico'; rodizioId: string | null; frase: string; pedido: string | null }
  | { kind: 'gravacao' } | { kind: 'ef_familiar' }
  | { kind: 'checagem_fontes'; minutos: number; pendentesChecar: number }
  | { kind: 'marco'; marco: 'congelamento_2026-11-29' | 'contingencia_2027-01-10' | 'revisao_2027-01-24' }
  | { kind: 'descanso'; motivo: 'fds' | 'feriado' | 'viagem' | 'pos_plantao' | 'meta_semana_cumprida' | 'aguardando_data' };
```

**Princípio de cumprimento (vale para os 3 blocos):** o app nunca "agenda slug por data". Cada vaga do dia (`D1`, `A`, `B`, `C`) é cumprida por **qualquer** linha do LOG do mesmo `tipoLog` com `dateIso` = aquele dia. Os slugs vêm de **filas derivadas do LOG**; dia perdido não gera dívida — o slug fica na fila e a vaga seguinte (ou de reserva) o absorve.

**Filas derivadas (puras):**
- `filaPrimeiraPassadaE1(todayIso)` = E1 em ordem `num`, sem nenhuma linha `Nova` (qualquer veredito/IA_Pista), excluindo `reservedBaseline` enquanto `todayIso ≤ unlockAfter`.
- `filaPrimeiraPassadaE3/E4(todayIso)` = idem, sem nenhuma linha `E3`/`E4` daquele slug; E3 #8 só quando `todayIso > unlockAfter`.

### 2.2 Bloco 0 — Piloto (21–29/nov)

Passos sequenciais. **Próximo passo** = menor passo não concluído; se `todayIso <` data nominal dele → `descanso/aguardando_data`. Concluir é independente de sucesso; sucesso falho vira item da auditoria de 29/nov (não repete passo — calendário fixo).

| Passo | Data | Sessões (ordem) | Concluído quando existe linha | Teto (soma de `min`) |
| :--- | :--- | :--- | :--- | :---: |
| `P1` | Sáb 21/nov | A `dor-toracica` (`Nova`) | `Nova` · `dor-toracica` | 45 |
| `P2` | Ter 24/nov | D1 `dor-toracica` (`Var`, chat 1) → A `dor-abdominal` (`Nova`, chat 2) | `Var` · `dor-toracica` **e** `Nova` · `dor-abdominal` | 45 (soma das 2) |
| `P3` | Sex 27/nov | C `e4-deterioracao-silenciosa` (`UPA com sala vermelha`) | `E4` · slug | 30 |
| `P4` | Sáb 28/nov | B `e3-atb-empirico` (`UPA com retaguarda`) | `E3` · slug | 40 |
| `P5` | Dom 29/nov | A `BASELINE-A` `sensorio-focal-glicemia` (UPA, idoso, `CASO FIXO`) → marco congelamento (15 min) | `BASELINE` com `baselineFase='A'` **e** `state.piloto.auditoriaEm` preenchido | 30 (caso) |

**Sucesso por passo** (`pilotoOk(passo)`): `Σmin ≤ teto` **∧** todas as linhas com `iaPista === false` **∧** todas com `linhaEm2min === true` (campo só existe em linhas do piloto). `P1` testa só o teto do A; troca de chat/latência só em `P2`.
**Marco 29/nov** lista: passos com `pilotoOk = false` + linhas com erro de validação (§3.5) → "computabilidade do LOG".
**Atraso:** passos `P1–P4` não concluídos até 29/nov são marcados `naoRealizado`; seus slugs permanecem nas filas e entram no Bloco 1 (absorvidos pelas reservas). `BASELINE-A` não concluído até 29/nov ocupa a vaga `A` do próximo dia ativo do Bloco 1 (o `Nova` daquele dia desloca-se pela fila); prazo máximo `2027-01-10`; depois disso, `state.baselineInvalida = true` e a comparação de 24/jan sai como **inconclusiva**.

### 2.3 Bloco 1 — Férias (30/nov–24/jan)

#### 2.3.1 Gabarito de dias

| Dia-tipo | Passos (ordem) | Teto |
| :--- | :--- | :--- |
| `DA` (Seg/Ter/Qua) | `D1` (chat 1, 12 min) → `A` (chat 2, 30 min) → [`visual` 10 min se atribuído] → `checagem_fontes` 15 min | ~60 (~70 c/ visual) |
| `DC` | `C` (30) → `ef_familiar` (10) → `gravacao` (5) → `checagem_fontes` 10 | ~55 |
| `DB` | `B` (40) → `checagem_fontes` 15 | ~55 |
| `DB+G` (só Qua 30/dez) | `DB` + `ef_familiar` + `gravacao` (semana sem `C`) | ~70 |
| `OFF` | `descanso` (`fds` / `feriado` / `viagem`) | 0 |

#### 2.3.2 Calendário e alocação nominal (assumindo todas as vagas cumpridas no dia)

| Semana | Data | Dia | `D1` (origem) | `A` / `B` / `C` | Visual |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **S1** | 30/11 | DA | dinâmico | A `cefaleia` (#3) | — |
| | 01/12 | DA | dinâmico | A `dispneia-adulto` (#4) | **ECG+RX** |
| | 02/12 | DA | dinâmico | A `tontura-sincope` (#5) | — |
| | 03/12 | DC | — | C `e4-va-insuf-resp` (#2) | — |
| | 04/12 | DB | — | B `e3-pediatria-ponderal` (#2) | — |
| **S2** | 07/12 | DA | **pin_visual** `dor-toracica` | A `febre-adulto` (#6) | **ECG+RX** |
| | 08/12 | DA | dinâmico | A `febre-crianca` (#7) | — |
| | 09/12 | DA | dinâmico | A `dispneia-crianca` (#8) | — |
| | 10/12 | DC | — | C `e4-arritmia-pcr` (#3) | — |
| | 11/12 | DB | — | B `e3-analgesia-travas` (#3) | — |
| **S3** | 14/12 | DA | **pin_visual** `tontura-sincope` | A `vomitos-diarreia` (#9) | **ECG** |
| | 15/12 | DA | dinâmico | A `lombalgia` (#10) | — |
| | 16/12 | DA | dinâmico | A `disuria-urinario` (#11) | — |
| | 17/12 | DC | — | C `e4-multipaciente` (#4) | — |
| | 18/12 | DB | — | B `e3-ev-alto-risco` (#4) | — |
| **S4 Natal** | 21/12 | DA | dinâmico | A `go-aguda` (#12) | — |
| | 22/12 | DA | dinâmico | A `ivas-orl-olho` (#13) | — |
| | 23/12 | DC | — | C `e4-crianca-grave` (#5) | — |
| | 24–27/12 | OFF | | feriado / fds | |
| **S5 Ano-Novo** | 28/12 | DA | dinâmico | A `pele-tvp-alergia` (#14) | — |
| | 29/12 | DA | dinâmico | A `ferida-trauma-leve` (#15) | — |
| | 30/12 | DB+G | — | B `e3-cronico-conciliacao` (#5) | — |
| | 31/12–03/01 | OFF | | feriado / fds | |
| **S6** | 04/01 | DA | dinâmico | A `pa-elevada` (#16) | — |
| | 05/01 | DA | dinâmico | A `palpitacao-ansiedade` (#17) | **ECG** |
| | 06/01 | DA | dinâmico | A `agitacao-intox-abstinencia` (#18) | — |
| | 07/01 | DC | — | C `e4-gestante-grave` (#6) | — |
| | 08/01 | DB | — | B `e3-regulacao-cross` (#6, PA pequeno) | — |
| | **10/01 (Dom)** | marco | | `contingencia_2027-01-10` (§2.3.5) | |
| **Livre** | 11–17/01 | OFF | | `viagem` (0 sessões) | |
| **S7** | 18/01 | DA | dinâmico | A `ideacao-suicida` (#19) | — |
| | 19/01 | DA | dinâmico | A **reserva R1** | — |
| | 20/01 | DA | dinâmico | A **reserva R2** | — |
| | 21/01 | DC | — | C `e4-trauma-hemorragia` (#7) | — |
| | 22/01 | DB | — | B `e3-alta-cinzenta-recusa` (#7) | — |
| **Marco** | **24/01 (Dom)** | — | — | A `BASELINE-B` `sensorio-focal-glicemia` (30) → `revisao_2027-01-24` (15) | — |

**Fechamento de contas (piloto + Bloco 1 + 24/jan):**

| Item | Piloto | Bloco 1 | 24/jan | Total | Alvo do plano |
| :--- | :---: | :---: | :---: | :---: | :---: |
| A `Nova` 1ª passada (#1–#19) | 2 (#1, #2) | 17 (#3–#19) | — | **19** | 19 |
| A `Nova` reserva/reteste | — | 2 (R1, R2) | — | **2** | 2 |
| A `BASELINE` | 1 (A) | — | 1 (B) | **2** | 2 |
| `D1` (`Var`) | 1 | 19 (3+3+3+2+2+3+3) | — | **20** | 20 |
| B (E3-Porta #1–#7) | 1 (#1) | 6 (#2–#7) | — | **7** | 7 |
| C (E4 #1–#7) | 1 (#1) | 6 (#2–#7) | — | **7** | 7 |
| Blocos visuais | — | 4 (S1, S2, S3, S6) | — | **4** | 4 |
| `GRAVAÇÃO` | — | 7 (1 por semana ativa) | — | 7 | — |

#### 2.3.3 Regras de preenchimento das vagas

- **Vaga `A` (todas as 19, inclusive R1/R2):**
  1. se `novasPermitidas(semana)` e `filaPrimeiraPassadaE1` não vazia → cabeça da fila (`origem: fila_primeira_passada`);
  2. senão, slug cuja última linha `Nova` tem `refacaoIntegralPendente = true` (mais antiga primeiro) → `reserva`;
  3. senão, slug cuja última linha **avaliável** (§3.3) de E1 é `Repetir`, mais antiga primeiro → `reteste`;
  4. senão → vaga livre (`descanso/meta_semana_cumprida`), sem dívida.
  `novasPermitidas(semana) = !(semana === 'S7' && contingencia.disparou)`.
- **Vaga `B` / `C`:** cabeça de `filaPrimeiraPassadaE3` / `E4`; fila vazia → arquétipo/cenário com última linha `Repetir`, mais antiga primeiro; nada → livre. Ambiente: §2.5.3.
- **Vaga `D1` dinâmica** (`escolherD1Ferias`). Excluir: `reservedBaseline` bloqueado, slug com qualquer linha hoje, slug da vaga `A` de hoje, slugs sem nenhuma linha `Nova`/`Var`. Prioridade (lexicográfica):
  1. **`reteste`** — última linha `Nova`/`Var` do slug é `Repetir` **ou** não avaliável (`iaPista` / `avaliavel=false`); ordem: data dessa linha **desc** (falha mais recente), empate por `num`;
  2. **`confirmacao`** — última linha avaliável `Limpo` e slug não dominado; ordem: data **asc**, empate `num`;
  3. **`manutencao`** — slug dominado com `diasDesde(ultimaLinhaAvaliavel) ≥ 21`; ordem: mais atrasado primeiro;
  4. **`fallback`** — slug treinado com última linha mais antiga.
- **`mecanismosUsados`** (injeção no `D1`): todos os `mecanismo` distintos das linhas `Nova`/`Var` do slug (inclui linhas com `iaPista` ou não avaliáveis), em ordem de 1º uso; vazio → `"nenhum"`.

#### 2.3.4 Bloco visual (4, um por semana, determinístico)

`V` = slugs com `blocoVisual` ainda sem `state.visual[slug].feitoEm`. Para cada semana ativa, calculado na segunda:
1. projetar as vagas `A` de Seg–Qua pela fila; se alguma projetada ∈ `V` → visual anexado à **primeira** delas (no dia e após o `A`);
2. senão, candidatos = `V ∩ {slugs com linha Nova antes da segunda}`; se houver → a vaga `D1` de segunda vira `pin_visual` com o candidato de menor `num`;
3. senão, semana sem visual.
Máximo 1 visual por semana. Se o dia projetado for perdido, o visual segue o slug (anexa no dia em que o `A`/`D1` daquele slug for feito, se a semana ainda não tiver visual). Pendentes após 22/jan são descartados (sem dívida). Resultado nominal: S1 `dispneia-adulto`, S2 `dor-toracica` (pin), S3 `tontura-sincope` (pin), S6 `palpitacao-ansiedade`.

#### 2.3.5 Contingência de 10/jan (determinística)

```
linhas10 = linhas tipo ∈ {Nova, Var}, avaliáveis (§3.3), 2026-11-21 ≤ dateIso ≤ 2027-01-10
num = count(linhas10, h3Bloco === 'S');  den = count(linhas10)
disparou = den === 0 || num / den < 0.80
```
- Snapshot `state.contingencia10jan = { num, den, disparou, calculadoEm }`, recalculado a cada chamada enquanto `todayIso < 2027-01-18`; **congelado** a partir de 18/jan.
- **Se `disparou = false`:** S7 nominal (acima).
- **Se `disparou = true`** — S7 vira:

| Data | Passos |
| :--- | :--- |
| 18/01, 19/01, 20/01 | `D1` + `D1` (dois chats, cada um por `escolherD1Ferias`, o 2º excluindo o slug do 1º) + `checagem_fontes`; todos com `pausaSilenciosa10s: true` (banner: *"10 s em silêncio pós-triagem → provável / perigosa / não pode passar"*) |
| 21/01 | C (inalterado — preservar) |
| 22/01 | B (inalterado — preservar) |

  - **Saída antecipada:** ao fim de cada dia, `janela10` = últimas 10 linhas `Nova`/`Var` avaliáveis (todo o histórico). Se `S(janela10) ≥ 8`, os dias restantes de Seg–Qua da S7 voltam para `D1` + vaga `A` **sem fila de 1ª passada** (regras 2–4 da vaga `A`: reserva/reteste). Novas queixas continuam bloqueadas a semana inteira.
  - `ideacao-suicida` (e qualquer slug ainda na fila) passa para o Bloco 2 sem dívida; a meta `19/20` cede (`state.metas.primeiraPassadaCedeu = true`).
  - Totais da S7 em contingência: `D1` 6 (em vez de 3), `A` 0–2, B 1, C 1.

#### 2.3.6 Marco 24/jan

- Passo `sessao` A `BASELINE-B` + `marco revisao_2027-01-24`. Janela permitida: `2027-01-24` … `2027-01-31` (fora disso → inconclusivo).
- Relatório da revisão (puro): `3H` (S/N), PEMC (S/N), E2 por critério `[1]–[4]` de A vs. B; `inconclusivo = baselineInvalida || A.iaPista || B.iaPista`; mais `3H_bloco` num/den, taxa PEMC num/den, dominadas `k/19`, 1ª passada `E1 x/19`, `E3-Porta x/7`, `E4 x/7`.

### 2.4 Bloco 2 — Internato (≥ 25/jan)

#### 2.4.1 Entradas

| Entrada | Origem |
| :--- | :--- |
| `rodizio` | `rodizioAtivo(todayIso, central6Ano)` (§1.5) |
| `posPlantao(dia)` | `state.internato.posPlantaoByDate[dia]`; se indefinido e `dia === todayIso`, `central6Ano.arquetipoId === 'pos_plantao'` |
| `semanaPesada(weekIso)` | `state.internato.semanaPesadaByWeek[weekIso] ?? central6Ano.marchaId ∈ {'2_pesada','1_sobrevivencia'}` |
| `diaLivre(dia)` | sábado/domingo **ou** `state.internato.diaLivreByDate[dia] === true` |
| `temCasoReal(dia)` | `state.internato.casoRealByDate[dia] === true` (habilita D2) |

#### 2.4.2 Metas semanais (sem dívida)

| Modo | Micro (`Var` via D1 **ou** `Micro` via D2) | Caso completo (`Nova` / `E3` / `E4`) | `[SERVIÇO]` |
| :--- | :---: | :---: | :---: |
| Normal | 3 | 1 | 1 |
| `semanaPesada` (piso mínimo) | 1 | 0 | 1 |

Contagens por `weekIso` a partir do LOG. Meta não cumprida até domingo **zera** na segunda seguinte (nenhum carry-over).

#### 2.4.3 Algoritmo diário `proximosPassosInternato(todayIso)`

```
1. se posPlantao(today) → [descanso/pos_plantao]  (nada mais; nem micro, nem caso)
2. passos = []
3. SERVIÇO: se não há linha SERVIÇO na semana e
     (today é segunda) ou
     (today é terça e (posPlantao(segunda) ou state.internato.semPacienteNovoSeg[weekIso]))
   → passos.push(servico{rodizio, frase, pedido})
4. se já existe linha de treino hoje (Nova|Var|E3|E4|Micro) → retornar passos
5. metas = semanaPesada ? {micro:1, caso:0} : {micro:3, caso:1}
6. se casoFeito < metas.caso e diaLivre(today) → passos.push(casoCompleto())
   senão se microFeito < metas.micro → passos.push(micro())
   senão se passos vazio → passos.push(descanso/meta_semana_cumprida)
7. retornar passos
```
- **Falha de SERVIÇO** (`servicoFalhou(weekIso)`): fim da terça sem linha `SERVIÇO` **e** sem isenção. Isenção = segunda **e** terça em pós-plantão. Linha com `servicoResultado = 'recusa'` cumpre (preceptor dizer não ≠ falha).

#### 2.4.4 `casoCompleto()` — rotação `A → B → C`

Tipo = sucessor do último caso completo registrado em `≥ 2027-01-25` (`Nova`→B, `E3`→C, `E4`→A); sem nenhum → `A`.
- **A (`Nova`)**: (1) cabeça de `filaPrimeiraPassadaE1` (inclui `ideacao-suicida` se cedeu e `sensorio-focal-glicemia`, já liberada); (2) alvo E1 do rodízio não dominado com menos linhas avaliáveis; (3) `reteste` (última avaliável `Repetir`, mais antiga); (4) E1 com última linha mais antiga.
- **B / C**: (0) slug E3/E4 de linha `SERVIÇO` dos últimos 7 dias com `servicoResultado='apontamento'`, sem linha B/C posterior; (1) fila de 1ª passada (E3 inclui #8); (2) alvos do rodízio não dominados, menos linhas primeiro; (3) qualquer não dominado, última linha mais antiga (nunca feito = mais antigo); (4) última linha mais antiga.

#### 2.4.5 `micro()` — D1 ou D2

- `temCasoReal(today)` → `D2` (`tipoLog: 'Micro'`, eixo escolhido pelo usuário; banner LGPD).
- Senão `D1` (`tipoLog: 'Var'`), slug por prioridade (mesmas exclusões de §2.3.3, sem bloqueio do #20):
  0. **`servico`** — slug E1 da linha `SERVIÇO` mais recente (≤ 7 dias, `apontamento`) sem `Var` posterior;
  1. **`reteste`** — como §2.3.3 (1);
  2. **`manutencao`** — dominado e `diasDesde(ultimaLinhaAvaliavel) ≥ 21`, mais atrasado primeiro;
  3. **`confirmacao`** — como §2.3.3 (2);
  4. **`rodizio`** — alvo E1 do rodízio com menos linhas avaliáveis;
  5. **`fallback`** — E1 com última linha mais antiga.
  Dentro de 1–3: alvos do rodízio ativo vêm antes dos demais, depois a ordem própria do nível.

### 2.5 Montagem do prompt (1 clique)

1. Templates = texto **literal** dos blocos de código do §5 do plano (A, B, C, D), guardados como constantes. Nenhuma outra alteração de texto.
2. Substituição só nas linhas de `CONFIGURAÇÃO` (tudo após `": "` é trocado pelo valor):

| Prompt | Campo | Valor |
| :--- | :--- | :--- |
| A | `Tipo` | `Nova (Nível 1: Base/Alto Risco)` · `BASELINE-A (29/nov)` · `BASELINE-B (24/jan)` |
| A | `Queixa` | `${slug} — ${NOME EM MAIÚSCULAS}` |
| A | `Serviço` | `UPA com retaguarda` (padrão) · `PA de cidade pequena sem laboratório no turno` |
| A | `Perfil` | `padrão` · `paciente idoso` (obrigatório em BASELINE) |
| A | `CASO FIXO (só BASELINE)` | `nenhum` · conteúdo colado (ver 2.5.4) |
| D(1) | `Queixa … \| Serviço` | `${slug} — ${NOME}` · serviço |
| D(1) | `Mecanismos já usados no LOG para este slug` | `mecanismosUsados.join(', ')` ou `nenhum` → seguido do texto literal `→ crie um caso clinicamente distinto.` |
| B | `Arquétipo` / `Ambiente` | `${slug} — ${NOME}` / §2.5.3 |
| C | `Cenário` / `Ambiente` | `${slug} — ${NOME}` / `UPA com sala vermelha` (padrão) |
| D(2) | `Eixo` / `Caso anonimizado` | escolha do usuário / texto passado por `sanitizePiiText` |

3. **Ambiente E3:** `#6` → PA pequeno; `#8` → UBS; demais: se o slug tem linha `Limpo` em UPA e nenhuma em PA → PA; se `Limpo` em PA e nenhuma em UPA → UPA; senão `ambientePadrao`.
4. **CASO FIXO (BASELINE):** campo mascarado, colado pelo usuário a partir de `docs/piloto/selado/`; **nunca renderizado, nunca persistido** (só concatenado no prompt copiado). O app não embute os casos selados.
5. Para `D(1)` e `A` o `D1` vem antes do `A` (chat 1 → chat 2); o app oferece dois botões de cópia separados.

---

## BLOCO 3 — LOG v3.1 e regras de domínio

### 3.1 Schema

```ts
export type TipoLog = 'Nova' | 'Var' | 'E3' | 'E4' | 'Micro' | 'SERVIÇO' | 'GRAVAÇÃO' | 'BASELINE';
export type SN = 'S' | 'N';
export type Veredito = 'Limpo' | 'Repetir' | 'NA';

export type Pemc =
  | { kind: 'nenhuma' }
  | { kind: 'omissao'; texto: string }        // texto ≤ 160, sanitizePiiText
  | { kind: 'baselineSN'; valor: SN }          // só BASELINE-A
  | { kind: 'NA' };

export type Score =
  | { kind: 'rubrica'; valor: 0 | 1 | 2 | 3 | 4; ajuste: string; criterios?: [boolean, boolean, boolean, boolean] }
  | { kind: 'muletas'; contagem: number; ajuste: string }   // só GRAVAÇÃO
  | { kind: 'NA' };

export interface TreinoLogEntry {
  id: string;                    // único, estável
  criadoEm: string;              // ISO datetime — desempate de ordem no mesmo dia
  // ── os 9 campos do LOG.md ──
  dateIso: string;               // 1. DD/MM (renderizado)
  tipo: TipoLog;                 // 2. Tipo
  slug: string;                  // 3. Alvo (parte 1) — slug do catálogo
  mecanismo: string | null;      // 3. Alvo (parte 2) — obrigatório em Nova/Var; null nos demais
  ambiente: string | null;       // 3. Alvo — obrigatório em E3/E4 (renderiza "slug (Ambiente)")
  rodizioId: string | null;      // 3. Alvo — opcional em SERVIÇO (renderiza "slug/rodizio")
  min: number | null;            // 4. Min — inteiro 1..180; null só em Micro
  h3Bloco: SN | 'NA';            // 5. 3H_bloco
  pemc: Pemc;                    // 6. PEMC/Omissão
  score: Score;                  // 7. Score(0-4)
  iaPista: boolean | null;       // 8. IA_Pista? — null = NA
  veredito: Veredito;            // 9. Veredito — SEMPRE calculado (§3.2); nunca digitado
  // ── metadados ──
  baselineFase: 'A' | 'B' | null;          // obrigatório se tipo = BASELINE
  avaliavel: boolean;                       // false = falha que impede avaliar (default true)
  erroCritico: boolean;                     // só E3/E4 (default false)
  refacaoIntegralPendente: boolean;         // só Nova (refação não coube no teto)
  atritoE2: 'nenhum' | 'A' | 'B' | 'C' | null;  // só Var (revelado no feedback)
  servicoResultado: 'apontamento' | 'recusa' | 'sem_paciente' | null; // só SERVIÇO
  linhaEm2min: boolean | null;              // só Bloco 0
  vereditoIA: Veredito | null;              // o que a IA ditou (auditoria de divergência)
}
```

**Matriz de campos por tipo** (✓ obrigatório · `—` forçado ao valor indicado):

| tipo | mecanismo | ambiente | min | h3Bloco | pemc.kind | score.kind | iaPista |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: |
| `Nova`, `Var` | ✓ | — null | ✓ | ✓ S/N | `nenhuma` \| `omissao` | `rubrica` (E2) | ✓ |
| `BASELINE` A | — null | — null | ✓ | ✓ S/N | `baselineSN` | `rubrica` (E2) | ✓ |
| `BASELINE` B | — null | — null | ✓ | ✓ S/N | `nenhuma` \| `omissao` | `rubrica` (E2) | ✓ |
| `E3`, `E4` | — null | ✓ | ✓ | — NA | `nenhuma` \| `omissao` | `rubrica` (E3/E4) | ✓ |
| `Micro` | — null | — null | opcional | — NA | `nenhuma` \| `omissao` | — NA | — null |
| `SERVIÇO` | — null | — null | ✓ (padrão 5) | — NA | `nenhuma` \| `omissao` | — NA | — null |
| `GRAVAÇÃO` | — null | — null | ✓ (padrão 5) | — NA | — NA | `muletas` | — null |

Slug válido por tipo: `Nova`/`Var` → E1 (sem #20 enquanto `dateIso ≤ 2027-01-24`); `BASELINE` → só `sensorio-focal-glicemia`; `E3` → E3 (sem #8 enquanto `dateIso ≤ 2027-01-24`); `E4` → E4; `Micro`/`SERVIÇO`/`GRAVAÇÃO` → qualquer slug do catálogo.
`mecanismo` normalizado: minúsculas, sem acento (NFD), não-`[a-z0-9]` → `-`, colapsar `-`; deve casar `^[a-z0-9]+(-[a-z0-9]+)*$`.

### 3.2 Veredito (calculado)

```
se !avaliavel                      → 'Repetir'   (Nova|Var|BASELINE|E3|E4)
Nova | Var | BASELINE(B)           → h3Bloco==='S' && pemc.kind==='nenhuma'            ? 'Limpo' : 'Repetir'
BASELINE(A)                        → h3Bloco==='S' && pemc.valor==='N'                 ? 'Limpo' : 'Repetir'
E3 | E4                            → score.valor===4 && !erroCritico                    ? 'Limpo' : 'Repetir'
Micro | SERVIÇO | GRAVAÇÃO         → 'NA'
```
- `Score E2` **nunca** entra no veredito de E1. `iaPista` **não** altera o veredito (só exclui do domínio).
- Se `vereditoIA` (importado) ≠ calculado → gravar o calculado e marcar `divergenciaVeredito` no relatório semanal.

### 3.3 Avaliabilidade e sequência

```
avaliavelParaDominio(l) = l.avaliavel && l.iaPista === false && l.tipo ∈ {Nova, Var, E3, E4} && ineditaE1(l)
ineditaE1(l) = l.tipo ∉ {Nova, Var} || não existe linha anterior (Nova|Var) do mesmo slug com o mesmo mecanismo
seqE1(slug) = linhas Nova|Var do slug que passam em avaliavelParaDominio, ordenadas por (dateIso, criadoEm)
```
Linhas fora de `seq` (IA_Pista = S, não avaliáveis, mecanismo repetido, `BASELINE`, `Micro`, `SERVIÇO`, `GRAVAÇÃO`) são **removidas** da sequência: não validam nem quebram — as vizinhas tornam-se consecutivas.

### 3.4 Domínio

- **E1** — `dominada(slug)` ⇔ existe par consecutivo `(p, c)` em `seqE1(slug)` com: `p.veredito = c.veredito = 'Limpo'` **∧** `p.dateIso < c.dateIso` (dias distintos) **∧** `c.tipo = 'Var'` (cobre `Nova→Var` e `Var→Var`; `Var→Nova` e `Nova→Nova` não dominam) **∧** nenhuma linha `Repetir` em `seqE1(slug)` depois de `c` (um `Repetir` posterior rebaixa; volta a dominar com novo par).
  - `dominadaDesde` = `c.dateIso` do par mais recente; `manutencaoVencida` ⇔ dominada ∧ `diasDesde(última de seqE1) ≥ 21`.
- **E3 / E4** — mesma lógica sobre `seq` do slug (linhas `E3`/`E4` avaliáveis), par consecutivo `Limpo`–`Limpo` (`4/4` sem erro crítico), sem exigir dias distintos nem tipo. Para E3 expor `ambientesNoPar` (flag informativa "1 UPA + 1 PA" — não bloqueia).
- **Status E1** (para a lista): `pendente` (0 linhas Nova/Var) · `com_pemc` (última de `seq` tem `omissao`) · `dominada` · `revisar` (dominada ∧ `manutencaoVencida`) · `em_treino` (demais).

### 3.5 Validações (rejeitam o salvamento, com código)

| Código | Regra |
| :--- | :--- |
| `CAMPO_OBRIGATORIO` | matriz §3.1 violada |
| `SLUG_INVALIDO_PARA_TIPO` | slug fora do eixo do tipo, ou #20 / E3 #8 antes da liberação |
| `MECANISMO_FORMATO` | regex de `mecanismo` |
| `SCORE_4_COM_ERRO_CRITICO` | `E3`/`E4` com `erroCritico = true` e `score.valor = 4` |
| `BASELINE_FASE` | `BASELINE` sem `baselineFase`, ou 2ª linha da mesma fase |
| `BASELINE_PEMC_FORMATO` | `baselineFase='A'` exige `pemc.kind='baselineSN'`; `'B'` proíbe |
| `MIN_FORA_FAIXA` | `min` fora de 1..180 |
| `ORIGEM_REFERENCIADA` | excluir linha referenciada por item `Não Pode Passar` (excluir/realocar o item antes) |

Avisos (não bloqueiam): mecanismo repetido (linha sai do domínio), `min` acima do teto do prompt, divergência de veredito.

### 3.6 Métricas

- `3H_bloco` = `count(h3Bloco='S') / count` sobre linhas `Nova`/`Var` com `avaliavel ∧ iaPista=false` (BASELINE fora). Sempre exibir `num/den`.
- `taxaPEMC` = `count(pemc.kind='omissao') / count`, mesmo universo.
- `dominadas` = `k / 19` até 24/jan; `k / 20` depois.
- `iaPistaTaxa` = `count(iaPista=true) / count(iaPista≠null)`.
- Gatilho Claude (iii) sugerido quando ≥ 2 das últimas 5 linhas com `iaPista≠null` têm `iaPista = true`.

### 3.7 Serialização `LOG.md` (ida e volta)

`DD/MM | Tipo | Alvo | Min | 3H_bloco | PEMC/Omissão | Score(0-4) | IA_Pista? | Veredito`

| Campo | Render |
| :--- | :--- |
| Alvo | `Nova`/`Var`: `slug:mecanismo` · `E3`/`E4`: `slug (Ambiente)` · `SERVIÇO`: `slug/rodizioId` ou `slug` · demais: `slug` |
| Min | `${min}m` · null → `__m` |
| PEMC | `nenhuma` · texto · `S`/`N` (BASELINE-A) · `NA` |
| Score | `X/4 (ajuste)` · `muletas: X (ajuste)` · `NA` |
| IA_Pista | `S` · `N` · `NA` |

Import (colar a linha ditada pela IA): split em `" | "` → exatamente 9 campos; `[__m]` e `[N/S]` vazios ficam pendentes e bloqueiam o salvamento até preenchidos; ano inferido pelo Bloco (`11`/`12` → 2026; `01`–`10` → 2027; `11`/`12` após 2027-01-25 → 2027). Export ordena por `(dateIso, criadoEm)` e acrescenta, ao final, `3H_bloco num/den` e `PEMC num/den`.

---

## BLOCO 4 — Contrato do "Não Pode Passar"

```ts
export type FonteTipo = 'diretriz' | 'protocolo_oficial' | 'bula_profissional';

export interface NaoPodePassarItem {
  id: string;
  slug: string;                  // E1
  texto: string;                 // 1 linha, ≤ 200 chars, sanitizePiiText
  checado: boolean;              // false = renderiza com [CHECAR]
  fontePrimaria?: string;        // referência efetivamente consultada (título + órgão/ano ou bula + fabricante)
  fonteTipo?: FonteTipo;         // obrigatório quando checado = true
  checadoEm?: string;            // dateIso; obrigatório quando checado = true
  origemLogId: string;           // linha do LOG que gerou o item
  criadoEm: string;
}
```

**Invariantes (validadas em toda escrita):**

| Código | Regra |
| :--- | :--- |
| `NPP_ORIGEM_INVALIDA` | `origemLogId` deve apontar para linha `Nova`, `Var` ou `Micro` do **mesmo `slug`** (E1) com `pemc.kind = 'omissao'`. `BASELINE` (A **e** B) nunca cria item. |
| `NPP_LIMITE_6` | máx. 6 itens por `slug` (checados ou não). Import em lote que ultrapasse 6 é rejeitado inteiro, informando o excedente. |
| `NPP_NASCE_CHECAR` | todo item nasce com `checado = false`, sem fonte. |
| `NPP_FONTE_OBRIGATORIA` | `checado = true` exige `fonteTipo` ∈ `FonteTipo` **∧** `fontePrimaria.trim().length ≥ 10` **∧** `checadoEm`. |
| `NPP_FONTE_PROIBIDA` | `fontePrimaria` não pode casar (case-insensitive) `/\b(amboss|chat ?gpt|gemini|claude|antigravity|ia|ai|llm|novo-?pep|pr[eé]-?porta|hab-\d+|cart[aã]o \d+)\b/`. AMBOSS só localiza; IA (inclusive consenso entre IAs) e os cartões/protocolos gerados por IA nunca retiram `[CHECAR]`. |
| `NPP_EDICAO_RESETA` | alterar `texto` de item checado → `checado = false`, limpa `fontePrimaria`, `fonteTipo`, `checadoEm`. |

- Desmarcar (`checado → false`) é sempre permitido e limpa os 3 campos de fonte.
- `pendentesChecar` (usado em `checagem_fontes`) = itens com `checado = false`.
- **Render `NAO_PODE_PASSAR.md`:** agrupado por `## ${num}. ${slug} — ${nome}` em ordem `num`; item não checado → `- [CHECAR] ${texto}`; checado → `- ${texto} — Fonte (${fonteTipo}): ${fontePrimaria} · ${DD/MM/AAAA}`.

---

## Anexo — Estado persistido (`central6Ano.treinoClinico`)

```ts
export interface TreinoClinicoState {
  schemaVersion: 31;
  logs: TreinoLogEntry[];
  naoPodePassar: NaoPodePassarItem[];
  visual: Record<string, { feitoEm: string }>;                 // slug → data
  piloto: { auditoriaEm?: string; naoRealizados: string[] };   // 'P1'..'P4'
  baselineInvalida: boolean;
  contingencia10jan?: { num: number; den: number; disparou: boolean; calculadoEm: string };
  metas: { primeiraPassadaCedeu: boolean };
  internato: {
    posPlantaoByDate: Record<string, boolean>;
    semanaPesadaByWeek: Record<string, boolean>;
    diaLivreByDate: Record<string, boolean>;
    casoRealByDate: Record<string, boolean>;
    semPacienteNovoSeg: Record<string, boolean>;
  };
  rituais: Record<string, { efFamiliar?: boolean }>;           // weekIso
}
```
Herdam persistência, sincronização entre abas, `sanitizePiiText` e Backup v2 via `Central6AnoState` (como na spec v3.0). Migração: `undefined` → estado vazio com `schemaVersion: 31`.

### Testes mínimos (puros)
1. Totais nominais do §2.3.2 batem com a tabela de fechamento (simulando todas as vagas cumpridas).
2. Dia perdido em S2 → slug desloca; R1 absorve; nenhum slug de #3–#19 some.
3. Contingência: `den=0` dispara; `79/100` dispara; `80/100` não; snapshot congela em 18/jan; saída antecipada com `janela10 ≥ 8`.
4. Domínio E1: `Nova L → Var L` mesmo dia ≠ dominada; `Nova L → [Var iaPista=S] → Var L` (dias distintos) = dominada; `Var L → Nova L` ≠; `Nova L → Nova L` ≠; `Repetir` após o par rebaixa; mecanismo repetido sai da sequência.
5. `E3` com `score 4` + `erroCritico` → rejeitado; `score 3` + `erroCritico` → `Repetir`.
6. `BASELINE-A` com PEMC → item NPP rejeitado (`NPP_ORIGEM_INVALIDA`).
7. NPP: 7º item rejeitado; `checado` com fonte "AMBOSS" ou "Claude" rejeitado; editar texto de item checado volta a `[CHECAR]`.
8. Internato: pós-plantão segunda → SERVIÇO na terça; semana pesada → 1 micro + 0 caso; meta não cumprida não aparece na semana seguinte.
9. Round-trip `LOG.md` export → import = mesmo array (exceto `id`/`criadoEm`).
