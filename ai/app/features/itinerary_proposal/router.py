from fastapi import APIRouter, Depends, Request

from app.core.schemas import Data
from app.core.security import require_internal_token
from app.features.itinerary_proposal.service import (
    ItineraryProposal,
    ItineraryProposalRequest,
    ItineraryProposer,
)

router = APIRouter(prefix="/ai/v1", dependencies=[Depends(require_internal_token)])


def get_proposer(request: Request) -> ItineraryProposer:
    return request.app.state.itinerary_proposer


@router.post("/itinerary-proposals")
async def propose_itinerary(
    body: ItineraryProposalRequest,
    proposer: ItineraryProposer = Depends(get_proposer),
) -> Data[ItineraryProposal]:
    return Data(data=await proposer.propose(body))
