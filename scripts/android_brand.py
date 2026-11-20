"""Install locale-aware Android launcher branding without changing package identity."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET

NS = '{http://schemas.android.com/apk/res/android}'
ET.register_namespace('android', NS[1:-1])
EN = 'Locally Uncensored'
PL = 'Lokalnie Bez Cenzury'
KEYS = ('app_name', 'main_activity_title', 'auri_activity_title')
LIMIT = 1024 * 1024


def safe_path(root, path):
    current = root
    for part in path.relative_to(root).parts:
        current /= part
        if current.is_symlink():
            raise ValueError('Symlink in Android project')
    if path.exists() and (not path.is_file() or path.stat().st_size > LIMIT):
        raise ValueError('Unsafe Android XML file')


def read_xml(path, tag, optional=False):
    if optional and not path.exists():
        return ET.Element(tag)
    data = path.read_bytes()
    # Only UTF-8 is accepted; reject alternate encodings and DTDs before parse.
    text = data.decode('utf-8-sig')
    if '\x00' in text or '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        raise ValueError('Invalid XML declarations')
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
    try:
        node = ET.fromstring(text, parser=parser)
    except ET.ParseError as e:
        raise ValueError('Invalid Android XML') from e
    if node.tag != tag:
        raise ValueError('Unexpected XML root')
    return node


def update_strings(node, label):
    seen = {}
    for child in node:
        key = child.get('name')
        if child.tag in ('string', 'item') and key in KEYS:
            if key in seen or child.tag != 'string' or len(child):
                raise ValueError('Ambiguous branding resource')
            seen[key] = child
    for key in KEYS:
        child = seen.get(key)
        if child is None:
            child = ET.SubElement(node, 'string', {'name': key})
        if child.get('translatable') == 'false':
            del child.attrib['translatable']
        child.text = label
    return node


def update_manifest(node):
    apps = node.findall('application')
    if len(apps) != 1:
        raise ValueError('Expected exactly one application')
    app = apps[0]
    launchers = []
    for activity in list(app.findall('activity')) + list(app.findall('activity-alias')):
        for intent in activity.findall('intent-filter'):
            actions = {a.get(NS+'name') for a in intent.findall('action')}
            categories = {a.get(NS+'name') for a in intent.findall('category')}
            if 'android.intent.action.MAIN' in actions and 'android.intent.category.LAUNCHER' in categories:
                launchers.append(activity)
                break
    if len(launchers) != 1:
        raise ValueError('Expected exactly one launcher')
    app.set(NS+'label', '@string/app_name')
    launchers[0].set(NS+'label', '@string/app_name')
    return node


def xml_bytes(node):
    return ET.tostring(node, encoding='utf-8', xml_declaration=True) + b'\n'


def install_brand(workspace):
    root = Path(workspace).absolute()
    if not root.is_dir() or root.is_symlink() or root.resolve() != root:
        raise ValueError('Unsafe workspace')
    main = root/'src-tauri/gen/android/app/src/main'
    base, local, manifest = main/'res/values/strings.xml', main/'res/values-pl/strings.xml', main/'AndroidManifest.xml'
    for path in (base, local, manifest):
        safe_path(root, path)
    desired = {
        base: xml_bytes(update_strings(read_xml(base, 'resources'), EN)),
        local: xml_bytes(update_strings(read_xml(local, 'resources', True), PL)),
        manifest: xml_bytes(update_manifest(read_xml(manifest, 'manifest'))),
    }
    local.parent.mkdir(exist_ok=True)
    staged = {}
    try:
        for path, data in desired.items():
            if path.is_file() and path.read_bytes() == data:
                continue
            fd, tmp = tempfile.mkstemp(prefix='.omega-brand-', dir=path.parent)
            staged[path] = Path(tmp)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
        for path, tmp in staged.items():
            os.replace(tmp, path)
    finally:
        for tmp in staged.values():
            tmp.unlink(missing_ok=True)
    for path, data in desired.items():
        if path.read_bytes() != data:
            raise ValueError('Branding verification failed')
    return {str(path.relative_to(root)): hashlib.sha256(data).hexdigest() for path, data in desired.items()}


def validate_labels(output):
    """Validate aapt2 dump badging output, including compiled PL resources."""
    if not isinstance(output, str) or len(output) > LIMIT:
        raise ValueError('Invalid APK badging output')
    expected = {'application-label:': EN, 'application-label-pl:': PL}
    for key, value in expected.items():
        rows = [line[len(key):] for line in output.splitlines() if line.startswith(key)]
        if rows not in ([value], ["'"+value+"'"]):
            raise ValueError('Missing or unexpected APK label: '+key)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workspace')
    args = parser.parse_args()
    try:
        print(json.dumps(install_brand(args.workspace), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as e:
        parser.exit(1, str(e)+'\n')


if __name__ == '__main__':
    main()
