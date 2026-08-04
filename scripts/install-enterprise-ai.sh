#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RLC_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${RLC_ROOT}/.env.enterprise"
ENV_TEMPLATE="${RLC_ROOT}/.env.enterprise.example"

API_URL=""
SERVER_NAME=""
COMPANY_CODE=""

usage() {
  printf '%s\n' \
    "Usage:" \
    "  sudo bash scripts/install-enterprise-ai.sh --api-url https://rlc.example.com [options]" \
    "" \
    "Options:" \
    "  --server-name NAME       Display name in the Mobile pairing screen" \
    "  --company-code CODE      Optional customer/company code" \
    "  --local                  Disable OpenAI and use only Ollama" \
    "  --openai-only            Disable the local fallback" \
    "  --help                   Show this help"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)
      API_URL="${2:-}"
      shift 2
      ;;
    --server-name)
      SERVER_NAME="${2:-}"
      shift 2
      ;;
    --company-code)
      COMPANY_CODE="${2:-}"
      shift 2
      ;;
    --local)
      RLC_REQUESTED_MODE="LOCAL"
      shift
      ;;
    --openai-only)
      RLC_REQUESTED_MODE="OPENAI"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for command_name in docker openssl awk mktemp; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    printf 'Required command is missing: %s\n' "${command_name}" >&2
    exit 1
  fi
done

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose v2 is required.\n' >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"
fi
chmod 600 "${ENV_FILE}"

if git -C "${RLC_ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
  GIT_EXCLUDE="$(git -C "${RLC_ROOT}" rev-parse --git-path info/exclude)"
  if ! grep -qxF '/.env.enterprise' "${GIT_EXCLUDE}" 2>/dev/null; then
    printf '\n/.env.enterprise\n' >> "${GIT_EXCLUDE}"
  fi
fi

read_env() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "${ENV_FILE}"
}

upsert_env() {
  local key="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp "${ENV_FILE}.XXXXXX")"
  awk -v wanted="${key}" -v replacement="${value}" '
    BEGIN { written = 0 }
    $0 ~ "^" wanted "=" {
      if (!written) print wanted "=" replacement
      written = 1
      next
    }
    { print }
    END { if (!written) print wanted "=" replacement }
  ' "${ENV_FILE}" > "${temporary}"
  chmod 600 "${temporary}"
  mv "${temporary}" "${ENV_FILE}"
}

if [[ -n "${API_URL}" ]]; then
  upsert_env RLC_PUBLIC_API_URL "${API_URL%/}"
fi
if [[ -n "${SERVER_NAME}" ]]; then
  upsert_env RLC_SERVER_NAME "${SERVER_NAME}"
fi
if [[ -n "${COMPANY_CODE}" ]]; then
  upsert_env RLC_COMPANY_CODE "${COMPANY_CODE}"
fi
if [[ -n "${RLC_REQUESTED_MODE:-}" ]]; then
  upsert_env RLC_AI_MODE "${RLC_REQUESTED_MODE}"
fi

PUBLIC_URL="$(read_env RLC_PUBLIC_API_URL)"
if [[ ! "${PUBLIC_URL}" =~ ^https://[^[:space:]]+$ ]]; then
  printf 'RLC_PUBLIC_API_URL must be a public HTTPS address. Current value: %s\n' "${PUBLIC_URL:-empty}" >&2
  exit 1
fi

SERVER_ID="$(read_env RLC_SERVER_ID)"
if [[ -z "${SERVER_ID}" ]]; then
  upsert_env RLC_SERVER_ID "rlc-$(openssl rand -hex 16)"
fi

PAIRING_SECRET="$(read_env RLC_PAIRING_SECRET)"
if [[ -z "${PAIRING_SECRET}" ]]; then
  upsert_env RLC_PAIRING_SECRET "$(openssl rand -hex 32)"
fi

COMPOSE=(
  docker compose
  --env-file "${ENV_FILE}"
  -f "${RLC_ROOT}/docker-compose.yml"
  -f "${RLC_ROOT}/docker-compose.enterprise.yml"
)

cd "${RLC_ROOT}"
AI_MODE="$(read_env RLC_AI_MODE)"
if [[ "${AI_MODE}" != "OPENAI" ]]; then
  "${COMPOSE[@]}" pull ollama
  "${COMPOSE[@]}" up -d ollama
  "${COMPOSE[@]}" --profile setup run --rm ollama-init
fi
"${COMPOSE[@]}" up -d --build server

printf '%s\n' \
  "RLC Enterprise AI is installed." \
  "AI mode: ${AI_MODE}" \
  "Public API: $(read_env RLC_PUBLIC_API_URL)"

if [[ "${AI_MODE}" != "OPENAI" ]]; then
  printf '%s\n' "Ollama is available only inside the Docker network."
fi

"${COMPOSE[@]}" exec -T server npm run ai:smoke
