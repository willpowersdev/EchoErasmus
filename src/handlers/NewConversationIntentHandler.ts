import * as Alexa from "ask-sdk-core";
import type { RequestHandler } from "ask-sdk-core";
import type { SessionAttributes } from "../types/SessionAttributes.ts";
import { logger } from "../utils/Logging.ts";
import { Speech } from "../utils/Speech.ts";

/**
 * "Start a new conversation" — drops the OpenAI response chain so the next
 * question is answered with no prior context. Clears conversational state only.
 */
export const NewConversationIntentHandler: RequestHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) === "NewConversationIntent"
        );
    },

    handle(handlerInput) {
        const attributes =
            handlerInput.attributesManager.getSessionAttributes() as SessionAttributes;

        delete attributes.previousOpenAIResponseId;
        handlerInput.attributesManager.setSessionAttributes(attributes);

        logger.info("ConversationReset");

        return handlerInput.responseBuilder
            .speak(Speech.newConversation)
            .reprompt(Speech.welcomeReprompt)
            .getResponse();
    },
};
