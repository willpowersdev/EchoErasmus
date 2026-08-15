/**
 * Every user-facing phrase the skill can speak, in one place.
 *
 * Keeping them together makes the voice consistent and makes it obvious that no
 * error path ever leaks an exception message or implementation detail to the user.
 */
export const Speech = {
    welcome: "Hi. What would you like to know?",
    welcomeReprompt: "What would you like to ask?",

    followUpReprompt: "What else would you like to know?",

    missingQuestion: "I didn't catch the question. What would you like to ask?",

    help:
        "You can ask me almost any question. For example, ask why the sky is blue. " +
        "Say start a new conversation to clear the context, or say stop to exit.",

    goodbye: "Goodbye.",

    newConversation: "Okay. I've started a new conversation. What would you like to ask?",

    privacy:
        "Your spoken request is processed by Alexa and then sent as text to this skill's " +
        "Lambda function and on to OpenAI to generate an answer.",

    timeout: "That took too long to answer. Please try asking again.",

    genericError: "Sorry, I had trouble answering that. Please try again.",
} as const;
