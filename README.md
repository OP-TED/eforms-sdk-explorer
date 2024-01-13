# eForms SDK Explorer

The eForms SDK Explorer is a single-page web application designed to allow business users and developers alike, to easily explore and compare the information contained in any two versions of the eForms SDK that are available on GitHub.

> <sub>**_Copyright 2023 European Union_**<br/>
*Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent versions of the EUPL (the "Licence"); You may not use this work except in compliance with the Licence. You may obtain a copy of the Licence at: https://joinup.ec.europa.eu/software/page/eupl*<br/>
*Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Licence for the specific language governing permissions and limitations under the Licence.*<br/></sub>


## Overview


The purpose of the application is to help any user identify the changes that occurred between any two SDK versions, to assist them while they assess the effort required to upgrade their applications to a newer version of the eForms SDK.

The main goal of the application is to make the comparison of SDK versions more intuitive and more practical than the comparison of JSON and XML files.

## Using the SDK Explorer

The SDK Explorer is integrated in the TED Developer Documentation Portal.

You can access it here: **https://docs.ted.europa.eu/eforms-sdk-explorer/**

> [!NOTE]
> _Initially our intention was to keep the application "as simple as possible" so that it can be downloaded and executed locally in your browser. However, we quickly deviated from our initial intention and decided to integrate the application in the [TED Developer Documentation Portal](https://docs.ted.europa.eu/eforms-sdk-explorer/) instead. This makes accessing the SDK Explorer more convenient for everyone, and allows us to implement it without being restricted by code safety limitations imposed when browsers execute scripts locally on your computer._


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

## Acknowledgements

This project uses the following open-source libraries:

- [JsDiff](https://github.com/kpdecker/jsdiff): A JavaScript text differencing implementation.  
  Licensed under the [BSD License](https://github.com/kpdecker/jsdiff/blob/main/LICENSE).
- [Diff2Html](https://github.com/rtfpessoa/diff2html): Pretty diff to HTML javascript library (diff2html).  
  Licensed under the [MIT License](https://github.com/rtfpessoa/diff2html/blob/main/LICENSE).
- [Bootstrap](https://getbootstrap.com/): The most popular HTML, CSS, and JS library in the world.  
  Licensed under the [MIT License](https://github.com/twbs/bootstrap/blob/main/LICENSE).
- [jQuery](https://jquery.com/): A fast, small, and feature-rich JavaScript library.  
  Licensed under the [MIT License](https://github.com/jquery/jquery/blob/main/LICENSE.txt).
- [jsTree](https://www.jstree.com/): jquery plugin, that provides interactive trees.  
  Licensed under the [MIT License](https://github.com/vakata/jstree/blob/master/LICENSE-MIT).

Please see the respective links for license details.