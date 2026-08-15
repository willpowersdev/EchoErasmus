import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import type { SessionEndedRequest } from "ask-sdk-model";
import { logger } from "../utils/Logging.ts";

/**
 * Alexa has already closed the session by the time this arrives, so the only
 * job is to record why — `ERROR` reasons here are the main signal that a
 * response was malformed or the Lambda returned too slowly.
 */
export const SessionEndedRequestHandler: RequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === "SessionEndedRequest";
    },

    handle(handlerInput) {
        const request = handlerInput.requestEnvelope.request as SessionEndedRequest;

        logger.info("SessionEnded", {
            reason: request.reason,
            errorType: request.error?.type,
            errorMessage: request.error?.message,
        });

        return handlerInput.responseBuilder.getResponse();
    },
};
