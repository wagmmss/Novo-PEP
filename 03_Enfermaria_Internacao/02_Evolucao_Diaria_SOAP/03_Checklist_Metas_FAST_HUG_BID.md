# Protocolo de Atendimento: Checklist de Metas Diárias - Bundle FAST HUG BID
**Categoria:** Metas de Segurança & Auditoria de Leito  
**Atalho:** `;fasthug`  
**Gravidade:** Enfermaria / Internação  
**CID-10:** Z51.8  

---

## 📋 Snippet para Prontuário Eletrônico (PEP)

```text
# IDENTIFICAÇÃO:
- [? Leito :: Leito: [ ] | ]Paciente: [Nome], [Idade] anos | [ ]º Dia de Internação Hospitalar (DIH)
- Diagnóstico Principal: [ ]

# CHECAGEM SISTEMÁTICA DOS 10 DOMINIOS (FAST HUG + BID):
- [F] FEEDING (Nutrição e Via Alimentar):
  * Via atual: [Dieta via oral / Nutrição Enteral por SNE / Nutrição Parenteral / Jejum programado para procedimento].
  * Aceitação & Avaliação Nutricional (meta individualizada): [Plena / Parcial / Baixa — avaliados duração, segurança da deglutição, trato GI e risco de realimentação antes de definir via e progressão].
- [A] ANALGESIA (Controle de Dor):
  * Escala EVA (0–10): [EVA 0 (Sem dor) / EVA [ ] em região [ ]].
  * Esquema atual: [Analgesia multimodal eficaz sem sedação ou constipação / Ajustada posologia analgésica hoje].
- [S] SEDATION & SENSORIUM (Nível de Consciência & Rastreio de Delirium):
  * Sensório: [Alerta, lúcido e orientado (Glasgow 15 / RASS 0) / Sonolento / Agitado].
  * Rastreio de Delirium (4AT na enfermaria; CAM-ICU/ICDSC em cuidados críticos ou pós-op): [Avaliado — sem sinais de delirium / Positivo — instituído pacote não-farmacológico, revisados sedativos com retirada gradual se risco de dependência salvo urgência clínica].
- [T] THROMBOPROPHYLAXIS (Profilaxia de TEV):
  * Risco de TEV e sangramento (escore apropriado à população): [Alto risco / Baixo risco] -> Conduta: [Enoxaparina conforme bula, indicação e protocolo local / HNF / Profilaxia mecânica (se indicação com contraindicação à farmacológica) / Deambulação assistida].
- [H] HEAD OF BED (Cabeceira Elevada):
  * Posicionamento: [Cabeceira mantida elevada a 30–45° para prevenção de broncoaspiração / Decúbito específico por restrição ortopédica/neurológica].
- [U] ULCER PROPHYLAXIS (Profilaxia de Sangramento de Estresse):
  * Indicação formal: [Não indicada (sem fatores de risco em paciente crítico; IBP suspenso) / Indicada em paciente crítico por fatores de risco como coagulopatia, choque ou hepatopatia crônica].
- [G] GLYCEMIC CONTROL (Controle Glicêmico Hospitalar — Meta individualizada conforme ambiente e risco de hipoglicemia):
  * Variação HGT 24h: Mínima de [ ] mg/dL | Máxima de [ ] mg/dL ([Sem episódios de hipoglicemia (< 70 mg/dL) / Esquema basal-bólus ajustado hoje]).
- [B] BOWEL MOVEMENT (Função Intestinal):
  * Última evacuação: [Hoje / Ontem / Ausente há [ ] dias] | Aspecto: [Fisiológico (Bristol 3–4) / Ressecado (Bristol 1–2) / Diarreico (Bristol 6–7)].
- [I] INDWELLING CATHETERS (Auditoria de Dispositivos Invasivos):
  * Acesso Venoso: [Periférico em [MSD / MSE] D[ ] sem sinais de flebite / CVC em [ ] D[ ] com curativo limpo / Indicada retirada hoje].
  * Sonda Vesical (SVD): [*Ausente / Retirada hoje para prevenção de ITU-AC / Mantida por controle estrito de diurese horária ou obstrução urinária].
- [D] DE-ESCALATION (Descalonamento de Antibióticos & Desospitalização):
  * Antimicrobianos (reavaliada via EV em até 48h e diariamente): [Sem antibiótico / Mantido esquema EV em D / Descalonado por cultura / Transicionado para VO (melhora clínica, estabilidade, via enteral funcionante, opção oral adequada, avaliação do foco, controle da fonte e exceções do protocolo) / Suspenso hoje — critérios de alta registrados separadamente].

# CONDUTA:

>> AÇÕES IMEDIATAS RESULTANTES DO BUNDLE FAST HUG BID:
1. Ajuste Nutricional & Hidratação: [Manter dieta atual / Progredir dieta oral / Ajustar vazão de dieta enteral para [ ] mL/h].
2. Desprescrição Segura (Stewardship): [Suspenso Omeprazol/IBP sem indicação formal / Revisados sedativos com retirada gradual se risco de dependência, salvo urgência clínica / Suspensos anticolinérgicos desnecessários].
3. Retirada de Dispositivos Invasivos: [Retirar Sonda Vesical de Demora hoje / Sacar acesso venoso periférico ocioso / Sacar dreno cirúrgico].
4. Regulação Intestinal & Glicêmica: [Prescrito laxativo osmótico (Lactulose 15 mL VO 12/12h ou PEG 4000) / Ajustado esquema individualizado de insulina para [ ] unidades].
5. Meta de Desospitalização: [Reabilitação motora ativa com fisioterapia; alta hospitalar prevista em (24 / 48) horas].

# HISTÓRIA / RESUMO DA INTERNAÇÃO:
Motivo da internação / Diagnóstico de base: [ ]
Data da admissão / Procedimento ou parto: [DD/MM/AAAA] | Evolução prévia até ontem: [ ]
```

---

## 🎯 Diretrizes & Raciocínio Clínico

### 🧠 1. Por Que o Checklist FAST HUG BID Reduz Mortalidade e Tempo de Internação? (Fisiopatologia & Raciocínio)
- **Por que a memória humana falha em enfermarias complexas:** Originalmente desenvolvido por Jean-Louis Vincent para UTIs e expandido para enfermarias (`FAST HUG BID`), este *bundle* corrige a "inércia terapêutica" — o fenômeno em que o médico foca apenas na doença principal (ex: pneumonia) e esquece que o paciente está há 4 dias constipado, com sonda vesical desnecessária, recebendo IBP sem indicação e desenvolvendo *delirium* hipoativo no leito.
- **Por que o *delirium* no idoso internado é uma emergência médica (item S):** O *delirium* (especialmente o subtipo hipoativo, frequentemente confundido com "paciente calmo ou sonolento") é um marcador independente de mortalidade hospitalar, sepse oculta, hipóxia, retenção urinária aguda (bexigoma), fecaloma ou intoxicação medicamentosa (benzodiazepínicos, anti-histamínicos, tramadol).

### 🧭 3. Resumo Operacional dos 10 Pontos do FAST HUG BID na Visita Diária
| Letra | Domínio Clínico | Pergunta-Chave na Beira do Leito | Ação Imediata se Alterado |
| :---: | :--- | :--- | :--- |
| **F** | **Feeding** (Nutrição) | Meta individualizada; ingestão baixa exige avaliar duração, deglutição, trato GI e risco de realimentação? | Individualizar meta nutricional e definir via/progressão após avaliar deglutição, trato GI e risco de realimentação. |
| **A** | **Analgesia** | Tem dor em repouso ou à mobilização (`EVA > 3`)? | Prescrever analgesia em horário fixo (não deixar apenas "se necessário"). |
| **S** | **Sensorium / Delirium** | Sinais de delirium (`4AT` na enfermaria; `CAM-ICU/ICDSC` em UTI/pós-op)? Usa sedativo crônico? | Usar `4AT` diante de sinais na enfermaria; revisar sedativos e planejar retirada gradual se risco de dependência, salvo urgência clínica. |
| **T** | **Thromboprophylaxis** | Risco de TEV e sangramento avaliados pelo instrumento apropriado à população? | Prescrever Enoxaparina conforme bula/indicação/protocolo local (LRA ≠ ClCr estável) ou HNF; considerar mecânica se indicação com contraindicação à farmacológica. |
| **H** | **Head of Bed** | A cabeceira está elevada entre `30° e 45°`? | Elevar cabeceira imediatamente (reduz pneumonia aspirativa em disfágicos/idosos). |
| **U** | **Ulcer Prophylaxis** | Paciente crítico com fatores como coagulopatia, choque ou hepatopatia crônica? | **Suspender Omeprazol** se não houver critério em paciente crítico. |
| **G** | **Glycemic Control** | Glicemia na meta individualizada para o ambiente e risco de hipoglicemia? | Individualizar basal, prandial e correção (em jejum, omitir prandial e preservar basal no DM1). |
| **B** | **Bowel** (Intestino) | Evacuou nas últimas `48–72h`? | Prescrever Lactulose `15–30 mL VO` ou Polietilenoglicol (PEG 4000) e hidratação. |
| **I** | **Indwelling Catheters** | Ainda precisa da Sonda Vesical e do Acesso Venoso hoje? | **Retirar SVD** e sacar acessos venosos ociosos ou com sinais de flebite. |
| **D** | **De-escalation** | Via EV reavaliada em até `48 h` e diariamente? Preenche critérios de troca EV→VO? | Considerar VO com melhora clínica, estabilidade, via enteral funcionante, opção oral adequada, avaliação do foco, controle da fonte e exceções do protocolo; registrar critérios de alta separadamente. |

### 💊 2. Por Que Desprescrevemos IBP, Benzodiazepínicos e "Insulina Só se HGT Alto"? (Racional Farmacológico)
- **Por que a "Insulina Regular conforme HGT" (*sliding scale* isolada) é proscrita:** Esperar a glicemia atingir `250 ou 300 mg/dL` para aplicar bólus isolados de insulina regular gera o "efeito montanha-russa" (picos hiperglicêmicos seguidos de quedas abruptas de hipoglicemia). No paciente diabético internado, adote meta glicêmica individualizada conforme ambiente e risco de hipoglicemia, escrevendo sempre `"unidades"` por extenso, e individualize basal, prandial e correção por tipo de DM, formulação e protocolo (em jejum, omitir dose prandial e preservar cobertura basal no DM1).
- **Por que tratamos constipação hospitalar com laxativo osmótico (Lactulose / PEG):** A imobilidade e o uso de analgésicos opioides reduzem o peristaltismo colônico, causando impacto fecal, translocação bacteriana, náuseas e *delirium* no idoso.
