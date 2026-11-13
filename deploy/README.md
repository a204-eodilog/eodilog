# 백엔드·AI 운영 배포 (EC2 c6g)

Jira: EODI-336

## 구성

```
Android 앱 ──HTTPS──> eodilog.example.com (프론트 서버 nginx)
                         │  /oauth/kakao, 소개 페이지 → 그대로 정적 파일
                         │  /api/, /ws → c6g로 넘긴다 (자체 서명 인증서로 암호화, 443)
                         ▼
                      EC2 c6g.2xlarge (ARM64)  ── compose.prod.yaml
                         proxy(nginx:443) → backend(8080) → ai(8000)
                                                └──────────→ db(5432)
                         backend → S3 운영 버킷(IAM 역할)
```

- 도메인을 따로 사지 않는다. 앱의 API 주소는 `https://eodilog.example.com`다. 출처가 프론트와 같아 CORS 문제가 없다.
- c6g에서 밖으로 열리는 포트는 443 하나다. 보안 그룹에서 **프론트 서버 IP만** 허용한다. backend, ai, db 포트는 compose 내부 네트워크에서만 쓴다.
- 이미지는 c6g에서 직접 빌드한다. 노트북(x86)에서 만든 이미지는 ARM에서 돌지 않는다.

| 파일 | 내용 |
| --- | --- |
| `compose.prod.yaml` | db(`imresamu/postgis:17-3.5`. `postgis/postgis`는 amd64 전용), ai, backend, proxy |
| `../EodiLog/Dockerfile` | 백엔드 이미지. ImageMagick 7과 HEIC를 포함하고, 빌드 중에 실제 HEIC 변환을 확인한다 |
| `../ai/Dockerfile` | AI 이미지(AI 담당 작성. 사진 모델이 이미지에 들어간다) |
| `nginx/backend.conf` | c6g nginx |
| `nginx/front-proxy.conf.example` | 프론트 서버 nginx에 넣을 설정 |
| `make-backend-cert.sh` | 두 서버 사이 구간용 자체 서명 인증서 |
| `deploy.sh` | c6g에서 도는 배포 스크립트. 바뀐 서비스만 빌드하고 백엔드는 끊김 없이 교체한다 |
| `Jenkinsfile` | dev에 병합되면 c6g의 `deploy.sh`를 실행하는 Jenkins 작업 |
| `env/*.env.example` | 비밀 설정 예시. 실제 파일은 서버의 `/srv/eodilog/env/`에 둔다 |

## 1. AWS 준비

1. **vCPU 한도**: Service Quotas → EC2 → "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances"가 8 이상인지 확인한다. 모자라면 증가를 요청한다.
2. **S3**: 지금 쓰는 버킷과 IAM 사용자 키(로컬 `.env`의 `STORAGE_*`, `AWS_*`)를 `backend.env`에 그대로 넣으면 된다. 이 경우 3번과 5번은 건너뛴다. 앱은 브라우저가 아니라 S3 CORS가 필요 없다.
3. (선택) 키 대신 **IAM 역할**을 쓸 때만: 아래 정책으로 EC2용 역할을 만들어 인스턴스에 붙이고 `backend.env`의 키는 비운다. `<버킷>`을 바꿔 넣는다.
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": ["arn:aws:s3:::<버킷>/uploads/*", "arn:aws:s3:::<버킷>/display/*"] },
       { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::<버킷>" }
     ]
   }
   ```
4. **EC2 인스턴스**
   - c6g.2xlarge, Ubuntu 24.04 LTS **arm64**, gp3 60GB.
   - 탄력적 IP를 붙인다.
5. (IAM 역할을 쓸 때만) **메타데이터 홉 제한 2**
   - 인스턴스 → 작업 → 인스턴스 설정 → 인스턴스 메타데이터 옵션 수정 → IMDSv2 필수, 홉 제한 **2**.
   - 1이면 컨테이너가 IAM 역할 키를 못 받아 S3 호출이 전부 503이 된다. 키를 `backend.env`에 넣으면 상관없다.
6. **보안 그룹 인바운드**
   - 22: 프론트 서버 IP만(아래 "SSH 접속" 참고). 사무실 밖에서 직접 붙을 때만 내 IP를 더 넣는다.
   - 443: 프론트 서버 IP만. 프론트 서버에서 `curl -s https://checkip.amazonaws.com`으로 나오는 IP를 쓴다.

### SSH 접속 (프론트 서버 경유)

사무실 망은 밖으로 나가는 22번을 막고 제공 서버만 열어 둔다. 보안 그룹에 내 IP를 넣어도 c6g에는 `Connection timed out`이 난다. 그래서 프론트 서버(front)를 거쳐 들어간다.

PC의 `~/.ssh/config`:

```
Host jump
  HostName eodilog.example.com
  User ubuntu
  IdentityFile <front-server.pem 경로>
  IdentitiesOnly yes
  ServerAliveInterval 30

Host c6g
  HostName <C6G_IP>
  User ubuntu
  IdentityFile <eodilog-prod-key.pem 경로>
  IdentitiesOnly yes
  ProxyJump jump
  ServerAliveInterval 30
```

- `ssh c6g`, `scp 파일 c6g:경로`로 쓴다.
- 키 두 개는 PC에만 둔다. c6g 키를 프론트 서버에 복사하지 않고 `ssh -A`도 쓰지 않는다.
- Windows 기본 ssh는 권한이 열린 키를 거부한다. `icacls <키 파일> /inheritance:r /grant:r "$($env:USERNAME):R"`로 좁힌다.
- 프론트 서버가 초기화되거나 사라지면 AWS 콘솔에서 22번 소스를 그때 쓰는 IP로 바꿔 직접 붙는다.

## 2. c6g 서버 준비 (한 번)

```bash
sudo apt update && sudo apt install -y ca-certificates curl git openssl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && exit        # 다시 접속

# 스왑 4GB
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 비밀 설정 폴더와 저장소
sudo mkdir -p /srv/eodilog && sudo chown $USER /srv/eodilog
mkdir -m 700 /srv/eodilog/env
# 비공개 저장소라 GitLab 읽기 전용 토큰(read_repository)을 묻는다. 한 번 넣으면 저장해 두고 배포 때마다 쓴다
git config --global credential.helper store
git clone -b dev https://github.com/a204-eodilog/eodilog.git /srv/eodilog/app
chmod 600 ~/.git-credentials

# 두 서버 사이 구간 인증서
sh /srv/eodilog/app/deploy/make-backend-cert.sh
```

`/srv/eodilog/env/`에 `db.env`, `backend.env`, `ai.env`를 만든다. `deploy/env/*.env.example`을 복사해 채우고 `chmod 600`.

- `ai.env`에는 키 5개만 넣는다. `ai/.env.example`을 통째로 쓰면 `PHOTO_MODEL_PRELOAD=false`가 들어가 모델을 미리 올리지 않는다.
- `INTERNAL_API_TOKEN`(ai.env)과 `AI_INTERNAL_TOKEN`(backend.env)은 같은 값이다.
- `POSTGRES_PASSWORD`(db.env)와 `SPRING_DATASOURCE_PASSWORD`(backend.env)도 같은 값이다.

## 3. 빌드와 실행

```bash
bash /srv/eodilog/app/deploy/deploy.sh        # 처음은 두 이미지를 새로 만들어 5분쯤 걸린다(c6g 실측: 백엔드 91초, AI 211초)
```

첫 배포도 그 뒤의 배포도 이 명령 하나다. 무엇을 하는지는 아래 "자동 배포"에 있다.

- 백엔드가 처음 뜰 때 Flyway가 마이그레이션을 모두 적용한다(지역 시드 포함). 스크립트가 `준비됨`을 찍으면 된다.
- AI는 모델을 올리느라 30초쯤 걸린다. `docker compose -f compose.prod.yaml logs ai | grep finetuned=True`로 확인한다.
- 충전소는 키가 있으면 백엔드가 시작할 때 스스로 받는다(3~5분).

## 4. 장소·화장실 데이터 넣기 (처음 한 번)

운영 DB는 장소가 비어 있다. 로컬 DB에서 데이터만 덤프해 옮긴다. 지역 ID는 시드에 고정돼 있어 그대로 맞는다.

```bash
# 로컬 PC (로컬 DB 컨테이너 이름은 docker ps로 확인)
docker exec <로컬DB> pg_dump -U eodilog -d eodilog -Fc --data-only -t places -t public_toilets -f /tmp/eodilog-data.dump
docker cp <로컬DB>:/tmp/eodilog-data.dump .
scp eodilog-data.dump c6g:/srv/eodilog/

# c6g (3단계에서 백엔드가 한 번 떠서 마이그레이션이 끝난 상태)
cd /srv/eodilog/app/deploy
docker compose -f compose.prod.yaml stop backend
docker compose -f compose.prod.yaml cp /srv/eodilog/eodilog-data.dump db:/tmp/data.dump
docker compose -f compose.prod.yaml exec db pg_restore -U eodilog -d eodilog --data-only /tmp/data.dump
docker compose -f compose.prod.yaml exec db psql -U eodilog -d eodilog -c "ANALYZE places; ANALYZE public_toilets;"
docker compose -f compose.prod.yaml start backend
```

- **`ANALYZE`를 빼먹으면 장소 검색이 수 초씩 걸린다.**
- 로컬 DB에 화장실이 없으면 `-t public_toilets`를 빼고 덤프한다. 화장실은 `EodiLog/docs/plan/public-place-import.md`대로 따로 넣는다. 서버에서는 CSV를 컨테이너에 마운트하고 `docker compose run --rm -v <CSV>:/data/toilets.csv:ro -e APP_PLACE_IMPORT_ENABLED=true -e APP_PLACE_IMPORT_TOILET_PATH=/data/toilets.csv backend --server.port=0 --app.jobs.enabled=false --app.facilities.ev.sync-enabled=false`로 실행하고, 끝나면 `ANALYZE public_toilets`를 실행한다.

## 5. 프론트 서버 nginx

1. c6g의 `/srv/eodilog/certs/backend.crt`를 프론트 서버 `/etc/nginx/eodilog-backend.crt`로 복사한다(개인 키 `backend.key`는 복사하지 않는다).
2. `nginx/front-proxy.conf.example`의 1부(`upstream`)는 `/etc/nginx/conf.d/eodilog-upstream.conf`로 만들고, 2부의 두 `location`은 프론트 서버의 `eodilog.example.com` 443 `server` 블록 안에 넣는다. `<C6G_IP>`는 탄력적 IP로 바꾼다. c6g가 시드니라 연결 재사용(keepalive)을 빼면 요청마다 0.5초 가까이 느려진다.
3. `sudo nginx -t && sudo systemctl reload nginx`

## 6. 앱 설정

`frontend/eas.json`의 `production`(그리고 테스트용이면 `preview`) `env`에 `"EXPO_PUBLIC_API_BASE_URL": "https://eodilog.example.com"`를 넣고 앱을 다시 빌드한다. 빌드할 때 박히는 값이라 다시 빌드해야 반영된다. 웹소켓 주소(`wss://eodilog.example.com/ws`)는 이 값에서 자동으로 만들어진다.

## 7. 확인

| # | 확인 | 방법 |
| --- | --- | --- |
| 1 | 컨테이너 상태 | `docker compose -f compose.prod.yaml ps`에서 모두 running, ai는 healthy |
| 2 | 백엔드 → AI | `docker compose -f compose.prod.yaml exec backend wget -qO- http://ai:8000/ai/v1/health` |
| 3 | 프론트 서버 → c6g | 아무 PC에서 `curl -i -X POST https://eodilog.example.com/api/v1/auth/sessions/refresh -H 'Content-Type: application/json' -d '{}'` → 4xx JSON 오류면 연결된 것(502·504면 nginx나 보안 그룹 문제) |
| 4 | 카카오 로그인 | 새 앱으로 로그인 |
| 5 | S3 | 프로필 사진 올리기 → 표시까지 |
| 6 | 채팅 실시간 | 두 기기에서 같은 여행 채팅 |
| 7 | AI 키 | 장소 검색, 일정 추천 1번씩 |
| 8 | 사진 분류 | 사진 50장 → 완료 시간 45초 이내(AI 로그 `request_metrics`) |
| 9 | 장소 검색 속도 | "카페" 검색이 1초 안에 오는지 |

## 자동 배포

dev에 병합되면 Jenkins(프론트 서버)가 c6g에 SSH로 들어가 `deploy.sh`를 실행한다. Jenkins는 신호만 보내고, 받기·빌드·교체는 c6g가 한다.

```
dev 병합 → GitLab 웹훅 → Jenkins 작업 eodilog-backend → SSH → c6g: deploy.sh
  1. 저장소를 dev 최신으로 맞춘다
  2. EodiLog/, ai/, 배포 설정(compose.prod.yaml·nginx/) 중 바뀐 것을 본다. 없으면 여기서 끝난다(2초)
  3. 바뀐 서비스의 이미지만 빌드한다
  4. 새 마이그레이션이 있으면 DB를 백업한다(/srv/eodilog/backups, 최근 5개)
  5. 백엔드: 새 컨테이너를 먼저 띄우고 준비되면 옛 것을 내린다. AI: 내리고 새로 띄운다
  6. 배포한 커밋을 기록하고 안 쓰는 이미지를 지운다
```

| 바뀐 것 | 병합부터 배포 끝까지(c6g 실측) |
| --- | --- |
| 프론트·문서만 | 2초 |
| 백엔드 | 52초(빌드 38초 + 교체 14초). 요청 실패 없음 |
| 배포 설정만 | 15초. 요청 실패 없음 |
| AI | 빌드 뒤 교체 27초. 그동안 AI 기능만 실패한다 |

- **테스트는 여기서 돌리지 않는다.** MR 전에 로컬에서 `gradlew build`를 통과시키는 규칙에 기댄다. 컴파일 오류는 이미지 빌드에서, 뜨지 못하는 버전(마이그레이션 오류, 스키마 불일치, 설정 누락)은 5단계의 준비 확인에서 걸린다.
- **새 백엔드가 뜨지 못하면** 새 컨테이너만 지우고 실패로 끝난다. 옛 백엔드가 계속 서비스하고 Jenkins에 실패로 표시된다. 고친 병합이 오면 다시 배포된다.
- **AI를 교체하는 30초 남짓은 AI 기능만 실패한다.** 비동기 AI 작업은 백엔드가 30초 간격으로 3번까지 다시 시도한다.
- **마이그레이션은 옛 코드가 계속 돌 수 있게 쓴다.** 교체 중에는 옛 백엔드가 새 스키마로 서비스한다. 테이블·컬럼 추가는 바로 하고, 삭제와 이름 변경은 새 코드가 배포된 다음 병합으로 미룬다.
- **DB(`db`)와 AI의 compose 정의를 바꾼 것은 자동으로 반영하지 않는다.** DB를 다시 만들면 서비스가 끊기므로 손으로 한다.
- 채팅 실시간 연결은 백엔드를 교체할 때 끊기고 앱이 다시 연결한다.

### 손으로 돌리기

```bash
bash /srv/eodilog/app/deploy/deploy.sh             # 지금 dev를 배포
bash /srv/eodilog/app/deploy/deploy.sh rollback    # 백엔드를 직전 이미지로 되돌림(끊김 없음)
ls -t /srv/eodilog/logs | head                     # 배포 기록
```

- `rollback`은 이미지만 되돌린다. DB 스키마는 그대로다. 한 번 더 실행하면 원래대로 돌아간다.
- DB를 백업으로 되돌리는 것은 그 뒤에 쌓인 데이터를 잃으므로 자동으로 하지 않는다. 필요하면 백엔드를 멈추고 `pg_restore --clean`으로 직접 한다.
- 배포는 SSH가 끊겨도 끝까지 간다. 한 번에 하나만 돈다.

### Jenkins 작업 만들기 (한 번)

1. **배포 전용 키**: PC에서 `ssh-keygen -t ed25519 -f c6g-deploy -N "" -C jenkins-deploy`로 만든다. 공개 키를 c6g의 `~/.ssh/authorized_keys`에 아래 한 줄로 넣는다. 이 키로는 배포 스크립트만 실행된다.
   ```
   command="bash /srv/eodilog/app/deploy/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... jenkins-deploy
   ```
2. **자격 증명**: Jenkins 관리 → Credentials → "SSH Username with private key". ID `c6g-deploy`, Username `ubuntu`, 개인 키 붙여넣기. 넣은 뒤 PC의 개인 키 파일은 지운다.
3. **작업**: New Item → Pipeline → 이름 `eodilog-backend`. Pipeline은 "Pipeline script from SCM", Git, 저장소 주소, 자격 증명 `gitlab-repo`, 브랜치 `*/dev`, Script Path `deploy/Jenkinsfile`.
4. **트리거**: 같은 화면에서 `eodilog-web`과 똑같이 건다. "Build when a change is pushed to GitLab", Push Events만, 브랜치 `dev`, Secret token 생성.
5. **웹훅**: GitLab 프로젝트 → Settings → Webhooks. URL은 4번 화면에 나오는 주소(`https://eodilog.example.com/jenkins/project/eodilog-backend`), Secret token, Push events에 `dev`.
6. Jenkins에서 "Build Now"를 한 번 눌러 `바뀐 것이 없어 끝낸다`가 나오는지 본다.

## 문제 해결

| 증상 | 확인 |
| --- | --- |
| 사진 업로드·표시가 `503 STORAGE_UNAVAILABLE` | IAM 역할 연결, 메타데이터 홉 제한 2, `STORAGE_BUCKET`·`STORAGE_REGION` |
| 프론트 주소로 502 | 프론트 서버의 인증서 경로·`<C6G_IP>`, c6g 보안 그룹 443 허용 IP, `docker compose ps` |
| 프론트 주소로 504 | c6g 보안 그룹이 프론트 서버 IP를 막고 있음 |
| AI 작업이 바로 실패 | `AI_INTERNAL_TOKEN`과 `INTERNAL_API_TOKEN`이 같은지, `docker compose logs ai` |
| HEIC 업로드가 503 `IMAGE_PROCESSOR_UNAVAILABLE` | 백엔드 이미지 빌드 중 HEIC 확인 단계 로그 |
| 메모리 부족 | `docker stats`. DB 5GB, AI 4GB, 백엔드 4GB 상한 |
| 배포가 "새 백엔드를 지웠다"로 실패 | 바로 위에 찍힌 새 컨테이너 로그. 마이그레이션 오류, env 누락이 흔하다. 서비스는 옛 백엔드가 하고 있다 |
| 배포가 "디스크 여유가 … 뿐이다"로 실패 | `docker system df`. `docker builder prune -af`로 빌드 캐시를 비운다 |
| 백엔드 컨테이너가 2개 떠 있다 | 배포가 교체 도중 죽은 것이다. `deploy.sh`를 다시 돌리면 새 것 하나만 남긴다 |
