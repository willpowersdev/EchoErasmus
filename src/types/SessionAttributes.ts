/**
 * Short-lived conversation state, stored in Alexa session attributes.
 *
 * Session attributes live only for the duration of a single Alexa session, so
 * this context disappears when the user says "stop" or the session times out.
 * That is acceptable for version 1; see the DynamoDB notes in the README for
 * how persistent memory would be layered on later.
 */
export interface SessionAttributes {
    /** The `id` of the last OpenAI response, used to chain follow-up turns. */
    previousOpenAIResponseId?: string;
}
