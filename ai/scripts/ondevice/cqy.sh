#!/bin/bash
# 빌린 GPU용 대기열 실행기: bash ondev/cqy.sh <queue> <gpu>
# 작업마다 시작 전과 도는 동안(1분마다) 다른 팀이 그 GPU를 쓰는지 보고, 쓰면 우리 작업을 내리고 멈춘다.
q=$1; gpu=$2; ME=$(whoami)
cd ~/photo-train
export CUDA_VISIBLE_DEVICES=$gpu OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 HF_HUB_OFFLINE=1
others() {
  u=$(nvidia-smi -i $gpu --query-gpu=uuid --format=csv,noheader)
  for p in $(nvidia-smi --query-compute-apps=gpu_uuid,pid --format=csv,noheader | grep "$u" | cut -d" " -f2); do
    o=$(stat -c %U /proc/$p 2>/dev/null); [ -n "$o" ] && [ "$o" != "$ME" ] && echo "$o"
  done | sort -u | tr "\n" " "
}
while read -r line; do
  [ -z "$line" ] && continue
  o=$(others); if [ -n "$o" ]; then echo "YIELD $(date +%T) GPU$gpu used by $o, not starting: $line"; break; fi
  echo "== $(date +%T) GPU$gpu $line"
  nice -n 10 .venv/bin/python -u ondev/$line &
  pid=$!
  while kill -0 $pid 2>/dev/null; do
    sleep 60
    o=$(others); if [ -n "$o" ]; then echo "YIELD $(date +%T) GPU$gpu used by $o, stopping $line"; kill $pid; wait $pid; echo "QUEUE $q STOPPED"; exit 0; fi
  done
  wait $pid
done < ondev/$q.txt
echo "QUEUE $q DONE $(date +%T)"
