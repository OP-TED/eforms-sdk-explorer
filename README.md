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

You can select the version to explore as well as the base version to compare it with, by using the drop-down selectors on the top right of the SDK Explorer screen.

The drop-down version selectors only show released versions as well as any pre-releases of unreleased versions.

You can also specify the versions to compare in the query string:

`http://docs.ted.europa.eu/eforms-sdk-explorer?version=1.8.0&base=1.5.3`


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

## Acknowledgements

This project uses the following open-source libraries:

- [Bootstrap](https://getbootstrap.com/): The most popular HTML, CSS, and JS library in the world. 
  Licensed under the [MIT License](https://github.com/twbs/bootstrap/blob/main/LICENSE).
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

Please see the respective links for license details.
