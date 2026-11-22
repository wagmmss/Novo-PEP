# Plano Mestre — Curso de Habilidades Clínicas (v3.1 — Pré-Congelamento)

> **Alvo:** chegar ao CRM próprio (2028: porta de UPA, pronto atendimento de cidade pequena, UBS) conduzindo a consulta comum **dirigida por hipótese desde o bloco inicial**, sem esquecer a pergunta ou a manobra que muda a conduta, prescrevendo com segurança e explicando ao paciente com clareza e firmeza.
> **Diagnóstico que orienta o plano:** a base teórica de prova é forte (~85–90%). O gargalo real é de execução: (1) as hipóteses vêm **depois** da coleta, que fica genérica; (2) o roteiro existe, mas falha na hora e o ponto decisivo é esquecido (PEMC); (3) às vezes o roteiro não existe; (4) a fala com o paciente ainda tem muletas e pouca estrutura.
> **Formato:** **voz de ida + texto de volta** no **ChatGPT ou Gemini** (app/web com ditado) — você responde falando (treinando a fala) e a IA responde por texto (modelo com raciocínio profundo, **sem** modo Live). Texto bilateral apenas para redigir prescrição e evolução (Prompt B). Orquestração complementar de **Claude** (auditoria sob gatilho) e **Antigravity** (ritual semanal no repositório) detalhada no §2.6.
> **Regra de ouro:** este documento será **congelado em 29/nov/2026**. A única revisão programada acontece em **24/jan/2027** (15 min após o caso de baseline), usando somente o `LOG.md` e a sondagem pareada de transferência. Não há novas rodadas de planejamento nem produção de material novo fora do §4.
> **Documentos arquivados em `docs/arquivo/`:**
> - `docs/arquivo/PLANO_CURSO_HABILIDADES_CLINICAS_v2.1.md` (versão anterior)
> - `docs/arquivo/RELATORIO_REVISAO_PLANO_HABILIDADES_CLINICAS.md` (revisão da v2.1)
> - `docs/arquivo/PLANO_IMPLEMENTACAO_NOVO_PEP_TREINO_CLINICO.md` (spec técnica para `Novo-PEP` — adiada/pós-piloto conforme §6)

---

## §1. Ementa: 4 Eixos com Pesos Curriculares (45 / 20 / 20 / 15)

> **Nota sobre os pesos (v3.0 → v3.1):** ajustados de `50/20/20/10` para **`45/20/20/15`**. São pesos curriculares (com E2 embutido em E1/E3/E4): uma quinta de 30 min de C representa ~10% dos ~290 min nominais de uma semana cheia das férias.

### E1 — Porta Comum Dirigida por Hipótese (45%) — *núcleo*
Integra anamnese dirigida, raciocínio sob incerteza e exame físico de alto valor nos mesmos casos.

**Ações demonstráveis (verificáveis na transcrição; o relógio é seu):**
- **Em um bloco privado do treino após a triagem (mensagem começando com `3H:`), antes de falar com o paciente:** dizer **3 hipóteses** — a mais **provável**, a **perigosa** e a que **não pode passar** (meta no seu cronômetro: ≤ 60 s). *Regra de validade:* `3H_bloco = S` só se a mensagem `3H:` trouxer 3 hipóteses plausíveis cobrindo os três perfis (só o prefixo `3H:` não conta).
- Fazer apenas perguntas e manobras que **discriminam** essas hipóteses (sem anamnese genérica nem ISDA cega).
- Antes de encerrar, responder à pergunta de segurança: **"Qual grave ainda está em aberto e o que você fará a seguir?"**
- No exame físico, nomear a manobra específica e como executá-la (ex.: *"Murphy"*, *"HINTS: head impulse, nistagmo, skew"*), nunca *"examino o abdome"*.

**Progressão clínica em 2 níveis (anti-caso caricato):**
- **Nível 1 — Base / Alto Risco (`Nova`, Prompt A):** quadro prevalente de porta + diagnóstico letal clássico a afastar. Objetivo: fixar roteiro, 3H antes da entrevista e discriminadores.
- **Nível 2 — Variante Realista (`Var`, Prompt D(1)):** caso clinicamente distinto do anterior (mecanismo diferente) por 1 de 3 caminhos — *(a)* terreno enganoso/atípico (idoso, diabético, mulher, etilista, paciente psiquiátrico — viés de *framing*), *(b)* diagnóstico gêmeo confundível ou *(c)* zona cinzenta de disposição (alta vs. observação com recurso limitado).

**As 20 queixas-núcleo (identificador estável `slug` + ordem de treino):**

| # | Slug estável | Queixa-núcleo | Observação / Bloco visual |
| :---: | :--- | :--- | :--- |
| 1 | `dor-toracica` | Dor torácica | Bloco obrigatório: ECG/RX real |
| 2 | `dor-abdominal` | Dor abdominal | — |
| 3 | `cefaleia` | Cefaleia | — |
| 4 | `dispneia-adulto` | Dispneia no adulto | Bloco obrigatório: ECG/RX real |
| 5 | `tontura-sincope` | Tontura / síncope | Bloco obrigatório: ECG real |
| 6 | `febre-adulto` | Febre no adulto | — |
| 7 | `febre-crianca` | Febre na criança | — |
| 8 | `dispneia-crianca` | Desconforto respiratório / chiado / tosse na criança | — |
| 9 | `vomitos-diarreia` | Vômitos / diarreia / desidratação (adulto e criança) | — |
| 10 | `lombalgia` | Lombalgia | — |
| 11 | `disuria-urinario` | Disúria / sintomas urinários | — |
| 12 | `go-aguda` | Queixa gineco-obstétrica aguda (dor pélvica, sangramento 1º–3º tri, queixa em gestante) | — |
| 13 | `ivas-orl-olho` | IVAS (tosse, garganta, ouvido) e olho vermelho | — |
| 14 | `pele-tvp-alergia` | Pele, partes moles, edema de membro (TVP) e alergia/urticária | — |
| 15 | `ferida-trauma-leve` | Ferida / trauma leve de membro | — |
| 16 | `pa-elevada` | PA elevada assintomática ou sintomática | — |
| 17 | `palpitacao-ansiedade` | Palpitação / ansiedade (orgânico × psiquiátrico) | Bloco obrigatório: ECG real |
| 18 | `agitacao-intox-abstinencia` | Agitação / intoxicação / abstinência | — |
| 19 | `ideacao-suicida` | Ideação suicida / risco | — |
| 20 | `sensorio-focal-glicemia` | Alteração aguda do sensório / déficit focal / alteração glicêmica | **Reservada para `[BASELINE]` — fora da ordem de treino até 24/jan/2027** |

### E2 — Comunicação Clínica e Apresentação Oral (20%) — *embutido em E1/E3/E4*
Não tem sessão avulsa; é treinado nas sessões de E1 (Prompts A e D(1)) e nas passagens/regulações de E3 e E4. O LLM avalia a ordem dos turnos e estima palavras da transcrição (com margem perto do corte); ritmo, pausas e duração real ficam com seu cronômetro e a gravação semanal.

**5 ações demonstráveis:**
1. **Abertura estruturada:** nome/função, agenda (*"o que mais te preocupa hoje?"*) e aviso das etapas.
2. **Apresentação ao preceptor (`≤ ~220 palavras`, meta no seu cronômetro ≤ 90 s — no Prompt A):** *one-liner* com qualificadores → hipótese principal → grave em aberto/afastado → plano.
3. **Explicação leiga (`≤ ~150 palavras`, meta no seu cronômetro ≤ 60 s) + *teach-back*:** o que acho, o que afastei, o que vamos fazer, quando voltar — confirmando com as palavras do paciente.
4. **Firmeza respeitosa sob atrito:** negar demanda indevida ou lidar com tensão mantendo o vínculo.
5. **Comunicação em equipe/crise:** circuito fechado (E4) e passagem/regulação SBAR com dono das pendências (E3/E4).

**Modificador de Atrito E2 (apenas nas variantes `Var` via Prompt D(1)):** a IA **sorteia ocultamente** um tipo compatível com a queixa, encena durante a consulta/teach-back e só revela no feedback (o aluno nunca escolhe antes):
- `nenhum` | `Tipo A` (demanda indevida: ATB, exame, "remédio pra PA" ou atestado) | `Tipo B` (história vaga / família ansiosa ou interrompendo) | `Tipo C` (conversa sensível / risco / estigma / aliança sob tensão).

**Rubrica E2 (`0–4`):**
- No **Prompt A (`Nova`):** `[1]` Estrutura/agenda · `[2]` Apresentação ≤ ~220 palavras · `[3]` Explicação leiga ≤ ~150 palavras + *teach-back* · `[4]` Firmeza e clareza.
- No **Prompt D(1) (`Var`, 10–12 min):** `[1]` Estrutura/agenda · `[2]` Pergunta de segurança objetiva · `[3]` Explicação leiga ≤ ~150 palavras + *teach-back* · `[4]` Firmeza e clareza sob o Atrito E2 encenado.
*(Muletas vocais, ritmo e pausas são medidos à parte na gravação semanal em `[GRAVAÇÃO]`.)*

### E3 — Prescrição Segura, Disposição e Seguimento (20%)
**Definição canônica única das 7 Travas `A-R-G-I-V-P-O` (Módulo 06, Cartão 17 e Prompt B):**
**A**lergias (reação) · **R**im/Fígado (medida renal exigida para o fármaco e avaliação hepática pertinente) · **G**estação/Lactação · **I**nterações · **V**ia/Velocidade/Diluição · **P**eso/Idade · **O**bjetivo (meta e prazo) **+ Disponibilidade local (REMUME e estoque do turno)**.

**Os 8 arquétipos (identificador estável + alvo):**

| # | Slug estável | Arquétipo E3 | Rubrica |
| :---: | :--- | :--- | :---: |
| 1 | `e3-atb-empirico` | Antibiótico empírico limítrofe (adulto): indicação real, esquema, receita 2 vias/duração, reavaliação | E3-Porta |
| 2 | `e3-pediatria-ponderal` | Prescrição pediátrica ponderal + teto máximo + tradução em mL/gotas + alta segura | E3-Porta |
| 3 | `e3-analgesia-travas` | Analgesia escalonada em terreno de risco (DRC, idoso, gestante, dengue, HDA, QTc) | E3-Porta |
| 4 | `e3-ev-alto-risco` | Prescrição EV de alto risco em observação 24h (K⁺/Na⁺, insulina, anticoagulação + SBAR) | E3-Porta |
| 5 | `e3-cronico-conciliacao` | Descompensação crônica (IC/DPOC/DM/HAS) + conciliação (manter/suspender/retomar/ajustar) | E3-Porta |
| 6 | `e3-regulacao-cross` | Limites do serviço (PA pequeno sem lab) + estabilização local + regulação (SBAR alvo ~60 s) | E3-Porta |
| 7 | `e3-alta-cinzenta-recusa` | Alta defensável em zona cinzenta ou recusa terapêutica / alta a pedido | E3-Porta |
| 8 | `e3-ubs-longitudinal` | Seguimento longitudinal na UBS pós-UPA / multimorbidade *(**regra explícita: entra somente após 24/jan/2027**)* | E3-UBS |

**Rubricas E3 (`0–4` — erro ou atraso crítico impede `4/4`):**
- **E3-Porta (`#1`–`#7`):** `[1]` Disposição defensável compatível com os recursos do turno · `[2]` Zero erro crítico nas travas `A-R-G-I-V-P-O` + Disponibilidade local · `[3]` Prescrição ou SBAR de regulação executável (dose, via, diluição/velocidade/duração) · `[4]` Rede de segurança fechada (alarmes objetivos, prazo, dono dos pendentes).
- **E3-UBS (`#8`):** `[1]` Conferiu o que o paciente realmente conseguiu fazer pós-UPA · `[2]` Conciliou medicações · `[3]` Priorizou 2–3 demandas factíveis · `[4]` Fechou prazo de retorno + responsável por pendências.

### E4 — Paciente Grave, Deterioração e Multi-Paciente (15%)

**Os 7 cenários obrigatórios (identificador estável + alvo):**

| # | Slug estável | Cenário E4 |
| :---: | :--- | :--- |
| 1 | `e4-deterioracao-silenciosa` | Deterioração silenciosa na observação (sepse/choque oculto, FR alta, confusão nova, índice de choque ≥ 1) |
| 2 | `e4-va-insuf-resp` | Via aérea ameaçada e insuficiência respiratória grave (EAP/VNI, DPOC/asma, decisão e preparo de SRI; **anafilaxia com edema de glote/choque entra como variante deste cenário**) |
| 3 | `e4-arritmia-pcr` | Arritmia instável (cardioversão/MCP/atropina) + transição deterioração → PCR / pós-RCE inicial *(parte motora em manequim/serviço)* |
| 4 | `e4-multipaciente` | Multi-paciente / priorização simultânea (observação descompensando + chegada grave + demanda barulhenta) |
| 5 | `e4-crianca-grave` | Chegada inesperada: criança grave (desconforto respiratório, choque/desidratação grave, mal convulsivo) |
| 6 | `e4-gestante-grave` | Chegada inesperada: gestante ou puérpera grave (pré-eclâmpsia grave/eclâmpsia, HPP) |
| 7 | `e4-trauma-hemorragia` | Chegada inesperada: trauma com hemorragia / membro ameaçado (X-ABCDE, controle mecânico, tranexâmico, transferência) |

> *Justificativa E4 #2:* anafilaxia fica como variante explícita do `#2` porque compartilha a mesma prioridade imediata de ameaça de via aérea/perfusão (`A/B/C` em < 60 s) e mantém exatamente 7 cenários para fechar a 1ª passada nas 7 semanas até 24/jan.

**Rubrica E4 (`0–4` — erro ou atraso crítico impede `4/4`):**
`[1]` Reconhecimento precoce + chamada de ajuda no limite do serviço · `[2]` ≥ 2 ordens dirigidas em circuito fechado (exigindo dose, via e velocidade quando aplicáveis) · `[3]` Estabilização correta compatível com os recursos · `[4]` Prazo e gatilho objetivo de reavaliação (no `#4` multipaciente, avaliar sequência `A→B→C→D` e quem fica responsável pelo primeiro paciente).

---

## §2. Anatomia da Sessão, Exames Reais e Segurança Clínica

1. **Separação obrigatória de chats e prompts (`Var` vs. `Nova`):**
   - A **Variante Relâmpago (`Var`, Nível 2)** roda com o **Prompt D(1)** (totalmente autocontido) em **chat próprio (10–12 min)**.
   - A **Queixa Nova (`Nova`, Nível 1)** roda com o **Prompt A** em **outro chat novo (25–30 min)**.
   - O **Prompt A não é usado para `Var`** nas férias.
   - **Regra de teto de tempo:** *Ao atingir o teto, registre a primeira tentativa. Se a refação integral não couber, use uma vaga de reserva. `Min` inclui chat e `LOG.md`, com a checagem de fontes no bloco próprio.*
2. **Sessão de Queixa Nova (Prompt A, 25–30 min):**
   1. A IA trava os dados do caso antes de abrir e apresenta apenas triagem, sinais vitais e recursos do turno.
   2. **Bloco privado inicial (antes de falar com o paciente):** você envia uma mensagem começando com `3H:` com suas **3 hipóteses** (meta própria: ≤ 60 s); a IA responde apenas *"registrado"* e segue como paciente.
   3. Anamnese e exame por voz: paciente responde em linguagem leiga a tudo que a pergunta cobre (inclusive perguntas abertas pertinentes), mas nunca entrega discriminador espontaneamente. Exame físico genérico recebe *"sem achado específico disponível"*, sem sugerir a manobra; achados só saem para a manobra nomeada. Em instabilidade, priorize estabilização. A IA aceita hipóteses plausíveis e discriminadores equivalentes.
   4. Pergunta de segurança (*"Qual grave ainda está em aberto e o que você fará a seguir?"*) → apresentação ao preceptor (`≤ ~220 palavras`) → explicação ao paciente (`≤ ~150 palavras`) + *teach-back*.
   5. **Feedback seco (zero elogio genérico):** **(a)** PEMC, **(b)** `3H_bloco`, **(c)** Rubrica E2 (`0–4`) + 1 ajuste concreto.
   6. **Refação:** se não gerou 3H ou o roteiro não existia, a IA mostra o modelo em até 2 min e você **refaz o mesmo caso desde a triagem** (se não couber no teto, registre a 1ª tentativa e use vaga de reserva). Caso contrário, refaz só o trecho falho. Micro-correção opcional de até 3 min (1 ponto só) apenas se houver erro de modelo mental.
   7. **Saída:** 1–2 pontos para checar + linha pronta do `LOG.md` (**registrando sempre a 1ª tentativa, antes de feedback e refação**; alvo preenchido como `slug:mecanismo` após o feedback; você preenche `Min` e `IA_Pista?`) + lista `Não Pode Passar` com tag `[CHECAR]` se houve PEMC.
3. **Sessão de Variante Relâmpago (Prompt D(1), 10–12 min):**
   - Mesmas regras explícitas de abertura (mensagem começando com `3H:`, IA responde só *"registrado"* e segue como paciente), caso travado, paciente realista e exame genérico (*"sem achado específico disponível"*), informando os mecanismos já usados nas linhas anteriores daquela queixa no `LOG.md` para garantir caso clinicamente distinto.
   - Fechamento compacto para caber em 10–12 min: *"Qual grave ainda está em aberto e o que você fará a seguir?"* → explicação leiga (`≤ ~150 palavras`) + *teach-back* com Atrito E2 encenado (sorteado ocultamente) → feedback seco (PEMC / 3H / E2 `0–4` revelando o atrito) → refação rápida só do trecho falho → 1 ponto para checar → linha do LOG da **1ª tentativa**.
4. **Exames complementares (sem spoiler e sem leitura de laudo):**
   - **Lab e gasometria:** entregues como **resultados com unidades, sem interpretação** (sem setas ↑/↓).
   - **ECG e RX reais (bloco visual obrigatório nas 4 semanas afetadas):** nas semanas de `dor-toracica`, `dispneia-adulto`, `tontura-sincope` e `palpitacao-ansiedade`, dedicar **1 bloco visual de 10 min no dia da queixa indicada** (que **soma** aos 10–15 min de checagem Nível 2, levando esse dia a ~70 min; se estendido aos 3 dias de A, o total nominal semanal vai a ~320 min) para ler **2 traçados/imagens reais sem laudo** (LITFL / Radiopaedia). No chat de voz, a IA descreve apenas achados primários objetivos quando pedidos.
5. **Regra anti-circularidade (Segurança Clínica):**
   - Os 88 protocolos PEP e os 22 cartões Pré-Porta do `Novo-PEP` foram gerados com IA — servem exclusivamente para **consulta rápida (Nível 1)**, **nunca** para validar doses ou condutas de risco.
   - **AMBOSS (fonte secundária) pode localizar a referência. Para retirar `[CHECAR]` ou validar conduta de risco, registre a diretriz, o protocolo oficial (MS/HC-FMRP) ou a bula profissional efetivamente consultada.** Divergências relevantes são levadas ao preceptor.
   - **Consenso entre IAs não é evidência:** ChatGPT, Gemini e Claude concordando entre si **nunca** retira `[CHECAR]` nem substitui diretriz/protocolo/bula.
6. **Protocolo dos 3 Agentes (Simulador × Claude × Antigravity — baixo atrito, zero retrabalho):**
   - **Simulador de Voz (ChatGPT ou Gemini — Seg–Sex, 1 agente por sessão):** conduz integralmente os Prompts `A`, `D(1)`, `B`, `C` e `D(2)` no dia a dia. Sem segunda opinião automática por sessão.
   - **Auditor Clínico / Red-Teamer (Claude — sob gatilho cirúrgico):** acionado **apenas** quando: *(i)* surgir dúvida clínica real, conduta limítrofe ou divergência após checagem inicial; *(ii)* for preciso estressar uma entrada crítica de `NAO_PODE_PASSAR.md` apontando o que conferir em diretriz/protocolo/bula; ou *(iii)* o simulador ficar previsível ou gerar `IA_Pista = S` repetido (Claude gera um caso/variante selado inédito para o simulador apenas encenar).
   - **Orquestrador de Sistema & Métricas (Antigravity — 1×/semana, 10–15 min + marcos 29/nov, 10/jan, 24/jan):** lê `LOG.md` e `NAO_PODE_PASSAR.md`, calcula `3H_bloco` (numerador/denominador), taxa de `PEMC`, queixas dominadas e `IA_Pista`, verifica gatilhos de contingência, aplica **correções reativas (just-in-time)** apenas quando um erro real aparecer em cartão/guia/módulo, mantém arquivos sincronizados e commita no repositório.

---

## §3. Piloto (21 a 29/nov/2026) + Sondagem de Transferência

O piloto valida os **4 prompts (A, D(1), B e C)**, o fluxo por voz e a computabilidade do `LOG.md` antes do congelamento definitivo:

| Data | Sessão | Prompt | Teto |
| :--- | :--- | :---: | :---: |
| Sáb 21/nov | `dor-toracica` (`Nova`, Nível 1) | A | ≤ 45 min |
| Ter 24/nov | `dor-toracica` (`Var`, Nível 2, chat 1) + `dor-abdominal` (`Nova`, Nível 1, chat 2) | D(1) + A | ≤ 45 min |
| Sex 27/nov | `e4-deterioracao-silenciosa` | C | ≤ 30 min |
| Sáb 28/nov | `e3-atb-empirico` | B | ≤ 40 min |
| Dom 29/nov | **Sondagem de transferência (`[BASELINE]` — ≤ 30 min)** + **Auditoria do `LOG.md` e Congelamento v3.1 (15 min)** | A / — | ≤ 45 min |

- **Critério de sucesso por sessão do piloto:** (1) cabe no tempo previsto (`Min`, que inclui chat e LOG, com checagem de fontes no bloco próprio), (2) `IA_Pista = N` (avaliado por você, inclusive no Prompt B) e (3) a linha do `LOG.md` sai pronta em ≤ 2 min. *Em 21/nov (Sessão 1), testar apenas o teto do Prompt A; o teste de troca de chat, latência e teto de 45 min para `D(1) + A` acontece em 24/nov. Ao atingir o teto, registrar a 1ª tentativa e usar vaga de reserva se a refação integral não couber.*
- **Sondagem de transferência em simulação (`[BASELINE]` — 29/nov vs. 24/jan):**
  - Queixa reservada fora da ordem de treino até 24/jan: **`sensorio-focal-glicemia` (#20)**.
  - **Preparo antes de 29/nov:** os **casos A (29/nov) e B (24/jan) são gerados pelo ChatGPT, entregues em arquivo e colados sem leitura prévia** no campo `CASO FIXO (só BASELINE)` do Prompt A, com gravidade, carga de informação e dificuldade dos discriminadores semelhantes (`Nova`, `UPA com retaguarda`, paciente idoso, teto ≤ 30 min). Guardar o Caso B de janeiro e as chaves **fora dos chats de treino**.
  - **Execução:** usar chats novos e a mesma rubrica. Em **29/nov**, mostrar **só a linha do LOG com `PEMC: S/N`**, sem revelar a omissão, refazer, aplicar micro-correção, indicar estudo desse caso nem criar `Não Pode Passar`. Até **24/jan**, não selecionar deliberadamente os casos nem seu discriminador-alvo para treino.
  - **Leitura em 24/jan (reservar os 15 min de revisão após o Caso B, cujo teto é 30 min):** comparar `3H`, ocorrência de `PEMC` e `E2` por critério (`[1]`–`[4]`). Se houver pista (`IA_Pista? = S`), marcar a comparação como **inconclusiva**.

---

## §4. Orçamento, Calendário Real das Férias e Rotina do Internato

### Fase Férias — 30/nov/2026 a 22/jan/2027 (`~290 min` por semana cheia, Seg–Sex; Sáb/Dom 0 min)
Dentro do orçamento total de estudo (~22h/sem em 5 dias úteis, com 2 dias de descanso total):

| Dia | Atividade | Tempo nominal |
| :--- | :--- | :---: |
| **Seg / Ter / Qua** | **Prompt D(1)** (`Var`, 10–12 min, chat 1) + **Prompt A** (`Nova`, 25–30 min, chat 2) + **10–15 min** de checagem de fontes / `NAO_PODE_PASSAR.md` *(nas semanas com imagem, **+1 bloco visual de 10 min** no dia da queixa indicada → ~300 min na semana; se estendido aos 3 dias, ~320 min)* | ~60 min/dia *(~70 min no dia de imagem)* |
| **Qui** | **Prompt C** (30 min) + **10 min** de exame físico real em familiar + **5 min** ouvindo a gravação semanal (`[GRAVAÇÃO]`) + **5–10 min** de checagem de fontes | ~55 min |
| **Sex** | **Prompt B** escrito (40 min) + **10–15 min** de checagem de fontes | ~55 min |
| **Sáb / Dom** | **Descanso total de habilidades** (sem exame físico nem gravação no FDS) | 0 min |

> **Teto operacional:** `Min` no `LOG.md` inclui chat e registro da linha; a checagem de fontes entra no bloco próprio acima. Ao atingir o teto do chat, registre a 1ª tentativa; se a refação integral não couber, use uma vaga de reserva.

**Calendário real das férias (Natal, Ano-Novo e Viagem):**
- **Piloto (`21–29/nov`):** `2 A (Nova) + 1 D(1) (Var) + 1 B + 1 C + 1 A ([BASELINE] Caso A)` *(4 dias de teste + 29/nov baseline)*.
- **5 semanas cheias** (`30/nov–04/dez`, `07–11/dez`, `14–18/dez`, `04–08/jan`, `18–22/jan`): `3 (D1+A) + 1 C + 1 B` por semana → `15 A + 15 D(1) + 5 C + 5 B`.
- **Semana de Natal (`21–23/dez`, folga 24–25/dez):** `2 (D1+A)` (Seg/Ter) + `1 C` (Qua 23/dez).
- **Semana de Ano-Novo (`28–30/dez`, folga 31/dez–01/jan):** `2 (D1+A)` (Seg/Ter) + `1 B` (Qua 30/dez).
- **Semana de Viagem (`11–17/jan`):** **pausa total (`0` sessões)**.
- **24/jan/2027:** `1 A ([BASELINE] Caso B)` + `15 min` de revisão do `LOG.md`.
- **Totais até 24/jan/2027:** **`19 A de primeira passada + 2 A de reserva/reteste + 2 A de baseline, 20 D(1), 7 B e 7 C`**.
- **Uso das vagas de `D(1)`:** para chegar às `≥ 6` dominadas, priorizar `D(1)` para **retestar queixas com falha recente e confirmar sequências em dias distintos**, antes da manutenção de ~21 dias.
- **Meta realista até 24/jan/2027:** **1ª passada completa em E1 (`19/20 + baseline`), E3-Porta (`7/7`) e E4 (`7/7`) + `≥ 6` queixas dominadas no E1**. *(Se a contingência de 10/jan disparar, a meta de 1ª passada cede — §7.)* O domínio de E3 e E4 fica para a Fase Internato.

### Fase Internato — a partir de 25/jan/2027 (~60–75 min/semana)

| Frequência | Atividade | Tempo |
| :--- | :--- | :---: |
| **3×/semana** *(dias úteis livres de pós-plantão)* | **Micro-dose (Prompt D):** variante relâmpago `D(1)` **ou** debriefing real `D(2)` | 10 min |
| **1×/semana** *(fim de semana ou dia livre)* | 1 caso completo (30–40 min), alternando `A → B → C` (incluindo `e3-ubs-longitudinal` **após 24/jan**) | 30–40 min |
| **Toda segunda-feira** | **Observação em serviço `[SERVIÇO]`** (§7) | 3–5 min |

- **Proteção pós-plantão noturno (inegociável):** **ZERO** micro-dose e **ZERO** treino de habilidades no dia de pós-plantão.
- **Piso mínimo em semanas pesadas (2+ plantões de 12h):** manter apenas **1 Micro-dose (10 min)** em dia livre + o pedido `[SERVIÇO]` de segunda-feira. Sem dívida acumulada.

### Ponte com os Rodízios de 2027 (alinhado a `src/data/central6ano_data.ts`)

| Rodízio (2027) | Alvos prioritários (E1 / E3 / E4) | Pedido `[SERVIÇO]` adaptado | Procedimentos (`Logbook 3x`) |
| :--- | :--- | :--- | :--- |
| **Cirurgia Geral** (`jan–fev`) | `dor-abdominal`, `ferida-trauma-leve`, `e3-analgesia-travas`, `e4-trauma-hemorragia` | Anamnese/exame abdominal dirigido (1 min) | Sutura, SVD, SNG, curativos |
| **Anestesio / CTI** (`fev–mar`) | `dispneia-adulto`, `e3-ev-alto-risco`, `e4-va-insuf-resp`, `e4-deterioracao-silenciosa` | Ordem/SBAR ou avaliação de via aérea | BVM, IOT, gaso arterial, CVC |
| **GO** (`mar–mai`) | `go-aguda`, `pa-elevada` (gestante), `e4-gestante-grave` | Queixa aguda GO ou interpretação CTG | Especular, toque obs., parto/episiorrafia |
| **Oftalmo / ORL** (`mai`) | `ivas-orl-olho`, `tontura-sincope` (HINTS), `cefaleia` | Manobra focal (HINTS / otoscopia / olho) | Otoscopia, fluoresceína, tamponamento |
| **MFC** (`mai–jun`) | `e3-ubs-longitudinal` *(após 24/jan)*, `pa-elevada`, `lombalgia`, `disuria-urinario` | Explicação + *teach-back* ou conciliação | ICE + *teach-back*, rastreio/conciliação |
| **Clínica Médica** (`jun–jul`) | `dor-toracica`, `febre-adulto`, `e3-cronico-conciliacao`, `e3-atb-empirico` | Apresentação ≤ 90 s ou travas da prescrição | Paracentese, toracocentese, PL |
| **Pediatria** (`jul–ago`) | `febre-crianca`, `dispneia-crianca`, `vomitos-diarreia`, `e3-pediatria-ponderal`, `e4-crianca-grave` | Conduta/prescrição ponderal + sinais de alarme | Otoscopia pediátrica, sala de parto, diluições |
| **Emergência & Trauma** (`ago–out`) | `sensorio-focal-glicemia`, `pele-tvp-alergia`, `e3-regulacao-cross`, `e4-arritmia-pcr`, `e4-multipaciente` | Priorização de sala vermelha / SBAR | e-FAST, SRI/cardioversão, dreno de tórax |

> **Nota explícita (Rodízios × §6):** procedimentos invasivos (CVC, paracentese, toracocentese, PL, dreno) e POCUS/e-FAST estão **adiados no treino simulado (§6)**; no serviço, se surgirem com supervisão presencial, registrar no **Logbook 3x**.

### Arquivos permitidos e regras de manutenção
- `docs/piloto/LOG.md`: 1 linha por sessão (§7).
- `docs/piloto/NAO_PODE_PASSAR.md`: lista por queixa (≤ 6 linhas), só após PEMC real, obrigatoriamente com tag `[CHECAR]` até conferência em diretriz, protocolo oficial ou bula profissional.
- **22 cartões de `05_Habilidades_Clinicas/`:** não editar para expandir ou reescrever. **Exceção explícita:** edição pontual permitida **apenas** para corrigir erro clínico ou divergência estrutural comprovada (como as correções de sigla e segurança clínica aplicadas no **Cartão 17** nesta v3.1), sempre registrada no changelog.
- **Procedimentos motores:** registrados exclusivamente no **Logbook 3x** já existente no `Novo-PEP` (`6º Ano → Prática → Logbook 3x`), sem criar caderneta paralela.

---

## §5. Prompts Operacionais (~1 tela cada, autocontidos e blindados)

> **Uso (voz de ida + texto de volta):** cole no **ChatGPT ou Gemini** (modelo com raciocínio profundo, **sem** modo Live), responda por voz/gravação e leia em texto.
> **Plano B de voz:** se o microfone ou a transcrição do app travar, use o ditado do teclado (sistema/Gboard) ou digite no mesmo chat — nunca cancele a sessão por falha técnica.
> **LGPD:** no Prompt D(2), **nunca** informe nome, registro, cidade, data de nascimento ou qualquer dado identificável.

### Prompt A — Queixa Nova (`Nova`, Nível 1 — Voz, 25–30 min)
```markdown
Preceptor sênior de emergência do SUS conduzindo treino por VOZ (eu falo, você responde por texto) com interno do 6º ano (FMRP-USP).

CONFIGURAÇÃO:
- Tipo: [Nova (Nível 1: Base/Alto Risco) | BASELINE-A (29/nov) | BASELINE-B (24/jan)]
- Queixa: [slug — NOME DA QUEIXA]
- Serviço: [UPA com retaguarda | PA de cidade pequena sem laboratório no turno]
- Perfil: [padrão | paciente idoso (se BASELINE)]
- CASO FIXO (só BASELINE): [colar | nenhum]

REGRAS ESTRITAS:
1. Se CASO FIXO preenchido: use exatamente estes dados; não invente outros. Caso contrário, trave os dados do caso antes da triagem. Abra com triagem, sinais vitais e recursos do turno. Zero teoria, zero pistas.
2. Oculto: defina 3 hipóteses (provável, perigosa, não pode passar) e 3–6 discriminadores. Aceite hipóteses plausíveis e discriminadores equivalentes. Em instabilidade, priorize estabilização.
3. Envio uma mensagem começando com `3H:` antes de falar com o paciente; responda só "registrado" e siga como paciente. Não me lembre; apenas registre se enviei antes de qualquer pergunta. `3H_bloco = S` só se a mensagem `3H:` trouxer 3 hipóteses plausíveis cobrindo provável, perigosa e não pode passar; só o prefixo `3H:` não conta.
4. PACIENTE: responda em linguagem leiga a tudo que a pergunta cobre, inclusive a perguntas abertas pertinentes, sem entregar dado discriminador espontaneamente. Pergunta fechada = resposta curta.
5. EXAME FÍSICO: devolva só o achado da manobra nomeada. Para exame genérico ("examino o abdome"), responda exatamente: "sem achado específico disponível", sem sugerir a manobra.
6. EXAMES: se indisponível no turno, informe. Lab/gaso = resultados com unidades, sem interpretação nem setas. ECG/RX = achados primários objetivos sem diagnóstico.
7. Fechamento nesta ordem: (1) "Qual grave ainda está em aberto e o que você fará a seguir?"; (2) apresentação ao preceptor (≤ ~220 palavras); (3) explicação ao paciente (≤ ~150 palavras) + atue no teach-back.

FEEDBACK E SAÍDA (seco, zero elogio genérico — avalie a 1ª tentativa):
- Se Tipo = BASELINE-A (29/nov): NÃO revele omissão, NÃO refaça, NÃO dê micro-correção, NÃO indique estudo nem dite "Não Pode Passar". Dite APENAS a linha de LOG com Alvo = sensorio-focal-glicemia, PEMC = [S/N] e E2 = [X/4 (critérios 1-4)]. ENCERRE AQUI. Não liste pontos para checar nem dê qualquer outra saída.
- Se Tipo = Nova ou BASELINE-B:
  - Dê (a) PEMC, (b) 3H_bloco (S/N + qual faltou), (c) E2 0–4 ([1] Estrutura/agenda, [2] Apresentação ≤ ~220 pal., [3] Explicação ≤ ~150 pal. + teach-back, [4] Firmeza/clareza).
  - Apenas se Tipo = Nova e sem 3H ou sem roteiro: modelo em ≤ 2 min e refazer desde a triagem (se não couber no teto, fico na 1ª tentativa); senão (Nova), refazer só o trecho falho. Micro-correção ≤ 3 min (1 ponto só) se houver erro de modelo mental.
  - Liste 1–2 pontos para checar (AMBOSS pode localizar; validação final exige diretriz, protocolo oficial ou bula profissional).
  - Veredito da 1ª tentativa: Limpo APENAS se 3H_bloco = S e PEMC = nenhuma; senão Repetir.
  - Dite 1 linha de LOG (preencha `slug:mecanismo` em Nova depois do feedback; mantenha [__m] e [N/S] para eu preencher):
    DD/MM | [Nova/BASELINE] | [slug:mecanismo] | [__m] | [S/N] | [PEMC] | [X/4 (ajuste)] | [N/S] | [Limpo/Repetir]
  - Apenas se Tipo = Nova com PEMC: dite lista "Não Pode Passar" (≤ 6 linhas) com tag [CHECAR].
```

### Prompt B — Caso Integrado de Prescrição, Disposição e Seguimento (Escrito — E3)
```markdown
Preceptor sênior de emergência e APS do SUS. Treino ESCRITO de prescrição, disposição e seguimento (6º ano).

CONFIGURAÇÃO:
- Arquétipo: [e3-slug — NOME]
- Ambiente: [UPA com retaguarda | PA de cidade pequena sem lab | UBS (após 24/jan)]

REGRAS:
1. Oculte os quatro critérios da rubrica E3. Abra com o caso avaliado (história/exame resumidos, peso/idade, comorbidades, alergias, medicações em uso, recursos reais do turno).
2. Forneça os dados pertinentes quando solicitados ou declare que estão indisponíveis. Lab/gaso = resultados com unidades, sem interpretação nem setas.
3. Eu respondo por escrito:
   - Se E3-Porta (#1–#7): disposição justificada + prescrição executável (dose, via, diluição/velocidade, duração/quantidade/2 vias) identificando erro crítico em qualquer trava aplicável: Alergias (reação) · Rim/Fígado (medida renal exigida para o fármaco e avaliação hepática pertinente) · Gestação/Lactação · Interações · Via/Velocidade/Diluição · Peso/Idade · Objetivo (meta e prazo) + Disponibilidade local (REMUME e estoque do turno) + conciliação + rede de segurança (alarmes, prazo, dono dos pendentes) + SBAR de regulação (alvo de concisão ~60 s) se transferência.
   - Se e3-ubs-longitudinal (#8): o que checar de execução pós-UPA + conciliação + priorização de 2–3 demandas + retorno/responsável.
4. Avalie a 1ª tentativa (sem elogio genérico): fez bem / atrasou / omitiu + nota 0–4 na rubrica (E3-Porta ou E3-UBS). Erro ou atraso crítico impede 4/4.
5. Peça para eu reescrever o trecho falho.
6. Liste 2–3 doses/condutas para checar (AMBOSS pode localizar; para validar conduta de risco, consulte diretriz, protocolo oficial ou bula profissional).
7. Veredito da 1ª tentativa: Limpo APENAS se 4/4; senão Repetir.
8. Dite 1 linha de LOG (mantenha [__m] e [N/S] para eu preencher):
   DD/MM | E3 | [e3-slug] ([Ambiente]) | [__m] | NA | [omissão/nenhuma] | [X/4 (ajuste)] | [N/S] | [Limpo/Repetir]
```

### Prompt C — Paciente Grave e Deterioração por Voz (E4)
```markdown
Preceptor sênior de emergência do SUS. Simulação por VOZ (eu falo, você responde por texto) de paciente grave (6º ano).

CONFIGURAÇÃO:
- Cenário: [e4-slug — NOME]
- Ambiente: [UPA com sala vermelha | PA de cidade pequena]

REGRAS ESTRITAS:
1. Abra direto com chamado da enfermagem ou chegada na sala vermelha + monitor inicial + recursos reais do turno. Zero dicas.
2. Atue como enfermagem, monitor e paciente. Avance o tempo simulado por turno ou após um intervalo declarado. Julgue a ordem das ações.
3. CIRCUITO FECHADO: enfermagem SÓ executa ordem dirigida (nome + ação) e confirma; exija dose, via e velocidade quando aplicáveis. Ordem vaga gera "como assim, doutor?".
4. MULTIPACIENTE (se e4-multipaciente): insira 2º paciente grave + demanda barulhenta durante a estabilização do 1º; avalie a priorização fisiológica (A via aérea → B ventilação → C circulação/choque → D neurológico/tempo-dependente → demanda estável por último) e quem fica responsável pelo primeiro paciente.
5. Lab/gaso = resultados com unidades, sem interpretação; ECG/RX = achados primários sem diagnóstico.
6. Checklist oculto (0–4 — erro ou atraso crítico impede 4/4): [1] Reconhecimento + ajuda no limite do serviço; [2] ≥ 2 ordens em circuito fechado com dose/via/velocidade quando aplicáveis; [3] Estabilização correta compatível com recursos; [4] Prazo e gatilho de reavaliação (+ sequência e responsável no multipaciente).

FECHAMENTO (sem elogio genérico — avalie a 1ª tentativa):
- Fez bem / atrasou / omitiu + nota X/4. Peça para eu refazer o trecho falho por voz.
- Liste 2–3 doses/condutas para checar (AMBOSS pode localizar; validação final exige diretriz, protocolo oficial ou bula profissional).
- Veredito da 1ª tentativa: Limpo APENAS se 4/4; senão Repetir.
- Dite 1 linha de LOG (mantenha [__m] e [N/S] para eu preencher):
  DD/MM | E4 | [e4-slug] ([Ambiente]) | [__m] | NA | [omissão/nenhuma] | [X/4 (ajuste)] | [N/S] | [Limpo/Repetir]
```

### Prompt D — Variante Relâmpago (`D1`) ou Micro-Dose Real (`D2`) — Voz, 10–12 min
```markdown
Treino curto por VOZ (eu falo, você responde por texto, 10–12 min). Escolho uma opção:

(1) VARIANTE RELÂMPAGO (Nível 2 — chat próprio):
- Queixa: [slug — NOME] | Serviço: [UPA com retaguarda | PA de cidade pequena sem lab]
- Mecanismos já usados no LOG para este slug: [ex.: iamcsst, tep | nenhum] → crie um caso clinicamente distinto.
- Oculto: trave os dados do caso antes da triagem; defina 3 hipóteses e 3–6 discriminadores; sorteie um Atrito E2 compatível (nenhum | Tipo A: demanda indevida | Tipo B: história vaga/família ansiosa | Tipo C: conversa sensível/aliança), encene e revele só no feedback. Aceite hipóteses plausíveis e discriminadores equivalentes; em instabilidade, priorize estabilização.
- Abertura e interação: abra com triagem, sinais vitais e recursos. Envio uma mensagem começando com `3H:` antes de falar com o paciente; responda só "registrado" e siga como paciente. `3H_bloco = S` só se a mensagem `3H:` trouxer 3 hipóteses plausíveis cobrindo provável, perigosa e não pode passar; só o prefixo `3H:` não conta. Responda em linguagem leiga a tudo que a pergunta cobre, inclusive a perguntas abertas pertinentes, sem entregar discriminador espontaneamente. No exame físico, devolva só o achado da manobra nomeada. Para exame genérico, responda "sem achado específico disponível", sem sugerir a manobra. Lab/gaso = resultados com unidades, sem interpretação.
- Fechamento compacto (sem apresentação longa): "Qual grave ainda está em aberto e o que você fará a seguir?" → explicação leiga (≤ ~150 pal.) + teach-back com o Atrito E2 encenado.
- Feedback seco da 1ª tentativa: PEMC / 3H_bloco (S/N) / E2 compacto 0–4 ([1] Estrutura/agenda, [2] Segurança, [3] Explicação ≤ ~150 pal. + teach-back, [4] Firmeza + qual Atrito encenado) → refazer só o trecho falho → 1 ponto para checar (validação final em diretriz/protocolo/bula).
- Veredito da 1ª tentativa: Limpo APENAS se 3H_bloco = S e PEMC = nenhuma; senão Repetir.
- Dite 1 linha de LOG (preencha `slug:mecanismo` depois do feedback; mantenha [__m] e [N/S]):
  DD/MM | Var | [slug:mecanismo] | [__m] | [S/N] | [PEMC] | [X/4 (ajuste)] | [N/S] | [Limpo/Repetir]

(2) DEBRIEFING REAL (LGPD — ZERO dado identificável):
- Eixo: [E1 | E3 | E4] · Caso anonimizado: [idade aprox., sexo, queixa/contexto, o que perguntei/examinei/prescrevi].
- Devolva: (a) 3 hipóteses ou prioridades esperadas, (b) PEMC/trava omitida que mudaria conduta, (c) 1 ponto para checar em diretriz/protocolo/bula + 1 linha de LOG no molde exato:
  DD/MM | Micro | [slug] | [__m] | NA | [PEMC/trava] | NA | NA | NA
```

---

## §6. Fora do Escopo e Congelado

- **`Novo-PEP` (desenvolvimento liberado nas férias — trava de abr/2027 retirada em 22/nov):** implementada a **Esteira Contínua de Treino Clínico v3.1** dentro de `#/6ano/teoria` (aba `Treino & Teoria`), seguindo `docs/SPEC_NOVO_PEP_ESTEIRA_TREINO_v3.1.md` e os 5 templates blindados para o Gemini. A simulação de voz continua no Gemini; o site atua como esteira contínua de blocos, gerador de prompts 1-clique, registrador/parser do LOG e gestor do `Não Pode Passar` com trava de fonte primária. Spec v3.0 antiga arquivada em `docs/arquivo/PLANO_IMPLEMENTACAO_NOVO_PEP_TREINO_CLINICO.md`.
- **Procedimentos motores:** presencialmente no internato ou em manequim + registro no **Logbook 3x** do `Novo-PEP` (`6º Ano → Prática → Logbook 3x`), focado nos procedimentos manuais de médico generalista aprendidos na graduação (Escada de Autonomia: apenas `Supervisionado` e `Autônomo` avançam a Regra 3x). Procedimentos de especialista (CVC, PAI, drenagem de tórax, e-FAST) foram retirados da matriz; se surgirem com supervisão no serviço, podem ser registrados como avulsos.
- **Adiados:** punções invasivas avançadas, ventilação mecânica avançada, POCUS/RUSH/e-FAST.
- **Sob demanda:** CTG/Partograma (`15`, rodízio de GO), Declaração de Óbito, receituários especiais, SNAPPS.

---

## §7. Formato do LOG, Critérios de Progresso, Contingências e Observação em Serviço

### Formato único do `docs/piloto/LOG.md`
```text
DD/MM | Tipo | Alvo(slug:mecanismo) | Min | 3H_bloco | PEMC/Omissão | Score(0-4) | IA_Pista? | Veredito
```
- **`Tipo`:** `Nova` | `Var` | `E3` | `E4` | `Micro` | `SERVIÇO` | `GRAVAÇÃO` | `BASELINE`
- **Regra de registro e validade:**
  - **Registre a primeira tentativa, antes de feedback e refação.**
  - **Em `Nova` e `Var` (E1), o alvo é `slug:mecanismo` (ex.: `dor-toracica:iamcsst`), preenchido depois do feedback** (no `BASELINE-A` de 29/nov manter só `sensorio-focal-glicemia`). O `D(1)` lê os mecanismos já usados nas linhas anteriores daquela queixa.
  - **Linha com `IA_Pista? = S` ou falha que impeça avaliar fica registrada e exige nova tentativa inédita para contar na sequência de domínio.**
  - **Erro ou atraso crítico impede `4/4`.**
  - **Calcule `3H` e `PEMC` nas linhas `Nova`/`Var` avaliáveis e mostre numerador e denominador (ex.: `8/10`).**
- **`Veredito` da linha (definição objetiva — nunca no olho):**
  - **`Nova` / `Var` (Prompts A e D(1)):** **`Limpo`** = `3H_bloco = S` (mensagem `3H:` trouxe 3 hipóteses plausíveis cobrindo provável, perigosa e não pode passar; só o prefixo não conta) **e** `PEMC = nenhuma` (`Score E2` não entra); qualquer outro resultado = **`Repetir`**.
  - **`E3` / `E4` (Prompts B e C):** **`Limpo`** = **`4/4`** na rubrica correspondente; qualquer outro resultado = **`Repetir`**.
  - `Dominado` **não** é veredito de linha — é calculado a partir das linhas avaliáveis do LOG.
- **`IA_Pista?`:** preenchido por você ao final (`N` = ok; `S` = IA vazou pista/termo técnico; vale também para `E3`).
- **Linha semanal de gravação de áudio:** `DD/MM | GRAVAÇÃO | <slug> | 5m | NA | NA | muletas: X (ajuste) | NA | NA`
- **Molde de `Micro` (Prompt D(2)):** `DD/MM | Micro | <slug> | __m | NA | <PEMC/trava> | NA | NA | NA`
- **Regra explícita de cômputo:** linhas `Micro`, `SERVIÇO`, `GRAVAÇÃO` e `BASELINE` **não contam** para cálculo de domínio em simulação.

### Critérios de Domínio (calculados no LOG)
- **E1 (Porta Comum):** **2 tentativas inéditas avaliáveis seguidas** `Limpo` da mesma queixa (`Nova`→`Var` ou `Var`→`Var`, em dias distintos), sendo **≥ 1 delas `Var` (Nível 2)**. Queixa dominada volta a cada **~21 dias**.
  - **E2 não bloqueia domínio do E1:** `Score E2 (0–4)` é métrica separada (meta: `≥ 3/4` consistente + queda de muletas em `GRAVAÇÃO`).
- **E3 (Internato):** **2 casos inéditos avaliáveis seguidos `Limpo` (`4/4`)**, preferencialmente 1 em UPA e 1 em PA pequeno sem lab.
- **E4 (Internato):** **2 execuções inéditas avaliáveis seguidas `Limpo` (`4/4`)** sem erro ou atraso crítico.

### Metas das Férias e Regra de Contingência (revisão de 10/jan/2027)
- **Meta de 10/jan:** `3H_bloco ≥ 80%` nas linhas `Nova`/`Var` avaliáveis (numerador/denominador).
- **Meta de 24/jan:** `PEMC → 0` em variantes inéditas, **1ª passada completa (`19/20 + baseline` no E1, `7/7` E3-Porta, `7/7` E4)** + **`≥ 6` queixas dominadas no E1** + melhora exploratória na sondagem `[BASELINE]` (29/nov vs. 24/jan).
- **Prioridade Contingência × Meta:** **se a contingência de 10/jan disparar, a meta de 1ª passada (`19/20`) cede** — as queixas novas faltantes passam para o início do internato sem dívida. **Preserve B e C** quando a contingência suspender novas queixas.
- **Se `3H_bloco < 80%` em 10/jan:** pausar abertura de queixas novas **na próxima semana ativa (`18–22/jan`)** *(pois `10/jan` antecede a viagem `11–17/jan`)*, impor pausa silenciosa de 10 s pós-triagem com fórmula fixa (*"provável / perigosa / não pode passar"*) e rodar 2 variantes curtas `D(1)` por sessão até atingir ≥ 80%.
- **Se `PEMC` não cair:** separar a causa — se for manobra esquecida, reforçar EF em familiar na quinta-feira; se for falta de roteiro, acionar obrigatoriamente o modelo resolvido de 2 min antes de avançar.

### Observação em Serviço (`[SERVIÇO]` — a partir de 25/jan/2027)
- **Gatilho fixo:** o **primeiro paciente novo de toda segunda-feira** (ou de terça, se não houver na segunda).
- **Pedido fechado (adaptável ao rodízio do §4):** *"Posso fazer a anamnese/exame desse paciente e você me diz, em 1 minuto, a pergunta ou manobra mais importante que eu não fiz?"*
- **Registro:** `DD/MM | SERVIÇO | <slug/rodizio> | 5m | NA | <apontamento do preceptor> | NA | NA | NA`.
- **Conta como falha não pedir.** Preceptor dizer não, não conta como falha.

---

## §8. Apêndice — Checklist "Posso Assumir Essa Escala?" (CRM 2028)

Antes de aceitar qualquer plantão avulso ou fixo com CRM próprio, checar os **10 pontos objetivos** abaixo:

1. **Sala vermelha e via aérea:** monitor multiparamétrico, desfibrilador/DEA funcionando, aspirador, BVM, laringoscópio/tubos e drogas de SRI disponíveis?
2. **Drogas salvadoras de 1ª hora:** adrenalina, noradrenalina + bomba de infusão, MgSO₄, glicose 50%, amiodarona, nitroglicerina/nitroprussiato, ATB EV de amplo espectro?
3. **Exames no turno e SLA:** há ECG de 12 derivações, gasometria, laboratório básico (Hb, K⁺, Cr, troponina) e RX no turno — ou o serviço opera **sem lab**? Qual o tempo real do resultado?
4. **Perfil de porta real:** porta exclusiva de adulto ou mista com **pediatria e obstetrícia/parto**? Há pediatra/GO na casa ou você fica sozinho para tudo?
5. **Retaguarda médica:** há outro médico no plantão (dupla/clínico/cirurgião) ou cobertura solo absoluta?
6. **Equipe de enfermagem:** quantos técnicos/enfermeiros por turno e experiência em emergência/acesso difícil?
7. **Fluxo real de transferência / vaga zero (CROSS):** quem regula, qual a distância da referência terciária e há ambulância **USA com médico** disponível?
8. **Volume e ritmo de fichas:** média de pacientes/hora e espera real na recepção (acima de ~4–5 fichas/h em porta solo = risco alto de erro cognitivo).
9. **Prontuário e prescrição:** sistema eletrônico com histórico/alergias ou papel, disponibilidade de farmácia (REMUME local)?
10. **Vínculo e respaldo jurídico:** contrato/PJ claro, responsabilidade técnica definida e seguro/cláusulas de cobertura.

> **Sinal vermelho para o 1º mês de CRM (não assumir solo):** porta mista ped/GO **sem** apoio na casa + ausência de sala vermelha equipada + transferência sem USA definida.

---

## §9. Changelog (v3.0 → v3.1)

| Seção | O que mudou |
| :--- | :--- |
| **Cabeçalho & Arquivos** | Mantido congelamento em **29/nov**; arquivados `RELATORIO_REVISAO_PLANO_HABILIDADES_CLINICAS.md` e `PLANO_IMPLEMENTACAO_NOVO_PEP_TREINO_CLINICO.md` em `docs/arquivo/`. |
| **§1 Ementa & Pesos** | Pesos curriculares **`45/20/20/15`** (com nota do peso nominal no orçamento). E1 com **20 queixas (`slug` estável)** e `sensorio-focal-glicemia` em `#20` reservada ao `[BASELINE]`. E2 com rubrica `0–4` por contagem estimada de palavras + bloco privado de 3H antes da entrevista. E3 com **8 arquétipos**, definição unificada de `A-R-G-I-V-P-O` + Disponibilidade local, e `e3-ubs-longitudinal` padronizado para após `24/jan`. E4 com **7 cenários** e critério de erro/atraso crítico impedindo `4/4`. |
| **§2 Sessão, Exames & Segurança** | `D(1)` totalmente autocontido para `Var` (10–12 min, mecanismo distinto, Atrito E2 encenado) e `A` para `Nova` (25–30 min) em chats separados; resposta padronizada *"sem achado específico disponível"* para exame genérico; pergunta de segurança atualizada; resultados com unidades sem interpretação; bloco visual de ECG/RX somando +10 min; AMBOSS classificado como fonte secundária (retirada de `[CHECAR]` exige diretriz, protocolo oficial ou bula profissional). |
| **§3 Piloto & Baseline** | Piloto testando **A, D(1), B e C** + regra explícita de teto de tempo; `[BASELINE]` redefinido como **sondagem de transferência em simulação** com par de casos pré-fixado (`Nova`, UPA, idoso, ≤ 30 min), blindado em 29/nov (`PEMC: S/N` sem revelar/refazer) e comparado em 24/jan (com 15 min de revisão após o caso). |
| **§4 Orçamento & Rotina** | Orçamento explícito (`~290 min/sem`, `~300 min` com 1 bloco de imagem; totais até 24/jan: `19 A + 2 A reserva + 2 A baseline, 20 D(1), 7 B, 7 C`); meta `19/20 + baseline` e `≥ 6` dominadas no E1; vagas `D(1)` priorizadas para reteste e confirmação em dias distintos; ponte com os 8 rodízios (nota alinhada ao §6); **Cartão 17 corrigido** (travas A, R, G, V, O + sigla unificada) e **Módulo 06** alinhado à mesma sigla (Cartão 18 intocado). |
| **§5 Prompts** | Prompts A, B, C e D autocontidos (~1 tela cada), sem autoauditoria, com unidades sem interpretação, avanço por turno no C, critérios explícitos de E3 no B e molde de 9 campos no `D(2)`. |
| **§7 LOG, Domínio & Contingência** | Regra da **1ª tentativa** antes do feedback/refação; linhas com `IA_Pista? = S` não contam para sequência de domínio; cálculo `3H`/`PEMC` com numerador/denominador; definição objetiva de `Limpo`/`Repetir`; contingência de `10/jan` apontando para a próxima semana ativa **`18–22/jan`** preservando B e C (e fazendo ceder `19/20` se disparar). |
| **§8 Apêndice** | Checklist de 10 critérios para avaliar escalas reais no CRM 2028. |
| **Ficha 2 (pós-auditoria)** | Replicadas correções clínicas 7–9 no **Módulo 06 (§2+)** (`src/data/formacao_teorica_data.ts`) e em `03_Checklist_Metas_FAST_HUG_BID.md`; adicionado `CASO FIXO (só BASELINE)` no Prompt A com casos A/B gerados pelo ChatGPT em arquivo e colados sem leitura prévia; formalizada mensagem começando com `3H:` (`"registrado"`), coluna renomeada para `3H_bloco` e alvo atualizado para `slug:mecanismo` no LOG e em A/D(1). |
| **Ficha 3 (Partes 1, 2 e 3)** | `3H_bloco = S` condicionado a 3 hipóteses plausíveis (provável/perigosa/não pode passar); `D(1)` explicitando *"devolva só o achado da manobra nomeada"*; `Prompt C` com sequência de multipaciente autocontida; `§3` movendo o teste de troca de chat/teto 45 min para `24/nov` (`21/nov` testa só Prompt A); ramo `BASELINE-A` encerrado após a linha do LOG (`ENCERRE AQUI`); corrigida a fonte externa `/home/wagmoraes/Documentos/Internato/Habilidades_Clinicas/06_Procedimentos_e_Prescricao/01_Checklist_Seguranca_Prescricao.md` e sincronizado o guia `hab-17` em `src/data/tecnica_profunda.generated.json` (G1–G3 literais, incluindo `NaCl 3%` pós-bolus e `AUC 400–600 mg·h/L`); aplicadas trocas clínicas **E1–E3** no Módulo 06 (§2A–D e exercício com TFGe+ClCr) e **F1–F2** no `03_Checklist_Metas_FAST_HUG_BID.md` (nutrição, 4AT/retirada gradual de sedativos sem padrão `*`, troca EV→VO por critérios). |
| **Orquestração 3 Agentes (21/nov)** | Formalizado **§2.6 (Simulador ChatGPT/Gemini × Claude sob gatilho × Antigravity semanal 10–15 min)** com trava explícita de que consenso entre IAs não retira `[CHECAR]`; atualizados Cabeçalho e §5 para `ChatGPT ou Gemini`; sincronizado `06_Farmacologia_Pratica_Prescricao_Segura.md` em `Documentos/Internato/Formacao_Teorica_Habilidades/` e marcado o Bloco 2 de `Plano_Ferias_6Ano_Habilidades_Medicas.md` como substituído pela v3.1. |
| **Implementação Novo-PEP v3.1 (21/nov)** | Reaberto o §6 por decisão explícita do usuário: implementada a Esteira Contínua v3.1 no `Novo-PEP` (`#/6ano/teoria`) com catálogo completo (20 E1, 8 E3, 7 E4), máquina de estados dos 3 blocos (`Piloto → Férias → Internato`), templates blindados para Gemini + parser `LOG_RE`, contrato `Não Pode Passar` com trava `[CHECAR]` e testes unitários (`tests/treino_clinico.test.ts`). |
| **Refatoração Aba Prática & Fim da Trava abr/2027 (22/nov)** | Retirada a trava de congelamento do `Novo-PEP` até abr/2027 (evolução liberada nas férias). Removida a sub-aba duplicada `Prompts IA` de `PraticaView`; Logbook 3x enxugado para procedimentos manuais de generalista (sem CVC/PAI/e-FAST/drenagem/cognitivos), com Escada de Autonomia real (`Supervisionado` + `Autônomo` avançam 3x), vínculo direto a partir do `Pré-Porta`, nota rápida + Desfazer, export Markdown e botão `Copiar D2` em Pontos Cegos pendentes. |
