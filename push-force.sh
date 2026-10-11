#!/usr/bin/env bash
# Testa, prepara e envia a branch main ao repositório do Glucometer usando force push.
# Execute a partir de qualquer diretório: o script trabalha na pasta em que está instalado.
set -Eeuo pipefail

REPO_URL="https://github.com/pcdosilva01-spec/glucometer-diary.git"
BRANCH="main"
COMMIT_MESSAGE="Atualiza Glucometer pessoal"
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

fail() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

for command in git gh node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "O comando '$command' não está instalado."
done

cd "$ROOT"

printf '\n== Glucometer: teste e force push ==\n'
printf 'Pasta: %s\nRepositório de destino: %s\nBranch: %s\n\n' "$ROOT" "$REPO_URL" "$BRANCH"

# Requer autenticação existente; oferece login pelo navegador quando necessário.
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  printf 'Você ainda não está autenticado no GitHub CLI. Iniciando login pelo navegador...\n'
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git

# Identidade do commit obtida da conta autenticada; usa endereço noreply do GitHub.
GIT_NAME="$(gh api user --jq '.name // .login')"
GIT_EMAIL="$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')"
git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"

# Se o projeto foi extraído fora de um clone, inicia o repositório local.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'Esta pasta ainda não possui metadados Git; inicializando repositório...\n'
  git init
fi

git branch -M "$BRANCH"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

printf '\n== Executando testes ==\n'
npm test

printf '\n== Gerando build de produção ==\n'
npm run build

printf '\n== Preparando commit ==\n'
git add -A
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if ! git diff --cached --quiet; then
    git commit -m "$COMMIT_MESSAGE"
  else
    printf 'Nenhuma alteração nova para commit; será enviado o commit atual.\n'
  fi
else
  git diff --cached --quiet && fail "Não há arquivos para o primeiro commit."
  git commit -m "$COMMIT_MESSAGE"
fi

printf '\nArquivos/estado local prontos. Commit que será enviado:\n'
git --no-pager log -1 --oneline
printf '\nATENÇÃO: --force pode substituir o histórico da branch main no GitHub.\n'
printf 'Destino: %s (branch %s)\n' "$REPO_URL" "$BRANCH"
read -r -p "Para confirmar e sobrescrever a branch remota, digite FORCE: " confirmation
[[ "$confirmation" == "FORCE" ]] || fail "Envio cancelado; nada foi enviado ao GitHub."

printf '\n== Enviando com force push ==\n'
git push --set-upstream origin "$BRANCH" --force
printf '\nSucesso: push forçado concluído. O deploy da Vercel depende da configuração do projeto.\n'
