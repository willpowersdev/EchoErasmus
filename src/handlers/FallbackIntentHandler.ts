import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import { logger } from "../utils/Logging.ts";
import { Speech } from "../utils/Speech.ts";

/**
 * Alexa routes here when nothing in the interaction model matched. There is no
 * slot value to work with, so the only useful move is to reprompt rather than
 * leave the user in silence.
 */
export const FallbackIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.FallbackIntent"
        );
    },

    handle(handlerInput) {
        logger.warn("FallbackIntent");

        return handlerInput.responseBuilder
            .speak(Speech.missingQuestion)
            .reprompt(Speech.welcomeReprompt)
            .getResponse();
    },
};
