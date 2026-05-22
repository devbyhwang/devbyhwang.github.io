# PDF.js vendor bundle

Source: `pdfjs-dist@5.7.284` from npm.

Vendored files:
- `legacy/build/pdf.min.mjs` -> `pdf.min.js`
- `legacy/build/pdf.worker.min.mjs` -> `pdf.worker.min.js`

The package tarball was fetched with npm, which verifies the registry integrity:
`sha512-h4EdYQczmGhbOlqc3PPZwxevn7ApdWPbovAuWXOB/DjIyigSnwfy2oze7c6mRcSr9XgLp3eN3EeL4DyySTPMFw==`

Vendored file SHA-384 checksums:
- `pdf.min.js`: `599d7d79228b7799efb85ea049fe7e7562c2d4e33ba260e0c68d2010d5a48263abe37b0bca57bf2c9a7e4ca1e30c0298`
- `pdf.worker.min.js`: `5d0a4ce1fb7da2a833b3324311e8e19dbfe59bcfecc68da84c3ca40fc0c71176a1ce149d0d484d61fae727fe2774ea5b`

These files are served from the same origin as the OCR demo so PDF.js no longer relies on an SRI-less runtime CDN dynamic import.
