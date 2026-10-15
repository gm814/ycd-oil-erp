"""Render trusted invoice templates from stdin, without network/file URL access."""
import sys
from weasyprint import HTML
from weasyprint.urls import URLFetcher


class LocalAssetsOnly(URLFetcher):
    def fetch(self, url, headers=None):
        if not url.startswith("data:image/"):
            raise ValueError("External resources are disabled")
        return super().fetch(url, headers)


html = sys.stdin.read(4 * 1024 * 1024)
sys.stdout.buffer.write(HTML(string=html, url_fetcher=LocalAssetsOnly()).write_pdf())
