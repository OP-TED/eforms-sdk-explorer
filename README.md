# eForms SDK Explorer

The eForms SDK Explorer is a single-page web application designed to allow business users and developers alike, to easily explore and compare the information contained in any two versions of the eForms SDK that are available on GitHub.

> <sub>**_Copyright 2023 European Union_**<br/>
*Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the "Licence"); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: https://joinup.ec.europa.eu/software/page/eupl*<br/>
*Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.*<br/></sub>


## Overview

The purpose of the application is to help any user identify the changes that occurred between any two SDK versions, to assist them while they assess the effort required to upgrade their applications to a newer version of the eForms SDK.

The main goal of the application is to make the comparison of SDK versions more intuitive and more practical than the comparison of JSON and XML files.


## Using the SDK Explorer

The SDK Explorer is integrated in the TED Developer Documentation Portal. You can access at [https://docs.ted.europa.eu/eforms-sdk-explorer/](https://docs.ted.europa.eu/eforms-sdk-explorer/)

<div align="center">
  <a href="https://docs.ted.europa.eu/eforms-sdk-explorer/" target="_blank">
    <img src="https://img.shields.io/badge/-Access%20SDK%20Explorer-blue?style=for-the-badge" alt="Access SDK Explorer">
  </a>
</div>

> [!NOTE]
> _Initially our intention was to keep the application "as simple as possible" so that it can be downloaded and executed locally in your browser without the need for a web server. However, we quickly deviated from this initial intention and decided to integrate the application in the [TED Developer Documentation Portal](https://docs.ted.europa.eu/eforms-sdk-explorer/) instead. This makes accessing the SDK Explorer more convenient for everyone, and allows us to implement it without being restricted by code safety limitations imposed when browsers execute scripts locally on your computer._

### Comparing SDK versions

You choose the two versions to compare with the version chips at the top of every tab: **base**, the version you are migrating from, and **target**, the version you are migrating to. Each chip opens a menu in sections: Branches (target only), Pre-releases and Releases. On the Home tab, **Compare** *base* › *target* opens the comparison of the selected versions in the Fields tab, and **Choose versions…** lets you choose both versions at once, in a dialog.

The menus only show released versions as well as any pre-releases of unreleased versions.

The target version can also be one of the branches of the SDK that are under development (`develop` and `efx-2`), listed under Branches in its menu. This allows you to see what has changed in the SDK since a released version. Branches are not offered as base versions.

You can also specify the versions to compare in the query string:

`http://docs.ted.europa.eu/eforms-sdk-explorer?version=1.8.0&base=1.5.3`

The version to explore can be a branch here too, for example `?version=efx-2`. When no base version is given, the SDK Explorer compares the version with the latest patch of the previous minor version, or, if there is none (as for the first versions of SDK 2), with the release that precedes it.

### SDK 2 support

The SDK Explorer can compare SDK 1.x versions with SDK 2 versions, as well as SDK 2 versions with each other. What it shows depends only on what the two selected versions contain:

- When at least one of the selected versions has a `validation/` folder (as every SDK 2 version does), a **Validation** tab is shown in place of the Schematrons tab. A source selector in the tab shows either the **EFX rules** (the files of the `validation/` folder) or the **Schematron** files, presented as in the Schematrons tab. When neither version has a `validation/` folder, the Schematrons tab is shown as before.
- In the **Fields** tab, a metadata source selector shows either `fields.json`, as before, or the forward-compatible metadata of the `fields/fwd/` folder: nodes and fields, business entities with their properties, and data types. A version without a `fields/fwd/` folder is named in a notice, and its side of the comparison is treated as empty.


## Contributing to the SDK Explorer

If you are interested in this application, we welcome your contributions:

- You can suggest features and improvements in [GitHub Issues](https://github.com/OP-TED/eforms-sdk-explorer/issues).
- You can clone or fork the repository and implement any features or improvements that you would like to add to the SDK Explorer. Please submit your code for merging into the `develop` branch with a GitHub Pull Request. 

> [!IMPORTANT] 
> _When creating a new feature, or improvement, it is always preferable to first create a GitHub Issue that describes the idea you intend to work on, so that we all have a chance to discuss it and see how it fits in the bigger picture of the application._
>  
> _Likewise, for bug fixes, make sure there is a GitHub Issue recoded and labeled as `bug`._
> 
> _In your commit messages and pull requests, [reference the issue number](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/autolinked-references-and-urls#issues-and-pull-requests). For example `Fixes #7: rest of your commit message here`._

### Local Setup for Development

If you wish to contribute improvements or fixes to the SDK Explorer, you can start by cloning or forking the repository.

The SDK Explorer is a single-page JavaScript application that runs directly in your browser, eliminating the need for Node.js. However, it's important to note that the SDK Explorer utilizes JavaScript modules. As a result, a local web server is required to run it on your local machine.

Follow these steps to set up and run the SDK Explorer locally:

1. Clone or fork the SDK Explorer repository to your local machine.
2. Set up a local web server. If you're using Visual Studio Code, you can use the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer). Alternatively, if you have Node.js installed, you can use a lightweight server like [http-server](https://www.npmjs.com/package/http-server).
3. Navigate to the project directory and start your local web server. If you're using Live Server, you can do this by right-clicking on your `index.html` file and selecting "Open with Live Server".
4. Open your web browser and navigate to the local address specified by your server (usually `localhost` followed by a port number).
5. You should now be able to view and interact with the SDK Explorer in your browser.

> [!NOTE]
> While this project is not a Node.js application, we've included a `package.json` file to clearly list and manage the JavaScript dependencies. This helps ensure consistency and reproducibility across different environments. However, the application does not rely on Node.js for execution.

### Development

The repository includes a smoke test that serves the SDK Explorer locally, opens it in a headless Chromium browser and checks it against the eForms SDK on GitHub: version selection with the chips and the dialog, the tab bar, the comparisons of every tab, the quick tour, and how slow and failed downloads are reported. It requires Node.js:

1. Install the development dependencies: `npm install`
2. Install the browser used by the test, once: `npx playwright install chromium`
3. Run the test: `npm run smoke`

The test needs network access and uses 4 of the 60 requests per hour that the GitHub API allows without signing in. To use a Chromium browser already installed on your machine instead, set the environment variable `SMOKE_CHROMIUM_EXECUTABLE_PATH` to its path.

## Acknowledgements

This project uses the following open-source libraries:

- [Bootstrap](https://getbootstrap.com/) 5.3: The most popular HTML, CSS, and JS library in the world. Its stylesheet is included in `src/assets/vendor/`. 
  Licensed under the [MIT License](https://github.com/twbs/bootstrap/blob/main/LICENSE).
- [Popper](https://github.com/floating-ui/floating-ui/tree/v2.x) 2: The positioning engine of popovers and dropdowns, included in Bootstrap's JavaScript bundle. 
  Licensed under the [MIT License](https://github.com/floating-ui/floating-ui/blob/v2.x/LICENSE.md).
- [jQuery](https://jquery.com/): A fast, small, and feature-rich JavaScript library. 
  Licensed under the [MIT License](https://github.com/jquery/jquery/blob/main/LICENSE.txt).
- [jsTree](https://www.jstree.com/): a jQuery plugin, that provides interactive trees. 
  Licensed under the [MIT License](https://github.com/vakata/jstree/blob/master/LICENSE-MIT).
- [JsDiff](https://github.com/kpdecker/jsdiff): A JavaScript text differencing implementation. 
  Licensed under the [BSD License](https://github.com/kpdecker/jsdiff/blob/main/LICENSE).
- [Diff2Html](https://github.com/rtfpessoa/diff2html): A pretty diff to HTML javascript library (diff2html). 
  Licensed under the [MIT License](https://github.com/rtfpessoa/diff2html/blob/main/LICENSE).
- [Lodash](https://lodash.com/): A modern JavaScript utility library delivering modularity, performance, & extras. 
  Licensed under the [MIT License](https://github.com/lodash/lodash/blob/master/LICENSE).
- [Showdown](https://github.com/showdownjs/showdown): A bidirectional Markdown to HTML to Markdown converter written in Javascript. 
  Licensed under the [MIT License](https://github.com/showdownjs/showdown/blob/master/license).

For development only, the smoke test uses [Playwright](https://playwright.dev/), licensed under the [Apache License 2.0](https://github.com/microsoft/playwright/blob/main/LICENSE), and [http-server](https://github.com/http-party/http-server), licensed under the [MIT License](https://github.com/http-party/http-server/blob/master/LICENSE).

Please see the respective links for license details.
