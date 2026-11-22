// ============================================================================
// ROTA NA URL (hash) — recarregar, abrir em nova aba, favoritar e "Voltar" do navegador
//   #/p                              lista de protocolos
//   #/p/<id>                         protocolo aberto
//   #/hab                            lista Pré-Porta
//   #/hab/<id>                       cartão Pré-Porta aberto
//   #/6ano/<aba>                     pratica | teoria | r1-curriculo
//   #/6ano/pratica/pontos-cegos      sub-aba Pontos Cegos aberta
//   #/6ano/teoria/treino/<sec>/<id>  sub-seção e alvo do Treino Clínico
//   #/6ano/teoria/guias              lista de Guias Teóricos
//   #/6ano/teoria/guias/<modId>      Guia Teórico específico aberto
// ============================================================================

export type SextoAnoRouteTab = 'pratica' | 'teoria' | 'r1-curriculo';
export type PraticaRouteSubTab = 'logbook' | 'pontos-cegos';
export type TeoriaSubMode = 'treino' | 'guias';
export type TreinoSectionRoute = 'esteira' | 'e1' | 'e3' | 'e4' | 'log';

export type AppRoute =
  | { world: 'beira-leito'; tab: 'protocolos' | 'pre-porta'; id: string | null; detail: boolean }
  | {
      world: 'sexto-ano';
      tab: SextoAnoRouteTab;
      subTab?: PraticaRouteSubTab;
      teoriaMode?: TeoriaSubMode;
      teoriaModId?: string | null;
      teoriaDetail?: boolean;
      treinoSection?: TreinoSectionRoute;
      treinoSlug?: string | null;
      treinoDetail?: boolean;
    };

const SEXTO_ANO_TABS: readonly SextoAnoRouteTab[] = ['pratica', 'teoria', 'r1-curriculo'];
const TREINO_SECTIONS: readonly TreinoSectionRoute[] = ['esteira', 'e1', 'e3', 'e4', 'log'];
const KNOWN_TEORIA_MOD_RE = /^mod-0[1-9]$/;
const SAFE_TREINO_SLUG_RE = /^[a-z0-9-]+$/;

export function formatHashRoute(route: AppRoute): string {
  if (route.world === 'sexto-ano') {
    if (route.tab === 'pratica' && route.subTab === 'pontos-cegos') {
      return '#/6ano/pratica/pontos-cegos';
    }
    if (route.tab === 'teoria') {
      if (route.teoriaMode === 'guias') {
        if (route.teoriaDetail && route.teoriaModId) {
          return `#/6ano/teoria/guias/${encodeURIComponent(route.teoriaModId)}`;
        }
        return '#/6ano/teoria/guias';
      }
      const sec = route.treinoSection;
      if (sec && sec !== 'esteira') {
        if ((sec === 'e1' || sec === 'e3' || sec === 'e4') && route.treinoDetail && route.treinoSlug) {
          return `#/6ano/teoria/treino/${sec}/${encodeURIComponent(route.treinoSlug)}`;
        }
        return `#/6ano/teoria/treino/${sec}`;
      }
    }
    return `#/6ano/${route.tab}`;
  }
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
    const tabSegment = rest[0] || '';
    const tab = SEXTO_ANO_TABS.find((t) => t === tabSegment) ?? 'pratica';
    if (tab === 'pratica' && rest[1] === 'pontos-cegos') {
      return { world: 'sexto-ano', tab, subTab: 'pontos-cegos' };
    }
    if (tab === 'teoria') {
      const modeSegment = rest[1] || '';
      if (modeSegment === 'guias') {
        let modId: string | null = null;
        if (rest[2]) {
          try {
            const decoded = decodeURIComponent(rest[2]);
            if (KNOWN_TEORIA_MOD_RE.test(decoded)) modId = decoded;
          } catch {
            modId = null;
          }
        }
        return {
          world: 'sexto-ano',
          tab: 'teoria',
          teoriaMode: 'guias',
          teoriaModId: modId,
          teoriaDetail: Boolean(modId),
        };
      }
      if (modeSegment === 'treino') {
        const secCandidate = rest[2] || '';
        const sec = TREINO_SECTIONS.find((s) => s === secCandidate) ?? 'esteira';
        let slug: string | null = null;
        if ((sec === 'e1' || sec === 'e3' || sec === 'e4') && rest[3]) {
          try {
            const decoded = decodeURIComponent(rest[3]);
            if (SAFE_TREINO_SLUG_RE.test(decoded)) slug = decoded;
          } catch {
            slug = null;
          }
        }
        return {
          world: 'sexto-ano',
          tab: 'teoria',
          teoriaMode: 'treino',
          treinoSection: sec,
          treinoSlug: slug,
          treinoDetail: Boolean(slug),
        };
      }
      return { world: 'sexto-ano', tab: 'teoria' };
    }
    return { world: 'sexto-ano', tab };
  }
  return null;
}
