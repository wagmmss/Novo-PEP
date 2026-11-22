# LOG de Treino — Habilidades Clínicas (v3.1)

**Formato único (1 linha por sessão):**
`DD/MM | Tipo | Alvo(slug:mecanismo) | Min | 3H_bloco | PEMC/Omissão | Score(0-4) | IA_Pista? | Veredito`

**Regras de registro e validade:**
- **Registre sempre a primeira tentativa, antes de feedback e refação.**
- **Em `Nova` e `Var` (E1), o alvo é `slug:mecanismo` (ex.: `dor-toracica:iamcsst`), preenchido depois do feedback.** Ao rodar `D(1)`, informe os mecanismos já usados nas linhas anteriores daquela queixa.
- **Linha com `IA_Pista? = S` ou falha que impeça avaliar fica registrada e exige nova tentativa inédita para contar na sequência de domínio.**
- **Erro ou atraso crítico impede `4/4`.**
- **Calcule `3H` e `PEMC` nas linhas `Nova`/`Var` avaliáveis e mostre numerador e denominador (ex.: `8/10`).**

**Legenda rápida:**
- `Tipo`: `Nova` | `Var` | `E3` | `E4` | `Micro` | `SERVIÇO` | `GRAVAÇÃO` | `BASELINE`
- `Min`: tempo total real gasto incluindo chat e registro do LOG (preenchido por você; checagem de fontes entra no bloco próprio)
- `3H_bloco`: `S` | `N` | `NA` (`S` somente se a mensagem `3H:` trouxer 3 hipóteses plausíveis cobrindo provável, perigosa e não pode passar; só o prefixo `3H:` não conta)
- `IA_Pista?`: `N` | `S` | `NA` (preenchido por você ao final em A, D(1), B e C; `S` = IA vazou pista/termo técnico)
- **`Veredito` (regra objetiva):**
  - `Nova` / `Var` (E1 — Prompts A e D(1)): **`Limpo`** = `3H_bloco = S` **e** `PEMC = nenhuma` (E2 não entra); qualquer outro resultado = **`Repetir`**.
  - `E3` / `E4` (Prompts B e C): **`Limpo`** = **`4/4`** na rubrica; qualquer outro resultado = **`Repetir`**.
  - `Dominado` é calculado a partir das linhas avaliáveis (2 tentativas inéditas seguidas `Limpo` em dias distintos no E1, sendo ≥ 1 `Var`).
- **Não contam para domínio em simulação:** `Micro`, `SERVIÇO`, `GRAVAÇÃO` e `BASELINE`.

**Linhas especiais:**
- Micro-dose real `D(2)`: `DD/MM | Micro | <slug> | __m | NA | <PEMC/trava> | NA | NA | NA`
- Gravação semanal: `DD/MM | GRAVAÇÃO | <slug> | 5m | NA | NA | muletas: X (ajuste) | NA | NA`
- Observação em serviço: `DD/MM | SERVIÇO | <slug/rodizio> | 5m | NA | <apontamento do preceptor> | NA | NA | NA`
- Sondagem de transferência (`Nova`, UPA com retaguarda, paciente idoso, ≤ 30 min — em 29/nov registrar `PEMC: S/N`): `DD/MM | BASELINE | sensorio-focal-glicemia | __m | S/N | <S/N ou PEMC> | X/4 | N/S | Limpo/Repetir`

---

<!-- Registre abaixo a partir da Sessão 1 (21/nov) -->
