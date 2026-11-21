# Arquitetura do Cockpit Editável - Novo-PEP

Documentação oficial da arquitetura do **Novo-PEP** (React 19 + TypeScript + Tailwind v4 + Vite PWA).

---

## 1. Arquitetura em 3 Camadas

O diagrama abaixo ilustra o fluxo completo do sistema, desde as fontes de dados e protocolos em Markdown até a interface React reativa.

```mermaid
flowchart LR
    subgraph FONTES ["1. FONTES DE DADOS"]
        MD["88 Protocolos .md<br/>(01_GO: 19, 02_UPA: 47<br/>03_ENF: 9, 04_PED: 13)<br/><br/>22 Cartões Pré-Porta .md<br/>(05_Habilidades_Clinicas)"]
        TS["Dados TypeScript<br/>- remume.ts (252 itens)<br/>- formacao_teorica_data.ts (9 mod)<br/>- clinical_reference_data.ts<br/>- central6ano_data.ts"]
    end

    subgraph MOTORES ["2. COMPILAÇÃO & MOTORES"]
        BUILD["npm run build:protocols<br/>(scripts/build_snippets.py)<br/>⬇<br/>protocols.generated.json"]
        ENGINE["src/engine/<br/>- pepAst.ts<br/>- prescriptionGuard.ts<br/>- clinicalContext.ts (CKD-EPI 2021)<br/>- search.ts (MiniSearch)<br/>- central6ano.ts"]
    end

    subgraph INTERFACE ["3. INTERFACE REACT (2 Mundos + Rota URL)"]
        subgraph MUNDO1 ["Mundo 1 — Beira-Leito (URL: #/p/..., #/hab/...)"]
            PROTO["Protocolos<br/>- ProtocolosView.tsx + PepBlockRenderer.tsx<br/>- Faixa do Paciente (Peso, Idade, Alergias, TFG CKD-EPI 2021, Gestante/IG)<br/>- Trava de Cópia & Auditor de Prescrição"]
            PREPORTA["Pré-Porta<br/>- PrePortaView.tsx (22 Cartões)<br/>- Resumo 30s, Mnemônico, Coreografia, Ponto Cego<br/>- Guia das 6 Intercorrências de Madrugada"]
        end
        subgraph MUNDO2 ["Mundo 2 — 6º Ano (URL: #/6ano/...)"]
            PRATICA["Prática<br/>- PraticaView.tsx (Logbook 3x, Ponto Cego + Anti-PII)"]
            TEORIA["Teoria<br/>- TeoriaView.tsx (9 Módulos mod-01..mod-09)"]
            PLANO["Plano & R1<br/>- R1CurriculoView.tsx (Rodízios, Rituais, Matriz USP/Unicamp)"]
        end
    end

    MD --> BUILD
    BUILD --> ENGINE
    TS --> ENGINE
    ENGINE --> INTERFACE
```

---

## 2. Árvore Hierárquica de Componentes e Modais

```text
src/
├── App.tsx
├── components/
│   ├── CommandPalette.tsx       (Ctrl+K)
│   ├── ShortcutsHelp.tsx        (?)
│   ├── QuickCaptureModal.tsx    (Captura rápida de notas/pontos cegos)
│   ├── BackupModal.tsx          (Exportação/Importação de dados e localStorage)
│   └── layout/
│       ├── Navbar.tsx
│       └── Sidebar.tsx
├── views/
│   ├── ProtocolosView.tsx
│   ├── PrePortaView.tsx
│   ├── PraticaView.tsx
│   ├── TeoriaView.tsx
│   └── R1CurriculoView.tsx
└── engine/
    ├── pepAst.ts
    ├── prescriptionGuard.ts
    ├── clinicalContext.ts
    ├── search.ts
    └── central6ano.ts
```

---

## 3. Mapa de Interações e Módulos Principais

| Módulo / Componente | Função Principal | Tecnologias / Motores Envolvidos |
| :--- | :--- | :--- |
| **CommandPalette** (`Ctrl+K`) | Busca global rápida de protocolos, drogas REMUME e conteúdos clínicos. | `search.ts` (MiniSearch) |
| **ShortcutsHelp** (`?`) | Guia rápido de atalhos de teclado do sistema. | React State / Tailwind v4 |
| **QuickCaptureModal** | Registro rápido de observações beira-leito e pontos cegos com proteção PII. | `piiGuard.ts`, LocalStorage |
| **BackupModal** | Gestão de dados locais, backup e restauração do estado do cockpit. | File API / JSON |
| **ProtocolosView** | Exibição e interatividade de guias clínicos com blocos editáveis e cópia segura. | `PepBlockRenderer.tsx`, `clinicalContext.ts` (CKD-EPI 2021) |
| **PrePortaView** | Acesso rápido aos 22 cartões de emergência e intercorrências de plantão. | Markdown Engine / UI Cards |
| **PraticaView** | Logbook dinâmico de plantão com métricas de autonomia e segurança PII. | `central6ano.ts`, `piiGuard.ts` |
| **TeoriaView** | Acompanhamento dos 9 módulos de formação teórica do internato. | `formacao_teorica_data.ts` |
| **R1CurriculoView** | Planejamento de rodízios, rituais e matriz unificada de residência médica. | Dados estruturados TS |
