export class CustomError extends Error {

    /** @type {string} A plain-text detail of the error, shown under its message (for example why a request failed); empty if there is none. */
    detail;

    /**
     * @param {string} message The plain-text message.
     * @param {*} error The error this one wraps, if any: an AjaxError keeps its own message and detail; the message
     *        (and detail) of another CustomError, or a string, becomes the detail; any other error is not shown.
     */
    constructor(message, error) {
        super(error instanceof AjaxError ? error.message : message);
        this.name = this.constructor.name;
        this.detail = error instanceof AjaxError ? error.detail : CustomError.describe(error);
    }

    /**
     * @param {*} error A wrapped error.
     * @returns {string} The plain text that describes it: the message of a CustomError followed by its detail, a
     *          string as it is, and nothing for any other error.
     */
    static describe(error) {
        if (error instanceof CustomError) {
            return error.detail ? `${error.message}: ${error.detail}` : error.message;
        }
        return typeof error === 'string' ? error : '';
    }
}

/**
 * Used to represent an error that occurred during a jQuery $.ajax request.
 * jQuery's $.ajax method does not always throw error objects that are instances of Error. 
 * Instead, it can throw a variety of objects including a jqXHR object, a string containing 
 * the textual portion of the HTTP status, or an exception object.
 * The purpose of this class is to handle these different types of errors and wrap them into a consistent interface.
 */
export class AjaxError extends CustomError {
    constructor(message, error) {
        super(message, error);
        if (error && error.statusText !== 'abort') {
            // The detail is plain text, whatever the failed request answered (its body can be any HTML page).
            this.message = message;
            this.detail = error instanceof CustomError ? CustomError.describe(error) : error?.message ?? error?.responseText ?? (typeof error === 'string' ? error : '');
        }

        // The statusText property is only available on jqXHR objects.
        // When set to "abort", it indicates that the request was aborted.
        // We use this property to determine if the request was aborted and therefore
        // we should not display an error message to the user.
        this.statusText = error?.statusText;
    }
}
