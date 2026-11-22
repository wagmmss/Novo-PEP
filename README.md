# 🩺 Novo-PEP — Cockpit Clínico & Central do 6º Ano

[![Deploy Cockpit to GitHub Pages](https://github.com/wagmmss/Novo-PEP/actions/workflows/deploy.yml/badge.svg)](https://github.com/wagmmss/Novo-PEP/actions/workflows/deploy.yml)
[![Cockpit Online](https://img.shields.io/badge/Cockpit_Online-Acessar_Agora-0F766E?style=flat&logo=safari&logoColor=white)](https://wagmmss.github.io/Novo-PEP/)

🌐 **Acesse o Cockpit Online (PWA Offline):** **[https://wagmmss.github.io/Novo-PEP/](https://wagmmss.github.io/Novo-PEP/)**

Aplicação web progressiva (**React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Workbox PWA**) que une uma biblioteca defensiva de **88 protocolos copiáveis para PEP** (MV, Tasy, Vivver, e-SUS) à **Central Operacional do 6º Ano de Medicina e Preparação R1**.

---

## 🧭 Arquitetura em 2 Mundos

O aplicativo alterna em um clique (no topo) entre uso rápido **à beira do leito** e gestão de **estudo/prática do internato**:

### 1. Mundo Beira-Leito
- **`Protocolos` (88 modelos ativos):**
  - 4 áreas: **Pronto Atendimento / UPA (47)**, **Ginecologia & Obstetrícia (19)**, **Pediatria (13)** e **Enfermaria & Internação (9)**.
  - **Personalização inline por AST:** switches clínicos, escolhas mutuamente excludentes, recálculo ponderal automático (com tetos adultos/pediátricos) e renumeração limpa sem itens órfãos.
  - **Trava de cópia & segurança:** alerta lacunas clínicas obrigatórias antes de copiar; cópia segmentada (`Evolução`, `Conduta`, `Receita`, `Orientações` ou `Tudo`).
  - **Barra do paciente + Calculadoras + REMUME (252 fármacos):** CKD-EPI 2021, Cockcroft-Gault, IG/DPP, IMC, eletrólitos, CURB-65, Centor/McIsaac, Wells TVP, CHA₂DS₂-VASc e **Auditor de Prescrição** (alergia, gestação e ajuste renal por TFGe).
- **`Pré-Porta` (22 Cartões Pré-Porta 30s + 20 Guias de Técnica Profunda):**
  - Roteiros escaneáveis em [`05_Habilidades_Clinicas/`](05_Habilidades_Clinicas/) com checklists persistidos, itens `[CRÍTICO]`, captura rápida para o Logbook/Pontos Cegos e links bidirecionais com os protocolos e guias teóricos.

### 2. Mundo 6º Ano
- **`Prática` (`Logbook 3x` & `Pontos Cegos`):**
  - Escada de autonomia por procedimento (`Observou` → `Auxiliou` → `Supervisionado` → `Autônomo`, com Regra 3x real e desfazer seguro).
  - Caixa de entrada de **Pontos Cegos** com **Guarda Anti-PII** (anonimização automática de nomes, CPF, telefone e prontuário).
- **`Treino & Teoria` (`Esteira Contínua v3.1` & `9 Guias Teóricos v2.0`):**
  - Esteira estruturada de treino clínico (piloto, férias e internato) com parser de `LOG`, regra de contingência, lista **Não Pode Passar (NPP)** com validação de fonte primária e integração de **27 Micro-Drills**.
- **`Plano & R1` (`Plano 6º Ano` & `R1 & Currículo`):**
  - **Plano 6º Ano:** rodízio ativo, cronograma de férias, marcha da semana sincronizada com a Esteira v3.1, procedimentos do bloco e revisão semanal.
  - **R1 & Currículo (Editais 2027 · Psiquiatria):** linha do tempo `2027 → 2028 → mar/2029` com destaque do próximo marco e **Matriz Unificada de Currículo** para **USP-SP (FUVEST / ENAMED ×1,0–1,2)**, **USP-RP (HC-FMRP / ENAMED +0,3–0,5)** e **UNICAMP (FCM)** — com placar **Comprovado (PDF pronto) vs. Projetado**, **equivalência em questões da 1ª fase**, ranking automático de **Top ROI** respeitando tetos de bloco, notas de dossiê por item e regras de envio colapsáveis.

### Recursos Globais
- **Busca instantânea (`Ctrl+K`):** motor **MiniSearch** com busca fuzzy/sem acento sobre os 110 itens (88 PEPs + 22 Pré-Porta) e medicamentos das receitas; `Shift+Enter` abre e já copia.
- **Atalhos de teclado (`?`):** navegação rápida na lista, rotas sincronizadas na URL (`#/p/<id>`, `#/hab/<id>`, `#/6ano/<aba>`) e tema escuro para plantão noturno.
- **100% Offline + Backup JSON v2 + Cloud Sync opcional:** persistência local em `localStorage`, exportação/importação atômica em JSON e sincronização opcional entre dispositivos via Cloudflare Worker + KV em [`sync-worker/`](sync-worker/README.md) (protegida por senha única com SHA-256, rate limit e detecção de conflito `409`).

---

## 🛠️ Desenvolvimento Local & Pipeline

**Requisitos:** Node.js 22+ e Python 3 (para recompilar os arquivos `.md` quando editar protocolos).

```bash
# Instalar dependências
npm install

# Rodar servidor local (http://localhost:3000)
npm run dev

# Recompilar protocolos .md -> src/data/protocols.generated.json
npm run build:protocols

# Verificação completa (tipos + 39 testes + build de produção PWA)
npm run typecheck && npm test && npm run build
```

### Deploy & Sincronização
- **GitHub Pages:** deploy automático na branch `main` via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (`typecheck` → `test` → `vite build` → Pages em `https://wagmmss.github.io/Novo-PEP/`).
- **Cloud Sync (opcional):** instruções de 4 comandos em [`sync-worker/README.md`](sync-worker/README.md).

---

## 📁 Estrutura do Repositório

```text
Novo-PEP/
├── 01_Ginecologia_Obstetricia/   # 19 protocolos ativos de GO
├── 02_Pronto_Atendimento_UPA/    # 47 protocolos ativos de PA / UPA Adulto
├── 03_Enfermaria_Internacao/     # 9 protocolos ativos de Enfermaria
├── 04_Pediatria/                 # 13 protocolos ativos de Pediatria
├── 05_Habilidades_Clinicas/      # 22 cartões Pré-Porta 30s
├── _arquivados/                  # Protocolos preservados fora do catálogo ativo
├── docs/                         # Especificações (Esteira v3.1, arquitetura, piloto)
├── scripts/                      # Compilador Python (build_snippets.py)
├── src/
│   ├── components/               # Views React (Protocolos, Pré-Porta, Prática, Teoria, R1 & Currículo)
│   ├── data/                     # Catálogos gerados, REMUME (252), baremas 2027, dados de treino
│   ├── engine/                   # AST editorial, calculadoras, auditor de prescrição, motor R1/ROI, Esteira v3.1
│   ├── hooks/                    # Hooks de store e Cloud Sync
│   ├── state/                    # Store reativo (localStorage + Backup v2), rotas hash, Cloud Sync
│   └── utils/                    # Clipboard e Guarda Anti-PII
├── sync-worker/                  # Micro-backend Cloudflare Worker + KV para Cloud Sync
└── tests/                        # 5 suítes (39 testes: cockpit, linter remark, REMUME, treino, sync)
```

---

## 📚 Catálogo dos 88 Protocolos Ativos

<details>
<summary><strong>Pronto Atendimento / UPA Adulto (47 modelos)</strong></summary>

| Protocolo Clínico | Subcategoria | Arquivo |
| :--- | :--- | :--- |
| Ficha Mestra Universal de Pronto Atendimento (UPA / PS) | Triagem e Ficha Mestra | [`00_Ficha_Mestra_Universal_UPA.md`](02_Pronto_Atendimento_UPA/01_Triagem_e_Ficha_Mestra/00_Ficha_Mestra_Universal_UPA.md) |
| Resfriado Comum e Rinofaringite Aguda | Infecções e Vias Aéreas | [`01_Resfriado_e_Rinofaringite.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/01_Resfriado_e_Rinofaringite.md) |
| Faringoamigdalite Aguda | Infecções e Vias Aéreas | [`02_Faringoamigdalite_Aguda.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/02_Faringoamigdalite_Aguda.md) |
| Otite Média Aguda (OMA) | Infecções e Vias Aéreas | [`03_Otite_Media_Aguda.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/03_Otite_Media_Aguda.md) |
| Rinossinusite Aguda Bacteriana | Infecções e Vias Aéreas | [`04_Sinusite_Aguda.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/04_Sinusite_Aguda.md) |
| Pneumonia Adquirida na Comunidade (PAC) | Infecções e Vias Aéreas | [`05_Pneumonia_PAC.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/05_Pneumonia_PAC.md) |
| Conjuntivite Aguda (Viral vs Bacteriana) | Infecções e Vias Aéreas | [`06_Conjuntivite_Aguda.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/06_Conjuntivite_Aguda.md) |
| Dengue e Arboviroses (Classificação MS) | Infecções e Vias Aéreas | [`07_Dengue_e_Arboviroses.md`](02_Pronto_Atendimento_UPA/02_Infeccoes_e_Vias_Aereas/07_Dengue_e_Arboviroses.md) |
| Gastroenterite Aguda (GECA) e Desidratação | Gastrointestinal e Abdominal | [`01_GECA_Gastroenterite.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/01_GECA_Gastroenterite.md) |
| Dispepsia Aguda e DRGE | Gastrointestinal e Abdominal | [`02_Dispepsia_e_DRGE.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/02_Dispepsia_e_DRGE.md) |
| Dor Abdominal Aguda e Abdome Agudo Cirúrgico | Gastrointestinal e Abdominal | [`03_Dor_Abdominal_e_Suspeita_Cirurgica.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/03_Dor_Abdominal_e_Suspeita_Cirurgica.md) |
| Hemorragia Digestiva Alta (HDA) | Gastrointestinal e Abdominal | [`04_Hemorragia_Digestiva_Alta_HDA.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/04_Hemorragia_Digestiva_Alta_HDA.md) |
| Hemorroida (Trombose) e Fissura Anal | Gastrointestinal e Abdominal | [`05_Hemorroida_e_Fissura_Anal.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/05_Hemorroida_e_Fissura_Anal.md) |
| Parasitoses Intestinais e Verminoses | Gastrointestinal e Abdominal | [`06_Parasitose_Intestinal.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/06_Parasitose_Intestinal.md) |
| Constipação Aguda, Fecaloma e Suspeita de Obstrução Intestinal | Gastrointestinal e Abdominal | [`07_Constipacao_Fecaloma_e_Obstrucao_Intestinal.md`](02_Pronto_Atendimento_UPA/03_Gastrointestinal_e_Abdominal/07_Constipacao_Fecaloma_e_Obstrucao_Intestinal.md) |
| Dor Torácica Aguda e SCA (Protocolo de 10 Minutos) | Cardiovascular e Respiratório | [`01_Dor_Toracica_e_SCA.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/01_Dor_Toracica_e_SCA.md) |
| Crise Hipertensiva (Urgência vs Emergência) | Cardiovascular e Respiratório | [`02_Crise_Hipertensiva.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/02_Crise_Hipertensiva.md) |
| Asma Aguda e Crise de Broncoespasmo | Cardiovascular e Respiratório | [`03_Asma_e_Broncoespasmo.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/03_Asma_e_Broncoespasmo.md) |
| DPOC Exacerbado | Cardiovascular e Respiratório | [`04_DPOC_Exacerbado.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/04_DPOC_Exacerbado.md) |
| Edema Agudo de Pulmão (EAP) e ICAD | Cardiovascular e Respiratório | [`05_Insuficiencia_Cardiaca_e_EAP.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/05_Insuficiencia_Cardiaca_e_EAP.md) |
| Trombose Venosa Profunda (TVP) e TEP | Cardiovascular e Respiratório | [`06_TVP_e_Tromboembolismo_Pulmonar_TEP.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/06_TVP_e_Tromboembolismo_Pulmonar_TEP.md) |
| Síncope na Emergência | Cardiovascular e Respiratório | [`07_Sincope_na_Emergencia.md`](02_Pronto_Atendimento_UPA/04_Cardiovascular_e_Respiratorio/07_Sincope_na_Emergencia.md) |
| Cefaleia Aguda e Red Flags (SNOOP10) | Neurologia e Saúde Mental | [`01_Cefaleia_Aguda_e_Red_Flags.md`](02_Pronto_Atendimento_UPA/05_Neurologia_e_Saude_Mental/01_Cefaleia_Aguda_e_Red_Flags.md) |
| Vertigem Aguda e Labirintite (Protocolo HINTS) | Neurologia e Saúde Mental | [`02_Vertigem_e_Labirintite.md`](02_Pronto_Atendimento_UPA/05_Neurologia_e_Saude_Mental/02_Vertigem_e_Labirintite.md) |
| Crise Convulsiva e Estado de Mal Epiléptico | Neurologia e Saúde Mental | [`03_Crise_Convulsiva.md`](02_Pronto_Atendimento_UPA/05_Neurologia_e_Saude_Mental/03_Crise_Convulsiva.md) |
| Crise de Ansiedade e Transtorno de Pânico | Neurologia e Saúde Mental | [`04_Crise_de_Ansiedade_Panico.md`](02_Pronto_Atendimento_UPA/05_Neurologia_e_Saude_Mental/04_Crise_de_Ansiedade_Panico.md) |
| Agitação Psicomotora e Surto Psiquiátrico | Neurologia e Saúde Mental | [`05_Agitacao_Psicomotora_e_Surto.md`](02_Pronto_Atendimento_UPA/05_Neurologia_e_Saude_Mental/05_Agitacao_Psicomotora_e_Surto.md) |
| Infecção do Trato Urinário (Cistite vs Pielonefrite) | Nefro, Uro e Dermato | [`01_ITU_Cistite_e_Pielonefrite.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/01_ITU_Cistite_e_Pielonefrite.md) |
| Nefrolitíase e Cólica Renal Aguda | Nefro, Uro e Dermato | [`02_Nefrolitiase_Colica_Renal.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/02_Nefrolitiase_Colica_Renal.md) |
| Uretrite Aguda Masculina e ISTs | Nefro, Uro e Dermato | [`03_Uretrite_DST_Masculina.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/03_Uretrite_DST_Masculina.md) |
| Lombalgia Mecânica e Lombociatalgia | Nefro, Uro e Dermato | [`04_Lombalgia_e_Lombociatalgia.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/04_Lombalgia_e_Lombociatalgia.md) |
| Reação Alérgica, Urticária e Anafilaxia | Nefro, Uro e Dermato | [`05_Crise_Alergica_e_Urticaria.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/05_Crise_Alergica_e_Urticaria.md) |
| Erisipela, Celulite e Drenagem de Abscesso | Nefro, Uro e Dermato | [`06_Celulite_Erisipela_e_Abscesso.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/06_Celulite_Erisipela_e_Abscesso.md) |
| Herpes Zoster e Neuralgia Aguda | Nefro, Uro e Dermato | [`07_Herpes_Zoster.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/07_Herpes_Zoster.md) |
| Escabiose (Sarna Humana) | Nefro, Uro e Dermato | [`08_Escabiose_Sarna.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/08_Escabiose_Sarna.md) |
| Crise Aguda de Gota e Artrite Gotosa | Nefro, Uro e Dermato | [`09_Artrite_Gotosa_Gota.md`](02_Pronto_Atendimento_UPA/06_Nefrologia_Urologia_e_Dermatologia/09_Artrite_Gotosa_Gota.md) |
| Cetoacidose Diabética (CAD) e EHH | Emergências Graves | [`01_Cetoacidose_Diabetica_e_EHH.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/01_Cetoacidose_Diabetica_e_EHH.md) |
| Intoxicações Exógenas e Alcoólica Aguda | Emergências Graves | [`02_Intoxicacao_Exogena_e_Alcoolica.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/02_Intoxicacao_Exogena_e_Alcoolica.md) |
| Sequência Rápida de Intubação (SRI / IOT) | Emergências Graves | [`03_Sequencia_Rapida_de_Intubacao_SRI.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/03_Sequencia_Rapida_de_Intubacao_SRI.md) |
| Parada Cardiorrespiratória (PCR) Adulto & Pós-RCE | Emergências Graves | [`04_Parada_Cardiorrespiratoria_PCR.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/04_Parada_Cardiorrespiratoria_PCR.md) |
| Sepse e Choque Séptico (Pacote da 1ª Hora) | Emergências Graves | [`05_Sepse_e_Choque_Septico_Pacote_1Hora.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/05_Sepse_e_Choque_Septico_Pacote_1Hora.md) |
| AVC Agudo & AIT (Código AVC & Alteplase) | Emergências Graves | [`06_Acidente_Vascular_Cerebral_AVC_e_AIT.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/06_Acidente_Vascular_Cerebral_AVC_e_AIT.md) |
| Taquiarritmias & Fibrilação Atrial (ACLS) | Emergências Graves | [`07_Taquiarritmias_e_Fibrilacao_Atrial.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/07_Taquiarritmias_e_Fibrilacao_Atrial.md) |
| Distúrbios Eletrolíticos Graves (HiperK & HipoNa) | Emergências Graves | [`08_Disturbios_Eletroliticos_Hipercalemia_e_Hiponatremia.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/08_Disturbios_Eletroliticos_Hipercalemia_e_Hiponatremia.md) |
| Pequena Cirurgia: Sutura, Tétano e Raiva | Emergências Graves | [`09_Trauma_Menor_Sutura_Tetano_e_Raiva.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/09_Trauma_Menor_Sutura_Tetano_e_Raiva.md) |
| Bradiarritmias Sintomáticas, BAV e Marcapasso | Emergências Graves | [`10_Bradiarritmias_e_Marcapasso_Transcutaneo.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/10_Bradiarritmias_e_Marcapasso_Transcutaneo.md) |
| Queimaduras Agudas (Parkland) e Animais Peçonhentos | Emergências Graves | [`11_Queimaduras_e_Animais_Peconhentos.md`](02_Pronto_Atendimento_UPA/07_Emergencias_Graves_e_Procedimentos/11_Queimaduras_e_Animais_Peconhentos.md) |

</details>

<details>
<summary><strong>Ginecologia & Obstetrícia (19 modelos)</strong></summary>

| Protocolo Clínico | Subcategoria | Arquivo |
| :--- | :--- | :--- |
| Evolução Diária em Enfermaria de Puerpério | Enfermaria Puerpério | [`02_Puerperio_Evolucao_Diaria.md`](01_Ginecologia_Obstetricia/01_Enfermaria_Puerperio/02_Puerperio_Evolucao_Diaria.md) |
| Script de Passagem de Caso / Round de Puerpério | Enfermaria Puerpério | [`05_Puerperio_Round_Passagem_de_Caso.md`](01_Ginecologia_Obstetricia/01_Enfermaria_Puerperio/05_Puerperio_Round_Passagem_de_Caso.md) |
| Ambulatório de Pré-Natal — Primeira Consulta | Ambulatório GO | [`01_Pre_Natal_Primeira_Consulta.md`](01_Ginecologia_Obstetricia/02_Ambulatorio_GO/01_Pre_Natal_Primeira_Consulta.md) |
| Ambulatório de Pré-Natal — Consulta Subsequente | Ambulatório GO | [`02_Pre_Natal_Consulta_Subsequente.md`](01_Ginecologia_Obstetricia/02_Ambulatorio_GO/02_Pre_Natal_Consulta_Subsequente.md) |
| Ambulatório de Ginecologia Geral — Rotina | Ambulatório GO | [`03_Ginecologia_Geral_Consulta.md`](01_Ginecologia_Obstetricia/02_Ambulatorio_GO/03_Ginecologia_Geral_Consulta.md) |
| Procedimento Ambulatorial — Inserção de Implanon | Procedimentos | [`01_Procedimento_Insercao_Implanon.md`](01_Ginecologia_Obstetricia/03_Procedimentos_Ambulatoriais/01_Procedimento_Insercao_Implanon.md) |
| Procedimento Ambulatorial — Retirada e Troca de Implanon | Procedimentos | [`02_Procedimento_Troca_Implanon.md`](01_Ginecologia_Obstetricia/03_Procedimentos_Ambulatoriais/02_Procedimento_Troca_Implanon.md) |
| Descrição de Parto Normal Eutócico | Centro Obstétrico | [`04_Parto_Normal_Eutocico.md`](01_Ginecologia_Obstetricia/04_Centro_Obstetrico_Cirurgias/04_Parto_Normal_Eutocico.md) |
| Revisão de Canal de Parto e Perineorrafia | Centro Obstétrico | [`06_Revisao_Canal_e_Sutura_Laceracao_Episiotomia.md`](01_Ginecologia_Obstetricia/04_Centro_Obstetrico_Cirurgias/06_Revisao_Canal_e_Sutura_Laceracao_Episiotomia.md) |
| Admissão em Trabalho de Parto & Cesariana | Centro Obstétrico | [`07_Admissao_TP_e_Descricao_Cesariana.md`](01_Ginecologia_Obstetricia/04_Centro_Obstetrico_Cirurgias/07_Admissao_TP_e_Descricao_Cesariana.md) |
| Hemorragia Pós-Parto (Código Vermelho) | Emergências GO | [`01_Emergencia_Hemorragia_Pos_Parto_HPP.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/01_Emergencia_Hemorragia_Pos_Parto_HPP.md) |
| Pré-Eclâmpsia Grave e Eclâmpsia | Emergências GO | [`02_Emergencia_Pre_Eclampsia_Grave_e_Eclampsia.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/02_Emergencia_Pre_Eclampsia_Grave_e_Eclampsia.md) |
| Trabalho de Parto Prematuro (TPP) | Emergências GO | [`03_Trabalho_de_Parto_Prematuro_TPP.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/03_Trabalho_de_Parto_Prematuro_TPP.md) |
| Rotura Prematura de Membranas (RPMO) | Emergências GO | [`04_Rotura_Prematura_de_Membranas_RPMO.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/04_Rotura_Prematura_de_Membranas_RPMO.md) |
| Doença Inflamatória Pélvica (DIP) | Emergências GO | [`05_Doenca_Inflamatoria_Pelvica_DIP.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/05_Doenca_Inflamatoria_Pelvica_DIP.md) |
| Infecções Puerperais: Mastite & Endometrite | Emergências GO | [`06_Infeccoes_Puerperais_Mastite_e_Endometrite.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/06_Infeccoes_Puerperais_Mastite_e_Endometrite.md) |
| Sangramento do 1º Trimestre (Abortamento e Ectópica) | Emergências GO | [`07_Sangramento_1Trimestre_Abortamento_e_Ectopica.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/07_Sangramento_1Trimestre_Abortamento_e_Ectopica.md) |
| Sangramento do 2º/3º Trimestre (DPP vs Placenta Prévia) | Emergências GO | [`08_Sangramento_2e3Trimestre_DPP_e_Placenta_Previa.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/08_Sangramento_2e3Trimestre_DPP_e_Placenta_Previa.md) |
| Violência Sexual e Profilaxias Pós-Exposição (PEP) | Emergências GO | [`09_Violencia_Sexual_e_Profilaxias_PEP.md`](01_Ginecologia_Obstetricia/06_Emergencias_GO/09_Violencia_Sexual_e_Profilaxias_PEP.md) |

</details>

<details>
<summary><strong>Pediatria & Puericultura (13 modelos)</strong></summary>

| Protocolo Clínico | Subcategoria | Arquivo |
| :--- | :--- | :--- |
| Ficha Mestra Universal de Pediatria | Ficha Mestra e Triagem | [`00_Ficha_Mestra_Universal_Pediatrica.md`](04_Pediatria/01_Ficha_Mestra_e_Triagem/00_Ficha_Mestra_Universal_Pediatrica.md) |
| Consulta de Puericultura & Marcos do DNPM (0–24 Meses) | Puericultura e Ambulatório | [`01_Consulta_Puericultura_Marcos_DNPM.md`](04_Pediatria/02_Puericultura_e_Ambulatorio/01_Consulta_Puericultura_Marcos_DNPM.md) |
| Resfriado Comum & Rinofaringite Aguda Pediátrica | Respiratório e IVAS | [`01_Resfriado_Comum_e_Obstrucao_Nasal.md`](04_Pediatria/03_Respiratorio_e_IVAS/01_Resfriado_Comum_e_Obstrucao_Nasal.md) |
| Bronquiolite Viral Aguda (BVA) no Lactente | Respiratório e IVAS | [`02_Bronquiolite_Viral_Aguda_BVA.md`](04_Pediatria/03_Respiratorio_e_IVAS/02_Bronquiolite_Viral_Aguda_BVA.md) |
| Laringite Aguda & Crupe Viral | Respiratório e IVAS | [`03_Laringite_Estridulosa_Crupe_Viral.md`](04_Pediatria/03_Respiratorio_e_IVAS/03_Laringite_Estridulosa_Crupe_Viral.md) |
| Otite Média Aguda (OMA) Pediátrica | Respiratório e IVAS | [`04_Otite_Media_Aguda_Pediatrica.md`](04_Pediatria/03_Respiratorio_e_IVAS/04_Otite_Media_Aguda_Pediatrica.md) |
| Pneumonia Adquirida na Comunidade (PAC) Pediátrica | Respiratório e IVAS | [`05_Pneumonia_Adquirida_na_Comunidade_PAC.md`](04_Pediatria/03_Respiratorio_e_IVAS/05_Pneumonia_Adquirida_na_Comunidade_PAC.md) |
| Asma Aguda e Crise de Sibilância (GINA Pediátrico) | Respiratório e IVAS | [`06_Asma_Aguda_e_Crise_de_Sibilancia_Pediatrica.md`](04_Pediatria/03_Respiratorio_e_IVAS/06_Asma_Aguda_e_Crise_de_Sibilancia_Pediatrica.md) |
| Gastroenterite Aguda (GECA) & Planos OMS | Gastrointestinal e Desidratação | [`01_GECA_e_Planos_Desidratacao_OMS.md`](04_Pediatria/04_Gastrointestinal_e_Desidratacao/01_GECA_e_Planos_Desidratacao_OMS.md) |
| Febre sem Foco & Manejo do Lactente Febril | Febre e Infecções Sistêmicas | [`01_Febre_sem_Foco_e_Lactente_Febril.md`](04_Pediatria/05_Febre_e_Infeccoes_Sistemicas/01_Febre_sem_Foco_e_Lactente_Febril.md) |
| Crise Convulsiva Febril na Infância | Febre e Infecções Sistêmicas | [`02_Crise_Convulsiva_Febril.md`](04_Pediatria/05_Febre_e_Infeccoes_Sistemicas/02_Crise_Convulsiva_Febril.md) |
| Doenças Exantemáticas Febris e Doença de Kawasaki | Febre e Infecções Sistêmicas | [`03_Exantemas_Febris_na_Infancia_e_Kawasaki.md`](04_Pediatria/05_Febre_e_Infeccoes_Sistemicas/03_Exantemas_Febris_na_Infancia_e_Kawasaki.md) |
| Infecção do Trato Urinário (ITU) na Infância | Febre e Infecções Sistêmicas | [`04_ITU_na_Infancia_e_Lactente.md`](04_Pediatria/05_Febre_e_Infeccoes_Sistemicas/04_ITU_na_Infancia_e_Lactente.md) |

</details>

<details>
<summary><strong>Enfermaria & Internação Hospitalar (9 modelos)</strong></summary>

| Protocolo Clínico | Subcategoria | Arquivo |
| :--- | :--- | :--- |
| Admissão em Enfermaria de Clínica Médica | Admissão e Avaliação Inicial | [`01_Admissao_Clinica_Medica.md`](03_Enfermaria_Internacao/01_Admissao_e_Avaliacao_Inicial/01_Admissao_Clinica_Medica.md) |
| Evolução Diária SOAP — Clínica Médica | Evolução Diária SOAP | [`01_Evolucao_SOAP_Clinica_Medica.md`](03_Enfermaria_Internacao/02_Evolucao_Diaria_SOAP/01_Evolucao_SOAP_Clinica_Medica.md) |
| Evolução Diária SOAP — Pós-Operatório Cirúrgico | Evolução Diária SOAP | [`02_Evolucao_SOAP_Pos_Operatorio.md`](03_Enfermaria_Internacao/02_Evolucao_Diaria_SOAP/02_Evolucao_SOAP_Pos_Operatorio.md) |
| Checklist de Metas Diárias — Bundle FAST HUG BID | Evolução Diária SOAP | [`03_Checklist_Metas_FAST_HUG_BID.md`](03_Enfermaria_Internacao/02_Evolucao_Diaria_SOAP/03_Checklist_Metas_FAST_HUG_BID.md) |
| Controle Glicêmico Hospitalar e Insulinoterapia Basal-Bolus | Evolução Diária SOAP | [`04_Controle_Glicemico_e_Insulinoterapia_Hospitalar.md`](03_Enfermaria_Internacao/02_Evolucao_Diaria_SOAP/04_Controle_Glicemico_e_Insulinoterapia_Hospitalar.md) |
| Round Matinal e Passagem de Plantão (SBAR) | Passagem de Plantão e Rounds | [`01_Round_Matinal_e_Passagem_SBAR.md`](03_Enfermaria_Internacao/03_Passagem_de_Plantao_e_Rounds/01_Round_Matinal_e_Passagem_SBAR.md) |
| Delirium Hospitalar e Agitação no Idoso | Passagem de Plantão e Rounds | [`01_Delirium_Hospitalar_e_Agitacao_no_Idoso.md`](03_Enfermaria_Internacao/03_Passagem_de_Plantao_e_Rounds/01_Delirium_Hospitalar_e_Agitacao_no_Idoso.md) |
| Sumário de Alta Hospitalar — Clínica Médica | Altas e Desospitalização | [`01_Sumario_de_Alta_Clinica_Medica.md`](03_Enfermaria_Internacao/05_Altas_e_Desospitalizacao/01_Sumario_de_Alta_Clinica_Medica.md) |
| Constatação de Óbito & Checklist da Declaração de Óbito (DO) | Óbito e Cuidados | [`01_Constatacao_de_Obito_e_Checklist_DO.md`](03_Enfermaria_Internacao/06_Declaracao_de_Obito_e_Cuidados/01_Constatacao_de_Obito_e_Checklist_DO.md) |

</details>

---

## 🔒 Princípios de Segurança Clínica & Privacidade

1. **Rigor Ponderal & Auditoria Ativa:** prescrições pediátricas e de emergência respeitam dose por kg e teto máximo por tomada; o **Auditor de Prescrição** cruza alergias, gestação e TFGe (CKD-EPI 2021) antes da cópia.
2. **Proscrição de Iatrogenias:** proscrição explícita de mucolíticos/beta-agonistas/corticoides de rotina na BVA, loperamida na diarreia aguda, ticagrelor pós-trombólise química no IAM e amoxicilina-clavulanato na RPMO pré-termo.
3. **Zero Checkboxes Pré-Assinalados & Trava de Cópia:** templates copiáveis mantêm `[ ]` em branco e o app bloqueia/alerta lacunas clínicas críticas não preenchidas.
4. **Guarda Anti-PII:** registros de Logbook e Pontos Cegos sanitizam automaticamente nomes de pacientes, CPF, telefone e número de prontuário antes de persistir ou sincronizar.
