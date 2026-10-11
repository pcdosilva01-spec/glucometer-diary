# Instruções do projeto

Leia `README.md` e `PRODUCT.md` antes de mudar o projeto.

## Regra central: implementar o produto, não só a tela

A aplicação deve funcionar de ponta a ponta. Aparência, botões decorativos, formulários sem persistência ou dados fictícios não são suficientes. Quando alterar algo, preserve a funcionalidade existente e verifique o fluxo real correspondente.

- Navegação abre três seções reais: Dashboard, Glicose e Água.
- Criar, consultar, editar e excluir registros de glicose e água.
- Persistência local depois de recarregar; os registros atualizam históricos e cálculos imediatamente.
- Métricas sempre derivadas de registros existentes; vazio não significa média zero.
- Lembretes precisam respeitar permissão e disponibilidade do navegador, com alternativa enquanto o app está aberto.

## Limites técnicos

- Preserve a solução sem dependências: HTML/CSS/JS nativos. Não introduza frameworks, compiladores ou dependências de rede sem necessidade concreta.
- Não adicione login, backend, analytics, pixels, rastreadores ou serviços externos; não envie registros a terceiros.
- Não acesse nem inclua credenciais, `.env`, dados pessoais ou medições reais.
- Este é um diário, não uma ferramenta médica: sem diagnóstico, interpretação clínica, recomendações de tratamento ou metas clínicas inventadas.

## Linux Mint Cinnamon e terminal

- Priorize operações curtas, locais e de baixo consumo. O app deve continuar iniciando sem `npm install` ou downloads.
- Não use `sudo`, `apt`, comandos de atualização do sistema, Docker, buscas fora do projeto, varreduras recursivas amplas ou tarefas de alto consumo.
- Não execute comandos destrutivos (`rm -rf`, `git clean`, `git reset --hard`) nem altere configurações do Cinnamon.
- Antes de usar o terminal, veja apenas a raiz e os arquivos que precisa. Agrupe verificações simples, limite a saída e não repita comandos que já passaram.
- Evite ultrapassar 8 invocações de terminal por tarefa. Se uma validação adicional pesada parecer necessária, pare e explique antes de executá-la.
- `./iniciar.sh` inicia o app com o Python 3 já disponível no sistema; a execução permanece local em `127.0.0.1`.

## Conclusão e validação

Não declare uma funcionalidade concluída só porque compila ou está visível. Verifique criar → listar → editar → excluir, atualização da dashboard e persistência após recarga. Confira entradas inválidas e estado vazio. Execute testes leves já disponíveis e diga honestamente o que foi verificado.
