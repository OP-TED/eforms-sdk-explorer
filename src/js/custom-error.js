export class CustomError extends Error {
    constructor(message, error) {
        if (error instanceof AjaxError) {
            super(error.message);
        } else if (error instanceof CustomError) {
            super(`${message}${this.formatDetail(error.message ?? '')}`);
        } else if (typeof error === 'string') {
            super(`${message}${this.formatDetail(error)}`);
        } else {
            super(message);
        }
        this.name = this.constructor.name;
    }

    formatDetail(detail) {
        return `<span class="detail">${detail}</span>`;
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
            const errorDetail = error?.message ?? error?.responseText ?? error ?? '';            
            this.message = `${message}${this.formatDetail(errorDetail)}`;
        }

        // The statusText property is only available on jqXHR objects.
        // When set to "abort", it indicates that the request was aborted.
        // We use this property to determine if the request was aborted and therefore
        // we should not display an error message to the user.
        this.statusText = error?.statusText;
    }
}