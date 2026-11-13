/* Copyright (c) 2021 European Union 
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the “Licence”); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: 
 * https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence. 
 */

export const appConfig = {
    rawBaseUrl: 'https://raw.githubusercontent.com/OP-TED/eForms-SDK',
    versionsUrl: 'https://data.jsdelivr.com/v1/package/gh/OP-TED/eForms-SDK',  // jsDelivr data API: the tags, without the GitHub rate limit
    treesUrl: 'https://api.github.com/repos/OP-TED/eForms-SDK/git/trees',       // GitHub git trees API: a whole folder listing in one request
    repositoryCacheMinutes: 10,  // how long the list of versions and the file tree of a branch are kept in the browser
    thresholdVersion: '1.3.2',  // versions before this one are not displayed in the dropdown
    branches: ['develop', 'efx-2'],  // branches offered at the top of the target version dropdown
    validationFiles: ['rules.efx', 'stage-1a.efx', 'stage-4m.efx', 'stage-5m.efx', 'dependencies.json'],  // files of the validation folder (it has no index file)
    unindexedViewTemplates: ['summary.efx'],  // view templates that some versions have without listing them in view-templates.json
    stylesheets: {  // the library stylesheets the web components load into their shadow roots: the same ones index.html loads into the page
        bootstrap: './src/assets/vendor/bootstrap-5.3.8.min.css',  // served from the repository, without the @charset rule of the CDN file (see the comment at the top of the file)
        tedIcons: './src/assets/ted/icons.css',  // the TED glyph classes (their @font-face is in tokens.css, which only the page loads: its custom properties reach the shadow roots by inheritance)
        tedTheme: './src/assets/ted/ted-theme.css',
        jstreeTheme: 'https://cdnjs.cloudflare.com/ajax/libs/jstree/3.3.12/themes/default/style.min.css',
    },
};

