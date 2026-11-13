# 운영 이미지. EC2 c6g(ARM64)에서 그대로 빌드한다. 베이스 이미지는 amd64·arm64를 모두 지원한다
# jar는 CPU와 상관없으므로 빌드 단계는 빌드하는 기계의 CPU로 돈다(x86에서 arm64 이미지를 만들 때 빠르다)
FROM --platform=$BUILDPLATFORM eclipse-temurin:25-jdk AS build

WORKDIR /src
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
# 의존성만 먼저 받아 소스가 바뀌어도 이 층을 다시 쓴다
RUN ./gradlew --no-daemon -q dependencies > /dev/null

COPY src src
# 테스트는 MR 전에 로컬에서 돌린다. 배포 때 다시 돌리면 같은 일을 두 번 하는 것이라 뺀다
RUN ./gradlew --no-daemon bootJar -x test \
 && find build/libs -name '*.jar' ! -name '*-plain.jar' -exec cp {} /app.jar \;


FROM eclipse-temurin:25-jre-alpine

# HEIC 사진 변환(ImageSanitizer)은 ImageMagick 7의 magick 명령과 libheif가 필요하다
# 음성 경비 녹음 검사(FfprobeAudioProbe)는 ffprobe가 필요하다. ffmpeg 패키지에 들어 있다
RUN apk add --no-cache imagemagick imagemagick-heic imagemagick-jpeg ffmpeg \
 && ffprobe -version > /dev/null \
 && adduser -D -u 1000 app
# 서비스가 쓰는 형식(HEIC 읽기, JPEG 쓰기, 크기 조회)만 허용한다
COPY docker/imagemagick-policy.xml /etc/ImageMagick-7/policy.xml

# 서비스와 같은 두 명령으로 실제 HEIC를 변환해 본다. 디코더가 없으면 여기서 빌드를 멈춘다
COPY src/test/resources/images/example.heic /tmp/check.heic
RUN magick -ping heic:/tmp/check.heic[0] -format '%w %h' info: \
 && magick heic:/tmp/check.heic[0] -auto-orient -strip jpeg:/tmp/check.jpg \
 && test -s /tmp/check.jpg \
 && rm /tmp/check.heic /tmp/check.jpg

WORKDIR /app
COPY --from=build /app.jar app.jar
USER app
EXPOSE 8080

# 힙은 컨테이너 메모리 상한(compose mem_limit)의 75%
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
