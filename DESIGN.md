# Design direction

## Product mode

Operate: a pessoa está registrando e consultando dados pessoais com frequência. Velocidade, legibilidade e estados reais são mais importantes que ornamentação.

## Visual world: instrumento editorial pessoal

O produto deve parecer um instrumento pessoal feito com intenção: leitura por colunas, alinhamento rigoroso, separadores editoriais e superfícies planas, sem a composição padrão de cartões repetidos. A navegação escura ancora o espaço; o conteúdo usa papel neutro e tinta azul-marinho. **Glicose é vermelha; água é azul** — cores consistentes em valores, ações, navegação e foco, nunca como decoração. Manter formas compactas, números tabulares e ícones SVG originais. Evitar halos, gradientes, micro-rótulos em caixa alta, sombras difusas, pastéis genéricos e aparência médica alarmista.

## Type and composition

Use uma família de interface local, escala tipográfica fixa e dados com algarismos tabulares. Sidebar estável no desktop, navegação compacta no celular e dashboard com uma faixa comparativa de métricas — não três cartões independentes. Agrupar o registro recente como uma lista editorial; manter as ações de glicose e água visíveis e distinguíveis pela cor.

## Interaction and states

- Ações primárias sempre executam o trabalho indicado.
- Formulários inline mantêm o contexto; erro aparece junto ao campo e sucesso confirma o registro salvo.
- Histórico mostra dados reais e opções claras de editar/remover.
- Estados sem dados são calmos e convidam a uma primeira ação.
- Lembretes e progresso são opcionais, pausáveis e sem pressão.
- Interações têm foco visível e respeitam `prefers-reduced-motion`.

## Build constraints

CSS/HTML/SVG próprios, sem imagem de banco, fontes hospedadas, CDN ou rede no runtime. A consistência offline e a privacidade têm prioridade.
