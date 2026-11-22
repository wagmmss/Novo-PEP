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
  { id: 'teoria', label: 'Treino & Teoria' },
  { id: 'r1-curriculo', label: 'Plano & R1' },
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
    <header className="sticky top-0 z-30 h-13 w-full shrink-0 border-b border-zinc-200/80 bg-white/95 backdrop-blur-xs dark:border-white/[0.07] dark:bg-[#0F1115]/95">
      <div className="mx-auto flex h-full w-full items-center justify-between gap-2 px-3 sm:px-5">
        {/* Esquerda: Switch de contexto + Abas do contexto ativo */}
        <div className="flex h-full min-w-0 items-center gap-3 sm:gap-5">
          {/* Switch segmentado Beira-Leito <-> 6º Ano */}
          <div
            role="group"
            aria-label="Contexto do aplicativo"
            className="inline-flex shrink-0 items-center rounded-lg border border-zinc-200/80 bg-zinc-100/80 p-0.5 dark:border-white/[0.07] dark:bg-[#15181F]"
          >
            <button
              type="button"
              onClick={() => onChangeWorld('beira-leito')}
              aria-pressed={world === 'beira-leito'}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold tracking-tight transition-colors ${
                world === 'beira-leito'
                  ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#1C2029] dark:text-[#F3F4F6]'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
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
                  ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[#1C2029] dark:text-[#F3F4F6]'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
              }`}
            >
              6º Ano
            </button>
          </div>

          <div className="hidden h-4 w-px shrink-0 bg-zinc-200 sm:block dark:bg-white/[0.08]" aria-hidden="true" />

          {/* Abas do contexto ativo (sem overflow-x-auto; indicador interno bottom-0 em h-full) */}
          <nav aria-label="Seções" className="flex h-full items-center gap-1">
            {world === 'beira-leito'
              ? BEIRA_LEITO_TABS.map((tab) => {
                  const active = beiraLeitoTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => onChangeBeiraLeitoTab(tab.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative flex h-full items-center whitespace-nowrap px-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                          : 'text-zinc-600 hover:text-zinc-950 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                      }`}
                    >
                      {tab.label}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[#0F766E] dark:bg-[#2DD4BF]"
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
                      className={`relative flex h-full items-center whitespace-nowrap px-2.5 text-sm font-medium transition-colors ${
                        active
                          ? 'text-[#0F766E] dark:text-[#2DD4BF]'
                          : 'text-zinc-600 hover:text-zinc-950 dark:text-[#9CA3AF] dark:hover:text-[#F3F4F6]'
                      }`}
                    >
                      {tab.label}
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-1.5 bottom-0 h-0.5 rounded-full bg-[#0F766E] dark:bg-[#2DD4BF]"
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
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200/80 bg-[#FAFAFA] px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/[0.08] dark:bg-[#15181F] dark:text-[#D1D5DB] dark:hover:border-white/[0.14] dark:hover:bg-[#1C2029]"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-[#9CA3AF]" />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="hidden rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-500 sm:inline-block dark:border-white/[0.08] dark:bg-[#0F1115] dark:text-[#9CA3AF]">
              Ctrl+K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro (plantão noturno)'}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Configurações e Backup"
            title="Backup JSON (Exportar / Importar)"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-[#9CA3AF] dark:hover:bg-[#1C2029] dark:hover:text-[#F3F4F6]"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
