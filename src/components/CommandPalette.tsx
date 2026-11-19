import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileText, Search, Stethoscope, X } from 'lucide-react';
import type { ClinicalProtocolItem } from '../data/clinical_data.ts';
import { searchClinicalProtocols } from '../engine/search.ts';
import type MiniSearch from 'minisearch';

interface CommandPaletteProps {
  open: boolean;
  items: readonly ClinicalProtocolItem[];
  searchIndex: MiniSearch;
  onClose: () => void;
  onSelectItem: (item: ClinicalProtocolItem) => void;
}

const MOD_SHORT_LABEL: Record<ClinicalProtocolItem['mod_id'], string> = {
  go: 'GO',
  upa: 'UPA',
  enf: 'Enfermaria',
  ped: 'Pediatria',
  hab: 'Pré-Porta',
};

export function CommandPalette({
  open,
  items,
  searchIndex,
  onClose,
  onSelectItem,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return items.slice(0, 14).map((item) => ({ item, matchedSymptom: null as string | null }));
    }
    return searchClinicalProtocols(searchIndex, items, trimmed, 18).map((r) => ({
      item: r.item,
      matchedSymptom: r.matchedSymptom,
    }));
  }, [items, searchIndex, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const activeEl = listRef.current?.querySelector<HTMLElement>(`[data-cmd-idx="${activeIndex}"]`);
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      onSelectItem(results[activeIndex].item);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/45 px-3 pt-[10vh] backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Busca global de protocolos e Pré-Porta"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar protocolo, sintoma, CID-10 ou cartão Pré-Porta..."
            className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhum protocolo ou cartão Pré-Porta encontrado para “{query}”.
            </div>
          ) : (
            results.map(({ item, matchedSymptom }, idx) => {
              const isSelected = idx === activeIndex;
              const isHab = item.mod_id === 'hab';
              return (
                <button
                  key={item.id}
                  type="button"
                  data-cmd-idx={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onSelectItem(item);
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-teal-50/80 text-slate-950 dark:bg-teal-950/40 dark:text-slate-50'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    {isHab ? (
                      <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                    ) : (
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        <span>{MOD_SHORT_LABEL[item.mod_id]}</span>
                        <span>·</span>
                        <span className="truncate">{item.category}</span>
                        {item.cid10 && (
                          <>
                            <span>·</span>
                            <span className="font-mono text-[11px]">{item.cid10}</span>
                          </>
                        )}
                        {matchedSymptom && (
                          <>
                            <span>·</span>
                            <span className="text-teal-700 dark:text-teal-400">{matchedSymptom}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>↑↓ navegar · Enter abrir · Esc fechar</span>
          <span className="font-mono">{items.length} itens indexados</span>
        </div>
      </div>
    </div>
  );
}
