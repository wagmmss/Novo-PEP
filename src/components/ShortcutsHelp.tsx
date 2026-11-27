import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: 'Busca e navegação (Protocolos, Pré-Porta e Guias Teóricos)',
    items: [
      { keys: ['Ctrl', 'K'], label: 'Busca global (protocolos, Pré-Porta, 6 Intercorrências e Guias Teóricos)' },
      { keys: ['Shift', 'Enter'], label: 'Na busca global: abrir protocolo e copiar tudo' },
      { keys: ['/'], label: 'Focar o filtro da barra lateral' },
      { keys: ['↑', '↓'], label: 'No filtro: navegar entre itens da lista' },
      { keys: ['Enter'], label: 'No filtro: voltar ao conteúdo (ou saltar ocorrência nos Guias)' },
    ],
  },
  {
    title: 'Treino Clínico (6º Ano)',
    items: [
      { keys: ['Alt', 'C'], label: 'Na aba Hoje: copiar prompt do próximo passo do dia' },
      { keys: ['Ctrl', 'Enter'], label: 'No campo de registro: salvar tentativa no histórico' },
    ],
  },
  {
    title: 'Guias Teóricos (fora de campos de texto)',
    items: [
      { keys: ['['], label: 'Recolher ou expandir lista de módulos' },
      { keys: ['Alt', '←'], label: 'Módulo teórico anterior' },
      { keys: ['Alt', '→'], label: 'Próximo módulo teórico' },
    ],
  },
  {
    title: 'Aba Pré-Porta (fora de campos de texto)',
    items: [
      { keys: ['C'], label: 'Copiar texto pronto do prontuário' },
      { keys: ['M'], label: 'Alternar modo 30s Porta / Completo' },
    ],
  },
  {
    title: 'Prática (Logbook 3x e Pontos Cegos)',
    items: [
      { keys: ['/'], label: 'Focar o campo de busca da sub-aba ativa' },
      { keys: ['Ctrl', 'Enter'], label: 'Salvar captura rápida ou edição inline' },
      { keys: ['Esc'], label: 'Limpar busca ou cancelar edição inline' },
    ],
  },
  {
    title: 'Copiar para o PEP — Protocolos (fora de campos de texto)',
    items: [
      { keys: ['1'], label: 'Copiar tudo' },
      { keys: ['2'], label: 'Copiar Conduta' },
      { keys: ['3'], label: 'Copiar Prescrição' },
      { keys: ['4'], label: 'Copiar Evolução' },
      { keys: ['5'], label: 'Copiar Orientações' },
      { keys: ['Alt', 'C'], label: 'Copiar tudo (funciona até dentro de um campo)' },
    ],
  },
  {
    title: 'Preenchimento',
    items: [
      { keys: ['Alt', 'N'], label: 'Próximo campo vazio (Alt+Shift+N: anterior)' },
      { keys: ['Tab'], label: 'Próxima lacuna, atravessando as seções' },
      { keys: ['Esc'], label: 'Fechar popover / cancelar cópia retida' },
      { keys: ['?'], label: 'Mostrar esta ajuda' },
    ],
  },
];

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-3 pt-[10vh] backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Atalhos de teclado"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#15181F]">
        <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 dark:border-white/[0.07]">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-[#F3F4F6]">
            <Keyboard className="h-4 w-4 text-[#0F766E] dark:text-[#2DD4BF]" />
            Atalhos de teclado
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar atalhos"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-4 py-3">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-zinc-500 uppercase dark:text-[#9CA3AF]">
                {group.title}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-zinc-700 dark:text-[#D1D5DB]">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[1.5rem] rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-center font-mono text-[11px] text-zinc-800 dark:border-white/[0.1] dark:bg-[#0F1115] dark:text-[#F3F4F6]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
