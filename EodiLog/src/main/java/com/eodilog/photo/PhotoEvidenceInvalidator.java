package com.eodilog.photo;

import java.util.Collection;
import java.util.UUID;

/**
 * Called in the same transaction when photos stop being valid evidence for derived suggestions. Implemented by visit
 * candidates, which invalidate pending ones; keeps photo free of a visit dependency.
 */
public interface PhotoEvidenceInvalidator {
    /** The photos were moved to another trip or approved for deletion. */
    void photosChanged(Collection<UUID> photoIds);
    /** The uploader linked the photo to a place: suggestions placing it elsewhere contradict the uploader. */
    void placeLinked(UUID photoId, UUID placeId);
}
