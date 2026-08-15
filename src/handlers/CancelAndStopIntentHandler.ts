import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import { Speech } from "../utils/Speech.ts";

export const CancelAndStopIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        if (Alexa.getRequestType(handlerInput.requestEnvelope) !== "IntentRequest") {
            return false;
        }
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        return intentName === "AMAZON.CancelIntent" || intentName === "AMAZON.StopIntent";
    },

    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(Speech.goodbye)
            .withShouldEndSession(true)
            .getResponse();
    },
};
