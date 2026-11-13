package com.eodilog.expense.voice;
/** 확장자가 아니라 실제 컨테이너·코덱·시간을 확인한다. */
public interface AudioProbe { void validate(byte[] audio); }
