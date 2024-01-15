export class BootstrapWebComponent extends HTMLElement {

    constructor(templateName) {
        super();
        this.attachShadow({ mode: 'open' });
        this.templateName = templateName;
    }

    connectedCallback() {
        this.render();
    }

    requiredCss() {
        return ['https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css'];
    }

    render() {
        this.#resetShadowDom();
    }

    #resetShadowDom() {
        const template = document.getElementById(this.templateName);
        const node = document.importNode(template.content, true);
        this.shadowRoot.innerHTML = ''; // Clear the shadow root

        let stylesheets = this.requiredCss();
        stylesheets.forEach(stylesheet => {
            const link = document.createElement('link');
            link.setAttribute('rel', 'stylesheet');
            link.setAttribute('href', stylesheet);
            this.shadowRoot.appendChild(link);
        });

        this.shadowRoot.appendChild(node);
    }

    dispose() {
    }
}
