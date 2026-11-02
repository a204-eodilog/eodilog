class ProviderUnavailable(Exception):
    """외부 공급자 장애. 기능이 처리하지 않으면 503 PROVIDER_UNAVAILABLE이 된다 (spec §1)."""
