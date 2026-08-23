"""Shared helpers for media FileField URLs."""


def absolute_file_url(request, field_file):
    """
    Return a browser-usable URL for a Django FileField, or None.

    Always prefer an absolute URL when a request is available so SPA origins
    (e.g. Vite :5173) do not resolve root-relative /media/ paths against the
    wrong host.
    """
    if not field_file:
        return None
    name = getattr(field_file, "name", None)
    if not name:
        return None
    try:
        url = field_file.url
    except ValueError:
        return None
    if not url:
        return None
    if request is not None:
        return request.build_absolute_uri(url)
    return url
