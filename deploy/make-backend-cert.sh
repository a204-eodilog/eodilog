#!/bin/sh
# 프론트 서버 nginx → c6g nginx 구간에 쓰는 자체 서명 인증서를 만든다(c6g에서 한 번 실행)
# 만든 backend.crt만 프론트 서버에 복사한다. backend.key는 c6g 밖으로 꺼내지 않는다
set -eu

dir="${EODILOG_HOME:-/srv/eodilog}/certs"
mkdir -p "$dir"

if [ -f "$dir/backend.crt" ]; then
  echo "이미 있다: $dir/backend.crt (다시 만들려면 지우고 실행한다. 그러면 프론트 서버에도 다시 복사해야 한다)" >&2
  exit 1
fi

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -subj "/CN=eodilog-backend" \
  -addext "subjectAltName=DNS:eodilog-backend" \
  -keyout "$dir/backend.key" -out "$dir/backend.crt"

chmod 600 "$dir/backend.key"
chmod 644 "$dir/backend.crt"
echo "만들었다: $dir/backend.crt"
