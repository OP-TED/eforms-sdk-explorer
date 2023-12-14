export class BootstrapWebComponent extends HTMLElement {

    constructor(templateName) {
        super();
        this.attachShadow({ mode: 'open' });
        this.templateName = templateName;
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const template = document.getElementById(this.templateName);
        const node = document.importNode(template.content, true);
        this.shadowRoot.innerHTML = ''; // Clear the shadow root

        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', 'https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css');
        this.shadowRoot.appendChild(link);

        this.shadowRoot.appendChild(node);
    }
}
