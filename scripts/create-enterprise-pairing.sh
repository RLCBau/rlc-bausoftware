#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RLC_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${RLC_ROOT}/.env.enterprise"
OUTPUT="${1:-${RLC_ROOT}/rlc-server-pairing.svg}"
EXPIRES="${2:-600}"

if [[ ! -f "${ENV_FILE}" ]]; then
  printf '.env.enterprise is missing. Run install-enterprise-ai.sh first.\n' >&2
  exit 1
fi

COMPOSE=(
  docker compose
  --env-file "${ENV_FILE}"
  -f "${RLC_ROOT}/docker-compose.yml"
  -f "${RLC_ROOT}/docker-compose.enterprise.yml"
)

CONTAINER_OUTPUT="/tmp/rlc-server-pairing.svg"
"${COMPOSE[@]}" exec -T server npm run enterprise:pairing -- \
  --output "${CONTAINER_OUTPUT}" \
  --expires "${EXPIRES}"

SERVER_CONTAINER_ID="$("${COMPOSE[@]}" ps -q server)"
if [[ -z "${SERVER_CONTAINER_ID}" ]]; then
  printf 'RLC server container is not running.\n' >&2
  exit 1
fi

docker cp "${SERVER_CONTAINER_ID}:${CONTAINER_OUTPUT}" "${OUTPUT}"
printf 'Pairing QR written to: %s\n' "${OUTPUT}"
