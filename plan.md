# Plano de melhoria — Glucometer

## Direção de design

- **Movimento:** playful utility / gamificação gentil, inspirado em apps de aprendizado como o Duolingo sem copiar personagens, logotipo ou assets proprietários.
- **Princípios:** ação primeiro; feedback visual imediato; cores com função; leveza sem culpa.
- **Paleta:** verde vivo como assinatura de progresso e cuidado, roxo para navegação e glicose, azul para água, fundos quentes e superfícies elevadas.
- **Layout:** dashboard com hero de check-in diário e duas ações grandes; histórico em listas; navegação lateral no desktop e barra fixa no mobile.
- **Elementos de assinatura:** mascote abstrato em SVG, barras de progresso suaves e pílulas de status “feito / falta anotar”.
- **Interação:** cada item do check-in leva diretamente ao formulário correspondente; depois de salvar, o estado muda para concluído.
- **Animação:** microanimações curtas, apenas em entrada/feedback; respeitar `prefers-reduced-motion`.
- **Tipografia:** sistema nativo para manter o app offline, com títulos arredondados visualmente via peso e espaçamento, números tabulares.
- **Essência:** um diário local que transforma glicose e água em dois pequenos check-ins fáceis de repetir. Personalidade: acolhedor, claro, encorajador.
- **Voz:** “Vamos cuidar do próximo passo.” / “Glicose anotada. Água é o próximo gole.”
- **Marca:** wordmark glucoMeter com o “o” pontuado por uma gota; sem usar marca registrada de terceiros.
- **Cor proprietária do produto:** `--brand-green: #58cc02`.

## Implementação

- Preservar HTML/CSS/JS nativos, `localStorage`, lembretes e histórico.
- Adicionar ao Dashboard um bloco persistente de check-in do dia, derivado dos registros reais: glicose concluída quando houver medição de hoje e água concluída quando houver ao menos um registro hoje.
- As ações do check-in abrem os formulários existentes; nenhum dado clínico, meta ou registro fictício será criado.
- Aplicar novo sistema visual responsivo em `styles.css` e pequenos rótulos de orientação em `index.html`.
- Atualizar manifesto de rotas estáticas para o preview local.

## Estrutura

- `index.html`: shell, navegação, dashboard, formulários e histórico.
- `src/app.mjs`: estado de UI, eventos, persistência e renderização do check-in.
- `src/core.mjs`: normalização, cálculos e armazenamento local.
- `styles.css`: sistema visual responsivo.
- `public/manus-routes.json`: rotas declaradas.
