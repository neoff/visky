#!/usr/bin/env python3
"""Put a <product> element into a synthesised productbuild distribution.

`productbuild --synthesize` writes everything the installer needs and nothing
the STORE needs: altool reads product-metadata.product-identifier and
product-metadata.product-version from a top-level <product> element, and there
is no productbuild flag that emits one. Without it the upload fails twice with

    Invalid product archive metadata. Error in keyPath
    [product-metadata.product-version]                        (90230)
    [product-metadata.product-identifier]                     (90230)

which reads like a stale-Xcode problem and is not one.

Usage: inject-product.py <distribution.xml> <bundle-id> <version>
Idempotent — a distribution that already carries the element is left alone.
"""
import sys
import pathlib
import xml.etree.ElementTree as ET


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    path, bundle_id, version = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    text = path.read_text()

    # Parsed rather than pattern-matched: productbuild's output is real XML, and
    # a regex over it would be the kind of thing that works until the day the
    # element wraps differently.
    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        print(f"inject-product: {path} is not parseable XML: {error}", file=sys.stderr)
        return 1

    if root.tag != "installer-gui-script":
        print(f"inject-product: expected installer-gui-script, got {root.tag}", file=sys.stderr)
        return 1

    if root.find("product") is not None:
        return 0

    # Textual insert, not ET.write: rewriting the tree would reformat every
    # other line and lose the doctype, turning a one-line change into a diff
    # nobody can read.
    anchor = text.index(">", text.index("<installer-gui-script")) + 1
    element = f'\n    <product id="{bundle_id}" version="{version}"/>'
    path.write_text(text[:anchor] + element + text[anchor:])
    return 0


if __name__ == "__main__":
    sys.exit(main())
