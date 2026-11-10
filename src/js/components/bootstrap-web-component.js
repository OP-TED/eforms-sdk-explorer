/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */
import { appConfig } from "../config.js";

export class BootstrapWebComponent extends HTMLElement {

    constructor(templateName) {
        super();
        this.attachShadow({ mode: 'open' });
        this.templateName = templateName;
    }

    connectedCallback() {
        this.render();
    }

    /**
     * @returns {string[]} The URLs of the stylesheets to load into the shadow root: Bootstrap, then the TED icons and
     *          theme. The TED tokens are not among them: their custom properties reach the shadow root by
     *          inheritance, and their @font-face must be declared in the document.
     */
    requiredCss() {
        return [appConfig.stylesheets.bootstrap, appConfig.stylesheets.tedIcons, appConfig.stylesheets.tedTheme];
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
