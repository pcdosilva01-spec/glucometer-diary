# Glucometer — diário pessoal de glicose, alimentação e água

Aplicativo pessoal hospedado como site estático na Vercel. **Não tem cadastro, login, conta, autenticação ou integração de sincronização com nuvem.** Os registros são salvos no armazenamento local do navegador (`localStorage`) do dispositivo/perfil em uso.

## Privacidade e armazenamento

- Não é preciso fornecer e-mail, senha nem criar conta.
- Os registros de glicose, alimentação, insulina e água ficam no navegador atual; o aplicativo não os envia para uma API de dados externa.
- Limpar os dados do site, usar outro perfil do navegador ou trocar de dispositivo pode fazer o histórico não estar disponível.
- Use **Exportar JSON** para guardar um backup local em um local seguro. O backup contém dados pessoais de saúde; não o compartilhe nem o deixe em pastas públicas.
- Não há sincronização entre dispositivos. Esta escolha é intencional para manter o site sem contas nem configuração de serviços externos.

## Funcionalidades

- **Dashboard:** resumo de glicose e consumo de água.
- **Glicose:** registro, edição, exclusão, histórico, cartão de glicose exportado como imagem e visualização do resultado matemático da fórmula configurada pelo usuário (somente mg/dL; não é recomendação clínica nem preenche a dose automaticamente).
- **Alimentação e insulina:** registradas dentro do mesmo formulário **Registrar glicose**. A glicemia pode ficar vazia ou ser informada como `0` quando não foi medida; nesse caso, nenhuma medição de glicose é criada e o relatório mostra `?` quando houver um registro de refeição/insulina. Não existe botão separado para refeição ou insulina.
- **Água:** registros de volume, lembretes com o áudio local de água enquanto a página está aberta e opção de Web Push para alertas em segundo plano, sem cadastro de usuário.
- **Linha do tempo:** glicose, refeições e água agrupadas por dia.
- **Comparação:** visualização descritiva de registros feitos em momentos semelhantes.
- **PDF de automonitorização:** reproduz o formulário clássico AMG em A4 paisagem, com uma linha por dia e grupos de colunas para Café da Manhã, Almoço, Lanche e Jantar. Cada grupo tem campos de Antes, 2h após e Dose de insulina (unidade), além da glicemia ao deitar. Cada leitura mostra o valor e a hora; cada dose mostra as unidades e a hora. A coluna Obs. fica vazia. Registros de momentos sem campo correspondente (por exemplo, durante a refeição ou ao acordar) aparecem em uma folha complementar, sem comida nem observações pessoais. O texto “2h após” agrupa registros marcados “Após”; o sistema não valida que exatamente duas horas se passaram. Alimentação e água continuam disponíveis em seções separadas quando selecionadas explicitamente. É possível filtrar o período por data.
- **Backup JSON:** baixa uma cópia dos dados inseridos.
- **PWA:** pode ser instalado na tela inicial em navegadores compatíveis; o cache básico permite carregar parte da interface offline.

## Publicação na Vercel

O repositório está configurado para executar `npm run build`, que recria `public-site/` com HTML, CSS, módulos JavaScript, áudio, ícones, manifesto e service worker. A aplicação não precisa de variáveis de ambiente, banco de dados, API de autenticação ou serviços externos.

Após um novo deploy, o service worker atualiza o cache da interface. Se uma versão antiga continuar aparecendo, feche e reabra o site ou atualize-o pelo navegador.


## Notificações quando a página e o navegador estão fechados

O navegador não pode executar um temporizador JavaScript comum após a página ser fechada. Para receber lembretes sem abrir o site, o projeto agora inclui Web Push via service worker, uma função Vercel para enviar o push e um workflow do GitHub Actions que verifica os agendamentos a cada cinco minutos. Isso não adiciona cadastro/login ao app nem envia glicose, insulina, comida ou outros registros de saúde para a nuvem; apenas a inscrição push e a agenda de lembretes ficam no Redis.

O modo de fundo precisa ser configurado uma vez pelo proprietário do projeto:

1. No Marketplace/integrações da Vercel, conecte uma base Upstash Redis ao projeto e adicione `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` ao ambiente de produção.
2. Gere um par de chaves VAPID com `npx web-push generate-vapid-keys`. Configure `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` na Vercel; configure `VAPID_SUBJECT` com um endereço de contato válido, por exemplo `mailto:seu-email@example.com`. A chave privada deve ficar somente nas variáveis de ambiente do servidor.
3. Gere dois segredos fortes e diferentes com `openssl rand -hex 32`: use um como `PUSH_SETUP_TOKEN` e outro como `PUSH_CRON_SECRET`. Cadastre ambos nas variáveis de ambiente da Vercel e faça novo deploy. O código `PUSH_SETUP_TOKEN` será digitado uma vez no painel de lembretes do site; ele protege o endpoint e não é uma conta de usuário.
4. No GitHub, em **Settings → Secrets and variables → Actions**, crie `PUSH_DISPATCH_URL` com a URL completa `https://SEU-PROJETO.vercel.app/api/push-dispatch` e `PUSH_CRON_SECRET` com o mesmo valor definido na Vercel. O workflow `.github/workflows/push-reminders.yml` é executado a cada cinco minutos. O agendamento do GitHub pode sofrer atrasos; não é um relógio exato.
5. Publique o código na branch padrão do repositório e faça um novo deploy na Vercel. No site aberto por HTTPS, digite o `PUSH_SETUP_TOKEN`, clique em **Ativar notificações em segundo plano** e permita notificações no navegador.

O site continua utilizável sem configurar isso. Se não houver configuração do servidor, o botão informa que o modo de fundo ainda não está disponível. A entrega push depende do navegador, do sistema operacional, da conexão, das permissões e de o serviço de push do navegador aceitar a mensagem. O MP3 personalizado só pode tocar enquanto a página estiver aberta; com a página/navegador fechado, o alerta usa o som padrão de notificações do sistema. Não use esse recurso para alertas médicos urgentes.

## Enviar ao GitHub com force push

O script `push-force.sh` executa os testes, gera o build, prepara um commit e envia a branch `main` para o repositório configurado. Ele usa a autenticação do GitHub CLI (`gh`) e pede que você digite `FORCE` antes de sobrescrever a branch remota. O force push pode substituir o histórico remoto.

Execute na pasta do projeto:

```bash
chmod +x push-force.sh
./push-force.sh
```

Requisitos: `git`, `gh` (autenticado pelo navegador), Node.js e npm. O script não publica diretamente na Vercel; o deploy acontece conforme as configurações do repositório na Vercel.

## Testes e build

Com Node.js instalado:

```bash
npm test
npm run build
```

O aplicativo usa HTML, CSS e JavaScript nativos, sem dependências de runtime. `AGENTS.md` contém as instruções de manutenção; `PRODUCT.md` descreve o produto.

## Limites

O site organiza valores informados manualmente; não mede glicose nem diagnostica. O resultado da fórmula (glicemia − 100) ÷ 40 é arredondado para o inteiro mais próximo (valores fracionários a partir de 0,5 arredondam para cima) e exibido apenas como cálculo matemático fornecido pelo usuário, não como prescrição ou recomendação de aplicação. Use-o somente se sua equipe de saúde confirmou essa fórmula para você; qualquer dose calculada sem seguir um plano clínico específico pode causar hipoglicemia. O resultado não preenche automaticamente a dose registrada. Não substitui orientação de profissionais de saúde. Sem configurar o modo Web Push descrito abaixo, os lembretes locais só funcionam enquanto a página está aberta.


### Registrar sem medir a glicemia

Use um dos dois botões principais: **Registrar glicose** ou **Registrar água**. Dentro de **Registrar glicose**, o valor da glicemia é opcional: deixe-o vazio ou digite `0` se não mediu. Você ainda pode marcar que comeu, informar o alimento e/ou registrar as unidades de insulina realmente tomadas. O aplicativo salva o contexto sem criar uma medição fictícia; na exportação, a glicemia desconhecida aparece como `?` e a dose fica no campo de insulina do formulário AMG. Não é necessário usar um botão separado para alimentação ou insulina.

## Recuperação de anotações

A aplicação mantém até cinco cópias locais rotativas do estado anterior antes de salvar alterações, quando o navegador permite. Na página **Dados e instalação**, você pode:

- conferir a quantidade atual de glicemias, registros de água e anotações;
- recuperar uma cópia local anterior se ela contiver mais registros;
- importar um backup JSON do Glucometer;
- importar o formato de resgate do console (`entries["glucometer.personal.v1"]`).

A importação confirma as quantidades antes de prosseguir e mescla os registros por ID em vez de apagar silenciosamente o estado atual. Guarde uma cópia JSON fora do navegador, porque nenhum mecanismo local protege contra a limpeza completa dos dados do site.

### Resgate imediato antes de publicar esta versão

Se a interface ainda não mostrar a seção **Recuperar anotações**, baixe o arquivo `glucometer-recuperacao-anotacoes.json` que foi reconstruído do backup de resgate, abra o Glucometer publicado, pressione `F12` → **Console**, cole o conteúdo de `tools/recuperar-anotacoes-console.js` e pressione Enter. Selecione o arquivo JSON quando a janela abrir. O script guarda uma cópia separada do estado atual, mescla os registros por ID e recarrega a página. Não execute código de console que venha de terceiros ou de fontes não confiáveis.

### Notificações

Os lembretes locais só executam enquanto a página está aberta. O estado de notificação em segundo plano agora é mostrado separadamente e não será anunciado como ativo quando `/api/push-config` estiver indisponível ou as variáveis de ambiente da Vercel não estiverem configuradas. Web Push exige que as funções de API, as chaves VAPID, Upstash e o workflow de agendamento estejam realmente ativos no deploy.
