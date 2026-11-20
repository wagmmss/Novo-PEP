import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  computeAstDisplayLayout,
  evaluateDoseFormula,
  type AstSelectionState,
  type ChoiceGroupNode,
  type ChoiceOptionAst,
  type DoseFormulaNode,
  type InlineInputNode,
  type ParagraphNode,
  type PepDocumentAst,
  type PepInlineNode,
} from '../engine/pepAst.ts';
import type { ClinicalContext } from '../engine/clinicalContext.ts';
import {
  resolveInlinePlaceholder,
  resolveMultiChoiceSelection,
} from '../engine/pepInlineHelpers.ts';
import type { PepAstSection } from '../data/protocolsRepo.ts';

interface PepBlockRendererProps {
  ast: PepDocumentAst;
  section: PepAstSection;
  state: AstSelectionState;
  clinicalContext: ClinicalContext;
  onInputChange: (node: InlineInputNode, value: string) => void;
  onChoiceSelect: (group: ChoiceGroupNode, nextIndices: number[]) => void;
  onToggleTrava: (travaId: string) => void;
  onToggleOptional: (optionalId: string) => void;
  onToggleCheckbox: (blockId: string) => void;
}

const STANDALONE_SUBHEADER_REGEX =
  /^(?:USO\s+[A-ZÀ-Ý0-9\s/()-]+|RECEITUÁRIO[^:]*|PRESCRIÇÃO\s+[A-ZÀ-Ý\s/()-]+|ORIENTAÇÕES[^:]*|SINAIS DE ALARME[^:]*|CONDUTA\s+[A-ZÀ-Ý\s/()-]+|EXAME FÍSICO|IDENTIFICAÇÃO|QP|HMA)\s*:?\s*$/;

const LEAD_PREFIX_REGEX =
  /^(\s*(?:[-*]\s+)?(?:ID|TS Materna|TS\/Rh|Comorbidades|Alergias|DUM|DPP|IG[^:]{0,24}|PA|FC|FR|SpO2|Tax|Peso|Altura|IMC|HGT|BCF|AU|Sinais Vitais|TEP|Classificação|Contracepção[^:]{0,20}|Rastreio[^:]{0,28}|Vacinação[^:]{0,25}|Exames Solicitados[^:]{0,15}|Retorno[^:]{0,18}|Duração[^:]{0,20}|Criança|Paciente|Anamnese|Queixa|Medicações[^:]{0,18}|Hábitos)\s*:)/i;

function stripMarkdownTokens(text: string): string {
  return String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*(\([^*\n]+\)\.?)\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\\rightarrow|\\to\b/g, '→')
    .replace(/\\ge(?:q)?\b/g, '≥')
    .replace(/\\le(?:q)?\b/g, '≤')
    .replace(/\\pm\b/g, '±')
    .replace(/\\times\b/g, '×')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\mu\b/g, 'µ');
}

function isStandaloneClinicalHeader(block: ParagraphNode): boolean {
  const trimmed = block.rawLine.trim();
  if (!trimmed || block.indent.length > 0) return false;
  if (/^\d+[.)]\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed)) return false;
  if (block.children.some((c) => c.kind === 'inline-input' || c.kind === 'choice-group')) {
    return false;
  }
  return STANDALONE_SUBHEADER_REGEX.test(trimmed);
}

function hasOnlySimpleTextOptions(group: ChoiceGroupNode): boolean {
  return group.options.every((opt) => opt.children.every((ch) => ch.kind === 'text'));
}

function getChoiceOptionSummary(opt: ChoiceOptionAst, state: AstSelectionState): string {
  let out = '';
  for (const ch of opt.children) {
    if (ch.kind === 'text') {
      out += stripMarkdownTokens(ch.value);
    } else {
      const val = (state.inputValues[ch.id] || '').trim();
      out += val || ch.placeholder || '...';
    }
  }
  return out.trim();
}

function getChoiceOptionStaticPrefix(opt: ChoiceOptionAst): string {
  let out = '';
  for (const ch of opt.children) {
    if (ch.kind === 'text') {
      out += stripMarkdownTokens(ch.value);
    } else {
      break;
    }
  }
  return out.trim();
}

function optionHasEmbeddedInput(opt: ChoiceOptionAst): boolean {
  return opt.children.some((c) => c.kind === 'inline-input');
}

export function PepBlockRenderer({
  ast,
  section,
  state,
  clinicalContext,
  onInputChange,
  onChoiceSelect,
  onToggleTrava,
  onToggleOptional,
  onToggleCheckbox,
}: PepBlockRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [popoverAlignRight, setPopoverAlignRight] = useState<boolean>(false);

  const layout = useMemo(
    () => computeAstDisplayLayout(ast, state, section.blockIndexSet),
    [ast, state, section.blockIndexSet]
  );

  // Fechar popover ao clicar fora ou apertar Escape
  useEffect(() => {
    if (!openPopoverId) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(`[data-choice-popover="${openPopoverId}"]`)) return;
      setOpenPopoverId(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenPopoverId(null);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [openPopoverId]);

  // Navegação fluida por Tab entre lacunas inline do bloco
  const handleGapKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return;
    const container = containerRef.current;
    if (!container) return;
    const gaps = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[data-pep-gap="true"]:not(:disabled)')
    );
    const idx = gaps.indexOf(e.currentTarget);
    if (idx === -1) return;

    const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
    if (nextIdx >= 0 && nextIdx < gaps.length) {
      e.preventDefault();
      gaps[nextIdx].focus();
      gaps[nextIdx].select();
    }
  };

  const renderInlineInput = (node: InlineInputNode) => {
    const val = state.inputValues[node.id] || '';
    const rawPlaceholder = (node.placeholder || '').trim();
    const displayPlaceholder = resolveInlinePlaceholder(rawPlaceholder, node.beforeText);
    const isNumericLike = Boolean(
      node.maskType ||
        node.anthroRole ||
        node.vitalRole ||
        node.obstetricRole ||
        node.mirrorRole === 'idade' ||
        node.mirrorRole === 'peso' ||
        /^(?:kg|cm|mm|bpm|irpm|%|°C|g|mL|mg|sem|d|dias|G|P|A|PN|PC|PAS|PAD)$/i.test(rawPlaceholder)
    );

    const isFilled = val.trim().length > 0;

    return (
      <input
        key={node.id}
        type="text"
        data-pep-gap="true"
        data-gap-id={node.id}
        value={val}
        onChange={(e) => onInputChange(node, e.target.value)}
        onKeyDown={handleGapKeyDown}
        placeholder={displayPlaceholder}
        aria-label={rawPlaceholder && rawPlaceholder !== '...' ? `Preencher ${rawPlaceholder}` : 'Preencher lacuna'}
        className={`pep-inline-input mx-[1px] inline w-auto rounded border-0 border-b px-1.5 py-[1px] leading-snug outline-none transition-colors focus:border-solid focus:border-[#0F766E] focus:bg-teal-500/12 dark:focus:border-[#2DD4BF] dark:focus:bg-teal-400/15 ${
          isFilled
            ? 'border-teal-500/50 bg-teal-500/[0.07] text-zinc-950 hover:border-teal-600/70 dark:border-teal-400/45 dark:bg-teal-400/[0.10] dark:text-[#F3F4F6] dark:hover:border-teal-300/70'
            : 'border-amber-500/60 bg-amber-500/[0.10] text-zinc-950 placeholder:font-normal placeholder:text-amber-800/70 hover:border-amber-600/80 dark:border-amber-400/50 dark:bg-amber-400/[0.12] dark:text-[#F3F4F6] dark:placeholder:text-amber-300/70 dark:hover:border-amber-300/80'
        } ${
          isNumericLike ? 'font-mono text-[13px] font-medium tabular-nums' : 'font-sans text-[14px] font-medium'
        }`}
      />
    );
  };

  const renderDoseFormula = (node: DoseFormulaNode) => {
    const evaluated = evaluateDoseFormula(node, clinicalContext.weightKg);
    return (
      <span key={node.id} className="inline">
        <span className="font-mono text-[13px] text-zinc-700 dark:text-[#D1D5DB]">{node.raw}</span>
        {evaluated && (
          <span
            className={`ml-1 inline-flex items-baseline font-mono text-[12px] tabular-nums ${
              evaluated.ceilingHit
                ? 'font-semibold text-amber-700 dark:text-amber-400'
                : 'font-medium text-[#0F766E] dark:text-[#2DD4BF]'
            }`}
            title={
              evaluated.ceilingHit
                ? 'Dose limitada pelo teto adulto de segurança'
                : 'Dose calculada automaticamente pelo peso informado'
            }
          >
            ({evaluated.formattedBadge})
          </span>
        )}
      </span>
    );
  };

  const renderChoiceGroup = (group: ChoiceGroupNode) => {
    const selectedIndices = state.choiceSelections[group.id] || [];
    const isMulti = state.choiceMultiModes[group.id] ?? group.isLikelyMulti;
    const isSimpleBinary = !isMulti && group.options.length === 2 && hasOnlySimpleTextOptions(group);
    const isOpen = openPopoverId === group.id;

    const selectedOptions = selectedIndices
      .map((i) => group.options[i])
      .filter((o): o is ChoiceOptionAst => Boolean(o));

    const hasEmbeddedInputsInSelection = selectedOptions.some((opt) => optionHasEmbeddedInput(opt));

    const nextBinaryLabel = isSimpleBinary
      ? group.options[selectedIndices[0] === 0 ? 1 : 0]?.rawText
      : undefined;

    const handleTriggerClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isSimpleBinary) {
        const current = selectedIndices[0] ?? 0;
        const next = current === 0 ? 1 : 0;
        onChoiceSelect(group, [next]);
        return;
      }
      if (openPopoverId === group.id) {
        setOpenPopoverId(null);
        return;
      }
      const triggerRect = e.currentTarget.getBoundingClientRect();
      const containerRight = containerRef.current?.getBoundingClientRect().right;
      const boundaryRight = Math.min(
        window.innerWidth,
        typeof containerRight === 'number' ? containerRight : window.innerWidth
      );
      const spaceToRight = boundaryRight - triggerRect.left;
      setPopoverAlignRight(spaceToRight < 320 && triggerRect.right > 220);
      setOpenPopoverId(group.id);
    };

    const handleOptionClick = (optIdx: number) => {
      if (isMulti) {
        const next = resolveMultiChoiceSelection(group.options, selectedIndices, optIdx);
        onChoiceSelect(group, next);
      } else {
        onChoiceSelect(group, [optIdx]);
        setOpenPopoverId(null);
      }
    };

    const triggerClass = `inline cursor-pointer rounded border-0 px-1.5 py-[1px] text-left font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0F766E] dark:focus-visible:ring-[#2DD4BF] ${
      selectedOptions.length === 0
        ? 'bg-amber-500/[0.10] text-amber-900 hover:bg-amber-500/20 dark:bg-amber-400/[0.12] dark:text-amber-300 dark:hover:bg-amber-400/20'
        : 'bg-zinc-200/65 text-zinc-900 hover:bg-teal-500/15 hover:text-[#0F766E] dark:bg-white/[0.08] dark:text-[#F3F4F6] dark:hover:bg-teal-400/15 dark:hover:text-[#2DD4BF]'
    }`;

    return (
      <span
        key={group.id}
        data-choice-popover={group.id}
        className="relative inline"
      >
        {selectedOptions.length === 0 ? (
          <button
            type="button"
            onClick={handleTriggerClick}
            aria-expanded={!isSimpleBinary ? isOpen : undefined}
            aria-haspopup={!isSimpleBinary ? 'listbox' : undefined}
            title="Clique para selecionar opção clínica"
            className={triggerClass}
          >
            <span>
              {group.options[0]?.rawText ? `Selecionar (${group.options[0].rawText}…)` : 'Selecionar'}
            </span>
            <span aria-hidden="true" className="ml-1 text-[10px] text-amber-700 opacity-85 dark:text-amber-300">
              ▾
            </span>
          </button>
        ) : hasEmbeddedInputsInSelection ? (
          <span className="inline">
            {selectedOptions.map((opt, optPos) => {
              const hasInput = optionHasEmbeddedInput(opt);
              const staticPrefix = hasInput ? getChoiceOptionStaticPrefix(opt) : '';

              return (
                <Fragment key={opt.id}>
                  {optPos > 0 && ', '}
                  {!hasInput ? (
                    <button
                      type="button"
                      onClick={handleTriggerClick}
                      title="Clique para alterar opções"
                      className={triggerClass}
                    >
                      {getChoiceOptionSummary(opt, state)}
                    </button>
                  ) : (
                    <span className="inline">
                      {staticPrefix && (
                        <>
                          <button
                            type="button"
                            onClick={handleTriggerClick}
                            title="Clique para alterar opção clínica"
                            className={triggerClass}
                          >
                            {staticPrefix}
                          </button>{' '}
                        </>
                      )}
                      {opt.children.map((ch, idx) => {
                        if (idx === 0 && ch.kind === 'text' && staticPrefix) return null;
                        if (ch.kind === 'text') {
                          return <Fragment key={ch.id}>{stripMarkdownTokens(ch.value)}</Fragment>;
                        }
                        return (
                          <Fragment key={ch.id}>
                            {idx > 0 && opt.children[idx - 1]?.kind === 'inline-input' ? ' ' : ''}
                            {renderInlineInput(ch)}
                          </Fragment>
                        );
                      })}
                    </span>
                  )}
                </Fragment>
              );
            })}
            <button
              type="button"
              onClick={handleTriggerClick}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-label="Alterar opção clínica"
              title="Alterar opção clínica"
              className="ml-0.5 inline-flex cursor-pointer items-center rounded px-0.5 text-[11px] leading-none text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-[#0F766E] focus:outline-none focus-visible:text-[#0F766E] dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#2DD4BF]"
            >
              ▾
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleTriggerClick}
            aria-expanded={!isSimpleBinary ? isOpen : undefined}
            aria-haspopup={!isSimpleBinary ? 'listbox' : undefined}
            title={
              isSimpleBinary && nextBinaryLabel
                ? `Clique para alternar para: ${nextBinaryLabel}`
                : 'Clique para alterar opção clínica'
            }
            className={triggerClass}
          >
            <span>{selectedOptions.map((o) => getChoiceOptionSummary(o, state)).join(', ')}</span>
            <span aria-hidden="true" className="ml-1 text-[10px] text-zinc-600 opacity-85 dark:text-zinc-300">
              ▾
            </span>
          </button>
        )}

        {/* Mini-popover neutro (3+ opções ou multi-escolha) com alinhamento anti-clipping */}
        {isOpen && !isSimpleBinary && (
          <div
            role="listbox"
            aria-multiselectable={isMulti || undefined}
            className={`absolute top-full z-40 mt-1.5 max-h-64 min-w-[210px] max-w-[min(320px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-white/[0.12] dark:bg-[#1C2029] ${
              popoverAlignRight ? 'right-0' : 'left-0'
            }`}
          >
            {isMulti && (
              <div className="border-b border-zinc-100 px-3 py-1 text-[10px] font-medium tracking-wide text-zinc-400 uppercase dark:border-white/[0.06] dark:text-[#9CA3AF]">
                Seleção múltipla
              </div>
            )}
            {group.options.map((opt) => {
              const isSelected = selectedIndices.includes(opt.index);
              const optLabel = getChoiceOptionSummary(opt, state);
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleOptionClick(opt.index)}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs leading-snug transition-colors ${
                    isSelected
                      ? 'bg-teal-50/70 font-medium text-[#0F766E] dark:bg-teal-500/15 dark:text-[#2DD4BF]'
                      : 'text-zinc-700 hover:bg-zinc-100/80 dark:text-[#D1D5DB] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">{optLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </span>
    );
  };

  const renderInlineNodes = (
    nodes: readonly PepInlineNode[],
    options?: {
      stripLeadingNumber?: boolean;
      stripLeadingBullet?: boolean;
      highlightDrugName?: boolean;
      stripOuterItalic?: boolean;
    }
  ): React.ReactNode => {
    let strippedPrefix = false;
    let strippedLeadingItalic = !options?.stripOuterItalic;
    let justOmittedTrava = false;
    let drugBoldDone = !options?.highlightDrugName;

    let lastNonEmptyTextIdx = -1;
    if (options?.stripOuterItalic) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.kind === 'text' && n.value.trim().length > 0) {
          lastNonEmptyTextIdx = i;
          break;
        }
      }
    }

    return nodes.map((node, nodeIdx) => {
      if (node.kind === 'trava-alert') {
        if (node.isSafetyWarning && !state.travaExcluded[node.id]) {
          justOmittedTrava = false;
          return (
            <span
              key={node.id}
              className="mx-1 font-medium text-[12.5px] text-red-700 dark:text-red-400"
            >
              {node.rawBracket}
            </span>
          );
        }
        justOmittedTrava = true;
        return null;
      }

      if (node.kind === 'text') {
        let txt = stripMarkdownTokens(node.value);
        if (!strippedLeadingItalic && txt.trim().length > 0) {
          txt = txt.replace(/^(\s*)\*(?!\*)/, '$1');
          strippedLeadingItalic = true;
        }
        if (options?.stripOuterItalic && nodeIdx === lastNonEmptyTextIdx) {
          txt = txt.replace(/(?<!\*)\*(\s*)$/, '$1');
        }
        if (justOmittedTrava) {
          txt = txt.replace(/^[:\-–]\s*/, '');
          justOmittedTrava = false;
        }
        if (!strippedPrefix) {
          if (options?.stripLeadingNumber) {
            txt = txt.replace(/^\s*\d+[.)]\s+/, '');
            strippedPrefix = true;
          } else if (options?.stripLeadingBullet) {
            txt = txt.replace(/^\s*[-*]\s+/, '');
            strippedPrefix = true;
          } else if (txt.trim().length > 0) {
            strippedPrefix = true;
          }
        }
        if (!txt) return null;

        // Formatação editorial de item de prescrição com separador "-----" (ex: "Dipirona 500 mg ------ 1 caixa")
        const dashMatch = txt.match(/^(.*?)\s*-{3,}\s*(.+)$/);
        if (dashMatch && options?.highlightDrugName) {
          drugBoldDone = true;
          const leftPart = dashMatch[1].trimEnd();
          const rightPart = dashMatch[2].trim();
          return (
            <Fragment key={node.id}>
              {leftPart && (
                <span className="font-medium text-zinc-950 dark:text-[#F3F4F6]">{leftPart}</span>
              )}
              <span
                aria-hidden="true"
                className="mx-2 inline-block w-6 border-b border-dotted border-zinc-300 align-middle dark:border-white/[0.14]"
              />
              <span className="font-mono text-[12.5px] text-zinc-500 dark:text-[#9CA3AF]">
                {rightPart}
              </span>
            </Fragment>
          );
        }

        // Destaque sutil do nome do medicamento ou rótulo inicial antes de ":" em itens numerados
        if (!drugBoldDone) {
          const colonIdx = txt.indexOf(':');
          if (colonIdx > 1 && colonIdx <= 48) {
            drugBoldDone = true;
            return (
              <Fragment key={node.id}>
                <span className="font-medium text-zinc-950 dark:text-[#F3F4F6]">
                  {txt.slice(0, colonIdx + 1)}
                </span>
                {txt.slice(colonIdx + 1)}
              </Fragment>
            );
          }
          // Se toda a porção inicial do item numerado é o nome do fármaco (antes de escolha ou lacuna)
          drugBoldDone = true;
          return (
            <span key={node.id} className="font-medium text-zinc-950 dark:text-[#F3F4F6]">
              {txt}
            </span>
          );
        }

        // Destaque sutil de rótulos clínicos no início de parágrafo (ex: "ID:", "PA:", "Comorbidades:")
        const leadMatch = !options?.highlightDrugName ? txt.match(LEAD_PREFIX_REGEX) : null;
        if (leadMatch) {
          const prefix = leadMatch[1];
          const rest = txt.slice(prefix.length);
          return (
            <Fragment key={node.id}>
              <span className="font-medium text-zinc-950 dark:text-[#F3F4F6]">{prefix}</span>
              {rest}
            </Fragment>
          );
        }

        return <Fragment key={node.id}>{txt}</Fragment>;
      }

      justOmittedTrava = false;

      if (node.kind === 'inline-input') {
        return renderInlineInput(node);
      }

      if (node.kind === 'dose-formula') {
        return renderDoseFormula(node);
      }

      if (node.kind === 'choice-group') {
        return renderChoiceGroup(node);
      }

      if (node.kind === 'optional') {
        if (!state.optionalOpen[node.id]) return null;
        return (
          <Fragment key={node.id}>
            {node.needsLeadingSpace ? ' ' : ''}
            {renderInlineNodes(node.children)}
          </Fragment>
        );
      }

      return null;
    });
  };

  // Filtra blocos visíveis na seção preservando agrupamento sem duplicar espaços vazios
  const visibleBlockIndices = useMemo(() => {
    const out: number[] = [];
    for (const bi of section.blockIndices) {
      if (layout.excludedBlocks.has(bi) || layout.hiddenWrapperBlocks.has(bi)) continue;
      const blk = ast.blocks[bi];
      if (blk.kind === 'paragraph' && blk.isEmptyLine) {
        if (out.length === 0) continue;
        const prev = ast.blocks[out[out.length - 1]];
        if (prev.kind === 'paragraph' && prev.isEmptyLine) continue;
      }
      out.push(bi);
    }
    while (out.length > 0) {
      const last = ast.blocks[out[out.length - 1]];
      if (last.kind === 'paragraph' && last.isEmptyLine) out.pop();
      else break;
    }
    return out;
  }, [ast.blocks, layout.excludedBlocks, layout.hiddenWrapperBlocks, section.blockIndices]);

  return (
    <div ref={containerRef}>
      {/* Faixa sutil de interruptores condicionais / opcionais no topo do bloco */}
      {section.toggles.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200/70 bg-zinc-50/70 px-4 py-2.5 dark:border-white/[0.06] dark:bg-[#1C2029]/45">
          <span className="text-[10px] font-semibold tracking-[0.06em] text-zinc-400 uppercase dark:text-[#9CA3AF]">
            Condicionais
          </span>
          {section.toggles.map((toggle) => {
            const isActive =
              toggle.kind === 'trava'
                ? !state.travaExcluded[toggle.id]
                : Boolean(state.optionalOpen[toggle.id]);
            return (
              <button
                key={toggle.id}
                type="button"
                role="switch"
                aria-checked={isActive}
                title={toggle.fullLabel}
                onClick={() =>
                  toggle.kind === 'trava'
                    ? onToggleTrava(toggle.id)
                    : onToggleOptional(toggle.id)
                }
                className={`group inline-flex items-center gap-2 text-xs transition-colors ${
                  isActive
                    ? 'font-medium text-zinc-900 dark:text-[#F3F4F6]'
                    : 'text-zinc-500 hover:text-zinc-800 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                    isActive
                      ? 'bg-[#0F766E] dark:bg-[#2DD4BF]'
                      : 'bg-zinc-300 dark:bg-white/[0.14]'
                  }`}
                >
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-2xs transition-transform dark:bg-[#0F1115] ${
                      isActive ? 'translate-x-3' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                <span>{toggle.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Corpo editorial com hierarquia tipográfica real */}
      <div className="space-y-1.5 px-5 py-4 text-[14px] leading-[1.68] text-zinc-800 dark:text-[#D1D5DB]">
        {visibleBlockIndices.length === 0 ? (
          <p className="py-2 text-xs text-zinc-400 dark:text-[#9CA3AF]">
            Nenhum item ativo neste bloco. Ative um condicional acima para incluir.
          </p>
        ) : (
          visibleBlockIndices.map((bi, visIdx) => {
            const block = ast.blocks[bi];

            if (block.kind === 'heading') {
              return (
                <h3
                  key={block.id}
                  className={`font-display text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase dark:text-[#9CA3AF] ${
                    visIdx === 0 ? 'pt-0.5' : 'pt-4'
                  } pb-0.5`}
                >
                  {renderInlineNodes(block.children)}
                </h3>
              );
            }

            if (block.isEmptyLine) {
              return <div key={block.id} className="h-2" aria-hidden="true" />;
            }

            // Rótulo interno de seção (ex: USO ORAL:, ORIENTAÇÕES DE SINAIS DE ALARME:)
            if (isStandaloneClinicalHeader(block)) {
              return (
                <div
                  key={block.id}
                  className={`font-display text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase dark:text-[#9CA3AF] ${
                    visIdx === 0 ? 'pt-0.5' : 'pt-3.5'
                  } pb-0.5`}
                >
                  {renderInlineNodes(block.children)}
                </div>
              );
            }

            // Item numerado (prescrição ou conduta) com numeração tabular alinhada e renumeração automática
            const assignedNum = layout.renumberedByBlockIndex.get(bi);
            if (assignedNum !== undefined) {
              const isPromoted = layout.promotedNumberedBlocks.has(bi);
              return (
                <div
                  key={block.id}
                  className={`flex items-baseline gap-2 ${visIdx === 0 ? '' : 'pt-1.5'}`}
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-zinc-400 select-none dark:text-[#6B7280]">
                    {assignedNum}.
                  </span>
                  <div className="min-w-0 flex-1 text-zinc-900 dark:text-[#F3F4F6]">
                    {renderInlineNodes(block.children, {
                      stripLeadingNumber: !isPromoted,
                      stripLeadingBullet: isPromoted,
                      highlightDrugName: true,
                    })}
                  </div>
                </div>
              );
            }

            // Linha de posologia / continuação indentada abaixo de item numerado
            const isItalicNote = /^\*(?!\*).+\*$/.test(block.rawLine.trim());
            const isPosologyContinuation =
              layout.promotedContinuationBlocks.has(bi) ||
              (block.indent.length >= 2 && !/^[-*]\s+/.test(block.rawLine.trim()));
            if (isPosologyContinuation) {
              return (
                <div
                  key={block.id}
                  className={`pl-7 text-[13.5px] leading-[1.6] ${
                    isItalicNote
                      ? 'italic text-zinc-500 dark:text-[#9CA3AF]'
                      : 'text-zinc-600 dark:text-[#9CA3AF]'
                  }`}
                >
                  {renderInlineNodes(block.children, { stripOuterItalic: isItalicNote })}
                </div>
              );
            }

            // Checkbox clínico interativo
            if (block.checkbox) {
              const isChecked = state.checkboxStates[block.id] ?? block.checkbox.checked;
              return (
                <label
                  key={block.id}
                  className="flex cursor-pointer items-start gap-2.5 py-0.5"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleCheckbox(block.id)}
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 accent-[#0F766E] dark:border-zinc-600 dark:accent-[#2DD4BF]"
                  />
                  <span className={isChecked ? '' : 'text-zinc-400 line-through dark:text-zinc-500'}>
                    {renderInlineNodes(block.children)}
                  </span>
                </label>
              );
            }

            // Bullet de lista
            const isBullet = /^\s*[-*]\s+/.test(block.rawLine);
            if (isBullet) {
              const extraIndent = block.indent.length >= 2 ? 'pl-5' : 'pl-1';
              return (
                <div key={block.id} className={`flex items-baseline gap-2 ${extraIndent}`}>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-zinc-400 select-none dark:text-[#6B7280]"
                  >
                    •
                  </span>
                  <div className="min-w-0 flex-1">
                    {renderInlineNodes(block.children, { stripLeadingBullet: true })}
                  </div>
                </div>
              );
            }

            // Parágrafo clínico padrão
            return (
              <p
                key={block.id}
                className={`leading-[1.7] ${isItalicNote ? 'italic text-zinc-500 dark:text-[#9CA3AF]' : ''}`}
              >
                {renderInlineNodes(block.children, { stripOuterItalic: isItalicNote })}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}
