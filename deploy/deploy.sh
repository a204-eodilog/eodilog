#!/bin/bash
# c6g에서 도는 배포 스크립트. dev에 병합되면 Jenkins가 SSH로 부른다(deploy/Jenkinsfile). 손으로도 돌릴 수 있다
#   bash deploy.sh            dev 최신을 받아 바뀐 서비스만 빌드하고 교체한다
#   bash deploy.sh rollback   백엔드를 직전 이미지로 되돌린다
# 순서: dev로 맞춤 → 바뀐 것 확인 → 이미지 빌드 → (새 마이그레이션이 있으면) DB 백업 → 교체 → 기록·정리
# 백엔드는 새 컨테이너를 먼저 띄우고 준비된 뒤 옛 것을 내린다. 새 것이 못 뜨면 옛 것이 계속 서비스하고 배포는 실패로 끝난다
set -euo pipefail

HOME_DIR=${EODILOG_HOME:-/srv/eodilog}
APP=$HOME_DIR/app
STATE=$HOME_DIR/state
BRANCH=${DEPLOY_BRANCH:-dev}
MIGRATIONS=EodiLog/src/main/resources/db/migration
export EODILOG_HOME=$HOME_DIR

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
compose() { docker compose -f "$APP/deploy/compose.prod.yaml" "$@"; }
saved() { cat "$STATE/$1" 2>/dev/null || true; }
record() { printf '%s\n' "$2" > "$STATE/$1"; }
running() { compose ps -q "$1"; }

# 컨테이너가 healthy가 될 때까지 기다린다. 죽었거나 다시 시작했으면 바로 실패로 본다
wait_healthy() {
  local id=$1 limit=${2:-240} start=$SECONDS status
  while :; do
    status=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}/{{.RestartCount}}' "$id" 2>/dev/null || echo gone)
    case $status in
      running/healthy/0) log "준비됨($((SECONDS - start))초)"; return 0 ;;
      running/starting/0 | created/*/0) ;;
      *) log "컨테이너가 뜨지 못했다(상태 $status)"; return 1 ;;
    esac
    if [ $((SECONDS - start)) -ge "$limit" ]; then log "${limit}초 안에 준비되지 않았다"; return 1; fi
    sleep 1
  done
}

# 새 백엔드를 먼저 띄우고, 준비되면 옛 것을 내린다. nginx는 살아 있는 쪽으로 보낸다(nginx/backend.conf)
rollout_backend() {
  local old new id count
  old=$(running backend)
  if [ -z "$old" ]; then
    log "백엔드 처음 띄움"
    compose up -d --no-deps backend
    wait_healthy "$(running backend)"
    return
  fi
  count=$(printf '%s\n' "$old" | wc -l)
  log "새 백엔드 띄움(옛 것 ${count}개는 계속 서비스)"
  compose up -d --no-deps --no-recreate --scale backend=$((count + 1)) backend
  new=$(running backend | grep -vxF -f <(printf '%s\n' "$old") || true)
  if [ -z "$new" ] || ! wait_healthy "$new"; then
    if [ -n "$new" ]; then
      docker logs --tail 80 "$new" 2>&1 || true
      docker rm -f "$new" > /dev/null
    fi
    log "새 백엔드를 지웠다. 옛 백엔드가 계속 서비스한다"
    return 1
  fi
  for id in $old; do
    docker stop -t 60 "$id" > /dev/null   # 처리 중인 요청은 60초까지 끝내게 둔다
    docker rm "$id" > /dev/null
  done
  log "옛 백엔드 내림"
}

# 이미지 이름표. latest=방금 빌드한 것, live=지금 서비스하는 것, previous=그 전에 서비스하던 것(되돌리기용)
# live를 붙여 두지 않으면 다음 빌드가 latest를 옮길 때 서비스 중인 이미지가 이름을 잃어 되돌릴 수 없게 된다
mark_live() {
  if docker image inspect "eodilog-$1:live" > /dev/null 2>&1; then
    docker tag "eodilog-$1:live" "eodilog-$1:previous"
  fi
  docker tag "eodilog-$1:latest" "eodilog-$1:live"
}

# AI는 내리고 새로 띄운다. 모델을 올리는 30~40초 동안 AI 기능만 실패하고, 비동기 작업은 백엔드가 다시 시도한다
replace_ai() {
  log "AI 교체"
  compose up -d --no-deps ai
  if wait_healthy "$(running ai)"; then return 0; fi
  docker logs --tail 60 "$(running ai)" 2>&1 || true
  if docker image inspect eodilog-ai:live > /dev/null 2>&1; then
    log "서비스하던 AI 이미지로 되돌린다"
    docker tag eodilog-ai:live eodilog-ai:latest
    compose up -d --no-deps ai
  fi
  return 1
}

backup_db() {
  local file
  mkdir -p "$HOME_DIR/backups"
  file=$HOME_DIR/backups/eodilog-$(date +%Y%m%d-%H%M%S)-$1.dump
  log "새 마이그레이션이 있어 DB를 백업한다: $file"
  (umask 077; compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.part")
  mv "$file.part" "$file"
  ls -1t "$HOME_DIR"/backups/*.dump | tail -n +6 | xargs -r rm -f   # 최근 5개만 둔다
}

deploy() {
  local head prev backend_tree ai_tree conf_hash free do_backend=false do_ai=false do_conf=false leftover=false targets=()
  head=$(git -C "$APP" rev-parse HEAD)
  prev=$(saved commit)
  backend_tree=$(git -C "$APP" rev-parse HEAD:EodiLog)
  ai_tree=$(git -C "$APP" rev-parse HEAD:ai)
  # 배포 설정은 compose 파일과 nginx 폴더만 본다. README나 Jenkinsfile만 바뀐 병합은 넘어간다
  conf_hash=$(git -C "$APP" rev-parse HEAD:deploy/compose.prod.yaml HEAD:deploy/nginx | tr '\n' '-')
  if [ "$backend_tree" != "$(saved backend.tree)" ] || [ -z "$(running backend)" ]; then do_backend=true; fi
  if [ "$ai_tree" != "$(saved ai.tree)" ] || [ -z "$(running ai)" ]; then do_ai=true; fi
  if [ "$conf_hash" != "$(saved conf.hash)" ]; then do_conf=true; fi
  # 지난 배포가 교체 도중 죽어 백엔드가 여러 개 남았으면 새 것 하나로 정리한다
  if [ "$(running backend | wc -l)" -gt 1 ]; then leftover=true; fi
  log "커밋 ${head:0:8}  백엔드 변경=$do_backend  AI 변경=$do_ai  배포 설정 변경=$do_conf  남은 백엔드 정리=$leftover"
  if ! $do_backend && ! $do_ai && ! $do_conf && ! $leftover; then log "바뀐 것이 없어 끝낸다"; return 0; fi

  free=$(df --output=avail -BG / | tail -1 | tr -dc '0-9')
  if [ "$free" -lt 10 ]; then log "디스크 여유가 ${free}GB뿐이다(10GB 필요). docker system df로 확인한다"; return 1; fi

  if $do_backend; then targets+=(backend); fi
  if $do_ai; then targets+=(ai); fi
  if [ ${#targets[@]} -gt 0 ]; then
    log "이미지 빌드: ${targets[*]}"
    compose build "${targets[@]}"
  fi

  compose up -d --no-recreate --wait db
  if $do_backend && [ -n "$prev" ] && git -C "$APP" cat-file -e "$prev" 2> /dev/null \
      && ! git -C "$APP" diff --quiet "$prev" HEAD -- "$MIGRATIONS"; then
    backup_db "${head:0:8}"
  fi

  if $do_ai; then replace_ai; mark_live ai; record ai.tree "$ai_tree"; fi
  # 배포 설정만 바뀌어도 백엔드를 새 설정으로 다시 띄운다(빌드는 하지 않는다)
  if $do_backend || $do_conf || $leftover; then
    # 직전 빌드가 뜨지 못한 채 남았으면 latest가 그 이미지다. 다시 빌드하지 않는 경우에는 서비스 중인 이미지로 띄운다
    if ! $do_backend && docker image inspect eodilog-backend:live > /dev/null 2>&1; then
      docker tag eodilog-backend:live eodilog-backend:latest
    fi
    rollout_backend
    if $do_backend; then mark_live backend; fi
    record backend.tree "$backend_tree"
  fi
  compose up -d --no-deps --no-recreate proxy
  if $do_conf; then
    compose exec -T proxy nginx -t
    compose exec -T proxy nginx -s reload
    record conf.hash "$conf_hash"
    log "nginx 설정 다시 읽음"
  fi
  record commit "$head"

  docker image prune -f > /dev/null
  docker builder prune -f --max-used-space 10GB > /dev/null
  ls -1t "$HOME_DIR"/logs/deploy-*.log 2> /dev/null | tail -n +31 | xargs -r rm -f
  log "배포 끝: ${head:0:8} (${SECONDS}초)"
}

rollback() {
  if ! docker image inspect eodilog-backend:previous > /dev/null 2>&1; then log "되돌릴 직전 이미지가 없다"; return 1; fi
  log "백엔드를 직전 이미지로 되돌린다"
  docker tag eodilog-backend:previous eodilog-backend:latest
  rollout_backend
  mark_live backend   # 되돌린 것이 live, 문제 있던 것이 previous가 된다. 한 번 더 rollback하면 다시 돌아간다
  log "되돌림 끝. DB 스키마는 그대로다. EodiLog/가 다시 바뀐 병합이 오면 그때 새로 배포된다"
}

main() {
  local action=${SSH_ORIGINAL_COMMAND:-${1:-deploy}} logfile pid
  case $action in
    deploy | rollback) ;;
    *) echo "쓸 수 있는 명령: deploy, rollback" >&2; exit 2 ;;
  esac
  mkdir -p "$STATE" "$HOME_DIR/logs"

  # SSH가 끊겨도 교체가 중간에 멈추지 않게 따로 띄우고, 이 셸은 로그를 따라 보여 주기만 한다
  if [ -z "${DEPLOY_DETACHED:-}" ]; then
    logfile=$HOME_DIR/logs/deploy-$(date +%Y%m%d-%H%M%S).log
    DEPLOY_DETACHED=1 setsid --wait nohup bash "$APP/deploy/deploy.sh" "$action" > "$logfile" 2>&1 < /dev/null &
    pid=$!
    tail -n +1 --pid="$pid" -f "$logfile" || true
    wait "$pid"
    exit $?
  fi

  # 한 번에 하나만 돈다
  if [ -z "${DEPLOY_LOCKED:-}" ]; then
    exec 9> "$HOME_DIR/deploy.lock"
    if ! flock -w 1800 9; then log "다른 배포가 30분 넘게 끝나지 않았다"; exit 1; fi
    export DEPLOY_LOCKED=1
  fi

  # 저장소를 dev 최신으로 맞춘다. 이 파일도 바뀔 수 있으므로 맞춘 뒤 새 파일로 다시 시작한다
  if [ "$action" = deploy ] && [ -z "${DEPLOY_SYNCED:-}" ]; then
    git -C "$APP" fetch --quiet --prune origin "$BRANCH"
    git -C "$APP" reset --quiet --hard "origin/$BRANCH"
    DEPLOY_SYNCED=1 exec bash "$APP/deploy/deploy.sh" "$action"
  fi

  "$action"
}

# 파일 전체를 읽은 뒤 실행되도록 맨 끝에서 부른다(실행 중에 git이 이 파일을 바꿔도 안전하다)
main "$@"
