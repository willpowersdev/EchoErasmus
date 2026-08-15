import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import { Speech } from "../utils/Speech.ts";

export const HelpIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === "AMAZON.HelpIntent"
        );
    },

    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak(Speech.help)
            .reprompt(Speech.welcomeReprompt)
            .getResponse();
    },
};
