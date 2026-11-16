#!/bin/bash
# 대기열 실행기: GPU 번호와 대기열 이름을 받는다. 작업마다 다른 팀이 이 GPU를 쓰는지 보고, 쓰면 빠진다.
g=$1; q=$2
cd ~/photo-train
export CUDA_VISIBLE_DEVICES=$g OMP_NUM_THREADS=2 MKL_NUM_THREADS=2
others() { nvidia-smi -i $g --query-compute-apps=pid --format=csv,noheader | while read p; do ps -o user= -p $p 2>/dev/null; done | grep -v -c "$(whoami)"; }
while true; do
  o=$(others); if [ "$o" -gt 0 ]; then echo "YIELD GPU$g $(date +%T)"; exit 0; fi
  # 아침 8시 30분 이후에는 새 작업을 꺼내지 않는다 (밤에만 쓰기로 한 GPU)
  h=$(date +%H%M); if [ "$h" -ge 0830 ] && [ "$h" -lt 2000 ]; then echo "DEADLINE GPU$g $(date +%T)"; break; fi
  line=$(flock results/big/$q.lock bash -c "n=\$(cat results/big/$q.next 2>/dev/null || echo 1); l=\$(sed -n \"\${n}p\" ondev/$q.txt); echo \$((n+1)) > results/big/$q.next; echo \"\$l\"")
  [ -z "$line" ] && break
  echo "== GPU$g $(date +%T) $line"
  nice -n 10 .venv/bin/python -u ondev/$line
done
echo "GPU$g DONE $(date +%T)"
