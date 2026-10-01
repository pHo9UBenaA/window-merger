# Window Merger privacy policy

## Local processing

Window Merger uses Chrome's extension APIs to merge browser windows when you click its toolbar icon,
use its keyboard shortcut, or select its context-menu entry. Processing takes place on your device.

The extension uses window, tab and tab-group identifiers; window type, focus and incognito state;
and tab active, pinned and muted state. It uses the incognito-access setting to enable or disable
its incognito menu. This information is used only to select eligible windows, move tabs and groups,
and preserve tab state. Normal and incognito windows are processed separately.

The extension does not use page contents, browsing history, cookies or credentials. It does not
make network requests to transmit browser data, provide analytics, display ads or track users.
It does not sell or share browser data with the developer or third parties.

## Retention and diagnostics

The extension does not keep its own persistent copy of window or tab data. Merge snapshots are
held in memory for the operation. Changes to tabs, groups and windows are maintained by Chrome,
not in an extension database. Uninstalling the extension stops its processing but does not undo
those changes to your browser.

Chrome API failures may appear in the local service-worker console. The extension does not send
these diagnostics to a logging service.

## Permissions

- `contextMenus` provides the normal and incognito merge menu entries.
- `tabGroups` moves tab groups while keeping their group identity.

The extension does not request host permissions or the `tabs` permission.

## Limited use and support

Browser data is used only for the extension's window-merging purpose, consistent with the
[Chrome Web Store User Data Policy, including Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
There is no developer or third-party access to the browser data processed by the extension.

If you contact support, the developer receives the message and information you choose to submit
through your email provider or GitHub. This is separate from the extension's local processing.
Do not include private URLs, page contents or a browser profile in a support request.

Questions: [pho9ubenaa@gmail.com](mailto:pho9ubenaa@gmail.com) or the
[issue tracker](https://github.com/pHo9UBenaA/window-merger/issues).
