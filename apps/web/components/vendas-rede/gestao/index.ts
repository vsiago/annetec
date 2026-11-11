// Telas de gestão da Rede Comercial (rede, equipe, resultados, comissões e regras).
// Cada tela recebe `escopo` e descobre o papel sozinha (`euAction`), sem provider nem casca.
export { RedePage, RedeConteudo } from './rede-page'
export { EquipePage, EquipeConteudo, ReatribuirLeadsDialog } from './equipe-page'
export { ResultadosPage, ResultadosConteudo } from './resultados-page'
export { ComissoesPage, ComissoesConteudo } from './comissoes-page'
export { RegrasPage, RegrasConteudo } from './regras-page'
export { AgenteWizard, type VinculoInicial } from './agente-wizard'
export { AgenteDetalhe, AgenteDetalheSheet } from './agente-detalhe'
export { CorretoraWizard } from './corretora-wizard'
export { UnidadeWizard } from './unidade-wizard'
export { EquipeWizard } from './equipe-wizard'
export { PortaoDePapel, SemAcesso, CabecalhoTela, caminhoBase, podeVerTela, useEu, type TelaGestao } from './comum'
export type { EscopoRede, ConviteResultado, DesempenhoAgente, ResumoComissoes } from './tipos'
