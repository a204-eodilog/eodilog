# H200 사진 모델 실험 스크립트

공용 H200에서 돌린 사진 주제 분류 실험이다. 서비스 코드가 아니며 서버에서 import하지 않는다.
결과와 해석은 `docs/reports/photo-classification-eval.md` §15에 있다.

| 파일 | 내용 |
| --- | --- |
| `big.py` | 사진 캐시(400px uint8을 GPU에 올리고 증강도 GPU에서), 큰 선생 모델 파인튜닝, 지식 증류(KD), int8 양자화 인식 학습(QAT) |
| `big2.py` | 작업 실행기: teacher / kd / qat / 라벨 점검(audit) |
| `big3.py` | 선생 의사 라벨(pseudo), 묶기 벤치마크(gbench), 반지도 학습(semi), 대조 학습(contrast), CNN 학생(cnn) |
| `textsearch.py` | 한국어 문장으로 사진 찾기: GMS 캡션으로 SigLIP 시그모이드 손실 미세조정과 평가 |
| `qat_eval.py` | QAT 결과(.pt) → ONNX → ONNX Runtime 정적 int8(QDQ). QAT 범위를 그대로 쓰고 MatMul 출력은 양자화하지 않는다 |

데이터는 `~/photo-train`(학습 8,571장, 평가 1,931장, AI Hub 71780 CSV)에 둔다. 공용 장비라 데이터 로더 작업자는 2개 이하로 쓴다.
