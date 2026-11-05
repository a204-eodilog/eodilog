import { describe, expect, it, jest } from '@jest/globals';
import { create } from 'axios';
import { apiClient } from '@/api/client';
import { devMockAdapter } from '@/api/dev-mock';
import {
  acceptFollowRequest,
  getFollowers,
  getFollowing,
  getFollowRequests,
  rejectFollowRequest,
  removeFollower,
  unfollow,
} from '@/features/friends/api';

jest.mock('@/api/client', () => {
  const axios = jest.requireActual<typeof import('axios')>('axios');
  const mock = jest.requireActual<typeof import('@/api/dev-mock')>('@/api/dev-mock');
  return { apiClient: axios.create({ adapter: mock.devMockAdapter }) };
});
describe('S43 팔로우 API 계약', () => {
  it('받은 요청 수락은 팔로워만 추가하고 반대 방향은 만들지 않는다', async () => {
    const following = await getFollowing();
    const before = await getFollowers();
    const requests = await getFollowRequests();
    const accepted = await acceptFollowRequest(requests[0].id);
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.acceptedAt).not.toBeNull();
    expect((await getFollowers()).map((f) => f.id)).toContain(accepted.id);
    expect(await getFollowers()).toHaveLength(before.length + 1);
    expect(await getFollowing()).toEqual(following);
    expect((await getFollowRequests()).map((f) => f.id)).not.toContain(accepted.id);
  });
  it('받은 요청 거절은 다른 팔로우 관계를 유지한다', async () => {
    const requests = await getFollowRequests();
    const following = await getFollowing();
    const followers = await getFollowers();
    await rejectFollowRequest(requests[0].id);
    expect(await getFollowRequests()).toHaveLength(0);
    expect(await getFollowing()).toEqual(following);
    expect(await getFollowers()).toEqual(followers);
  });
  it('팔로우 해제와 팔로워 삭제는 각각 해당 방향만 지운다', async () => {
    const following = await getFollowing();
    const personId = following[0].followee.id;
    await unfollow(personId);
    expect((await getFollowing()).some((f) => f.followee.id === personId)).toBe(false);
    expect((await getFollowers()).some((f) => f.follower.id === personId)).toBe(true);
    await removeFollower(personId);
    expect((await getFollowers()).some((f) => f.follower.id === personId)).toBe(false);
    expect(await getFollowing()).toHaveLength(following.length - 1);
  });
  it('모의 서버도 페이지 크기와 커서를 적용한다', async () => {
    const client = create({ adapter: devMockAdapter });
    const { data } = await client.get('/me/followers', { params: { limit: 1 } });
    expect(data.data.length).toBeLessThanOrEqual(1);
    await expect(
      client.get('/me/followers', { params: { cursor: 'missing' } }),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
  it('두 번째 페이지까지 조회하고 취소 신호를 전달한다', async () => {
    const signal = new AbortController().signal;
    const get = jest.spyOn(apiClient, 'get');
    get.mockResolvedValueOnce({
      data: { data: [{ id: 'first' }], page: { hasNext: true, nextCursor: 'next' } },
    });
    get.mockResolvedValueOnce({
      data: { data: [{ id: 'second' }], page: { hasNext: false, nextCursor: null } },
    });
    try {
      expect(await getFollowing(signal)).toEqual([{ id: 'first' }, { id: 'second' }]);
      expect(get).toHaveBeenLastCalledWith('/me/following', {
        signal,
        params: { limit: 100, cursor: 'next' },
      });
    } finally {
      get.mockRestore();
    }
  });
  it('서버 실패를 예시 데이터로 바꾸지 않는다', async () => {
    const get = jest.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('서버 없음'));
    try {
      await expect(getFollowers()).rejects.toThrow('서버 없음');
    } finally {
      get.mockRestore();
    }
  });
  it('반복 커서 응답은 오류로 끝내고 무한 요청하지 않는다', async () => {
    const get = jest
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ data: { data: [], page: { hasNext: true, nextCursor: 'repeat' } } });
    try {
      await expect(getFollowRequests()).rejects.toThrow('다음 페이지');
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      get.mockRestore();
    }
  });
});
