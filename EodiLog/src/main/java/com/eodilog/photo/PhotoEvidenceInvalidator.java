package com.eodilog.photo;

import java.util.Collection;
import java.util.UUID;

/**
 * Called in the same transaction when photos stop being valid evidence for derived suggestions (moved, deleted, or their
 * place changed). Implemented by visit candidates, which invalidate pending ones; keeps photo free of a visit dependency.
 */
public interface PhotoEvidenceInvalidator {
    void photosChanged(Collection<UUID> photoIds);
}
