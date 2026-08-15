import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import { Speech } from "../utils/Speech.ts";

/**
 * Describes only what this implementation actually does: Alexa transcribes the
 * request, the Lambda forwards the text to OpenAI, and the answer comes back.
 * No claim is made about retention by Alexa or OpenAI.
 */
export const PrivacyIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === "PrivacyIntent"
        );
    },

    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(Speech.privacy)
            .reprompt(Speech.followUpReprompt)
            .getResponse();
    },
};
