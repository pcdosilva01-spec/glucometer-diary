# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: HTML, CSS e JavaScript nativos, sem bibliotecas ou build, para iniciar localmente no Linux Mint com poucos passos e sem instalar dependências do projeto.

## Users

Uma pessoa usando o próprio navegador para manter um diário pessoal de glicose e água.

## Product Purpose

Registrar glicose e ingestão de água com rapidez, consultar histórico e acompanhar resumos claros. Sucesso significa que cada registro é realmente salvo localmente, pode ser consultado, corrigido ou removido, e atualiza as estatísticas sem exigir conta ou serviço externo.

## Positioning

Um diário individual, leve e local, que torna os registros simples sem pressão ou gamificação coercitiva.

## Operating Context

Uso em navegador desktop ou celular, prioritariamente em Linux Mint com Cinnamon. A interface deve funcionar por servidor local simples e não depender de internet após estar nos arquivos.

## Capabilities and Constraints

- Seções distintas de Dashboard, Glicose e Água.
- Criar, listar, editar e excluir medições de glicose e registros de água. Cada medição de glicose pode gerar um cartão PNG com a aparência de um glicosímetro, valor, unidade e horário registrado.
- Persistência local no navegador; sem login, assinaturas, backend, analytics ou transmissão de dados.
- Dashboard com as 10 medições recentes, média de glicose por unidade/período, média diária e total de água, número de registros e última água. Os atalhos de água usam ícones SVG locais e originais.
- Lembrete configurável, inicialmente a cada 15 minutos; permissões só após solicitação explícita, com alternativa no app aberto.
- Lembretes não são garantidos com a página fechada.
- Interface em português brasileiro.
- Stack delegada à implementação: arquivos estáticos sem dependências.

## Evidence on Hand

Os requisitos fornecidos pela pessoa usuária são a especificação do produto. Não há medições reais, identidade visual, limiares clínicos ou metas médicas fornecidas; não inventar esses dados.

## Product Principles

- Registrar primeiro; navegar e preencher o mínimo necessário.
- Dados locais e controle da pessoa usuária.
- Resumos fiéis ao histórico, sem estatísticas inventadas.
- Acolhimento sem culpa, pressão ou conduta médica.

## Accessibility & Inclusion

Interface responsiva, rótulos e instruções acessíveis, teclado e foco visível, contraste legível, estados e erros comunicados sem depender apenas de cor.
