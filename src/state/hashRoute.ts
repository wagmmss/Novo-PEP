// ============================================================================
// ROTA NA URL (hash) — recarregar, abrir em nova aba, favoritar e "Voltar" do navegador
//   #/p              lista de protocolos
//   #/p/<id>         protocolo aberto
//   #/hab            lista Pré-Porta
//   #/hab/<id>       cartão Pré-Porta aberto
//   #/6ano/<aba>     pratica | teoria | r1-curriculo
// ============================================================================

export type SextoAnoRouteTab = 'pratica' | 'teoria' | 'r1-curriculo';

export type AppRoute =
  | { world: 'beira-leito'; tab: 'protocolos' | 'pre-porta'; id: string | null; detail: boolean }
  | { world: 'sexto-ano'; tab: SextoAnoRouteTab };

const SEXTO_ANO_TABS: readonly SextoAnoRouteTab[] = ['pratica', 'teoria', 'r1-curriculo'];

export function formatHashRoute(route: AppRoute): string {
  if (route.world === 'sexto-ano') return `#/6ano/${route.tab}`;
  const base = route.tab === 'protocolos' ? '#/p' : '#/hab';
  return route.detail && route.id ? `${base}/${encodeURIComponent(route.id)}` : base;
}

/**
 * Lê o hash. Ids desconhecidos (protocolo removido, link antigo) caem na lista correspondente.
 * Retorna null para hash vazio ou não reconhecido (mantém o estado padrão do app).
 */
export function parseHashRoute(
  hash: string,
  isKnownId: (tab: 'protocolos' | 'pre-porta', id: string) => boolean | string | null
): AppRoute | null {
  const raw = String(hash || '').replace(/^#\/?/, '');
  if (!raw) return null;
  const [head, ...rest] = raw.split('/');
  let id: string | null = null;
  try {
    id = rest.length ? decodeURIComponent(rest.join('/')) : null;
  } catch {
    id = null;
  }

  if (head === 'p' || head === 'hab') {
    const tab = head === 'p' ? 'protocolos' : 'pre-porta';
    if (id) {
      const check = isKnownId(tab, id);
      if (typeof check === 'string' && check) {
        return { world: 'beira-leito', tab, id: check, detail: true };
      }
      if (check === true) {
        return { world: 'beira-leito', tab, id, detail: true };
      }
    }
    return { world: 'beira-leito', tab, id: null, detail: false };
  }
  if (head === '6ano') {
    const tab = SEXTO_ANO_TABS.find((t) => t === id) ?? 'pratica';
    return { world: 'sexto-ano', tab };
  }
  return null;
}
