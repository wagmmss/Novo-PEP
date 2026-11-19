import { Moon, Search, Settings, Sun } from 'lucide-react';
import type { ClinicalTheme } from '../state/store.ts';

export type AppWorld = 'beira-leito' | 'sexto-ano';
export type BeiraLeitoTab = 'protocolos' | 'pre-porta';
export type SextoAnoTab = 'pratica' | 'teoria' | 'r1-curriculo';

interface TopBarProps {
  world: AppWorld;
  beiraLeitoTab: BeiraLeitoTab;
  sextoAnoTab: SextoAnoTab;
  theme: ClinicalTheme;
  onChangeWorld: (world: AppWorld) => void;
  onChangeBeiraLeitoTab: (tab: BeiraLeitoTab) => void;
  onChangeSextoAnoTab: (tab: SextoAnoTab) => void;
  onOpenSearch: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

const BEIRA_LEITO_TABS: Array<{ id: BeiraLeitoTab; label: string }> = [
  { id: 'protocolos', label: 'Protocolos' },
  { id: 'pre-porta', label: 'Pré-Porta' },
];

const SEXTO_ANO_TABS: Array<{ id: SextoAnoTab; label: string }> = [
  { id: 'pratica', label: 'Prática' },
  { id: 'teoria', label: 'Teoria' },
  { id: 'r1-curriculo', label: 'R1 & Currículo' },
];

export function TopBar({
  world,
  beiraLeitoTab,
  sextoAnoTab,
  theme,
  onChangeWorld,
  onChangeBeiraLeitoTab,
  onChangeSextoAnoTab,
  onOpenSearch,
  onToggleTheme,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-13 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-[#0b1117]/95">
      <div className="mx-auto flex h-full w-full items-center justify-between gap-2 px-3 sm:px-5">
        {/* Esquerda: Switch de contexto + Abas do contexto ativo */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          {/* Switch segmentado Beira-Leito <-> 6º Ano */}
          <div
            role="group"
            aria-label="Contexto do aplicativo"
            className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              onClick={() => onChangeWorld('beira-leito')}
              aria-pressed={world === 'beira-leito'}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors ${
                world === 'beira-leito'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Beira-Leito
            </button>
            <button
              type="button"
              onClick={() => onChangeWorld('sexto-ano')}
              aria-pressed={world === 'sexto-ano'}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors ${
                world === 'sexto-ano'
                  ? 'bg-white text-slate-900 shadow-2xs dark:bg-slate-800 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              6º Ano
            </button>
          </div>

          <div className="hidden h-4 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-800" aria-hidden="true" />

          {/* Abas do contexto ativo */}
          <nav aria-label="Seções" className="flex items-center gap-1 overflow-x-auto">
            {world === 'beira-leito'
              ? BEIRA_LEITO_TABS.map((tab) => {
                  const active = beiraLeitoTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onChangeBeiraLeitoTab(tab.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'text-teal-700 dark:text-teal-400'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                      }`}
                    >
                      {tab.label}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-teal-700 dark:bg-teal-400"
                        />
                      )}
                    </button>
                  );
                })
              : SEXTO_ANO_TABS.map((tab) => {
                  const active = sextoAnoTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onChangeSextoAnoTab(tab.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? 'text-teal-700 dark:text-teal-400'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                      }`}
                    >
                      {tab.label}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-2 -bottom-[9px] h-0.5 rounded-full bg-teal-700 dark:bg-teal-400"
                        />
                      )}
                    </button>
                  );
                })}
          </nav>
        </div>

        {/* Direita: Busca global (Ctrl+K), Tema e Configurações */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Busca global (Ctrl+K)"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 sm:inline-block dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
              Ctrl+K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro (plantão noturno)'}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Configurações e Backup"
            title="Backup JSON (Exportar / Importar)"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
