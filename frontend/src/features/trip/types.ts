/** POST /trips/{tripId}/leave 결과 (docs/api-spec.md LeaveResult) */
export type LeaveResult = {
  tripId: string;
  /** 혼자 남은 사람이 나가 여행이 지워졌으면 true(202) */
  tripDeleted: boolean;
  /** 방장이 나가 방장을 넘겨받은 동행. 아니면 null */
  newOwnerMemberId: string | null;
  /** 여행 삭제 작업 ID. 일반 나가기는 null */
  cleanupJobId: string | null;
  status: 'LEFT' | 'TRIP_DELETED';
};
