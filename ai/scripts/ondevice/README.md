# 폰 안 사진 AI 스크립트

폰용 사진 모델(주제 분류 + 한국어 문장 검색 + 비슷한 사진 묶기)을 학습하고, 줄이고, 평가하는 스크립트다.
결과와 수치는 `ai/docs/reports/ondevice-photo-ai.md`에 있다.

학습 스크립트는 H200 학습 서버의 `~/photo-train/` 아래에서 돈다. 데이터 불러오기와 공통 함수는 서버에만 있는 `big.py`를 쓴다(사진 데이터와 함께 서버에 둠). 이 폴더만으로는 학습이 돌지 않는다.

| 단계 | 파일 | 하는 일 |
| --- | --- | --- |
| 학습 | `joint.py` | B-32 사진·문장 인코더와 분류기를 함께 학습(분류 CE + 선생 KD + 대조 손실 + 문장 유사도 KD) |
| 8비트 학습 | `qjoint.py` | 8비트 흉내 학습(QAT) 뒤 분류·검색을 다시 잰다 |
| 작은 CNN | `cnn_emb.py`, `prep_distill.py` | CNN이 B-32 사진 벡터를 따라 하게 학습(참고 실험) |
| 문장 모델 줄이기 | `build_vocab.py`, `slim.py`, `export_text.py`, `quant_text.py`, `text_int32.py` | 단어표 줄이기, ONNX 내보내기, 4비트, 입력을 int32로 |
| 평가 | `eval_search.py`, `phone_eval.py`, `dump_eval.py`, `dump_calib.py`, `collect_all.py` | 폰과 같은 조건(int8 + JS 토크나이저)으로 분류·검색 |
| 묶기 기준값 | `calibrate_group.py` | 비슷한 사진 묶기 유사도 기준을 다시 맞춤(노트북 CPU로 돈다) |
| 토크나이저 | `siglipTokenizer.mjs`, `tok_dump_any.mjs` | 앱과 같은 JS 토크나이저로 문장을 id로 |
| 대기열 | `runq.sh`, `cqy.sh` | 공용 GPU용 실행기. 다른 팀이 그 GPU를 쓰면 스스로 내려간다 |
