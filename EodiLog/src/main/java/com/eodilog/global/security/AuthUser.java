package com.eodilog.global.security;

import java.util.UUID;

// Verified principal, without token material or personal information.
public record AuthUser(UUID userId) {
}
