package com.eodilog.job;
public enum JobStatus {
    QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED;
    public boolean terminalFailure() { return this == FAILED || this == CANCELLED; }
}
