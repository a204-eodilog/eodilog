"""사진 모델 CPU 스레드 수 (spec AS-21)."""

from app.features.photo_classification.embedder import MAX_TORCH_THREADS, limit_torch_threads


class FakeTorch:
    def __init__(self):
        self.threads = None

    def set_num_threads(self, count):
        self.threads = count


def test_threads_are_capped_on_a_big_machine():
    torch = FakeTorch()

    limit_torch_threads(torch, cpu_count=22)

    assert torch.threads == MAX_TORCH_THREADS == 4


def test_small_machine_uses_all_its_cores():
    torch = FakeTorch()

    limit_torch_threads(torch, cpu_count=2)

    assert torch.threads == 2


def test_unknown_core_count_uses_the_cap():
    torch = FakeTorch()

    limit_torch_threads(torch, cpu_count=None)

    assert torch.threads == MAX_TORCH_THREADS
