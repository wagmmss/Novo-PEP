# Plano de Implementação — Treino Clínico (v3.0) no `Novo-PEP`

> **Fonte pedagógica:** `docs/PLANO_CURSO_HABILIDADES_CLINICAS.md` (v3.0 — voz de ida + texto de volta no Gemini).  
> **Escopo:** Implementar um **MVP cirúrgico** da v3.0 dentro da aba `Teoria` (`#/6ano/teoria`) do `Novo-PEP`, sem criar dependências novas, sem editar os 22 cartões de `05_Habilidades_Clinicas/` e sem quebrar o `BackupModal` v2 nem os 7 guias teóricos existentes.

---

## 1. Decisões Arquiteturais

1. **Onde vive na navegação:** dentro do mundo **`6º Ano`** → aba **`Treino & Teoria`** (mantém id interno `'teoria'` e URL `#/6ano/teoria` para 100% de retrocompatibilidade em `hashRoute.ts`).
2. **Convivência limpa com os 7 Guias atuais:** um switch segmentado discreto no topo de `TeoriaView.tsx` alterna entre:
   - **`Treino Clínico`** *(padrão ao abrir)* — execução da v3.0 (16 queixas, gerador de prompts A/B/C/D, LOG, `Não Pode Passar`, regra de segunda-feira e links Pré-Porta).
   - **`Guias Teóricos (7)`** — preserva exatamente a leitura editorial atual de `FORMACAO_TEORICA_MODULOS`.
3. **Persistência e Backup v2 automáticos:** todo o estado do treino fica em `central6Ano.treinoClinico` (`Central6AnoState`). Com isso, o sistema herda automaticamente:
   - persistência em `localStorage` (`mq_central_6ano_state_v1`),
   - sincronização entre abas (`storage` event),
   - alerta visual em falha de gravação (`reportPersistFailure`),
   - sanitização LGPD/PII (`sanitizePiiText`),
   - **Exportação e Importação JSON no `BackupModal` v2** sem alterar `BackupPayload.version`.
4. **Identidade visual:** 100% aderente aos tokens já usados em `TeoriaView.tsx` e `TopBar.tsx` (`#FAFAFA` / `#0F1115`, cards `#FFFFFF` / `#15181F`, acento `#0F766E` / `#2DD4BF`, bordas `zinc-200/80` / `white/[0.07]`, ícones `lucide-react`, layout master-detail `aside w-[320px]` + `main flex-1` responsivo com `mobileShowDetail`).

---

## 2. Arquitetura da Página (`TreinoClinicoView.tsx`)

### Visão Geral do Layout (Desktop 2 Colunas · Mobile Master-Detail)

```text
+----------------------------------------------------------------------------------+
| [Switch: Treino Clínico | Guias Teóricos (7)]   3H≤60s: 80% | PEMC: 25% | Dom: 2/16 | [Seg: Pendente] |
+------------------------------------+---------------------------------------------+
| COLUNA ESQUERDA (aside 320px)      | COLUNA DIREITA (main flex-1, max-w-4xl)     |
|                                    |                                             |
| [Filtro busca]                     | === EXEMPLO: QUEIXA #01 — DOR TORÁCICA ===  |
| [Abas de eixo:]                    | Header: #01 · Status [Em treino] · 2 sessões|
|  • E1+E2 · 16 Queixas              | Chips Pré-Porta: [ECG ↗] [Cardio ↗] [ABCDE ↗]|
|  • E3 · Prescrição (B)             |                                             |
|  • E4 · Paciente Grave (C)         | [CARD 1 — GERAR PROMPT A PARA O GEMINI]     |
|  • Micro-dose 10 min (D)           |  Variante relâmpago: [Auto: nenhuma / #xx]  |
|  • Log & Rotina                    |  [ Botão Primário: Copiar Prompt A ]        |
|                                    |  Lembrete: voz de ida (sem Live) · 3H ≤60s  |
| Lista (quando em 16 Queixas):      |  ▸ Ver texto completo do prompt (recolhível)|
|  #01 Dor torácica      [Em treino] |                                             |
|  #02 Dor abdominal     [Pendente]  | [CARD 2 — REGISTRO RÁPIDO (1 LINHA DO LOG)] |
|  #03 Cefaleia          [Pendente]  |  Tipo: (Queixa nova | Variante | [SERVIÇO]) |
|  ...                               |  3H aos 60s? (Sim | Não)  Veredito (Dom|Rep)|
|  #16 Ideação suicida   [Pendente]  |  PEMC: [_____________________ (vazio=nenh)] |
|                                    |  Fala: [_____________________ (1 ajuste)  ] |
|                                    |  [ Registrar sessão ]                       |
|                                    |                                             |
|                                    | [CARD 3 — NÃO PODE PASSAR (≤ 6 linhas)]     |
|                                    |  (Liberado após PEMC real; contador X/6)    |
|                                    |                                             |
|                                    | [CARD 4 — HISTÓRICO DESTA QUEIXA]           |
|                                    |  21/11 | Dor torácica | 3H: S | PEMC: ...   |
+------------------------------------+---------------------------------------------+
```

### Detalhamento das 5 Visões na Coluna Direita

1. **E1+E2 · Queixa Selecionada (`#01` a `#16`):**
   - **Header:** número + título + badge de status automático (`Pendente`, `Em treino`, `Com PEMC`, `Dominada`) + indicador *"Revisar (~21d)"* se dominada há mais de 21 dias + chips clicáveis de cartões Pré-Porta (`onOpenPrePorta`).
   - **Card Lançador (Prompt A):**
     - Select de **Variante relâmpago** com sugestão automática (queixa treinada há 3–5 dias ou com PEMC pendente; opção `"nenhuma"`).
     - Botão primário **`Copiar Prompt A para o Gemini`** (`copyToClipboard` + `onNotify`).
     - `<details>` recolhível com o prompt preenchido pronto para leitura/ajuste.
   - **Card Registro Rápido (1 linha do LOG):**
     - Campos enxutos: `Tipo` (`porta_nova` | `variante` | `servico`), `3H aos 60s?` (`S/N`), `PEMC` (texto curto; vazio vira `"nenhuma"`), `Fala` (texto curto), `Veredito` (`dominado` | `repetir`).
     - Sanitiza textos com `sanitizePiiText` antes de salvar (LGPD).
   - **Card `Não Pode Passar` (≤ 6 linhas):**
     - Fica recolhido/informativo até ocorrer 1 PEMC real nessa queixa (ou usuário clicar em "Adicionar mesmo assim").
     - Editor simples de até 6 linhas com contador `X/6`.
   - **Card Histórico da Queixa:** lista reversa das sessões daquela queixa com opção de remover registro incorreto.

2. **E3 · Prescrição & Disposição (Prompt B — Escrito):**
   - Seletor de **Cenário** (`Infecção de gravidade limítrofe`, `Descompensação crônica`, `Dor / analgesia e alta`, `Customizado`) + **Serviço** (`UPA com retaguarda` | `PA cidade pequena sem laboratório`).
   - Botão **`Copiar Prompt B`** + `<details>` do prompt + chips Pré-Porta (`hab-17`, `hab-4`, `hab-14`) + formulário rápido de 1 linha no LOG (`eixo: 'E3'`).

3. **E4 · Paciente Grave (Prompt C — Voz de ida + texto de volta):**
   - Seletor de **Cenário** (`Deterioração na sala de observação`, `Criança grave`, `Gestante com sinal de gravidade`, `Trauma com hemorragia`) + **Serviço** (`UPA` | `PA cidade pequena`).
   - Botão **`Copiar Prompt C`** + `<details>` do prompt + chips Pré-Porta (`hab-18`, `hab-22`, `hab-10`, `hab-3`, `hab-4`) + registro rápido no LOG (`eixo: 'E4'`).

4. **Micro-dose 10 min (Prompt D — Internato):**
   - Switch entre **Opção 1 (Variante relâmpago de 1 queixa)** e **Opção 2 (Debriefing de paciente real — com banner LGPD obrigatório)** onde o usuário preenche apenas `idade aproximada, sexo, queixa, o que perguntou/examinou e conclusão` (passa por `sanitizePiiText` antes de montar o prompt!).
   - Botão **`Copiar Prompt D`** + registro rápido no LOG.

5. **Log & Rotina (`LOG.md` + `NAO_PODE_PASSAR.md` + Segunda-Feira):**
   - **Banner da Regra de Segunda-Feira (`[SERVIÇO]`):** exibe a frase literal pronta (*"Posso fazer a anamnese desse paciente e você me diz, em 1 minuto, a pergunta mais importante que eu não fiz?"*) + botão **`Registrar observação [SERVIÇO]`** + status semanal (`Feito esta semana` / `Pendente`).
   - **Seletor de Fase (`Piloto 21–29/nov` | `Férias` | `Internato`):** exibe o checklist leve da semana (sem bloquear uso): ex. na Fase Férias, marcação rápida de `10 min EF num familiar` e `5 min ouvindo gravação` da semana atual.
   - **Tabela consolidada do LOG** (filtrável por eixo/queixa/`[SERVIÇO]`) + botões **`Copiar LOG.md`** e **`Copiar NAO_PODE_PASSAR.md`** formatados exatamente no padrão de `docs/piloto/`.

---

## 3. Modelo de Dados e Regras Puras

### Tipos em `src/data/treino_clinico_data.ts`
```ts
export type TreinoEixo = 'E1' | 'E3' | 'E4' | 'D' | 'SERVICO';
export type TreinoSessionKind = 'porta_nova' | 'variante' | 'prescricao' | 'grave' | 'microdose' | 'servico';
export type TreinoVeredito = 'dominado' | 'repetir';
export type TreinoFase = 'piloto' | 'ferias' | 'internato';

export interface TreinoQueixaDef {
  id: string;            // 'q-01' .. 'q-16'
  num: number;           // 1 .. 16
  titulo: string;        // 'Dor torácica', ...
  relatedHabIds: string[]; // links para 05_Habilidades_Clinicas (hab-1..hab-22)
}

export interface TreinoLogEntry {
  id: string;
  dateIso: string;       // YYYY-MM-DD
  eixo: TreinoEixo;
  kind: TreinoSessionKind;
  queixaId?: string;     // 'q-01'..'q-16' quando aplicável
  queixaLabel: string;   // ex.: 'Dor torácica' ou 'Prescrição — UPA'
  hipoteses60s: boolean | null; // null quando não aplicável (ex.: E3 escrito)
  pemc: string;          // 'nenhuma' ou texto curto sanitizado
  fala: string;          // observação curta de fala/execução
  veredito: TreinoVeredito;
  isServico?: boolean;   // tag [SERVIÇO]
}

export interface TreinoClinicoState {
  fase: TreinoFase;
  logs: TreinoLogEntry[];
  naoPodePassarByQueixaId: Record<string, string[]>; // máx. 6 linhas por queixa
  weeklyRitualsByWeekIso: Record<string, { efFamiliar?: boolean; ouvirAudio?: boolean }>;
}
```

### Mapeamento Exato das 16 Queixas → Cartões Pré-Porta (`hab-1`..`hab-22`)
| # | Queixa | Cartões Pré-Porta (`relatedHabIds`) |
|---|---|---|
| 1 | Dor torácica | `hab-5`, `hab-12`, `hab-18`, `hab-11` |
| 2 | Dor abdominal | `hab-7`, `hab-11`, `hab-13` |
| 3 | Cefaleia | `hab-9`, `hab-11` |
| 4 | Dispneia | `hab-6`, `hab-5`, `hab-13`, `hab-14`, `hab-18` |
| 5 | Tontura / síncope | `hab-9`, `hab-5`, `hab-12`, `hab-20` |
| 6 | Febre no adulto | `hab-11`, `hab-18`, `hab-17` |
| 7 | Febre na criança | `hab-10`, `hab-11`, `hab-18` |
| 8 | Lombalgia | `hab-8`, `hab-9`, `hab-11` |
| 9 | Disúria / sintomas urinários | `hab-11`, `hab-17` |
| 10 | Dor pélvica / sangramento em mulher em idade fértil | `hab-3`, `hab-7`, `hab-18` |
| 11 | Garganta, ouvido, olho vermelho | `hab-20`, `hab-17` |
| 12 | Ferida / trauma leve de membro | `hab-21`, `hab-8`, `hab-18` |
| 13 | PA elevada assintomática ou sintomática | `hab-5`, `hab-12`, `hab-9`, `hab-17` |
| 14 | Palpitação / ansiedade (orgânico × psiquiátrico) | `hab-12`, `hab-5`, `hab-1`, `hab-16` |
| 15 | Agitação / intoxicação / abstinência | `hab-18`, `hab-17`, `hab-16`, `hab-9` |
| 16 | Ideação suicida / risco | `hab-16`, `hab-1`, `hab-17` |

### Motor Puro em `src/engine/treinoClinico.ts`
- `computeQueixaStatus(queixaId, logs, todayIso)`:
  - `pendente`: 0 sessões.
  - `dominada`: **2 sessões de variante inédita seguidas** com `hipoteses60s === true` e `pemc === 'nenhuma'` (além de sinalizar `needsReview: true` se última sessão > 21 dias).
  - `com_pemc`: última sessão teve PEMC diferente de `'nenhuma'`.
  - `em_treino`: já treinada, mas ainda sem 2 variantes limpas seguidas.
- `suggestVarianteRelampago(activeQueixaId, logs, todayIso)`:
  - Prioridade 1: queixa diferente da atual treinada entre **3 e 5 dias atrás**.
  - Prioridade 2: queixa diferente da atual com status `com_pemc`.
  - Prioridade 3: queixa `dominada` com `needsReview` (> 21 dias).
  - Caso contrário: `'nenhuma'`.
- `computeTreinoMetrics(logs, todayIso)`:
  - `pct3H60s`: fração de sessões aplicáveis (`hipoteses60s !== null`) com `true` (meta `≥ 80%`).
  - `pctPemc`: fração de sessões com PEMC real (meta `→ 0%`).
  - `dominadasCount`: total de queixas com status `dominada` (sobre 16).
  - `servicoDoneThisWeek`: se já existe entrada `isServico === true` na semana corrente (seg–dom).
- `buildPromptA / buildPromptB / buildPromptC / buildPromptD`: geram exatamente os prompts da v3.0 preenchidos com os seletores da tela (Prompt D sanitiza texto com `sanitizePiiText`).
- `formatLogMarkdown(logs)` e `formatNaoPodePassarMarkdown(map)`: geram texto idêntico ao formato de `docs/piloto/LOG.md` e `docs/piloto/NAO_PODE_PASSAR.md`.

---

## 4. Mapa Cirúrgico de Arquivos (Criar vs. Editar)

### Arquivos Novos (4)
1. `src/data/treino_clinico_data.ts` — Catálogo das 16 queixas com `relatedHabIds`, presets dos Prompts B/C, frase literal da segunda-feira e constantes da v3.0.
2. `src/engine/treinoClinico.ts` — Lógica pura (status, métricas, sugestão de variante, geradores de prompt, exportadores Markdown e migração defensiva de `TreinoClinicoState`).
3. `src/components/TreinoClinicoView.tsx` — UI completa da aba `Treino Clínico` (master-detail responsivo, gerador de prompts, log rápido, `Não Pode Passar`, rotina e exportação).
4. `tests/treino_clinico.test.ts` — Testes unitários (domínio em 2 variantes seguidas, quebra de sequência com PEMC, sugestão de variante 3–5d, cálculo de métricas, sanitização LGPD no Prompt D, exportação Markdown e round-trip de `BackupModal` v2).

### Arquivos Editados (7 — alterações pontuais)
1. `src/data/central6ano_data.ts` — Adicionar `treinoClinico?: TreinoClinicoState` na interface `Central6AnoState`.
2. `src/engine/central6ano.ts` — Normalizar `treinoClinico: migrateTreinoClinicoState(state.treinoClinico)` dentro de `migrateCentral6AnoState`.
3. `src/state/store.ts` — Adicionar 4 ações no `cockpitStore`: `addTreinoLogEntry`, `deleteTreinoLogEntry`, `setTreinoNaoPodePassar`, `setTreinoFase` e `toggleTreinoWeeklyRitual` (com `sanitizePiiText`).
4. `src/components/TeoriaView.tsx` — Adicionar barra superior com switch segmentado `Treino Clínico` (padrão) | `Guias Teóricos (7)` e receber prop `onNotify: (msg: string) => void`.
5. `src/App.tsx` — Passar `onNotify={notify}` para `<TeoriaView />`.
6. `src/components/TopBar.tsx` — Atualizar label da aba `'teoria'` de `'Teoria'` para `'Treino & Teoria'` (mantendo id `'teoria'` e hash `#/6ano/teoria`).
7. `package.json` — Adicionar `tests/treino_clinico.test.ts` ao script `npm test`.

---

## 5. Ordem de Execução (Amanhã, em 1 Passada)

1. **Base pura e testada:** criar `src/data/treino_clinico_data.ts`, `src/engine/treinoClinico.ts` e `tests/treino_clinico.test.ts`.
2. **Persistência e Backup:** ligar `treinoClinico` em `central6ano_data.ts`, `central6ano.ts` e `store.ts` + cobrir backup/restore v2 nos testes.
3. **Interface:** criar `src/components/TreinoClinicoView.tsx` e plugar em `TeoriaView.tsx`, `App.tsx` e `TopBar.tsx`.
4. **Verificação obrigatória:** rodar em um único comando `npm run typecheck && npm test && npm run build` e conferir visualmente a tela em modo claro e escuro (desktop + mobile).

### Critérios de Aceite
- [ ] Copiar o Prompt A para **Dor torácica** (variante `"nenhuma"`) funciona em 1 clique com toast de confirmação.
- [ ] Registrar uma sessão de 1 linha atualiza instantaneamente as métricas (`3H aos 60s`, `PEMC`, status da queixa) e persiste após reload.
- [ ] Quando há PEMC, o card `Não Pode Passar` libera edição de até 6 linhas por queixa.
- [ ] Os 7 guias antigos continuam 100% acessíveis no switch `Guias Teóricos (7)` e os 22 cartões de `05_Habilidades_Clinicas/` não sofrem nenhuma alteração.
- [ ] Exportar/importar JSON no `BackupModal` preserva todos os logs de treino e listas `Não Pode Passar`.
- [ ] `npm run typecheck`, `npm test` e `npm run build` passam com zero erros.
