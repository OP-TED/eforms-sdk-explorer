# SDK Explorer 0.2.0 - Release Notes (unreleased)

## In this release

This release adds support for eForms SDK 2: you can compare SDK 1.x versions with SDK 2 versions, as well as SDK 2 versions with each other.

- **Version selection**: all SDK versions are listed, in the right order (alpha, beta and release candidates before their release). The `develop` and `efx-2` branches can be selected as the version to explore. A version that has no previous minor version, such as `2.0.0-alpha.4`, is compared by default with the release that precedes it.
- **Validation tab**: shown when one of the selected versions has EFX validation rules (a `validation/` folder, as in every SDK 2 version), in place of the Schematrons tab. It compares the EFX rules files or, with its source selector, the Schematron files, which SDK 2 generates from the rules.
- **Fields tab**: a metadata source selector shows the forward-compatible metadata of SDK 2 (`fields/fwd/`: nodes and fields, business entities with their properties, and data types) instead of `fields.json`.
- **View Templates tab**: view templates that a version has without listing them in `view-templates.json`, such as `summary.efx`, are compared too.
- **Fewer requests to GitHub**: the SDK Explorer no longer uses the GitHub API when it starts, and lists a folder with a single request per version, which your browser then remembers. Users who share a network, such as an office, no longer run out of the 60 GitHub requests per hour allowed without signing in.
- A file that does not have the expected content is now reported with an error message naming the file, instead of being shown as empty.
- **Bootstrap upgraded to 5.3** (from 4.6, which is no longer supported). Its stylesheet is now served by the SDK Explorer itself, so that the many cards of the Codelists tab stay quick to display.
- **Choosing versions**: the base and target versions are chosen with the version chips at the top of every tab, each with a menu of branches, pre-releases and releases. On the Home tab, **Compare** opens the comparison of the selected versions, and **Choose versions…** chooses both versions at once.
- **A failed download of the list of SDK versions** is reported, with a hint to reload the page: the versions asked for are kept for that reload, and no empty comparison is shown.
- **New look**: a refreshed visual design, with the page as the only scroll.


# SDK Explorer 0.1.0 - Release Notes

The eForms SDK Explorer is a single-page web application designed to allow business users and developers alike, to easily explore and compare the information contained in any two versions of the eForms SDK available on GitHub.


## In this release

This is the first pre-release version of the SDK Explorer.

It allows you to compare any two versions of the eForms SDK section by section: fields, notice-types, codelists, schemas, schematrons, translations and view-templates.

For a quick introduction, you can take the quick tour available in the start page of the application.

You can access the at  [https://docs.ted.europa.eu/**eforms-sdk-explorer**/](https://docs.ted.europa.eu/eforms-sdk-explorer/)


